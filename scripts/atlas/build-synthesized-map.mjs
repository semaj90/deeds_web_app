#!/usr/bin/env node
/**
 * build-synthesized-map.mjs
 *
 * Materialises atlas_feature_map_synthesized from three source tables:
 *   - atlas_feature_map          (canonical lineage — source_ref, feature_id, som_cluster, ...)
 *   - task_semantic_packets      (task/packet aggregates, joined on feature_id)
 *   - agent_pickup_queue         (queue status, joined via packet_id)
 *
 * Join reality (verified 2026-06-03):
 *   source_ref overlap = 0  → join on feature_id (coarse buckets: auth/ui/llm/...)
 *   feature_id overlap = 10 distinct buckets
 *   Once Phase B backfills task_semantic_packets.source_ref from file_path,
 *   the join can be promoted to source_ref for fine-grained resolution.
 *
 * Usage:
 *   node scripts/atlas/build-synthesized-map.mjs
 *   node scripts/atlas/build-synthesized-map.mjs --dry-run
 *   node scripts/atlas/build-synthesized-map.mjs --feature-id=auth
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const DRY_RUN    = process.argv.includes('--dry-run');
const FEAT_ARG   = process.argv.find(a => a.startsWith('--feature-id='));
const FEAT_FILTER = FEAT_ARG ? FEAT_ARG.split('=')[1] : null;

// ── Env loader ────────────────────────────────────────────────────────────────
function loadEnv() {
  return loadRepoEnv(process.env);
}

const env = loadEnv();
const DATABASE_URL = resolveDatabaseUrl(env);

// ── Step 1: load atlas_feature_map rows ───────────────────────────────────────
const pool = new pg.Pool({ connectionString: DATABASE_URL });

process.stdout.write('Loading atlas_feature_map...\n');

const featFilter = FEAT_FILTER ? `WHERE feature_id = $1` : '';
const featParams = FEAT_FILTER ? [FEAT_FILTER] : [];

const atlasRows = await pool.query(
  `SELECT source_ref, feature_id, related_feature_ids, som_cluster,
          centroid_id, qdrant_point_id, cluster_id
   FROM atlas_feature_map
   ${featFilter}
   ORDER BY source_ref`,
  featParams,
);
process.stdout.write(`  ${atlasRows.rows.length} atlas rows loaded.\n`);

// ── Step 2: aggregate task_semantic_packets by feature_id ─────────────────────
process.stdout.write('Aggregating task_semantic_packets by feature_id...\n');

const packetAgg = await pool.query(`
  SELECT
    feature_id,
    COUNT(*)::int                                        AS packet_count,
    COUNT(*) FILTER (WHERE agent_pickup_ready = true)::int AS ready_count,
    MAX(id::text)                                        AS last_packet_id,
    MAX(updated_at)                                      AS last_updated
  FROM task_semantic_packets
  WHERE feature_id IS NOT NULL
  GROUP BY feature_id
`);

/** @type {Map<string, {packet_count:number, ready_count:number, last_packet_id:string, last_updated:Date}>} */
const packetByFeature = new Map();
for (const r of packetAgg.rows) {
  packetByFeature.set(r.feature_id, r);
}
process.stdout.write(`  ${packetAgg.rows.length} feature buckets with packets.\n`);

// ── Step 3: aggregate agent_pickup_queue by packet_id → feature_id chain ─────
// Queue uses integer IDs; join on packet_id text field which stores the packet id
process.stdout.write('Loading agent_pickup_queue status...\n');

const queueAgg = await pool.query(`
  SELECT
    q.packet_id,
    q.status,
    COUNT(*)::int AS queue_entries
  FROM agent_pickup_queue q
  WHERE q.status IS NOT NULL
  GROUP BY q.packet_id, q.status
  ORDER BY queue_entries DESC
`);

// Map packet_id → most common status
/** @type {Map<string, string>} */
const queueStatus = new Map();
for (const r of queueAgg.rows) {
  if (!queueStatus.has(r.packet_id)) queueStatus.set(r.packet_id, r.status);
}
process.stdout.write(`  ${queueAgg.rows.length} queue entries loaded.\n`);

// ── Step 4: build upsert rows ─────────────────────────────────────────────────
const rows = atlasRows.rows.map(atlas => {
  const pkts = packetByFeature.get(atlas.feature_id) ?? null;
  const pickupStatus = pkts ? (queueStatus.get(pkts.last_packet_id) ?? null) : null;

  return {
    source_ref:           atlas.source_ref,
    feature_id:           atlas.feature_id,
    related_feature_ids:  JSON.stringify(atlas.related_feature_ids ?? []),
    som_cluster:          atlas.som_cluster,
    centroid_id:          atlas.centroid_id,
    qdrant_point_id:      atlas.qdrant_point_id,
    cluster_id:           atlas.cluster_id,
    task_count:           0,   // workspace_tasks doesn't have source_ref yet
    packet_count:         pkts?.packet_count ?? 0,
    ready_packet_count:   pkts?.ready_count  ?? 0,
    last_packet_id:       pkts?.last_packet_id ?? null,
    pickup_status:        pickupStatus,
    runtime_state:        JSON.stringify({}),
  };
});

