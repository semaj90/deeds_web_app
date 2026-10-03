#!/usr/bin/env node
/** Read-only vector-quality census for one sealed MAPREDUCE chunk-readiness cohort. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requiredPath = (name: string) => {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`EXPLICIT_${name.toUpperCase().replaceAll('-', '_')}_REQUIRED`);
  const absolute = path.resolve(ROOT, value);
  if (!absolute.startsWith(`${ROOT}${path.sep}`)) throw new Error(`PATH_OUTSIDE_REPOSITORY:${name}`);
  return absolute;
};
const hash = (data: string | Buffer) => `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
const readinessPath = requiredPath('readiness');
const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
if (readiness.schema !== 'atlas.mapreduce-chunk-readiness-receipt.v2'
  || readiness.status !== 'READINESS_REPLAY_COMPLETE'
  || readiness.canonicalAuthority !== false
  || readiness.writes?.postgres !== 0
  || readiness.measured?.inputConserved !== true
  || readiness.measured?.semantic768States?.AVAILABLE !== readiness.chunkCount) {
  throw new Error('READINESS_RECEIPT_NOT_ADMISSIBLE');
}
const rowsPath = path.resolve(ROOT, readiness.artifacts.rowDetails);
if (!rowsPath.startsWith(`${ROOT}${path.sep}`)) throw new Error('ROW_DETAILS_PATH_OUTSIDE_REPOSITORY');
const rowBytes = fs.readFileSync(rowsPath);
if (hash(rowBytes) !== readiness.artifacts.rowDetailsChecksum) throw new Error('ROW_DETAILS_CHECKSUM_MISMATCH');
const inputs = rowBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line, i) => {
  try { return JSON.parse(line); } catch { throw new Error(`ROW_DETAILS_INVALID_JSON:${i + 1}`); }
});
const ids = inputs.map((row) => row.chunkRowId);
if (inputs.length !== readiness.chunkCount || new Set(ids).size !== ids.length) throw new Error('INPUT_COHORT_NOT_UNIQUE_OR_CONSERVED');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120_000 });
const client = await pool.connect();
let dbRows: Array<{ id: string; content: string | null; file_content_hash: string | null; vector_text: string | null; embedding_dimension: number | null; representation_revision: string | null }>;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const result = await client.query(`
    SELECT id::text, content, file_content_hash, content_embedding::text AS vector_text,
      embedding_dimension, representation_revision
    FROM public.codebase_chunk_index
    WHERE id = ANY($1::uuid[])
    ORDER BY id::text
  `, [ids]);
  dbRows = result.rows;
  await client.query('ROLLBACK');
} finally {
  client.release();
  await pool.end();
}
if (dbRows.length !== ids.length || new Set(dbRows.map((r) => r.id)).size !== ids.length) throw new Error('DATABASE_ROW_CONSERVATION_FAILED');
const inputById = new Map(inputs.map((r) => [r.chunkRowId, r]));
const parseVector = (raw: string | null) => {
  if (!raw) return null;
  const body = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  return body.split(',').map(Number);
};
const vectorDigest = (vector: number[]) => hash(vector.map((n) => Object.is(n, -0) ? '0' : n.toString()).join(','));
const groups = new Map<string, Array<{ id: string; contentDigest: string; sourceDigest: string | null; representationRevision: string | null }>>();
let missing = 0, wrongDimension = 0, nonFinite = 0, zeroNorm = 0, nonUnit = 0;
const normTolerance = 0.02;
const rowEvidence = dbRows.map((row) => {
  const input = inputById.get(row.id);
  if (!input) throw new Error(`UNEXPECTED_DATABASE_ROW:${row.id}`);
  const vector = parseVector(row.vector_text);
  if (!vector) missing++;
  else {
    if (vector.length !== 768) wrongDimension++;
    if (vector.some((n) => !Number.isFinite(n))) nonFinite++;
    const norm = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0));
    if (Number.isFinite(norm)) {
      if (norm === 0) zeroNorm++;
      else if (Math.abs(norm - 1) > normTolerance) nonUnit++;
    }
  }
  const contentDigest = hash(row.content ?? '');
  const digest = vector ? vectorDigest(vector) : 'MISSING';
  const entry = { id: row.id, contentDigest, sourceDigest: row.file_content_hash, representationRevision: row.representation_revision };
  const group = groups.get(digest) ?? [];
  group.push(entry);
  groups.set(digest, group);
  return { chunkRowId: row.id, candidateOrdinal: input.candidateOrdinal, vectorDigest: digest, contentDigest, sourceRevision: input.sourceRevision, workspaceRevision: input.workspaceRevision, embeddingDimension: row.embedding_dimension, representationRevision: row.representation_revision };
});
const duplicateGroups = [...groups.entries()].filter(([digest, members]) => digest !== 'MISSING' && members.length > 1);
const duplicateSizeHistogram = Object.fromEntries([...new Set(duplicateGroups.map(([, members]) => members.length))].sort((a, b) => a - b).map((size) => [String(size), duplicateGroups.filter(([, members]) => members.length === size).length]));
let sameContentSameVector = 0, differentContentSameVector = 0;
for (const [, members] of duplicateGroups) {
  const distinctContent = new Set(members.map((m) => m.contentDigest)).size;
  if (distinctContent === 1) sameContentSameVector += members.length;
  else differentContentSameVector += members.length;
}
const revisionCounts = Object.fromEntries([...new Set(dbRows.map((r) => r.representation_revision ?? 'UNRECORDED'))].sort().map((revision) => [revision, dbRows.filter((r) => (r.representation_revision ?? 'UNRECORDED') === revision).length]));
const body = {
  schema: 'atlas.mapreduce-chunk-vector-degeneracy-receipt.v1',
  generatedAt: new Date().toISOString(),
  status: dbRows.length === ids.length && !missing && !wrongDimension && !nonFinite && !zeroNorm && !nonUnit ? 'VECTOR_COHORT_WELL_FORMED' : 'VECTOR_COHORT_HAS_QUALITY_FINDINGS',
  sourceReadinessReceipt: path.relative(ROOT, readinessPath).replaceAll('\\', '/'),
  sourceReadinessReceiptChecksum: hash(fs.readFileSync(readinessPath)),
  candidateSnapshotRevision: readiness.candidateSnapshotRevision,
  ordinalMapChecksum: readiness.ordinalMapChecksum,
  inputRowsChecksum: readiness.artifacts.rowDetailsChecksum,
  rowsExpected: ids.length,
  rowsRead: dbRows.length,
  distinctVectorDigests: groups.size - (groups.has('MISSING') ? 1 : 0),
  duplicateVectorRows: duplicateGroups.reduce((n, [, members]) => n + members.length - 1, 0),
  duplicateVectorGroups: duplicateGroups.length,
  duplicateSizeHistogram,
  duplicateRowsSameContentDigest: sameContentSameVector,
  duplicateRowsAcrossDifferentContentDigests: differentContentSameVector,
  missingVectors: missing,
  wrongVectorDimensions: wrongDimension,
  nonFiniteVectors: nonFinite,
  zeroNormVectors: zeroNorm,
  nonUnitVectorsOutsideTolerance: nonUnit,
  unitNormTolerance: normTolerance,
  representationRevisionCounts: revisionCounts,
  vectorRowsChecksum: hash(JSON.stringify(rowEvidence.map(({ chunkRowId, candidateOrdinal, vectorDigest, contentDigest, sourceRevision, workspaceRevision, embeddingDimension, representationRevision }) => ({ chunkRowId, candidateOrdinal, vectorDigest, contentDigest, sourceRevision, workspaceRevision, embeddingDimension, representationRevision })))),
  writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, neo4j: 0, graphify: 0 },
  canonicalAuthority: false,
};
const outPath = path.join(ROOT, 'docs/reports', `mapreduce-chunk-vector-degeneracy-v1-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(body, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ reportPath: path.relative(ROOT, outPath).replaceAll('\\', '/'), ...body }, null, 2));
