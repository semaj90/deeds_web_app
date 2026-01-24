/** * Tier 1 Optimization Benchmark Suite * * Measures performance improvements for: * 1. Vector quantization (float32 → int8) * 2. Query caching (Redis) * 3. Worker pool scaling * * Run: npx tsx src/lib/server/optimize/benchmark.ts */ import { VectorQuantizer } from './vector-quantization.js'; import { defaultQueryCache, vectorSearchCache, ragQueryCache } from './query-cache.js'; import { performance } from 'perf_hooks'; interface BenchmarkResult { name: string; before: number; after: number; improvement: number; improvementPercent: string; details?: Record<string, unknown>; } class BenchmarkSuite { private results: BenchmarkResult[] = []; /** * Benchmark 1: Vector Quantization Performance */ async benchmarkVectorQuantization(): Promise<BenchmarkResult> { console.log('\n🔬 Benchmarking Vector Quantization...\n'); const quantizer = new VectorQuantizer({ dimensions: 768, method: 'minmax' });
  







