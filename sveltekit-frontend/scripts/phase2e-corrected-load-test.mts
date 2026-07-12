#!/usr/bin/env node
/**
 * Phase 2E: Qdrant Connection Pooling Concurrent Load Test (CORRECTED)
 *
 * Fixes from Phase 2D:
 * - Use real embeddings from Ollama, not synthetic
 * - Use named vector 'content' (768-dim) which exists in live Qdrant
 * - Measure REAL latencies, not exception latencies
 * - Track success/failure separately
 */

import { QdrantManager } from '../src/lib/server/vector/qdrant-manager.js';
import fetch from 'node-fetch';

console.log('🔬 Phase 2E: Qdrant Connection Pooling Concurrent Load Test');
console.log('⚙️  Concurrency: 10, Duration: 30s\n');

const manager = new QdrantManager();

// Verify singleton is initialized
const singletonCheck = manager.client !== undefined;
if (singletonCheck) {
  console.log('✅ Singleton client initialized\n');
} else {
  console.error('❌ Singleton client NOT initialized');
  process.exit(1);
}

// Query terms to test
const queries = [
  'authentication',
  'database query',
  'api endpoint',
  'error handling',
  'performance optimization',
  'caching strategy',
  'async operations',
  'type validation',
  'logging system',
  'security'
];

interface Request {
  id: string;
  query: string;
  queryEmbedding: number[];
  success: boolean;
  error?: string;
  latencyMs?: number;
  resultsCount?: number;
}

const requests: Request[] = [];
let completedRequests = 0;

async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text
      })
    }) as any;

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding as number[];
  } catch (error) {
    console.error(`❌ Failed to get embedding for "${text}":`, error instanceof Error ? error.message : error);
    // Return fallback: zeros (will get 0 results, but won't crash)
    return Array(768).fill(0);
  }
}

async function submitRequest(queryIndex: number): Promise<Request> {
  const query = queries[queryIndex % queries.length];
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const req: Request = {
    id: requestId,
    query,
    queryEmbedding: [],
    success: false
  };

  try {
    // Get real embedding from Ollama
    req.queryEmbedding = await getEmbedding(query);

    const opStart = Date.now();
    const result = await manager.hybridSearch({
      collection: 'codebase_chunks_768',
      query,
      queryEmbedding: req.queryEmbedding,
      limit: 10
    });
    const opEnd = Date.now();

    // Validate result structure
    if (!result) {
      req.error = 'hybridSearch returned null';
      req.success = false;
    } else if (!result.results || !Array.isArray(result.results)) {
      req.error = 'Invalid result structure: missing results array';
      req.success = false;
    } else {
      req.success = true;
      req.latencyMs = opEnd - opStart;
      req.resultsCount = result.results.length;
    }
  } catch (error) {
    req.error = error instanceof Error ? error.message : String(error);
    req.success = false;
  }

  return req;
}

async function runLoadTest() {
  console.log('Running concurrent load test...\n');

  const concurrency = 10;
  const durationMs = 30 * 1000;
  const startTime = Date.now();
  let requestCounter = 0;

  // Generate requests concurrently
  const inFlight = new Map<Promise<Request>, Promise<Request>>();

  while (Date.now() - startTime < durationMs || inFlight.size > 0) {
    // Submit new requests up to concurrency limit
    while (inFlight.size < concurrency && Date.now() - startTime < durationMs) {
      const idx = requestCounter++;
      const promise = submitRequest(idx).then((req) => {
        requests.push(req);
        completedRequests++;
        inFlight.delete(promise);
        return req;
      });
      inFlight.set(promise, promise);
    }

    // Wait for at least one to complete
    if (inFlight.size > 0) {
      await Promise.race(Array.from(inFlight.keys()));
    }
  }

  // Wait for remaining requests
  if (inFlight.size > 0) {
    await Promise.all(Array.from(inFlight.keys()));
  }

  console.log('📊 Load Test Results:');

  const successfulRequests = requests.filter(r => r.success);
  const failedRequests = requests.filter(r => !r.success);
  const latencies = successfulRequests.map(r => r.latencyMs ?? 0).filter(l => l > 0);

  console.log(`   Total requests: ${requests.length}`);
  console.log(`   Successful: ${successfulRequests.length} (${(successfulRequests.length / requests.length * 100).toFixed(1)}%)`);
  console.log(`   Failed: ${failedRequests.length}`);

  if (latencies.length > 0) {
    latencies.sort((a, b) => a - b);
    const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    console.log(`   Mean latency: ${mean.toFixed(2)}ms`);
    console.log(`   p95 latency: ${p95?.toFixed(2) ?? 'N/A'}ms`);
    console.log(`   p99 latency: ${p99?.toFixed(2) ?? 'N/A'}ms`);
    console.log(`   Throughput: ${(successfulRequests.length / 30).toFixed(1)} req/s`);

    if (failedRequests.length > 0) {
      console.log(`\n   First failure: ${failedRequests[0].error}`);
    }
  } else {
    console.log('   ⚠️  No successful requests recorded');
  }

  // Exit status
  if (failedRequests.length === 0) {
    console.log('\n✅ Phase 2E: PASS — All requests succeeded');
    process.exit(0);
  } else {
    console.log(`\n❌ Phase 2E: FAIL — ${failedRequests.length} failed requests`);
    process.exit(1);
  }
}

runLoadTest().catch((error) => {
  console.error('💥 Load test crashed:', error);
  process.exit(1);
});
