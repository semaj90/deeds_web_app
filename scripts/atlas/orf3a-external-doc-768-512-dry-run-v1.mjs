#!/usr/bin/env node
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SOURCE_DIMENSION = 768;
export const TARGET_DIMENSION = 512;
const DEFAULT_QUERY_COUNT = 32;
const DEFAULT_K_VALUES = [5, 10, 20];

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function parsePgVectorLiteral(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== 'string' || !/^\s*\[[\s\S]*\]\s*$/.test(value)) {
    throw new Error('ORF3A_VECTOR_LITERAL_INVALID');
  }
  const body = value.trim().slice(1, -1).trim();
  if (!body) return [];
  const vector = body.split(',').map((part) => Number(part.trim()));
  if (vector.some((item) => !Number.isFinite(item))) throw new Error('ORF3A_VECTOR_NONFINITE');
  return vector;
}

function l2Normalize(vector, label) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 1e-12) throw new Error(`ORF3A_ZERO_VECTOR:${label}`);
  return vector.map((value) => value / norm);
}

function cosine(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  if (leftNorm <= 1e-24 || rightNorm <= 1e-24) throw new Error('ORF3A_ZERO_VECTOR_DURING_COMPARE');
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function rankCandidates(queryVector, rows, queryChunkId, vectors, limit) {
  return rows
    .filter((row) => row.chunkId !== queryChunkId)
    .map((row) => ({ chunkId: row.chunkId, score: cosine(queryVector, vectors.get(row.chunkId)) }))
    .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId))
    .slice(0, limit)
    .map((item) => item.chunkId);
}

function sampledIndices(total, requested) {
  const count = Math.min(total, requested);
  if (count <= 0) return [];
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, index) => Math.floor(index * (total - 1) / (count - 1)));
}

export function compareExternalDocProjectionV1(inputRows, options = {}) {
  if (!Array.isArray(inputRows) || inputRows.length === 0) throw new Error('ORF3A_ZERO_CHUNKS');
  const queryCount = options.queryCount ?? DEFAULT_QUERY_COUNT;
  const kValues = options.kValues ?? DEFAULT_K_VALUES;
  if (!Number.isInteger(queryCount) || queryCount < 1) throw new Error('ORF3A_QUERY_COUNT_INVALID');
  if (!Array.isArray(kValues) || kValues.length === 0 || kValues.some((k) => !Number.isInteger(k) || k < 1 || k >= inputRows.length)) {
    throw new Error('ORF3A_K_VALUES_INVALID');
  }

  const rows = inputRows
    .map((row) => {
      for (const key of ['chunkId', 'pageId', 'pageChecksum', 'chunkChecksum', 'evidenceRevision']) {
        if (typeof row[key] !== 'string' || row[key].length === 0) throw new Error(`ORF3A_IDENTITY_FIELD_MISSING:${key}`);
      }
      const vector = parsePgVectorLiteral(row.vectorLiteral);
      if (vector.length !== SOURCE_DIMENSION) throw new Error(`ORF3A_SOURCE_DIMENSION_MISMATCH:${row.chunkId}:${vector.length}`);
      return { ...row, vector };
    })
    .sort((a, b) => a.chunkId.localeCompare(b.chunkId));

  if (new Set(rows.map((row) => row.chunkId)).size !== rows.length) throw new Error('ORF3A_DUPLICATE_CHUNK_ID');
  const sourceVectors = new Map();
  const projectedVectors = new Map();
  const sourceVectorHash = createHash('sha256');
  const projectedVectorHash = createHash('sha256');
  const identityRows = [];

  for (const row of rows) {
    const projected = row.vector.slice(0, TARGET_DIMENSION);
    // The 512-dimensional challenger is explicitly L2-normalized after truncation.
    const normalizedProjected = l2Normalize(projected, row.chunkId);
    // Source-vector zero checks fail closed even though cosine is scale invariant.
    l2Normalize(row.vector, row.chunkId);
    sourceVectors.set(row.chunkId, row.vector);
    projectedVectors.set(row.chunkId, normalizedProjected);
    sourceVectorHash.update(`${row.chunkId}\0${row.vector.join(',')}\n`);
    projectedVectorHash.update(`${row.chunkId}\0${normalizedProjected.join(',')}\n`);
    identityRows.push([row.chunkId, row.pageId, row.pageChecksum, row.chunkChecksum, row.evidenceRevision]);
  }

  const maxK = Math.max(...kValues);
  const queryRows = sampledIndices(rows.length, queryCount).map((index) => rows[index]);
  const sums = new Map(kValues.map((k) => [k, 0]));
  for (const query of queryRows) {
    const sourceTop = rankCandidates(sourceVectors.get(query.chunkId), rows, query.chunkId, sourceVectors, maxK);
    const projectedTop = rankCandidates(projectedVectors.get(query.chunkId), rows, query.chunkId, projectedVectors, maxK);
    for (const k of kValues) {
      const projectedSet = new Set(projectedTop.slice(0, k));
      const overlap = sourceTop.slice(0, k).filter((chunkId) => projectedSet.has(chunkId)).length;
      sums.set(k, sums.get(k) + overlap / k);
    }
  }

  const sourceIdentityChecksum = sha256(JSON.stringify(identityRows));
  return {
    schema: 'atlas.external-doc-768-to-512-dry-run.v1',
    status: 'READ_ONLY_PROJECTION_COMPARISON',
    cohort: {
      chunkCount: rows.length,
      queryCount: queryRows.length,
      sourceDimension: SOURCE_DIMENSION,
      projectedDimension: TARGET_DIMENSION,
      sourceVectorChecksum: `sha256:${sourceVectorHash.digest('hex')}`,
      projectedVectorChecksum: `sha256:${projectedVectorHash.digest('hex')}`,
      identityChecksum: sourceIdentityChecksum,
      projectedIdentityChecksum: sourceIdentityChecksum,
      exactIdentityParity: true,
      pageChecksumCount: new Set(rows.map((row) => row.pageChecksum)).size,
      chunkChecksumCount: new Set(rows.map((row) => row.chunkChecksum)).size,
    },
    neighborOverlap: Object.fromEntries(kValues.map((k) => [
      `recallAt${k}`,
      Number((sums.get(k) / queryRows.length).toFixed(8)),
    ])),
    interpretation: 'Projection parity against the 768-dimensional executor only; not judged relevance, encoder provenance, or promotion evidence.',
    writesPerformed: false,
    modelCalls: 0,
    applied: false,
    promotionEligible: false,
  };
}

