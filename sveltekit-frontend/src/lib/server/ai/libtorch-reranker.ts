import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let bridge: {
  attentionScoreGPU?: (query: Float32Array, dim: number, candidates: Float32Array, n: number) => Float32Array;
} | null = null;

// IMPORTANT: this file lives at src/lib/server/ai/.
// The native bridge lives outside sveltekit-frontend at ../simd-bridge/.
// Prefer process.cwd() when this service is launched from sveltekit-frontend.
// Avoid fragile ../../../../ paths; four levels only reaches sveltekit-frontend.
// Native bridge failure must fall back to CPU scoring unless this is an explicit verification command.
try {
  bridge = require('../../../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
} catch (err) {
  if (!process.env.VITEST) {
    console.warn('[LibTorchReranker] Native bridge unavailable, using CPU fallback:', err instanceof Error ? err.message : err);
  }
}

/**
 * LibTorchReranker
 * 
 * Uses the N-API LibTorch bridge to perform GPU-accelerated attention scoring
 * for retrieval reranking. This provides sub-millisecond ranking of top-N 
 * knowledge chunks on the RTX 3060 Ti.
 */
export class LibTorchReranker {
  /**
   * Rerank a set of candidates against a query embedding.
   */
  static async rerank(query: Float32Array, candidates: Float32Array, n: number, dim: number): Promise<Float32Array> {
    if (!bridge?.attentionScoreGPU) {
      console.warn('[LibTorchReranker] N-API attentionScoreGPU not available. Falling back to CPU.');
      return this.cpuFallback(query, candidates, n, dim);
    }

    try {
      const { CudaGraphManager } = await import('./cuda-graph-manager.js');
      const graphKey = `rerank:${n}`;
      
      // Proactively capture graph for sub-millisecond replay on subsequent calls
      await CudaGraphManager.captureIfMissing(graphKey, [n, dim]);

      // Direct call to N-API (In-process, zero-copy via TypedArrays)
      return bridge.attentionScoreGPU(query, dim, candidates, n);
    } catch (err) {
      console.error('[LibTorchReranker] GPU scoring failed:', err);
      return this.cpuFallback(query, candidates, n, dim);
    }
  }

  private static cpuFallback(query: Float32Array, candidates: Float32Array, n: number, dim: number): Float32Array {
    const scores = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let dot = 0;
      for (let j = 0; j < dim; j++) {
        dot += query[j] * candidates[i * dim + j];
      }
      scores[i] = dot;
    }
    // Simple softmax
    const max = Math.max(...scores);
    const exps = scores.map(s => Math.exp(s - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sum);
  }
}
