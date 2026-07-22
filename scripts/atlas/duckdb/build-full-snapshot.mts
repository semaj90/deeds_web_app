#!/usr/bin/env node
/**
 * Build full-corpus DuckDB snapshot (61,659 packets).
 * Usage: npx tsx scripts/atlas/duckdb/build-full-snapshot.mts [--verify]
 */

import { createAtlasDuckDB, attachCanonicalPostgres, buildCorpusSnapshot, buildDomainTrainingRows } from '../../../packages/atlas-duckdb/src/index.js';

async function main() {
  const args = process.argv.slice(2);
  const verify = args.includes('--verify');

  console.log(`🔨 Building full-corpus DuckDB snapshot (61,659 packets)...`);
  console.log(`Database path: data/atlas-ml/atlas-analytics.duckdb`);
  console.log(`Threads: ${process.env.ATLAS_DUCKDB_THREADS || 'auto'}`);
  console.log(`Memory limit: ${process.env.ATLAS_DUCKDB_MEMORY_LIMIT || '4GB'}`);

  const startTime = performance.now();
  let db;

  try {
    db = await createAtlasDuckDB();
    console.log(`✓ DuckDB instance created`);

    await attachCanonicalPostgres(db.connection);
    console.log(`✓ PostgreSQL attached as 'canonical_pg'`);

    console.log(`\n📊 Creating full snapshot_packets table (61,659 packets)...`);
    const corpusStats = await buildCorpusSnapshot(db.connection);
    console.log(`✓ Full corpus snapshot created`);
    console.log(`\n📈 Corpus snapshot statistics:`);
    console.log(`   Total rows: ${corpusStats.totalRows}`);
    console.log(`   Rows with normalized domain: ${corpusStats.rowsWithNormalizedDomain}`);
    console.log(`   Rows with embedding: ${corpusStats.rowsWithEmbedding}`);
    console.log(`   Rows with SOM cluster: ${corpusStats.rowsWithSOMCluster}`);
    console.log(`   Nullable domain rows: ${corpusStats.nullableDomainRows}`);

    console.log(`\n🎯 Building domain training rows...`);
    const splitStats = await buildDomainTrainingRows(db.connection);
    console.log(`✓ Domain training rows created`);
    console.log(`\n📚 Domain training splits:`);
    console.log(`   Total: ${splitStats.totalRows}`);
    console.log(`   Train: ${splitStats.trainRows} (${((splitStats.trainRows / splitStats.totalRows) * 100).toFixed(1)}%)`);
    console.log(`   Validation: ${splitStats.validationRows} (${((splitStats.validationRows / splitStats.totalRows) * 100).toFixed(1)}%)`);
    console.log(`   Test: ${splitStats.testRows} (${((splitStats.testRows / splitStats.totalRows) * 100).toFixed(1)}%)`);

    if (verify) {
      console.log(`\n🔍 Running verification...`);
      const sample = await db.connection.query('SELECT * FROM snapshot_packets LIMIT 1');
      if (sample.length > 0) {
        console.log(`✓ Sample row retrieved successfully`);
        const cols = Object.keys(sample[0]);
        console.log(`✓ Columns (${cols.length}): ${cols.join(', ')}`);
      }
    }

    const elapsed = performance.now() - startTime;
    console.log(`\n✅ Full corpus snapshot built in ${(elapsed / 1000).toFixed(2)}s`);
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
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
