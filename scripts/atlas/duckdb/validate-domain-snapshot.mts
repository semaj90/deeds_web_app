#!/usr/bin/env node
/**
 * Validate a DuckDB snapshot against PostgreSQL.
 * Usage: npx tsx scripts/atlas/duckdb/validate-domain-snapshot.mts [--full]
 */

import {
  createAtlasDuckDB,
  attachCanonicalPostgres,
  validateCorpusSnapshotSchema,
  validateDomainTrainingRowsSchema,
  validateRowParity
} from '../../../packages/atlas-duckdb/src/index.ts';

async function main() {
  const args = process.argv.slice(2);
  const full = args.includes('--full');

  console.log(`🔍 Validating DuckDB snapshot...`);
  const startTime = performance.now();
  let db;

  try {
    db = await createAtlasDuckDB();
    const pgAlias = await attachCanonicalPostgres(db.connection);

    console.log(`\n📋 Schema Validation`);
    console.log(`────────────────────`);

    // Validate corpus snapshot schema
    console.log(`\nsnapshotPackets:`);
    const corpusSchemaResult = await validateCorpusSnapshotSchema(
      db.connection
    );
    console.log(`  Valid: ${corpusSchemaResult.isValid ? '✅' : '❌'}`);
    console.log(`  Row count: ${corpusSchemaResult.rowCount}`);
    if (corpusSchemaResult.missingColumns.length > 0) {
      console.log(
        `  Missing columns: ${corpusSchemaResult.missingColumns.join(', ')}`
      );
    }
    if (corpusSchemaResult.errors.length > 0) {
      console.log(`  Errors:`);
      corpusSchemaResult.errors.forEach((e) => console.log(`    - ${e}`));
    }

    // Validate domain training rows schema
    console.log(`\ndomainTrainingRows:`);
    const trainingSchemaResult = await validateDomainTrainingRowsSchema(
      db.connection
    );
    console.log(`  Valid: ${trainingSchemaResult.isValid ? '✅' : '❌'}`);
    console.log(`  Row count: ${trainingSchemaResult.rowCount}`);
    if (trainingSchemaResult.missingColumns.length > 0) {
      console.log(
        `  Missing columns: ${trainingSchemaResult.missingColumns.join(', ')}`
      );
    }
    if (trainingSchemaResult.errors.length > 0) {
      console.log(`  Errors:`);
      trainingSchemaResult.errors.forEach((e) => console.log(`    - ${e}`));
    }

    // Validate row parity
    console.log(`\n📊 Row Parity Check`);
    console.log(`───────────────────`);
    const parityResult = await validateRowParity(db.connection, pgAlias);
    console.log(`DuckDB row count:   ${parityResult.duckdbRowCount}`);
    console.log(`PostgreSQL count:   ${parityResult.postgresRowCount}`);
    console.log(`Parity match:       ${parityResult.isParityMatch ? '✅' : '❌'}`);
    if (!parityResult.isParityMatch) {
      console.log(`Difference:         ${parityResult.rowCountDifference} rows`);
      if (parityResult.sampleMismatches.length > 0) {
        console.log(`Sample mismatches:`);
        parityResult.sampleMismatches.forEach((m) => {
          console.log(`  - ${m.packet_key}: ${m.duckdbFields} vs ${m.postgresFields} fields`);
        });
      }
    }
    if (parityResult.errors.length > 0) {
      console.log(`Errors:`);
      parityResult.errors.forEach((e) => console.log(`  - ${e}`));
    }

    if (full) {
      console.log(`\n🔬 Detailed Analysis`);
      console.log(`────────────────────`);

      // Check for NULL coverage in critical columns
      const nullCheck = await db.connection.query(`
        SELECT
          COUNT(CASE WHEN normalized_domain IS NULL THEN 1 END) AS null_domain,
          COUNT(CASE WHEN content_embedding_384 IS NULL THEN 1 END) AS null_embedding,
          COUNT(CASE WHEN som_cluster IS NULL THEN 1 END) AS null_som,
          COUNT(*) AS total
        FROM snapshot_packets
      `);
      const nullRow = nullCheck[0] as {
        null_domain: bigint;
        null_embedding: bigint;
        null_som: bigint;
        total: bigint;
      };
      console.log(`\nNULL coverage in snapshot_packets:`);
      console.log(`  Domain nulls:    ${Number(nullRow.null_domain)} / ${Number(nullRow.total)}`);
      console.log(`  Embedding nulls: ${Number(nullRow.null_embedding)} / ${Number(nullRow.total)}`);
      console.log(`  SOM cluster nulls: ${Number(nullRow.null_som)} / ${Number(nullRow.total)}`);

      // Check split distribution
      const splitCheck = await db.connection.query(`
        SELECT
          split_name,
          COUNT(*) AS cnt,
          ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
        FROM domain_training_rows
        GROUP BY split_name
        ORDER BY split_name
      `);
      console.log(`\nSplit distribution:`);
      for (const row of splitCheck as Array<{
        split_name: string;
        cnt: bigint;
        pct: number;
      }>) {
        console.log(
          `  ${row.split_name.padEnd(12)}: ${String(Number(row.cnt)).padStart(6)} (${String(row.pct).padStart(5)}%)`
        );
      }
    }

    // Summary
    const allValid =
      corpusSchemaResult.isValid &&
      trainingSchemaResult.isValid &&
      parityResult.isParityMatch;
    console.log(`\n${allValid ? '✅ All validations passed!' : '⚠️  Some validations failed'}`);

    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log(`Completed in ${duration}s`);

    process.exit(allValid ? 0 : 1);
  } catch (err) {
    console.error(
      `❌ Validation failed: ${err instanceof Error ? err.message : String(err)}`
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
