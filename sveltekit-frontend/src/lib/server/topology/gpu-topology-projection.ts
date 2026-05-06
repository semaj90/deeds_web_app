/**
 * GPU Topology Projection Pipeline
 *
 * Transforms raw embeddings → 4D manifold coordinates via:
 *   1. PCA projection (GPU via tensorrt_bridge.node, CPU JS fallback)
 *   2. Optional: autoencoder latent projection (when weights provided)
 *   3. Per-dimension normalization to [0, 1]
 *
 * PCA components are computed via power iteration on a sample
 * (PCA_FIT_SAMPLE rows max), then applied to the full input via
 * the GPU-accelerated pcaProject from topology-projection.ts.
 *
 * Output feeds:
 *   - Postgres codebase_chunk_index.manifold4  (durable truth)
 *   - Qdrant codebase_chunks_768 payloads       (fast serving prefilter)
 *   - docs/graph/nes-glyph-architecture.json    (webview + atlas)
 *   - docs/graph/multihop-codebase-map.json     (multi-hop retrieval)
 */

import { pcaProject, autoencoderEncode } from '$lib/server/gpu/topology-projection.js';
import type { ProjectionResult } from '$lib/server/gpu/topology-projection.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max rows used to *fit* PCA components (keeps power-iteration fast). */
const PCA_FIT_SAMPLE = 2048;

/** Default max rows projected per call. */
const DEFAULT_MAX_N = 32_768;

/** Power-iteration steps per principal component. */
const PCA_ITER = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

export type Manifold4Coords = [number, number, number, number];
export type ProjectionSource = 'gpu-pca' | 'cpu-pca' | 'gpu-autoencoder' | 'cpu-autoencoder';

export interface EmbeddingInput {
  id: string;
  stableKey: string;
  relativePath: string;
  clusterKey?: string;
  tags?: string[];
  embedding: number[];
}

export interface TopologyNode {
  id: string;
  stableKey: string;
  relativePath: string;
  clusterKey?: string;
  tags: string[];
  manifold4: Manifold4Coords;
  projectionSource: ProjectionSource;
}

export interface AutoencoderWeights {
  W: Float32Array;  // [hidden × inputDim] row-major
  b: Float32Array;  // [hidden]
  hidden: number;
}

export interface ProjectionPipelineOptions {
  /** 'pca' uses power-iteration PCA (default). 'autoencoder' uses single linear+tanh layer. */
  mode?: 'pca' | 'autoencoder';
  /** Normalize per-dim to [0,1]. Default true. */
  normalize?: boolean;
  /** Hard cap on input rows. Default 32_768. */
  maxN?: number;
  /** Required when mode='autoencoder'. */
  autoencoderWeights?: AutoencoderWeights;
}

export interface ProjectionAudit {
  projection: {
    source: ProjectionSource;
    backend: 'gpu' | 'cpu-fallback';
    model: string;
    inputDim: number;
    outputDim: 4;
    durationMs: number;
    version: number;
  };
  normalized: boolean;
  fitSample: number;
  minCoords: Manifold4Coords;
  maxCoords: Manifold4Coords;
}

export interface ProjectionPipelineResult {
  ok: boolean;
  nodes: TopologyNode[];
  n: number;
  durationMs: number;
  audit: ProjectionAudit;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Compute the per-dimension mean of n × dim embeddings (flat row-major).
 */
export function computeMean(flat: Float32Array, n: number, dim: number): Float32Array {
  const mean = new Float32Array(dim);
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < dim; d++) mean[d] += flat[i * dim + d];
  }
  for (let d = 0; d < dim; d++) mean[d] /= n;
  return mean;
}

/**
 * Compute top-k principal components via power iteration.
 *
 * Operates on a *sample* matrix (fitFlat: fitN × dim, already mean-centered
 * externally — pass centered data or the function centres internally via the
 * mean parameter). Returns a [k × dim] matrix (row-major, L2-normalised rows).
 *
 * Uses a deterministic seed (sin-based) so repeated calls on the same data
 * produce the same components.
 */
export function computePCAComponents(
  fitFlat: Float32Array,
  fitN: number,
  dim: number,
  k: number,
  mean: Float32Array,
): Float32Array {
  const components = new Float32Array(k * dim); // always return [k × dim] shape
  const effectiveK = Math.min(k, Math.max(1, fitN - 1));

  if (fitN < 2) return components; // degenerate: no variance → all zeros

  // Centre the residual matrix
  const residual = new Float32Array(fitN * dim);
  for (let i = 0; i < fitN; i++) {
    for (let d = 0; d < dim; d++) {
      residual[i * dim + d] = fitFlat[i * dim + d] - mean[d];
    }
  }

  for (let c = 0; c < effectiveK; c++) {
    // Deterministic initial unit vector
    const v = new Float32Array(dim);
    for (let d = 0; d < dim; d++) v[d] = Math.sin(d * 1.618033988 + c * 2.718281828);
    let norm = 0;
    for (let d = 0; d < dim; d++) norm += v[d] * v[d];
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < dim; d++) v[d] /= norm;

    // Power iteration: v ← X^T(Xv) / ‖X^T(Xv)‖
    for (let iter = 0; iter < PCA_ITER; iter++) {
      const u = new Float32Array(fitN);
      for (let i = 0; i < fitN; i++) {
        let dot = 0;
        for (let d = 0; d < dim; d++) dot += residual[i * dim + d] * v[d];
        u[i] = dot;
      }
      const vNew = new Float32Array(dim);
      for (let i = 0; i < fitN; i++) {
        for (let d = 0; d < dim; d++) vNew[d] += residual[i * dim + d] * u[i];
      }
      let n2 = 0;
      for (let d = 0; d < dim; d++) n2 += vNew[d] * vNew[d];
      n2 = Math.sqrt(n2);
      if (n2 < 1e-12) break;
      for (let d = 0; d < dim; d++) v[d] = vNew[d] / n2;
    }

    components.set(v, c * dim);

    // Deflate residual
    for (let i = 0; i < fitN; i++) {
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += residual[i * dim + d] * v[d];
      for (let d = 0; d < dim; d++) residual[i * dim + d] -= dot * v[d];
    }
  }

  return components;
}

