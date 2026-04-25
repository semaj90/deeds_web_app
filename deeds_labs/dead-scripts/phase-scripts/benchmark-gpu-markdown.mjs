#!/usr/bin/env node

/**
 * GPU Markdown Pipeline Benchmark Script
 *
 * Performance benchmarking for GPU-accelerated markdown processing
 * Measures throughput, latency, memory usage, and GPU utilization.
 */

import { GPUMarkdownProcessor } from '../src/lib/gpu/markdown-processor.ts';
import { GPUMarkdownPipeline, LegalDocumentProcessor } from '../src/lib/gpu/markdown-pipeline.ts';
import { performanceMonitor, memoryManager } from '../src/lib/gpu/runtime-optimizations.ts';

// Benchmark configuration
const BENCHMARK_CONFIG = {
  iterations: 10,
  warmupIterations: 3,
  documentSizes: ['small', 'medium', 'large'] as const,
  batchSizes: [1, 5, 10],
  concurrencyLevels: [1, 2, 4]
};

// Test documents
const DOCUMENTS = {
  small: `# Case Brief

## Facts
Plaintiff sued defendant.

## Holding
Judgment for plaintiff.`,

  medium: `# Legal Analysis

## FACTS
The plaintiff filed a complaint alleging breach of contract. The defendant argues that the contract was invalid due to lack of consideration. The court must determine whether there was valid consideration.

## REASONING
In contract law, consideration is defined as something of value exchanged between parties. The plaintiff provided services, which constitutes consideration.

## HOLDING
The court finds that there was sufficient consideration. The defendant's argument is rejected.

## CONCLUSION
Judgment for the plaintiff. The contract is enforceable.`,

  large: `# Comprehensive Legal Document

## FACTS
${'The plaintiff filed a complaint alleging breach of contract. '.repeat(20)}

## REASONING
${'In contract law, consideration is defined as something of value exchanged between parties. '.repeat(20)}

## HOLDING
${'The court finds that there was sufficient consideration. '.repeat(20)}

## CONCLUSION
${'Judgment for the plaintiff. The contract is enforceable. '.repeat(20)}`
};

async function benchmarkDocumentProcessing() {
  console.log('📈 Benchmarking Document Processing...\n');

  const processor = new GPUMarkdownProcessor();
  await processor.initialize();

  const results = [];

  for (const size of BENCHMARK_CONFIG.documentSizes) {
    const document = DOCUMENTS[size];
    const times = [];

    console.log(`📝 Benchmarking ${size} document (${BENCHMARK_CONFIG.iterations} iterations)...`);

    // Warmup
    for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
      await processor.processMarkdown(document);
    }

    // Actual benchmark
    performanceMonitor.startOperation(`doc-processing-${size}`);
    const startMemory = memoryManager.getCurrentUsage();

    for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
      const iterationStart = performance.now();
      await processor.processMarkdown(document);
      const iterationEnd = performance.now();
      times.push(iterationEnd - iterationStart);
    }

    const totalTime = performanceMonitor.endOperation(`doc-processing-${size}`);
    const endMemory = memoryManager.getCurrentUsage();

    const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const throughput = BENCHMARK_CONFIG.iterations / (totalTime / 1000);

    results.push({
      operation: 'document-processing',
      size,
      iterations: BENCHMARK_CONFIG.iterations,
      totalTime,
      averageTime,
      minTime,
      maxTime,
      throughput,
      memoryUsage: endMemory - startMemory
    });

    console.log(`  ✅ ${size}: ${throughput.toFixed(2)} ops/s, ${averageTime.toFixed(2)} ms/op\n`);
  }

  processor.destroy();
  return results;
}

async function benchmarkBatchProcessing() {
  console.log('📦 Benchmarking Batch Processing...\n');

  const pipeline = new GPUMarkdownPipeline({
    enableGPU: true,
    pythonServiceUrl: 'http://localhost:8098'
  });
  await pipeline.initialize();

  const results = [];

  for (const batchSize of BENCHMARK_CONFIG.batchSizes) {
    const documents = Array(batchSize).fill(DOCUMENTS.medium);
    const times = [];

    console.log(`📦 Benchmarking batch size ${batchSize} (${Math.max(1, Math.floor(BENCHMARK_CONFIG.iterations / batchSize))} iterations)...`);

    // Warmup
    await pipeline.processBatch(documents.slice(0, Math.min(3, batchSize)));

    // Actual benchmark
    const iterations = Math.max(1, Math.floor(BENCHMARK_CONFIG.iterations / batchSize));
    performanceMonitor.startOperation(`batch-processing-${batchSize}`);

    for (let i = 0; i < iterations; i++) {
      const iterationStart = performance.now();
      await pipeline.processBatch(documents);
      const iterationEnd = performance.now();
      times.push(iterationEnd - iterationStart);
    }

    const totalTime = performanceMonitor.endOperation(`batch-processing-${batchSize}`);

    const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
    const throughput = batchSize * iterations / (totalTime / 1000);

    results.push({
      operation: 'batch-processing',
      size: `batch-${batchSize}`,
      iterations,
      totalTime,
      averageTime,
      throughput
    });

    console.log(`  ✅ Batch ${batchSize}: ${throughput.toFixed(2)} docs/s, ${averageTime.toFixed(2)} ms/batch\n`);
  }

  pipeline.destroy();
  return results;
}

