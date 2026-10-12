#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  compareCurrentChunkingV1,
  inspectChunkSourceAttributionV1,
} from './lib/chunk-source-attribution-diagnostic-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

function required(name) {
  const value = args.get(name)?.trim();
  if (!value) throw new Error(`ARGUMENT_REQUIRED:${name}`);
  return value;
}

function scratchPath(value) {
  const resolved = path.resolve(ROOT, value);
  const relative = path.relative(path.join(ROOT, '.tmp', 'atlas'), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
  }
  return resolved;
}

function receiptChecksum(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const packetKey = required('packet-key');
const sourceRef = required('source-ref').replaceAll('\\', '/');
const sourceRevision = required('source-revision');
const workspaceRevision = required('workspace-revision');
const outputPath = scratchPath(required('output'));
if (!/^sha256:[a-f0-9]{64}$/i.test(sourceRevision)) throw new Error('SOURCE_REVISION_INVALID');
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
const sourceBytes = await readFile(realSourcePath);

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 8000,
});
const client = await pool.connect();
let packet;
let rows;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const packetReadback = await client.query(`
    SELECT packet_key, source_ref, source_revision, workspace_revision_key
      FROM public.atlas_packets
     WHERE packet_key = $1
  `, [packetKey]);
  if (packetReadback.rows.length !== 1) throw new Error(`PACKET_CARDINALITY:${packetReadback.rows.length}`);
  packet = packetReadback.rows[0];
  if (packet.source_ref !== sourceRef || packet.source_revision !== sourceRevision
    || packet.workspace_revision_key !== workspaceRevision) {
    throw new Error('PACKET_SOURCE_WORKSPACE_IDENTITY_MISMATCH');
  }

  const chunkReadback = await client.query(`
    SELECT l.canonical_chunk_id, l.chunk_row_id, l.source_revision,
           l.revision_status, l.lineage_producer_revision, l.evidence_refs,
           c.qdrant_id, c.content_hash, c.content, c.metadata
      FROM public.atlas_packet_chunk_lineage l
      JOIN public.codebase_chunk_index c
        ON c.id = l.chunk_row_id AND c.chunk_id::text = l.canonical_chunk_id
     WHERE l.packet_key = $1 AND l.source_ref = $2 AND l.source_revision = $3
     ORDER BY l.canonical_chunk_id
  `, [packetKey, sourceRef, sourceRevision]);
  rows = chunkReadback.rows.map((row) => ({
    canonicalChunkId: String(row.canonical_chunk_id),
    chunkRowId: String(row.chunk_row_id),
    sourceRevision: row.source_revision,
    revisionStatus: row.revision_status,
    lineageProducerRevision: row.lineage_producer_revision,
    evidenceRefCount: Array.isArray(row.evidence_refs) ? row.evidence_refs.length : null,
    qdrantId: row.qdrant_id,
    contentHash: row.content_hash,
    content: typeof row.content === 'string' ? row.content : '',
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  }));
  await client.query('ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}

const attribution = inspectChunkSourceAttributionV1({ sourceRef, expectedSourceRevision: sourceRevision, sourceBytes, rows });
const currentChunkerComparison = compareCurrentChunkingV1({
  sourceRef,
  sourceText: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(sourceBytes),
  rows,
});
const legacyChunkerComparison = compareCurrentChunkingV1({
  sourceRef,
  sourceText: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(sourceBytes),
  rows,
  strategy: 'LEGACY_SLIDING_WINDOW',
});
const payload = {
  schema: 'atlas.chunk-source-attribution-diagnostic.v1',
  status: attribution.status,
  packet: {
    packetKey: packet.packet_key,
    sourceRef: packet.source_ref,
    sourceRevision: packet.source_revision,
    workspaceRevision: packet.workspace_revision_key,
  },
  transaction: 'REPEATABLE_READ_READ_ONLY_ROLLED_BACK',
  fileReadback: {
    sourceSha256: attribution.actualSourceRevision,
    sourceByteLength: attribution.sourceByteLength,
    sourceRealPath: realSourcePath,
  },
  chunkSourceAttribution: attribution,
  currentChunkerComparison,
  legacyChunkerComparison,
  contentEmitted: false,
  databaseWritesPerformed: false,
  persistentStoreWritesPerformed: false,
  canonicalAuthority: false,
  evidenceAdmitted: false,
};
const receipt = { ...payload, checksum: receiptChecksum(payload) };
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(await readFile(outputPath, 'utf8'));
const { checksum, ...readbackPayload } = readback;
if (checksum !== receiptChecksum(readbackPayload)) throw new Error('RECEIPT_READBACK_CHECKSUM_MISMATCH');
process.stdout.write(`${JSON.stringify({
  status: payload.status,
  packetKey,
  sourceRef,
  rowCount: attribution.rowCount,
  rows: attribution.rows,
  transaction: payload.transaction,
  receiptReadback: 'MATCH',
  writesPerformed: false,
  canonicalAuthority: false,
  evidenceAdmitted: false,
  reportPath: path.relative(ROOT, outputPath).replaceAll('\\', '/'),
}, null, 2)}\n`);
