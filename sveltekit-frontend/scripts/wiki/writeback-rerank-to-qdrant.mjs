#!/usr/bin/env node
/**
 * writeback-rerank-to-qdrant.mjs                             (gap_synth_005)
 *
 * Reads recent chunk_hit_log rows that have a rerank_breakdown JSON column,
 * averages each RerankBreakdown component per chunk_id, then POSTs the
 * averaged scores back to codebase_chunks_768 Qdrant payloads.
 *
 * This closes the feedback loop: ACE retrieval quality scores computed at
 * query time become persistent Qdrant payload fields, so future retrievals
 * can use pre-computed authority signals without repeating the math.
 *
 * Written fields on the Qdrant payload (all prefixed avg_rerank_*):
 *   avg_rerank_semantic   avg_rerank_qdrant_tag  avg_rerank_cluster
 *   avg_rerank_som        avg_rerank_pagerank    avg_rerank_bow
 *   avg_rerank_paired_test avg_rerank_same_agents_dir avg_rerank_final
 *   rerank_hit_count      rerank_last_written    (ISO timestamp)
 *
 * Usage:
 *   node scripts/wiki/writeback-rerank-to-qdrant.mjs
 *   node scripts/wiki/writeback-rerank-to-qdrant.mjs --dry-run
 *   node scripts/wiki/writeback-rerank-to-qdrant.mjs --lookback-hours=48
 *   node scripts/wiki/writeback-rerank-to-qdrant.mjs --min-hits=3
 *
 * Environment:
 *   DATABASE_URL  — Postgres connection string (required)
 *   QDRANT_URL    — default http://127.0.0.1:6333
 */

import { resolve, dirname } from 'node:path';
import { join }              from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath }    from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..', '..');

const args         = process.argv.slice(2);
const DRY_RUN      = args.includes('--dry-run');
const lbArg        = args.find(a => a.startsWith('--lookback-hours='));
const LOOKBACK_H   = lbArg ? parseInt(lbArg.split('=')[1], 10) : 24;
const mhArg        = args.find(a => a.startsWith('--min-hits='));
const MIN_HITS     = mhArg ? parseInt(mhArg.split('=')[1], 10) : 2;
const QDRANT_URL   = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION   = 'codebase_chunks_768';
const MANIFEST_DIR = join(ROOT, 'memory', 'docstore');

// Load .env
try {
  const { config } = await import('dotenv');
  config({ path: resolve(ROOT, '.env') });
} catch { /* optional */ }

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.warn('[rerank-wb] DATABASE_URL not set — skipping (non-fatal)');
  process.exit(0);
}

console.log(`[rerank-wb] lookback=${LOOKBACK_H}h  min-hits=${MIN_HITS}${DRY_RUN ? '  DRY RUN' : ''}`);

// ── 1. Query Postgres for averaged rerank scores ──────────────────────────────

