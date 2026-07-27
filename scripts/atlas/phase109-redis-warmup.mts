#!/usr/bin/env tsx

/**
 * Phase 109 Gap 1: Redis Bifrost Cache Warmup
 *
 * Warms Redis cache with stratified sample of Postgres packets.
 * Target: 10%+ cache hit rate on second run.
 *
 * Usage:
 *   npx tsx scripts/atlas/phase109-redis-warmup.mts [--samples=100] [--ttl=86400]
 */

import Redis from 'ioredis';
import pg from 'pg';

interface WarmupConfig {
  samplesCount: number;
  ttlSeconds: number;
  verbose: boolean;
}

interface WarmupMetrics {
  samplesLoaded: number;
  cacheHitsBeforeWarm: number;
  cacheHitsAfterWarm: number;
  estimatedHitRate: number;
  memoryBytesUsed: number;
  serializationMs: number;
  keysWritten: number;
  errors: string[];
}

async function parseArgs(): Promise<WarmupConfig> {
  const samplesCount = parseInt(
    process.argv.find(a => a.startsWith('--samples='))?.split('=')[1] || '100'
  );
  const ttlSeconds = parseInt(
    process.argv.find(a => a.startsWith('--ttl='))?.split('=')[1] || '86400'
  );
  const verbose = process.argv.includes('--verbose');

  return { samplesCount, ttlSeconds, verbose };
}

async function fetchStratifiedSample(
  pgPool: pg.Pool,
  sampleCount: number
): Promise<Array<{ packet_key: string; workspace_id: string; ontology_version: string; identity_hash: string }>> {
  // Stratified sample: divide packets into 10 buckets by packet_key hash, sample from each
  const query = `
    WITH ranked AS (
      SELECT
        packet_key,
        workspace_id,
        ontology_version,
        md5(packet_key || workspace_id || ontology_version) as identity_hash,
        ntile(10) OVER (ORDER BY packet_key) as bucket
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      AND workspace_id IS NOT NULL
      AND ontology_version IS NOT NULL
      LIMIT $1
    )
    SELECT DISTINCT ON (bucket)
      packet_key,
      workspace_id,
      ontology_version,
      identity_hash
    FROM ranked
    ORDER BY bucket, random()
    LIMIT $2;
  `;

  const result = await pgPool.query(query, [sampleCount * 20, sampleCount]);
  return result.rows;
}

