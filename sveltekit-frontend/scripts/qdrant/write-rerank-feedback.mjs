#!/usr/bin/env node
/**
 * write-rerank-feedback.mjs
 *
 * Reads chunk_hit_log rows from Postgres (7-day lookback), aggregates
 * per-chunk rerank breakdown scores, then writes an `ace_feedback` payload
 * block back to codebase_chunks_768 Qdrant payloads.
 *
 * Feedback loop: ACE retrieval quality → persistent Qdrant payload signal.
 * Future retrievals can boost chunks with high historical ace_feedback scores
 * without recomputing the full breakdown at query time.
 *
 * Usage:
 *   node scripts/qdrant/write-rerank-feedback.mjs
 *   node scripts/qdrant/write-rerank-feedback.mjs --dry-run
 *   node scripts/qdrant/write-rerank-feedback.mjs --lookback-days=14
 *   node scripts/qdrant/write-rerank-feedback.mjs --min-hits=3 --limit=2000
 *
 * Environment:
 *   DATABASE_URL  — Postgres connection string (required)
 *   QDRANT_URL    — default http://127.0.0.1:6333
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..', '..');

try { const { config } = await import('dotenv'); config({ path: resolve(ROOT, '.env') }); } catch {}

const argv       = process.argv.slice(2);
const DRY_RUN    = argv.includes('--dry-run');
const lbArg      = argv.find(a => a.startsWith('--lookback-days='));
const LOOKBACK   = lbArg ? parseInt(lbArg.split('=')[1], 10) : 7;
const mhArg      = argv.find(a => a.startsWith('--min-hits='));
const MIN_HITS   = mhArg ? parseInt(mhArg.split('=')[1], 10) : 2;
const limArg     = argv.find(a => a.startsWith('--limit='));
const ROW_LIMIT  = limArg ? parseInt(limArg.split('=')[1], 10) : 5000;
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.warn('[rerank-fb] DATABASE_URL not set — skipping (non-fatal)');
  process.exit(0);
}

console.log(`[rerank-fb] lookback=${LOOKBACK}d  min-hits=${MIN_HITS}  limit=${ROW_LIMIT}${DRY_RUN ? '  DRY RUN' : ''}`);

// ── Build ace_feedback payload from an aggregated row ────────────────────────

function buildFeedback(r) {
  const num = (v) => v != null ? Math.round(Number(v) * 10000) / 10000 : null;
  return {
    ace_feedback: {
      hit_count:       r.hit_count,
      avg_final:       num(r.avg_final),
      avg_semantic:    num(r.avg_semantic),
      avg_tag:         num(r.avg_tag),
      avg_cluster:     num(r.avg_cluster),
      avg_som:         num(r.avg_som),
      avg_pagerank:    num(r.avg_pagerank),
      avg_bow:         num(r.avg_bow),
      avg_paired_test: num(r.avg_paired_test),
      last_used_at:    r.last_used_at instanceof Date
        ? r.last_used_at.toISOString()
        : String(r.last_used_at ?? ''),
    },
  };
}

// ── 1. Query Postgres ─────────────────────────────────────────────────────────

let pg;
try {
  const { default: pkg } = await import('pg');
  pg = pkg;
} catch {
  console.error('[rerank-fb] ✗ pg not installed');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

let rows;
try {
  const { rows: qr } = await pool.query(
    `SELECT
       chunk_id,
       MAX(relative_path)                                           AS relative_path,
       COUNT(*)::int                                                AS hit_count,
       AVG((rerank_breakdown->>'final')::real)                     AS avg_final,
       AVG((rerank_breakdown->>'semantic')::real)                  AS avg_semantic,
       AVG((rerank_breakdown->>'qdrantTag')::real)                 AS avg_tag,
       AVG((rerank_breakdown->>'cluster')::real)                   AS avg_cluster,
       AVG((rerank_breakdown->>'som')::real)                       AS avg_som,
       AVG((rerank_breakdown->>'pagerank')::real)                  AS avg_pagerank,
       AVG((rerank_breakdown->>'bow')::real)                       AS avg_bow,
       AVG((rerank_breakdown->>'pairedTest')::real)                AS avg_paired_test,
       MAX(hit_at)                                                  AS last_used_at
     FROM chunk_hit_log
     WHERE rerank_breakdown IS NOT NULL
       AND chunk_id IS NOT NULL
       AND hit_at > now() - ($1::int || ' days')::interval
     GROUP BY chunk_id
     HAVING COUNT(*) >= $2
     ORDER BY COUNT(*) DESC
     LIMIT $3`,
    [LOOKBACK, MIN_HITS, ROW_LIMIT]
  );
  rows = qr;
  console.log(`[rerank-fb] ${rows.length} chunks with aggregated breakdown`);
} catch (err) {
  console.error('[rerank-fb] ✗ Postgres query failed:', err.message);
  await pool.end();
  process.exit(1);
}

await pool.end();

if (rows.length === 0) {
  console.log('[rerank-fb] Nothing to write (no qualifying hits in lookback window).');
  process.exit(0);
}

// ── 2. Dry-run preview ────────────────────────────────────────────────────────

if (DRY_RUN) {
  console.log('[rerank-fb] DRY RUN — sample (first 3):');
  for (const r of rows.slice(0, 3)) {
    const fb = buildFeedback(r);
    console.log(`  chunk=${r.chunk_id}  path=${r.relative_path ?? '?'}  hits=${r.hit_count}`);
    console.log(`  payload: ${JSON.stringify(fb)}`);
  }
  console.log(`[rerank-fb] Would patch ${rows.length} Qdrant payloads.`);
  process.exit(0);
}

// ── 3. Write to Qdrant in batches ─────────────────────────────────────────────

const BATCH = 50;
let patched = 0;
let failed  = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH);

  const results = await Promise.allSettled(
    slice.map(async (r) => {
      const payload = buildFeedback(r);
      const res = await fetch(
        `${QDRANT_URL}/collections/${COLLECTION}/points/payload`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload,
            filter: { must: [{ key: 'chunk_id', match: { value: r.chunk_id } }] },
          }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled') patched++;
    else failed++;
  }

  if (i > 0 && i % 500 === 0) {
    console.log(`[rerank-fb] Progress: ${i}/${rows.length}`);
  }
}

console.log(`[rerank-fb] ✓ ${patched} patched, ${failed} failed out of ${rows.length}`);
if (failed > 0) process.exit(1);
