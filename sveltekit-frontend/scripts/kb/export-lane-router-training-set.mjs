#!/usr/bin/env node
/**
 * export-lane-router-training-set.mjs
 *
 * Reads chunk_hit_log from Postgres and emits a JSONL training set for the
 * Tier-1 interpretable lane router. Does NOT train anything, write Redis, or
 * mutate any DB.
 *
 * Output: memory/kb/lane-router-training-set.jsonl
 *
 * Usage:
 *   node scripts/kb/export-lane-router-training-set.mjs
 *   node scripts/kb/export-lane-router-training-set.mjs --limit 5000
 *   node scripts/kb/export-lane-router-training-set.mjs --dry-run
 *   node scripts/kb/export-lane-router-training-set.mjs --summary
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const SUMMARY  = args.includes('--summary');
const LIMIT    = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : 10_000; })();
const OUT_PATH = path.join(ROOT, 'memory', 'kb', 'lane-router-training-set.jsonl');

// ── DB connection ─────────────────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool   = new pg.Pool({ connectionString: DB_URL, max: 2, idleTimeoutMillis: 5000 });

// ── ETA bar ───────────────────────────────────────────────────────────────────
function eta(done, total, t0) {
  const elapsed = (Date.now() - t0) / 1000;
  const rate    = done / Math.max(elapsed, 0.1);
  const remain  = Math.max(0, (total - done) / rate);
  const pct     = Math.round((done / total) * 100);
  const bar     = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r[${bar}] ${pct}% ${done}/${total}  ETA ${remain.toFixed(0)}s  `);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[lane-export] Connecting to Postgres...`);
  const client = await pool.connect();

  // 1. Count rows
  const { rows: [{ count }] } = await client.query(
    `SELECT COUNT(*)::int AS count FROM chunk_hit_log`
  );
  console.log(`[lane-export] chunk_hit_log rows: ${count}  (exporting up to ${LIMIT})`);

  if (DRY_RUN) {
    console.log(`[lane-export] DRY RUN — output would go to: ${OUT_PATH}`);
    client.release();
    await pool.end();
    return;
  }

  // 2. Query with aggregated features per (chunk_id, pipeline, som_cluster, gpu_cluster)
  const { rows } = await client.query(`
    SELECT
      chl.chunk_id,
      chl.relative_path,
      chl.pipeline                              AS lane_id,
      chl.som_cluster,
      chl.gpu_cluster,
      chl.score::real                           AS raw_score,
      chl.rerank_score::real                    AS rerank_score,
      COALESCE(chl.rerank_score, chl.score)::real >= 0.5
                                                AS accepted_context,
      -- look up trust_tier from feature_file_edges if available
      -- (feature_file_edges.trust_tier not yet migrated — default T3 until column added)
      'T3'::text                                AS trust_tier,
      -- PageRank from CouchDB cache (stored as JSON string in Redis; not directly queryable)
      -- som_bmu coords from Qdrant payload — not in chunk_hit_log; use som_cluster as proxy
      chl.som_cluster                           AS som_bmu_row,
      (chl.som_cluster % 5)::int                AS som_bmu_col,
      chl.hit_at
    FROM chunk_hit_log chl
    ORDER BY chl.hit_at DESC
    LIMIT $1
  `, [LIMIT]);

  client.release();
  await pool.end();

  if (SUMMARY) {
    // Summarize lane distribution
    const byLane = {};
    for (const r of rows) {
      byLane[r.lane_id] = (byLane[r.lane_id] ?? 0) + 1;
    }
    console.log('\n[lane-export] Lane distribution:');
    for (const [lane, cnt] of Object.entries(byLane).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${lane.padEnd(20)} ${cnt}`);
    }
    const accepted = rows.filter(r => r.accepted_context).length;
    console.log(`\n[lane-export] Accepted context: ${accepted}/${rows.length} (${((accepted/rows.length)*100).toFixed(1)}%)`);
    console.log(`[lane-export] Unique paths: ${new Set(rows.map(r => r.relative_path)).size}`);
    return;
  }

  // 3. Write JSONL
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const t0 = Date.now();
  const stream = fs.createWriteStream(OUT_PATH);
  let written = 0;
  for (const row of rows) {
    const record = {
      chunk_id:         row.chunk_id,
      relative_path:    row.relative_path,
      lane_id:          row.lane_id,
      trust_tier:       row.trust_tier,
      som_bmu_row:      row.som_bmu_row ?? 0,
      som_bmu_col:      row.som_bmu_col ?? 0,
      gpu_cluster:      row.gpu_cluster ?? 0,
      raw_score:        row.raw_score ?? 0,
      rerank_score:     row.rerank_score ?? 0,
      accepted_context: row.accepted_context ?? false,
    };
    stream.write(JSON.stringify(record) + '\n');
    written++;
    if (written % 500 === 0) eta(written, rows.length, t0);
  }
  await new Promise((resolve, reject) => { stream.end(resolve); stream.on('error', reject); });
  eta(rows.length, rows.length, t0);
  process.stdout.write('\n');

  const kb = Math.round(fs.statSync(OUT_PATH).size / 1024);
  console.log(`[lane-export] ✅ Wrote ${written} records → ${OUT_PATH} (${kb} KB)`);
  console.log(`[lane-export] Next: review the file, then train a decision-tree router from it.`);
  console.log(`[lane-export]   Fields: lane_id, trust_tier, som_bmu_row/col, gpu_cluster, rerank_score, accepted_context`);
  console.log(`[lane-export]   Target: accepted_context OR rerank_score > 0.7`);
}

main().catch(err => {
  console.error('[lane-export] Error:', err.message);
  process.exit(1);
});