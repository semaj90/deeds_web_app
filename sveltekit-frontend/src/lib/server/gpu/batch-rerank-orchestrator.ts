/**
 * src/lib/server/gpu/batch-rerank-orchestrator.ts
 *
 * GPU-accelerated batch reranking orchestrator.
 * Wires tensorrt_bridge.node into retrieval pipeline.
 *
 * Data flow (CANONICAL):
 *   Qdrant top-K vectors [K, 768]
 *   → convert to Float32Array matrix
 *   → LibTorch GPU cosine similarity
 *   → return ranked IDs + scores
 *   → discard tensor immediately
 *
 * CRITICAL: Tensor is ephemeral (allocated at GPU boundary, freed after use).
 *           No persistent tensor storage to disk/DB.
 */

import { createRequire } from 'node:module';
import type { ContextHit } from '$lib/server/ace/retrieval-lanes.js';

const require = createRequire(import.meta.url);

// ─────────────────────────────────────────────────────────────────

let addon: any = null;
let addonError: string | null = null;

try {
  const bridgePath = require.resolve('../../../../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
  addon = require(bridgePath);
} catch (err) {
  addonError = `tensorrt_bridge.node unavailable: ${err instanceof Error ? err.message : String(err)}`;
}

// ─────────────────────────────────────────────────────────────────

export interface BatchRerankResult {
  hits: ContextHit[];
  scores: number[];
  gpuAccelerated: boolean;
  gpuMs?: number;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────

/**
 * Rerank a batch of context hits using GPU cosine similarity.
 *
 * Input:
 *   - queryVector: embedding vector (768-dim Float32Array)
 *   - hits: candidate context hits (from Qdrant/Neo4j/etc)
 *
 * Output:
 *   - hits: re-sorted by GPU cosine similarity score
 *   - scores: similarity scores [0, 1]
 *   - gpuAccelerated: true if GPU path used
 *   - gpuMs: GPU execution time (if applicable)
 *
 * GPU Boundary:
 *   - Allocate: Float32Array matrix [hits.length, 768]
 *   - Use: LibTorch cosine similarity
 *   - Discard: immediately after scoring (no persistent storage)
 */
export async function reankWithGPU(
  queryVector: Float32Array,
  hits: ContextHit[],
  options: { maxCandidates?: number; gpuTimeout?: number } = {}
): Promise<BatchRerankResult> {
  const maxCandidates = options.maxCandidates ?? 200;
  const gpuTimeout = options.gpuTimeout ?? 5000;

  // ─────────────────────────────────────────────────────────────

  // Fallback: no GPU available
  if (!addon) {
    return {
      hits,
      scores: Array(hits.length).fill(0),
      gpuAccelerated: false,
      reason: addonError || 'GPU bridge not available',
    };
  }

  // Fallback: too few candidates
  if (hits.length < 2) {
    return {
      hits,
      scores: hits.map(() => 1.0),
      gpuAccelerated: false,
      reason: 'Batch too small for GPU (< 2 candidates)',
    };
  }

  // Fallback: batch too large
  if (hits.length > maxCandidates) {
    return {
      hits: hits.slice(0, maxCandidates),
      scores: Array(maxCandidates).fill(0),
      gpuAccelerated: false,
      reason: `Batch too large (${hits.length} > ${maxCandidates})`,
    };
  }

  // ─────────────────────────────────────────────────────────────

  // Boundary: Allocate matrix at GPU boundary
  const DIM = 768;
  const numCandidates = hits.length;
  const matrix = new Float32Array(numCandidates * DIM);

  // Fill matrix: each hit's embedding becomes a row
  // (Hits MUST have embedding data; fallback to zero if missing)
  for (let k = 0; k < numCandidates; k++) {
    const hit = hits[k];
    if (!hit.metadata?.embedding) {
      // Missing embedding: zero row (won't score well, but safe)
      for (let i = 0; i < DIM; i++) {
        matrix[k * DIM + i] = 0;
      }
      continue;
    }

    const embedding = hit.metadata.embedding as number[] | Float32Array;
    if (embedding.length !== DIM) {
      // Dimension mismatch: zero row (safe fallback)
      for (let i = 0; i < DIM; i++) {
        matrix[k * DIM + i] = 0;
      }
      continue;
    }

    // Copy embedding into matrix row
    for (let i = 0; i < DIM; i++) {
      matrix[k * DIM + i] = embedding[i];
    }
  }

  // ─────────────────────────────────────────────────────────────

  // GPU Operation: Cosine similarity
  let scores: Float32Array | number[];
  let gpuMs: number;

  try {
    const gpuStart = Date.now();

    // Call GPU function (multiple cosine similarity implementations available)
    // CRITICAL: This is the only place where GPU computation happens.
    //           Input: queryVector (768), matrix ([numCandidates, 768])
    //           Output: scores (Float32Array of length numCandidates)
    if (typeof addon.graphSimilarity === 'function') {
      // graphSimilarity(query, corpus, n) → Float32Array
      scores = addon.graphSimilarity(queryVector, matrix, numCandidates);
    } else if (typeof addon.graphSimilarityHalf === 'function') {
      // FP16 variant (faster, lower precision)
      scores = addon.graphSimilarityHalf(queryVector, matrix, numCandidates);
    } else if (typeof addon.batchCosineSimilarity === 'function') {
      // batchCosineSimilarity(query, dim, corpus, n, scores, scoresLen) → void (modifies scores buffer)
      const scoreBuffer = new Float32Array(numCandidates);
      addon.batchCosineSimilarity(queryVector, DIM, matrix, numCandidates, scoreBuffer, numCandidates);
      scores = scoreBuffer;
    } else if (typeof addon.batchCosineSimilarity_fp16 === 'function') {
      // FP16 variant
      const scoreBuffer = new Float32Array(numCandidates);
      addon.batchCosineSimilarity_fp16(queryVector, DIM, matrix, numCandidates, scoreBuffer, numCandidates);
      scores = scoreBuffer;
    } else {
      throw new Error('No cosine similarity function available in GPU bridge');
    }

    gpuMs = Date.now() - gpuStart;

    // Validate output
    if (!scores || scores.length !== numCandidates) {
      throw new Error(`GPU returned invalid score shape: expected ${numCandidates}, got ${scores?.length ?? 'null'}`);
    }
  } catch (err) {
    // GPU error: fallback to zero scores (safe, no LLM inference)
    return {
      hits,
      scores: Array(numCandidates).fill(0),
      gpuAccelerated: false,
      reason: `GPU rerank failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    // ─────────────────────────────────────────────────────────

    // Boundary: Discard tensor immediately (free GPU memory)
    matrix.fill(0); // Simulate GPU memory release
  }

  // ─────────────────────────────────────────────────────────────

  // Rank: Sort by GPU score (descending)
  const ranked = hits
    .map((hit, idx) => ({
      hit,
      score: Number(scores[idx]) ?? 0,
      originalIndex: idx,
    }))
    .sort((a, b) => b.score - a.score);

  const rerankedHits = ranked.map((r) => ({
    ...r.hit,
    score: r.score,
  }));

  const rerankedScores = ranked.map((r) => r.score);

  return {
    hits: rerankedHits,
    scores: rerankedScores,
    gpuAccelerated: true,
    gpuMs,
  };
}

// ─────────────────────────────────────────────────────────────────

/**
 * Check GPU bridge health (non-blocking).
 *
 * Returns true if GPU is available and functions are exported.
 * Returns false if bridge is unavailable (CPU fallback will be used).
 */
export function isGPUHealthy(): boolean {
  if (!addon) return false;
  if (typeof addon.graphSimilarity !== 'function' && typeof addon.batchCosineSimilarity !== 'function') {
    return false;
  }
  return true;
}

/**
 * Get GPU bridge diagnostic info.
 */
export function getGPUDiagnostics(): {
  available: boolean;
  error?: string;
  functions: string[];
  cudaAvailable?: boolean;
} {
  if (!addon) {
    return {
      available: false,
      error: addonError || 'Bridge not loaded',
      functions: [],
    };
  }

  const functions = Object.keys(addon);
  const cudaAvailable = typeof addon.checkCudaAvailable === 'function' ? addon.checkCudaAvailable() : undefined;

  return {
    available: true,
    functions,
    cudaAvailable,
  };
}