/**
 * Normalize 4D coordinates per-dimension to [0, 1].
 */
export function normalizeManifold4(
  projected: Float32Array,
  n: number,
): { normalized: Float32Array; min: Manifold4Coords; max: Manifold4Coords } {
  const min: Manifold4Coords = [Infinity, Infinity, Infinity, Infinity];
  const max: Manifold4Coords = [-Infinity, -Infinity, -Infinity, -Infinity];

  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      const v = projected[i * 4 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }

  const range: Manifold4Coords = [
    max[0] - min[0] || 1,
    max[1] - min[1] || 1,
    max[2] - min[2] || 1,
    max[3] - min[3] || 1,
  ];

  const normalized = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      normalized[i * 4 + k] = (projected[i * 4 + k] - min[k]) / range[k];
    }
  }
  return { normalized, min, max };
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

/**
 * Project a batch of embeddings to 4D manifold coordinates.
 *
 * Steps:
 *  1. Flatten EmbeddingInput[] → Float32Array
 *  2. Compute mean + PCA components on a sample (≤ PCA_FIT_SAMPLE rows)
 *  3. Call GPU-accelerated pcaProject (or autoencoderEncode when weights given)
 *  4. Optionally normalize per-dim to [0, 1]
 *  5. Return TopologyNode[] with manifold4 + audit metadata
 */
export async function runTopologyProjection(
  inputs: EmbeddingInput[],
  opts: ProjectionPipelineOptions = {},
): Promise<ProjectionPipelineResult> {
  const { mode = 'pca', normalize = true, maxN = DEFAULT_MAX_N, autoencoderWeights } = opts;
  const t0 = performance.now();

  const emptyAudit = (): ProjectionAudit => ({
    projection: { source: 'cpu-pca', backend: 'cpu-fallback', model: 'none', inputDim: 0, outputDim: 4, durationMs: 0, version: 1 },
    normalized: false, fitSample: 0,
    minCoords: [0, 0, 0, 0], maxCoords: [0, 0, 0, 0],
  });

  if (inputs.length === 0) {
    return { ok: false, nodes: [], n: 0, durationMs: 0, audit: emptyAudit() };
  }

  const n = Math.min(inputs.length, maxN);
  const dim = inputs[0].embedding.length;
  if (dim === 0) {
    return { ok: false, nodes: [], n, durationMs: 0, audit: emptyAudit() };
  }

  // Flatten
  const flat = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) {
    const emb = inputs[i].embedding;
    for (let d = 0; d < dim; d++) flat[i * dim + d] = emb[d];
  }

  // Compute PCA fit on a sample
  const fitN = Math.min(n, PCA_FIT_SAMPLE);
  const fitFlat = fitN < n ? flat.subarray(0, fitN * dim) : flat;
  const mean = computeMean(fitFlat, fitN, dim);
  const components = computePCAComponents(fitFlat, fitN, dim, 4, mean);

  let result: ProjectionResult;

  if (mode === 'autoencoder' && autoencoderWeights) {
    const { W, b, hidden } = autoencoderWeights;
    result = await autoencoderEncode(flat, W, b, { n, dim, outDim: hidden as 2 | 3 | 4, maxN });
  } else {
    result = await pcaProject(flat, mean, components, { n, dim, outDim: 4, maxN });
  }

  // Normalize
  let finalCoords = result.projected;
  let minCoords: Manifold4Coords = [0, 0, 0, 0];
  let maxCoords: Manifold4Coords = [1, 1, 1, 1];

  if (normalize && result.ok && result.n > 0) {
    const nr = normalizeManifold4(result.projected, result.n);
    finalCoords = nr.normalized;
    minCoords = nr.min;
    maxCoords = nr.max;
  }

  const projSrc: ProjectionSource =
    result.source === 'gpu'
      ? mode === 'autoencoder' ? 'gpu-autoencoder' : 'gpu-pca'
      : mode === 'autoencoder' ? 'cpu-autoencoder' : 'cpu-pca';

  const nodes: TopologyNode[] = inputs.slice(0, n).map((inp, i) => ({
    id: inp.id,
    stableKey: inp.stableKey,
    relativePath: inp.relativePath,
    clusterKey: inp.clusterKey,
    tags: inp.tags ?? [],
    manifold4: [
      finalCoords[i * 4 + 0],
      finalCoords[i * 4 + 1],
      finalCoords[i * 4 + 2],
      finalCoords[i * 4 + 3],
    ] as Manifold4Coords,
    projectionSource: projSrc,
  }));

  return {
    ok: result.ok,
    nodes,
    n,
    durationMs: Math.round((performance.now() - t0) * 10) / 10,
    audit: {
      projection: {
        source: projSrc,
        backend: result.source,
        model: 'tensorrt_bridge.node',
        inputDim: dim,
        outputDim: 4,
        durationMs: result.durationMs,
        version: 1,
      },
      normalized: normalize,
      fitSample: fitN,
      minCoords,
      maxCoords,
    },
  };
}