async function runReadOnlyDryRun() {
  const root = process.cwd();
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
  dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });
  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('ORF3A_DATABASE_URL_MISSING');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString, options: '-c default_transaction_read_only=on' });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const result = await client.query(`
        SELECT c.chunk_id, c.page_id::text AS page_id, c.evidence_revision,
               c.chunk_checksum, p.content_hash AS page_checksum,
               vector_dims(c.content_embedding)::int AS dimensions,
               c.content_embedding::text AS vector_literal
        FROM public.atlas_external_doc_chunks AS c
        LEFT JOIN public.atlas_external_doc_pages AS p ON p.id = c.page_id
        ORDER BY c.chunk_id
      `);
      if (result.rows.length === 0) throw new Error('ORF3A_ZERO_CHUNKS');
      const invalidRows = result.rows.filter((row) => row.dimensions !== SOURCE_DIMENSION || !row.page_checksum || !row.chunk_checksum || !row.evidence_revision);
      if (invalidRows.length > 0) throw new Error(`ORF3A_SOURCE_COHORT_INVALID:${invalidRows.length}`);
      const receipt = compareExternalDocProjectionV1(result.rows.map((row) => ({
        chunkId: row.chunk_id,
        pageId: row.page_id,
        pageChecksum: row.page_checksum,
        chunkChecksum: row.chunk_checksum,
        evidenceRevision: row.evidence_revision,
        vectorLiteral: row.vector_literal,
      })));
      await client.query('ROLLBACK');
      console.log(JSON.stringify(receipt, null, 2));
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve the original read-only failure. */ }
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runReadOnlyDryRun().catch((error) => {
    console.error(error instanceof Error ? error.message : 'ORF3A_DRY_RUN_FAILED');
    process.exitCode = 1;
  });
}
