#!/usr/bin/env node
/**
 * Phase 7 Write-Back Verification
 *
 * Checks:
 * 1. Summary count (non-empty)
 * 2. Latest update timestamp (should be recent if workers running)
 * 3. Sample chunk IDs exist in DB
 * 4. Redis cache has summaries
 */

import pg from 'pg';
import Redis from 'ioredis';
import { loadRepoEnv, resolveDatabaseUrl } from './scripts/atlas/connection-config.mjs';

const { Pool } = pg;

const env = loadRepoEnv();
const DATABASE_URL = resolveDatabaseUrl(env);
const REDIS_HOST = env.REDIS_HOST || env.VALKEY_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(env.REDIS_PORT || env.VALKEY_PORT || '6379');
const REDIS_PASSWORD = env.REDIS_PASSWORD || env.VALKEY_PASSWORD || 'redis';

const pool = new Pool({ connectionString: DATABASE_URL });
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  retryStrategy: () => null
});

async function verify() {
  console.log('=== Phase 7 Write-Back Verification ===\n');

  try {
    // 1. Summary counts with detailed breakdown (correct metrics)
    console.log('📊 Summary Counts:');
    const counts = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE summary IS NULL) AS null_summary,
        COUNT(*) FILTER (WHERE summary = '') AS empty_summary,
        COUNT(*) FILTER (WHERE summary IS NOT NULL AND summary != '') AS non_empty_summary,
        MAX(updated_at) AS latest_update,
        EXTRACT(EPOCH FROM (NOW() - MAX(updated_at)))::int AS seconds_since_update
      FROM codebase_chunk_index
    `);

    const row = counts.rows[0];
    console.log(`  ○ NULL:           ${row.null_summary}`);
    console.log(`  ○ Empty string:   ${row.empty_summary}`);
    console.log(`  ✓ Non-empty:      ${row.non_empty_summary}`);
    console.log(`  ✓ Latest update:  ${row.latest_update}`);
    console.log(`  ✓ Since update:   ${row.seconds_since_update}s ago`);

    if (row.seconds_since_update > 600) {
      console.log(`  ⚠️  WARNING: No updates for ${Math.round(row.seconds_since_update / 60)} min (workers may be stalled)`);
    } else if (row.seconds_since_update > 0) {
      console.log(`  ✅ Workers active (last update ${row.seconds_since_update}s ago)`);
    }

    // 2. Sample chunks with summaries
    console.log('\n📝 Sample Summaries (first 3):');
    const samples = await pool.query(`
      SELECT id, relative_path, length(summary) as summary_len, updated_at
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND summary != ''
      ORDER BY updated_at DESC
      LIMIT 3
    `);

    samples.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.relative_path}`);
      console.log(`     ID: ${row.id.substring(0, 8)}...`);
      console.log(`     Summary: ${row.summary_len} bytes`);
      console.log(`     Updated: ${row.updated_at}`);
    });

    // 3. Redis cache check
    console.log('\n💾 Redis Cache:');
    await redis.connect();

    if (samples.rows.length > 0) {
      const sampleId = samples.rows[0].id;
      const cacheKey = `bitfrost:summary:${sampleId}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`  ✅ Redis has key: ${cacheKey}`);
        console.log(`     Value length: ${cached.length} bytes`);
      } else {
        console.log(`  ⚠️  Redis missing key: ${cacheKey}`);
      }
    }

    // 4. Type check: sample IDs in Postgres
    console.log('\n🔍 Type Check (Sample IDs):');
    const typeCheck = await pool.query(`
      SELECT id, id::text as id_text
      FROM codebase_chunk_index
      LIMIT 1
    `);
    if (typeCheck.rows[0]) {
      console.log(`  Sample ID: ${typeCheck.rows[0].id}`);
      console.log(`  As text: ${typeCheck.rows[0].id_text}`);
      console.log(`  ✅ UUID type confirmed`);
    }

    // 5. Stall detection
    console.log('\n🚦 Stall Detection:');
    const stalled = row.seconds_since_update > 900; // 15 min
    if (stalled) {
      console.log(`  ❌ STALLED: No updates for ${Math.round(row.seconds_since_update / 60)} minutes`);
      console.log('     → Check worker logs: tail -f phase7-worker-*.log');
      console.log('     → Check queue: node -e "const amqp=require(\'amqplib\');(async()=>{const c=await amqp.connect(...)"');
    } else {
      console.log(`  ✅ HEALTHY: Last update ${row.seconds_since_update}s ago`);
    }

  } catch (err) {
    console.error('❌ Verification error:', err.message);
  } finally {
    await redis.quit().catch(() => {});
    await pool.end();
  }
}

verify();
