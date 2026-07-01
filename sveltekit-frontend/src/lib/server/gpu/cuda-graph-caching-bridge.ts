/**
 * src/lib/server/gpu/cuda-graph-caching-bridge.ts
 *
 * Integrates CUDA Graph caching into the reranking hot path.
 *
 * Purpose: Reduce GPU overhead by caching and replaying CUDA graphs
 * for repeated tensor shapes. Avoids re-JIT-compiling the same operation.
 *
 * Flow:
 *   1. Caller provides (queryVector, hits, batchSize)
 *   2. Generate cache key: `{operation}:{batchSize}x{dim}`
 *   3. Check Redis cache for prior hit/miss stats
 *   4. Try CUDA graph capture (if shape not seen before)
 *   5. Try CUDA graph replay (if cached)
 *   6. Fallback to direct GPU operation (if capture failed)
 *   7. Log result to telemetry (hit/miss, latency, GPU ms)
 *
 * Telemetry format:
 *   {
 *     cacheKey: string,
 *     cacheHit: boolean,
 *     captureMs: number | null,
 *     replayMs: number | null,
 *     directMs: number | null,
 *     totalMs: number,
 *     batchSize: number,
 *     fastPath: "capture" | "replay" | "direct" | "skipped"
 *   }
 */

import { CudaGraphManager } from '../ai/cuda-graph-manager.js';
import { reankWithGPU } from './batch-rerank-orchestrator.js';
import type { ContextHit } from '../ace/retrieval-lanes.js';

export interface CudaGraphCacheStats {
  cacheKey: string;
  cacheHit: boolean;
  captureMs: number | null;
  replayMs: number | null;
  directMs: number | null;
  totalMs: number;
  batchSize: number;
  fastPath: 'capture' | 'replay' | 'direct' | 'skipped';
}

/**
 * Generate a stable cache key for CUDA graph reuse.
 * Format: `rerank:{batchSize}x{dimension}`
 */
function generateCacheKey(batchSize: number, dimension: number = 768): string {
  return `rerank:${batchSize}x${dimension}`;
}

/**
 * Rerank hits with CUDA graph caching.
 *
 * Attempts to use cached CUDA graphs for common batch sizes to avoid
 * repeated graph compilation. Falls back to direct GPU reranking if
 * the cache isn't available or the shape is new.
 *
 * @param queryVector Query embedding (768-dim)
 * @param hits Context hits to rerank
 * @param options Tuning parameters
 * @returns Reranked hits + cache telemetry
 */
export async function reankWithGraphCache(
  queryVector: Float32Array,
  hits: ContextHit[],
  options: { maxCandidates?: number; gpuTimeout?: number; enableGraphCache?: boolean } = {}
): Promise<{ result: Awaited<ReturnType<typeof reankWithGPU>>; telemetry: CudaGraphCacheStats }> {
  const startMs = Date.now();
  const batchSize = Math.min(hits.length, options.maxCandidates ?? 200);
  const dimension = 768;
  const cacheKey = generateCacheKey(batchSize, dimension);
  const enableCache = options.enableGraphCache !== false && CudaGraphManager.isAvailable();

  let telemetry: CudaGraphCacheStats = {
    cacheKey,
    cacheHit: false,
    captureMs: null,
    replayMs: null,
    directMs: null,
    totalMs: 0,
    batchSize,
    fastPath: 'skipped',
  };

  // ─────────────────────────────────────────────────────────────
  // Path 1: Try CUDA graph replay (cache hit)
  // ─────────────────────────────────────────────────────────────

  if (enableCache) {
    // Try to replay an already-captured graph
    const replayStart = Date.now();
    const replayResult = await CudaGraphManager.replay(cacheKey, queryVector);
    const replayMs = Date.now() - replayStart;

    if (replayResult) {
      telemetry.replayMs = replayMs;
      telemetry.cacheHit = true;
      telemetry.fastPath = 'replay';

      // Build result from replayed graph output
      const result = {
        hits: hits.map((hit, idx) => ({
          ...hit,
          score: Number(replayResult[idx]) ?? 0,
        })),
        scores: Array.from(replayResult),
        gpuAccelerated: true,
        gpuMs: replayMs,
      };

      telemetry.totalMs = Date.now() - startMs;
      return { result, telemetry };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Path 2: Direct GPU reranking (first capture or cache disabled)
  // ─────────────────────────────────────────────────────────────

  const directStart = Date.now();
  const result = await reankWithGPU(queryVector, hits, options);
  const directMs = Date.now() - directStart;

  telemetry.directMs = directMs;

  // ─────────────────────────────────────────────────────────────
  // Path 3: Attempt to capture graph for future reuse
  // ─────────────────────────────────────────────────────────────

  if (enableCache && result.gpuAccelerated) {
    // Only capture if the direct GPU call succeeded
    const captureStart = Date.now();
    const captureSuccess = await CudaGraphManager.captureIfMissing(cacheKey, [batchSize, dimension]);
    const captureMs = Date.now() - captureStart;

    if (captureSuccess) {
      telemetry.captureMs = captureMs;
      telemetry.fastPath = 'capture';
    } else {
      telemetry.fastPath = 'direct';
    }
  } else {
    telemetry.fastPath = 'direct';
  }

  telemetry.totalMs = Date.now() - startMs;

  return { result, telemetry };
}

/**
 * Warm up common batch sizes for CUDA graph caching.
 * Call this once at startup to pre-capture graphs for typical scenarios.
 */
export async function warmupGraphCache(): Promise<void> {
  if (!CudaGraphManager.isAvailable()) {
    console.log('[CudaGraphCache] Graph caching unavailable, skipping warmup');
    return;
  }

  console.log('[CudaGraphCache] Warming up common batch sizes...');
  await CudaGraphManager.warmup();
  console.log('[CudaGraphCache] Warmup complete');
}

/**
 * Log cache telemetry to packet-centric observability (non-blocking).
 */
export async function logGraphCacheTelemetry(telemetry: CudaGraphCacheStats): Promise<void> {
  try {
    const mod = await import('../telemetry/packet-centric-telemetry.js').catch(() => null);
    if (!mod?.recordPacketCentricTelemetry) return;

    await mod.recordPacketCentricTelemetry({
      retrieval_strategy: 'cuda_graph_cache',
      cache_key: telemetry.cacheKey,
      cache_hit: telemetry.cacheHit,
      fast_path: telemetry.fastPath,
      capture_ms: telemetry.captureMs,
      replay_ms: telemetry.replayMs,
      direct_ms: telemetry.directMs,
      total_ms: telemetry.totalMs,
      batch_size: telemetry.batchSize,
      latency_ms: telemetry.totalMs,
    });
  } catch (err) {
    // Non-blocking: telemetry failures don't break retrieval
    console.debug('[CudaGraphCache] Telemetry log failed:', err);
  }
}

/**
 * Get cache diagnostics for observability/debugging.
 */
export function getGraphCacheDiagnostics(): {
  available: boolean;
  warmupComplete: boolean;
  error?: string;
} {
  return {
    available: CudaGraphManager.isAvailable(),
    warmupComplete: CudaGraphManager.isAvailable(), // TODO: track actual warmup state
    error: !CudaGraphManager.isAvailable() ? 'CUDA Graph Manager unavailable' : undefined,
  };
}
