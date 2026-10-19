#!/usr/bin/env node
/**
 * scripts/scratch_query_receipt_columns.mjs
 * 
 * Production-grade Parent Atlas Database Receipt & Contract Inspector
 * 
 * Verifies schema definitions, column nullability, indexes, and row counts
 * across all canonical receipt, verifier, and learned-artifact tables:
 * - atlas_algorithm_execution_receipts
 * - atlas_test_execution_receipts
 * - atlas_receipt_verifier_results_v1
 * - atlas_receipt_verification_v1 (view)
 * - atlas_learned_artifact_admission_v1
 * - codebase_chunk_index (retrieval indexes: BM25, GIN, HNSW)
 */

import { loadRepoEnv, resolveDatabaseUrl } from './atlas/connection-config.mjs';
import pg from 'pg';

const INSPECTED_TABLES = [
  'atlas_algorithm_execution_receipts',
  'atlas_test_execution_receipts',
  'atlas_receipt_verifier_results_v1',
  'atlas_receipt_verification_v1',
  'atlas_learned_artifact_admission_v1',
  'codebase_chunk_index',
];

async function inspectTableColumns(pool, tableName) {
  const isView = tableName.endsWith('_v1') && tableName === 'atlas_receipt_verification_v1';
  const query = `
    SELECT 
      column_name, 
      data_type, 
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position;
  `;
  const res = await pool.query(query, [tableName]);
  return res.rows;
}

async function inspectTableIndexes(pool, tableName) {
  const query = `
    SELECT 
      indexname, 
      indexdef
    FROM pg_indexes
    WHERE tablename = $1
    ORDER BY indexname;
  `;
  const res = await pool.query(query, [tableName]);
  return res.rows;
}

async function getTableRowCount(pool, tableName) {
  try {
    const res = await pool.query(`SELECT count(*)::bigint AS count FROM ${tableName};`);
    return Number(res.rows[0].count);
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonOutput = argv.includes('--json');
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()) });

  try {
    const report = {
      timestamp: new Date().toISOString(),
      tables: {},
    };

    for (const tableName of INSPECTED_TABLES) {
      const columns = await inspectTableColumns(pool, tableName);
      const indexes = await inspectTableIndexes(pool, tableName);
      const rowCount = await getTableRowCount(pool, tableName);

      report.tables[tableName] = {
        rowCount,
        columnCount: columns.length,
        columns: columns.map(c => ({
          name: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable === 'YES',
          default: c.column_default,
        })),
        indexCount: indexes.length,
        indexes: indexes.map(i => ({
          name: i.indexname,
          def: i.indexdef,
        })),
      };
    }

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log('='.repeat(80));
    console.log('🏛️  PARENT ATLAS RECEIPT & RETRIEVAL CONTRACT AUDIT REPORT');
    console.log('='.repeat(80));
    console.log(`Generated: ${report.timestamp}\n`);

    for (const [tableName, data] of Object.entries(report.tables)) {
      console.log(`📋 Table: \x1b[1m${tableName}\x1b[0m (rows: \x1b[32m${data.rowCount}\x1b[0m, columns: ${data.columnCount}, indexes: ${data.indexCount})`);
      console.log('   Columns:');
      for (const col of data.columns) {
        const nullFlag = col.nullable ? '\x1b[33mNULL\x1b[0m' : '\x1b[36mNOT NULL\x1b[0m';
        console.log(`     - \x1b[1m${col.name.padEnd(32)}\x1b[0m : ${col.type.padEnd(20)} [${nullFlag}]`);
      }

      if (data.indexes.length > 0) {
        console.log('   Indexes:');
        for (const idx of data.indexes) {
          console.log(`     * \x1b[35m${idx.name}\x1b[0m: ${idx.def}`);
        }
      }
      console.log('-'.repeat(80));
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error during contract audit:', err);
  process.exit(1);
});
