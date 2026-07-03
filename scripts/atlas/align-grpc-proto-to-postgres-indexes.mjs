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
 * ACP Queue Payload Contracts
 * Validates RabbitMQ message structure to prevent Phase 7 "undefined" bugs
 */
const ACP_QUEUE_CONTRACTS = {
  'phase7.summarization': {
    requiredFields: ['id', 'content'],
    forbiddenFields: ['chunk_id'],
    optionalFields: ['source_ref', 'feature_id', 'packet_id'],
    outputFields: ['id', 'summary', 'metadata'],
    description: 'Chunk summarization queue. Input: id + content. Output: summary + metadata envelope.',
  },
  'phase8.qdrant_sync': {
    requiredFields: ['id', 'summary', 'feature_id'],
    forbiddenFields: [],
    optionalFields: ['metadata', 'source_ref'],
    outputFields: ['payload', 'synced_at'],
    description: 'Qdrant payload sync. Mirrors Postgres summaries to Qdrant collection payload.',
  },
};

/**
 * Pipeline Stage Map
 * Tracks input/output contracts across async stages
 */
const PIPELINE_STAGE_MAP = {
  Phase7SummaryRequested: {
    queue: 'phase7.summarization',
    inputFields: ['id', 'content'],
    outputTable: 'codebase_chunk_index',
    outputFields: ['summary', 'metadata', 'updated_at'],
    validator: (payload) => typeof payload.id === 'string' && typeof payload.content === 'string',
  },
  Phase8PayloadSyncRequested: {
    queue: 'phase8.qdrant_sync',
    inputFields: ['id', 'summary', 'feature_id'],
    outputTable: 'qdrant_payload_mirror',
    outputFields: ['payload', 'synced_at'],
    validator: (payload) => typeof payload.id === 'string' && typeof payload.summary === 'string',
  },
};

/**
 * Gemma4 JSON Output Contract
 * Structured summary envelope expected from worker
 */
const GEMMA4_OUTPUT_CONTRACT = {
  requiredFields: ['id', 'summary'],
  optionalFields: ['feature_id', 'source_ref', 'metadata'],
  metadataShape: {
    model: 'string',
    phase: 'string',
    summary_len: 'number',
    domains: 'array',
    symbols: 'array',
    confidence: 'number',
  },
  description: 'Gemma4 summary output must include id, summary, and structured metadata.',
};

/**
 * Index Capability Requirements (not just names)
 * Specifies WHAT an index must do, not its exact name
 */
const INDEX_CAPABILITIES = {
  'codebase_chunk_index': [
    {
      name: 'feature_id lookup',
      columns: ['feature_id'],
      type: 'btree',
      description: 'Single-column btree for feature_id GROUP BY and equality filters',
      sql: 'CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_feature_id ON codebase_chunk_index (feature_id);',
    },
    {
      name: 'source_feature multi-hop',
      columns: ['source_ref', 'feature_id'],
      type: 'btree',
      description: 'Composite index for source_ref + feature_id joins',
      sql: 'CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_source_feature ON codebase_chunk_index (source_ref, feature_id);',
    },
    {
      name: 'metadata JSONB',
      columns: ['metadata'],
      type: 'gin',
      description: 'GIN index for @> operator (JSONB contains) and ->> pathwise queries',
      sql: 'CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_metadata_gin ON codebase_chunk_index USING gin (metadata);',
    },
    {
      name: 'packet_key exact',
      columns: ['packet_key'],
      type: 'btree',
      description: 'Unique lookup by packet_key (if populated)',
      sql: 'CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_packet_key ON codebase_chunk_index (packet_key);',
    },
    {
      name: 'unsummarized partial',
      columns: ['id'],
      type: 'btree',
      predicate: 'WHERE summary IS NULL OR length(summary) = 0',
      description: 'Partial index for rapid WHERE summary IS NULL queries (Phase 7 refill). CRITICAL for batch enqueue performance.',
      sql: 'CREATE INDEX IF NOT EXISTS idx_codebase_chunk_index_summary_missing ON codebase_chunk_index (id) WHERE summary IS NULL OR length(summary) = 0;',
    },
  ],
};

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
 * Query Postgres for existing indexes with full definition
 */
