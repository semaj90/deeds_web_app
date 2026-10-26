import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { resolveSymbolTocChunkOrdinalsV1 } from './lib/symbol-toc-owner-readback-v1.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

function required(name: string): string {
  const value = args.get(name)?.trim();
  if (!value) throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return value;
}

function resolveScratchPath(value: string, field: string): string {
  const resolved = path.resolve(ROOT, value);
  const relative = path.relative(path.join(ROOT, '.tmp', 'atlas'), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`PATH_MUST_BE_UNDER_TMP_ATLAS:${field}`);
  }
  return resolved;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const packetKey = required('packet-key');
const symbolVersionId = args.get('symbol-version-id')?.trim() || null;
const sourceRef = required('source-ref');
const workspaceRevision = required('workspace-revision');
const mapPath = resolveScratchPath(required('ordinal-map'), 'ordinal-map');
const outputPath = resolveScratchPath(required('output'), 'output');
if (mapPath === outputPath) throw new Error('INPUT_OUTPUT_PATHS_MUST_BE_DISTINCT');
if (!/^sha256:[a-f0-9]{64}$/i.test(workspaceRevision)) throw new Error('WORKSPACE_REVISION_INVALID');

const repoRoot = await realpath(ROOT);
const sourcePath = path.resolve(repoRoot, sourceRef);
const sourceRelativePath = path.relative(repoRoot, sourcePath);
if (!sourceRelativePath || sourceRelativePath.startsWith('..') || path.isAbsolute(sourceRelativePath)) {
  throw new Error('SOURCE_REF_OUTSIDE_REPOSITORY');
}
const realSourcePath = await realpath(sourcePath);
const realSourceRelativePath = path.relative(repoRoot, realSourcePath);
if (!realSourceRelativePath || realSourceRelativePath.startsWith('..') || path.isAbsolute(realSourceRelativePath)) {
  throw new Error('SOURCE_REALPATH_OUTSIDE_REPOSITORY');
}

const mapBytes = await readFile(mapPath);
const ordinalMap = JSON.parse(mapBytes.toString('utf8')) as Record<string, any>;
if (ordinalMap.workspaceRevision !== workspaceRevision) throw new Error('ORDINAL_MAP_WORKSPACE_REVISION_MISMATCH');
const sourceBytes = await readFile(realSourcePath);
const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
const candidateRows = Array.isArray(ordinalMap.candidates) ? ordinalMap.candidates.filter((candidate: Record<string, unknown>) =>
  candidate.packetKey === packetKey && candidate.sourceRef === sourceRef
  && candidate.sourceRevision === sourceRevision && candidate.workspaceRevision === workspaceRevision) : [];
if (candidateRows.length === 0) throw new Error('EXACT_PACKET_SOURCE_NOT_IN_ORDINAL_MAP');

