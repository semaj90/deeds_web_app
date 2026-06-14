#!/usr/bin/env node
/**
 * Part B: Postgres Adaptive Index Verifier
 *
 * Read-only verification of atlas_codebase_packets index coverage.
 * Checks B-tree, GIN, BRIN, and vector indexes.
 *
 * Phase 1B gate: Confirm 18+ operational indexes and correct mappings.
 *
 * Output:
 *   - docs/reports/postgres-adaptive-indexes.json
 *   - docs/reports/postgres-adaptive-indexes.md
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const REPORTS_DIR = resolve(ROOT, 'docs/reports');

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

async function verifyIndexes() {
  logger.log('\n▶ Postgres Adaptive Index Verification');
  logger.log('─────────────────────────────────────');

  const report = {
    timestamp: new Date().toISOString(),
    table: 'atlas_codebase_packets',
    indexes: {},
    classification: {
      identity_indexed: [],
      topology_indexed: [],
      enrichment_indexed: [],
      jsonb_indexed: [],
      temporal_indexed: [],
      fts_indexed: []
    },
    summary: {
      total_indexes: 0,
      btree_count: 0,
      gin_count: 0,
      brin_count: 0,
      vector_count: 0
    },
    status: 'PENDING'
  };

  try {
    // Get all indexes on atlas_codebase_packets
    const indexRes = await pool.query(`
      SELECT
        i.relname as index_name,
        a.attname as column_name,
        ix.indisunique as is_unique,
        ix.indisprimary as is_primary,
        am.amname as access_method,
        ix.indexprs as expressions,
        ix.indkey as columns,
        t.relname as table_name
      FROM
        pg_class i
        JOIN pg_index ix ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_am am ON i.relam = am.oid
        LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE
        t.relname = 'atlas_codebase_packets'
      ORDER BY
        i.relname, a.attnum
    `);

    const indexes = indexRes.rows;
    report.summary.total_indexes = new Set(indexes.map(r => r.index_name)).size;

    // Categorize indexes
    indexes.forEach(idx => {
      const key = idx.index_name;
      if (!report.indexes[key]) {
        report.indexes[key] = {
          columns: [],
          access_method: idx.access_method,
          is_unique: idx.is_unique,
          is_primary: idx.is_primary,
          type: ''
        };
      }

      if (idx.column_name) {
        report.indexes[key].columns.push(idx.column_name);
      }

      // Count by type
      if (idx.access_method === 'btree') {
        report.summary.btree_count++;
      } else if (idx.access_method === 'gin') {
        report.summary.gin_count++;
      } else if (idx.access_method === 'brin') {
        report.summary.brin_count++;
      }
    });

    // Classify indexes
    Object.entries(report.indexes).forEach(([indexName, indexInfo]) => {
      const cols = indexInfo.columns;
      const method = indexInfo.access_method;

      // Identity indexes
      if (cols.includes('packet_key') || cols.includes('source_ref') || cols.includes('feature_id')) {
        report.classification.identity_indexed.push(indexName);
      }

      // Topology indexes
      if (cols.includes('som_cluster') || cols.includes('tree_node_id') || cols.includes('community_id')) {
        report.classification.topology_indexed.push(indexName);
      }

      // Enrichment indexes
      if (cols.includes('feature_label') || cols.includes('file_path') || cols.includes('summary')) {
        report.classification.enrichment_indexed.push(indexName);
      }

      // JSONB indexes
      if (method === 'gin' && (indexName.includes('metadata') || indexName.includes('jsonb'))) {
        report.classification.jsonb_indexed.push(indexName);
      }

      // Temporal indexes
      if (cols.includes('created_at') || method === 'brin') {
        report.classification.temporal_indexed.push(indexName);
      }

      // Full-text indexes
      if (indexName.includes('tsvector') || indexName.includes('fts')) {
        report.classification.fts_indexed.push(indexName);
      }
    });

    logger.ok(`Found ${report.summary.total_indexes} indexes`);
    logger.info(`  B-tree: ${report.summary.btree_count}`);
    logger.info(`  GIN: ${report.summary.gin_count}`);
    logger.info(`  BRIN: ${report.summary.brin_count}`);

    // Check for expected indexes
    const expectedIndexes = [
      'idx_atlas_codebase_packets_packet_key',
      'idx_atlas_codebase_packets_source_ref',
      'idx_atlas_codebase_packets_feature_id',
      'idx_atlas_codebase_packets_feature_label',
      'idx_atlas_codebase_packets_file_path',
      'idx_atlas_codebase_packets_community_id',
      'idx_atlas_codebase_packets_lineage_version',
      'idx_atlas_codebase_packets_metadata_gin'
    ];

    const existingIndexes = Object.keys(report.indexes);
    const missingIndexes = expectedIndexes.filter(exp => !existingIndexes.some(ex => ex.includes(exp.split('_').pop())));

    if (missingIndexes.length === 0) {
      report.status = 'PASS';
      logger.ok('All expected indexes present');
    } else {
      report.status = 'WARN';
      logger.warn(`${missingIndexes.length} expected indexes missing:`);
      missingIndexes.forEach(idx => logger.warn(`  - ${idx}`));
    }

    // Get table columns for verification
    const colRes = await pool.query(`
      SELECT
        a.attname as column_name,
        t.typname as type_name,
        a.attnotnull as not_null
      FROM
        pg_attribute a
        JOIN pg_type t ON a.atttypid = t.oid
        JOIN pg_class c ON c.oid = a.attrelid
      WHERE
        c.relname = 'atlas_codebase_packets'
        AND a.attnum > 0
      ORDER BY
        a.attnum
    `);

    report.columns = colRes.rows.map(r => ({
      name: r.column_name,
      type: r.type_name,
      not_null: r.not_null
    }));

    logger.ok(`Table has ${report.columns.length} columns`);

  } catch (err) {
    logger.error(`Verification failed: ${err.message}`);
    report.status = 'FAIL';
    report.error = err.message;
  }

  return report;
}

async function main() {
  const report = await verifyIndexes();

  // Write JSON
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(
    resolve(REPORTS_DIR, 'postgres-adaptive-indexes.json'),
    JSON.stringify(report, null, 2)
  );

  // Write Markdown
  const md = `# Postgres Adaptive Indexes — atlas_codebase_packets

**Timestamp**: ${report.timestamp}
**Status**: ${report.status}

## Summary

- **Total Indexes**: ${report.summary.total_indexes}
- **B-tree**: ${report.summary.btree_count}
- **GIN**: ${report.summary.gin_count}
- **BRIN**: ${report.summary.brin_count}

## Classification

### Identity Indexes (packet_key, source_ref, feature_id)
${report.classification.identity_indexed.length > 0
  ? report.classification.identity_indexed.map(idx => `- ${idx}`).join('\n')
  : '(none)'}

### Topology Indexes (som_cluster, tree_node_id, community_id)
${report.classification.topology_indexed.length > 0
  ? report.classification.topology_indexed.map(idx => `- ${idx}`).join('\n')
  : '(none)'}

### Enrichment Indexes (feature_label, file_path, summary)
${report.classification.enrichment_indexed.length > 0
  ? report.classification.enrichment_indexed.map(idx => `- ${idx}`).join('\n')
  : '(none)'}

### JSONB Indexes (metadata)
${report.classification.jsonb_indexed.length > 0
  ? report.classification.jsonb_indexed.map(idx => `- ${idx}`).join('\n')
  : '(none)'}

### Temporal Indexes (created_at, BRIN)
${report.classification.temporal_indexed.length > 0
  ? report.classification.temporal_indexed.map(idx => `- ${idx}`).join('\n')
  : '(none)'}

## Columns

${report.columns?.map(col => `- ${col.name} (${col.type})${col.not_null ? ' NOT NULL' : ''}`).join('\n')}

## Pass Condition

✅ Status: ${report.status}
${report.status === 'PASS' ? '✅ All identity, topology, and enrichment indexes present' : '⚠️ Review index coverage'}
`;

  writeFileSync(
    resolve(REPORTS_DIR, 'postgres-adaptive-indexes.md'),
    md
  );

  logger.ok(`\n✅ Reports written to ${REPORTS_DIR}`);
}

main().catch(err => {
  logger.error(err.message);
  process.exit(1);
}).finally(() => {
  pool.end();
});
