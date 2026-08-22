#!/usr/bin/env node
/**
 * Read-only audit for codebase_chunk_index rows where content_hash IS NULL.
 *
 * Purpose:
 *   Determine whether rows projected to codebase_chunks_768_v2 with payload
 *   qdrant_point_id like `card:<path>:null` can be repaired as metadata-only,
 *   or whether they require reindex/re-embedding.
 *
 * This script performs no Postgres or Qdrant writes.
 *
 * Strong repair candidate requirements:
 *   1. Postgres row has non-empty authoritative stored `content`.
 *   2. sha256(content).slice(0,16) is reproducible.
 *   3. Postgres row has a 768-dim finite content_embedding.
 *   4. Qdrant point with id == codebase_chunk_index.id exists.
 *   5. Qdrant vector is 768-dim finite.
 *   6. Qdrant payload postgres_id, when present, equals the row UUID.
 *   7. Qdrant payload source_ref/path does not contradict relative_path.
 *   8. Qdrant vector matches the Postgres embedding within a tight numeric
 *      tolerance after float serialization.
 *
 * Classification:
 *   METADATA_REPAIR_CANDIDATE
 *   MISSING_SOURCE_CONTENT
 *   MISSING_POSTGRES_EMBEDDING
 *   INVALID_POSTGRES_EMBEDDING
 *   MISSING_QDRANT_POINT
 *   INVALID_QDRANT_VECTOR
 *   IDENTITY_CONFLICT
 *   VECTOR_MISMATCH
 *
 * No apply mode exists by design. A later repair command must consume a
 * reviewed checksum-gated manifest produced by this audit.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..');

const COLLECTION = process.env.QDRANT_COLLECTION_V2 ?? 'codebase_chunks_768_v2';
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
const SAMPLE = Math.max(1, Number(process.env.NULL_HASH_AUDIT_SAMPLE ?? 250));
const OFFSET = Math.max(0, Number(process.env.NULL_HASH_AUDIT_OFFSET ?? 0));
const VECTOR_TOLERANCE = Number(process.env.NULL_HASH_VECTOR_TOLERANCE ?? 1e-5);
const REPORT_DIR = path.resolve(REPO_ROOT, process.env.NULL_HASH_AUDIT_REPORT_DIR ?? 'docs/reports');
const REPORT_JSON = path.join(REPORT_DIR, 'null-content-hash-repairability.json');
const REPORT_MD = path.join(REPORT_DIR, 'null-content-hash-repairability.md');
const MANIFEST = path.join(REPORT_DIR, 'null-content-hash-repairability.ndjson');

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

function sha16(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value) {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text.startsWith('[') || !text.endsWith(']')) return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    return null;
  }
}

function vectorValid(v) {
  return Array.isArray(v) && v.length === 768 && v.every(Number.isFinite);
}

function vectorDiff(a, b) {
  if (!vectorValid(a) || !vectorValid(b)) return { maxAbsDiff: null, cosine: null };
  let maxAbsDiff = 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    const d = Math.abs(av - bv);
    if (d > maxAbsDiff) maxAbsDiff = d;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return { maxAbsDiff, cosine: denom > 0 ? dot / denom : null };
}

async function fetchQdrantPoints(ids) {
  if (ids.length === 0) return new Map();
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, with_payload: true, with_vector: true }),
  });
  if (!response.ok) {
    throw new Error(`QDRANT_POINT_READ_FAILED:${response.status}:${await response.text()}`);
  }
  const json = await response.json();
  const points = json.result ?? [];
  return new Map(points.map((point) => [String(point.id), point]));
}

function qdrantVector(point) {
  const raw = point?.vector;
  if (Array.isArray(raw)) return raw.map(Number);
  if (raw && typeof raw === 'object') {
    const candidate = raw.content ?? raw[Object.keys(raw)[0]];
    return Array.isArray(candidate) ? candidate.map(Number) : null;
  }
  return null;
}

function payloadPath(payload) {
  return payload?.source_ref ?? payload?.sourceRef ?? payload?.file_path ?? payload?.relative_path ?? null;
}

function classify(row, point) {
  const content = typeof row.content === 'string' ? row.content : '';
  const pgVector = parseVector(row.embedding_text);

  if (!content.length) {
    return { classification: 'MISSING_SOURCE_CONTENT', repairable: false, reason: 'Postgres row has no stored chunk content.' };
  }
  if (!row.embedding_text) {
    return { classification: 'MISSING_POSTGRES_EMBEDDING', repairable: false, reason: 'Postgres content_embedding is absent.' };
  }
  if (!vectorValid(pgVector)) {
    return { classification: 'INVALID_POSTGRES_EMBEDDING', repairable: false, reason: 'Postgres content_embedding is not finite 768d.' };
  }
  if (!point) {
    return { classification: 'MISSING_QDRANT_POINT', repairable: false, reason: 'No Qdrant point exists with id equal to the Postgres row UUID.' };
  }

  const qVector = qdrantVector(point);
  if (!vectorValid(qVector)) {
    return { classification: 'INVALID_QDRANT_VECTOR', repairable: false, reason: 'Qdrant point vector is not finite 768d.' };
  }

  const payload = point.payload ?? {};
  const payloadPgId = payload.postgres_id == null ? null : String(payload.postgres_id);
  const qPath = payloadPath(payload);
  const pathConflict = qPath != null && String(qPath) !== String(row.relative_path);
  const idConflict = payloadPgId != null && payloadPgId !== String(row.id);
  if (pathConflict || idConflict) {
    return {
      classification: 'IDENTITY_CONFLICT',
      repairable: false,
      reason: `Qdrant payload contradicts Postgres identity: idConflict=${idConflict} pathConflict=${pathConflict}`,
    };
  }

  const comparison = vectorDiff(pgVector, qVector);
  if (comparison.maxAbsDiff == null || comparison.maxAbsDiff > VECTOR_TOLERANCE) {
    return {
      classification: 'VECTOR_MISMATCH',
      repairable: false,
      reason: `Qdrant vector does not match Postgres embedding within tolerance ${VECTOR_TOLERANCE}.`,
      comparison,
    };
  }

  return {
    classification: 'METADATA_REPAIR_CANDIDATE',
    repairable: true,
    reason: 'Stored content, Postgres embedding, Qdrant point identity, and Qdrant vector agree; metadata-only repair is plausible.',
    comparison,
  };
}

async function main() {
  mkdirSync(REPORT_DIR, { recursive: true });

  const totalResult = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM codebase_chunk_index
    WHERE content_hash IS NULL
  `);
  const totalNullHashRows = totalResult.rows[0]?.n ?? 0;

  const result = await pool.query(`
    SELECT
      id::text AS id,
      relative_path,
      content_hash,
      chunk_id,
      qdrant_id::text AS qdrant_id,
      content,
      content_embedding::text AS embedding_text,
      embedding_model,
      updated_at
    FROM codebase_chunk_index
    WHERE content_hash IS NULL
    ORDER BY id
    OFFSET $1
    LIMIT $2
  `, [OFFSET, SAMPLE]);

  const ids = result.rows.map((row) => row.id);
  const pointMap = await fetchQdrantPoints(ids);

  const counts = {};
  const rows = result.rows.map((row) => {
    const point = pointMap.get(row.id) ?? null;
    const decision = classify(row, point);
    counts[decision.classification] = (counts[decision.classification] ?? 0) + 1;
    const computedHash = typeof row.content === 'string' && row.content.length > 0 ? sha16(row.content) : null;
    const payload = point?.payload ?? {};
    return {
      id: row.id,
      relativePath: row.relative_path,
      existingContentHash: row.content_hash,
      computedContentHash: computedHash,
      proposedChunkId: computedHash ? `card:${row.relative_path}:${computedHash}` : null,
      existingChunkId: row.chunk_id,
      postgresQdrantId: row.qdrant_id,
      qdrantPointExists: Boolean(point),
      qdrantPointId: point ? String(point.id) : null,
      qdrantPayloadPointId: payload.qdrant_point_id ?? null,
      qdrantPayloadContentHash: payload.content_hash ?? null,
      qdrantPayloadSourceRef: payloadPath(payload),
      embeddingModel: row.embedding_model,
      classification: decision.classification,
      repairable: decision.repairable,
      reason: decision.reason,
      vectorMaxAbsDiff: decision.comparison?.maxAbsDiff ?? null,
      vectorCosine: decision.comparison?.cosine ?? null,
    };
  });

  const repairable = rows.filter((row) => row.repairable);
  const manifestRows = repairable.map((row) => ({
    schema: 'atlas.null-content-hash-repair-candidate.v1',
    postgresId: row.id,
    relativePath: row.relativePath,
    computedContentHash: row.computedContentHash,
    proposedChunkId: row.proposedChunkId,
    qdrantCollection: COLLECTION,
    qdrantPointId: row.qdrantPointId,
    expectedOldPayloadPointId: row.qdrantPayloadPointId,
    expectedOldPayloadContentHash: row.qdrantPayloadContentHash,
    vectorMaxAbsDiff: row.vectorMaxAbsDiff,
    vectorCosine: row.vectorCosine,
    canonicalWritesAuthorized: false,
  }));
  const manifestChecksum = digest(manifestRows);

  const report = {
    schema: 'atlas.null-content-hash-repairability-audit.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    collection: COLLECTION,
    totalNullHashRows,
    sampleOffset: OFFSET,
    sampleRequested: SAMPLE,
    sampleObserved: rows.length,
    vectorTolerance: VECTOR_TOLERANCE,
    counts,
    metadataRepairCandidates: repairable.length,
    reindexOrManualReviewRequired: rows.length - repairable.length,
    manifestChecksum,
    mutationAuthorized: false,
    rows,
  };

  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(MANIFEST, manifestRows.map((row) => JSON.stringify(row)).join('\n') + (manifestRows.length ? '\n' : ''));

  const md = [
    '# Null content-hash repairability audit',
    '',
    `- Status: **READ_ONLY**`,
    `- Collection: \`${COLLECTION}\``,
    `- Total null-hash rows: **${totalNullHashRows}**`,
    `- Sample: **${rows.length}** rows at offset ${OFFSET}`,
    `- Metadata repair candidates: **${repairable.length}**`,
    `- Reindex/manual review required: **${rows.length - repairable.length}**`,
    `- Manifest checksum: \`${manifestChecksum}\``,
    '',
    '## Classification counts',
    '',
    ...Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `- ${key}: ${value}`),
    '',
    'No Postgres or Qdrant writes were performed. A later repair command must require the reviewed manifest checksum and re-read every affected row/point before mutation.',
    '',
  ].join('\n');
  writeFileSync(REPORT_MD, md);

  console.log(JSON.stringify({
    status: 'READ_ONLY_AUDIT_COMPLETE',
    totalNullHashRows,
    sampleObserved: rows.length,
    counts,
    metadataRepairCandidates: repairable.length,
    reindexOrManualReviewRequired: rows.length - repairable.length,
    manifestChecksum,
    reportJson: REPORT_JSON,
    reportMd: REPORT_MD,
    manifest: MANIFEST,
  }, null, 2));
}

try {
  await main();
} finally {
  await pool.end();
}
