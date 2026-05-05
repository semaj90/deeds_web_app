/**
 * FF1 Compute Registry — server-only.
 *
 * Declares hot functions with JIT routing hints. The planner reads these at
 * runtime and dispatches to: JS fallback → WASM SIMD → LibTorch N-API (CUDA).
 *
 * Hint fields:
 *   hot           — true if called >10× per request; always cache + route aggressively
 *   dimensions    — vector length hint for SIMD alignment
 *   simd          — 128-bit WASM SIMD candidate (float32 math, aligned loads)
 *   gpuCandidate  — cuBLAS candidate via tensorrt_bridge.node
 *   wasmCandidate — WASM SIMD candidate (browser or server side)
 *   worker        — offload to a Node worker_threads worker
 *   cache         — Redis cache eligible (result is deterministic for same inputs)
 *   cacheTtlSec   — Redis TTL in seconds (default 900)
 */

export interface FF1Hints {
  hot?: boolean;
  dimensions?: number;
  simd?: boolean;
  gpuCandidate?: boolean;
  wasmCandidate?: boolean;
  worker?: boolean;
  cache?: boolean;
  cacheTtlSec?: number;
}

export interface FF1FunctionDef {
  args: string[];
  returns: string;
  hints: FF1Hints;
  description?: string;
}

export const computeRegistry = {
  // ── Embedding ops ────────────────────────────────────────────────────────
  'embedding.cosine': {
    args: ['float32[]', 'float32[]'],
    returns: 'f32',
    hints: { hot: true, dimensions: 768, simd: true, gpuCandidate: true, cache: true, cacheTtlSec: 900 },
    description: 'Cosine similarity between two 768-dim embeddings',
  },

  'embedding.batchCosine': {
    args: ['float32[]', 'float32[][]'],
    returns: 'f32[]',
    hints: { hot: true, dimensions: 768, gpuCandidate: true, cache: false },
    description: 'Query vs corpus cosine similarity via cuBLAS batched GEMM',
  },

  'embedding.kmeans': {
    args: ['float32[][]', 'number'],
    returns: '{ assignments: number[]; centroids: float32[][] }',
    hints: { hot: false, gpuCandidate: true, cache: true, cacheTtlSec: 3600 },
    description: 'K-means clustering on embedding matrix via CUDA',
  },

  // ── JSON / SIMD ops ──────────────────────────────────────────────────────
  'jsonb.fastParse': {
    args: ['string'],
    returns: 'unknown',
    hints: { hot: true, simd: true, wasmCandidate: true, cache: true, cacheTtlSec: 300 },
    description: 'simdjson-accelerated JSON parse with LRU byte-budget cache',
  },

  'jsonb.schemaMap': {
    args: ['json'],
    returns: 'json',
    hints: { hot: true, wasmCandidate: true, cache: true, cacheTtlSec: 600 },
    description: 'Extract typed schema map from JSONB blob',
  },

  // ── Graph / PageRank ops ─────────────────────────────────────────────────
  'graph.pagerank': {
    args: ['{ nodes: string[]; edges: [string,string,number][] }'],
    returns: 'Map<string, number>',
    hints: { hot: false, gpuCandidate: true, cache: true, cacheTtlSec: 7200 },
    description: 'Sparse GPU power-iteration PageRank via cuBLAS',
  },

  'graph.somBmu': {
    args: ['float32[]', 'float32[][]'],
    returns: '{ row: number; col: number }',
    hints: { hot: true, simd: true, gpuCandidate: true, cache: true, cacheTtlSec: 1800 },
    description: 'SOM best-matching unit lookup for a query vector',
  },

  // ── AST analysis ops ─────────────────────────────────────────────────────
  'ast.gateScore': {
    args: ['string', 'string[]'],
    returns: 'number',
    hints: { hot: false, wasmCandidate: false, cache: true, cacheTtlSec: 3600 },
    description: '20-gate audit score for a source file path',
  },

  'ast.errorCluster': {
    args: ['string[]'],
    returns: '{ cluster: number; files: string[] }[]',
    hints: { hot: false, gpuCandidate: false, cache: true, cacheTtlSec: 1800 },
    description: 'Group TypeScript error files by cluster membership',
  },
} as const satisfies Record<string, FF1FunctionDef>;

export type FF1FunctionName = keyof typeof computeRegistry;
