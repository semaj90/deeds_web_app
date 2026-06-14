#!/usr/bin/env node
/**
 * verify-packet-index-alignment.mjs
 *
 * Verifies that PostgreSQL packet tables have proper feature_id + metadata JSONB indexing
 * to support multi-hop Neo4j traversals, Redis centroid lookup, Qdrant payload filtering,
 * and agentic hyper-dense search.
 *
 * This is the bridge between PostgreSQL indexing and Karpathy/HyperRAG ranking.
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

/**
 * Packet table requirements:
 * - feature_id: TEXT indexed (for Neo4j joins, Redis keys, Qdrant payload)
 * - feature_label: TEXT (for UI + ranking context)
 * - metadata: JSONB with GIN index (for domain, SOM, community_confidence, tags)
 * - source_ref: TEXT indexed (for multi-hop, Redis centroid, export alignment)
 * - packet_key: TEXT indexed (for exact match retrieval)
 */
const REQUIRED_COLUMNS = {
  atlas_packets: ['feature_id', 'metadata', 'source_ref', 'packet_key', 'feature_label'],
  route_runtime_packets: ['feature_id', 'raw', 'source_ref'],
  task_semantic_packets: ['feature_id', 'metadata', 'source_ref'],
  concept_records: ['feature_ids', 'metadata', 'concept_id'],
};

const REQUIRED_INDEXES = {
  atlas_packets: [
    'idx_atlas_packets_feature_id_composite',
    'atlas_packets_metadata_gin_idx',
    'idx_packets_source_feature_multi_hop',
    'idx_packets_centroid_cache',
    'idx_packets_qdrant_prefilter',
    'idx_packets_agentic_grouping',
  ],
  route_runtime_packets: [
    'idx_rrp_feature_cluster',
    'idx_rrp_raw_gin',
    'idx_route_runtime_packets_feature_id',
    'idx_route_runtime_packets_source_ref',
  ],
  task_semantic_packets: [
    'idx_task_semantic_packets_feature_id',
    'idx_task_semantic_packets_metadata_gin',
  ],
  concept_records: [
    'idx_concept_records_feature_ids_gin',
    'idx_concept_records_metadata_gin',
  ],
};

async function getTableColumns(pool, tableName) {
  const result = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  return result.rows;
}

async function getTableIndexes(pool, tableName) {
  const result = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = $1
    ORDER BY indexname
  `, [tableName]);
  return result.rows;
}

async function verifyAlignment() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('\n═══ PostgreSQL Packet Index Alignment ═══\n');

  const results = [];

  try {
    for (const [tableName, requiredCols] of Object.entries(REQUIRED_COLUMNS)) {
      const columns = await getTableColumns(pool, tableName);
      const columnNames = new Set(columns.map(c => c.column_name));
      const indexes = await getTableIndexes(pool, tableName);
      const indexNames = new Set(indexes.map(i => i.indexname));

      const requiredIdxs = REQUIRED_INDEXES[tableName] || [];
      const missingCols = requiredCols.filter(c => !columnNames.has(c));
      const missingIdxs = requiredIdxs.filter(i => !indexNames.has(i));

      const colStatus = missingCols.length === 0 ? '✅' : '❌';
      const idxStatus = missingIdxs.length === 0 ? '✅' : '❌';

      console.log(`${tableName.padEnd(30)} ${colStatus} columns  ${idxStatus} indexes`);
      if (missingCols.length > 0) {
        console.log(`  └─ Missing columns: ${missingCols.join(', ')}`);
      }
      if (missingIdxs.length > 0) {
        console.log(`  └─ Missing indexes: ${missingIdxs.join(', ')}`);
      }

      results.push({
        table: tableName,
        requiredColumns: requiredCols,
        presentColumns: Array.from(columnNames),
        missingColumns: missingCols,
        columnsCoverage: missingCols.length === 0 ? 'PASS' : 'FAIL',
        requiredIndexes: requiredIdxs,
        presentIndexes: indexes.map(i => i.indexname),
        missingIndexes: missingIdxs,
        indexesCoverage: missingIdxs.length === 0 ? 'PASS' : 'FAIL',
      });
    }

    const allPass = results.every(r => r.columnsCoverage === 'PASS' && r.indexesCoverage === 'PASS');
    console.log('\n' + '─'.repeat(80));
    console.log(`Overall Alignment: ${allPass ? '✅ PASS' : '❌ FAIL'}`);

    // Write report
    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });

    const jsonPath = join(reportDir, 'packet-index-alignment.json');
    writeFileSync(jsonPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      alignment: results,
      gate: allPass ? 'PASS' : 'FAIL',
      nextSteps: allPass ? [
        'Run: npm run atlas:karpathy:audit (verify Redis Karpathy scores)',
        'Run: npm run atlas:qdrant:payloads (verify Qdrant payload mirrors)',
        'Inspect: /api/atlas/search cascade for feature_id + metadata projection',
      ] : [
        'Fix missing columns: ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...',
        'Create missing indexes: CREATE INDEX IF NOT EXISTS ...',
        'Re-run: node scripts/atlas/verify-packet-index-alignment.mjs',
      ],
    }, null, 2));

    const mdPath = join(reportDir, 'packet-index-alignment.md');
    const mdContent = `# Packet Index Alignment Report

**Generated**: ${new Date().toISOString()}

## Summary
${allPass ? '✅ **PASS** — All packet tables are properly indexed.' : '❌ **FAIL** — Missing columns or indexes detected.'}

## Table Coverage

${results.map(r => `### ${r.table}
- **Columns**: ${r.columnsCoverage} (${r.presentColumns.length}/${r.requiredColumns.length})
- **Indexes**: ${r.indexesCoverage} (${r.presentIndexes.length}/${r.requiredIndexes.length})

Missing columns: ${r.missingColumns.length > 0 ? r.missingColumns.join(', ') : 'none'}
Missing indexes: ${r.missingIndexes.length > 0 ? r.missingIndexes.join(', ') : 'none'}
`).join('\n')}

## Purpose

These indexes enable:
- **Multi-hop Neo4j traversals**: (source_ref, feature_id) for USED_CONCEPT expansion
- **Redis centroid lookup**: Cached cluster centroids sorted by (source_ref, feature_id, updated_at DESC)
- **Qdrant payload filtering**: feature_id + domain_class + tags prefilter (54K → 4K candidates)
- **KMeans 20×20 SOM clustering**: som_cluster payload routing
- **Agentic hyper-dense search**: (domain_class, feature_id, source_ref) grouping
- **MapReduce + CouchDB + DuckDB**: Feature frequency aggregation, parquet export alignment

## Next Steps

${allPass ?
  `✅ Index alignment verified. Proceed to:
1. \`npm run atlas:karpathy:audit\` — Verify Redis Karpathy scores join to indexed packets
2. \`npm run atlas:qdrant:payloads\` — Verify Qdrant payload mirrors feature_id/source_ref
3. Inspect \`/api/atlas/search\` cascade — Ensure end-to-end metadata projection` :
  `❌ Index alignment incomplete. Fix:
1. Apply missing columns via ALTER TABLE
2. Create missing indexes
3. Re-run: \`node scripts/atlas/verify-packet-index-alignment.mjs\``
}
`;
    writeFileSync(mdPath, mdContent);

    console.log(`\nReports:\n  JSON: ${jsonPath}\n  Markdown: ${mdPath}\n`);

    if (!allPass) process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyAlignment().catch(err => {
  console.error(err);
  process.exit(1);
});
