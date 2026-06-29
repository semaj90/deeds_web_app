#!/usr/bin/env node

/**
 * BitFrost Warm-Up Orchestrator
 *
 * Purpose: Load analysis_pass_results from Postgres into Redis BitFrost cache
 * for fast subsequent queries.
 *
 * Pipeline:
 *   1. Read analysis_pass_results from Postgres (WHERE status='success')
 *   2. Transform to BitFrost cache format
 *   3. Write to Redis with appropriate keys and TTL
 *   4. Log coverage stats
 *
 * Usage:
 *   npm run bitfrost:warm:startup
 *   npm run bitfrost:warm:startup -- --dry-run
 *   npm run bitfrost:warm:startup -- --ttl 86400
 */

import pkg from 'pg';
import Redis from 'ioredis';

const { Pool } = pkg;

// Parse CLI arguments
const isDryRun = process.argv.includes('--dry-run');
const ttlArg = process.argv.find(arg => arg.startsWith('--ttl='));
const ttl = ttlArg ? parseInt(ttlArg.split('=')[1]) : 604800; // 7 days default

// Postgres connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'legal_ai_db'
});

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null
});

async function warmBitFrostCache() {
  console.log('[BitFrost Warm-Up] Starting cache warm-up...');
  console.log(`[BitFrost Warm-Up] TTL=${ttl}s, Dry-run=${isDryRun}`);

  let client;
  try {
    // 1. Connect to Postgres
    console.log('[BitFrost Warm-Up] Connecting to Postgres...');
    client = await pool.connect();

    // 2. Fetch successful analysis passes
    console.log('[BitFrost Warm-Up] Fetching analysis_pass_results from Postgres...');
    const result = await client.query(`
      SELECT
        packet_key,
        source_ref,
        feature_id,
        output,
        provenance,
        created_at
      FROM analysis_pass_results
      WHERE status = 'success'
      ORDER BY created_at DESC
    `);

    const passes = result.rows;
    console.log(`[BitFrost Warm-Up] 📦 Loaded ${passes.length} successful passes`);

    if (passes.length === 0) {
      console.warn('[BitFrost Warm-Up] ⚠️  No successful passes to cache');
      return;
    }

    // 3. Connect Redis if not dry-run
    if (!isDryRun) {
      await redis.connect();
      console.log('[BitFrost Warm-Up] ✅ Redis connected');
    }

    // 4. Write to BitFrost cache
    let cachedCount = 0;
    let skippedCount = 0;
    const pipeline = !isDryRun ? redis.pipeline() : null;

    for (const pass of passes) {
      if (!pass.packet_key || !pass.output) {
        skippedCount++;
        continue;
      }

      // Parse JSONB fields
      const outputObj = typeof pass.output === 'string' ? JSON.parse(pass.output) : (pass.output || {});
      const provenanceObj = typeof pass.provenance === 'string' ? JSON.parse(pass.provenance) : (pass.provenance || {});

      // Construct cache entry
      const cacheEntry = {
        packet_key: pass.packet_key,
        source_ref: pass.source_ref,
        feature_id: pass.feature_id,
        summary: outputObj.summary || '',
        tags: outputObj.tags || [],
        confidence: 0.95, // Real summaries get high confidence
        created_at: pass.created_at,
        provenance: provenanceObj
      };

      const cacheKey = `bifrost:packet:${pass.packet_key}`;

      if (isDryRun) {
        console.log(`[DRY] ${cacheKey} → summary="${(cacheEntry.summary || '').substring(0, 40)}..."`);
        cachedCount++;
      } else {
        if (pipeline) {
          pipeline.set(cacheKey, JSON.stringify(cacheEntry), 'EX', ttl);
        }

        // Also cache by feature_id for faster feature lookups
        if (pass.feature_id && pipeline) {
          const featureKey = `bifrost:feature:${pass.feature_id}`;
          pipeline.set(
            featureKey,
            JSON.stringify({
              feature_id: pass.feature_id,
              tags: cacheEntry.tags,
              confidence: cacheEntry.confidence,
              examples: [pass.packet_key]
            }),
            'EX',
            ttl
          );
        }

        cachedCount++;
      }

      // Log progress every 50 passes
      if (cachedCount % 50 === 0) {
        console.log(`[BitFrost Warm-Up] ⏳ Cached ${cachedCount} passes...`);
      }
    }

    // 5. Execute pipeline
    if (!isDryRun && pipeline) {
      await pipeline.exec();
      console.log(`[BitFrost Warm-Up] ✅ Cached ${cachedCount} passes in Redis`);
    } else if (isDryRun) {
      console.log(`[BitFrost Warm-Up] [DRY] Would cache ${cachedCount} passes`);
    }

    console.log(`[BitFrost Warm-Up] 📊 Stats:`);
    console.log(`     Cached: ${cachedCount}`);
    console.log(`     Skipped: ${skippedCount}`);
    console.log(`     Coverage: ${((cachedCount / (cachedCount + skippedCount)) * 100).toFixed(1)}%`);
    console.log(`[BitFrost Warm-Up] ✅ Complete`);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BitFrost Warm-Up] Error:', message);
    process.exit(1);
  } finally {
    if (client) client.release();
    if (redis && redis.isOpen) await redis.quit();
    await pool.end();
  }
}

warmBitFrostCache();