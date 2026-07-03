#!/usr/bin/env node
/**
 * Phase 8 Incremental: BitFrost Hot Bucket Warming (Concurrent with Phase 7)
 *
 * This script continuously monitors summarized chunks and warms BitFrost hot buckets
 * as summaries are generated in Phase 7, enabling immediate cache hits rather than
 * waiting until Phase 7 completion.
 *
 * Usage:
 *   node phase8-bitfrost-hot-buckets-incremental.mjs --poll-interval=30
 *     (checks every 30 seconds for new summaries)
 *
 * Architecture:
 *   - Poll Postgres for recently summarized chunks (updated_at DESC LIMIT N)
 *   - Build BitFrost bucket tuples (language → [packet_ids], kind → [...], feature → [...])
 *   - Atomically SADD to Redis with 7-day TTL
 *   - Track last_summarized_id to avoid re-warming
 *   - Stop when Phase 7 complete (no new summaries in 2 polls)
 */

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

// Config
const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5434');
const DB_USER = process.env.DATABASE_USER || 'legal_admin';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || '123456';
const DB_NAME = process.env.DATABASE_NAME || 'legal_ai_db';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';

const POLL_INTERVAL = parseInt(process.argv.find(a => a.startsWith('--poll-interval='))?.split('=')[1] || '30') * 1000;
const BATCH_SIZE = 100; // Warm 100 summaries at a time
const IDLE_THRESHOLD = 2; // Stop after N polls with no new summaries

// Normalized key function (from Phase 7 producer)
function normalizeKey(value) {
  if (!value) return 'unknown';
  return String(value).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME
});

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  retryStrategy: () => null
});

async function warmBitfrostIncremental() {
  console.log(`\n🔥 Phase 8 Incremental: BitFrost Hot Bucket Warming\n`);
  console.log(`  Poll interval: ${POLL_INTERVAL / 1000}s`);
  console.log(`  Batch size: ${BATCH_SIZE} summaries per poll\n`);

  await redis.connect();

  let lastProcessedTime = null;
  let consecutiveNoNew = 0;
  let totalWarmed = 0;

  const pollLoop = setInterval(async () => {
    try {
      // Fetch recently summarized chunks
      let result;
      if (lastProcessedTime) {
        result = await pool.query(`
          SELECT
            id,
            relative_path,
            language,
            kind,
            symbol,
            updated_at
          FROM codebase_chunk_index
          WHERE summary IS NOT NULL AND LENGTH(summary) > 0
            AND updated_at > $1
          ORDER BY updated_at DESC
          LIMIT $2
        `, [lastProcessedTime, BATCH_SIZE]);
      } else {
        result = await pool.query(`
          SELECT
            id,
            relative_path,
            language,
            kind,
            symbol,
            updated_at
          FROM codebase_chunk_index
          WHERE summary IS NOT NULL AND LENGTH(summary) > 0
          ORDER BY updated_at DESC
          LIMIT $1
        `, [BATCH_SIZE]);
      }

      const chunks = result.rows;

      if (chunks.length === 0) {
        consecutiveNoNew++;
        console.log(`  ⏱️  Poll: No new summaries (${consecutiveNoNew}/${IDLE_THRESHOLD})`);

        if (consecutiveNoNew >= IDLE_THRESHOLD) {
          console.log(`\n  ✅ Phase 7 complete - BitFrost warming finished`);
          clearInterval(pollLoop);
          await redis.quit();
          await pool.end();
          process.exit(0);
        }
        return;
      }

      consecutiveNoNew = 0;

      // Build bucket tuples
      const buckets = {
        language: new Map(),
        kind: new Map(),
        feature: new Map()
      };

      for (const chunk of chunks) {
        const key = chunk.relative_path;

        // Language bucket
        if (chunk.language) {
          const langKey = `bitfrost:hot:language:${normalizeKey(chunk.language)}`;
          if (!buckets.language.has(langKey)) buckets.language.set(langKey, []);
          buckets.language.get(langKey).push(key);
        }

        // Kind bucket
        if (chunk.kind) {
          const kindKey = `bitfrost:hot:kind:${normalizeKey(chunk.kind)}`;
          if (!buckets.kind.has(kindKey)) buckets.kind.set(kindKey, []);
          buckets.kind.get(kindKey).push(key);
        }

        // Feature bucket (from symbol or filename)
        const featureId = chunk.symbol ? chunk.symbol.split('.')[0] : chunk.relative_path.split('/')[1];
        if (featureId) {
          const featureKey = `bitfrost:hot:feature:${normalizeKey(featureId)}`;
          if (!buckets.feature.has(featureKey)) buckets.feature.set(featureKey, []);
          buckets.feature.get(featureKey).push(key);
        }
      }

      // Write to Redis atomically
      const pipeline = redis.pipeline();
      const ttl = 86400 * 7; // 7 days

      for (const [key, members] of buckets.language) {
        pipeline.sadd(key, ...members);
        pipeline.expire(key, ttl);
      }
      for (const [key, members] of buckets.kind) {
        pipeline.sadd(key, ...members);
        pipeline.expire(key, ttl);
      }
      for (const [key, members] of buckets.feature) {
        pipeline.sadd(key, ...members);
        pipeline.expire(key, ttl);
      }

      await pipeline.exec();

      totalWarmed += chunks.length;
      lastProcessedTime = chunks[chunks.length - 1].updated_at;

      console.log(`  ✅ Warmed ${chunks.length} summaries (total: ${totalWarmed})`);
      console.log(`     - Language buckets: ${buckets.language.size}`);
      console.log(`     - Kind buckets: ${buckets.kind.size}`);
      console.log(`     - Feature buckets: ${buckets.feature.size}\n`);

    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
    }
  }, POLL_INTERVAL);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log(`\n\n  ✅ Warming stopped\n`);
    console.log(`  📊 Statistics:`);
    console.log(`     - Total summaries warmed: ${totalWarmed}`);
    console.log(`     - Last processed time: ${lastProcessedTime}\n`);
    clearInterval(pollLoop);
    await redis.quit();
    await pool.end();
    process.exit(0);
  });
}

warmBitfrostIncremental().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