async function benchmarkLegalSectionExtraction() {
  console.log('⚖️ Benchmarking Legal Section Extraction...\n');

  const legalProcessor = new LegalDocumentProcessor();
  await legalProcessor.initialize();

  const results = [];

  for (const size of BENCHMARK_CONFIG.documentSizes) {
    const document = DOCUMENTS[size];
    const times = [];

    console.log(`⚖️ Benchmarking ${size} legal extraction (${BENCHMARK_CONFIG.iterations} iterations)...`);

    // Warmup
    for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
      await legalProcessor.extractLegalSections(document);
    }

    // Actual benchmark
    performanceMonitor.startOperation(`legal-extraction-${size}`);

    for (let i = 0; i < BENCHMARK_CONFIG.iterations; i++) {
      const iterationStart = performance.now();
      await legalProcessor.extractLegalSections(document);
      const iterationEnd = performance.now();
      times.push(iterationEnd - iterationStart);
    }

    const totalTime = performanceMonitor.endOperation(`legal-extraction-${size}`);

    const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
    const throughput = BENCHMARK_CONFIG.iterations / (totalTime / 1000);

    results.push({
      operation: 'legal-section-extraction',
      size,
      iterations: BENCHMARK_CONFIG.iterations,
      totalTime,
      averageTime,
      throughput
    });

    console.log(`  ✅ ${size}: ${throughput.toFixed(2)} ops/s, ${averageTime.toFixed(2)} ms/op\n`);
  }

  legalProcessor.destroy();
  return results;
}

function printResults(results) {
  console.log('\n📊 GPU Markdown Pipeline Benchmark Results');
  console.log('='.repeat(80));

  // Group results by operation
  const operations = [...new Set(results.map(r => r.operation))];

  operations.forEach(operation => {
    const opResults = results.filter(r => r.operation === operation);

    console.log(`\n🔹 ${operation.toUpperCase().replace(/-/g, ' ')}`);
    console.log('-'.repeat(50));

    opResults.forEach(result => {
      const throughput = `${result.throughput.toFixed(2)} ops/s`;
      const avgTime = `${result.averageTime.toFixed(2)} ms/op`;
      const memory = result.memoryUsage ? `${result.memoryUsage.toFixed(0)} KB` : 'N/A';

      console.log(`${result.size.padEnd(12)} | ${throughput.padStart(12)} | ${avgTime.padStart(12)} | ${memory.padStart(8)}`);
    });
  });

  // Overall statistics
  console.log('\n📈 Overall Statistics');
  console.log('-'.repeat(50));

  const totalTime = results.reduce((sum, r) => sum + r.totalTime, 0);
  const totalOperations = results.reduce((sum, r) => sum + r.iterations, 0);
  const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;

  console.log(`Total Time:     ${totalTime.toFixed(2)} ms`);
  console.log(`Total Ops:      ${totalOperations}`);
  console.log(`Avg Throughput: ${avgThroughput.toFixed(2)} ops/s`);

  // Performance recommendations
  console.log('\n💡 Performance Recommendations');
  console.log('-'.repeat(50));

  const docResults = results.filter(r => r.operation === 'document-processing');
  if (docResults.length > 0) {
    const gpuAvgTime = docResults.reduce((sum, r) => sum + r.averageTime, 0) / docResults.length;
    const performance = gpuAvgTime < 50 ? 'EXCELLENT' : gpuAvgTime < 100 ? 'GOOD' : 'NEEDS OPTIMIZATION';
    console.log(`GPU Processing: ${performance} (${gpuAvgTime.toFixed(2)}ms avg)`);
  }

  const batchResults = results.filter(r => r.operation === 'batch-processing');
  if (batchResults.length > 0) {
    const batchThroughput = batchResults.reduce((sum, r) => sum + r.throughput, 0) / batchResults.length;
    const batchPerf = batchThroughput > 10 ? 'EXCELLENT' : batchThroughput > 5 ? 'GOOD' : 'CONSIDER OPTIMIZATION';
    console.log(`Batch Processing: ${batchPerf} (${batchThroughput.toFixed(2)} docs/s)`);
  }

  console.log('\n✅ Benchmark complete!');
}

async function runBenchmarks() {
  console.log('🚀 GPU Markdown Pipeline Benchmarks\n');
  console.log('='.repeat(60) + '\n');

  try {
    const results = [];

    results.push(...await benchmarkDocumentProcessing());
    results.push(...await benchmarkBatchProcessing());
    results.push(...await benchmarkLegalSectionExtraction());

    printResults(results);

    // Export results
    const resultsJson = JSON.stringify({
      timestamp: new Date().toISOString(),
      config: BENCHMARK_CONFIG,
      results
    }, null, 2);

    console.log('\n💾 Results exported to benchmark-results.json');
    await Bun.write('benchmark-results.json', resultsJson);

  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// CLI runner
const command = process.argv[2] || 'all';

switch (command) {
  case 'document':
    await benchmarkDocumentProcessing().then(printResults);
    break;
  case 'batch':
    await benchmarkBatchProcessing().then(printResults);
    break;
  case 'legal':
    await benchmarkLegalSectionExtraction().then(printResults);
    break;
  case 'all':
  default:
    await runBenchmarks();
    break;
}