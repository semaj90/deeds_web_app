#!/usr/bin/env node
/**
 * align-grpc-proto-to-postgres-indexes.mjs
 *
 * Verifies that gRPC proto field contracts align with PostgreSQL indexing.
 *
 * Purpose:
 * - Ensure feature_id + metadata JSONB GIN indexes exist for all proto message consumers
 * - Map proto messages to Postgres tables that need indexing
 * - Validate index coverage for multi-hop Neo4j traversals
 * - Generate migration recommendations for missing indexes
 *
 * gRPC Proto Boundary:
 * - feature_id: canonical string identifier (indexed everywhere)
 * - metadata: JSONB envelope for type-safe serialization + GIN query support
 * - source_ref: source file path (composite index with feature_id)
 * - packet_key: unique identifier (indexed for exact-match retrieval)
 *
 * Proto Message → Postgres Table Mapping:
 * - Packet → atlas_packets (feature_id, metadata)
 * - RouteRuntimePacket → route_runtime_packets (feature_id, raw JSONB)
 * - TaskSemanticPacket → task_semantic_packets (feature_id, metadata)
 * - ConceptRecord → concept_records (feature_id, metadata)
 * - ChunkRecord → various chunk tables (feature_id, metadata)
 *
 * Index Requirements:
 * 1. Single-column: feature_id (for GROUP BY aggregations)
 * 2. Composite: (source_ref, feature_id) for multi-hop joins
 * 3. JSONB GIN: metadata->>'feature_id' + metadata->>'domain' for pathwise queries
 * 4. Multi-vector: SOM cluster + KMeans cluster for topology alignment
 *
 * Usage:
 *   node scripts/atlas/align-grpc-proto-to-postgres-indexes.mjs --check
 *   node scripts/atlas/align-grpc-proto-to-postgres-indexes.mjs --report
 *   node scripts/atlas/align-grpc-proto-to-postgres-indexes.mjs --validate-coverage
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const CHECK = process.argv.includes('--check');
const REPORT = process.argv.includes('--report');
const VALIDATE = process.argv.includes('--validate-coverage');

/**
 * gRPC Proto → Postgres Table Mapping
 * Maps proto message types to their backing tables and required indexes
 */
const PROTO_TABLE_MAP = {
  Packet: {
    table: 'atlas_packets',
    requiredIndexes: [
      'idx_atlas_packets_feature_id',
      'idx_atlas_packets_feature_id_composite',
      'atlas_packets_metadata_gin_idx',
      'idx_atlas_packets_payload_path',
      'idx_packets_source_feature_multi_hop',
      'idx_packets_centroid_cache',
    ],
    requiredFields: ['feature_id', 'metadata', 'source_ref', 'packet_key'],
  },
  RouteRuntimePacket: {
    table: 'route_runtime_packets',
    requiredIndexes: [
      'idx_route_runtime_packets_feature_id',
      'idx_rrp_raw_gin',
      'idx_rrp_feature_cluster',
      'idx_rrp_feature_ids_gin',
    ],
    requiredFields: ['feature_id', 'raw', 'route_state'],
  },
  TaskSemanticPacket: {
    table: 'task_semantic_packets',
    requiredIndexes: [
      'idx_task_semantic_packets_feature_id',
      'idx_task_semantic_packets_metadata_gin',
    ],
    requiredFields: ['feature_id', 'metadata'],
  },
  ConceptRecord: {
    table: 'concept_records',
    requiredIndexes: [
      'idx_concept_records_feature_ids_gin',
      'idx_concept_records_metadata_gin',
    ],
    requiredFields: ['concept_id', 'feature_ids', 'metadata'],
  },
};

/**
 * Query Postgres for existing indexes
 */
async function getExistingIndexes(pool, tableName) {
  const result = await pool.query(`
    SELECT
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = $1
    ORDER BY indexname
  `, [tableName]);
  return result.rows;
}

/**
 * Query Postgres for column definitions
 */
async function getTableColumns(pool, tableName) {
  const result = await pool.query(`
    SELECT
      column_name,
      data_type,
      is_nullable
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  return result.rows;
}

/**
 * Check index coverage for a table
 */
async function checkIndexCoverage(pool, protoName, tableSpec) {
  const { table, requiredIndexes, requiredFields } = tableSpec;

  try {
    const columns = await getTableColumns(pool, table);
    const columnNames = new Set(columns.map(c => c.column_name));
    const indexes = await getExistingIndexes(pool, table);
    const indexNames = new Set(indexes.map(i => i.indexname));

    const missingFields = requiredFields.filter(f => !columnNames.has(f));
    const missingIndexes = requiredIndexes.filter(i => !indexNames.has(i));

    return {
      proto: protoName,
      table,
      columns: columns.length,
      columnsMissing: missingFields,
      indexesTotal: indexes.length,
      indexesMissing: missingIndexes,
      indexesCoverage: missingIndexes.length === 0 ? 'PASS' : 'FAIL',
      fieldsCoverage: missingFields.length === 0 ? 'PASS' : 'FAIL',
    };
  } catch (err) {
    return {
      proto: protoName,
      table,
      error: err.message,
      indexesCoverage: 'ERROR',
      fieldsCoverage: 'ERROR',
    };
  }
}

/**
 * Main
 */
async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('\n═══ gRPC Proto → Postgres Index Alignment ═══\n');

  try {
    const results = [];
    for (const [protoName, tableSpec] of Object.entries(PROTO_TABLE_MAP)) {
      const result = await checkIndexCoverage(pool, protoName, tableSpec);
      results.push(result);
    }

    // Report
    console.log('Index Coverage Summary:');
    console.log('─'.repeat(80));
    for (const r of results) {
      const indexStatus = r.indexesCoverage === 'PASS' ? '✅' : r.indexesCoverage === 'ERROR' ? '⚠️ ' : '❌';
      const fieldStatus = r.fieldsCoverage === 'PASS' ? '✅' : r.fieldsCoverage === 'ERROR' ? '⚠️ ' : '❌';
      console.log(`${r.proto.padEnd(20)} ${indexStatus} indexes  ${fieldStatus} fields`);
      if (r.error) {
        console.log(`  └─ Error: ${r.error}`);
      } else {
        if (r.columnsMissing?.length) {
          console.log(`  └─ Missing columns: ${r.columnsMissing.join(', ')}`);
        }
        if (r.indexesMissing?.length) {
          console.log(`  └─ Missing indexes: ${r.indexesMissing.join(', ')}`);
        }
      }
    }

    // Validation gates
    const allPass = results.every(r => r.indexesCoverage === 'PASS' && r.fieldsCoverage === 'PASS');
    console.log('\n' + '─'.repeat(80));
    console.log(`Overall Coverage: ${allPass ? '✅ PASS' : '❌ FAIL'}`);

    // Write report
    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, 'grpc-proto-postgres-alignment.json');
    writeFileSync(reportPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      coverage: results,
      gate: allPass ? 'PASS' : 'FAIL',
      recommendations: allPass ? [] : [
        'Run: npm run drizzle:migrate (applies manual/0024_feature_id_metadata_gin_indexes.sql)',
        'Verify: docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT indexname FROM pg_indexes WHERE tablename LIKE \'atlas\_%\' ORDER BY indexname;"',
      ],
    }, null, 2));

    console.log(`\nReport: docs/reports/grpc-proto-postgres-alignment.json\n`);

    if (!allPass) process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
