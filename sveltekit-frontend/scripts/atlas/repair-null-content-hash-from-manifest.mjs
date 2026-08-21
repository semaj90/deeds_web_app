#!/usr/bin/env node
/**
 * repair-null-content-hash-from-manifest.mjs
 *
 * Full-population companion to the read-only audit script
 * `scripts/atlas/audit-null-content-hash-repairability.mjs` (READ THAT FIRST —
 * this script reuses its classify()/vectorDiff()/parseVector()/sha16()/digest()
 * logic verbatim, adapted only to iterate ALL rows with content_hash IS NULL
 * instead of a 250-row sample).
 *
 * Background: codebase_chunk_index has 6,945 rows with content_hash IS NULL.
 * The audit script classified a 250-row sample and wrote a checksum-gated
 * manifest to docs/reports/null-content-hash-repairability.ndjson. This
 * script re-runs that same classification over the FULL population and
 * writes a full manifest to docs/reports/null-content-hash-repairability-full.ndjson,
 * plus a JSON summary with counts per classification.
 *
 * Modes:
 *   (default)        Full-population classification + manifest write.
 *                     READ-ONLY: SELECT queries against Postgres + read-only
 *                     POST /points (with_vector/with_payload) against Qdrant.
 *                     Zero Postgres writes. Zero Qdrant writes.
 *
 *   --apply           Applies the repair UPDATE to Postgres for rows classified
 *                     METADATA_REPAIR_CANDIDATE in the full manifest:
 *                       UPDATE codebase_chunk_index
 *                       SET content_hash = $computedContentHash, chunk_id = $proposedChunkId
 *                       WHERE id = ANY($1::uuid[])
 *                     batched over manifest row IDs. GATED: refuses to run
 *                     unless --confirm-checksum=<manifestChecksum> is passed and
 *                     matches the checksum recomputed from the manifest rows
 *                     at apply time (re-reads the manifest file fresh — does not
 *                     trust an in-memory value from a prior run). This mirrors
 *                     the checksum-gated design described in the audit script's
 *                     header: "A later repair command must consume a reviewed
 *                     checksum-gated manifest ... must require the reviewed
 *                     manifest checksum and re-read every affected row/point
 *                     before mutation."
 *
 * Usage:
 *   node scripts/atlas/repair-null-content-hash-from-manifest.mjs
 *     -> full-population classification + manifest (read-only, default)
 *
 *   node scripts/atlas/repair-null-content-hash-from-manifest.mjs --apply --confirm-checksum=<sha256>
 *     -> applies the UPDATE for METADATA_REPAIR_CANDIDATE rows in the full
 *        manifest, only if <sha256> matches the manifest's own checksum.
 *
 * Env overrides (same names as the audit script where applicable):
 *   QDRANT_COLLECTION_V2 (default codebase_chunks_768_v2)
 *   QDRANT_URL (default http://127.0.0.1:6333)
 *   DATABASE_URL
 *   NULL_HASH_VECTOR_TOLERANCE (default 1e-5)
 *   NULL_HASH_REPAIR_BATCH_SIZE (default 500) - Qdrant point-read batch size
 *   NULL_HASH_REPAIR_UPDATE_BATCH_SIZE (default 500) - Postgres UPDATE batch size (apply mode only)
 *   NULL_HASH_AUDIT_REPORT_DIR (default docs/reports)
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const HERE = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(HERE, '../../../.env') });
dotenv.config({ path: resolve(HERE, '../../.env') });

const APPLY = process.argv.includes('--apply');
const CONFIRM_CHECKSUM_ARG = process.argv.find((a) => a.startsWith('--confirm-checksum='));
const CONFIRM_CHECKSUM = CONFIRM_CHECKSUM_ARG ? CONFIRM_CHECKSUM_ARG.split('=').slice(1).join('=') : null;

const COLLECTION = process.env.QDRANT_COLLECTION_V2 ?? 'codebase_chunks_768_v2';
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const VECTOR_TOLERANCE = Number(process.env.NULL_HASH_VECTOR_TOLERANCE ?? 1e-5);
const BATCH_SIZE = Math.max(1, Number(process.env.NULL_HASH_REPAIR_BATCH_SIZE ?? 500));
const UPDATE_BATCH_SIZE = Math.max(1, Number(process.env.NULL_HASH_REPAIR_UPDATE_BATCH_SIZE ?? 500));
const REPORT_DIR = process.env.NULL_HASH_AUDIT_REPORT_DIR ?? 'docs/reports';
const REPORT_JSON = path.join(REPORT_DIR, 'null-content-hash-repairability-full.json');
const REPORT_MD = path.join(REPORT_DIR, 'null-content-hash-repairability-full.md');
const MANIFEST = path.join(REPORT_DIR, 'null-content-hash-repairability-full.ndjson');

if (!databaseUrlValid(DATABASE_URL)) {
  console.error('DATABASE_URL is not set or invalid.');
  process.exit(1);
}
function databaseUrlValid(url) {
  try {
    return Boolean(url) && Boolean(new URL(url));
  } catch {
    return false;
  }
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

// ---------------------------------------------------------------------------
// Reused verbatim (adapted only where noted) from
// scripts/atlas/audit-null-content-hash-repairability.mjs
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Full-population classification pass (paged, not a fixed sample)
// ---------------------------------------------------------------------------

async function classifyFullPopulation() {
  const totalResult = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM codebase_chunk_index
    WHERE content_hash IS NULL
  `);
  const totalNullHashRows = totalResult.rows[0]?.n ?? 0;

  const counts = {};
  const allRows = [];
  let offset = 0;

  for (;;) {
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
    `, [offset, BATCH_SIZE]);

    if (result.rows.length === 0) break;

    const ids = result.rows.map((row) => row.id);
    const pointMap = await fetchQdrantPoints(ids);

    for (const row of result.rows) {
      const point = pointMap.get(row.id) ?? null;
      const decision = classify(row, point);
      counts[decision.classification] = (counts[decision.classification] ?? 0) + 1;
      const computedHash = typeof row.content === 'string' && row.content.length > 0 ? sha16(row.content) : null;
      const payload = point?.payload ?? {};
      allRows.push({
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
      });
    }

    offset += result.rows.length;
    console.error(`[classify] processed ${offset}/${totalNullHashRows} rows...`);

    if (result.rows.length < BATCH_SIZE) break;
  }

  return { totalNullHashRows, counts, rows: allRows };
}

function buildManifestRows(rows) {
  return rows
    .filter((row) => row.repairable)
    .map((row) => ({
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
}

async function runClassifyMode() {
  mkdirSync(REPORT_DIR, { recursive: true });

  const { totalNullHashRows, counts, rows } = await classifyFullPopulation();
  const manifestRows = buildManifestRows(rows);
  const manifestChecksum = digest(manifestRows);

  const report = {
    schema: 'atlas.null-content-hash-repairability-audit-full.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    collection: COLLECTION,
    totalNullHashRows,
    sampleObserved: rows.length,
    vectorTolerance: VECTOR_TOLERANCE,
    counts,
    metadataRepairCandidates: manifestRows.length,
    reindexOrManualReviewRequired: rows.length - manifestRows.length,
    manifestChecksum,
    mutationAuthorized: false,
  };

  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(
    MANIFEST,
    manifestRows.map((row) => JSON.stringify(row)).join('\n') + (manifestRows.length ? '\n' : ''),
  );

  const md = [
    '# Null content-hash repairability audit — FULL POPULATION',
    '',
    `- Status: **READ_ONLY**`,
    `- Collection: \`${COLLECTION}\``,
    `- Total null-hash rows: **${totalNullHashRows}**`,
    `- Rows classified: **${rows.length}**`,
    `- Metadata repair candidates: **${manifestRows.length}**`,
    `- Reindex/manual review required: **${rows.length - manifestRows.length}**`,
    `- Manifest checksum: \`${manifestChecksum}\``,
    '',
    '## Classification counts',
    '',
    ...Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `- ${key}: ${value}`),
    '',
    'No Postgres or Qdrant writes were performed. Apply mode requires --apply plus',
    '--confirm-checksum=<manifestChecksum> matching the checksum above, recomputed',
    'fresh from the manifest file at apply time.',
    '',
  ].join('\n');
  writeFileSync(REPORT_MD, md);

  console.log(JSON.stringify({
    status: 'READ_ONLY_FULL_AUDIT_COMPLETE',
    totalNullHashRows,
    rowsClassified: rows.length,
    counts,
    metadataRepairCandidates: manifestRows.length,
    reindexOrManualReviewRequired: rows.length - manifestRows.length,
    manifestChecksum,
    reportJson: REPORT_JSON,
    reportMd: REPORT_MD,
    manifest: MANIFEST,
  }, null, 2));
}

// ---------------------------------------------------------------------------
// Apply mode — checksum-gated, off by default
// ---------------------------------------------------------------------------

async function runApplyMode() {
  if (!existsSync(MANIFEST)) {
    console.error(`Manifest not found at ${MANIFEST}. Run the script without --apply first to generate it.`);
    process.exit(1);
  }
  if (!CONFIRM_CHECKSUM) {
    console.error('Refusing to apply: --confirm-checksum=<manifestChecksum> is required.');
    process.exit(1);
  }

  const manifestText = readFileSync(MANIFEST, 'utf8');
  const manifestRows = manifestText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const recomputedChecksum = digest(manifestRows);
  if (recomputedChecksum !== CONFIRM_CHECKSUM) {
    console.error(`Checksum mismatch. Manifest checksum is ${recomputedChecksum}, but --confirm-checksum=${CONFIRM_CHECKSUM} was passed. Refusing to apply.`);
    process.exit(1);
  }

  console.log(`Checksum confirmed (${recomputedChecksum}). Applying repair to ${manifestRows.length} rows in batches of ${UPDATE_BATCH_SIZE}...`);

  let totalUpdated = 0;
  for (let i = 0; i < manifestRows.length; i += UPDATE_BATCH_SIZE) {
    const batch = manifestRows.slice(i, i + UPDATE_BATCH_SIZE);
    for (const row of batch) {
      if (!row.postgresId || !row.computedContentHash || !row.proposedChunkId) {
        console.error(`Skipping row with missing fields: ${JSON.stringify(row)}`);
        continue;
      }
    }
    const ids = batch.map((row) => row.postgresId);
    const hashes = batch.map((row) => row.computedContentHash);
    const chunkIds = batch.map((row) => row.proposedChunkId);

    // Batched UPDATE using unnest to pair id/hash/chunkId positionally.
    const result = await pool.query(
      `UPDATE codebase_chunk_index AS c
       SET content_hash = u.computed_hash,
           chunk_id = u.proposed_chunk_id
       FROM (
         SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[])
           AS t(id, computed_hash, proposed_chunk_id)
       ) AS u
       WHERE c.id = u.id
         AND c.content_hash IS NULL`,
      [ids, hashes, chunkIds],
    );
    totalUpdated += result.rowCount ?? 0;
    console.error(`[apply] batch ${Math.floor(i / UPDATE_BATCH_SIZE) + 1}: updated ${result.rowCount} rows (running total ${totalUpdated})`);
  }

  console.log(JSON.stringify({
    status: 'APPLY_COMPLETE',
    manifestChecksum: recomputedChecksum,
    manifestRows: manifestRows.length,
    totalUpdated,
  }, null, 2));
}

async function main() {
  if (APPLY) {
    await runApplyMode();
  } else {
    await runClassifyMode();
  }
}

try {
  await main();
} finally {
  await pool.end();
}
