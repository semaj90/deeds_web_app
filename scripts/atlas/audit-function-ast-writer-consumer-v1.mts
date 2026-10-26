import pg from 'pg';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { probeFunctionAstWriterConsumerV1 } from './lib/function-ast-writer-consumer-preflight-v1.mts';
import { createFunctionRegistryPostgresReadPortsV1 } from '../../sveltekit-frontend/src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.ts';
import { astNodeStoragePathV1 } from '../../sveltekit-frontend/src/lib/server/atlas/function-registry/ast-node-storage-path-v1.ts';

const { values } = parseArgs({ options: {
  'symbol-version-id': { type: 'string' },
  'ast-url': { type: 'string' },
} });
const symbolVersionId = values['symbol-version-id'];
if (!symbolVersionId || symbolVersionId.length > 256 || !values['ast-url']) throw new Error('SYMBOL_ID_AND_EXPLICIT_AST_URL_REQUIRED');
const nativeAudit = execFileSync(process.execPath, [
  fileURLToPath(new URL('./audit-function-source-readback-v1.mjs', import.meta.url)),
  `--symbol-version-id=${symbolVersionId}`, `--ast-url=${values['ast-url']}`,
], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000 });
const nativeReceipt = JSON.parse(nativeAudit);
if (!nativeReceipt.exactSourceBytesVerified || nativeReceipt.nativeAst?.status !== 'SOURCE_NATIVE_AST_ALIGNED') {
  throw new Error('NATIVE_SOURCE_READBACK_REQUIRED');
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1,
  connectionTimeoutMillis: 5000, statement_timeout: 12000, application_name: 'atlas-ast-writer-consumer-audit-v1' });
const client = await pool.connect();
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const ports = createFunctionRegistryPostgresReadPortsV1({
    async query<Row>(sql: string, parameters?: unknown[]) {
      return { rows: (await client.query(sql, parameters)).rows as Row[] };
    },
    release() {},
  }, REPO_ROOT);
  const symbol = await ports.getSymbolVersion(symbolVersionId);
  if (!symbol) throw new Error('SYMBOL_NOT_FOUND');
  for (const [field, expected] of Object.entries({ symbolVersionId: symbol.symbolVersionId, packetKey: symbol.packetKey,
    sourceRef: symbol.sourceRef, sourceRevision: symbol.sourceRevision, workspaceRevision: symbol.workspaceRevision,
    byteStart: symbol.byteStart, byteEnd: symbol.byteEnd })) {
    if (String(nativeReceipt.canonical?.[field]) !== String(expected)) throw new Error('NATIVE_RECEIPT_CANONICAL_BINDING_MISMATCH');
  }
  const native = nativeReceipt.nativeAst;
  const upstream = await client.query("SELECT upstream_symbol_id, callable_metadata->>'language' AS language FROM public.atlas_symbol_versions WHERE symbol_version_id=$1", [symbolVersionId]);
  if (native.upstreamNodeId !== symbol.upstreamNodeId || upstream.rows.length !== 1
    || native.upstreamSymbolId !== upstream.rows[0].upstream_symbol_id) throw new Error('NATIVE_RECEIPT_UPSTREAM_BINDING_MISMATCH');
  const bindings = await ports.getWorkspaceSourceBindings(symbol.sourceRef, symbol.sourceRevision, symbol.workspaceRevision);
  if (bindings.length !== 1) throw new Error('SOURCE_BINDING_NOT_UNIQUE');
  const sourceBytes = await ports.readSourceBytes(symbol.sourceRef, symbol.sourceRevision);
  if (!sourceBytes) throw new Error('EXACT_SOURCE_BYTES_REQUIRED');
  const workspaces = await client.query(`SELECT DISTINCT workspace_id::text FROM public.graphify_executions
    WHERE workspace_revision=$1 AND canonical_authority=true AND status='COMPLETED' LIMIT 2`, [symbol.workspaceRevision]);
  if (workspaces.rows.length !== 1) throw new Error('CANONICAL_WORKSPACE_NOT_UNIQUE');
  const pathBindings = await client.query(`SELECT canonical_source_ref FROM public.atlas_workspace_source_bindings
    WHERE repo_id=$1 AND workspace_revision=$2
      AND lower(replace(canonical_source_ref, chr(92), '/'))=$3 LIMIT 2`,
    [bindings[0].repoId, symbol.workspaceRevision, astNodeStoragePathV1(symbol.sourceRef)]);
  const existingAst = await ports.getAstCandidates(symbol, bindings[0], sourceBytes);
  const preflight = await probeFunctionAstWriterConsumerV1({ symbol, binding: bindings[0], sourceBytes,
    writerInput: { sourceRef: symbol.sourceRef, sourceRevision: symbol.sourceRevision,
      workspaceId: workspaces.rows[0].workspace_id, parserLanguage: upstream.rows[0].language,
      parserName: native.engine, parserVersion: native.engineVersion,
      nodes: [{ kind: native.kind, qualifiedSymbol: symbol.qualifiedName, startByte: symbol.byteStart, endByte: symbol.byteEnd,
        startLine: Buffer.from(sourceBytes.subarray(0, symbol.byteStart)).toString('utf8').split('\n').length,
        endLine: Buffer.from(sourceBytes.subarray(0, symbol.byteEnd)).toString('utf8').split('\n').length,
        sourceContentDigest: symbol.sourceRevision, parentIndex: null }] },
  });
  const sourceBindings: Record<string, string> = {};
  for (const [name, relativePath] of [
    ['audit', './audit-function-ast-writer-consumer-v1.mts'],
    ['preflight', './lib/function-ast-writer-consumer-preflight-v1.mts'],
    ['writer', './lib/atlas-ast-nodes-writer.mjs'],
    ['reader', '../../sveltekit-frontend/src/lib/server/atlas/function-registry/function-registry-postgres-snapshot-loader-v1.ts'],
    ['pathPolicy', '../../sveltekit-frontend/src/lib/server/atlas/function-registry/ast-node-storage-path-v1.ts'],
    ['qualifier', '../../sveltekit-frontend/src/lib/server/atlas/function-registry/function-registry-read-adapter-v1.ts'],
  ]) sourceBindings[name] = createHash('sha256').update(await readFile(new URL(relativePath, import.meta.url))).digest('hex');
  console.log(JSON.stringify({ schema: 'atlas.function-ast-writer-consumer-audit.v1', status: 'BLOCKED',
    canonical: nativeReceipt.canonical, workspaceId: workspaces.rows[0].workspace_id,
    nativeReceiptChecksum: createHash('sha256').update(nativeAudit).digest('hex'), sourceBindings,
    sourcePathBindingUnique: pathBindings.rows.length === 1 && pathBindings.rows[0].canonical_source_ref === symbol.sourceRef,
    sourcePathBindingCount: pathBindings.rows.length,
    existingAstCandidates: existingAst.length, preflight, eligibility: 'NOT_AUTHORIZED_FOR_MATERIALIZATION',
    contextManifestAdmitted: false, writesPerformed: false, canonicalAuthority: false }, null, 2));
  process.exitCode = 3;
} finally {
  try { await client.query('ROLLBACK'); } finally { client.release(); await pool.end(); }
}
