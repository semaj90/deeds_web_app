#!/usr/bin/env node
/**
 * Build a 5,000-packet local DuckDB snapshot from PostgreSQL.
 * Usage: npx tsx scripts/atlas/duckdb/build-domain-snapshot.mts [--limit 5000] [--verify]
 */

import { createAtlasDuckDB, attachCanonicalPostgres, buildCorpusSnapshot, buildDomainTrainingRows } from '../../../packages/atlas-duckdb/src/index.ts';

async function main() {
  const args = process.argv.slice(2);
  const limit = 5000;
  const verify = args.includes('--verify');

  console.log(`🔨 Building ${limit}-packet DuckDB snapshot...`);
  console.log(`Database path: data/atlas-ml/atlas-analytics.duckdb`);
  console.log(`Threads: ${process.env.ATLAS_DUCKDB_THREADS || 'auto'}`);
  console.log(`Memory limit: ${process.env.ATLAS_DUCKDB_MEMORY_LIMIT || '4GB'}`);

  const startTime = performance.now();
  let db;

  try {
    // Create or open DuckDB instance
    db = await createAtlasDuckDB();
    console.log(`✓ DuckDB instance created`);

    // Attach PostgreSQL
    const pgAlias = await attachCanonicalPostgres(db.connection);
    console.log(`✓ PostgreSQL attached as '${pgAlias}'`);

    console.log(`\n📊 Creating snapshot_packets table (${limit} packets)...`);
    const stats = await buildCorpusSnapshot(db.connection, pgAlias, limit);
    console.log(`✓ snapshot_packets created`);

    // Build domain training rows
    console.log(`📚 Creating domain_training_rows table...`);
    await buildDomainTrainingRows(db.connection);
    console.log(`✓ domain_training_rows created`);

    console.log(`\n📈 Corpus snapshot statistics:`);
    console.log(`   Total rows: ${stats.totalRows}`);
    console.log(`   Rows with normalized domain: ${stats.rowsWithNormalizedDomain}`);
    console.log(`   Rows with embedding: ${stats.rowsWithEmbedding}`);
    console.log(`   Rows with SOM cluster: ${stats.rowsWithSOMCluster}`);
    console.log(`   Nullable domain rows: ${stats.nullableDomainRows}`);

    // Get domain training splits
    const splitStats = await db.connection.query(`
      SELECT
        COUNT(*) AS total_rows,
        COUNT(CASE WHEN split_name = 'train' THEN 1 END) AS train_rows,
        COUNT(CASE WHEN split_name = 'validation' THEN 1 END) AS validation_rows,
        COUNT(CASE WHEN split_name = 'test' THEN 1 END) AS test_rows
      FROM domain_training_rows
    `);
    const row = splitStats[0] as {
      total_rows: bigint;
      train_rows: bigint;
      validation_rows: bigint;
      test_rows: bigint;
    };

    console.log(`\n🎯 Domain training splits:`);
    console.log(`   Total: ${Number(row.total_rows)}`);
    console.log(`   Train: ${Number(row.train_rows)} (${((Number(row.train_rows) / Number(row.total_rows)) * 100).toFixed(1)}%)`);
    console.log(`   Validation: ${Number(row.validation_rows)} (${((Number(row.validation_rows) / Number(row.total_rows)) * 100).toFixed(1)}%)`);
    console.log(`   Test: ${Number(row.test_rows)} (${((Number(row.test_rows) / Number(row.total_rows)) * 100).toFixed(1)}%)`);

    if (verify) {
      console.log(`\n🔍 Running verification...`);
      const sampleResult = await db.connection.query(
        'SELECT * FROM snapshot_packets LIMIT 1'
      );
      if (sampleResult.length > 0) {
        console.log(`✓ Sample row retrieved successfully`);
        const keys = Object.keys(sampleResult[0] as Record<string, unknown>).sort();
        console.log(`✓ Columns (${keys.length}): ${keys.join(', ')}`);
      }
    }

    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Snapshot built in ${duration}s`);
    process.exit(0);
  } catch (err) {
    console.error(
      `❌ Error: ${err instanceof Error ? err.message : String(err)}`
    );
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    if (db) {
      await db.close();
    }
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