let pg;
try {
  const { default: pkg } = await import('pg');
  pg = pkg;
} catch {
  console.error('[rerank-wb] ✗ pg not installed. Run: npm install pg');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

let rows;
try {
  // Aggregate rerank_breakdown JSONB fields grouped by chunk_id.
  // Only include rows from the lookback window and with non-null breakdown.
  const { rows: qRows } = await pool.query(
    `SELECT
       chunk_id,
       count(*)::int                                        AS hit_count,
       avg((rerank_breakdown->>'semantic')::real)           AS avg_semantic,
       avg((rerank_breakdown->>'qdrantTag')::real)          AS avg_qdrant_tag,
       avg((rerank_breakdown->>'cluster')::real)            AS avg_cluster,
       avg((rerank_breakdown->>'som')::real)                AS avg_som,
       avg((rerank_breakdown->>'pagerank')::real)           AS avg_pagerank,
       avg((rerank_breakdown->>'bow')::real)                AS avg_bow,
       avg((rerank_breakdown->>'pairedTest')::real)         AS avg_paired_test,
       avg((rerank_breakdown->>'sameAgentsDir')::real)      AS avg_same_agents_dir,
       avg((rerank_breakdown->>'final')::real)              AS avg_final
     FROM chunk_hit_log
     WHERE rerank_breakdown IS NOT NULL
       AND hit_at >= now() - $1::interval
     GROUP BY chunk_id
     HAVING count(*) >= $2`,
    [`${LOOKBACK_H} hours`, MIN_HITS]
  );
  rows = qRows;
  console.log(`[rerank-wb] Postgres: ${rows.length} distinct chunks with averaged breakdowns`);
} catch (err) {
  console.error('[rerank-wb] ✗ Postgres query failed:', err.message);
  await pool.end();
  process.exit(1);
}

await pool.end();

if (rows.length === 0) {
  console.log('[rerank-wb] Nothing to write back (no recent hits with rerank_breakdown).');
  process.exit(0);
}

if (DRY_RUN) {
  const sample = rows.slice(0, 3);
  console.log('[rerank-wb] DRY RUN — sample aggregates:');
  for (const r of sample) {
    console.log(`  chunk=${r.chunk_id}  hits=${r.hit_count}  avg_final=${Number(r.avg_final).toFixed(4)}`);
  }
  console.log(`[rerank-wb] Would patch ${rows.length} Qdrant payloads.`);
  process.exit(0);
}

// ── 2. Build chunk_id → averaged payload map ──────────────────────────────────

// Qdrant point IDs are the chunk_id. Some chunk IDs may be UUIDs, others
// may be stable_key strings — we use the set_payload endpoint with a filter.
const now = new Date().toISOString();

// Patch in batches using Qdrant's filter-based set_payload
let patched = 0;
const BATCH = 50;

for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH);

  await Promise.allSettled(slice.map(async (r) => {
    const payload = {
      avg_rerank_semantic:        r.avg_semantic         != null ? +r.avg_semantic         : null,
      avg_rerank_qdrant_tag:      r.avg_qdrant_tag       != null ? +r.avg_qdrant_tag       : null,
      avg_rerank_cluster:         r.avg_cluster          != null ? +r.avg_cluster          : null,
      avg_rerank_som:             r.avg_som              != null ? +r.avg_som              : null,
      avg_rerank_pagerank:        r.avg_pagerank         != null ? +r.avg_pagerank         : null,
      avg_rerank_bow:             r.avg_bow              != null ? +r.avg_bow              : null,
      avg_rerank_paired_test:     r.avg_paired_test      != null ? +r.avg_paired_test      : null,
      avg_rerank_same_agents_dir: r.avg_same_agents_dir  != null ? +r.avg_same_agents_dir  : null,
      avg_rerank_final:           r.avg_final            != null ? +r.avg_final            : null,
      rerank_hit_count:           r.hit_count,
      rerank_last_written:        now,
    };

    // Use Qdrant's filter-based payload endpoint to match by stable chunk_id
    const res = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION}/points/payload`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload,
          filter: {
            must: [{ key: 'chunk_id', match: { value: r.chunk_id } }],
          },
        }),
      }
    ).catch(() => null);

    if (res?.ok) patched++;
  }));
}

console.log(`[rerank-wb] ✓ Patched ${patched}/${rows.length} Qdrant payloads`);

// ── 3. Write manifest ─────────────────────────────────────────────────────────

mkdirSync(MANIFEST_DIR, { recursive: true });
const manifest = {
  writtenAt:    now,
  lookbackHours: LOOKBACK_H,
  minHits:      MIN_HITS,
  chunksFound:  rows.length,
  chunksPatched: patched,
  collection:   COLLECTION,
};
writeFileSync(
  join(MANIFEST_DIR, 'rerank-writeback-manifest.json'),
  JSON.stringify(manifest, null, 2)
);
console.log(`[rerank-wb] Manifest → memory/docstore/rerank-writeback-manifest.json`);
