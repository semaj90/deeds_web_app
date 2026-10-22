import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createCompilerSemanticResolver } from './lib/compiler-semantic-resolver-v1.mjs';
import { buildIndexedSourceSvelteLspInitializationOptionsV1, mapSymbolByteSpans } from './lib/indexed-source-lsp-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const snapshotRevision = 'sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b';
const snapshotRoot = path.join(root, '.tmp/workspace-source-snapshots', snapshotRevision.slice(7));
const probeRoot = fs.realpathSync(process.argv[2]);
const relativeProbe = path.relative(fs.realpathSync(os.tmpdir()), probeRoot);
assert.match(relativeProbe, /^atlas-full-snapshot-lsp-[a-z0-9]+$/);
const projectRoot = path.join(probeRoot, 'sveltekit-frontend');
const sourceRef = 'sveltekit-frontend/src/lib/client/ui/POIPhotoModal.svelte';
const sourceRevision = 'sha256:740a5617df8857f425ae293e7d843fd5198e89912d383ba393b941510237bcd1';
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const manifest = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.isFile()) {
      const bytes = fs.readFileSync(full);
      manifest.push({ relative: path.relative(snapshotRoot, full), bytes: bytes.length, revision: digest(bytes) });
    } else throw new Error('SNAPSHOT_CONTAINS_UNSUPPORTED_LINK');
  }
}
collect(snapshotRoot);
function verifyCopiedSources() {
  for (const file of manifest) assert.equal(digest(fs.readFileSync(path.join(probeRoot, file.relative))), file.revision, file.relative);
  return { filesCompared: manifest.length, bytesCompared: manifest.reduce((total, file) => total + file.bytes, 0), hashMismatches: 0 };
}
const before = verifyCopiedSources();
const packages = {};
for (const name of ['svelte', 'typescript', 'svelte-language-server', '@sveltejs/kit', '@sveltejs/adapter-node', '@sveltejs/vite-plugin-svelte']) {
  const packagePath = path.join(projectRoot, 'node_modules', name, 'package.json');
  packages[name] = { version: JSON.parse(fs.readFileSync(packagePath, 'utf8')).version, packageChecksum: digest(fs.readFileSync(packagePath)) };
}
const report = { schema: 'atlas.frozen-svelte-project-lsp-probe.v1', startedAt: new Date().toISOString(),
  snapshotRevision, sourceRef, sourceRevision, probeRoot, before, packages,
  canonicalAuthority: false, productionWritesPerformed: 0, status: 'PROJECT_PREPARATION_STARTED' };
const outputPath = path.join(root, '.tmp/atlas', `frozen-svelte-project-lsp-${Date.now()}.json`);
const save = () => fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
save();
try {
  const syncStarted = Date.now();
  try {
    const sync = await promisify(execFile)(process.execPath, [path.join(projectRoot, 'node_modules/@sveltejs/kit/svelte-kit.js'), 'sync'], {
      cwd: projectRoot, timeout: 120_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    });
    report.sync = { status: 'COMPLETED', elapsedMs: Date.now() - syncStarted,
      stdout: sync.stdout.slice(0, 6000), stderr: sync.stderr.slice(0, 6000) };
  } catch (error) {
    report.sync = { status: 'FAILED', elapsedMs: Date.now() - syncStarted,
      error: error.message.slice(0, 6000), stderr: error.stderr?.slice(0, 6000) };
    throw new Error('FROZEN_PROJECT_SYNC_FAILED');
  }
  const generatedConfig = path.join(projectRoot, '.svelte-kit/tsconfig.json');
  report.generatedConfigChecksum = digest(fs.readFileSync(generatedConfig));
  report.afterSync = verifyCopiedSources();
  report.status = 'PROJECT_READY_LSP_STARTED';
  save();
  const bytes = fs.readFileSync(path.join(probeRoot, sourceRef));
  assert.equal(digest(bytes), sourceRevision);
  const resolver = createCompilerSemanticResolver({ workspaceRoot: projectRoot, serverBinaryRoot: path.join(root, 'sveltekit-frontend'),
    initializationOptions: buildIndexedSourceSvelteLspInitializationOptionsV1({ enableTypeScriptPlugin: true }) });
  try {
    const started = Date.now();
    report.lsp = await resolver.documentSymbols({ sourceRef, sourceRevision,
      sourceAbsolutePath: path.join(probeRoot, sourceRef), sourceBuffer: bytes, language: 'svelte', timeoutMs: 60_000 });
    report.lspElapsedMs = Date.now() - started;
    if (report.lsp.result.status === 'OBSERVED') {
      report.symbolFacts = mapSymbolByteSpans(report.lsp.result.symbols, bytes);
      report.symbolCount = report.symbolFacts.length;
    }
  } finally { await resolver.dispose(); }
  report.status = 'LSP_RETURNED_VERIFYING_SOURCES';
  save();
  report.after = verifyCopiedSources();
  report.status = report.lsp.result.status === 'OBSERVED' ? 'PROJECT_CONFIGURED_DIAGNOSTIC_OBSERVED' : 'PROJECT_CONFIGURED_LSP_UNRESOLVED';
} catch (error) {
  report.status = 'PROJECT_QUALIFICATION_BLOCKED';
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify({ status: report.status, symbolCount: report.symbolCount,
    syncStatus: report.sync?.status, lspStatus: report.lsp?.result.status, error: report.error, reportPath: path.relative(root, outputPath) }));
}