const repoEnv = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(repoEnv), max: 1 });
const client = await pool.connect();
let symbols: Record<string, unknown>[];
let chunks: Array<{ canonicalChunkId: string; contentBytes: Buffer; sourceSpan?: unknown }>;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if (!symbolVersionId) {
    const allActiveSymbols = await client.query(`
      SELECT v.symbol_version_id, v.stable_symbol_id, v.packet_key, v.source_ref,
             v.source_revision, v.workspace_revision, v.byte_start, v.byte_end,
             v.qualified_name, r.symbol_kind
        FROM public.atlas_symbol_versions v
        JOIN public.atlas_symbol_registry r ON r.stable_symbol_id = v.stable_symbol_id
       WHERE v.packet_key = $1 AND v.source_ref = $2 AND v.source_revision = $3
         AND v.workspace_revision = $4 AND r.status = 'active'
       ORDER BY v.byte_start, v.symbol_version_id
    `, [packetKey, sourceRef, sourceRevision, workspaceRevision]);
    symbols = allActiveSymbols.rows;
  } else {
    const symbolResult = await client.query(`
      SELECT v.symbol_version_id, v.stable_symbol_id, v.packet_key, v.source_ref,
             v.source_revision, v.workspace_revision, v.byte_start, v.byte_end,
             v.qualified_name, r.symbol_kind
        FROM public.atlas_symbol_versions v
        JOIN public.atlas_symbol_registry r ON r.stable_symbol_id = v.stable_symbol_id
       WHERE v.symbol_version_id = $1 AND v.packet_key = $2 AND v.source_ref = $3
         AND v.source_revision = $4 AND v.workspace_revision = $5 AND r.status = 'active'
    `, [symbolVersionId, packetKey, sourceRef, sourceRevision, workspaceRevision]);
    if (symbolResult.rows.length !== 1) throw new Error(`CANONICAL_SYMBOL_CARDINALITY:${symbolResult.rows.length}`);
    symbols = symbolResult.rows;
  }
  if (symbols.length === 0) throw new Error('CANONICAL_SYMBOL_COHORT_EMPTY');

  const chunkResult = await client.query(`
    SELECT l.canonical_chunk_id, c.content, c.metadata
      FROM public.atlas_packet_chunk_lineage l
      JOIN public.codebase_chunk_index c
        ON c.id = l.chunk_row_id AND c.chunk_id::text = l.canonical_chunk_id::text
     WHERE l.packet_key = $1 AND l.source_ref = $2 AND l.source_revision = $3
       AND l.revision_status = 'PROVEN'
     ORDER BY l.canonical_chunk_id
  `, [packetKey, sourceRef, sourceRevision]);
  chunks = chunkResult.rows.map((row) => ({
    canonicalChunkId: String(row.canonical_chunk_id),
    contentBytes: Buffer.from(typeof row.content === 'string' ? row.content : '', 'utf8'),
    sourceSpan: row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>).source_span ?? null
      : null,
  }));
  await client.query('ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}

const crosswalks = symbols.map((symbol) => ({
  symbolVersionId: symbol.symbol_version_id,
  qualifiedName: symbol.qualified_name,
  symbolKind: symbol.symbol_kind,
  result: resolveSymbolTocChunkOrdinalsV1({ ordinalMap, symbol: symbol as any, sourceBytes, chunks }),
}));
const payload = {
  schema: 'atlas.symbol-toc-chunk-crosswalk-proof.v1',
  status: symbolVersionId ? crosswalks[0].result.status : 'SYMBOL_TOC_COHORT_CROSSWALK_NOT_ADMITTED',
  packetKey,
  symbolVersionId,
  symbolCount: symbols.length,
  sourceRef,
  sourceRevision,
  workspaceRevision,
  ordinalMapChecksum: ordinalMap.ordinalMapChecksum ?? null,
  candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision ?? null,
  mapArtifactChecksum: createHash('sha256').update(mapBytes).digest('hex'),
  sourceByteLength: sourceBytes.byteLength,
  chunkRowsRead: chunks.length,
  crosswalks,
  canonicalAuthority: false,
  evidenceAdmitted: false,
  persistentStoreWritesPerformed: false,
};
const receipt = { ...payload, checksum: checksum(payload) };
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, unknown>;
const { checksum: receiptChecksum, ...readbackPayload } = readback;
if (receiptChecksum !== checksum(readbackPayload)) throw new Error('SCRATCH_RECEIPT_READBACK_CHECKSUM_MISMATCH');
process.stdout.write(`${JSON.stringify({
  status: payload.status,
  packetKey,
  symbolVersionId,
  symbolCount: symbols.length,
  sourceRevision,
  workspaceRevision,
  candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
  symbolBindings: crosswalks.map(({ symbolVersionId: id, qualifiedName, result }) => ({
    symbolVersionId: id,
    qualifiedName,
    status: result.status,
    candidateOrdinals: 'matches' in result ? (result as any).matches.map((match: any) => match.candidateOrdinal) : [],
    unresolvedChunks: 'unresolvedChunks' in result ? (result as any).unresolvedChunks.length : 0,
    nonOverlappingChunks: 'nonOverlappingChunks' in result ? (result as any).nonOverlappingChunks.length : 0,
  })),
  canonicalAuthority: false,
  evidenceAdmitted: false,
  databaseTransaction: 'ROLLED_BACK_READ_ONLY',
  scratchReadback: 'MATCH',
  reportPath: path.relative(ROOT, outputPath).replaceAll('\\', '/'),
}, null, 2)}\n`);
