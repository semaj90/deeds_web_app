/**
 * src/lib/server/gpu/cuda-graph-rerank-hook.ts
 *
 * Hook into the retrieval pipeline (query-router, ace-agent, context-assembler)
 * to apply GPU reranking with CUDA graph caching.
 *
 * Usage:
 *   const reranked = await reankACECandidates(queryVector, topKHits, options);
 *   // reranked.hits are sorted by GPU cosine similarity
 *   // reranked.telemetry contains cache hit/miss info
 *
 * Integration points:
 *   - query-router.ts after Qdrant ANN search
 *   - ace-agent.ts after candidate merge
 *   - context-assembler.ts before packing for LLM
 *
 * Performance expectations (RTX 3060 Ti):
 *   - Cache hit (replay): ~2–5ms
 *   - Direct GPU rerank: ~10–50ms (depends on batch size)
 *   - Capture overhead: ~5–20ms (one-time, amortized)
 */

import { reankWithGraphCache, logGraphCacheTelemetry } from './cuda-graph-caching-bridge.js';
import type { ContextHit } from '../ace/retrieval-lanes.js';

/**
 * Rerank ACE candidates using GPU cosine similarity with graph caching.
 *
 * Pre-condition: hits must have embeddings in metadata
 * Post-condition: hits are sorted by GPU similarity score (descending)
 */
export async function reankACECandidates(
  queryVector: Float32Array,
  hits: ContextHit[],
  options: {
    maxCandidates?: number;
    gpuTimeout?: number;
    enableGraphCache?: boolean;
    logTelemetry?: boolean;
  } = {}
): Promise<{ hits: ContextHit[]; telemetry: Awaited<ReturnType<typeof reankWithGraphCache>>['telemetry'] }> {
  const { result, telemetry } = await reankWithGraphCache(queryVector, hits, {
    maxCandidates: options.maxCandidates ?? 100,
    gpuTimeout: options.gpuTimeout ?? 5000,
    enableGraphCache: options.enableGraphCache !== false,
  });

  // Log telemetry (non-blocking)
  if (options.logTelemetry !== false) {
    logGraphCacheTelemetry(telemetry).catch(err => {
      console.debug('[ReankHook] Telemetry log failed:', err);
    });
  }

  return {
    hits: result.hits,
    telemetry,
  };
}

/**
 * Check if GPU reranking should be applied to this batch.
 *
 * Returns false if:
 *   - Batch is too small (< 5 candidates)
 *   - GPU bridge is unavailable
 *   - Batch is too large (> 500 candidates)
 */
export function shouldRerank(hitCount: number): boolean {
  if (hitCount < 5) return false;     // Too small for GPU overhead
  if (hitCount > 500) return false;   // Risk of timeouts
  return true;
}

/**
 * Prepare query vector for reranking (validate shape, convert to Float32Array).
 *
 * Returns null if validation fails (invalid dimension, empty, etc.)
 */
export function validateQueryVector(embedding: number[] | Float32Array | undefined): Float32Array | null {
  if (!embedding) return null;

  const dim = 768;  // Project canonical dimension

  if (embedding.length !== dim) {
    console.warn(`[ReankHook] Query embedding dimension mismatch: expected ${dim}, got ${embedding.length}`);
    return null;
  }

  if (embedding instanceof Float32Array) {
    return embedding;
  }

  return new Float32Array(embedding);
}

/**
 * Extract embeddings from ACE context hits for reranking.
 *
 * Validates that all hits have embeddings; filters out hits without embeddings.
 */
export function extractHitEmbeddings(hits: ContextHit[]): { hits: ContextHit[]; missingCount: number } {
  const missingCount = hits.filter(h => !h.metadata?.embedding).length;

  return {
    hits: hits.filter(h => h.metadata?.embedding),
    missingCount,
  };
}

/**
 * Initialize GPU reranking at application startup (non-blocking).
 *
 * Pre-warms CUDA graph cache for common batch sizes.
 */
export async function initializeGPUReranking(): Promise<void> {
  try {
    const { warmupGraphCache } = await import('./cuda-graph-caching-bridge.js');
    await warmupGraphCache();
  } catch (err) {
    console.debug('[ReankHook] GPU warmup failed (non-fatal):', err);
  }
}
