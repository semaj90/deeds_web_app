#!/usr/bin/env node
/**
 * backfill-rerank-scores.mjs
 *
 * gap_synth_005: Batch aggregate rerank scores from Postgres chunk_hit_log
 * and write them back to Qdrant as avg_rerank_score + rerank_hit_count payload
 * fields on codebase_chunks_768 points.
 *
 * This creates the feedback loop for the reranker:
 *   chunk_hit_log (per-query rerank scores)
 *     → aggregate by chunk_id
 *     → Qdrant payload { avg_rerank_score, rerank_hit_count }
 *     → ACE can boost chunks with high historical rerank scores
 *
 * Usage:
 *   node scripts/wiki/backfill-rerank-scores.mjs
 *   node scripts/wiki/backfill-rerank-scores.mjs --dry-run
 *   node scripts/wiki/backfill-rerank-scores.mjs --min-hits=5 --limit=10000
 *
 * Environment:
 *   DATABASE_URL  — Postgres connection string
 *   QDRANT_URL    — default http://127.0.0.1:6333
 *   QDRANT_COLLECTION — default codebase_chunks_768
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const minHitsArg = args.find(a => a.startsWith('--min-hits='));
const limitArg   = args.find(a => a.startsWith('--limit='));
const MIN_HITS   = minHitsArg ? parseInt(minHitsArg.slice(11), 10) : 3;
const LIMIT      = limitArg   ? parseInt(limitArg.slice(8),    10) : 20000;

try {
  const { config } = await import('dotenv');
  config({ path: resolve(__dirname, '../../.env') });
} catch { /* dotenv optional */ }

const QDRANT_URL  = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const COLLECTION  = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('[rerank-backfill] DATABASE_URL is required');
  process.exit(1);
}

console.log(`[rerank-backfill] min-hits=${MIN_HITS} limit=${LIMIT}${DRY_RUN ? ' DRY RUN' : ''}`);
console.log(`[rerank-backfill] Qdrant: ${QDRANT_URL}/${COLLECTION}`);

// ── 1. Aggregate rerank scores from Postgres ──────────────────────────────────

let rows;
try {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  const result = await pool.query(
    `SELECT
       chunk_id,
       COUNT(*)::int                                          AS hit_count,
       AVG(COALESCE(rerank_score, score))::real              AS avg_rerank,
       MAX(COALESCE(rerank_score, score))::real              AS max_rerank,
       AVG(score)::real                                      AS avg_raw_score,
       MIN(created_at)                                       AS first_seen,
       MAX(created_at)                                       AS last_seen
     FROM   chunk_hit_log
     WHERE  chunk_id IS NOT NULL
     GROUP  BY chunk_id
     HAVING COUNT(*) >= $1
     ORDER  BY hit_count DESC
     LIMIT  $2`,
    [MIN_HITS, LIMIT]
  );
  rows = result.rows;
  await pool.end();
} catch (err) {
  console.error('[rerank-backfill] Postgres query failed:', err.message);
  process.exit(1);
}

console.log(`[rerank-backfill] ${rows.length} chunk_ids with ≥${MIN_HITS} hits`);
if (rows.length === 0) {
  console.log('[rerank-backfill] Nothing to backfill — exiting.');
  process.exit(0);
}

if (DRY_RUN) {
  const sample = rows.slice(0, 5);
  console.log('[rerank-backfill] Sample (dry run):');
  for (const r of sample) {
    console.log(`  chunk_id=${r.chunk_id}  hits=${r.hit_count}  avg_rerank=${r.avg_rerank?.toFixed(4)}  max=${r.max_rerank?.toFixed(4)}`);
  }
  process.exit(0);
}

// ── 2. Write back to Qdrant in batches of 200 ────────────────────────────────

const BATCH = 200;
let written = 0;
let failed  = 0;
const t0 = Date.now();

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);

  // Group by rounded avg_rerank to minimize HTTP calls
  // Actually Qdrant set_payload supports per-point payload updates via filter
  // but the most reliable way is one call per distinct payload value or
  // using the points array with individual payloads via the batch endpoint.
  // We use the filter-by-id approach with a separate payload per unique score band.
  // Since each chunk has a unique avg_rerank, we batch by using the points array
  // with a single payload dict + points list — this only works when all share
  // the same payload key. We'll POST individually per chunk.

  // Use Qdrant's recommended batch: POST /points/payload with points array
  // Qdrant does NOT support per-point different payloads in a single call,
  // so we group by score buckets to reduce HTTP calls (round to 3 decimal places).
  const byScore = new Map();
  for (const r of batch) {
    const key = JSON.stringify({
      avg_rerank_score: Math.round(r.avg_rerank * 1000) / 1000,
      rerank_hit_count: r.hit_count,
      max_rerank_score: Math.round(r.max_rerank * 1000) / 1000,
    });
    const ids = byScore.get(key) ?? [];
    ids.push(r.chunk_id);
    byScore.set(key, ids);
  }

  for (const [payloadStr, ids] of byScore) {
    const payload = JSON.parse(payloadStr);
    try {
      const res = await fetch(
        `${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points/payload`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload, points: ids }),
        }
      );
      if (res.ok) {
        written += ids.length;
      } else {
        const txt = await res.text().catch(() => '');
        console.warn(`[rerank-backfill] Qdrant ${res.status} for ${ids.length} points: ${txt.slice(0, 120)}`);
        failed += ids.length;
      }
    } catch (err) {
      console.warn(`[rerank-backfill] fetch error: ${err.message}`);
      failed += ids.length;
    }
  }

  const pct = Math.round(((i + batch.length) / rows.length) * 100);
  if (pct % 20 === 0 || i + BATCH >= rows.length) {
    process.stdout.write(`\r[rerank-backfill] ${pct}% (${written} written, ${failed} failed)`);
  }
}

const durationMs = Date.now() - t0;
console.log(`\n[rerank-backfill] ✓ ${written} points updated, ${failed} failed in ${durationMs}ms`);
if (failed > 0) process.exit(1);
