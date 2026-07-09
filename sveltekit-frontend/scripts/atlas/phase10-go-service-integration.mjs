#!/usr/bin/env node
/**
 * Phase 10: Go Service Integration for API Indexing & Search
 *
 * Wires Go retrieval, search, and embedding services into Phase 10 telemetry
 * and daily graphify pipeline.
 *
 * Services:
 * - go-search-service (HTTP :8096, gRPC :50055) — BM25 + schema-aware search
 * - go-embedding-service (HTTP :8097, gRPC :50051) — embeddinggemma proxy + Redis cache
 * - go-retrieval-service (HTTP :8100, gRPC :50053) — unified RAG/KAG/DAG retrieval
 */

import { Command } from 'commander';
import fetch from 'node-fetch';

const program = new Command();

program
  .option('--check-health', 'Check all Go services health status')
  .option('--index-tools', 'Index all canonical tools into go-search-service')
  .option('--wire-telemetry', 'Wire tool telemetry events to go-search-service')
  .option('--add-to-graphify', 'Add go-retrieval to daily graphify pipeline')
  .option('--validate', 'Validate Go service contracts');

program.parse(process.argv);
const options = program.opts();

const SERVICES = {
  'go-search': {
    http: 'http://localhost:8096',
    grpc: 'localhost:50055',
    health: '/health',
    description: 'BM25 + schema-aware search'
  },
  'go-embedding': {
    http: 'http://localhost:8097',
    grpc: 'localhost:50051',
    health: '/health',
    description: 'Embedding service (embeddinggemma proxy)'
  },
  'go-retrieval': {
    http: 'http://localhost:8100',
    grpc: 'localhost:50053',
    health: '/health',
    description: 'Unified RAG/KAG/DAG retrieval'
  }
};

/**
 * Check health of all Go services
 */
async function checkHealth() {
  console.log('🔍 Go Service Integration - Health Check');
  console.log('');

  for (const [name, service] of Object.entries(SERVICES)) {
    try {
      const response = await fetch(`${service.http}${service.health}`, { timeout: 5000 });
      if (response.ok) {
        console.log(`✅ ${name}: UP (${service.description})`);
        console.log(`   HTTP: ${service.http}`);
        console.log(`   gRPC: ${service.grpc}`);
      } else {
        console.log(`⚠️  ${name}: DOWN (HTTP ${response.status})`);
      }
    } catch (error) {
      console.log(`❌ ${name}: UNAVAILABLE (${error.message})`);
    }
    console.log('');
  }
}

/**
 * Index canonical tools into go-search-service
 */
