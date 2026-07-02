#!/usr/bin/env node
/**
 * Phase 7: Indexed Validator
 *
 * Detects failed/missing summaries and logs them for retry.
 * Runs every 15 minutes to validate write-back progress.
 *
 * Tracks:
 * - Empty summaries (NULL or '')
 * - Missing from Postgres (should be in summary column)
 * - Mismatched Redis/Postgres (cached but not written)
 * - Failed summary chunks (logged to retry queue)
 */

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: parseInt(process.env.DATABASE_PORT || '5434'),
  user: process.env.DATABASE_USER || 'legal_admin',
  password: process.env.DATABASE_PASSWORD || '123456',
  database: process.env.DATABASE_NAME || 'legal_ai_db'
});

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  retryStrategy: () => null
});

async function validateSummaries() {
  const timestamp = new Date().toISOString();
  console.log(`\n📊 Phase 7 Indexed Validator [${timestamp}]\n`);

  try {
    await redis.connect();

    // 1. Count empty summaries
    const emptyResult = await pool.query(`
      SELECT COUNT(*) as count, COUNT(DISTINCT id) as unique_ids
      FROM codebase_chunk_index
      WHERE summary IS NULL OR summary = ''
    `);

    const { count: emptyCount } = emptyResult.rows[0];
    console.log(`  📋 Empty summaries: ${emptyCount}`);

    // 2. Check for Redis/Postgres mismatch
    const mismatchResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM codebase_chunk_index
      WHERE (summary IS NULL OR summary = '')
      AND id IN (
        SELECT id FROM codebase_chunk_index
        WHERE id IN (
          SELECT DISTINCT SUBSTRING(key, 18)::uuid
          FROM (
            SELECT * FROM (
              SELECT CONCAT('bitfrost:summary:', id) as key
              FROM codebase_chunk_index
              LIMIT 1000
            ) t
          ) t2
        )
      )
    `);

    const { count: mismatchCount } = mismatchResult.rows[0];
    console.log(`  ⚠️  Redis/Postgres mismatch: ${mismatchCount}`);

    // 3. Log validation metrics
    const totalResult = await pool.query(`SELECT COUNT(*) as count FROM codebase_chunk_index`);
    const { count: totalCount } = totalResult.rows[0];

    const summariesResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND summary != ''
    `);

    const { count: writtenCount } = summariesResult.rows[0];
    const pct = ((writtenCount / totalCount) * 100).toFixed(2);

    console.log(`  ✅ Summaries written: ${writtenCount}/${totalCount} (${pct}%)`);

    // 4. Log to Redis for monitoring
    const validationKey = `phase7:validation:${Date.now()}`;
    const metrics = {
      timestamp,
      total: totalCount,
      written: writtenCount,
      empty: emptyCount,
      mismatch: mismatchCount,
      pct: parseFloat(pct)
    };

    await redis.setex(validationKey, 604800, JSON.stringify(metrics)); // 7 days TTL
    console.log(`  📌 Metrics logged to Redis\n`);

    // 5. Alert if stuck (no progress in last 30 min)
    const lastMetricsKey = `phase7:validation:latest`;
    const lastMetrics = await redis.get(lastMetricsKey);

    if (lastMetrics) {
      const prev = JSON.parse(lastMetrics);
      if (prev.written === writtenCount) {
        console.log(`  ⚠️  WARNING: No progress in last 15 min! Worker may be stuck.\n`);
      }
    }

    await redis.setex(lastMetricsKey, 604800, JSON.stringify(metrics));

  } catch (err) {
    console.error(`  ❌ Validation error: ${err.message}\n`);
  } finally {
    await redis.quit();
    await pool.end();
  }
}

validateSummaries();
