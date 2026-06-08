#!/usr/bin/env node
/**
 * populate-route-packet-rewards.mjs
 *
 * Bootstraps route_packet_rewards from existing route_runtime_packets by
 * computing derived signals from code_relations_v1 and db_usage_calls:
 *
 *   - source_ref_overlap: fraction of packet source_refs that appear in code_relations_v1
 *   - feature_id_match:   whether feature_id resolves to a known source file
 *   - neo4j_depth:        1 if packet source_ref has any CALLS edges, else 0
 *   - prior_reward:       rolling avg reward from same feature_id's prior packets
 *   - route_success:      generated column (accepted OR cited) — set accepted=true
 *                         for packets that have qdrant_hits > 0 and cache_hit=false
 *                         (heuristic: cold hits = genuine retrievals, worth rewarding)
 *
 * Does NOT overwrite existing rows (uses ON CONFLICT DO NOTHING).
 *
 * Usage:
 *   node scripts/atlas/populate-route-packet-rewards.mjs --dry-run
 *   node scripts/atlas/populate-route-packet-rewards.mjs --apply
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

async function main() {
  console.log('══ Populate route_packet_rewards ════════════════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  // 1. Count packets without rewards
  const { rows: [{ unpopulated }] } = await pool.query(`
    SELECT COUNT(*) AS unpopulated
    FROM route_runtime_packets rp
    WHERE NOT EXISTS (
      SELECT 1 FROM route_packet_rewards r WHERE r.packet_uuid = rp.packet_uuid
    )
  `);
  console.log(`\n  Packets without rewards: ${unpopulated}`);

  if (!APPLY) {
    // Preview the computation for a sample
    const { rows: sample } = await pool.query(`
      SELECT
        rp.packet_uuid,
        rp.route,
        rp.feature_id,
        rp.qdrant_hits,
        rp.cache_hit,
        rp.latency_ms,
        jsonb_array_length(rp.source_refs) AS source_ref_count
      FROM route_runtime_packets rp
      WHERE NOT EXISTS (SELECT 1 FROM route_packet_rewards r WHERE r.packet_uuid = rp.packet_uuid)
      ORDER BY rp.captured_at DESC
      LIMIT 5
    `);
    console.log('\n  Sample packets (preview):');
    for (const r of sample) {
      console.log(`    ${r.packet_uuid} route=${r.route} feature=${r.feature_id} qdrant_hits=${r.qdrant_hits} cache_hit=${r.cache_hit}`);
    }
    await pool.end();
    return;
  }

  // 2. For each unpopulated packet, compute signals and insert
  const { rows: packets } = await pool.query(`
    SELECT
      rp.packet_uuid,
      rp.route,
      rp.feature_id,
      rp.feature_ids,
      rp.source_refs,
      rp.qdrant_hits,
      rp.cache_hit,
      rp.cache_tier,
      rp.latency_ms,
      rp.response_tokens,
      rp.reward AS raw_reward
    FROM route_runtime_packets rp
    WHERE NOT EXISTS (
      SELECT 1 FROM route_packet_rewards r WHERE r.packet_uuid = rp.packet_uuid
    )
    ORDER BY rp.captured_at ASC
  `);

  console.log(`\n  Processing ${packets.length} packets...`);
  let inserted = 0;

  for (const pkt of packets) {
    const sourceRefs = Array.isArray(pkt.source_refs) ? pkt.source_refs : [];
    const featureId  = pkt.feature_id ?? null;

    // source_ref_overlap: fraction of source_refs that exist as source_file in code_relations_v1
    let sourceRefOverlap = null;
    if (sourceRefs.length > 0) {
      const { rows: [{ matches }] } = await pool.query(`
        SELECT COUNT(DISTINCT source_file)::float / $1 AS matches
        FROM code_relations_v1
        WHERE source_file = ANY($2::text[])
      `, [sourceRefs.length, sourceRefs]);
      sourceRefOverlap = parseFloat(matches) || 0;
    }

    // feature_id_match: does feature_id appear as a source_file?
    let featureIdMatch = null;
    if (featureId) {
      const { rows: [{ exists }] } = await pool.query(`
        SELECT EXISTS(
          SELECT 1 FROM code_relations_v1 WHERE source_file = $1 LIMIT 1
        ) AS exists
      `, [featureId]);
      featureIdMatch = exists;
    }

    // neo4j_depth: 1 if any source_ref has outgoing CALLS edges
    let neo4jDepth = 0;
    if (sourceRefs.length > 0) {
      const { rows: [{ has_edges }] } = await pool.query(`
        SELECT EXISTS(
          SELECT 1 FROM code_relations_v1
          WHERE source_file = ANY($1::text[])
            AND relation_type = 'CALLS'
          LIMIT 1
        ) AS has_edges
      `, [sourceRefs]);
      if (has_edges) neo4jDepth = 1;
    }

    // prior_reward: avg reward from prior packets with same feature_id
    let priorReward = null;
    if (featureId) {
      const { rows: [{ avg_r }] } = await pool.query(`
        SELECT AVG(r.prior_reward) AS avg_r
        FROM route_packet_rewards r
        JOIN route_runtime_packets rp ON rp.packet_uuid = r.packet_uuid
        WHERE rp.feature_id = $1
      `, [featureId]);
      if (avg_r != null) priorReward = parseFloat(avg_r);
    }

    // accepted heuristic: cold qdrant hit with low latency = good retrieval
    const accepted = !pkt.cache_hit && (pkt.qdrant_hits ?? 0) > 0;

    await pool.query(`
      INSERT INTO route_packet_rewards (
        packet_uuid, accepted, rejected, latency_ms, token_cost,
        source_ref_overlap, qdrant_score_avg, neo4j_depth,
        feature_id_match, prior_reward
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT DO NOTHING
    `, [
      pkt.packet_uuid,
      accepted,
      false,
      pkt.latency_ms,
      pkt.response_tokens,
      sourceRefOverlap,
      pkt.qdrant_hits ? (pkt.qdrant_hits > 5 ? 0.85 : 0.65) : null,
      neo4jDepth,
      featureIdMatch,
      priorReward ?? (pkt.raw_reward ? parseFloat(pkt.raw_reward) : null),
    ]);
    inserted++;
    if (inserted % 10 === 0) process.stdout.write(`\r  Inserted: ${inserted}/${packets.length}`);
  }
  console.log(`\r  Inserted: ${inserted}/${packets.length}`);

  // 3. Summary
  const { rows: summary } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE route_success) AS successes,
      ROUND(AVG(source_ref_overlap)::numeric, 3) AS avg_overlap,
      ROUND(AVG(neo4j_depth)::numeric, 2) AS avg_depth,
      COUNT(*) FILTER (WHERE feature_id_match) AS feature_matches
    FROM route_packet_rewards
  `);
  console.log('\n  route_packet_rewards summary:');
  const s = summary[0];
  console.log(`    total=${s.total} successes=${s.successes} avg_overlap=${s.avg_overlap} avg_depth=${s.avg_depth} feature_matches=${s.feature_matches}`);

  // 4. Top routes by reward signal
  const { rows: topRoutes } = await pool.query(`
    SELECT
      rp.route,
      COUNT(*)                   AS packets,
      ROUND(AVG(r.source_ref_overlap)::numeric, 3) AS avg_overlap,
      SUM(CASE WHEN r.route_success THEN 1 ELSE 0 END) AS successes
    FROM route_packet_rewards r
    JOIN route_runtime_packets rp ON rp.packet_uuid = r.packet_uuid
    GROUP BY rp.route
    ORDER BY successes DESC, packets DESC
    LIMIT 10
  `);
  if (topRoutes.length) {
    console.log('\n  Top routes:');
    for (const r of topRoutes) {
      console.log(`    ${r.route}  packets=${r.packets} successes=${r.successes} avg_overlap=${r.avg_overlap}`);
    }
  }

  await pool.end();
  console.log('\n  Done.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
