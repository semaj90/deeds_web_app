#!/usr/bin/env node
/**
 * Checksum-gated metadata-only repair consumer for the null-content-hash audit.
 *
 * Default mode is DRY-RUN. APPLY requires BOTH:
 *   --apply
 *   --expected-manifest-checksum <sha256>
 *
 * Safety invariants:
 * - Never re-embeds.
 * - Never changes Qdrant point IDs.
 * - Never writes Qdrant vectors.
 * - Never synthesizes chunk_id.
 * - Revalidates current Postgres content + vector and current Qdrant identity/vector.
 * - Supports safe resume after a partial Postgres/Qdrant metadata repair.
 */

import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const DEFAULT_MANIFEST = path.resolve(REPO_ROOT, 'docs/reports/null-content-hash-repairability.ndjson');
const DEFAULT_RECEIPT = path.resolve(REPO_ROOT, 'docs/reports/null-content-hash-metadata-repair-receipt.json');

const COLLECTION = process.env.NULL_HASH_REPAIR_COLLECTION ?? 'codebase_chunks_768_v2';
const VECTOR_NAME = process.env.NULL_HASH_REPAIR_VECTOR ?? 'content';
const DIMENSION = Number(process.env.NULL_HASH_REPAIR_DIMENSION ?? '768');
const MIN_COSINE = Number(process.env.NULL_HASH_REPAIR_MIN_COSINE ?? '0.99999');
const MAX_ABS_DELTA = Number(process.env.NULL_HASH_REPAIR_MAX_ABS_DELTA ?? '0.001');
const DATABASE_URL = process.env.DATABASE_URL;
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^http:\/\/0\.0\.0\.0/, 'http://127.0.0.1');
const QDRANT_API_KEY = process.env.QDRANT_API_KEY ?? process.env.QDRANT__SERVICE__API_KEY ?? null;

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const APPLY = process.argv.includes('--apply');
const MANIFEST_PATH = path.resolve(argValue('--manifest') ?? DEFAULT_MANIFEST);
const RECEIPT_PATH = path.resolve(argValue('--receipt') ?? DEFAULT_RECEIPT);
const EXPECTED_CHECKSUM = argValue('--expected-manifest-checksum');
const LIMIT = Number(argValue('--limit') ?? process.env.NULL_HASH_REPAIR_LIMIT ?? '100000');

if (!Number.isInteger(LIMIT) || LIMIT < 1) throw new Error('--limit must be a positive integer');
if (APPLY && (!EXPECTED_CHECKSUM || !/^[a-f0-9]{64}$/i.test(EXPECTED_CHECKSUM))) {
  throw new Error('--apply requires --expected-manifest-checksum <64-char sha256>');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function shortContentHash(text) {
  return sha256(Buffer.from(text, 'utf8')).slice(0, 16);
}

function parseVectorText(value) {
  if (typeof value !== 'string') return { ok: false, reason: 'MISSING' };
  try {
    const parsed = JSON.parse(value.trim());
    if (!Array.isArray(parsed)) return { ok: false, reason: 'NOT_ARRAY' };
    if (parsed.length !== DIMENSION) return { ok: false, reason: `DIMENSION_${parsed.length}` };
    const vector = parsed.map(Number);
    if (vector.some((item) => !Number.isFinite(item))) return { ok: false, reason: 'NON_FINITE' };
    return { ok: true, vector };
  } catch (error) {
    return { ok: false, reason: `PARSE_ERROR:${error instanceof Error ? error.message : String(error)}` };
  }
}

function extractQdrantVector(point) {
  const raw = point?.vector;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray(raw[VECTOR_NAME])) return raw[VECTOR_NAME];
  return null;
}

function compareVectors(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  let maxAbsDelta = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
    maxAbsDelta = Math.max(maxAbsDelta, Math.abs(a[i] - b[i]));
  }
  const denom = Math.sqrt(aa) * Math.sqrt(bb);
  const cosine = denom > 0 ? dot / denom : Number.NaN;
  return {
    cosine,
    maxAbsDelta,
    passes: Number.isFinite(cosine) && cosine >= MIN_COSINE && maxAbsDelta <= MAX_ABS_DELTA,
  };
}

function qdrantHeaders() {
  const headers = { 'content-type': 'application/json' };
  if (QDRANT_API_KEY) headers['api-key'] = QDRANT_API_KEY;
  return headers;
}

