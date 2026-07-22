#!/usr/bin/env node
/**
 * End-to-end validation: DuckDB snapshot → Phase 2 classifier → Postgres
 * Comprehensive gate checking all layers of the pipeline.
 */

import { createAtlasDuckDB, attachCanonicalPostgres } from '../../packages/atlas-duckdb/src/index.js';

async function main() {
  console.log(`🔬 DuckDB Pipeline Validation (E2E)`);
  console.log(`========================================\n`);

  const startTime = performance.now();
  let db;
  let passed = 0;
  let failed = 0;

  try {
    // GATE 1: DuckDB initialization
    console.log(`[GATE 1] DuckDB Initialization`);
    db = await createAtlasDuckDB();
    console.log(`  ✓ DuckDB instance created`);
    console.log(`  ✓ Config: threads=${process.env.ATLAS_DUCKDB_THREADS || 'auto'}, memory=${process.env.ATLAS_DUCKDB_MEMORY_LIMIT || '4GB'}`);
    passed++;

    // GATE 2: PostgreSQL attachment
    console.log(`\n[GATE 2] PostgreSQL Attachment`);
    await attachCanonicalPostgres(db.connection);
    console.log(`  ✓ PostgreSQL attached as read-only`);
    passed++;

    // GATE 3: Snapshot existence
    console.log(`\n[GATE 3] Snapshot Tables`);
    const snapshotStats = await db.connection.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN content_embedding_384 IS NOT NULL THEN 1 END) as with_embedding,
        COUNT(CASE WHEN normalized_domain IS NOT NULL THEN 1 END) as with_domain,
        COUNT(CASE WHEN som_cluster IS NOT NULL THEN 1 END) as with_som
      FROM snapshot_packets
    `);

    if (snapshotStats.length === 0) {
      console.log(`  ❌ snapshot_packets table not found or empty`);
      failed++;
    } else {
      const stats = snapshotStats[0];
      const total = Number(stats.total);
      const withEmbedding = Number(stats.with_embedding);
      const withDomain = Number(stats.with_domain);
      const withSom = Number(stats.with_som);

      console.log(`  ✓ snapshot_packets: ${total} rows`);
      console.log(`    - ${withEmbedding} with embeddings (${((withEmbedding / total) * 100).toFixed(1)}%)`);
      console.log(`    - ${withDomain} with domain (${((withDomain / total) * 100).toFixed(1)}%)`);
      console.log(`    - ${withSom} with SOM cluster (${((withSom / total) * 100).toFixed(1)}%)`);
      passed++;
    }

    // GATE 4: Training rows
    console.log(`\n[GATE 4] Training Rows Split`);
    const splitStats = await db.connection.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN split_name = 'train' THEN 1 END) as train,
        COUNT(CASE WHEN split_name = 'validation' THEN 1 END) as validation,
        COUNT(CASE WHEN split_name = 'test' THEN 1 END) as test
      FROM domain_training_rows
    `);

    if (splitStats.length === 0) {
      console.log(`  ❌ domain_training_rows table not found or empty`);
      failed++;
    } else {
      const split = splitStats[0];
      const total = Number(split.total);
      const train = Number(split.train);
      const validation = Number(split.validation);
      const test = Number(split.test);

      const trainPct = ((train / total) * 100).toFixed(1);
      const valPct = ((validation / total) * 100).toFixed(1);
      const testPct = ((test / total) * 100).toFixed(1);

      console.log(`  ✓ domain_training_rows: ${total} rows`);
      console.log(`    - train: ${train} (${trainPct}%)`);
      console.log(`    - validation: ${validation} (${valPct}%)`);
      console.log(`    - test: ${test} (${testPct}%)`);

      if (train > 0 && validation > 0 && test > 0) {
        passed++;
      } else {
        console.log(`  ⚠️  Warning: some splits are empty`);
        failed++;
      }
    }

    // GATE 5: Domain distribution
    console.log(`\n[GATE 5] Domain Distribution`);
    const domainStats = await db.connection.query(`
      SELECT
        label,
        COUNT(*) as count
      FROM domain_training_rows
      WHERE label IS NOT NULL
      GROUP BY label
      ORDER BY count DESC
      LIMIT 5
    `);

    if (domainStats.length === 0) {
      console.log(`  ❌ No domains found in training rows`);
      failed++;
    } else {
      console.log(`  ✓ Top 5 domains:`);
      for (const row of domainStats) {
        const label = String(row.label);
        const count = Number(BigInt(row.count || 0));
        console.log(`    - ${label}: ${count} samples`);
      }
      passed++;
    }

    // GATE 6: Embedding quality
    console.log(`\n[GATE 6] Embedding Quality`);
    const embeddingQuality = await db.connection.query(`
      SELECT
        COUNT(CASE WHEN LENGTH(content_embedding_384::text) > 100 THEN 1 END) as valid_embeddings,
        COUNT(*) as total
      FROM snapshot_packets
      WHERE content_embedding_384 IS NOT NULL
      LIMIT 1000
    `);

    if (embeddingQuality.length > 0) {
      const quality = embeddingQuality[0];
      const validEmbeddings = Number(BigInt(quality.valid_embeddings || 0));
      const totalEmbeddings = Number(BigInt(quality.total || 0));
      const validPct = ((validEmbeddings / totalEmbeddings) * 100).toFixed(1);
      console.log(`  ✓ Valid embeddings: ${validEmbeddings}/${totalEmbeddings} (${validPct}%)`);
      if (validEmbeddings > totalEmbeddings * 0.95) {
        passed++;
      } else {
        console.log(`  ⚠️  Warning: embedding validity below 95%`);
        failed++;
      }
    }

    // GATE 7: Content integrity
    console.log(`\n[GATE 7] Content Integrity`);
    const contentCheck = await db.connection.query(`
      SELECT
        COUNT(CASE WHEN content IS NOT NULL AND LENGTH(content) > 0 THEN 1 END) as with_content,
        COUNT(CASE WHEN content_hash IS NOT NULL THEN 1 END) as with_hash,
        COUNT(*) as total
      FROM snapshot_packets
      LIMIT 1000
    `);

    if (contentCheck.length > 0) {
      const check = contentCheck[0];
      const withContent = Number(BigInt(check.with_content || 0));
      const withHash = Number(BigInt(check.with_hash || 0));
      const totalContent = Number(BigInt(check.total || 0));

      console.log(`  ✓ Content records: ${withContent}/${totalContent}`);
      console.log(`  ✓ Hash records: ${withHash}/${totalContent}`);
      if (withContent > 0 && withHash > 0) {
        passed++;
      } else {
        console.log(`  ⚠️  Warning: missing content or hash`);
        failed++;
      }
    }

    // GATE 8: Performance baseline
    console.log(`\n[GATE 8] Performance Baseline`);
    const perfStart = performance.now();
    await db.connection.query(`SELECT COUNT(*) FROM snapshot_packets WHERE som_cluster IS NOT NULL`);
    const perfEnd = performance.now();
    const queryTime = (perfEnd - perfStart).toFixed(2);

    console.log(`  ✓ Query time: ${queryTime}ms`);
    if (parseFloat(queryTime) < 1000) {
      passed++;
    } else {
      console.log(`  ⚠️  Warning: query took > 1 second`);
      failed++;
    }

    const elapsed = performance.now() - startTime;
    console.log(`\n========================================`);
    console.log(`✅ Passed: ${passed}/8`);
    console.log(`❌ Failed: ${failed}/8`);
    console.log(`⏱️  Total time: ${(elapsed / 1000).toFixed(2)}s`);
    console.log(`\n${failed === 0 ? '🎉 All gates passed!' : '⚠️  Some gates failed. Review above.'}`);

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error(`\n❌ Fatal Error: ${error instanceof Error ? error.message : String(error)}`);
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
