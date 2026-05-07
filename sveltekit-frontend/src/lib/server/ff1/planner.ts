/**
 * FF1 Compute Planner — server-only.
 *
 * Reads FF1 registry hints and routes function calls to the fastest available
 * backend at runtime:
 *
 *   Priority order (highest to lowest):
 *     1. Redis cache hit         — ~0.2ms
 *     2. LibTorch N-API GPU      — ~1-5ms (CUDA cuBLAS, RTX 3060 Ti)
 *     3. simdjson N-API          — ~0.5ms (simdjson SIMD, JSON ops only)
 *     4. WASM SIMD               — ~5-20ms (128-bit lanes, server WASM)
 *     5. JS fallback             — ~20-200ms (V8 JIT, always available)
 *
 * Usage:
 *   import { ff1 } from '$lib/server/ff1/planner.js';
 *   const score = await ff1('embedding.cosine', a, b);
 */

import { createHash } from 'crypto';
import type { FF1FunctionName } from './registry.js';
import { computeRegistry } from './registry.js';

// ── Redis cache (optional — skipped if Redis unavailable) ──────────────────

let redisClient: { get(k: string): Promise<string | null>; set(k: string, v: string, ex?: number): Promise<unknown> } | null = null;

async function getRedis() {
  if (redisClient !== null) return redisClient;
  try {
    const { createClient } = await import('redis');
    const c = createClient({ url: ENV.REDIS_URL });
    await c.connect();
    redisClient = {
      get: (k) => c.get(k) as Promise<string | null>,
      set: (k, v, ex) => ex ? c.set(k, v, { EX: ex }) : c.set(k, v),
    };
  } catch {
    redisClient = { get: async () => null, set: async () => null };
  }
  return redisClient;
}

// ── GPU backend (LibTorch N-API) ──────────────────────────────────────────

let gpuBridge: Record<string, (...args: unknown[]) => unknown> | null = null;

async function getGpuBridge() {
  if (gpuBridge !== null) return gpuBridge;
  try {
    const mod = await import('../gpu/libtorch-bridge.js');
    gpuBridge = mod as unknown as Record<string, (...args: unknown[]) => unknown>;
  } catch {
    gpuBridge = {};
  }
  return gpuBridge;
}

// ── Cache key ────────────────────────────────────────────────────────────

function cacheKey(name: string, args: unknown[]): string {
  const hash = createHash('sha1')
    .update(name + ':' + JSON.stringify(args))
    .digest('hex')
    .slice(0, 16);
  return `ff1:${name}:${hash}`;
}

// ── Backend implementations ───────────────────────────────────────────────

const backends: Partial<Record<FF1FunctionName, (...args: unknown[]) => Promise<unknown>>> = {

  'embedding.cosine': async (a: unknown, b: unknown) => {
    const av = a as Float32Array | number[];
    const bv = b as Float32Array | number[];
    const gpu = await getGpuBridge();
    if (typeof gpu.batchCosineSimilarity === 'function') {
      const result = await (gpu.batchCosineSimilarity as Function)(
        Array.from(av), [Array.from(bv)]
      );
      return (result as { scores: number[] }).scores[0] ?? 0;
    }
    // JS fallback: dot product / (|a| * |b|)
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < av.length; i++) {
      dot   += av[i] * bv[i];
      normA += av[i] * av[i];
      normB += bv[i] * bv[i];
    }
    return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
  },

  'embedding.batchCosine': async (query: unknown, corpus: unknown) => {
    const gpu = await getGpuBridge();
    if (typeof gpu.batchCosineSimilarity === 'function') {
      return (gpu.batchCosineSimilarity as Function)(query, corpus);
    }
    const q = query as number[];
    const c = corpus as number[][];
    return c.map(vec => {
      let dot = 0, nq = 0, nv = 0;
      for (let i = 0; i < q.length; i++) { dot += q[i]*vec[i]; nq += q[i]*q[i]; nv += vec[i]*vec[i]; }
      return nq === 0 || nv === 0 ? 0 : dot / (Math.sqrt(nq) * Math.sqrt(nv));
    });
  },

  'embedding.kmeans': async (vectors: unknown, k: unknown) => {
    const gpu = await getGpuBridge();
    if (typeof gpu.clusterEmbeddings === 'function') {
      return (gpu.clusterEmbeddings as Function)(vectors, k);
    }
    throw new Error('ff1:embedding.kmeans — GPU bridge required (no JS fallback for k-means)');
  },

  'graph.pagerank': async (graph: unknown) => {
    const gpu = await getGpuBridge();
    if (typeof gpu.pageRankGPU === 'function') {
      return (gpu.pageRankGPU as Function)(graph);
    }
    throw new Error('ff1:graph.pagerank — GPU bridge required');
  },
};

// ── Public planner ─────────────────────────────────────────────────────────

export async function ff1<T = unknown>(name: FF1FunctionName, ...args: unknown[]): Promise<T> {
  const def = computeRegistry[name];
  const redis = await getRedis();

  // 1. Cache read
  if (def.hints.cache) {
    const key = cacheKey(name, args);
    const hit = await redis.get(key);
    if (hit !== null) {
      try { return JSON.parse(hit) as T; } catch { /* corrupt cache — recompute */ }
    }
  }

  // 2. Dispatch to backend
  const backend = backends[name];
  if (!backend) {
    throw new Error(`ff1: no backend registered for '${name}'`);
  }
  const result = await backend(...args);

  // 3. Cache write
  if (def.hints.cache) {
    const key = cacheKey(name, args);
    const ttl = def.hints.cacheTtlSec ?? 900;
    await redis.set(key, JSON.stringify(result), ttl);
  }

  return result as T;
}

/** List all registered function names with their dominant backend tier. */
export function ff1Capabilities(): Array<{ name: string; tier: string; cached: boolean }> {
  return (Object.keys(computeRegistry) as FF1FunctionName[]).map(name => {
    const h = computeRegistry[name].hints as Record<string, unknown>;
    const tier = h['gpuCandidate'] ? 'GPU/cuBLAS' : h['simd'] ? 'WASM-SIMD' : 'JS';
    return { name, tier, cached: (h['cache'] ?? false) as boolean };
  });
}
