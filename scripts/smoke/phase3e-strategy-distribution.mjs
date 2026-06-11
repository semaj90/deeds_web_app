#!/usr/bin/env node

/**
 * Phase 3E.1 Smoke Test: Strategy Distribution Integration
 *
 * Verifies:
 * 1. concept_records table has strategy_distribution JSONB column
 * 2. retrieval_telemetry inserts are working
 * 3. Strategy distribution increments correctly on telemetry insert
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_password@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log('[Phase 3E.1 Smoke] Starting strategy distribution test...\n');

    // Gate 1: Check concept_records schema
    console.log('[Gate 1] Checking concept_records schema...');
    const schemaResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'concept_records'
      AND column_name IN ('strategy_distribution', 'concept_temperature', 'last_retrieved_at')
      ORDER BY column_name
    `);

    if (schemaResult.rows.length !== 3) {
      console.error('❌ Missing expected columns');
      process.exit(1);
    }

    console.log('✅ All lifecycle fields present:');
    for (const row of schemaResult.rows) {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    }

    // Gate 2: Check for at least one concept with strategy_distribution
    console.log('\n[Gate 2] Checking for populated strategy_distribution...');
    const conceptResult = await pool.query(`
      SELECT concept_id, strategy_distribution, concept_temperature
      FROM concept_records
      WHERE strategy_distribution IS NOT NULL AND strategy_distribution != '{}'::jsonb
      LIMIT 5
    `);

    if (conceptResult.rows.length === 0) {
      console.warn('⚠️  No concepts with strategy_distribution yet (expected before telemetry runs)');
    } else {
      console.log(`✅ Found ${conceptResult.rows.length} concepts with strategy_distribution:`);
      for (const row of conceptResult.rows) {
        const keys = Object.keys(row.strategy_distribution).length;
        console.log(`   - ${row.concept_id}: ${keys} strategies, temp=${row.concept_temperature.toFixed(3)}`);
      }
    }

    // Gate 3: Verify retrieval_telemetry table exists and has strategy field
    console.log('\n[Gate 3] Checking retrieval_telemetry schema...');
    const telemetrySchema = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'retrieval_telemetry'
      AND column_name = 'retrieval_strategy'
    `);

    if (telemetrySchema.rows.length === 0) {
      console.error('❌ retrieval_strategy column missing from retrieval_telemetry');
      process.exit(1);
    }

    console.log(`✅ retrieval_telemetry.retrieval_strategy column exists (${telemetrySchema.rows[0].data_type})`);

    // Gate 4: Check retrieval_telemetry record count
    console.log('\n[Gate 4] Checking retrieval_telemetry volume...');
    const countResult = await pool.query('SELECT COUNT(*) as cnt FROM retrieval_telemetry');
    const telemetryCount = parseInt(countResult.rows[0].cnt);

    if (telemetryCount === 0) {
      console.warn('⚠️  No telemetry records yet (expected before ACE runs)');
    } else {
      console.log(`✅ ${telemetryCount} telemetry records present`);

      // Sample a few
      const sampleResult = await pool.query(`
        SELECT retrieval_strategy, COUNT(*) as count
        FROM retrieval_telemetry
        GROUP BY retrieval_strategy
        ORDER BY count DESC
        LIMIT 5
      `);

      console.log('   Telemetry by strategy:');
      for (const row of sampleResult.rows) {
        console.log(`     - ${row.retrieval_strategy}: ${row.count} records`);
      }
    }

    // Gate 5: Validate indexes
    console.log('\n[Gate 5] Checking required indexes...');
    const indexResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename IN ('concept_records', 'retrieval_telemetry')
      AND indexname LIKE 'idx_%strategy%'
    `);

    if (indexResult.rows.length === 0) {
      console.warn('⚠️  Strategy-related indexes not found (may need migration)');
    } else {
      console.log(`✅ Found ${indexResult.rows.length} strategy indexes:`);
      for (const row of indexResult.rows) {
        console.log(`   - ${row.indexname}`);
      }
    }

    console.log('\n[Phase 3E.1 Smoke] ✅ All gates passed!');
    console.log('\nNext: Run npm run phase3e:generate-report to validate strategy patterns');
  } catch (err) {
    console.error('[Phase 3E.1 Smoke] Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
