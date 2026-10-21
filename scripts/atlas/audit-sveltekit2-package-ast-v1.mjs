import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PACKAGE_ROOT = path.join(ROOT, 'sveltekit-frontend', 'node_modules', '@sveltejs', 'kit');
const INPUT_DIR = path.join(ROOT, '.tmp', 'atlas', 'sveltekit2-code-analysis');
const OUTPUT_DIR = path.join(ROOT, '.tmp', 'atlas', 'sveltekit2-code-analysis');
const SIDECAR_URL = process.env.MINIFORGE_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const PACKAGE_VERSION = '2.59.1';
const CONCURRENCY = 2;
const MAX_INPUT_BYTES = 200_000;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const languageFor = extension => ({ '.js': 'javascript', '.ts': 'typescript', '.svelte': 'svelte' })[extension] ?? null;
const utf8 = new TextDecoder('utf-8', { fatal: true });

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, 'manifest.json'), 'utf8'));
  const fileRows = fs.readFileSync(path.join(INPUT_DIR, 'files.jsonl'), 'utf8').split(/\r?\n/u)
    .filter(line => line.trim()).map(line => JSON.parse(line));
  const packageJson = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  if (manifest.schema !== 'atlas.sveltekit2-code-manifest.v1' || manifest.package !== '@sveltejs/kit' ||
      manifest.version !== PACKAGE_VERSION || packageJson.version !== PACKAGE_VERSION || fileRows.length !== manifest.files) {
    throw new Error('SVELTEKIT2_PACKAGE_MANIFEST_IDENTITY_MISMATCH');
  }

  const sources = fileRows.map(row => {
    if (typeof row.path !== 'string' || row.path.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error('SVELTEKIT2_PACKAGE_PATH_INVALID');
    }
    const sourcePath = path.resolve(PACKAGE_ROOT, ...row.path.split('/'));
    const relative = path.relative(PACKAGE_ROOT, sourcePath);
    const realPath = fs.realpathSync(sourcePath);
    const realRelative = path.relative(fs.realpathSync(PACKAGE_ROOT), realPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !realRelative ||
        realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('SVELTEKIT2_PACKAGE_PATH_ESCAPES_ROOT');
    const bytes = fs.readFileSync(realPath);
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw new Error(`SVELTEKIT2_PACKAGE_FILE_HASH_MISMATCH:${row.path}`);
    let sourceText;
    try { sourceText = utf8.decode(bytes); }
    catch { throw new Error(`SVELTEKIT2_PACKAGE_SOURCE_NOT_UTF8:${row.path}`); }
    if (Buffer.byteLength(sourceText, 'utf8') !== bytes.length) throw new Error(`SVELTEKIT2_PACKAGE_UTF8_ROUNDTRIP_MISMATCH:${row.path}`);
    return { row, bytes, sourceText, language: languageFor(row.ext) };
  });
  const eligible = sources.filter(source => source.language && source.bytes.length > 0 && source.bytes.length <= MAX_INPUT_BYTES);
  const excluded = sources.filter(source => !source.language || source.bytes.length === 0 || source.bytes.length > MAX_INPUT_BYTES).map(source => ({
    path: source.row.path,
    reason: !source.language ? 'UNSUPPORTED_AST_LANGUAGE' : source.bytes.length === 0 ? 'EMPTY_SOURCE' : 'SIDECAR_INPUT_LIMIT_EXCEEDED',
    bytes: source.bytes.length,
  }));

  const healthResponse = await fetch(`${SIDECAR_URL}/health`, { signal: AbortSignal.timeout(5000) });
  const health = await healthResponse.json();
  if (!healthResponse.ok || health.status !== 'ok') throw new Error('SVELTEKIT2_AST_SIDECAR_UNHEALTHY');

  const results = new Array(eligible.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < eligible.length) {
      const index = cursor++;
      const source = eligible[index];
      const packageSourceRef = `external:@sveltejs/kit@${PACKAGE_VERSION}/${source.row.path}`;
      try {
        const response = await fetch(`${SIDECAR_URL}/ast/chunk`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ source: source.sourceText, language: source.language,
            filePath: source.row.path, sourceRevision: source.row.sha256, sourceRef: packageSourceRef }),
          signal: AbortSignal.timeout(45_000),
        });
        const body = await response.json();
        const identityMatches = body.source_revision === source.row.sha256 && body.file_path === source.row.path;
        results[index] = { path: source.row.path, sourceRevision: source.row.sha256, bytes: source.row.bytes,
          language: source.language, httpStatus: response.status, identityMatches,
          syntaxStatus: body.syntax_status ?? null, engine: body.engine ?? null, engineVersion: body.engine_version ?? null,
          chunkCount: Array.isArray(body.chunks) ? body.chunks.length : null,
          edgeCount: Array.isArray(body.edges) ? body.edges.length : null,
          errorTag: body.error_tag ?? null, diagnosticsCount: Array.isArray(body.diagnostics) ? body.diagnostics.length : null };
      } catch (error) {
        results[index] = { path: source.row.path, sourceRevision: source.row.sha256, bytes: source.row.bytes,
          language: source.language, httpStatus: null, identityMatches: false, syntaxStatus: null,
          errorTag: String(error?.name ?? 'ERROR'), error: String(error?.message ?? error).slice(0, 300) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, eligible.length) }, worker));

  const counts = {
    attempted: results.length,
    httpSuccess: results.filter(row => row.httpStatus === 200).length,
    identityMatched: results.filter(row => row.identityMatches).length,
    clean: results.filter(row => row.syntaxStatus === 'CLEAN').length,
    recoveredWithErrors: results.filter(row => row.syntaxStatus === 'RECOVERED_WITH_ERRORS').length,
    transportOrParseFailures: results.filter(row => row.httpStatus === null || ![200, 422].includes(row.httpStatus)).length,
    excluded: excluded.length,
  };
  const report = {
    schema: 'atlas.sveltekit2-package-ast-diagnostic.v1',
    status: counts.attempted + excluded.length === sources.length && counts.httpSuccess === counts.attempted && counts.identityMatched === counts.attempted
      ? excluded.length ? 'AST_DIAGNOSTIC_COMPLETE_WITH_EXCLUSIONS_NOT_ADMITTED' : 'AST_DIAGNOSTIC_COMPLETE_NOT_ADMITTED'
      : 'AST_DIAGNOSTIC_PARTIAL_NOT_ADMITTED',
    package: manifest.package,
    packageVersion: PACKAGE_VERSION,
    manifestCorpusChecksum: manifest.corpusSha256,
    fileManifestCount: manifest.files,
    verifiedFileHashCount: sources.length,
    workspaceRevision: null,
    workspaceRevisionStatus: 'EXTERNAL_DEPENDENCY_NOT_WORKSPACE_BOUND',
    sidecar: { url: SIDECAR_URL, status: health.status, runtime: health.runtime?.pythonVersion ?? null,
      concurrency: CONCURRENCY, endpoint: '/ast/chunk' },
    counts,
    excluded,
    results,
    canonicalAuthority: false,
    datastoreWritesAttempted: 0,
    datastoreWritesCommitted: 0,
    vectorWritesCommitted: 0,
  };
  const outputPath = path.join(OUTPUT_DIR, 'ast-diagnostic-v1.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, reportPath: path.relative(ROOT, outputPath).replaceAll('\\', '/') }, null, 2));
  if (!report.status.startsWith('AST_DIAGNOSTIC_COMPLETE')) process.exitCode = 2;
}

main().catch(error => { console.error(String(error?.message ?? error)); process.exitCode = 1; });
