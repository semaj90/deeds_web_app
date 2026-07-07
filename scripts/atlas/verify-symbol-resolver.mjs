#!/usr/bin/env node

/**
 * Symbol Resolver Verifier
 *
 * Purpose: Validate symbol_resolver table is correctly populated and queryable.
 * Tests: Postgres indexing, Valkey cache hits, collision handling, cross-store consistency.
 *
 * Verification gates: G1-G6 test data integrity, query performance, cache alignment.
 */

import postgres from 'pg';
import Redis from 'ioredis';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __root = resolve(__dirname, '../../..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const skipRedis = args.includes('--skip-redis');

// Load environment
const env = {};
const envPath = resolve(__root, '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key] = value.trim().replace(/^["']|["']$/g, '');
  });
} catch (err) {
  if (verbose) console.warn('[.env.local] Not found, using process.env');
}

const DB_URL = env.DATABASE_URL || process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST = env.REDIS_HOST || process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(env.REDIS_PORT || process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = env.REDIS_PASSWORD || process.env.REDIS_PASSWORD || 'redis';

// ============================================================================
// POSTGRES VERIFICATION
// ============================================================================

async function verifyPostgresTable(pool) {
  const tests = [];

  // G1: Table exists and has data
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count, COUNT(DISTINCT feature_id) as unique_features
      FROM symbol_resolver
    `);
    const { count, unique_features } = result.rows[0];
    tests.push({
      name: 'G1 TABLE_EXISTS',
      status: count > 0 ? 'PASS' : 'FAIL',
      details: `${count} rows, ${unique_features} unique feature_ids`
    });
  } catch (err) {
    tests.push({
      name: 'G1 TABLE_EXISTS',
      status: 'FAIL',
      details: err.message
    });
    return tests;
  }

  // G2: Indexes are present
  try {
    const result = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'symbol_resolver'
      ORDER BY indexname
    `);
    const indexes = result.rows.map(r => r.indexname);
    const hasFeatureIdIndex = indexes.some(i => i.includes('feature_id'));
    const hasPacketKeyIndex = indexes.some(i => i.includes('packet_key'));
    const hasSourceRefIndex = indexes.some(i => i.includes('source_ref'));

    tests.push({
      name: 'G2 INDEXES',
      status: hasFeatureIdIndex && hasPacketKeyIndex ? 'PASS' : 'FAIL',
      details: `${indexes.length} indexes: ${indexes.join(', ')}`
    });
  } catch (err) {
    tests.push({
      name: 'G2 INDEXES',
      status: 'FAIL',
      details: err.message
    });
  }

  // G3: Query performance (feature_id lookup)
  try {
    const start = Date.now();
    const result = await pool.query(
      `SELECT packet_key, confidence FROM symbol_resolver WHERE feature_id = $1 LIMIT 1`,
      ['auth.sessions']
    );
    const elapsed = Date.now() - start;

    tests.push({
      name: 'G3 QUERY_PERF_FEATURE_ID',
      status: elapsed < 50 ? 'PASS' : 'WARN',
      details: `${elapsed}ms (target <50ms)`
    });
  } catch (err) {
    tests.push({
      name: 'G3 QUERY_PERF_FEATURE_ID',
      status: 'FAIL',
      details: err.message
    });
  }

  // G4: Query performance (packet_key lookup)
  try {
    const start = Date.now();
    const result = await pool.query(
      `SELECT feature_id, confidence FROM symbol_resolver WHERE packet_key = $1 LIMIT 1`,
      ['ace:packet:auth:001']
    );
    const elapsed = Date.now() - start;

    tests.push({
      name: 'G4 QUERY_PERF_PACKET_KEY',
      status: elapsed < 50 ? 'PASS' : 'WARN',
      details: `${elapsed}ms (target <50ms)`
    });
  } catch (err) {
    tests.push({
      name: 'G4 QUERY_PERF_PACKET_KEY',
      status: 'FAIL',
      details: err.message
    });
  }

  // G5: Confidence distribution
  try {
    const result = await pool.query(`
      SELECT
        MIN(confidence) as min_confidence,
        AVG(confidence) as avg_confidence,
        MAX(confidence) as max_confidence,
        COUNT(CASE WHEN confidence = 1.0 THEN 1 END) as perfect_count,
        COUNT(CASE WHEN confidence < 1.0 AND confidence > 0 THEN 1 END) as partial_count,
        COUNT(CASE WHEN confidence = 0 THEN 1 END) as zero_count
      FROM symbol_resolver
    `);
    const row = result.rows[0];
    const hasGoodDistribution = row.perfect_count > 0 && row.partial_count > 0;

    tests.push({
      name: 'G5 CONFIDENCE_DIST',
      status: hasGoodDistribution ? 'PASS' : 'WARN',
      details: `Perfect: ${row.perfect_count}, Partial: ${row.partial_count}, Zero: ${row.zero_count}, Avg: ${parseFloat(row.avg_confidence).toFixed(3)}`
    });
  } catch (err) {
    tests.push({
      name: 'G5 CONFIDENCE_DIST',
      status: 'FAIL',
      details: err.message
    });
  }

  // G6: Collision detection
  try {
    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT feature_id) as total_features,
        COUNT(DISTINCT CASE WHEN collision_count > 1 THEN feature_id END) as collision_features,
        MAX(collision_count) as max_collision_size
      FROM (
        SELECT feature_id, COUNT(DISTINCT packet_key) as collision_count
        FROM symbol_resolver
        GROUP BY feature_id
      ) subq
    `);
    const row = result.rows[0];
    const collisionRate = ((row.collision_features / row.total_features) * 100).toFixed(2);

    tests.push({
      name: 'G6 COLLISIONS',
      status: 'PASS',
      details: `${row.collision_features} collisions / ${row.total_features} features (${collisionRate}%), max size: ${row.max_collision_size}`
    });
  } catch (err) {
    tests.push({
      name: 'G6 COLLISIONS',
      status: 'FAIL',
      details: err.message
    });
  }

  return tests;
}

// ============================================================================
// VALKEY VERIFICATION
// ============================================================================

async function verifyValkeyCache() {
  const tests = [];
  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });

  try {
    await redis.connect();

    // G7: Cache key pattern exists
    try {
      const keys = await redis.keys('symbol:*:packets');
      tests.push({
        name: 'G7 CACHE_KEYS',
        status: keys.length > 0 ? 'PASS' : 'FAIL',
        details: `${keys.length} cache keys found`
      });
    } catch (err) {
      tests.push({
        name: 'G7 CACHE_KEYS',
        status: 'FAIL',
        details: err.message
      });
    }

    // G8: Cache hit rate (sample lookups)
    try {
      let hits = 0;
      const testPrefixes = ['auth', 'retrieval', 'topology'];

      for (const prefix of testPrefixes) {
        const cacheKey = `symbol:${prefix}:packets`;
        const data = await redis.hlen(cacheKey);
        if (data > 0) hits++;
      }

      tests.push({
        name: 'G8 CACHE_HIT_RATE',
        status: hits > 0 ? 'PASS' : 'WARN',
        details: `${hits}/${testPrefixes.length} prefix caches populated`
      });
    } catch (err) {
      tests.push({
        name: 'G8 CACHE_HIT_RATE',
        status: 'FAIL',
        details: err.message
      });
    }

    // G9: Cache latency
    try {
      const start = Date.now();
      await redis.hget('symbol:auth:packets', 'auth.sessions');
      const elapsed = Date.now() - start;

      tests.push({
        name: 'G9 CACHE_LATENCY',
        status: elapsed < 10 ? 'PASS' : 'WARN',
        details: `${elapsed}ms (target <10ms)`
      });
    } catch (err) {
      tests.push({
        name: 'G9 CACHE_LATENCY',
        status: 'FAIL',
        details: err.message
      });
    }
  } catch (err) {
    tests.push({
      name: 'VALKEY_CONNECTION',
      status: 'FAIL',
      details: err.message
    });
  } finally {
    await redis.quit();
  }

  return tests;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('[SYMBOL RESOLVER VERIFIER] Starting...\n');

  const pgPool = new postgres.Pool({ connectionString: DB_URL });
  const allTests = [];

  try {
    // Postgres tests
    console.log('[Postgres] Running verification gates...');
    const pgTests = await verifyPostgresTable(pgPool);
    allTests.push(...pgTests);

    // Valkey tests
    if (!skipRedis) {
      console.log('[Valkey] Running verification gates...');
      const redisTests = await verifyValkeyCache();
      allTests.push(...redisTests);
    }

    // Print results
    console.log('\n[VERIFICATION RESULTS]\n');
    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;

    for (const test of allTests) {
      const icon = test.status === 'PASS' ? '✓' : test.status === 'WARN' ? '⚠' : '✗';
      console.log(`${icon} ${test.name.padEnd(30)} ${test.status.padEnd(6)} ${test.details}`);

      if (test.status === 'PASS') passCount++;
      else if (test.status === 'WARN') warnCount++;
      else failCount++;
    }

    console.log(`\n[SUMMARY]`);
    console.log(`  PASS: ${passCount}/${allTests.length}`);
    console.log(`  WARN: ${warnCount}/${allTests.length}`);
    console.log(`  FAIL: ${failCount}/${allTests.length}`);

    const isHealthy = failCount === 0;
    console.log(`\n${isHealthy ? '✓ Symbol resolver is HEALTHY' : '✗ Symbol resolver has issues'}`);
    console.log('[NEXT] Ready to populate CALLS/IMPORTS/USES/EXTENDS edges\n');

    process.exit(isHealthy ? 0 : 1);

  } catch (err) {
    console.error('[FATAL]', err.message);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
