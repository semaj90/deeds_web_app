#!/usr/bin/env node

/**
 * PHASE 85 P6: REDIS CACHE INVALIDATION
 *
 * Step 4 of 5-step canonical flow: invalidate Redis caches after Postgres writes
 * - BitFrost L1/L2 exact-match cache
 * - Semantic cache keys for feature_labels
 * - Centroid caches for SOM clustering
 * - Track invalidation metrics
 *
 * Execution: AFTER P5 backfill completes (Postgres write successful)
 * Dependency: atlas_artifacts must exist and contain feature_labels
 *
 * Usage:
 *   node scripts/phase85/p6-redis-invalidation.mjs --dry-run
 *   node scripts/phase85/p6-redis-invalidation.mjs [--apply]
 */

import Redis from 'ioredis';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// Initialize Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || 'redis',
  enableOfflineQueue: false,
  retryStrategy: () => null,
  lazyConnect: true
});

redis.on('error', (err) => {
  if (verbose) console.warn(`[redis] ${err.message}`);
});

console.log(`\n♻️  PHASE 85 P6: REDIS CACHE INVALIDATION\n`);
console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
console.log(`Redis: ${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}\n`);

// ── Cache key patterns to invalidate ────────────────────────────────────

const CACHE_PATTERNS = [
  'bifrost:packet:*',           // L1 exact-match cache
  'bifrost:feature:*',          // Feature semantic cache
  'centroid:feature:*',         // SOM cluster centroids
  'centroid:packet:*',          // Packet-specific centroids
  'ace:cache:*',                // ACE context cache
  'search:results:*'            // Search result cache
];

// ── Step 1: Connect to Redis ────────────────────────────────────────────

async function connectRedis() {
  try {
    await redis.connect();
    await redis.ping();
    if (verbose) console.log('✅ Redis connected');
    return true;
  } catch (err) {
    console.error(`❌ Redis connection failed: ${err.message}`);
    return false;
  }
}

// ── Step 2: Count keys to invalidate ────────────────────────────────────

async function countKeysToInvalidate() {
  let totalKeys = 0;
  const breakdown = {};

  for (const pattern of CACHE_PATTERNS) {
    try {
      const count = await redis.keys(pattern).then(keys => keys.length);
      breakdown[pattern] = count;
      totalKeys += count;
      if (verbose) console.log(`   ${pattern}: ${count} keys`);
    } catch (err) {
      console.error(`   ❌ Error counting ${pattern}: ${err.message}`);
    }
  }

  return { totalKeys, breakdown };
}

// ── Step 3: Invalidate cache keys ──────────────────────────────────────

async function invalidateCacheKeys() {
  let deleted = 0;
  const results = {};

  for (const pattern of CACHE_PATTERNS) {
    if (dryRun) {
      const count = await redis.keys(pattern).then(keys => keys.length);
      results[pattern] = { deleted: count, status: 'DRY-RUN' };
      deleted += count;
      if (verbose) console.log(`   [DRY-RUN] ${pattern}: would delete ${count} keys`);
      continue;
    }

    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        keys.forEach(key => pipeline.del(key));
        await pipeline.exec();
        results[pattern] = { deleted: keys.length, status: 'OK' };
        deleted += keys.length;
        if (verbose) console.log(`   ✅ ${pattern}: deleted ${keys.length} keys`);
      } else {
        results[pattern] = { deleted: 0, status: 'OK' };
      }
    } catch (err) {
      console.error(`   ❌ Error invalidating ${pattern}: ${err.message}`);
      results[pattern] = { deleted: 0, status: 'ERROR', error: err.message };
    }
  }

  return { deleted, results };
}

// ── Step 4: Verify cache is empty ──────────────────────────────────────

async function verifyCacheInvalidation() {
  let remainingKeys = 0;

  for (const pattern of CACHE_PATTERNS) {
    try {
      const count = await redis.keys(pattern).then(keys => keys.length);
      if (count > 0) {
        console.warn(`   ⚠️  ${pattern}: ${count} keys still remain`);
        remainingKeys += count;
      }
    } catch (err) {
      console.error(`   ❌ Error verifying ${pattern}: ${err.message}`);
    }
  }

  return remainingKeys;
}

// ── Main execution ────────────────────────────────────────────────────

async function main() {
  try {
    // Connect to Redis
    const connected = await connectRedis();
    if (!connected) {
      console.error('❌ Cannot proceed without Redis connection');
      process.exit(1);
    }

    // Count keys
    console.log('📊 Scanning cache keys...');
    const { totalKeys, breakdown } = await countKeysToInvalidate();
    console.log(`   Total keys to invalidate: ${totalKeys}\n`);

    // Invalidate
    console.log(dryRun ? '🔍 DRY-RUN: Would invalidate:' : '♻️  Invalidating cache:');
    const { deleted, results } = await invalidateCacheKeys();
    console.log(`   Total deleted: ${deleted}\n`);

    // Verify
    console.log('✅ Verifying invalidation...');
    const remaining = await verifyCacheInvalidation();

    // Summary
    console.log(`\n📊 P6 INVALIDATION SUMMARY:`);
    console.log(`   Pattern count: ${CACHE_PATTERNS.length}`);
    console.log(`   Keys invalidated: ${deleted}`);
    console.log(`   Keys remaining: ${remaining}`);

    if (remaining === 0) {
      console.log(`   ✅ Cache fully invalidated\n`);
    } else {
      console.log(`   ⚠️  ${remaining} keys still in cache\n`);
    }

    if (dryRun) {
      console.log('🔄 DRY-RUN MODE: No changes applied');
      console.log('   Run without --dry-run flag to apply invalidation\n');
    }

    await redis.quit();
  } catch (err) {
    console.error('❌ Invalidation failed:', err.message);
    await redis.quit();
    process.exit(1);
  }
}

main();