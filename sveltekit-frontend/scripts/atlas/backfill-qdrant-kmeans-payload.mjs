#!/usr/bin/env node
/**
 * Backfill kmeans_cluster into Qdrant codebase_chunks_384_hybrid payloads.
 *
 * Groups Postgres rows by kmeans_cluster so points sharing a cluster get a single
 * Qdrant API call. Each call sets { kmeans_cluster, second_cluster_id,
 * kmeans_model_version } on a list of point IDs — dramatically fewer requests
 * than one-per-point.
 *
 * Note: centroid_distance and cluster_margin are per-point and stay in Postgres
 * (canonical truth). Only cluster identity fields go into Qdrant for filtering.
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-kmeans-payload.mjs --dry-run
 *   node scripts/atlas/backfill-qdrant-kmeans-payload.mjs --apply
 *   node scripts/atlas/backfill-qdrant-kmeans-payload.mjs --apply --batch 1000
 */

import pg from 'pg';

const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const APPLY      = args.includes('--apply');
const BATCH      = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '1000') || 1000;
const VERBOSE    = args.includes('--verbose');
const COLLECTION = 'codebase_chunks_384_hybrid';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';

if (!DRY_RUN && !APPLY) {
  console.error('Pass --dry-run or --apply');
  process.exit(1);
}

const pool = new pg.Pool({
  host:     process.env.PG_HOST     ?? 'localhost',
  port:     parseInt(process.env.PG_PORT ?? '5434'),
  user:     process.env.PG_USER     ?? 'legal_admin',
  password: process.env.PG_PASSWORD ?? '123456',
  database: process.env.PG_DATABASE ?? 'legal_ai_db',
  max: 4,
});

console.log('=== Backfill Qdrant K-means Payload ===');
console.log(`Collection : ${COLLECTION}`);
console.log(`Mode       : ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
console.log(`Batch      : ${BATCH}`);
console.log('');

const client = await pool.connect();
try {
  // Count eligible rows
  const { rows: [{ count: totalStr }] } = await client.query(`
    SELECT count(*) FROM codebase_chunk_index
    WHERE kmeans_cluster IS NOT NULL AND content_embedding IS NOT NULL
  `);
  const total = parseInt(totalStr);
  console.log(`Postgres chunks with kmeans_cluster : ${total.toLocaleString()}`);
  console.log('');

  // Load ALL cluster assignments at once (52K UUIDs + ints = ~4MB RAM, fine)
  // Group by cluster — one Qdrant call per cluster = 128 calls total for k=128
  console.log('Loading all cluster assignments from Postgres...');
  const { rows: allRows } = await client.query(`
    SELECT id::text, kmeans_cluster, second_cluster_id, kmeans_model_version
    FROM codebase_chunk_index
    WHERE kmeans_cluster IS NOT NULL AND content_embedding IS NOT NULL
    ORDER BY kmeans_cluster
  `);
  console.log(`Loaded ${allRows.length.toLocaleString()} rows`);

  // Group by (kmeans_cluster, second_cluster_id, model_version)
  const groups = new Map();
  for (const row of allRows) {
    const key = `${row.kmeans_cluster}|${row.second_cluster_id ?? 'null'}|${row.kmeans_model_version}`;
    if (!groups.has(key)) {
      groups.set(key, {
        payload: {
          kmeans_cluster:       row.kmeans_cluster,
          second_cluster_id:    row.second_cluster_id ?? null,
          kmeans_model_version: row.kmeans_model_version ?? null,
        },
        points: [],
      });
    }
    groups.get(key).points.push(row.id);
  }

  console.log(`Unique cluster groups : ${groups.size}`);
  console.log('');

  if (DRY_RUN) {
    let i = 0;
    for (const [key, { payload, points }] of groups) {
      if (i++ >= 5) break;
      console.log(`  group "${key}" → ${points.length} points  payload=${JSON.stringify(payload)}`);
    }
    console.log('');
    console.log(`DRY-RUN complete — would send ${groups.size} Qdrant set-payload requests`);
    console.log(`covering ${allRows.length.toLocaleString()} points total`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  // Apply — one request per cluster group
  let updated = 0, errors = 0, groupIdx = 0;

  for (const { payload: groupPayload, points } of groups.values()) {
    groupIdx++;
    // Process points list in sub-batches to avoid huge JSON bodies
    for (let start = 0; start < points.length; start += BATCH) {
      const slice = points.slice(start, start + BATCH);
      try {
        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: groupPayload, points: slice }),
        });
        if (res.ok) {
          updated += slice.length;
        } else {
          const body = await res.text();
          if (VERBOSE) console.error(`  cluster ${groupPayload.kmeans_cluster} batch err: ${body}`);
          errors += slice.length;
        }
      } catch (err) {
        if (VERBOSE) console.error(`  cluster ${groupPayload.kmeans_cluster} fetch err: ${err.message}`);
        errors += slice.length;
      }
    }

    if (groupIdx % 20 === 0 || groupIdx === groups.size) {
      console.log(`Groups: ${groupIdx}/${groups.size}  points updated=${updated.toLocaleString()}  errors=${errors}`);
    }
  }

  console.log('');
  console.log('─────────────────────────────────────────');
  console.log('Qdrant K-means Payload Backfill complete');
  console.log(`  Cluster groups   : ${groups.size}`);
  console.log(`  Points updated   : ${updated.toLocaleString()}`);
  console.log(`  Errors           : ${errors}`);
  console.log('─────────────────────────────────────────');

} finally {
  client.release();
  await pool.end();
}
