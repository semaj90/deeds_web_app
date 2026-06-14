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
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';
import { normalizeSourceRef } from '../../../scripts/atlas/lib/normalize-source-ref.mjs';

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

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

let featureIdBySourceRef = new Map();
let featureLabelByFeatureId = new Map();

let client = null;
let reportPath = path.join(REPO_ROOT, 'docs', 'reports', 'backfill-feature-metadata.json');

function humanizeFeatureLabel(featureId) {
  const raw = String(featureId ?? '').trim();
  if (!raw) return null;
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

async function loadFeatureLookups() {
  featureIdBySourceRef = new Map();
  featureLabelByFeatureId = new Map();

  const columnResult = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'atlas_feature_map'
  `);
  const columns = new Set(columnResult.rows.map((row) => row.column_name));
  const hasFeatureId = columns.has('feature_id');
  const hasFeatureLabel = columns.has('feature_label');
  const hasSourceRef = columns.has('source_ref');
  const hasNormalizedPath = columns.has('normalized_path');
  const hasFilePath = columns.has('file_path');
  const selectParts = [
    hasSourceRef ? 'source_ref' : 'NULL::text AS source_ref',
    hasNormalizedPath ? 'normalized_path' : 'NULL::text AS normalized_path',
    hasFilePath ? 'file_path' : 'NULL::text AS file_path',
    hasFeatureId ? 'feature_id' : 'NULL::text AS feature_id',
    hasFeatureLabel ? 'feature_label' : 'NULL::text AS feature_label',
  ];
  const predicates = [
    hasSourceRef ? 'source_ref IS NOT NULL' : null,
    hasNormalizedPath ? 'normalized_path IS NOT NULL' : null,
    hasFilePath ? 'file_path IS NOT NULL' : null,
    hasFeatureId ? 'feature_id IS NOT NULL' : null,
  ].filter(Boolean);

  if (predicates.length === 0) return;

  const rows = await client.query(`
    SELECT ${selectParts.join(', ')}
    FROM atlas_feature_map
    WHERE ${predicates.join(' OR ')}
  `);

  for (const row of rows.rows) {
    const featureId = row.feature_id ? String(row.feature_id).trim() : null;
    const featureLabel = row.feature_label ? String(row.feature_label).trim() : humanizeFeatureLabel(featureId);

    if (featureId && featureLabel && !featureLabelByFeatureId.has(featureId)) {
      featureLabelByFeatureId.set(featureId, featureLabel);
    }

    for (const candidate of [row.source_ref, row.normalized_path, row.file_path]) {
      const normalized = normalizeSourceRef(candidate);
      if (normalized && featureId && !featureIdBySourceRef.has(normalized)) {
        featureIdBySourceRef.set(normalized, featureId);
      }
    }
  }
}

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

function inferFeatureIdentity(sourceRef, filePath) {
  const candidates = [sourceRef, filePath]
    .map((value) => normalizeSourceRef(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    const featureId = featureIdBySourceRef.get(candidate);
    if (featureId) {
      return {
        featureId,
        featureLabel: featureLabelByFeatureId.get(featureId) || humanizeFeatureLabel(featureId),
        source: 'atlas_feature_map',
      };
    }
  }

  const searchPath = sourceRef || filePath;
  if (!searchPath) {
    // Orphaned records with no source ref → assign to unclassified_packet
    return {
      featureId: 'unclassified_packet',
      featureLabel: 'Unclassified Packet',
      source: 'orphan_fallback',
    };
  }

  for (const [prefix, featureId] of Object.entries(FEATURE_MAP)) {
    if (String(searchPath).startsWith(prefix)) {
      return {
        featureId,
        featureLabel: featureLabelByFeatureId.get(featureId) || humanizeFeatureLabel(featureId),
        source: 'feature-prefix',
      };
    }
  }

  // Fallback for paths that don't match any prefix
  return {
    featureId: 'general_other',
    featureLabel: 'General Other',
    source: 'no-prefix-match',
  };
}

// Map table names to actual column names
// Only Tier 1 tables with feature_id/metadata bacKfill need
const TABLE_COLUMN_MAP = {
  'atlas_packets': {
    feature_id: 'feature_id',
    feature_label: 'feature_label',
    source_ref: 'source_ref',
    metadata: 'metadata',
    file_path: null,
    id: 'packet_id',
  },
  'nes_chrom_packets': {
    feature_id: 'feature_id',
    feature_label: 'feature_label',
    source_ref: 'source_ref',
    metadata: 'metadata',
    file_path: null,
    id: 'id',
  },
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
  if (cols.feature_label) selectParts.push(`COUNT(CASE WHEN ${cols.feature_label} IS NOT NULL THEN 1 END) as has_feature_label`);
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
    feature_label: cols.feature_label ? (total - parseInt(row.has_feature_label || 0, 10)) : null,
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
    selectList.push(`${cols.source_ref} as source_ref`);
  }
  if (cols.file_path) {
    selectList.push(`${cols.file_path} as file_path`);
  } else {
    selectList.push(`NULL::text as file_path`);
  }
  if (cols.feature_id) {
    selectList.push(`${cols.feature_id}`);
  } else {
    selectList.push(`NULL::text as feature_id`);
  }
  if (cols.feature_label) {
    selectList.push(`${cols.feature_label}`);
  } else {
    selectList.push(`NULL::text as feature_label`);
  }
  if (cols.metadata) {
    selectList.push(`${cols.metadata}`);
  } else {
    selectList.push(`NULL::jsonb as metadata`);
  }

  const whereClauses = [];
  if (cols.feature_id) whereClauses.push(`${cols.feature_id} IS NULL`);
  if (cols.feature_label) whereClauses.push(`${cols.feature_label} IS NULL`);
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
      const currentFeatureLabel = row.feature_label || null;
      const currentMetadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : null;

      const identity = inferFeatureIdentity(sourceRef, filePath);
      const inferredFeatureId = currentFeatureId || identity.featureId;
      const inferredFeatureLabel = currentFeatureLabel || identity.featureLabel;
      const updatedMetadata = currentMetadata ? { ...currentMetadata } : {};

      // Track provenance — separate from workspace/runtime/ranking junk
      if (inferredFeatureId && !currentFeatureId) {
        updatedMetadata.feature_id_inferred = true;
        updatedMetadata.feature_id_source = sourceRef ? 'source_ref_hash' : 'file_path_hash';
      }
      if (inferredFeatureLabel && !currentFeatureLabel) {
        updatedMetadata.feature_label_inferred = true;
      }

      // Set packet_universe (identity)
      updatedMetadata.packet_universe = 'atlas';
      updatedMetadata.lineage_version = 'packet-identity-v1';
      updatedMetadata.updated_at = new Date().toISOString();
      updatedMetadata.updated_by = 'backfill-feature-metadata';

      // File path is workspace evidence, not identity
      if (filePath) {
        updatedMetadata.file_path = filePath;
      }

      const shouldSetFeatureId = cols.feature_id && inferredFeatureId && inferredFeatureId !== currentFeatureId;
      const shouldSetFeatureLabel = cols.feature_label && inferredFeatureLabel && inferredFeatureLabel !== currentFeatureLabel;
      const shouldSetMetadata = cols.metadata && JSON.stringify(updatedMetadata) !== JSON.stringify(currentMetadata ?? {});

      if (!(shouldSetFeatureId || shouldSetFeatureLabel || shouldSetMetadata)) {
        continue;
      }

      if (apply) {
        const updateParts = [];
        const params = [];
        let paramCount = 1;

        if (shouldSetFeatureId) {
          updateParts.push(`${cols.feature_id} = $${paramCount++}`);
          params.push(inferredFeatureId);
        }

        if (shouldSetFeatureLabel) {
          updateParts.push(`${cols.feature_label} = $${paramCount++}`);
          params.push(inferredFeatureLabel);
        }

        if (shouldSetMetadata) {
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
  const npmArgv = (() => {
    try {
      return JSON.parse(process.env.npm_config_argv ?? '{}');
    } catch {
      return {};
    }
  })();
  const forwardedArgv = Array.isArray(npmArgv.original) ? npmArgv.original.slice(2) : [];
  const argv = [...process.argv.slice(2), ...forwardedArgv];
  const isApply = argv.includes('--apply') || process.env.npm_config_apply === 'true';
  const isVerifyOnly = argv.includes('--verify');
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
    await loadFeatureLookups();

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

    // Backfill phase (skip only if --verify flag is explicitly set)
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
      // Only verify, don't backfill
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
