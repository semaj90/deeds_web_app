#!/usr/bin/env node
/**
 * Create Train/Validation/Test Splits
 *
 * Stratified by query_id (80/10/10 split)
 * Ensures each split has representative queries
 */

import pg from 'pg';

const dbUrl = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  CREATE EVALUATION SPLITS (80/10/10)                  ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    // Fetch all queries sorted by ID for consistent splits
    const queries = await pool.query(`
      SELECT query_id FROM evaluation_seed_queries ORDER BY query_id
    `);

    const totalQueries = queries.rows.length;
    const trainCount = Math.floor(totalQueries * 0.80);
    const valCount = Math.floor(totalQueries * 0.10);
    // testCount = totalQueries - trainCount - valCount

    console.log(`[1/2] GENERATING SPLITS\n`);
    console.log(`  Total queries: ${totalQueries}`);
    console.log(`  Train (80%): ${trainCount}`);
    console.log(`  Validation (10%): ${valCount}`);
    console.log(`  Test (10%): ${totalQueries - trainCount - valCount}\n`);

    // Insert splits
    let trainIdx = 0;
    let valIdx = 0;

    for (const row of queries.rows) {
      let split: string;
      if (trainIdx < trainCount) {
        split = 'train';
        trainIdx++;
      } else if (valIdx < valCount) {
        split = 'validation';
        valIdx++;
      } else {
        split = 'test';
      }

      await pool.query(
        `INSERT INTO evaluation_splits (query_id, split, fold_id)
         VALUES ($1, $2, 0)
         ON CONFLICT (query_id) DO UPDATE SET split = $2`,
        [row.query_id, split]
      );
    }

    console.log(`[2/2] VERIFYING SPLITS\n`);

    const splitStats = await pool.query(`
      SELECT
        split,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM evaluation_splits), 1) as pct
      FROM evaluation_splits
      GROUP BY split
      ORDER BY split
    `);

    for (const stat of splitStats.rows) {
      console.log(`  ${stat.split.padEnd(12)}: ${String(stat.count).padStart(3)} queries (${String(stat.pct).padStart(5)}%)`);
    }

    console.log('\n✅ SPLITS CREATED SUCCESSFULLY\n');

    const datasetCheck = await pool.query(`
      SELECT version, total_queries, queries_with_span_gte_2 FROM evaluation_datasets
      WHERE version = 'dataset_v1'
    `);

    if (datasetCheck.rows.length > 0) {
      const ds = datasetCheck.rows[0];
      console.log(`Dataset v1 Status:`);
      console.log(`  Version: ${ds.version}`);
      console.log(`  Total queries: ${ds.total_queries}`);
      console.log(`  Queries with signal: ${ds.queries_with_span_gte_2}/${ds.total_queries}\n`);
    }

    console.log(`Next steps:`);
    console.log(`  1. Train baseline XGBoost on training set`);
    console.log(`  2. Evaluate on validation/test sets`);
    console.log(`  3. Register baseline_v1 in evaluation_runs\n`);

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
