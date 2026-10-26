#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { resolveSourceReadRootV1 } from './lib/source-read-root-v1.mjs';
import { runIndexedSourceAstGrepV1 } from './lib/indexed-source-ast-grep-v1.mjs';
import { runIndexedSourceLspV1 } from './lib/indexed-source-lsp-v1.mjs';
import { runIndexedSourceNlpV1 } from './lib/indexed-source-nlp-v1.mjs';
import { analyzeIndexedSvelteTypeScriptV1 } from './lib/indexed-source-svelte-typescript-v1.mjs';
import { classifyIndexedSourceProviderResultV1, validateExactIndexedSourcePathV1 } from './lib/indexed-source-batch-v1.mjs';
import { decodeSourceUtf8V1 } from './lib/source-byte-revision-v1.mjs';

const args = process.argv.slice(2);
const sourceRefInput = args[0];
const workspaceRevision = args[1];
const sidecarUrl = args.find((arg) => arg.startsWith('--sidecar='))?.slice('--sidecar='.length) ?? 'http://127.0.0.1:8095';
const lspTimeoutInput = args.find((arg) => arg.startsWith('--lsp-timeout-ms='))?.slice('--lsp-timeout-ms='.length);
const lspTimeoutMs = lspTimeoutInput === undefined ? 20000 : Number(lspTimeoutInput);
const svelteTypeScriptPluginInput = args.find((arg) => arg.startsWith('--svelte-typescript-plugin='))?.slice('--svelte-typescript-plugin='.length);
const enableSvelteTypeScriptPlugin = svelteTypeScriptPluginInput === 'on';
const expectedUsage = 'Usage: node scripts/atlas/audit-indexed-source-providers-v1.mjs <exact-source-ref> <sha256-workspace-revision> [--sidecar=http://127.0.0.1:8095] [--lsp-timeout-ms=20000..60000] [--svelte-typescript-plugin=on|off]';
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const LOOPBACK_HTTP_RE = /^http:\/\/127\.0\.0\.1:\d{2,5}$/;

function assertArgs() {
  if (!sourceRefInput || !SHA256_RE.test(workspaceRevision ?? '') || !LOOPBACK_HTTP_RE.test(sidecarUrl) ||
      !Number.isInteger(lspTimeoutMs) || lspTimeoutMs < 20000 || lspTimeoutMs > 60000 ||
      (svelteTypeScriptPluginInput !== undefined && !['on', 'off'].includes(svelteTypeScriptPluginInput))) {
    throw new Error(expectedUsage);
  }
  return validateExactIndexedSourcePathV1(sourceRefInput);
}

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function sourceReadRoot(env) {
  const admissionPath = path.join(REPO_ROOT, 'docs', 'reports', 'workspace-revision-tournament-admission-v1.json');
  const admission = env.ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT && fs.existsSync(admissionPath)
    ? JSON.parse(fs.readFileSync(admissionPath, 'utf8')) : null;
  return resolveSourceReadRootV1({ repoRoot: REPO_ROOT, env, workspaceRevision, admission });
}