async function writeToRedis(
  redis: Redis,
  samples: Array<{ packet_key: string; workspace_id: string; ontology_version: string; identity_hash: string }>,
  ttlSeconds: number,
  verbose: boolean
): Promise<{ keysWritten: number; errors: string[] }> {
  const errors: string[] = [];
  let keysWritten = 0;

  for (const sample of samples) {
    try {
      // Key format: ace:packet:{packet_key}
      const cacheKey = `ace:packet:${sample.packet_key}`;

      // Payload: minimal identity + hash
      const cacheValue = JSON.stringify({
        packet_key: sample.packet_key,
        workspace_id: sample.workspace_id,
        ontology_version: sample.ontology_version,
        identity_hash: sample.identity_hash,
        cached_at: new Date().toISOString(),
      });

      // Write with TTL
      await redis.setex(cacheKey, ttlSeconds, cacheValue);
      keysWritten++;

      if (verbose && keysWritten % 20 === 0) {
        console.log(`[INFO] Wrote ${keysWritten}/${samples.length} cache keys...`);
      }
    } catch (err) {
      errors.push(`Failed to write ${sample.packet_key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { keysWritten, errors };
}

async function validateCacheHitRate(
  redis: Redis,
  samples: Array<{ packet_key: string }>,
  verbose: boolean
): Promise<{ hits: number; misses: number; rate: number }> {
  let hits = 0;
  let misses = 0;

  for (const sample of samples) {
    const cacheKey = `ace:packet:${sample.packet_key}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      hits++;
    } else {
      misses++;
    }
  }

  const rate = samples.length > 0 ? hits / samples.length : 0;

  if (verbose) {
    console.log(`[CACHE VALIDATION] Hits: ${hits}/${samples.length} (${(rate * 100).toFixed(1)}%)`);
  }

  return { hits, misses, rate };
}

async function main(): Promise<void> {
  const config = await parseArgs();

  console.log(`[PHASE 109 GAP 1] Redis Cache Warmup`);
  console.log(`  Samples: ${config.samplesCount}`);
  console.log(`  TTL: ${config.ttlSeconds}s`);
  console.log(`  Verbose: ${config.verbose}`);
  console.log();

  const pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });

  const metrics: WarmupMetrics = {
    samplesLoaded: 0,
    cacheHitsBeforeWarm: 0,
    cacheHitsAfterWarm: 0,
    estimatedHitRate: 0,
    memoryBytesUsed: 0,
    serializationMs: 0,
    keysWritten: 0,
    errors: [],
  };

  try {
    // Connect
    console.log('[CONNECT] PostgreSQL...');
    await pgPool.query('SELECT 1');
    console.log('  ✅ Connected');

    console.log('[CONNECT] Redis/Valkey...');
    await redis.connect();
    console.log(`  ✅ Connected to ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);

    // Pre-warm cache hit rate (should be 0% on fresh state)
    console.log();
    console.log('[BASELINE] Checking cache before warmup...');
    const samples = await fetchStratifiedSample(pgPool, config.samplesCount);
    metrics.samplesLoaded = samples.length;

    const baselineValidation = await validateCacheHitRate(redis, samples, config.verbose);
    metrics.cacheHitsBeforeWarm = baselineValidation.hits;
    console.log(
      `  Hit rate before: ${(baselineValidation.rate * 100).toFixed(1)}% (${baselineValidation.hits}/${samples.length})`
    );

    // Warm cache
    console.log();
    console.log('[WARMUP] Writing samples to cache...');
    const startMs = Date.now();
    const writeResult = await writeToRedis(redis, samples, config.ttlSeconds, config.verbose);
    const serializationMs = Date.now() - startMs;

    metrics.keysWritten = writeResult.keysWritten;
    metrics.serializationMs = serializationMs;
    metrics.errors = writeResult.errors;

    console.log(`  ✅ Wrote ${writeResult.keysWritten} keys in ${serializationMs}ms`);

    if (writeResult.errors.length > 0) {
      console.log(`  ⚠️  ${writeResult.errors.length} errors encountered:`);
      writeResult.errors.slice(0, 3).forEach(e => console.log(`     ${e}`));
    }

    // Validate post-warm cache hit rate
    console.log();
    console.log('[VALIDATION] Checking cache after warmup...');
    const postWarmValidation = await validateCacheHitRate(redis, samples, config.verbose);
    metrics.cacheHitsAfterWarm = postWarmValidation.hits;
    metrics.estimatedHitRate = postWarmValidation.rate;

    console.log(
      `  Hit rate after: ${(postWarmValidation.rate * 100).toFixed(1)}% (${postWarmValidation.hits}/${samples.length})`
    );

    // Get Redis memory info
    console.log();
    console.log('[MEMORY] Checking Redis memory usage...');
    const info = await redis.info('memory');
    const memMatch = info.match(/used_memory:(\d+)/);
    if (memMatch) {
      metrics.memoryBytesUsed = parseInt(memMatch[1]);
      console.log(`  Memory used: ${(metrics.memoryBytesUsed / 1024 / 1024).toFixed(2)} MB`);
    }

    // Gate 1: Success Criteria
    console.log();
    console.log('[GATE 1] Cache Warmup Success Criteria:');
    const gate1Pass = writeResult.keysWritten === metrics.samplesLoaded && writeResult.errors.length === 0;
    console.log(`  ${gate1Pass ? '✅' : '❌'} All samples written (${metrics.keysWritten}/${metrics.samplesLoaded})`);
    console.log(
      `  ${writeResult.errors.length === 0 ? '✅' : '❌'} Zero serialization errors (${writeResult.errors.length})`
    );
    console.log(`  ℹ️  Hit rate after warmup: ${(metrics.estimatedHitRate * 100).toFixed(1)}%`);
    console.log(`  ℹ️  Expected on re-run: ≥10% (currently fresh state)`);

    // Summary
    console.log();
    console.log('[SUMMARY]');
    console.log(JSON.stringify(metrics, null, 2));

    if (gate1Pass) {
      console.log();
      console.log('✅ GATE 1 PASS: Redis cache warmed successfully');
      process.exit(0);
    } else {
      console.log();
      console.log('❌ GATE 1 FAIL: Some samples failed to write');
      process.exit(1);
    }
  } catch (err) {
    console.error('[ERROR]', err instanceof Error ? err.message : String(err));
    metrics.errors.push(err instanceof Error ? err.message : String(err));
    console.log();
    console.log('[SUMMARY]');
    console.log(JSON.stringify(metrics, null, 2));
    process.exit(1);
  } finally {
    await redis.quit();
    await pgPool.end();
  }
}

main();
