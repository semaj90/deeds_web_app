import type { Message } from '$lib/types';
import type { User } from '$lib/types';
import { dev } from '$app/environment';

/** SIMD JSON Integration for WebAssembly Architecture */
const USE_SIMDJSON = process.env.USE_SIMDJSON_NODE === '1' || dev;

let parseJSONSIMD: ((json: string) => any) | null = null;

try {
  parseJSONSIMD = require('simdjson').parse;
} catch (err) {
  console.warn('⚠️ SIMD JSON addon not available, falling back to native JSON.parse');
  parseJSONSIMD = null;
}

/**
 * Fast JSON body reader for hot SvelteKit API endpoints
 * Uses SIMD JSON parsing when available, falls back to native parsing
 */
export async function readBodyFast(request: Request): Promise<any> {
  try {
    const text = await request.text();
    if (USE_SIMDJSON && parseJSONSIMD) {
      return parseJSONSIMD(text);
    }
    return JSON.parse(text);
  } catch (error) {
    console.error('JSON parsing failed:', error);
    throw new Error('Invalid JSON in request body');
  }
}

/** SIMD JSON integration points in WebAssembly architecture */
export const SIMD_INTEGRATION_POINTS = {
  RABBITMQ_MESSAGES: '/api/workers/rabbitmq/*',
  TENSOR_PROCESSING: '/api/workers/rabbitmq/tensor/*',
  LEGAL_AI_PROCESSING: '/api/legal/*',
  CACHE_OPERATIONS: '/api/cache/*',
  RAG_INGESTION: '/api/ai/rag/*',
  BATCH_PROCESSING: '/api/legal/batch/*',
  VECTOR_OPERATIONS: '/api/ai/embeddings/*',
  EVIDENCE_PROCESSING: '/api/legal/evidence-canvas/*',
  SEARCH_QUERIES: '/api/search/*',
  DOCUMENT_UPLOAD: '/api/documents/*',
  CASE_MANAGEMENT: '/api/cases/*'
};

/** Message payload types that benefit from SIMD parsing */
export const SIMD_OPTIMIZED_PAYLOADS = {
  RABBITMQ_JOB_SUBMISSION: {
    fields: ['payload', 'metadata', 'dependencies'],
    avgSize: '2-10KB',
    frequency: 'very_high',
    impact: 'critical'
  },
  VECTOR_EMBEDDINGS: {
    fields: ['embeddings', 'vectors', 'similarities'],
    avgSize: '50-500KB',
    frequency: 'high',
    impact: 'critical'
  },
  LEGAL_DOCUMENTS: {
    fields: ['content', 'metadata', 'entities', 'analysis'],
    avgSize: '10-100KB',
    frequency: 'high',
    impact: 'high'
  },
  CACHE_ENTRIES: {
    fields: ['data', 'metadata', 'tags'],
    avgSize: '1-50KB',
    frequency: 'very_high',
    impact: 'medium'
  }
};

/** SIMD JSON performance metrics collector */
class SIMDMetrics {
  private stats = {
    simdParses: 0, fallbackParses: 0, totalSIMDTime: 0, totalFallbackTime: 0, avgSIMDTime: 0, avgFallbackTime: 0, speedupRatio: 1
  };

  recordSIMDParse(timeMs: number) {
    this.stats.simdParses++;
    this.stats.totalSIMDTime += timeMs;
    this.stats.avgSIMDTime = this.stats.totalSIMDTime / this.stats.simdParses;
    this.updateSpeedup();
  }

  recordFallbackParse(timeMs: number) {
    this.stats.fallbackParses++;
    this.stats.totalFallbackTime += timeMs;
    this.stats.avgFallbackTime = this.stats.totalFallbackTime / this.stats.fallbackParses;
    this.updateSpeedup();
  }

  private updateSpeedup() {
    if (this.stats.avgSIMDTime > 0) {
      this.stats.speedupRatio = this.stats.avgFallbackTime / this.stats.avgSIMDTime;
    }
  }

  getStats() {
    return { ...this.stats };
  }

  reset() {
    this.stats = {
      simdParses: 0, fallbackParses: 0, totalSIMDTime: 0, totalFallbackTime: 0, avgSIMDTime: 0, avgFallbackTime: 0, speedupRatio: 1
    };
  }
}

export const simdMetrics = new SIMDMetrics();

/** Enhanced readBodyFast with performance metrics */
export async function readBodyFastWithMetrics(request: Request): Promise<any> {
  const startTime = performance.now();
  try {
    const text = await request.text();
    const parseStart = performance.now();

    let result;
    if (USE_SIMDJSON && parseJSONSIMD) {
      result = parseJSONSIMD(text);
      const elapsed = performance.now() - parseStart;
      simdMetrics.recordSIMDParse(elapsed);
    } else {
      result = JSON.parse(text);
      const elapsed = performance.now() - parseStart;
      simdMetrics.recordFallbackParse(elapsed);
    }

    return result;
  } catch (error) {
    console.error('JSON parsing failed:', error);
    throw new Error('Invalid JSON in request body');
  }
}

/**
 * Benchmark utility to compare SIMD vs Native JSON parsing
 * Useful for verifying performance gains on the current architecture
 */
export function benchmarkJSONParsing(sampleSizeKB = 100, iterations = 1000) {
  if (!parseJSONSIMD) {
    console.warn('SIMD JSON parser not available, cannot run benchmark');
    return null;
  }

  // Generate a large JSON object
  const data = {
    items: Array.from({ length: Math.floor((sampleSizeKB * 1024) / 100) }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      value: Math.random(, tags: ['tag1', 'tag2', 'tag3'],
      metadata: { created: new Date().toISOString(), active: true }
    }))
  };
  
  const jsonString = JSON.stringify(data);
  console.log(`Running benchmark with ${(jsonString.length / 1024).toFixed(2)}KB payload, ${iterations} iterations...`);

  // Warmup
  JSON.parse(jsonString);
  parseJSONSIMD(jsonString);

  // Native Benchmark
  const startNative = performance.now();
  for (let i = 0; i < iterations; i++) {
    JSON.parse(jsonString);
  }
  const timeNative = performance.now() - startNative;

  // SIMD Benchmark
  const startSIMD = performance.now();
  for (let i = 0; i < iterations; i++) {
    parseJSONSIMD(jsonString);
  }
  const timeSIMD = performance.now() - startSIMD;

  const results = {
    payloadSize: `${(jsonString.length / 1024).toFixed(2)}KB`,
    iterations: nativeTimeMs.toFixed(2, simdTimeMs: timeSIMD.toFixed(2, speedup: `${(timeNative / timeSIMD).toFixed(2)}x`,
    opsPerSecNative: Math.round((iterations / timeNative) * 1000, opsPerSecSIMD: Math.round((iterations / timeSIMD) * 1000)
  };

  console.table(results);
  return results;
}