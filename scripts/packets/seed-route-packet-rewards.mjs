#!/usr/bin/env node
/**
 * seed-route-packet-rewards.mjs
 *
 * Seeds route_packet_rewards from route_runtime_packets using heuristic prior_reward:
 *
 *   prior_reward =
 *     +0.2  if source_refs not empty
 *     +0.2  if feature_ids not empty
 *     +0.1  if cache_hit
 *     +0.1  if qdrant_hits > 0
 *     -0.1  if latency_ms > 8000
 *
 *   accepted = null  (no explicit thumbs-up yet)
 *   cited    = null
 *
 * Upserts — existing rows are updated if prior_reward IS NULL (fills the gap
 * from the old populate script which left prior_reward null for many rows).
 *
 * Usage:
 *   node scripts/packets/seed-route-packet-rewards.mjs --dry-run
 *   node scripts/packets/seed-route-packet-rewards.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');

function loadEnv() {
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}
loadEnv();

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function computePriorReward(pkt) {
  let r = 0;
  const sourceRefs  = Array.isArray(pkt.source_refs)  ? pkt.source_refs  : [];
  const featureIds  = Array.isArray(pkt.feature_ids)  ? pkt.feature_ids  : [];
  if (sourceRefs.length > 0)        r += 0.2;
  if (featureIds.length > 0)        r += 0.2;
  if (pkt.cache_hit)                r += 0.1;
  if ((pkt.qdrant_hits ?? 0) > 0)  r += 0.1;
  if ((pkt.latency_ms ?? 0) > 8000) r -= 0.1;
  return Math.round(r * 1000) / 1000;
}

async function main() {
  console.log('══ seed-route-packet-rewards ════════════════════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  const { rows: packets } = await pool.query(`
    SELECT
      rp.packet_uuid,
      rp.route,
      rp.source_refs,
      rp.feature_ids,
      rp.qdrant_hits,
      rp.cache_hit,
      rp.latency_ms,
      rp.response_tokens,
      r.id            AS reward_id,
      r.prior_reward  AS existing_prior_reward
    FROM route_runtime_packets rp
    LEFT JOIN route_packet_rewards r ON r.packet_uuid = rp.packet_uuid
    ORDER BY rp.captured_at ASC
  `);

  console.log(`\n  Total packets: ${packets.length}`);

  const toInsert  = packets.filter(p => p.reward_id === null);
  const toBackfill = packets.filter(p => p.reward_id !== null && p.existing_prior_reward === null);
  console.log(`  Missing rewards row: ${toInsert.length}`);
  console.log(`  Existing rows with null prior_reward: ${toBackfill.length}`);

  if (!APPLY) {
    console.log('\n  Sample computed prior_reward:');
    for (const pkt of packets.slice(0, 5)) {
      const pr = computePriorReward(pkt);
      console.log(`    ${pkt.packet_uuid}  route=${pkt.route}  prior_reward=${pr}  (existing=${pkt.existing_prior_reward ?? 'null'})`);
    }
    await pool.end();
    return;
  }

  let inserted = 0, updated = 0;

  for (const pkt of toInsert) {
    const prior_reward = computePriorReward(pkt);
    await pool.query(`
      INSERT INTO route_packet_rewards (packet_uuid, accepted, cited, prior_reward, latency_ms, token_cost)
      VALUES ($1, NULL, NULL, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `, [pkt.packet_uuid, prior_reward, pkt.latency_ms, pkt.response_tokens]);
    inserted++;
  }

  for (const pkt of toBackfill) {
    const prior_reward = computePriorReward(pkt);
    await pool.query(`
      UPDATE route_packet_rewards
      SET prior_reward = $1
      WHERE packet_uuid = $2 AND prior_reward IS NULL
    `, [prior_reward, pkt.packet_uuid]);
    updated++;
  }

  console.log(`\n  Inserted: ${inserted}  Backfilled prior_reward: ${updated}`);

  const { rows: summary } = await pool.query(`
    SELECT
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE prior_reward IS NOT NULL) AS with_reward,
      ROUND(MIN(prior_reward)::numeric, 3)              AS min_reward,
      ROUND(MAX(prior_reward)::numeric, 3)              AS max_reward,
      ROUND(AVG(prior_reward)::numeric, 3)              AS avg_reward,
      COUNT(*) FILTER (WHERE route_success)             AS successes
    FROM route_packet_rewards
  `);
  const s = summary[0];
  console.log(`\n  route_packet_rewards: total=${s.total} with_reward=${s.with_reward} min=${s.min_reward} max=${s.max_reward} avg=${s.avg_reward} successes=${s.successes}`);

  await pool.end();
  console.log('\n  Done.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
