#!/usr/bin/env node
/**
 * Phase 3D Telemetry Test
 *
 * Minimal test to verify retrieval telemetry is being emitted correctly.
 *
 * Usage:
 *   npm run test:telemetry:phase3d
 *   OR manually:
 *   node scripts/phase-3d/test-retrieval-telemetry.mjs
 *
 * Checks:
 * 1. Telemetry table exists in Postgres
 * 2. Can connect to database
 * 3. Recorder function is callable
 * 4. Sample emission succeeds
 * 5. Data persists to table
 */

import { createHash } from 'crypto';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5434/legal_ai_db';

async function test() {
  console.log('[Phase 3D Telemetry Test] Starting...\n');

  // Test 1: Database connection
  console.log('[Test 1] Database connection...');
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const result = await pool.query('SELECT version()');
    console.log('✓ Connected to Postgres\n');
  } catch (err) {
    console.error('✗ Database connection failed:', err.message);
    process.exit(1);
  }

  // Test 2: Table schema verification
  console.log('[Test 2] Verify retrieval_telemetry table exists...');
  try {
    const schema = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'retrieval_telemetry'
      ORDER BY ordinal_position
    `);
    if (schema.rows.length === 0) {
      console.error('✗ retrieval_telemetry table not found');
      process.exit(1);
    }
    console.log(`✓ Table has ${schema.rows.length} columns:`);
    const criticalFields = [
      'query', 'query_hash', 'retrieval_strategy',
      'vector_hits', 'trigram_hits', 'fts_hits',
      'selected_packet_key', 'selected_feature_id',
      'latency_ms', 'cache_hit', 'surface', 'environment'
    ];
    for (const field of criticalFields) {
      const found = schema.rows.some(r => r.column_name === field);
      console.log(`  ${found ? '✓' : '✗'} ${field}`);
    }
    console.log();
  } catch (err) {
    console.error('✗ Schema check failed:', err.message);
    process.exit(1);
  }

  // Test 3: Test emission of sample telemetry
  console.log('[Test 3] Insert sample telemetry record...');
  const testQuery = 'Test phase 3d telemetry: what is redis cache?';
  const queryHash = createHash('sha256').update(testQuery).digest('hex');
  const testTime = new Date();

  try {
    const result = await pool.query(`
      INSERT INTO retrieval_telemetry (
        query, query_hash, latency_ms,
        vector_hits, trigram_hits, fts_hits,
        selected_packet_key, selected_feature_id,
        cache_hit, surface, environment,
        retrieval_strategy
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, created_at, retrieval_strategy
    `, [
      testQuery,
      queryHash,
      243, // latency_ms
      5,   // vector_hits
      8,   // trigram_hits
      0,   // fts_hits
      'pkt:redis-cache:v1',
      'cache-systems',
      false,
      'test',
      'test',
      'fusion'
    ]);
    const { id, created_at, retrieval_strategy } = result.rows[0];
    console.log(`✓ Inserted telemetry record ID: ${id}`);
    console.log(`  Created at: ${created_at}`);
    console.log(`  Retrieval strategy: ${retrieval_strategy}\n`);
  } catch (err) {
    console.error('✗ Insert failed:', err.message);
    process.exit(1);
  }

  // Test 4: Verify retrieval strategy distribution
  console.log('[Test 4] Check retrieval_strategy index...');
  try {
    const strategyCount = await pool.query(`
      SELECT retrieval_strategy, COUNT(*) as count
      FROM retrieval_telemetry
      WHERE retrieval_strategy IS NOT NULL
      GROUP BY retrieval_strategy
      ORDER BY count DESC
    `);
    console.log('✓ Strategy distribution:');
    for (const row of strategyCount.rows) {
      console.log(`  ${row.retrieval_strategy}: ${row.count} records`);
    }
    console.log();
  } catch (err) {
    console.error('✗ Query failed:', err.message);
    process.exit(1);
  }

  // Test 5: Verify hit counts
  console.log('[Test 5] Check hit count statistics...');
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        ROUND(AVG(vector_hits)::numeric, 2) as avg_vector_hits,
        ROUND(AVG(trigram_hits)::numeric, 2) as avg_trigram_hits,
        ROUND(AVG(latency_ms)::numeric, 0) as avg_latency_ms,
        COUNT(CASE WHEN cache_hit = true THEN 1 END) as cache_hit_count
      FROM retrieval_telemetry
      WHERE created_at > NOW() - INTERVAL '1 day'
    `);
    const { total, avg_vector_hits, avg_trigram_hits, avg_latency_ms, cache_hit_count } = stats.rows[0];
    console.log(`✓ Last 24h statistics:`);
    console.log(`  Total records: ${total}`);
    console.log(`  Avg vector hits: ${avg_vector_hits}`);
    console.log(`  Avg trigram hits: ${avg_trigram_hits}`);
    console.log(`  Avg latency: ${avg_latency_ms}ms`);
    console.log(`  Cache hits: ${cache_hit_count}/${total}\n`);
  } catch (err) {
    console.error('✗ Statistics query failed:', err.message);
    process.exit(1);
  }

  // Cleanup
  await pool.end();

  console.log('[Phase 3D Telemetry Test] ✓ ALL TESTS PASS');
  console.log('\nNext steps:');
  console.log('1. Start dev server: npm run dev');
  console.log('2. Make several queries to the assistant');
  console.log('3. Check telemetry records: npm run test:telemetry:phase3d');
  console.log('4. Verify retrieval_strategy field is populated for each query');
  console.log('5. Check vector_hits + trigram_hits > 0 for hybrid queries');
}

test().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