async function getQdrantPoint(id) {
  const response = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points`, {
    method: 'POST',
    headers: qdrantHeaders(),
    body: JSON.stringify({ ids: [id], with_payload: true, with_vector: [VECTOR_NAME] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`QDRANT_GET_${response.status}:${(await response.text()).slice(0, 300)}`);
  const body = await response.json();
  return Array.isArray(body?.result) ? (body.result[0] ?? null) : null;
}

async function setQdrantPayload(id, payload) {
  const response = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points/payload?wait=true`, {
    method: 'POST',
    headers: qdrantHeaders(),
    body: JSON.stringify({ payload, points: [id] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`QDRANT_SET_PAYLOAD_${response.status}:${(await response.text()).slice(0, 300)}`);
}

function parseManifest(text) {
  const rawLines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const rows = rawLines.map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Invalid manifest JSON at line ${index + 1}: ${error.message}`); }
  });
  // Matches the audit's candidateManifestSha256 algorithm: JSON rows joined by \n, no trailing newline.
  const normalized = rows.map((row) => JSON.stringify(row)).join('\n');
  return { rows, checksum: sha256(Buffer.from(normalized, 'utf8')) };
}

function validateManifestRow(row) {
  if (!row || typeof row !== 'object') return 'ROW_NOT_OBJECT';
  if (!row.postgresId || !row.relativePath || !row.expectedContentHash) return 'REQUIRED_IDENTITY_MISSING';
  if (!/^[a-f0-9]{16}$/i.test(row.expectedContentHash)) return 'EXPECTED_HASH_INVALID';
  if (String(row.qdrantActualPointId) !== String(row.postgresId)) return 'QDRANT_POINT_ID_NOT_POSTGRES_UUID';
  if (row.proposedRepair?.qdrantPointIdChanges !== false) return 'POINT_ID_CHANGE_NOT_FORBIDDEN';
  if (row.proposedRepair?.qdrantVectorChanges !== false) return 'VECTOR_CHANGE_NOT_FORBIDDEN';
  if (row.proposedRepair?.reembeddingRequired !== false) return 'REEMBEDDING_NOT_FORBIDDEN';
  return null;
}

const manifestText = await readFile(MANIFEST_PATH, 'utf8');
const manifest = parseManifest(manifestText);
if (EXPECTED_CHECKSUM && manifest.checksum.toLowerCase() !== EXPECTED_CHECKSUM.toLowerCase()) {
  throw new Error(`MANIFEST_CHECKSUM_MISMATCH expected=${EXPECTED_CHECKSUM} actual=${manifest.checksum}`);
}

const duplicateIds = new Set();
const seenIds = new Set();
for (const row of manifest.rows) {
  const id = String(row?.postgresId ?? '');
  if (seenIds.has(id)) duplicateIds.add(id);
  seenIds.add(id);
}
if (duplicateIds.size > 0) throw new Error(`DUPLICATE_POSTGRES_IDS:${[...duplicateIds].slice(0, 10).join(',')}`);

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
const results = [];
let processed = 0;

try {
  for (const candidate of manifest.rows.slice(0, LIMIT)) {
    const manifestIssue = validateManifestRow(candidate);
    if (manifestIssue) {
      results.push({ postgresId: candidate?.postgresId ?? null, status: 'REJECTED_MANIFEST', reason: manifestIssue });
      continue;
    }

    const id = String(candidate.postgresId);
    const client = await pool.connect();
    let pgRow;
    try {
      await client.query('BEGIN');
      const current = await client.query(`
        SELECT id::text AS id, relative_path, chunk_id, content_hash, content,
               content_embedding::text AS embedding_text
        FROM codebase_chunk_index
        WHERE id = $1
        FOR UPDATE
      `, [id]);
      pgRow = current.rows[0] ?? null;
      if (!pgRow) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'POSTGRES_ROW_MISSING' });
        continue;
      }

      if (String(pgRow.relative_path) !== String(candidate.relativePath)) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'SOURCE_REF_CHANGED' });
        continue;
      }
      if (String(pgRow.chunk_id ?? '') !== String(candidate.chunkId ?? '')) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'CHUNK_ID_CHANGED' });
        continue;
      }
      if (typeof pgRow.content !== 'string') {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'SOURCE_CONTENT_MISSING' });
        continue;
      }

      const currentHash = shortContentHash(pgRow.content);
      if (currentHash !== candidate.expectedContentHash) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'CONTENT_CHANGED', expected: candidate.expectedContentHash, actual: currentHash });
        continue;
      }
      if (pgRow.content_hash != null && String(pgRow.content_hash) !== currentHash) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'POSTGRES_HASH_CONFLICT', actual: pgRow.content_hash });
        continue;
      }

      const pgVector = parseVectorText(pgRow.embedding_text);
      if (!pgVector.ok) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: `POSTGRES_VECTOR_${pgVector.reason}` });
        continue;
      }

      const qdrantPoint = await getQdrantPoint(id);
      if (!qdrantPoint) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'QDRANT_POINT_MISSING' });
        continue;
      }
      if (String(qdrantPoint.id) !== id) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'QDRANT_POINT_ID_CONFLICT' });
        continue;
      }

      const payload = qdrantPoint.payload ?? {};
      if (payload.postgres_id != null && String(payload.postgres_id) !== id) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'QDRANT_POSTGRES_ID_CONFLICT' });
        continue;
      }
      const payloadSource = payload.source_ref ?? payload.relative_path ?? null;
      if (payloadSource != null && String(payloadSource) !== String(candidate.relativePath)) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'QDRANT_SOURCE_REF_CONFLICT' });
        continue;
      }
      if (payload.chunk_id != null && String(payload.chunk_id) !== String(candidate.chunkId ?? '')) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'QDRANT_CHUNK_ID_CONFLICT' });
        continue;
      }
      if (payload.content_hash != null && String(payload.content_hash) !== currentHash) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'QDRANT_CONTENT_HASH_CONFLICT' });
        continue;
      }

      const qdrantVectorRaw = extractQdrantVector(qdrantPoint);
      if (!Array.isArray(qdrantVectorRaw) || qdrantVectorRaw.length !== DIMENSION) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'QDRANT_VECTOR_INVALID' });
        continue;
      }
      const qdrantVector = qdrantVectorRaw.map(Number);
      if (qdrantVector.some((value) => !Number.isFinite(value))) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'QDRANT_VECTOR_NON_FINITE' });
        continue;
      }
      const comparison = compareVectors(pgVector.vector, qdrantVector);
      if (!comparison.passes) {
        await client.query('ROLLBACK');
        results.push({ postgresId: id, status: 'REJECTED_CURRENT_STATE', reason: 'VECTOR_MISMATCH', comparison });
        continue;
      }

      const expectedQdrantMetadata = `card:${candidate.relativePath}:${currentHash}`;
      const pgNeedsWrite = pgRow.content_hash == null;
      const qdrantNeedsWrite = payload.content_hash !== currentHash || payload.qdrant_point_id !== expectedQdrantMetadata || payload.source_ref !== candidate.relativePath || String(payload.chunk_id ?? '') !== String(candidate.chunkId ?? '');

      if (!APPLY) {
        await client.query('ROLLBACK');
        results.push({
          postgresId: id,
          status: pgNeedsWrite || qdrantNeedsWrite ? 'DRY_RUN_REPAIRABLE' : 'ALREADY_REPAIRED',
          pgNeedsWrite,
          qdrantNeedsWrite,
          comparison,
        });
        processed += 1;
        continue;
      }

      if (pgNeedsWrite) {
        const updated = await client.query(`
          UPDATE codebase_chunk_index
          SET content_hash = $2
          WHERE id = $1 AND content_hash IS NULL
          RETURNING id
        `, [id, currentHash]);
        if (updated.rowCount !== 1) throw new Error('POSTGRES_CONDITIONAL_UPDATE_FAILED');
      }
      await client.query('COMMIT');

      if (qdrantNeedsWrite) {
        await setQdrantPayload(id, {
          content_hash: currentHash,
          chunk_id: candidate.chunkId ?? null,
          source_ref: candidate.relativePath,
          qdrant_point_id: expectedQdrantMetadata,
        });
      }

      const pgReadback = await pool.query('SELECT content_hash FROM codebase_chunk_index WHERE id = $1', [id]);
      const qdrantReadback = await getQdrantPoint(id);
      const rbPayload = qdrantReadback?.payload ?? {};
      const readbackPass = pgReadback.rows[0]?.content_hash === currentHash &&
        rbPayload.content_hash === currentHash &&
        rbPayload.qdrant_point_id === expectedQdrantMetadata &&
        rbPayload.source_ref === candidate.relativePath &&
        String(qdrantReadback?.id) === id;

      results.push({
        postgresId: id,
        status: readbackPass ? 'APPLIED_AND_VERIFIED' : 'PARTIAL_REPAIR_READBACK_FAILED',
        pgNeedsWrite,
        qdrantNeedsWrite,
        comparison,
      });
      processed += 1;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      results.push({ postgresId: id, status: 'ERROR', reason: error instanceof Error ? error.message : String(error) });
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}

const statusCounts = {};
for (const row of results) statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
const receiptCore = {
  schema: 'atlas.null-content-hash-metadata-repair-receipt.v1',
  generatedAt: new Date().toISOString(),
  mode: APPLY ? 'APPLY' : 'DRY_RUN',
  manifestPath: MANIFEST_PATH,
  manifestChecksum: manifest.checksum,
  expectedManifestChecksum: EXPECTED_CHECKSUM ?? null,
  manifestRows: manifest.rows.length,
  attemptedRows: Math.min(manifest.rows.length, LIMIT),
  processedRows: processed,
  collection: COLLECTION,
  vectorName: VECTOR_NAME,
  dimension: DIMENSION,
  thresholds: { minCosine: MIN_COSINE, maxAbsDelta: MAX_ABS_DELTA },
  statusCounts,
  invariants: {
    qdrantPointIdWrites: false,
    qdrantVectorWrites: false,
    reembedding: false,
    chunkIdSynthesis: false,
    payloadOperation: 'SET_ONLY',
  },
  rows: results,
};
const receipt = { ...receiptCore, receiptSha256: sha256(Buffer.from(JSON.stringify(receiptCore), 'utf8')) };
await mkdir(path.dirname(RECEIPT_PATH), { recursive: true });
await writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  mode: receipt.mode,
  manifestChecksum: receipt.manifestChecksum,
  statusCounts,
  receipt: RECEIPT_PATH,
  invariants: receipt.invariants,
}, null, 2));

if (results.some((row) => row.status === 'ERROR' || row.status === 'PARTIAL_REPAIR_READBACK_FAILED')) process.exitCode = 2;
