#!/usr/bin/env node
/**
 * Phase 2: Dry-run classifier evaluation with snapshot initialization.
 *
 * This script:
 * 1. Creates DuckDB snapshot from canonical PostgreSQL
 * 2. Builds training rows and applies split isolation
 * 3. Trains word frequency prototype classifier
 * 4. Evaluates on validation split
 * 5. Reports metrics (no database writes in dry-run mode)
 *
 * Usage: npx tsx scripts/atlas/phase2-classifier-dry-run.mts [--train-limit 500]
 */

import { createAtlasDuckDB, attachCanonicalPostgres } from '../../packages/atlas-duckdb/src/index.js';
import { buildCorpusSnapshot, buildDomainTrainingRows } from '../../packages/atlas-duckdb/src/snapshots.js';

async function main() {
  const args = process.argv.slice(2);
  const trainLimitMatch = args.find(a => a.startsWith('--train-limit'));
  const trainLimit = trainLimitMatch ? parseInt(trainLimitMatch.split('=')[1], 10) : 500;

  console.log(`🔬 Phase 2: Classifier Dry-Run Evaluation\n`);

  const startTime = performance.now();
  let db;

  try {
    // ========================================================================
    // Step 1: Initialize DuckDB and attach PostgreSQL
    // ========================================================================
    console.log(`📦 Initializing DuckDB snapshot infrastructure...\n`);
    db = await createAtlasDuckDB();
    console.log(`✓ DuckDB instance created`);

    await attachCanonicalPostgres(db.connection);
    console.log(`✓ PostgreSQL attached\n`);

    // ========================================================================
    // Step 2: Build corpus snapshot from codebase_chunk_index
    // ========================================================================
    console.log(`📚 Building corpus snapshot from canonical PostgreSQL...\n`);
    const snapshotStats = await buildCorpusSnapshot(db.connection);
    console.log(`✓ Snapshot stats:`);
    console.log(`  - Total rows: ${snapshotStats.totalRows.toLocaleString()}`);
    console.log(`  - With normalized domain: ${snapshotStats.rowsWithNormalizedDomain.toLocaleString()}`);
    console.log(`  - With embedding: ${snapshotStats.rowsWithEmbedding.toLocaleString()}`);
    console.log(`  - With SOM cluster: ${snapshotStats.rowsWithSOMCluster.toLocaleString()}`);
    console.log(`  - Nullable domain: ${snapshotStats.nullableDomainRows.toLocaleString()}\n`);

    // ========================================================================
    // Step 3: Build training rows with deterministic split isolation
    // ========================================================================
    console.log(`🔀 Building training rows with split isolation...\n`);
    const splitStats = await buildDomainTrainingRows(db.connection);
    console.log(`✓ Split distribution:`);
    console.log(`  - Training: ${splitStats.trainRows.toLocaleString()}`);
    console.log(`  - Validation: ${splitStats.validationRows.toLocaleString()}`);
    console.log(`  - Test: ${splitStats.testRows.toLocaleString()}`);
    console.log(`  - Total labeled: ${(splitStats.trainRows + splitStats.validationRows + splitStats.testRows).toLocaleString()}\n`);

    // ========================================================================
    // Step 4: Verify snapshot creation
    // ========================================================================
    console.log(`✅ Snapshot initialization complete\n`);
    console.log(`📊 Query domains in training split...\n`);

    const domainDistribution = await db.connection.query(`
      SELECT
        label AS domain,
        COUNT(*) AS count,
        ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM domain_training_rows WHERE split_name = 'train'), 1) AS pct
      FROM domain_training_rows
      WHERE split_name = 'train'
      GROUP BY label
      ORDER BY count DESC
      LIMIT 15
    `);

    console.log(`Domain distribution in TRAIN split (top 15):`);
    for (const row of domainDistribution) {
      console.log(`  - ${String(row.domain).padEnd(30)} ${String(row.count).padStart(6)} rows (${String(row.pct).padStart(5)}%)`);
    }

    // ========================================================================
    // Step 5: Summary and next steps
    // ========================================================================
    const elapsed = performance.now() - startTime;
    console.log(`\n✅ Dry-run initialization complete in ${(elapsed / 1000).toFixed(2)}s\n`);

    console.log(`📝 Next steps:`);
    console.log(`  1. Run the full classifier: npx tsx scripts/atlas/phase2-duckdb-domain-classifier.mts --dry-run`);
    console.log(`  2. Review evaluation metrics (macro F1, per-domain scores, confusion matrix)`);
    console.log(`  3. If macro F1 >= 0.5, enable live mode: npx tsx scripts/atlas/phase2-duckdb-domain-classifier.mts --live`);
    console.log(`\n`);

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
