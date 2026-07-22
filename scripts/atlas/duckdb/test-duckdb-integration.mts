#!/usr/bin/env node
/**
 * Quick integration test for @atlas/duckdb package.
 * Tests configuration, database creation, and basic operations.
 * Usage: npx tsx scripts/atlas/duckdb/test-duckdb-integration.mts
 */

import {
  createAtlasDuckDB,
  resolveDuckDBConfig,
  attachCanonicalPostgres,
  buildCorpusSnapshot,
  validateCorpusSnapshotSchema
} from '../../../packages/atlas-duckdb/src/index.ts';

async function testConfiguration() {
  console.log('🔧 Testing configuration resolution...');
  const config = resolveDuckDBConfig({
    threads: 2,
    memoryLimit: '2GB',
    tempDirectory: 'data/atlas-ml/tmp'
  });

  console.log(`  ✓ Database path: ${config.databasePath}`);
  console.log(`  ✓ Threads: ${config.threads}`);
  console.log(`  ✓ Memory limit: ${config.memoryLimit}`);
  console.log(`  ✓ Temp directory: ${config.tempDirectory}`);
  console.log(`  ✓ Read-only: ${config.readOnly}`);
  return true;
}

async function testDatabaseLifecycle() {
  console.log('\n🗄️  Testing database lifecycle...');

  let db;
  try {
    db = await createAtlasDuckDB({
      databasePath: ':memory:',
      threads: 2,
      memoryLimit: '2GB'
    });
    console.log('  ✓ Database instance created');

    // Test simple query
    const result = await db.connection.query('SELECT 1 + 1 AS sum');
    console.log(`  ✓ Query execution works (1 + 1 = ${(result[0] as { sum: number }).sum})`);

    return true;
  } catch (err) {
    console.error(`  ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    if (db) {
      await db.close();
      console.log('  ✓ Database closed');
    }
  }
}

async function testPostgresAttachment() {
  console.log('\n📡 Testing PostgreSQL attachment...');

  let db;
  try {
    db = await createAtlasDuckDB({
      databasePath: ':memory:',
      threads: 2,
      memoryLimit: '2GB'
    });

    try {
      // Try to attach PostgreSQL (may fail if PG not available)
      const pgAlias = await attachCanonicalPostgres(db.connection);
      console.log(`  ✓ PostgreSQL attached as '${pgAlias}'`);

      // Test that we can query through the attachment
      const quotedCatalog = `"${pgAlias.replace(/"/g, '""')}"`;
      const pgTest = await db.connection.query(
        `SELECT COUNT(*) AS cnt FROM ${quotedCatalog}.public.atlas_packets LIMIT 1`
      );
      console.log(`  ✓ PostgreSQL query works (found ${(pgTest[0] as { cnt: bigint }).cnt} packets)`);
      return true;
    } catch (err) {
      // PostgreSQL not available is ok for this test
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('could not connect') || message.includes('extension')) {
        console.log(`  ⚠️  PostgreSQL not available (expected in test): ${message.substring(0, 60)}...`);
        return true;
      }
      throw err;
    }
  } catch (err) {
    console.error(`  ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

async function testTableCreation() {
  console.log('\n📦 Testing table creation...');

  let db;
  try {
    db = await createAtlasDuckDB({
      databasePath: ':memory:',
      threads: 2,
      memoryLimit: '2GB'
    });

    await db.connection.run('DROP TABLE IF EXISTS test_packets');

    // Create a test table
    await db.connection.run(`
      CREATE TABLE test_packets AS
      SELECT
        'packet_1' AS packet_key,
        'src/test.ts' AS source_ref,
        'Test packet' AS summary,
        'test_domain' AS domain,
        768 AS embedding_dim
      UNION ALL
      SELECT 'packet_2', 'src/lib.ts', 'Library packet', 'lib_domain', 768
      UNION ALL
      SELECT 'packet_3', 'src/utils.ts', 'Utility packet', 'util_domain', 768
    `);
    console.log('  ✓ Test table created');

    // Test aggregation
    const stats = await db.connection.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT domain) AS domains,
        SUM(embedding_dim) AS total_dims
      FROM test_packets
    `);
    const row = stats[0] as { total: bigint; domains: bigint; total_dims: bigint };
    console.log(`  ✓ Aggregation works: ${Number(row.total)} packets, ${Number(row.domains)} domains`);

    // Clean up
    await db.connection.run('DROP TABLE test_packets');
    console.log('  ✓ Test table cleaned up');

    return true;
  } catch (err) {
    console.error(`  ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

async function runTests() {
  console.log('🧪 Running @atlas/duckdb integration tests\n');
  console.log('═'.repeat(50));

  const results: Record<string, boolean> = {};

  results['Configuration'] = await testConfiguration();
  results['Database Lifecycle'] = await testDatabaseLifecycle();
  results['PostgreSQL Attachment'] = await testPostgresAttachment();
  results['Table Creation'] = await testTableCreation();

  console.log('\n' + '═'.repeat(50));
  console.log('\n📊 Test Results:');
  let passCount = 0;
  for (const [test, passed] of Object.entries(results)) {
    console.log(`  ${passed ? '✅' : '❌'} ${test}`);
    if (passed) passCount++;
  }

  const totalCount = Object.keys(results).length;
  console.log(`\n${passCount}/${totalCount} tests passed`);

  process.exit(passCount === totalCount ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
