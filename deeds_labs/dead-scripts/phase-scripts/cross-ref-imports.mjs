#!/usr/bin/env node
/**
 * Cross-reference high-value unreachable files against import-graph-report.json.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const igr = JSON.parse(readFileSync(resolve(ROOT, 'import-graph-report.json'), 'utf8'));

// Build lookups
const unusedSet = new Set(igr.unused || []);

const candidateMap = new Map();
for (const c of igr.candidates || []) {
  candidateMap.set(c.path, c);
}

const dupMap = new Map();
for (const d of igr.duplicates || []) {
  dupMap.set(d.unreachable, d);
}

// High-value files from domain analysis
const highValue = [
  // DATABASE
  'src/lib/server/db/pgvector-utils.ts',
  'src/lib/server/db/pgvector-service.ts',
  'src/lib/server/db/vector-operations.ts',
  'src/lib/server/db/schema-ingestion.ts',
  'src/lib/server/db/additional-tables.ts',
  'src/lib/server/db/query-utils.ts',
  'src/lib/server/db/user-operations.ts',
  'src/lib/server/db/embedding-cache-service.ts',
  'src/lib/server/db/seed.ts',
  // VECTOR
  'src/lib/server/vector/qdrant-optimized.ts',
  'src/lib/server/ai/vector-search-service.ts',
  'src/lib/server/services/QdrantService.ts',
  'src/lib/server/services/qdrant-indexing-service.ts',
  'src/lib/server/services/qdrant-client.ts',
  'src/lib/server/vector/optimized-qdrant-service.ts',
  'src/lib/server/vector/EnhancedVectorService.ts',
  'src/lib/server/vector/embedding-gemma.ts',
  // GRPC
  'src/lib/server/grpc/vector-cache-client.ts',
  // QUEUE
  'src/lib/workers/rabbitmq-service-worker.ts',
  'src/lib/server/messaging/rabbitmq-service.ts',
  'src/lib/server/queue/xstate.ts',
  'src/lib/server/queue/rabbitmq-manager.ts',
  'src/lib/server/messaging/rabbitmq.ts',
  // CACHING
  'src/lib/server/cache/redis-metrics.ts',
  'src/lib/server/cache/redis-cache.ts',
  'src/lib/server/cache.ts',
  'src/lib/server/cache/index-cache.ts',
  'src/lib/server/cache/ragCache.ts',
  // SERVER-AI
  'src/lib/server/ai/caching-layer.ts',
  'src/lib/server/ai/rag-pipeline.ts',
  'src/lib/server/ai/embeddings.ts',
  'src/lib/server/ai/rag-pipeline-enhanced.ts',
  'src/lib/server/ai/types.ts',
  'src/lib/server/ai/embeddings-simple.ts',
  'src/lib/server/ai/embeddinggemma-service.ts',
  // EMBEDDING
  'src/lib/server/embedding-cache-service.ts',
  'src/lib/server/embedding/pgvector-embedding-repository.ts',
  'src/lib/server/embedding/ingestion-queue.ts',
  // EVIDENCE
  'src/lib/server/evidence-stream.ts',
  'src/lib/server/evidence-detective.ts',
  // API
  'src/lib/server/api/service-registry.ts',
  'src/lib/server/api/v1/evidence-handlers.ts',
  'src/lib/server/api/response-helper.ts',
  // STATE MACHINES
  'src/lib/machines/aiAssistantMachine.ts',
  'src/lib/machines/enhanced-legal-upload-analytics-machine.ts',
  'src/lib/state/evidence-processing-machine.ts',
  'src/lib/machines/retrieval-machine.ts',
  // WORKERS
  'src/lib/server/workers/phase90-helpers.ts',
  'src/lib/workers/error-analysis-worker.ts',
  'src/lib/server/ingest/ingest-worker.ts',
  'src/lib/server/ingest/worker-pool.ts',
  // SERVER-MISC top
  'src/lib/server/services/CaseRankingService.ts',
  'src/lib/server/production-logger.ts',
  'src/lib/server/concurrent-json-serializer.ts',
  'src/lib/server/services/ai-service.ts',
  'src/lib/server/ingest/extractors.ts',
  'src/lib/server/services/rag-retrieval-service.ts',
  'src/lib/server/auth.ts',
  'src/lib/server/config.ts',
];

console.log('IMPORT GRAPH CROSS-REFERENCE');
console.log('===========================');
console.log('');
console.log('Status key:');
console.log('  CANDIDATE  = has exports, unique basename, worth wiring');
console.log('  DUPLICATE  = basename collision with reachable file');
console.log('  UNUSED     = nothing in entire codebase imports it');
console.log('  (not in report) = file imported by at least 1 other unreachable file');
console.log('');

const statusCounts = { CANDIDATE: 0, DUPLICATE: 0, UNUSED: 0, OTHER: 0 };

for (const path of highValue) {
  let status = '';
  let detail = '';

  if (candidateMap.has(path)) {
    const c = candidateMap.get(path);
    status = 'CANDIDATE';
    detail = `${c.exportCount} exports, ${c.importedByUnreachable} unreachable importers`;
    statusCounts.CANDIDATE++;
  } else if (dupMap.has(path)) {
    const d = dupMap.get(path);
    status = 'DUPLICATE';
    const twins = d.reachableDuplicates || [];
    detail = `twins: ${twins.slice(0, 3).join(', ')}${twins.length > 3 ? '...' : ''}`;
    statusCounts.DUPLICATE++;
  } else if (unusedSet.has(path)) {
    status = 'UNUSED';
    detail = 'no file imports this anywhere';
    statusCounts.UNUSED++;
  } else {
    // Not in any of the three lists - it must be imported by at least one unreachable file
    status = 'IMPORTED';
    detail = 'imported by unreachable file(s) but not a candidate/duplicate';
    statusCounts.OTHER++;
  }

  console.log(`  [${status.padEnd(10)}] ${path}`);
  if (detail) console.log(`               ${detail}`);
}

console.log('');
console.log('Summary:', JSON.stringify(statusCounts));
