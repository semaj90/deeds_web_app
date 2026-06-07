#!/usr/bin/env node
/**
 * packets:rewards:compute (Phase 7)
 *
 * For each route_runtime_packet with reward IS NULL, computes:
 *   reward = sum of weighted signals:
 *     qdrant_hits > 0        → +0.3
 *     cache_hit              → +0.2
 *     latency_ms < 500       → +0.2
 *     source_refs.length > 0 → +0.2
 *     feature_id IS NOT NULL → +0.1
 *
 * Updates Postgres + writes atlas-glyph-rewards.jsonl
 *
 * Usage:
 *   node scripts/packets/compute-glyph-rewards.mjs [--dry-run] [--limit=<n>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const LIMIT   = Number(ARGS.find(a => a.startsWith('--limit='))?.slice(8) ?? '0') || 10000;

for (const envFile of [path.join(ROOT, '.env'), path.join(ROOT, 'sveltekit-frontend', '.env')]) {
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    break;
  }
}

const REWARDS_OUT = path.join(ROOT, 'memory', 'packets', 'atlas-glyph-rewards.jsonl');

function computeReward(row) {
  let r = 0;
  const qdrantHits = Array.isArray(row.qdrant_hits) ? row.qdrant_hits.length
    : (typeof row.qdrant_hits === 'number' ? row.qdrant_hits : 0);
  if (qdrantHits > 0)                  r += 0.3;
  if (row.cache_hit)                   r += 0.2;
  if ((row.latency_ms ?? 9999) < 500)  r += 0.2;
  const refs = Array.isArray(row.source_refs) ? row.source_refs.length
    : (row.source_refs ? 1 : 0);
  if (refs > 0)                        r += 0.2;
  if (row.feature_id)                  r += 0.1;
  return Math.round(r * 1000) / 1000;
}

async function run() {
  console.log(`\n=== packets:rewards:compute${DRY_RUN ? ' [DRY-RUN]' : ''} ===`);

  const dbUrl = process.env.DATABASE_URL
    ?? `postgresql://${process.env.DB_USER ?? 'legal_admin'}:${process.env.DB_PASSWORD ?? 'legal_password'}@${process.env.DB_HOST ?? '127.0.0.1'}:${process.env.DB_PORT ?? '5434'}/${process.env.DB_NAME ?? 'legal_ai_db'}`;

  let pool;
  let rows = [];

  try {
    pool = new pg.Pool({ connectionString: dbUrl });
    const res = await pool.query(
      `SELECT id, packet_uuid, query_hash, feature_id, source_refs, qdrant_hits,
              cache_hit, latency_ms, captured_at
       FROM route_runtime_packets
       WHERE reward IS NULL
       LIMIT $1`,
      [LIMIT]
    );
    rows = res.rows;
  } catch (e) {
    console.warn(`  Postgres unavailable: ${e.message}`);
    console.log('  Running in offline mode (no DB updates).');
  }

  console.log(`  rows to score: ${rows.length}`);

  const scored = rows.map(r => ({
    packet_uuid: r.packet_uuid,
    query_hash: r.query_hash,
    feature_id: r.feature_id,
    reward: computeReward(r),
    scored_at: new Date().toISOString(),
  }));

  if (!DRY_RUN) {
    // Write JSONL
    fs.writeFileSync(REWARDS_OUT, scored.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    console.log(`  Wrote ${scored.length} rows → ${path.basename(REWARDS_OUT)}`);

    // Update Postgres
    if (pool && scored.length > 0) {
      let updated = 0;
      for (const { packet_uuid, reward } of scored) {
        if (!packet_uuid) continue;
        await pool.query(
          `UPDATE route_runtime_packets SET reward = $1 WHERE packet_uuid = $2 AND reward IS NULL`,
          [reward, packet_uuid]
        );
        updated++;
      }
      console.log(`  Updated ${updated} rows in Postgres`);
    }
  } else {
    console.log('  (dry-run) sample rewards:');
    for (const s of scored.slice(0, 5)) {
      console.log(`    ${s.packet_uuid}: reward=${s.reward} (feat=${s.feature_id})`);
    }
  }

  if (pool) await pool.end();

  const dist = scored.reduce((m, s) => {
    const bucket = s.reward === 0 ? '0.0' : s.reward < 0.5 ? '<0.5' : s.reward < 0.8 ? '<0.8' : '≥0.8';
    m[bucket] = (m[bucket] ?? 0) + 1;
    return m;
  }, {});
  console.log('  reward distribution:', dist);
  console.log('Done.\n');
}

run().catch(e => { console.error(e.message); process.exit(1); });
