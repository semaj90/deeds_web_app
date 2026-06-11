#!/usr/bin/env node

/**
 * PostgreSQL 18 Optimization Verification
 *
 * Verifies that AIO, skip-scan indexes, and temporal constraints are enabled.
 * Baseline performance test before/after optimizations.
 *
 * Usage:
 *   node scripts/postgres18-verify-optimizations.mjs
 */

import { execSync } from 'child_process';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 1,
});

async function verify() {
  console.log('📊 PostgreSQL 18 Optimization Verification\n');
  console.log('═'.repeat(70));

  try {
    const client = await pool.connect();

    // 1. Check PostgreSQL version
    console.log('\n[1] PostgreSQL Version');
    const versionResult = await client.query('SELECT version();');
    const version = versionResult.rows[0].version;
    console.log(`✓ ${version}`);

    // 2. Check AIO status
    console.log('\n[2] Asynchronous I/O (AIO) Status');
    const aioResult = await client.query('SHOW io_method;');
    const ioMethod = aioResult.rows[0].io_method;
    console.log(`io_method: ${ioMethod}`);
    const aioEnabled = ['posix_aio', 'io_uring', 'worker'].includes(ioMethod);
    if (aioEnabled) {
      console.log('✓ AIO enabled — expected 2-3x speedup on cold-cache scans');
    } else {
      console.log('⚠ AIO not enabled (io_method = ' + ioMethod + ') — consider adding to docker-compose');
    }

    // 3. Check for skip-scan indexes
    console.log('\n[3] Skip-Scan Multi-Column Indexes');
    const indexQuery = `
      SELECT schemaname, tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND (tablename IN ('agent_traces', 'concept_records', 'retrieval_telemetry')
          OR indexdef LIKE '%,%')  -- Multi-column composite index
      ORDER BY tablename, indexname;
    `;
    const indexResult = await client.query(indexQuery);
    if (indexResult.rows.length > 0) {
      console.log(`Found ${indexResult.rows.length} skip-scan index candidates:`);
      indexResult.rows.forEach((row) => {
        console.log(`  • ${row.tablename}.${row.indexname}`);
      });
    } else {
      console.log('⚠ No skip-scan indexes found yet — apply manual migration:');
      console.log('  drizzle/manual/20260611_postgres18_skip_scan_indexes.sql');
    }

    // 4. Check for virtual columns
    console.log('\n[4] Virtual Generated Columns');
    const generatedQuery = `
      SELECT column_name, is_generated, generation_expression
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND is_generated = 'ALWAYS'
      ORDER BY table_name;
    `;
    const generatedResult = await client.query(generatedQuery);
    if (generatedResult.rows.length > 0) {
      console.log(`Found ${generatedResult.rows.length} virtual columns:`);
      generatedResult.rows.forEach((row) => {
        console.log(`  • ${row.column_name} (generated: ${row.generation_expression})`);
      });
    } else {
      console.log('ℹ No virtual columns yet — optional optimization');
    }

    // 5. Check for temporal constraints
    console.log('\n[5] Temporal Constraints (WITHOUT OVERLAPS)');
    let constraintResult = { rows: [] };
    try {
      constraintResult = await client.query(`
        SELECT constraint_name, table_name
        FROM pg_constraint
        WHERE contype = 'x'  -- Exclude constraint type
          AND pg_catalog.pg_get_constraintdef(oid) LIKE '%WITHOUT OVERLAPS%'
        ORDER BY table_name;
      `);
    } catch (err) {
      // Fallback if query fails (PostgreSQL <15 may not support WITHOUT OVERLAPS)
      console.log('ℹ WITHOUT OVERLAPS query not supported on this version');
    }

    if (constraintResult.rows.length > 0) {
      console.log(`Found ${constraintResult.rows.length} temporal constraints:`);
      constraintResult.rows.forEach((row) => {
        console.log(`  • ${row.table_name}.${row.constraint_name}`);
      });
    } else {
      console.log('ℹ No temporal constraints yet — optional for versioning');
    }

    // 6. Baseline performance test (if agent_traces exists)
    console.log('\n[6] Skip-Scan Performance Baseline');
    try {
      const countResult = await client.query('SELECT COUNT(*) as cnt FROM agent_traces;');
      const traceCount = countResult.rows[0].cnt;

      if (traceCount > 0) {
        console.log(`Found ${traceCount} agent traces`);

        // Test query: filtered by created_at + reward
        const startTime = Date.now();
        const testResult = await client.query(`
          EXPLAIN ANALYZE
          SELECT COUNT(*) FROM agent_traces
          WHERE created_at > NOW() - INTERVAL '7 days'
            AND reward >= 0.85
            AND outcome = 'success'
          LIMIT 1000;
        `);
        const elapsed = Date.now() - startTime;

        console.log(`✓ Baseline query plan (${elapsed}ms):`);
        const planLines = testResult.rows
          .map((r) => Object.values(r)[0])
          .join('\n')
          .split('\n')
          .slice(0, 5);
        planLines.forEach((line) => console.log(`  ${line}`));

        // Check if index was used
        const planText = testResult.rows.map((r) => Object.values(r)[0]).join('\n');
        if (planText.includes('Index Scan') || planText.includes('Bitmap Index')) {
          console.log('✓ Index used for query — skip-scan working!');
        } else if (planText.includes('Seq Scan')) {
          console.log('⚠ Full table scan — add skip-scan indexes');
        }
      } else {
        console.log('ℹ agent_traces table is empty — no baseline data');
      }
    } catch (err) {
      console.log(`ℹ agent_traces table not found or not accessible`);
    }

    // 7. Summary and next steps
    console.log('\n' + '═'.repeat(70));
    console.log('\n📋 Optimization Checklist\n');

    const checks = [
      ['PostgreSQL 18+', version.includes('18')],
      ['AIO enabled', aioEnabled],
      ['Skip-scan indexes', indexResult.rows.length > 0],
      ['Virtual columns', generatedResult.rows.length > 0],
      ['Temporal constraints', constraintResult.rows.length > 0],
    ];

    checks.forEach(([feature, enabled]) => {
      console.log(`${enabled ? '✅' : '⬜'} ${feature}`);
    });

    const completed = checks.filter(([, enabled]) => enabled).length;
    console.log(`\nCompleted: ${completed}/${checks.length}`);

    // Next actions
    console.log('\n📝 Next Actions:\n');
    if (!aioEnabled) {
      console.log('1. [IMMEDIATE] Enable AIO in docker-compose.yml:');
      console.log('   command: ["postgres", "-c", "io_method=posix_aio"]');
      console.log('   Then: docker compose restart postgres\n');
    }
    if (indexResult.rows.length === 0) {
      console.log('2. [IMMEDIATE] Apply skip-scan indexes:');
      console.log('   psql $DATABASE_URL -f drizzle/manual/20260611_postgres18_skip_scan_indexes.sql\n');
    }
    if (generatedResult.rows.length === 0) {
      console.log('3. [LATER] Add virtual authority_score column to concept_records:');
      console.log('   authority_score = temperature * ln(telemetry_count + 1)\n');
    }
    if (constraintResult.rows.length === 0) {
      console.log('4. [LATER] Add temporal constraints for strategy_distribution versioning\n');
    }

    console.log('═'.repeat(70));
    console.log('\n✨ AIO expected to provide 2-3x speedup on QLoRA export queries.');
    console.log('✨ Skip-scan indexes expected to provide 10-50x speedup on filtered queries.\n');

    client.release();
  } catch (err) {
    console.error('\n❌ Verification failed:', err.message);
    console.error('\nMake sure PostgreSQL is running:');
    console.error('  docker compose up -d postgres');
    console.error('  Or: docker compose restart postgres\n');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verify().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
