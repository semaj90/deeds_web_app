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

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';
const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);

const TIER_1_TABLES = [
  'atlas_packets',
  'nes_chrom_packets',
  // 'glyph_records',      // Defer to Tier 2 (no feature_id column)
  // 'codebase_chunk_index', // Defer to Tier 2 (different schema structure)
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

// Map table names to actual column names
// Only Tier 1 tables with feature_id/metadata bacKfill need
const TABLE_COLUMN_MAP = {
  'atlas_packets': { feature_id: 'feature_id', source_ref: 'source_ref', metadata: 'metadata', file_path: 'file_path', id: 'id' },
  'nes_chrom_packets': { feature_id: 'feature_id', source_ref: 'source_ref', metadata: 'metadata', file_path: 'file_path', id: 'id' },
  'glyph_records': { feature_id: null, source_ref: 'source_ref', metadata: 'record_json', file_path: null, id: 'id' },
  // codebase_chunk_index has no feature_id/metadata — defer to Tier 2
  'codebase_chunk_index': { feature_id: null, source_ref: 'relative_path', metadata: 'cluster_summary', file_path: null, id: 'id' },
};

function getColumnNames(tableName) {
  return TABLE_COLUMN_MAP[tableName] || TABLE_COLUMN_MAP['atlas_packets'];
}

async function verifyTable(tableName) {
  const cols = getColumnNames(tableName);

  // Build dynamic query based on available columns
  const selectParts = [
    'COUNT(*) as total',
  ];

  if (cols.feature_id) selectParts.push(`COUNT(CASE WHEN ${cols.feature_id} IS NOT NULL THEN 1 END) as has_feature_id`);
  if (cols.source_ref) selectParts.push(`COUNT(CASE WHEN ${cols.source_ref} IS NOT NULL THEN 1 END) as has_source_ref`);
  if (cols.metadata) selectParts.push(`COUNT(CASE WHEN ${cols.metadata} IS NOT NULL THEN 1 END) as has_metadata`);
  if (cols.file_path) selectParts.push(`COUNT(CASE WHEN ${cols.file_path} IS NOT NULL THEN 1 END) as has_file_path`);

  const result = await client.query(`
    SELECT ${selectParts.join(',\n           ')}
    FROM ${tableName};
  `);

  const row = result.rows[0];
  const total = parseInt(row.total, 10);
  const missing = {
    feature_id: cols.feature_id ? (total - parseInt(row.has_feature_id || 0, 10)) : null,
    source_ref: cols.source_ref ? (total - parseInt(row.has_source_ref || 0, 10)) : null,
    metadata: cols.metadata ? (total - parseInt(row.has_metadata || 0, 10)) : null,
    file_path: cols.file_path ? (total - parseInt(row.has_file_path || 0, 10)) : null,
  };

  // Check for GIN indexes on metadata/record_json column
  const metadataCol = cols.metadata || 'metadata';
  const indexResult = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = $1 AND indexdef LIKE $2;
  `, [tableName, `%gin%${metadataCol}%`]);

  const hasGinIndex = indexResult.rows.length > 0;

  // Check for B-tree indexes on feature_id/source_ref columns
  let btreeIndexes = [];
  if (cols.feature_id) {
    const ftResult = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = $1 AND indexdef LIKE $2;
    `, [tableName, `%${cols.feature_id}%`]);
    btreeIndexes.push(...ftResult.rows);
  }
  if (cols.source_ref) {
    const srResult = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = $1 AND indexdef LIKE $2;
    `, [tableName, `%${cols.source_ref}%`]);
    btreeIndexes.push(...srResult.rows);
  }

  const hasBtreeIndex = btreeIndexes.length > 0;

  return {
    table: tableName,
    total,
    missing,
    hasGinIndex,
    hasBtreeIndex,
  };
}

async function backfillTable(tableName, limit = null, apply = false) {
  const cols = getColumnNames(tableName);

  // Build dynamic SELECT based on available columns
  const selectList = [];
  selectList.push(cols.id);

  if (cols.source_ref) {
    selectList.push(`COALESCE(${cols.source_ref}, '') as source_ref`);
  }
  if (cols.file_path) {
    selectList.push(`COALESCE(${cols.file_path}, '') as file_path`);
  } else {
    selectList.push(`'' as file_path`); // Placeholder for missing column
  }
  if (cols.feature_id) {
    selectList.push(`${cols.feature_id}`);
  } else {
    selectList.push(`NULL as feature_id`); // Placeholder for missing column
  }
  if (cols.metadata) {
    selectList.push(`${cols.metadata}`);
  } else {
    selectList.push(`'{}'::jsonb as metadata`); // Placeholder
  }

  const whereClauses = [];
  if (cols.feature_id) whereClauses.push(`${cols.feature_id} IS NULL`);
  if (cols.metadata) whereClauses.push(`${cols.metadata} IS NULL`);

  if (whereClauses.length === 0) {
    return { table: tableName, updated: 0, errors: 0, reason: 'No backfill needed (all required fields present)' };
  }

  const query = `
    SELECT ${selectList.join(', ')}
    FROM ${tableName}
    WHERE ${whereClauses.join(' OR ')}
    LIMIT ${limit || 10000};
  `;

  let result;
  try {
    result = await client.query(query);
  } catch (err) {
    console.error(`  Error querying ${tableName}:`, err.message);
    return { table: tableName, updated: 0, errors: 1, reason: `Query failed: ${err.message}` };
  }

  const rows = result.rows;

  if (rows.length === 0) {
    return { table: tableName, updated: 0, errors: 0, reason: 'No rows need backfill' };
  }

  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const sourceRef = row.source_ref || null;
      const filePath = row.file_path || null;
      const currentFeatureId = row.feature_id || null;
      const currentMetadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};

      const inferredFeatureId = currentFeatureId || inferFeatureId(sourceRef, filePath);
      const updatedMetadata = { ...currentMetadata };

      if (inferredFeatureId && !currentFeatureId) {
        updatedMetadata.feature_id_inferred = true;
        updatedMetadata.feature_id_source = sourceRef ? 'source_ref_hash' : 'file_path_hash';
      }

      if (apply && cols.feature_id) {
        // Build UPDATE based on what's available
        const updateParts = [];
        const params = [];
        let paramCount = 1;

        if (inferredFeatureId !== currentFeatureId) {
          updateParts.push(`${cols.feature_id} = $${paramCount++}`);
          params.push(inferredFeatureId);
        }

        if (cols.metadata && JSON.stringify(updatedMetadata) !== JSON.stringify(currentMetadata)) {
          updateParts.push(`${cols.metadata} = $${paramCount++}`);
          params.push(JSON.stringify(updatedMetadata));
        }

        params.push(row[cols.id]);

        if (updateParts.length > 0) {
          await client.query(
            `UPDATE ${tableName} SET ${updateParts.join(', ')} WHERE ${cols.id} = $${paramCount};`,
            params
          );
        }
      }
      updated++;
    } catch (err) {
      console.error(`  Error updating ${tableName} row ${row[cols.id]}:`, err.message);
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
  const argv = process.argv.slice(2);
  const readArgValue = (flag) => {
    const idx = argv.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
    if (idx < 0) return null;
    const value = argv[idx].includes('=') ? argv[idx].split('=', 2)[1] : argv[idx + 1];
    return value ? String(value) : null;
  };
  const limitValue = readArgValue('--limit');
  const limit = limitValue ? parseInt(limitValue, 10) : null;
  const tableName = readArgValue('--table');

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
