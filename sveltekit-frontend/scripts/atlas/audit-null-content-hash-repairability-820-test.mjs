#!/usr/bin/env node
/**
 * audit-null-content-hash-repairability.mjs
 *
 * READ-ONLY. Classifies the 6,908 codebase_chunk_index rows that have
 * chunk_id IS NULL AND content_hash IS NULL (the residual left after
 * backfill-chunk-id-from-content-hash.mjs fixed the other 28,667).
 *
 * Hypothesis tested (real, not assumed): the live Qdrant payload's
 * qdrant_point_id for these rows is the literal string "card:{path}:null"
 * (confirmed 20/20 sampled this session). Two competing explanations:
 *   (a) the original semantic indexer's content-hashing genuinely failed for
 *       these specific chunks (semantic corruption — would need re-embedding)
 *   (b) a later Qdrant-v2 backfill/projection writer built
 *       `card:${relative_path}:${content_hash}` from a Postgres row where
 *       content_hash was already SQL NULL, with no NOT NULL guard, so
 *       JavaScript template-literal interpolation silently produced the
 *       string "null" (metadata-only gap — Postgres content/embedding/Qdrant
 *       vector may all still be intact and correct).
 *
 * This script does not assume which explanation is correct — it checks, per
 * row, whether Postgres content, Postgres embedding, the live Qdrant point,
 * and the Qdrant vector all agree. Zero writes to Postgres or Qdrant.
 *
 * Usage:
 *   cd sveltekit-frontend
 *   node scripts/atlas/audit-null-content-hash-repairability.mjs
 *   NULL_HASH_AUDIT_SAMPLE=250 node scripts/atlas/audit-null-content-hash-repairability.mjs
 *
 * Output: docs/reports/null-content-hash-repairability.json (+ .md summary)
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(HERE, '../../../.env') });
dotenv.config({ path: resolve(HERE, '../../.env') });

const SAMPLE = Math.max(1, Number(process.env.NULL_HASH_AUDIT_SAMPLE ?? 100));
const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const COLLECTION = 'codebase_chunks_768';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl || !URL.canParse(databaseUrl)) {
  console.error('DATABASE_URL is not set or invalid.');
  process.exit(1);
}
const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000 });

function sha256Slice16(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function isFinite768(vec) {
  return Array.isArray(vec) && vec.length === 768 && vec.every((v) => Number.isFinite(v));
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

async function qdrantFindByPostgresId(postgresId) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter: { must: [{ key: 'postgres_id', match: { value: postgresId } }] },
      limit: 1,
      with_payload: true,
      with_vector: true,
    }),
  });
  if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status}`);
  const j = await res.json();
  return j.result?.points?.[0] ?? null;
}

async function classifyRow(row) {
  // 1. Source content present?
  if (!row.content || !row.content.trim()) {
    return { ...row, classification: 'MISSING_SOURCE_CONTENT' };
  }

  const recomputedHash = sha256Slice16(row.content);

  // 2. Postgres embedding present, finite, 768-dim?
  // pgvector columns come back from node-postgres as a "[0.1,0.2,...]" string,
  // not a parsed array — must parse before use.
  if (!row.content_embedding_768) {
    return { ...row, classification: 'MISSING_POSTGRES_EMBEDDING', recomputedHash };
  }
  let pgVec;
  try {
    pgVec = JSON.parse(row.content_embedding_768);
  } catch {
    return { ...row, classification: 'INVALID_POSTGRES_EMBEDDING', recomputedHash };
  }
  if (!isFinite768(pgVec)) {
    return { ...row, classification: 'INVALID_POSTGRES_EMBEDDING', recomputedHash };
  }

  // 3. Live Qdrant point exists (via postgres_id, the confirmed-reliable join key)?
  let point;
  try {
    point = await qdrantFindByPostgresId(row.id);
  } catch (err) {
    return { ...row, classification: 'MISSING_QDRANT_POINT', recomputedHash, error: err.message };
  }
  if (!point) {
    return { ...row, classification: 'MISSING_QDRANT_POINT', recomputedHash };
  }

  // 4. Identity agreement: Qdrant payload's source_ref matches Postgres source_ref
  const payload = point.payload ?? {};
  if (payload.source_ref !== row.source_ref) {
    return {
      ...row,
      classification: 'IDENTITY_CONFLICT',
      recomputedHash,
      qdrantSourceRef: payload.source_ref,
    };
  }

  // 5. Qdrant vector present, finite, 768-dim?
  const qVec = point.vector?.content ?? point.vector;
  if (!isFinite768(qVec)) {
    return { ...row, classification: 'INVALID_QDRANT_VECTOR', recomputedHash };
  }

  // 6. Postgres embedding vs Qdrant vector agreement
  const similarity = cosine(pgVec, qVec);
  if (similarity < 0.999) {
    return { ...row, classification: 'VECTOR_MISMATCH', recomputedHash, similarity };
  }

  return {
    ...row,
    classification: 'METADATA_REPAIR_CANDIDATE',
    recomputedHash,
    proposedChunkId: `card:${row.source_ref}:${recomputedHash}`,
    similarity,
  };
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, source_ref, content, content_embedding_768
     FROM codebase_chunk_index
     WHERE chunk_id IS NULL AND content_hash IS NULL AND content_embedding_768 IS NOT NULL
     ORDER BY random()
     LIMIT $1`,
    [SAMPLE],
  );

  console.log(`Sampled ${rows.length} rows (target ${SAMPLE}). Classifying (read-only)...`);

  const results = [];
  const CONCURRENCY = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const idx = cursor++;
      results.push(await classifyRow(rows[idx]));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const counts = {};
  for (const r of results) counts[r.classification] = (counts[r.classification] ?? 0) + 1;

  console.log();
  console.log('=== Classification counts ===');
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  const outDir = resolve(HERE, '../../../docs/reports');
  await mkdir(outDir, { recursive: true });

  const jsonPath = resolve(outDir, 'null-content-hash-repairability.json');
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        sample_requested: SAMPLE,
        sample_actual: rows.length,
        counts,
        rows: results.map((r) => ({
          id: r.id,
          source_ref: r.source_ref,
          classification: r.classification,
          recomputedHash: r.recomputedHash ?? null,
          proposedChunkId: r.proposedChunkId ?? null,
          similarity: r.similarity ?? null,
        })),
      },
      null,
      2,
    ),
  );

  const mdLines = [
    '# NULL content_hash Repairability Audit (read-only)',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Sample: ${rows.length} / ${SAMPLE} requested`,
    '',
    '## Classification counts',
    '',
    ...Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- **${k}**: ${v}`),
  ];
  const mdPath = resolve(outDir, 'null-content-hash-repairability.md');
  await writeFile(mdPath, mdLines.join('\n') + '\n');

  console.log();
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
