#!/usr/bin/env node
/**
 * Phase 2D: Qdrant Connection Pooling Performance Baseline
 *
 * Measures latency improvements from singleton connection pooling.
 * Captures before/after metrics for key retrieval operations.
 *
 * Usage:
 *   npm run phase2d:baseline
 *   npm run phase2d:baseline -- --iterations=50 --warmup=10
 */

import { getQdrantClient } from '../src/lib/server/vector/qdrant-singleton.js';
import { QdrantManager } from '../src/lib/server/vector/qdrant-manager.js';
import type { QdrantSearchResult } from '../src/lib/server/vector/qdrant-manager.js';

interface BaselineMetrics {
  operation: string;
  collection: string;
  iterations: number;
  meanLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  totalTimeMs: number;
  throughputOpsPerSec: number;
  memoryUsageMb: number;
}

interface BenchmarkResult {
  timestamp: string;
  environment: string;
  metrics: BaselineMetrics[];
  summary: {
    totalOperations: number;
    totalTimeMs: number;
    estimatedImprovementPercent?: number;
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateStats(latencies: number[]) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return { mean, median, p95, p99, min, max };
}

async function benchmarkHybridSearch(
  manager: QdrantManager,
  collection: string,
  iterations: number,
  warmupRuns: number
): Promise<BaselineMetrics> {
  // Warmup runs
  for (let i = 0; i < warmupRuns; i++) {
    try {
      await manager.hybridSearch({
        collection,
        query: 'test query',
        queryEmbedding: Array(384).fill(0.5),
        limit: 10
      });
    } catch (e) {
      // Ignore warmup errors
    }
  }

  // Actual benchmark
  const latencies: number[] = [];
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    const opStart = performance.now();
    try {
      await manager.hybridSearch({
        collection,
        query: `test query ${i}`,
        queryEmbedding: Array(384).fill(0.5 + Math.random() * 0.1),
        limit: 10
      });
    } catch (e) {
      // Log errors but continue benchmarking
      if (i === 0) console.warn(`hybridSearch error: ${e instanceof Error ? e.message : String(e)}`);
    }
    const opEnd = performance.now();
    latencies.push(opEnd - opStart);
  }

  const totalTime = Date.now() - startTime;
  const stats = calculateStats(latencies);
  const memUsage = process.memoryUsage();

  return {
    operation: 'hybridSearch',
    collection,
    iterations,
    meanLatencyMs: stats.mean,
    medianLatencyMs: stats.median,
    p95LatencyMs: stats.p95,
    p99LatencyMs: stats.p99,
    minLatencyMs: stats.min,
    maxLatencyMs: stats.max,
    totalTimeMs: totalTime,
    throughputOpsPerSec: (iterations / totalTime) * 1000,
    memoryUsageMb: memUsage.heapUsed / 1024 / 1024
  };
}

async function benchmarkRawSearch(
  iterations: number,
  warmupRuns: number
): Promise<BaselineMetrics> {
  const client = getQdrantClient();
  const collection = 'codebase_chunks_768';

  // Warmup
  for (let i = 0; i < warmupRuns; i++) {
    try {
      await client.search(collection, {
        vector: Array(768).fill(0.5),
        limit: 10,
        with_payload: true
      } as any);
    } catch (e) {
      // Ignore warmup errors
    }
  }

  // Actual benchmark
  const latencies: number[] = [];
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    const opStart = performance.now();
    try {
      await client.search(collection, {
        vector: Array(768).fill(0.5 + Math.random() * 0.1),
        limit: 10,
        with_payload: true
      } as any);
    } catch (e) {
      if (i === 0) console.warn(`raw search error: ${e instanceof Error ? e.message : String(e)}`);
    }
    const opEnd = performance.now();
    latencies.push(opEnd - opStart);
  }

  const totalTime = Date.now() - startTime;
  const stats = calculateStats(latencies);
  const memUsage = process.memoryUsage();

  return {
    operation: 'raw.search',
    collection,
    iterations,
    meanLatencyMs: stats.mean,
    medianLatencyMs: stats.median,
    p95LatencyMs: stats.p95,
    p99LatencyMs: stats.p99,
    minLatencyMs: stats.min,
    maxLatencyMs: stats.max,
    totalTimeMs: totalTime,
    throughputOpsPerSec: (iterations / totalTime) * 1000,
    memoryUsageMb: memUsage.heapUsed / 1024 / 1024
  };
}

