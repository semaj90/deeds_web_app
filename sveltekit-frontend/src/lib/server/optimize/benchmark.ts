/**
 * Tier 1 Optimization Benchmark Suite
 *
 * Measures performance improvements for:
 * 1. Vector quantization (float32 → int8)
 * 2. Query caching (Redis)
 * 3. Worker pool scaling
 *
 * Run: npx tsx src/lib/server/optimize/benchmark.ts
 */

import { dequantizeINT8, quantizeToINT8 } from '$lib/utils/webgpu-array-utils.js';
import { performance } from 'perf_hooks';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

interface BenchmarkResult {
  name: string;
  before: number;
  after: number;
  improvement: number;
  improvementPercent: string;
  details?: Record<string, unknown>;
}

interface VectorBenchmarkOptions {
  sampleCount: number;
  dimensions: number;
  seed: number;
}

const DEFAULT_VECTOR_BENCHMARK_OPTIONS: VectorBenchmarkOptions = {
  sampleCount: 1024,
  dimensions: 768,
  seed: 42,
};

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateVectors(options: VectorBenchmarkOptions): Float32Array[] {
  const random = createSeededRandom(options.seed);
  const vectors: Float32Array[] = [];

  for (let i = 0; i < options.sampleCount; i++) {
    const vector = new Float32Array(options.dimensions);
    for (let j = 0; j < options.dimensions; j++) {
      vector[j] = random() * 2 - 1;
    }
    vectors.push(vector);
  }

  return vectors;
}

function runDotProductWorkload(vectors: Float32Array[], query: Float32Array): number {
  let checksum = 0;
  for (const vector of vectors) {
    let dot = 0;
    for (let i = 0; i < vector.length; i++) {
      dot += vector[i] * query[i];
    }
    checksum += dot;
  }
  return checksum;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

class BenchmarkSuite {
  private results: BenchmarkResult[] = [];

  /**
   * Benchmark 1: Vector Quantization Performance
   */
  async benchmarkVectorQuantization(): Promise<BenchmarkResult> {
    console.log('\nBenchmarking Vector Quantization...\n');

    const options = DEFAULT_VECTOR_BENCHMARK_OPTIONS;
    const vectors = generateVectors(options);
    const query = generateVectors({ ...options, sampleCount: 1, seed: options.seed + 1 })[0];

    const floatBytes = vectors.reduce((acc, vector) => acc + vector.byteLength, 0);

    // Baseline: pure Float32 workload
    const baselineRuns: number[] = [];
    let baselineChecksum = 0;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      baselineChecksum = runDotProductWorkload(vectors, query);
      baselineRuns.push(performance.now() - t0);
    }

    // Quantize once, then dequantized compute workload (typical retrieval path)
    const quantized = vectors.map((vector) => quantizeToINT8(vector));
    const quantizedBytes = quantized.reduce((acc, q) => acc + q.compressedSize, 0);

    const dequantizedVectors = quantized.map((q) =>
      dequantizeINT8(q.data as Int8Array, q.quantizationConfig!)
    );

    const quantizedRuns: number[] = [];
    let quantizedChecksum = 0;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      quantizedChecksum = runDotProductWorkload(dequantizedVectors, query);
      quantizedRuns.push(performance.now() - t0);
    }

    // Error metrics against original vectors
    let totalAbsError = 0;
    let maxAbsError = 0;
    let valueCount = 0;
    for (let i = 0; i < vectors.length; i++) {
      const original = vectors[i];
      const restored = dequantizedVectors[i];
      for (let j = 0; j < original.length; j++) {
        const error = Math.abs(original[j] - restored[j]);
        totalAbsError += error;
        maxAbsError = Math.max(maxAbsError, error);
        valueCount++;
      }
    }

    const memorySaved = floatBytes - quantizedBytes;
    const memorySavedPct = (memorySaved / floatBytes) * 100;

    return {
      name: 'Vector Quantization',
      before: floatBytes,
      after: quantizedBytes,
      improvement: memorySaved,
      improvementPercent: `${memorySavedPct.toFixed(2)}%`,
      details: {
        sampleCount: options.sampleCount,
        dimensions: options.dimensions,
        baselineLatencyMsMedian: Number(median(baselineRuns).toFixed(3)),
        quantizedLatencyMsMedian: Number(median(quantizedRuns).toFixed(3)),
        latencyDeltaMsMedian: Number((median(quantizedRuns) - median(baselineRuns)).toFixed(3)),
        meanAbsError: Number((totalAbsError / valueCount).toFixed(8)),
        maxAbsError: Number(maxAbsError.toFixed(8)),
        baselineChecksum: Number(baselineChecksum.toFixed(5)),
        quantizedChecksum: Number(quantizedChecksum.toFixed(5)),
      },
    };
  }

  async runAll(): Promise<void> {
    this.results = [];
    this.results.push(await this.benchmarkVectorQuantization());
    this.printResults();
  }

  getResults(): BenchmarkResult[] {
    return this.results;
  }

  private printResults(): void {
    console.log('\nBenchmark Results\n');
    for (const result of this.results) {
      console.log(`- ${result.name}`);
      console.log(`  before: ${result.before}`);
      console.log(`  after: ${result.after}`);
      console.log(`  improvement: ${result.improvement} (${result.improvementPercent})`);
      if (result.details) {
        console.log(`  details: ${JSON.stringify(result.details)}`);
      }
    }
  }
}

export async function runBenchmarks(): Promise<BenchmarkResult[]> {
  const suite = new BenchmarkSuite();
  await suite.runAll();
  return suite.getResults();
}

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  runBenchmarks()
    .then(() => {
      console.log('\nBenchmarks complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nBenchmark failed', error);
      process.exit(1);
    });
}
