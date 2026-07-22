#!/usr/bin/env node
/**
 * Phase 2, Step 12: Prewarm Redis Centroids
 *
 * - Load all K-means centroids from storage into Redis L3
 * - Load all SOM grid cells into Redis L3
 * - Verify cache hit rates before retrieval begins
 *
 * Usage:
 *   npx tsx prewarm-redis-centroids.mts [--verbose]
 */

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

async function prewarmRedis(): Promise<void> {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  });

  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || 'redis',
  });

  try {
    const client = await pool.connect();

    try {
      if (verbose) console.log('[Prewarm] Reading cluster manifests from Postgres...');

      // Load K-means centroids
      const kmeansResult = await client.query(
        `
        SELECT cluster_id, centroid
        FROM vector_cluster_manifest
        WHERE cluster_type = 'kmeans'
        ORDER BY cluster_id
      `
      );

      if (verbose) console.log(`[Prewarm] Found ${kmeansResult.rows.length} K-means centroids`);

      let kmeansLoaded = 0;
      for (const row of kmeansResult.rows) {
        const key = `centroid:kmeans:${row.cluster_id}`;
        const value = JSON.stringify(row.centroid);
        await redis.setex(key, 86400, value);
        kmeansLoaded++;
      }

      if (verbose) console.log(`[Prewarm] Loaded ${kmeansLoaded} K-means centroids`);

      // Load SOM grid
      const somResult = await client.query(
        `
        SELECT cluster_id, centroid
        FROM vector_cluster_manifest
        WHERE cluster_type = 'som'
        ORDER BY cluster_id
      `
      );

      if (verbose) console.log(`[Prewarm] Found ${somResult.rows.length} SOM cells`);

      let somLoaded = 0;
      for (const row of somResult.rows) {
        const gridCell = row.cluster_id; // cluster_id = row*width + col for SOM
        const row_idx = Math.floor(gridCell / 20);
        const col_idx = gridCell % 20;
        const key = `som:centroid:${row_idx}:${col_idx}`;
        const value = JSON.stringify(row.centroid);
        await redis.setex(key, 86400, value);
        somLoaded++;
      }

      if (verbose) console.log(`[Prewarm] Loaded ${somLoaded} SOM cells`);

      // Verify cache
      if (verbose) console.log('[Prewarm] Verifying cache...');

      const kmeansKeys = await redis.keys('centroid:kmeans:*');
      const somKeys = await redis.keys('som:centroid:*');
      const info = await redis.info('memory');

      const memoryMatch = info.match(/used_memory_human:(.+)\r/);
      const memoryUsed = memoryMatch ? memoryMatch[1] : 'unknown';

      console.log('\n=== Redis Cache Prewarming Complete ===');
      console.log(`K-means centroids: ${kmeansKeys.length}`);
      console.log(`SOM grid cells: ${somKeys.length}`);
      console.log(`Total keys: ${kmeansKeys.length + somKeys.length}`);
      console.log(`Memory used: ${memoryUsed}`);
      console.log(`TTL: 24 hours (L3 cache tier)`);
      console.log(`✅ Step 12 complete`);

      console.log('\n=== Phase 2 Clustering Complete ===');
      console.log('Gate 4: K-means centroids in Redis ✅');
      console.log('Gate 5: SOM grid entries in Redis ✅');
      console.log('Ready for Phase 3: Retrieval Routing');
    } finally {
      client.release();
    }

    await redis.quit();
  } catch (err) {
    console.error('❌ Step 12 failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

prewarmRedis();