process.stdout.write(`\nBuilt ${rows.length} synthesis rows.\n`);

// Stats
const withPackets = rows.filter(r => r.packet_count > 0).length;
const withPickup  = rows.filter(r => r.pickup_status).length;
const withSom     = rows.filter(r => r.som_cluster).length;
console.log(`  with som_cluster  : ${withSom} / ${rows.length} (${Math.round(withSom/rows.length*100)}%)`);
console.log(`  with packets      : ${withPackets} / ${rows.length}`);
console.log(`  with pickup status: ${withPickup} / ${rows.length}`);

if (DRY_RUN) {
  console.log('\nSample (5 rows):');
  for (const r of rows.slice(0, 5)) {
    console.log(`  ${r.source_ref}`);
    console.log(`    feature=${r.feature_id} som=${r.som_cluster} packets=${r.packet_count} status=${r.pickup_status}`);
  }
  console.log('\n[DRY-RUN] No writes. Remove --dry-run to apply.');
  await pool.end();
  process.exit(0);
}

// ── Step 5: upsert into atlas_feature_map_synthesized ────────────────────────
process.stdout.write('\nUpserting into atlas_feature_map_synthesized...\n');

const UPSERT = `
  INSERT INTO atlas_feature_map_synthesized (
    source_ref, feature_id, related_feature_ids,
    som_cluster, centroid_id, qdrant_point_id, cluster_id,
    task_count, packet_count, ready_packet_count,
    last_packet_id, pickup_status, runtime_state,
    last_verified_at, synthesized_at
  ) VALUES (
    $1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,now(),now()
  )
  ON CONFLICT (source_ref) DO UPDATE SET
    feature_id          = EXCLUDED.feature_id,
    related_feature_ids = EXCLUDED.related_feature_ids,
    som_cluster         = COALESCE(EXCLUDED.som_cluster,    atlas_feature_map_synthesized.som_cluster),
    centroid_id         = COALESCE(EXCLUDED.centroid_id,    atlas_feature_map_synthesized.centroid_id),
    qdrant_point_id     = COALESCE(EXCLUDED.qdrant_point_id,atlas_feature_map_synthesized.qdrant_point_id),
    cluster_id          = COALESCE(EXCLUDED.cluster_id,     atlas_feature_map_synthesized.cluster_id),
    task_count          = EXCLUDED.task_count,
    packet_count        = EXCLUDED.packet_count,
    ready_packet_count  = EXCLUDED.ready_packet_count,
    last_packet_id      = EXCLUDED.last_packet_id,
    pickup_status       = EXCLUDED.pickup_status,
    last_verified_at    = now()
`;

let upserted = 0, failed = 0;

for (let i = 0; i < rows.length; i += 100) {
  const batch = rows.slice(i, i + 100);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of batch) {
      await client.query(UPSERT, [
        r.source_ref, r.feature_id, r.related_feature_ids,
        r.som_cluster, r.centroid_id, r.qdrant_point_id, r.cluster_id,
        r.task_count, r.packet_count, r.ready_packet_count,
        r.last_packet_id, r.pickup_status, r.runtime_state,
      ]);
      upserted++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    failed += batch.length;
    console.error(`  batch ${i}-${i+100} failed:`, err.message);
  } finally {
    client.release();
  }
  if ((i + 100) % 1000 === 0) process.stdout.write(`  upserted ${upserted}...\n`);
}

// ── Step 6: snapshot to history ───────────────────────────────────────────────
process.stdout.write('Writing history snapshot...\n');

const snapClient = await pool.connect();
try {
  await snapClient.query(`
    INSERT INTO atlas_feature_map_history
      (source_ref, indexing_pass, feature_id, som_cluster, centroid_id,
       qdrant_point_id, cluster_id, snapshot)
    SELECT
      source_ref,
      'build-synthesized-map' AS indexing_pass,
      feature_id, som_cluster, centroid_id, qdrant_point_id, cluster_id,
      jsonb_build_object(
        'som_cluster', som_cluster,
        'centroid_id', centroid_id,
        'qdrant_point_id', qdrant_point_id,
        'packet_count', packet_count,
        'pickup_status', pickup_status
      ) AS snapshot
    FROM atlas_feature_map_synthesized
    WHERE last_verified_at > now() - interval '5 minutes'
  `);
} finally {
  snapClient.release();
}

await pool.end();

console.log(`\n─────────────────────────────────────────────────`);
console.log(`  Atlas rows processed : ${rows.length}`);
console.log(`  Upserted             : ${upserted}`);
console.log(`  Failed               : ${failed}`);
console.log(`\n  ✓ atlas_feature_map_synthesized populated.`);
console.log(`  ✓ Snapshot written to atlas_feature_map_history.`);
console.log(`\n  Next: wire context-assembler to write route_runtime_packets.`);
console.log(`  Verify:`);
console.log(`    SELECT COUNT(*) FROM atlas_feature_map_synthesized WHERE som_cluster IS NOT NULL;`);
console.log(`    SELECT COUNT(*) FROM atlas_feature_map_history WHERE indexing_pass = 'build-synthesized-map';`);