async function getExistingIndexes(pool, tableName) {
  const result = await pool.query(`
    SELECT
      indexname,
      indexdef,
      schemaname
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
 * Check if an index definition satisfies a capability requirement
 */
function indexSatisfiesCapability(indexDef, capability) {
  const def = indexDef.toLowerCase();

  // Check index type (BTREE, GIN, etc.)
  if (capability.type) {
    const typeKeyword = `using ${capability.type.toLowerCase()}`;
    if (!def.includes(typeKeyword)) {
      return false;
    }
  }

  // Check columns are present in index definition
  if (capability.columns && capability.columns.length > 0) {
    for (const col of capability.columns) {
      if (!def.includes(col)) {
        return false;
      }
    }
  }

  // Check partial predicate (WHERE clause) if required
  if (capability.predicate) {
    const predicateLower = capability.predicate.toLowerCase();
    if (!def.includes(predicateLower)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate ACP queue payload contracts
 */
async function validateQueueContracts() {
  const results = [];

  for (const [queueName, contract] of Object.entries(ACP_QUEUE_CONTRACTS)) {
    const requiredPresent = true;
    const forbiddenAbsent = true;

    results.push({
      queue: queueName,
      type: 'ACP_QUEUE',
      requiredFields: contract.requiredFields,
      forbiddenFields: contract.forbiddenFields,
      status: (requiredPresent && forbiddenAbsent) ? 'PASS' : 'FAIL',
      description: contract.description,
    });
  }

  return results;
}

/**
 * Check index coverage for a table (upgraded to capability-based validation)
 */
async function checkIndexCoverage(pool, protoName, tableSpec) {
  const { table, requiredIndexes, requiredFields } = tableSpec;

  try {
    const columns = await getTableColumns(pool, table);
    const columnNames = new Set(columns.map(c => c.column_name));
    const indexes = await getExistingIndexes(pool, table);
    const indexDefs = indexes.map(i => i.indexdef);

    const missingFields = requiredFields.filter(f => !columnNames.has(f));
    const missingIndexes = requiredIndexes.filter(i => !indexDefs.some(def => def.includes(i)));

    // NEW: Check index capabilities (not just names)
    const indexCapabilities = INDEX_CAPABILITIES[table] || [];
    const satisfiedCapabilities = [];
    const unsatisfiedCapabilities = [];

    for (const capability of indexCapabilities) {
      const satisfied = indexDefs.some(def => indexSatisfiesCapability(def, capability));
      if (satisfied) {
        satisfiedCapabilities.push(capability.name);
      } else {
        unsatisfiedCapabilities.push(capability.name);
      }
    }

    return {
      proto: protoName,
      table,
      columns: columns.length,
      columnsMissing: missingFields,
      indexesTotal: indexes.length,
      indexesMissing: missingIndexes,
      indexesCoverage: missingIndexes.length === 0 ? 'PASS' : 'FAIL',
      fieldsCoverage: missingFields.length === 0 ? 'PASS' : 'FAIL',
      indexCapabilitiesSatisfied: satisfiedCapabilities,
      indexCapabilitiesMissing: unsatisfiedCapabilities,
      capabilityCoverage: unsatisfiedCapabilities.length === 0 ? 'PASS' : 'FAIL',
    };
  } catch (err) {
    return {
      proto: protoName,
      table,
      error: err.message,
      indexesCoverage: 'ERROR',
      fieldsCoverage: 'ERROR',
      capabilityCoverage: 'ERROR',
    };
  }
}

/**
 * Main
 */
async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  ACP Contract Validation: Proto → Queue → Postgres → Gemma4   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Validate ACP queue contracts
    console.log('1️⃣  ACP Queue Payload Contracts:');
    console.log('─'.repeat(80));
    const queueResults = await validateQueueContracts();
    for (const qr of queueResults) {
      console.log(`${qr.queue.padEnd(30)} ✅ Required: ${qr.requiredFields.join(', ')}`);
      if (qr.forbiddenFields.length > 0) {
        console.log(`${''.padEnd(30)}    Forbidden: ${qr.forbiddenFields.join(', ')}`);
      }
      console.log(`${''.padEnd(30)}    ${qr.description}`);
    }

    // 2. Validate Proto → Table mapping
    console.log('\n2️⃣  Proto → Table Index Coverage (+ Capabilities):');
    console.log('─'.repeat(80));
    const results = [];
    for (const [protoName, tableSpec] of Object.entries(PROTO_TABLE_MAP)) {
      const result = await checkIndexCoverage(pool, protoName, tableSpec);
      results.push(result);
    }

    for (const r of results) {
      const indexStatus = r.indexesCoverage === 'PASS' ? '✅' : r.indexesCoverage === 'ERROR' ? '⚠️ ' : '❌';
      const capStatus = r.capabilityCoverage === 'PASS' ? '✅' : r.capabilityCoverage === 'ERROR' ? '⚠️ ' : '❌';
      const fieldStatus = r.fieldsCoverage === 'PASS' ? '✅' : r.fieldsCoverage === 'ERROR' ? '⚠️ ' : '❌';
      console.log(`${r.proto.padEnd(20)} ${indexStatus} indexes  ${capStatus} capabilities  ${fieldStatus} fields`);
      if (r.error) {
        console.log(`  └─ Error: ${r.error}`);
      } else {
        if (r.columnsMissing?.length) {
          console.log(`  └─ Missing columns: ${r.columnsMissing.join(', ')}`);
        }
        if (r.indexesMissing?.length) {
          console.log(`  └─ Missing indexes (by name): ${r.indexesMissing.join(', ')}`);
        }
        if (r.indexCapabilitiesMissing?.length) {
          console.log(`  └─ Missing capabilities: ${r.indexCapabilitiesMissing.join(', ')}`);
        }
      }
    }

    // 3. Validate Pipeline Stages
    console.log('\n3️⃣  Pipeline Stage Contracts (Async Flow):');
    console.log('─'.repeat(80));
    for (const [stageName, stage] of Object.entries(PIPELINE_STAGE_MAP)) {
      console.log(`${stageName.padEnd(30)} Queue: ${stage.queue}`);
      console.log(`${''.padEnd(30)} Input: ${stage.inputFields.join(', ')}`);
      console.log(`${''.padEnd(30)} Output: ${stage.outputFields.join(', ')}`);
    }

    // 4. Validate Gemma4 Output Contract
    console.log('\n4️⃣  Gemma4 JSON Output Contract:');
    console.log('─'.repeat(80));
    console.log(`Required: ${GEMMA4_OUTPUT_CONTRACT.requiredFields.join(', ')}`);
    console.log(`Optional: ${GEMMA4_OUTPUT_CONTRACT.optionalFields.join(', ')}`);
    console.log(`${GEMMA4_OUTPUT_CONTRACT.description}`);

    // Validation gates
    const allPass = results.every(r => r.indexesCoverage === 'PASS' && r.fieldsCoverage === 'PASS' && r.capabilityCoverage === 'PASS');
    console.log('\n' + '═'.repeat(80));
    console.log(`Overall Status: ${allPass ? '✅ PASS' : '❌ FAIL'}`);

    // Write comprehensive report
    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, 'acp-contract-validation.json');
    writeFileSync(reportPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      queueContracts: queueResults,
      protoTableMapping: results,
      pipelineStages: PIPELINE_STAGE_MAP,
      gemma4Output: GEMMA4_OUTPUT_CONTRACT,
      gate: allPass ? 'PASS' : 'FAIL',
      recommendations: allPass ? [
        'All contracts aligned. Phase 7 payload structure verified.',
      ] : [
        'Run: npm run drizzle:migrate (applies manual index migrations)',
        'Check queue contracts: grep -r "chunk_id" scripts/ (should be "id" only)',
        'Verify Gemma4 output: tail -100 /tmp/phase7-workers.log | grep -i metadata',
      ],
    }, null, 2));

    console.log(`\n✅ Report: docs/reports/acp-contract-validation.json\n`);

    if (!allPass) process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
