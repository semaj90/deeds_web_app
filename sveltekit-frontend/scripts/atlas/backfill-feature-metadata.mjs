#!/usr/bin/env node

/**
 * Backfill feature_id and metadata in atlas tables
 *
 * Tier 1 tables (required join key: source_ref or file_path):
 *   - atlas_packets
 *   - nes_chrom_packets
 *   - glyph_records
 *   - codebase_chunk_index
 *
 * Usage:
 *   npm run atlas:feature-metadata:verify
 *   npm run atlas:feature-metadata:backfill
 *   npm run atlas:feature-metadata:backfill:apply
 *   npm run atlas:feature-metadata:backfill -- --limit 100 --apply
 */

import { config } from 'dotenv';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

config();

const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_admin_pass@127.0.0.1:5434/legal_ai_db';

const TIER_1_TABLES = [
  'atlas_packets',
  'nes_chrom_packets',
  'glyph_records',
  'codebase_chunk_index',
];

const FEATURE_MAP = {
  'src/lib/server/auth': 'api_endpoints',
  'src/lib/server/db': 'database_orm',
  'src/lib/server/cache': 'infrastructure_config',
  'src/lib/server/vector': 'api_endpoints',
  'src/lib/ai': 'general_abstractions',
  'src/routes': 'ui_components',
  'src/lib/components': 'ui_components',
  'src/lib/server/gpu': 'native_accelerators',
  'src/lib/server/queue': 'observability_telemetry',
  'tests/': 'test_harness',
};

let client = null;
let reportPath = 'docs/reports/backfill-feature-metadata.json';

async function connectDb() {
  client = new Client({
    connectionString: POSTGRES_URL,
    statement_timeout: 30000,
  });
  await client.connect();
}

async function closeDb() {
  if (client) await client.end();
}

function inferFeatureId(sourceRef, filePath) {
  if (!sourceRef && !filePath) return null;
  const searchPath = sourceRef || filePath;
  for (const [prefix, featureId] of Object.entries(FEATURE_MAP)) {
    if (searchPath.startsWith(prefix)) return featureId;
  }
  return null;
}

async function verifyTable(tableName) {
  const result = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as has_feature_id,
      COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as has_source_ref,
      COUNT(CASE WHEN metadata IS NOT NULL THEN 1 END) as has_metadata,
      COUNT(CASE WHEN file_path IS NOT NULL THEN 1 END) as has_file_path
    FROM ${tableName};
  `);

  const row = result.rows[0];
  const total = parseInt(row.total, 10);
  const missing = {
    feature_id: total - parseInt(row.has_feature_id, 10),
    source_ref: total - parseInt(row.has_source_ref, 10),
    metadata: total - parseInt(row.has_metadata, 10),
    file_path: total - parseInt(row.has_file_path, 10),
  };

  // Check for GIN indexes
  const indexResult = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = $1 AND indexdef LIKE '%gin%metadata%';
  `, [tableName]);

  const hasGinIndex = indexResult.rows.length > 0;

  // Check for B-tree indexes
  const btreeResult = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = $1 AND indexdef LIKE '%btree%'
    AND (indexdef LIKE '%feature_id%' OR indexdef LIKE '%source_ref%');
  `, [tableName]);

  const hasBtreeIndex = btreeResult.rows.length > 0;

  return {
    table: tableName,
    total,
    missing,
    hasGinIndex,
    hasBtreeIndex,
  };
}

async function backfillTable(tableName, limit = null, apply = false) {
  // Get rows that need backfill
  let query = `
    SELECT id, source_ref, file_path, feature_id, metadata
    FROM ${tableName}
    WHERE feature_id IS NULL OR metadata IS NULL
    LIMIT ${limit || 10000};
  `;

  const result = await client.query(query);
  const rows = result.rows;

  if (rows.length === 0) {
    return { table: tableName, updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const inferredFeatureId = row.feature_id || inferFeatureId(row.source_ref, row.file_path);
      const metadata = row.metadata || {};

      if (inferredFeatureId && !row.feature_id) {
        metadata.feature_id_inferred = true;
        metadata.feature_id_source = row.source_ref ? 'source_ref_hash' : 'file_path_hash';
      }

      if (apply) {
        await client.query(
          `UPDATE ${tableName} SET feature_id = $1, metadata = $2 WHERE id = $3;`,
          [inferredFeatureId, JSON.stringify(metadata), row.id]
        );
      }
      updated++;
    } catch (err) {
      console.error(`  Error updating ${tableName} row ${row.id}:`, err.message);
      errors++;
    }
  }

  return { table: tableName, updated, errors };
}

async function generateReport(verifyResults, backfillResults) {
  const report = {
    timestamp: new Date().toISOString(),
    mode: backfillResults ? 'backfill' : 'verify-only',
    verification: verifyResults,
    backfill: backfillResults || null,
    summary: {
      tablesChecked: verifyResults.length,
      totalRows: verifyResults.reduce((sum, r) => sum + r.total, 0),
      totalMissingFeatureId: verifyResults.reduce((sum, r) => sum + r.missing.feature_id, 0),
      totalMissingMetadata: verifyResults.reduce((sum, r) => sum + r.missing.metadata, 0),
      totalUpdated: backfillResults ? backfillResults.reduce((sum, r) => sum + r.updated, 0) : 0,
      totalErrors: backfillResults ? backfillResults.reduce((sum, r) => sum + r.errors, 0) : 0,
    },
  };

  // Ensure directory exists
  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Report written to ${reportPath}\n`);
  return report;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const isVerifyOnly = process.argv.includes('--verify');
  const limitArg = process.argv.find(arg => arg.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  const tableArg = process.argv.find(arg => arg.startsWith('--table'));
  const tableName = tableArg ? tableArg.split('=')[1] : null;

  const tables = tableName ? [tableName] : TIER_1_TABLES;

  console.log(`\n═══ Backfill Feature Metadata ${isApply ? '(APPLY)' : '(DRY-RUN)'} ═══\n`);

  try {
    await connectDb();

    // Verification phase
    console.log('📊 Verifying tables...\n');
    const verifyResults = [];
    for (const table of tables) {
      const verification = await verifyTable(table);
      verifyResults.push(verification);
      console.log(`  ${table}:`);
      console.log(`    Total: ${verification.total}`);
      console.log(`    Missing feature_id: ${verification.missing.feature_id}`);
      console.log(`    Missing metadata: ${verification.missing.metadata}`);
      console.log(`    GIN index: ${verification.hasGinIndex ? '✅' : '❌'}`);
      console.log(`    B-tree index: ${verification.hasBtreeIndex ? '✅' : '❌'}`);
    }

    // Backfill phase
    if (!isVerifyOnly) {
      console.log('\n📝 Backfilling...\n');
      const backfillResults = [];
      for (const table of tables) {
        const result = await backfillTable(table, limit, isApply);
        backfillResults.push(result);
        console.log(`  ${table}: ${result.updated} rows ${isApply ? 'updated' : 'will be updated'}, ${result.errors} errors`);
      }

      await generateReport(verifyResults, backfillResults);

      if (!isApply) {
        console.log('ℹ️  Dry-run complete. Run with --apply to commit changes.\n');
      } else {
        console.log('\n✅ Backfill complete. Verification recommended.\n');
      }
    } else {
      await generateReport(verifyResults, null);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
