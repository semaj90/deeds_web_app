#!/usr/bin/env node
/**
 * Read-only repairability audit for codebase_chunk_index rows whose
 * content_hash is NULL while a Qdrant v2 projection may already exist.
 *
 * Purpose:
 *   Distinguish metadata-only loss from source/vector/identity corruption
 *   before any historical backfill is authorized.
 *
 * This script performs NO Postgres, Qdrant, Valkey, or filesystem mutations
 * other than writing local report artifacts under docs/reports.
 *
 * Classification precedence:
 *   MISSING_SOURCE_CONTENT
 *   MISSING_POSTGRES_EMBEDDING
 *   INVALID_POSTGRES_EMBEDDING
 *   MISSING_QDRANT_POINT
 *   INVALID_QDRANT_VECTOR
 *   IDENTITY_CONFLICT
 *   VECTOR_MISMATCH
 *   METADATA_REPAIR_CANDIDATE
 *
 * Usage (from sveltekit-frontend):
 *   node scripts/atlas/audit-null-content-hash-repairability.mjs
 *   NULL_HASH_AUDIT_SAMPLE=250 node scripts/atlas/audit-null-content-hash-repairability.mjs
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');
const REPORT_DIR = path.resolve(REPO_ROOT, 'docs/reports');
const JSON_PATH = path.resolve(REPORT_DIR, 'null-content-hash-repairability.json');
const MD_PATH = path.resolve(REPORT_DIR, 'null-content-hash-repairability.md');
const NDJSON_PATH = path.resolve(REPORT_DIR, 'null-content-hash-repairability.ndjson');

const COLLECTION = process.env.NULL_HASH_AUDIT_COLLECTION ?? 'codebase_chunks_768_v2';
const VECTOR_NAME = process.env.NULL_HASH_AUDIT_VECTOR ?? 'content';
const DIMENSION = Number(process.env.NULL_HASH_AUDIT_DIMENSION ?? '768');
const SAMPLE = Number(process.env.NULL_HASH_AUDIT_SAMPLE ?? '250');
const FETCH_BATCH = Number(process.env.NULL_HASH_AUDIT_FETCH_BATCH ?? '64');
const MIN_COSINE = Number(process.env.NULL_HASH_AUDIT_MIN_COSINE ?? '0.99999');
const MAX_ABS_DELTA = Number(process.env.NULL_HASH_AUDIT_MAX_ABS_DELTA ?? '0.001');
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^http:\/\/0\.0\.0\.0/, 'http://127.0.0.1');
const QDRANT_API_KEY = process.env.QDRANT_API_KEY ?? process.env.QDRANT__SERVICE__API_KEY ?? null;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!Number.isInteger(SAMPLE) || SAMPLE < 1 || SAMPLE > 10000) throw new Error('NULL_HASH_AUDIT_SAMPLE must be 1..10000');
if (!Number.isInteger(FETCH_BATCH) || FETCH_BATCH < 1 || FETCH_BATCH > 256) throw new Error('NULL_HASH_AUDIT_FETCH_BATCH must be 1..256');
if (!Number.isInteger(DIMENSION) || DIMENSION < 1) throw new Error('NULL_HASH_AUDIT_DIMENSION must be positive');

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function shortContentHash(text) {
  return sha256(text).slice(0, 16);
}

function parseVectorText(value) {
  if (value == null) return { ok: false, reason: 'MISSING' };
  if (typeof value !== 'string') return { ok: false, reason: `EXPECTED_TEXT_GOT_${typeof value}` };
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

function validateQdrantVector(point) {
  const raw = extractQdrantVector(point);
  if (!Array.isArray(raw)) return { ok: false, reason: 'MISSING_NAMED_VECTOR' };
  if (raw.length !== DIMENSION) return { ok: false, reason: `DIMENSION_${raw.length}` };
  const vector = raw.map(Number);
  if (vector.some((item) => !Number.isFinite(item))) return { ok: false, reason: 'NON_FINITE' };
  return { ok: true, vector };
}

function vectorComparison(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  let maxAbsDelta = 0;
  let sumAbsDelta = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    aa += av * av;
    bb += bv * bv;
    const delta = Math.abs(av - bv);
    maxAbsDelta = Math.max(maxAbsDelta, delta);
    sumAbsDelta += delta;
  }
  const denom = Math.sqrt(aa) * Math.sqrt(bb);
  const cosine = denom > 0 ? dot / denom : Number.NaN;
  return {
    cosine,
    maxAbsDelta,
    meanAbsDelta: sumAbsDelta / a.length,
    passes: Number.isFinite(cosine) && cosine >= MIN_COSINE && maxAbsDelta <= MAX_ABS_DELTA,
  };
}

function qdrantHeaders() {
  const headers = { 'content-type': 'application/json' };
  if (QDRANT_API_KEY) headers['api-key'] = QDRANT_API_KEY;
  return headers;
}

async function retrieveQdrantPoints(ids) {
  const response = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points`, {
    method: 'POST',
    headers: qdrantHeaders(),
    body: JSON.stringify({
      ids,
      with_payload: [
        'postgres_id', 'chunk_id', 'source_ref', 'relative_path', 'content_hash',
        'qdrant_point_id', 'representation_name', 'representation_id', 'projection_revision',
      ],
      with_vector: [VECTOR_NAME],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`QDRANT_RETRIEVE_FAILED_${response.status}: ${(await response.text()).slice(0, 500)}`);
  const body = await response.json();
  const points = Array.isArray(body?.result) ? body.result : [];
  return new Map(points.map((point) => [String(point.id), point]));
}

function identityCheck(row, point) {
  const payload = point?.payload ?? {};
  const conflicts = [];
  if (String(point.id) !== String(row.id)) conflicts.push(`point.id=${point.id} pg.id=${row.id}`);
  if (payload.postgres_id != null && String(payload.postgres_id) !== String(row.id)) conflicts.push(`payload.postgres_id=${payload.postgres_id}`);
  const payloadSource = payload.source_ref ?? payload.relative_path ?? null;
  if (payloadSource != null && String(payloadSource) !== String(row.relative_path)) conflicts.push(`payload.source_ref=${payloadSource}`);
  if (payload.chunk_id != null && row.chunk_id != null && String(payload.chunk_id) !== String(row.chunk_id)) conflicts.push(`payload.chunk_id=${payload.chunk_id}`);
  return { passes: conflicts.length === 0, conflicts };
}

function classify(row, point) {
  const sourceContentPresent = typeof row.content === 'string';
  const expectedContentHash = sourceContentPresent ? shortContentHash(row.content) : null;
  const pgVector = parseVectorText(row.embedding_text);
  const payload = point?.payload ?? null;
  const expectedQdrantPointMetadata = expectedContentHash == null ? null : `card:${row.relative_path}:${expectedContentHash}`;

  const base = {
    postgresId: String(row.id),
    relativePath: row.relative_path ?? null,
    chunkId: row.chunk_id ?? null,
    storedContentHash: row.content_hash ?? null,
    expectedContentHash,
    expectedQdrantPointMetadata,
    qdrantActualPointId: point ? String(point.id) : null,
    qdrantPayloadQdrantPointId: payload?.qdrant_point_id ?? null,
    qdrantPayloadContentHash: payload?.content_hash ?? null,
    qdrantPayloadSourceRef: payload?.source_ref ?? payload?.relative_path ?? null,
    sourceContentBytes: sourceContentPresent ? Buffer.byteLength(row.content, 'utf8') : null,
    postgresEmbeddingPresent: row.embedding_text != null,
    postgresEmbeddingValid: pgVector.ok,
    postgresEmbeddingIssue: pgVector.ok ? null : pgVector.reason,
    qdrantPointPresent: Boolean(point),
    vectorComparison: null,
    identityConflicts: [],
    metadataRepair: null,
  };

  if (!sourceContentPresent) return { ...base, classification: 'MISSING_SOURCE_CONTENT' };
  if (row.embedding_text == null) return { ...base, classification: 'MISSING_POSTGRES_EMBEDDING' };
  if (!pgVector.ok) return { ...base, classification: 'INVALID_POSTGRES_EMBEDDING' };
  if (!point) return { ...base, classification: 'MISSING_QDRANT_POINT' };

  const qdrantVector = validateQdrantVector(point);
  if (!qdrantVector.ok) return { ...base, classification: 'INVALID_QDRANT_VECTOR', qdrantVectorIssue: qdrantVector.reason };

  const identity = identityCheck(row, point);
  if (!identity.passes) return { ...base, classification: 'IDENTITY_CONFLICT', identityConflicts: identity.conflicts };

  const comparison = vectorComparison(pgVector.vector, qdrantVector.vector);
  if (!comparison.passes) return { ...base, classification: 'VECTOR_MISMATCH', vectorComparison: comparison };

  return {
    ...base,
    classification: 'METADATA_REPAIR_CANDIDATE',
    vectorComparison: comparison,
    metadataRepair: {
      postgres: {
        content_hash: expectedContentHash,
        // chunk_id is intentionally NOT synthesized here. Existing chunk_id is
        // preserved; a later repair writer must prove any chunk-id derivation contract separately.
        chunk_id: row.chunk_id ?? null,
      },
      qdrantPayload: {
        content_hash: expectedContentHash,
        chunk_id: row.chunk_id ?? null,
        source_ref: row.relative_path,
        qdrant_point_id: expectedQdrantPointMetadata,
      },
      qdrantPointIdChanges: false,
      qdrantVectorChanges: false,
      reembeddingRequired: false,
    },
  };
}

function reportMarkdown(report) {
  const counts = Object.entries(report.classificationCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `| \`${name}\` | ${count} |`)
    .join('\n');
  return `# Null content hash repairability audit\n\n` +
    `Status: **${report.status}**  \n` +
    `Generated: ${report.generatedAt}  \n` +
    `Collection: \`${report.collection}\` / vector \`${report.vectorName}\` (${report.dimension}d)  \n` +
    `Rows sampled: ${report.sampledRows} of ${report.totalNullHashRows} null-hash rows  \n\n` +
    `## Classification\n\n| Class | Count |\n| --- | ---: |\n${counts}\n\n` +
    `## Safety boundary\n\n` +
    `This is a read-only classification proof. It does not update PostgreSQL, Qdrant, Valkey, embeddings, point IDs, or vectors. ` +
    `A \`METADATA_REPAIR_CANDIDATE\` means the sampled row has authoritative stored content, a finite ${report.dimension}d Postgres embedding, ` +
    `the Qdrant point exists at the same PostgreSQL UUID, identity payloads do not conflict, and Qdrant/Postgres vectors agree within the frozen tolerance. ` +
    `It is not authorization to mutate historical data.\n\n` +
    `Vector gate: cosine >= ${report.thresholds.minCosine}; max |delta| <= ${report.thresholds.maxAbsDelta}.\n`;
}

const startedAt = new Date().toISOString();
let rows = [];
let totalNullHashRows = 0;
try {
  const countResult = await pool.query(`SELECT count(*)::int AS count FROM codebase_chunk_index WHERE content_hash IS NULL`);
  totalNullHashRows = Number(countResult.rows[0]?.count ?? 0);

  const result = await pool.query(`
    SELECT
      id::text AS id,
      relative_path,
      chunk_id,
      content_hash,
      content,
      content_embedding::text AS embedding_text,
      embedding_model,
      updated_at
    FROM codebase_chunk_index
    WHERE content_hash IS NULL
    ORDER BY id
    LIMIT $1
  `, [SAMPLE]);
  rows = result.rows;
} finally {
  await pool.end();
}

const qdrantById = new Map();
for (let offset = 0; offset < rows.length; offset += FETCH_BATCH) {
  const ids = rows.slice(offset, offset + FETCH_BATCH).map((row) => String(row.id));
  const batch = await retrieveQdrantPoints(ids);
  for (const [id, point] of batch) qdrantById.set(id, point);
}

const results = rows.map((row) => classify(row, qdrantById.get(String(row.id)) ?? null));
const classificationCounts = {};
for (const row of results) classificationCounts[row.classification] = (classificationCounts[row.classification] ?? 0) + 1;

const candidateRows = results.filter((row) => row.classification === 'METADATA_REPAIR_CANDIDATE');
const candidateManifestCore = candidateRows.map((row) => ({
  postgresId: row.postgresId,
  relativePath: row.relativePath,
  chunkId: row.chunkId,
  expectedContentHash: row.expectedContentHash,
  expectedQdrantPointMetadata: row.expectedQdrantPointMetadata,
  qdrantActualPointId: row.qdrantActualPointId,
  postgresVectorQdrantVector: row.vectorComparison,
  proposedRepair: row.metadataRepair,
}));
const candidateManifestSha256 = sha256(candidateManifestCore.map((row) => JSON.stringify(row)).join('\n'));

const report = {
  schema: 'atlas.null-content-hash-repairability-audit.v1',
  status: candidateRows.length === results.length && results.length > 0 ? 'ALL_SAMPLED_METADATA_REPAIR_CANDIDATES' : 'MIXED_CLASSIFICATIONS',
  generatedAt: new Date().toISOString(),
  startedAt,
  collection: COLLECTION,
  vectorName: VECTOR_NAME,
  dimension: DIMENSION,
  sampleLimit: SAMPLE,
  sampledRows: results.length,
  totalNullHashRows,
  classificationCounts,
  thresholds: { minCosine: MIN_COSINE, maxAbsDelta: MAX_ABS_DELTA },
  candidateManifestSha256,
  mutationGuard: {
    postgresWrites: false,
    qdrantWrites: false,
    qdrantVectorWrites: false,
    qdrantPointIdWrites: false,
    valkeyWrites: false,
    reembedding: false,
  },
  classifications: results,
};

await mkdir(REPORT_DIR, { recursive: true });
await writeFile(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(MD_PATH, reportMarkdown(report), 'utf8');
await writeFile(NDJSON_PATH, `${candidateManifestCore.map((row) => JSON.stringify(row)).join('\n')}${candidateManifestCore.length ? '\n' : ''}`, 'utf8');

console.log(JSON.stringify({
  status: report.status,
  sampledRows: report.sampledRows,
  totalNullHashRows: report.totalNullHashRows,
  classificationCounts: report.classificationCounts,
  candidateManifestSha256,
  reports: { json: JSON_PATH, markdown: MD_PATH, ndjson: NDJSON_PATH },
  mutationGuard: report.mutationGuard,
}, null, 2));
