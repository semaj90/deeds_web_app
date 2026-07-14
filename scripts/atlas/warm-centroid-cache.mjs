#!/usr/bin/env node
/**
 * warm-centroid-cache.mjs
 *
 * Milestone 9: Load K-means centroids from gpu_cluster_centroids into Valkey/Redis
 * for O(1) nearest-centroid lookup at query time.
 *
 * Redis key layout:
 *   centroid:kmeans:{cluster_id}   → JSON { cluster_id, vec, chunk_count, topo_class, domain }
 *   centroid:kmeans:index           → JSON array of all cluster_ids (for scan-free iteration)
 *   centroid:kmeans:meta            → JSON { count, dim, method, cached_at }
 *
 * TTL: 24 hours (centroids are recomputed by persist-kmeans-centroids.mjs on each K-means run)
 *
 * Usage:
 *   node scripts/atlas/warm-centroid-cache.mjs [--dry-run] [--verbose]
 */

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const TTL_SECONDS = 24 * 60 * 60;  // 24h

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
  max: 3,
});

const redis = new Redis({
  host:               process.env.REDIS_HOST     || '127.0.0.1',
  port:               parseInt(process.env.REDIS_PORT || '6379'),
  password:           process.env.REDIS_PASSWORD || 'redis',
  lazyConnect:        true,
  enableOfflineQueue: false,
  retryStrategy:      () => null,
});

async function main() {
  const startTime = Date.now();
  console.log('🔥 Centroid Cache Warm — Milestone 9\n');
  console.log(`Mode:  ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  console.log(`TTL:   ${TTL_SECONDS / 3600}h`);

  // Connect Redis
  await redis.connect();
  await redis.ping();
  console.log('Redis: connected ✅');

  const client = await pool.connect();
  try {
    // 1. Load all centroids from Postgres
    const res = await client.query(`
      SELECT
        cluster_id,
        cluster_type,
        centroid_vec::text AS vec_text,
        chunk_count,
        topo_class,
        metadata
      FROM gpu_cluster_centroids
      WHERE cluster_type = 'kmeans_js'
      ORDER BY cluster_id
    `);

    const rows = res.rows;
    console.log(`\nCentroids loaded from Postgres: ${rows.length}`);

    if (rows.length === 0) {
      console.log('❌ No kmeans_js centroids found. Run atlas:centroids:persist first.');
      process.exit(1);
    }

    // Parse vector text "{0.1,0.2,...}" → number[]
    const centroids = rows.map(r => {
      const vec = r.vec_text.replace(/^\{|\}$/g, '').split(',').map(Number);
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata ?? {});
      return {
        cluster_id: r.cluster_id,
        vec,
        dim: vec.length,
        chunk_count: r.chunk_count,
        topo_class: r.topo_class,
        domain: meta.domain ?? null,
        vec_members: meta.vec_members ?? null,
        method: r.cluster_type,
      };
    });

    const dim = centroids[0]?.dim ?? 0;
    console.log(`Vector dimension: ${dim}`);

    if (DRY_RUN) {
      console.log('\nDRY RUN — sample cache entries:');
      for (const c of centroids.slice(0, 5)) {
        const preview = c.vec.slice(0, 4).map(v => v.toFixed(4)).join(', ');
        console.log(`  centroid:kmeans:${c.cluster_id} → cluster=${c.cluster_id} chunk_count=${c.chunk_count} dim=${c.dim} vec=[${preview}...]`);
      }
      console.log(`\nWould write ${centroids.length} centroid keys + 1 index + 1 meta to Redis.`);
      console.log('Re-run without --dry-run to apply.');
      return;
    }

    // 2. Write to Redis using pipeline for efficiency
    console.log('\nWriting to Redis...');
    const pipeline = redis.pipeline();
    const clusterIds = [];

    for (const c of centroids) {
      const key = `centroid:kmeans:${c.cluster_id}`;
      const value = JSON.stringify({
        cluster_id: c.cluster_id,
        vec: c.vec,
        dim: c.dim,
        chunk_count: c.chunk_count,
        topo_class: c.topo_class,
        domain: c.domain,
        vec_members: c.vec_members,
        method: c.method,
      });
      pipeline.setex(key, TTL_SECONDS, value);
      clusterIds.push(c.cluster_id);

      if (VERBOSE) {
        console.log(`  SET ${key} (${value.length} bytes, TTL=${TTL_SECONDS}s)`);
      }
    }

    // Index key — ordered list of all cluster_ids for fast scan
    pipeline.setex('centroid:kmeans:index', TTL_SECONDS, JSON.stringify(clusterIds));

    // Meta key
    pipeline.setex('centroid:kmeans:meta', TTL_SECONDS, JSON.stringify({
      count: centroids.length,
      dim,
      method: 'kmeans_js',
      cached_at: new Date().toISOString(),
    }));

    const results = await pipeline.exec();
    const errors = results.filter(([err]) => err !== null);
    if (errors.length > 0) {
      console.error(`Pipeline errors: ${errors.length}`);
      errors.slice(0, 3).forEach(([err]) => console.error(' ', err.message));
    }

    // 3. Verify
    const meta = await redis.get('centroid:kmeans:meta');
    const index = await redis.get('centroid:kmeans:index');
    const sample = await redis.get(`centroid:kmeans:0`);
    const indexParsed = JSON.parse(index ?? '[]');
    const sampleParsed = JSON.parse(sample ?? 'null');

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n📊 Cache Warm Complete');
    console.log('═'.repeat(60));
    console.log(`Centroids written:  ${centroids.length}`);
    console.log(`Index key:          centroid:kmeans:index (${indexParsed.length} ids) ✅`);
    console.log(`Meta key:           centroid:kmeans:meta ✅`);
    console.log(`Sample (cluster 0): dim=${sampleParsed?.dim}, chunk_count=${sampleParsed?.chunk_count}, topo=${sampleParsed?.topo_class} ✅`);
    console.log(`TTL:                ${TTL_SECONDS / 3600}h`);
    console.log(`Duration:           ${duration}s`);
    console.log('═'.repeat(60));

    if (indexParsed.length === centroids.length) {
      console.log('\n✅ Milestone 9 PASS — centroid cache warm in Valkey');
    } else {
      console.log(`\n❌ Index count mismatch: ${indexParsed.length} vs ${centroids.length}`);
      process.exit(1);
    }

  } finally {
    client.release();
    await pool.end();
    if (redis.status === 'ready') await redis.quit();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
