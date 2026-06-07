#!/usr/bin/env node
/**
 * packets:supervision:refresh
 *
 * Backfills route_packet_source_refs from current route_runtime_packets,
 * then refreshes the route_supervision_graph materialized view.
 *
 * Run after:
 *   - New packets accumulate in route_runtime_packets
 *   - route_packet_rewards receives reward signals
 *   - calls_edges or db_usage_calls are reloaded
 *
 * Usage:
 *   node scripts/packets/refresh-supervision-graph.mjs [--dry-run]
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

for (const envFile of [path.join(ROOT, '.env'), path.join(ROOT, 'sveltekit-frontend', '.env')]) {
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}

const DRY_RUN = process.argv.includes('--dry-run');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  console.log(`\n═══ supervision:refresh${DRY_RUN ? ' [DRY-RUN]' : ''} ══════════════════════`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Current state
  const { rows: pre } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM route_runtime_packets)     AS packets,
      (SELECT COUNT(*) FROM route_packet_source_refs)  AS source_refs,
      (SELECT COUNT(*) FROM route_packet_rewards)      AS rewards,
      (SELECT COUNT(*) FROM calls_edges)               AS call_edges,
      (SELECT COUNT(*) FROM db_usage_calls)            AS db_calls,
      (SELECT COUNT(*) FROM route_supervision_graph)   AS view_rows
  `);
  const s = pre[0];
  console.log(`  Before:`);
  console.log(`    route_runtime_packets:    ${s.packets}`);
  console.log(`    route_packet_source_refs: ${s.source_refs}`);
  console.log(`    route_packet_rewards:     ${s.rewards}`);
  console.log(`    calls_edges:              ${s.call_edges}`);
  console.log(`    db_usage_calls:           ${s.db_calls}`);
  console.log(`    supervision_graph rows:   ${s.view_rows}`);

  if (DRY_RUN) {
    await pool.end();
    console.log('\n  [dry-run] Pass without --dry-run to apply.\n');
    return;
  }

  // Backfill source_refs from any packets not yet normalized
  const { rowCount: backfilled } = await pool.query(`
    INSERT INTO route_packet_source_refs (packet_uuid, source_ref, feature_id, ref_index)
    SELECT
      p.packet_uuid,
      ref.source_ref,
      p.feature_id,
      ref.ordinality::smallint - 1
    FROM route_runtime_packets p
    CROSS JOIN LATERAL (
      SELECT value::text AS source_ref, ordinality
      FROM jsonb_array_elements_text(
        CASE jsonb_typeof(p.source_refs)
          WHEN 'array' THEN p.source_refs
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY
    ) ref
    WHERE ref.source_ref IS NOT NULL AND ref.source_ref <> ''
    ON CONFLICT (packet_uuid, source_ref) DO NOTHING
  `);
  console.log(`\n  Backfilled ${backfilled} new source_ref rows`);

  // Refresh the materialized view
  console.log('  Refreshing route_supervision_graph...');
  const t0 = Date.now();
  await pool.query('REFRESH MATERIALIZED VIEW route_supervision_graph');
  const elapsed = Date.now() - t0;

  // Post-refresh stats
  const { rows: post } = await pool.query(`
    SELECT
      COUNT(*)                              AS total_rows,
      COUNT(DISTINCT packet_uuid)           AS packets,
      COUNT(DISTINCT source_ref)            AS source_refs,
      COUNT(DISTINCT called_function)       AS call_targets,
      COUNT(DISTINCT table_name)            AS db_tables,
      COUNT(route_success)                  AS reward_rows,
      ROUND(AVG(route_success::int)::numeric * 100, 1) AS reward_rate_pct
    FROM route_supervision_graph
  `);
  const p2 = post[0];
  console.log(`\n  After (${elapsed}ms):`);
  console.log(`    total rows:     ${p2.total_rows}`);
  console.log(`    packets:        ${p2.packets}`);
  console.log(`    source_refs:    ${p2.source_refs}`);
  console.log(`    call targets:   ${p2.call_targets}`);
  console.log(`    db tables:      ${p2.db_tables}`);
  console.log(`    reward rows:    ${p2.reward_rows}`);
  console.log(`    reward rate:    ${p2.reward_rate_pct ?? 'n/a'}%`);

  // Top functions by packet coverage (training signal preview)
  if (Number(p2.call_targets) > 0) {
    const { rows: top } = await pool.query(`
      SELECT
        called_function,
        COUNT(DISTINCT packet_uuid)                         AS packet_count,
        ROUND(AVG(call_weight)::numeric, 2)                AS avg_weight,
        ROUND(AVG(route_success::int)::numeric, 3)         AS reward_rate
      FROM route_supervision_graph
      WHERE called_function IS NOT NULL
      GROUP BY called_function
      ORDER BY packet_count DESC, avg_weight DESC
      LIMIT 10
    `);
    console.log('\n  Top functions by packet coverage:');
    for (const r of top) {
      const rr = r.reward_rate != null ? ` reward=${r.reward_rate}` : '';
      console.log(`    ${r.called_function.padEnd(40)} packets=${r.packet_count} weight=${r.avg_weight}${rr}`);
    }
  }

  await pool.end();
  console.log('\n  Done.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
