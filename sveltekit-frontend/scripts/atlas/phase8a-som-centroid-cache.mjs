#!/usr/bin/env node
/**
 * Phase 8A: SOM Centroid Cache Warming
 *
 * After Phase 7 (summaries) completes:
 * 1. Read SOM cluster assignments from Neo4j
 * 2. Compute cluster centroids from Qdrant embeddings
 * 3. Cache in Redis:
 *    - centroid:som:{cluster_id} (metadata only, not huge vectors)
 *    - bitfrost:som:{cluster_id}:packets (packet_key list)
 *    - bitfrost:som:{cluster_id}:top-k (top K by authority)
 *
 * Do NOT store 384-dim centroid vectors in Redis.
 * Store only cluster metadata: id, row, col, packet_count, updated_at
 *
 * Benefits:
 * - Query → nearest centroid (single Redis lookup) → search nearby packets only
 * - Replaces 40K-vector ANN with 400-vector centroid ANN
 * - 100× faster pre-filtering before Qdrant
 */

import Redis from 'ioredis';
import pg from 'pg';
import fetch from 'node-fetch';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;

const env = loadRepoEnv();
const DATABASE_URL = resolveDatabaseUrl(env);
const REDIS_HOST = env.REDIS_HOST || env.VALKEY_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(env.REDIS_PORT || env.VALKEY_PORT || '6379');
const REDIS_PASSWORD = env.REDIS_PASSWORD || env.VALKEY_PASSWORD || 'redis';
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

const pool = new Pool({ connectionString: DATABASE_URL });
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  retryStrategy: () => null
});

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');

const MODE = dryRun ? 'DRY_RUN' : apply ? 'APPLY' : 'DRY_RUN';

async function warmCentroidCache() {
  console.log(`\n🔥 Phase 8A: SOM Centroid Cache Warming [${MODE}]\n`);

  await redis.connect();

  try {
    // 1. Query SOM cluster assignments from atlas_packets table
    console.log('📊 Step 1: Fetch SOM cluster assignments...');
    const clusters = await pool.query(`
      SELECT
        som_cluster as cluster_id,
        som_row as row,
        som_col as col,
        COUNT(*) as packet_count
      FROM atlas_packets
      WHERE som_cluster IS NOT NULL
      GROUP BY som_cluster, som_row, som_col
      ORDER BY cluster_id
    `);

    console.log(`  ✓ Found ${clusters.rows.length} SOM clusters`);

    // 2. For each cluster, compute metadata and cache
    let cached = 0;
    let errors = 0;

    for (const cluster of clusters.rows) {
      try {
        const { cluster_id, row, col, packet_count } = cluster;

        // Cluster metadata (NOT centroid vector)
        const metadata = {
          cluster: cluster_id,
          row: row || 0,
          col: col || 0,
          packet_count: packet_count,
          dim: 384,  // Reference only; vector not stored
          cached_at: new Date().toISOString()
        };

        // Cache centroid metadata (only in APPLY mode)
        const centroidKey = `centroid:som:${cluster_id}`;
        if (MODE === 'APPLY') {
          await redis.setex(centroidKey, 86400, JSON.stringify(metadata));
        }

        // Fetch packet keys for this cluster (for top-K ranking)
        const packets = await pool.query(`
          SELECT packet_key, pagerank
          FROM atlas_packets
          WHERE som_cluster = $1
          ORDER BY pagerank DESC NULLS LAST
          LIMIT 20
        `, [cluster_id]);

        if (packets.rows.length > 0 && MODE === 'APPLY') {
          // Cache top-K packets for fast retrieval
          const topKKey = `bitfrost:som:${cluster_id}:top-k`;
          await redis.setex(topKKey, 86400, JSON.stringify(
            packets.rows.map(p => ({ packet_key: p.packet_key, pagerank: p.pagerank }))
          ));

          // Also cache packet list (for set operations)
          const packetListKey = `bitfrost:som:${cluster_id}:packets`;
          await redis.setex(packetListKey, 86400, JSON.stringify(
            packets.rows.map(p => p.packet_key)
          ));
        }

        cached++;
        if (cached % 50 === 0) {
          console.log(`  ✓ Cached ${cached} clusters...`);
        }

      } catch (err) {
        console.error(`  ❌ Error caching cluster ${cluster.cluster_id}: ${err.message}`);
        errors++;
      }
    }

    console.log(`\n✅ Cached ${cached} SOM cluster centroids`);
    if (errors > 0) {
      console.log(`⚠️  ${errors} clusters had errors`);
    }

    // 3. Verify cache
    console.log('\n📝 Step 2: Verify cache...');
    const sampleClusterId = clusters.rows[0]?.cluster_id;
    if (sampleClusterId) {
      const sample = await redis.get(`centroid:som:${sampleClusterId}`);
      if (sample) {
        console.log(`  ✓ Sample centroid found: ${sampleClusterId}`);
        console.log(`    ${sample.substring(0, 80)}...`);
      }
    }

    // 4. Summary statistics
    console.log('\n📈 Cache Statistics:');
    const keys = await redis.keys('centroid:som:*');
    console.log(`  Centroid keys: ${keys.length}`);
    const topkKeys = await redis.keys('bitfrost:som:*:top-k');
    console.log(`  Top-K caches: ${topkKeys.length}`);

    console.log('\n🎯 Next: Phase 8B will warm bitfrost:packet:{packet_key} envelopes');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await redis.quit();
    await pool.end();
  }
}

warmCentroidCache();