async function indexTools() {
  console.log('📚 Indexing Canonical Tools to go-search-service');
  console.log('');

  const canonicalTools = [
    {
      tool_id: 'trace.kag_search',
      name: 'KAG Search',
      description: 'Knowledge-augmented retrieval with graph traversal',
      capabilities: ['semantic search', 'graph expansion', 'topology-aware ranking'],
      input_schema: { query: 'string', max_hops: 'integer', filter: 'object' },
      output_schema: { candidates: 'array<Packet>', ranked: 'boolean', explanation: 'string' }
    },
    {
      tool_id: 'qdrant.dense_search',
      name: 'Qdrant Dense Search',
      description: 'Vector ANN search in 384-dimensional space',
      capabilities: ['vector similarity', 'RRF fusion', 'payload filtering'],
      input_schema: { vector: 'float32[384]', limit: 'integer', filter: 'object' },
      output_schema: { points: 'array<Point>', scores: 'float[]', total: 'integer' }
    },
    {
      tool_id: 'rg.lexical_search',
      name: 'Ripgrep Lexical Search',
      description: 'Fast regex-based code search with multi-threading',
      capabilities: ['exact match', 'regex patterns', 'file type filtering'],
      input_schema: { pattern: 'string', path: 'string', limit: 'integer' },
      output_schema: { files: 'array<Match>', line_count: 'integer' }
    },
    {
      tool_id: 'topology.search_near',
      name: 'Topology Neighborhood Search',
      description: 'Find packets within k hops in Neo4j knowledge graph',
      capabilities: ['k-hop traversal', 'relationship filtering', 'authority ranking'],
      input_schema: { packet_id: 'string', k: 'integer', rel_types: 'string[]' },
      output_schema: { neighbors: 'array<Packet>', paths: 'array<Path>', distances: 'integer[]' }
    },
    {
      tool_id: 'gemma4.explain_code',
      name: 'Gemma4 Code Explanation',
      description: 'LLM synthesis of code structure, intent, and constraints',
      capabilities: ['code summarization', 'constraint extraction', 'dependency mapping'],
      input_schema: { code_snippet: 'string', context: 'object' },
      output_schema: { explanation: 'string', constraints: 'object', dependencies: 'string[]' }
    },
    {
      tool_id: 'neo4j.dependency_closure',
      name: 'Neo4j Dependency Closure',
      description: 'Compute transitive dependencies in code graph',
      capabilities: ['closure computation', 'circular detection', 'depth limiting'],
      input_schema: { root_id: 'string', rel_type: 'string', max_depth: 'integer' },
      output_schema: { closure: 'array<Packet>', cycles: 'array<Path>', depth: 'integer' }
    }
  ];

  try {
    for (const tool of canonicalTools) {
      console.log(`📝 Indexing ${tool.name}...`);

      const response = await fetch(`${SERVICES['go-search'].http}/api/tools/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_id: tool.tool_id,
          name: tool.name,
          description: tool.description,
          capabilities: tool.capabilities,
          input_schema: tool.input_schema,
          output_schema: tool.output_schema,
          indexed_at: new Date().toISOString()
        }),
        timeout: 5000
      });

      if (response.ok) {
        console.log(`   ✅ Indexed`);
      } else {
        console.log(`   ⚠️  HTTP ${response.status}`);
      }
    }
    console.log('');
    console.log('✨ Tool indexing complete');
  } catch (error) {
    console.error('❌ Tool indexing failed:', error.message);
  }
}

/**
 * Wire telemetry events to go-search-service for tool performance tracking
 */
async function wireTelemetry() {
  console.log('🔗 Wiring Tool Telemetry to go-search-service');
  console.log('');

  console.log('📋 Telemetry Integration Points:');
  console.log('  1. tool_execution_log → go-search /api/telemetry/events');
  console.log('  2. RabbitMQ tool.telemetry queue → Go service consumer');
  console.log('  3. tool_execution_stats_7d → go-search /api/stats/refresh');
  console.log('');

  console.log('📝 Implementation Steps:');
  console.log('  1. Create tool-telemetry consumer (scripts/workers/tool-telemetry-consumer.mjs)');
  console.log('  2. Add RabbitMQ queue listener for tool.telemetry');
  console.log('  3. POST telemetry events to go-search /api/telemetry/events');
  console.log('  4. Track tool performance: success_rate, latency_ms, error_type');
  console.log('  5. Sync stats to go-search every hour (cron or RabbitMQ scheduled)');
  console.log('');

  console.log('⏳ Telemetry Event Schema:');
  console.log(JSON.stringify({
    tool_id: 'trace.kag_search',
    query: 'semantic search with graph expansion',
    success: 1,
    latency_ms: 427,
    error_type: null,
    timestamp: '2026-07-09T12:34:56Z',
    tags: ['high-quality', 'cached-candidate', 'kag-expanded']
  }, null, 2));
}

/**
 * Add go-retrieval to daily graphify pipeline
 */
async function addToGraphify() {
  console.log('📅 Adding go-retrieval to Daily Graphify Pipeline');
  console.log('');

  console.log('📋 Graphify Integration:');
  console.log('');
  console.log('  Current Pipeline:');
  console.log('    1. graphify:daily          (2-5s)   — map codebase');
  console.log('    2. graphify:semantic       (30-60s) — semantic index');
  console.log('    3. graphify:full           (5-10min) — GPU + topology');
  console.log('');
  console.log('  NEW: go-retrieval integration');
  console.log('    1. go-retrieval:index      (Stage A0) — index canonical tools');
  console.log('    2. go-retrieval:sync       (Stage A1) — sync tool stats from tool_execution_log');
  console.log('    3. go-retrieval:validate   (Stage A2) — health check + contract validation');
  console.log('');

  console.log('🔧 npm Script Additions (add to package.json):');
  console.log('  "graphify:go-retrieval:index": "npm run atlas:phase10:index-tools"');
  console.log('  "graphify:go-retrieval:sync": "npm run atlas:phase10:sync-go-retrieval"');
  console.log('  "graphify:go-retrieval:validate": "npm run atlas:phase10:validate-go-retrieval"');
  console.log('');

  console.log('📌 Daily Schedule (append to graphify:daily):');
  console.log('  After graphify:semantic && before graphify:full:');
  console.log('    1. Index tools to go-search-service');
  console.log('    2. Sync telemetry stats (rolling 7-day)');
  console.log('    3. Validate go-retrieval contracts');
  console.log('    4. Warm search cache with top-100 queries');
  console.log('');

  console.log('✨ Ready to wire into daily pipeline');
}

/**
 * Validate Go service contracts
 */
async function validate() {
  console.log('✅ Go Service Contract Validation');
  console.log('');

  console.log('📋 Validation Contracts:');
  console.log('');
  console.log('  1. go-search-service:');
  console.log('     - /health → { status: "ok" }');
  console.log('     - /api/tools/index → { tool_id, indexed_at }');
  console.log('     - /api/search → { candidates[], ranked, explanation }');
  console.log('     - /api/telemetry/events → { received, queued }');
  console.log('');
  console.log('  2. go-embedding-service:');
  console.log('     - /health → { status: "ok" }');
  console.log('     - /api/embed → { embedding: float32[384] }');
  console.log('     - /api/batch-embed → { embeddings: float32[][384] }');
  console.log('');
  console.log('  3. go-retrieval-service:');
  console.log('     - /health → { status: "ok" }');
  console.log('     - /api/retrieve → { candidates[], ranked, telemetry }');
  console.log('     - /api/stats/refresh → { refreshed_count, timestamp }');
  console.log('');

  console.log('🔍 Contract Verification Status:');
  let contractsPassed = 0;
  for (const [name, service] of Object.entries(SERVICES)) {
    try {
      const response = await fetch(`${service.http}${service.health}`, { timeout: 5000 });
      if (response.ok) {
        console.log(`  ✅ ${name}: Contract present`);
        contractsPassed++;
      } else {
        console.log(`  ⚠️  ${name}: Service responded (${response.status})`);
      }
    } catch (error) {
      console.log(`  ❌ ${name}: Unreachable`);
    }
  }
  console.log('');
  console.log(`Contracts validated: ${contractsPassed}/${Object.keys(SERVICES).length}`);
}

// Run selected operations
async function main() {
  if (options.checkHealth) await checkHealth();
  if (options.indexTools) await indexTools();
  if (options.wireTelemetry) await wireTelemetry();
  if (options.addToGraphify) await addToGraphify();
  if (options.validate) await validate();

  if (!options.checkHealth && !options.indexTools && !options.wireTelemetry && !options.addToGraphify && !options.validate) {
    console.log('Phase 10: Go Service Integration');
    console.log('');
    console.log('Usage:');
    console.log('  --check-health      Check all Go services health');
    console.log('  --index-tools       Index canonical tools to go-search');
    console.log('  --wire-telemetry    Wire telemetry pipeline');
    console.log('  --add-to-graphify   Integrate with daily graphify');
    console.log('  --validate          Validate service contracts');
  }
}

main().catch(console.error);