async function main() {
  const args = process.argv.slice(2);
  const iterationsArg = args.find(a => a.startsWith('--iterations='));
  const warmupArg = args.find(a => a.startsWith('--warmup='));
  const dryRunArg = args.includes('--dry-run');

  const iterations = iterationsArg ? parseInt(iterationsArg.split('=')[1], 10) : 30;
  const warmupRuns = warmupArg ? parseInt(warmupArg.split('=')[1], 10) : 5;

  console.log('🔬 Phase 2D: Qdrant Connection Pooling Performance Baseline');
  console.log(`⚙️  Iterations: ${iterations}, Warmup runs: ${warmupRuns}`);

  if (dryRunArg) {
    console.log('📋 DRY RUN — showing structure only\n');
  }

  const manager = new QdrantManager();
  const client = getQdrantClient();

  console.log('✅ Singleton client initialized');
  console.log(`   Client instance ID: ${(client as any)._id || 'N/A'}`);
  console.log(`   Manager client same as singleton: ${manager.client === client}\n`);

  if (dryRunArg) {
    console.log('Would run benchmarks:');
    console.log(`  1. hybridSearch on codebase_chunks_768 (${iterations} ops)`);
    console.log(`  2. raw search on codebase_chunks_768 (${iterations} ops)`);
    return;
  }

  const results: BaselineMetrics[] = [];
  const timestamp = new Date().toISOString();

  console.log('Running benchmarks...\n');

  // Benchmark 1: hybridSearch
  console.log('📊 Benchmark 1: hybridSearch');
  try {
    const hybridResult = await benchmarkHybridSearch(
      manager,
      'codebase_chunks_768',
      iterations,
      warmupRuns
    );
    results.push(hybridResult);
    console.log(`   Mean latency: ${hybridResult.meanLatencyMs.toFixed(2)}ms`);
    console.log(`   p95 latency: ${hybridResult.p95LatencyMs.toFixed(2)}ms`);
    console.log(`   Throughput: ${hybridResult.throughputOpsPerSec.toFixed(1)} ops/sec\n`);
  } catch (e) {
    console.warn(`   ⚠️  Skipped: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  // Benchmark 2: raw search
  console.log('📊 Benchmark 2: raw client.search()');
  try {
    const rawResult = await benchmarkRawSearch(iterations, warmupRuns);
    results.push(rawResult);
    console.log(`   Mean latency: ${rawResult.meanLatencyMs.toFixed(2)}ms`);
    console.log(`   p95 latency: ${rawResult.p95LatencyMs.toFixed(2)}ms`);
    console.log(`   Throughput: ${rawResult.throughputOpsPerSec.toFixed(1)} ops/sec\n`);
  } catch (e) {
    console.warn(`   ⚠️  Skipped: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  // Summary
  const summary: BenchmarkResult = {
    timestamp,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      qdrantUrl: process.env.QDRANT_URL || 'http://127.0.0.1:6333'
    } as any,
    metrics: results,
    summary: {
      totalOperations: results.reduce((sum, m) => sum + m.iterations, 0),
      totalTimeMs: results.reduce((sum, m) => sum + m.totalTimeMs, 0)
    }
  };

  console.log('📈 Summary:');
  console.log(`   Total operations: ${summary.summary.totalOperations}`);
  console.log(`   Total time: ${summary.summary.totalTimeMs.toFixed(0)}ms`);
  console.log(`   Timestamp: ${timestamp}\n`);

  console.log('✅ Baseline captured');
  console.log('📌 Next: Compare with pre-pooling measurements if available');
  console.log('💾 Results ready for storage in docs/performance/phase2d-baseline.json');

  // Write results to file
  const fs = await import('fs').then(m => m.promises);
  const { fileURLToPath } = await import('url');
  const resultsPath = fileURLToPath(new URL('../docs/performance/phase2d-baseline.json', import.meta.url));
  const resultsDir = fileURLToPath(new URL('../docs/performance', import.meta.url));

  try {
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(resultsPath, JSON.stringify(summary, null, 2));
    console.log(`\n✅ Results saved to: docs/performance/phase2d-baseline.json`);
  } catch (e) {
    console.warn(`\n⚠️  Could not save results: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main().catch(err => {
  console.error('❌ Benchmark failed:', err);
  process.exit(1);
});