async function loadExactIndexedSource(sourceRef) {
  const env = loadRepoEnv(process.env);
  const databaseUrl = resolveDatabaseUrl(env);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const { rows } = await client.query(
      `SELECT b.canonical_source_ref, b.source_revision, b.workspace_revision,
              gf.file_id::text AS file_id, gf.parse_status, gf.code_source_revision
       FROM atlas_workspace_source_bindings b
       JOIN graphify_files gf
         ON gf.source_ref = b.canonical_source_ref
        AND gf.code_source_revision = b.source_revision
       WHERE b.canonical_source_ref = $1
         AND b.workspace_revision = $2
       ORDER BY gf.file_id
       LIMIT 2;`,
      [sourceRef, workspaceRevision],
    );
    if (rows.length !== 1) throw new Error(rows.length === 0 ? 'EXACT_INDEXED_SOURCE_BINDING_NOT_FOUND' : 'AMBIGUOUS_EXACT_INDEXED_SOURCE_BINDING');
    const binding = rows[0];
    const readRoot = sourceReadRoot(env);
    const rootReal = fs.realpathSync(readRoot.root);
    const absolutePath = path.resolve(rootReal, ...sourceRef.split('/'));
    const relativePath = path.relative(rootReal, absolutePath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) throw new Error('SOURCE_PATH_ESCAPES_READ_ROOT');
    const fileReal = fs.realpathSync(absolutePath);
    const realRelative = path.relative(rootReal, fileReal);
    if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('SOURCE_SYMLINK_ESCAPES_READ_ROOT');
    const sourceBytes = fs.readFileSync(fileReal);
    if (sha256(sourceBytes) !== binding.source_revision) throw new Error('SOURCE_BYTES_DO_NOT_MATCH_BOUND_REVISION');
    let sourceText;
    try { sourceText = decodeSourceUtf8V1(sourceBytes); }
    catch { throw new Error('SOURCE_NOT_VALID_UTF8'); }
    if (Buffer.byteLength(sourceText, 'utf8') !== sourceBytes.length) throw new Error('SOURCE_UTF8_ROUNDTRIP_MISMATCH');
    await client.query('ROLLBACK');
    return { binding, sourceBytes, sourceText, absolutePath: fileReal, sourceRoot: rootReal,
      sourceReadMode: readRoot.mode, snapshotRevision: readRoot.snapshotRevision };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const sourceRef = assertArgs();
  const source = await loadExactIndexedSource(sourceRef);
  const isSvelteSource = path.extname(sourceRef).toLowerCase() === '.svelte';
  const base = {
    schema: 'atlas.indexed-source-provider-diagnostic.v1',
    generatedAt: new Date().toISOString(),
    source: {
      sourceRef: source.binding.canonical_source_ref,
      sourceRevision: source.binding.source_revision,
      workspaceRevision: source.binding.workspace_revision,
      graphifyFileId: source.binding.file_id,
      graphifyParseStatus: source.binding.parse_status,
      sourceReadMode: source.sourceReadMode,
      materializedSnapshotRevision: source.snapshotRevision,
      byteLength: source.sourceBytes.length,
      exactByteSha256: sha256(source.sourceBytes),
    },
    providers: {},
    providerConfig: { lspTimeoutMs, svelteTypeScriptPlugin: isSvelteSource ? (enableSvelteTypeScriptPlugin ? 'enabled' : 'disabled_host_only') : 'not_applicable' },
    canonicalAuthority: false,
    canonicalWritesAttempted: false,
    canonicalWritesCommitted: 0,
  };
  const structuralProvider = isSvelteSource
    ? ['svelteCompilerAndEmbeddedTypeScript', () => analyzeIndexedSvelteTypeScriptV1({ repoRoot: REPO_ROOT,
      sourceRef, sourceText: source.sourceText, sourceBytes: source.sourceBytes, expectedRevision: source.binding.source_revision })]
    : ['treeSitterAndAstGrep', () => runIndexedSourceAstGrepV1({ repoRoot: REPO_ROOT, sourceRef,
      expectedRevision: source.binding.source_revision, sidecarUrl, sourceRoot: source.sourceRoot })];
  for (const [name, fn] of [
    structuralProvider,
    ['lsp', () => runIndexedSourceLspV1({ repoRoot: REPO_ROOT, sourceRef,
      absolutePath: source.absolutePath, sourceText: source.sourceText, sourceBytes: source.sourceBytes,
      sourceRevision: source.binding.source_revision, workspaceRevision: source.binding.workspace_revision,
      timeoutMs: lspTimeoutMs, enableSvelteTypeScriptPlugin })],
    ['nlpSidecar', () => runIndexedSourceNlpV1({ sourceText: source.sourceText, sourceRef,
      sourceRevision: source.binding.source_revision, workspaceRevision: source.binding.workspace_revision, sidecarUrl })],
  ]) {
    try {
      const result = await fn();
      base.providers[name] = { status: classifyIndexedSourceProviderResultV1(result), result };
    }
    catch (error) { base.providers[name] = { status: 'FAILED_OR_UNAVAILABLE', error: String(error?.message ?? error).slice(0, 400) }; }
  }
  base.status = Object.values(base.providers).every((provider) => provider.status === 'COMPLETED')
    ? 'DIAGNOSTIC_COMPLETE_NOT_ADMITTED' : 'PARTIAL_DIAGNOSTIC_NOT_ADMITTED';
  base.indexingOutcome = base.status === 'DIAGNOSTIC_COMPLETE_NOT_ADMITTED'
    ? 'DRY_RUN_VALIDATED_NOT_INDEXED' : 'PARTIAL_DIAGNOSTIC_NOT_ADMITTED';
  const receiptChecksum = crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');
  const receipt = { ...base, receiptChecksum };
  const outDir = path.join(REPO_ROOT, '.tmp', 'atlas');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `indexed-source-provider-diagnostic-${Date.now()}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ status: receipt.status, indexingOutcome: receipt.indexingOutcome, sourceRef, sourceRevision: source.binding.source_revision,
    workspaceRevision: source.binding.workspace_revision,
    providerStatus: Object.fromEntries(Object.entries(receipt.providers).map(([key, value]) => [key, value.status])),
    canonicalAuthority: false, canonicalWritesCommitted: 0, receiptPath: path.relative(REPO_ROOT, outPath), receiptChecksum }, null, 2));
}

main().catch((error) => {
  console.error(`${expectedUsage}\n${String(error?.message ?? error)}`);
  process.exitCode = 1;
});
