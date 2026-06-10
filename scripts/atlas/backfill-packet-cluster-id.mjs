#!/usr/bin/env node
/**
 * backfill-packet-cluster-id.mjs
 *
 * Backfills cluster_id in task_semantic_packets.
 *
 * Strategy:
 *   - Packets have canonical_source_ref = 'global:task:N' (task aggregations,
 *     not file paths). The appropriate cluster is derived from feature_id.
 *   - Sets cluster_id = 'cluster:' + feature_id for all rows where
 *     cluster_id IS NULL and feature_id IS NOT NULL.
 *
 * Usage:
 *   node scripts/atlas/backfill-packet-cluster-id.mjs           # dry-run (default)
 *   node scripts/atlas/backfill-packet-cluster-id.mjs --apply   # write to Postgres
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

async function main() {
  const e = loadRepoEnv(process.env);
  const dbUrl = resolveDatabaseUrl(e);
  const pool = new pg.Pool({ connectionString: dbUrl });

  console.log('\n── Backfill task_semantic_packets.cluster_id ─────────────');
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  // Audit current state
  const current = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(cluster_id) AS with_cluster,
      COUNT(*) FILTER (WHERE cluster_id IS NULL AND feature_id IS NOT NULL) AS eligible
    FROM task_semantic_packets
  `);
  const { total, with_cluster, eligible } = current.rows[0];
  console.log(`\nCurrent state:`);
  console.log(`  total rows:       ${total}`);
  console.log(`  with cluster_id:  ${with_cluster}`);
  console.log(`  eligible to fill: ${eligible} (NULL cluster_id + has feature_id)`);

  if (Number(eligible) === 0) {
    console.log('\nNothing to do — all eligible rows already have cluster_id');
    await pool.end();
    return;
  }

  // Preview distribution
  const dist = await pool.query(`
    SELECT feature_id, COUNT(*) AS cnt
    FROM task_semantic_packets
    WHERE cluster_id IS NULL AND feature_id IS NOT NULL
    GROUP BY feature_id
    ORDER BY cnt DESC
  `);
  console.log('\nFeature → cluster mapping preview:');
  for (const row of dist.rows) {
    console.log(`  cluster:${row.feature_id.padEnd(25)} ← ${row.cnt} packets`);
  }

  if (!APPLY) {
    console.log('\nDry-run — pass --apply to write');
    await pool.end();
    return;
  }

  // Apply: cluster_id = 'cluster:' + feature_id
  const result = await pool.query(`
    UPDATE task_semantic_packets
    SET cluster_id = 'cluster:' || feature_id,
        updated_at = now()
    WHERE cluster_id IS NULL AND feature_id IS NOT NULL
    RETURNING id
  `);
  console.log(`\nUpdated: ${result.rowCount} rows`);

  // Verify
  const verify = await pool.query(`
    SELECT COUNT(*) AS total, COUNT(cluster_id) AS with_cluster
    FROM task_semantic_packets
  `);
  const v = verify.rows[0];
  console.log(`Verification: ${v.with_cluster}/${v.total} packets now have cluster_id`);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
