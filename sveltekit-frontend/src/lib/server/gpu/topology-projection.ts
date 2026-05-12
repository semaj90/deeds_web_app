/**
 * Topology Projection Bridge — GPU-accelerated PCA and autoencoder projection.
 *
 * Wraps pcaProject and autoencoderEncode from tensorrt_bridge.node:
 *   - pcaProjectGPU: (data - mean) @ components^T  [n×dim → n×k]
 *   - autoencoderEncodeGPU: tanh(data @ W^T + b)   [n×dim → n×hidden]
 *
 * Both include outputMeta (D19 contract), VRAM guards, Float32Array pool reuse,
 * and CPU JS fallbacks so every call returns a ProjectionResult regardless of
 * GPU availability.
 *
 * Thresholds (matching the spec):
 *   GPU path used when n >= 256 AND dim >= 64
 *   CPU path used for small inputs or when VRAM headroom < 256 MB
 */

import { gpuHasRoom, vramNeededMB, acquireFloat32, releaseFloat32, isCudaAvailable } from './libtorch-bridge.js';

// Re-export getAddon lazily — avoids circular dep with libtorch-bridge
let _getAddon: (() => import('./libtorch-bridge.js').NativeAddon | null) | null = null;
async function getAddon(): Promise<import('./libtorch-bridge.js').NativeAddon | null> {
  if (!_getAddon) {
    const mod = await import('./libtorch-bridge.js');
    // libtorch-bridge exposes getAddon via isCudaAvailable side-channel
    // We use the module-level loader by importing the bridge and calling through
    _getAddon = () => (mod as unknown as { _addon?: import('./libtorch-bridge.js').NativeAddon | null })._addon ?? null;
  }
  return _getAddon();
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ProjectionOptions = {
  n: number;
  dim: number;
  outDim: 2 | 3 | 4;
  preferGpu?: boolean;
  maxN?: number;
};

/** Autoencoder variant — outDim is an arbitrary hidden dimension, not restricted to 2|3|4. */
export type AutoencoderOptions = Omit<ProjectionOptions, 'outDim'> & { outDim: number };

export type ProjectionResult = {
  ok: boolean;
  source: 'gpu' | 'cpu-fallback';
  projected: Float32Array;
  n: number;
  outDim: number;
  durationMs: number;
  outputMeta: {
    op: 'pcaProjectGPU' | 'autoencoderEncodeGPU';
    gpuUsed: boolean;
    inputRows: number;
    inputDim: number;
    outputDim: number;
  };
};

// ── GPU threshold ─────────────────────────────────────────────────────────────

const GPU_MIN_N   = 256;
const GPU_MIN_DIM = 64;
const VRAM_HEADROOM_MB = 256;

function shouldUseGpu(n: number, dim: number, preferGpu = true): boolean {
  if (!preferGpu) return false;
  if (!isCudaAvailable()) return false;
  if (n < GPU_MIN_N || dim < GPU_MIN_DIM) return false;
  return gpuHasRoom(vramNeededMB(n, dim) + VRAM_HEADROOM_MB);
}

// ── CPU fallbacks ─────────────────────────────────────────────────────────────

/** CPU PCA: (data - mean) @ components^T */
function cpuPcaProject(
  data: Float32Array, n: number, dim: number,
  mean: Float32Array,
  components: Float32Array, k: number
): Float32Array {
  const out = new Float32Array(n * k);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      let dot = 0;
      for (let d = 0; d < dim; d++) {
        dot += (data[i * dim + d] - mean[d]) * components[j * dim + d];
      }
      out[i * k + j] = dot;
    }
  }
  return out;
}

/** CPU Autoencoder encode: tanh(data @ W^T + b) */
function cpuAutoencoderEncode(
  data: Float32Array, n: number, inputDim: number,
  W: Float32Array, b: Float32Array, hidden: number
): Float32Array {
  const out = new Float32Array(n * hidden);
  for (let i = 0; i < n; i++) {
    for (let h = 0; h < hidden; h++) {
      let act = b[h];
      for (let d = 0; d < inputDim; d++) {
        act += data[i * inputDim + d] * W[h * inputDim + d];
      }
      out[i * hidden + h] = Math.tanh(act);
    }
  }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Project n×dim embeddings onto k principal components.
 *
 * @param data       Flat Float32Array of shape [n × dim]
 * @param mean       Mean vector [dim] (pass Float32Array(dim).fill(0) to skip centering)
 * @param components Principal component matrix [k × dim] (row-major, L2-normalised)
 * @param opts       n, dim, outDim (k), preferGpu, maxN
 */
export async function pcaProject(
  data: Float32Array,
  mean: Float32Array,
  components: Float32Array,
  opts: ProjectionOptions
): Promise<ProjectionResult> {
  const { n, dim, outDim: k, preferGpu = true, maxN = 32_768 } = opts;
  const t0 = performance.now();

  if (n <= 0 || dim <= 0 || k <= 0 || k > dim) {
    return {
      ok: false, source: 'cpu-fallback',
      projected: new Float32Array(0), n, outDim: k,
      durationMs: 0,
      outputMeta: { op: 'pcaProjectGPU', gpuUsed: false, inputRows: n, inputDim: dim, outputDim: k },
    };
  }

  const effectiveN = Math.min(n, maxN);
  const inputData = effectiveN < n ? data.subarray(0, effectiveN * dim) : data;

  if (shouldUseGpu(effectiveN, dim, preferGpu)) {
    try {
      const addon = await getAddon();
      if (addon?.pcaProject) {
        const result = addon.pcaProject(inputData, effectiveN, dim, mean, components, k);
        const durationMs = performance.now() - t0;
        return {
          ok: true, source: 'gpu',
          projected: result, n: effectiveN, outDim: k,
          durationMs: Math.round(durationMs * 10) / 10,
          outputMeta: { op: 'pcaProjectGPU', gpuUsed: true, inputRows: effectiveN, inputDim: dim, outputDim: k },
        };
      }
    } catch (err) {
      const msg = (err instanceof Error) ? err.message : String(err);
      console.warn('[topology-projection] pcaProject GPU failed, falling back to CPU:', msg);
    }
  }

  // CPU fallback
  const projected = cpuPcaProject(inputData, effectiveN, dim, mean, components, k);
  const durationMs = performance.now() - t0;
  return {
    ok: true, source: 'cpu-fallback',
    projected, n: effectiveN, outDim: k,
    durationMs: Math.round(durationMs * 10) / 10,
    outputMeta: { op: 'pcaProjectGPU', gpuUsed: false, inputRows: effectiveN, inputDim: dim, outputDim: k },
  };
}

/**
 * Encode n×dim embeddings through a single linear+tanh layer.
 *
 * @param data   Flat Float32Array of shape [n × inputDim]
 * @param W      Encoder weight matrix [hidden × inputDim] (row-major)
 * @param b      Encoder bias vector [hidden]
 * @param opts   n, dim (=inputDim), outDim (=hidden), preferGpu, maxN
 */
export async function autoencoderEncode(
  data: Float32Array,
  W: Float32Array,
  b: Float32Array,
  opts: AutoencoderOptions
): Promise<ProjectionResult> {
  const { n, dim: inputDim, outDim: hidden, preferGpu = true, maxN = 32_768 } = opts;
  const t0 = performance.now();

  if (n <= 0 || inputDim <= 0 || hidden <= 0) {
    return {
      ok: false, source: 'cpu-fallback',
      projected: new Float32Array(0), n, outDim: hidden,
      durationMs: 0,
      outputMeta: { op: 'autoencoderEncodeGPU', gpuUsed: false, inputRows: n, inputDim, outputDim: hidden },
    };
  }

  const effectiveN = Math.min(n, maxN);
  const inputData = effectiveN < n ? data.subarray(0, effectiveN * inputDim) : data;

  if (shouldUseGpu(effectiveN, inputDim, preferGpu)) {
    try {
      const addon = await getAddon();
      if (addon?.autoencoderEncode) {
        const result = addon.autoencoderEncode(inputData, effectiveN, inputDim, W, b, hidden);
        const durationMs = performance.now() - t0;
        return {
          ok: true, source: 'gpu',
          projected: result, n: effectiveN, outDim: hidden,
          durationMs: Math.round(durationMs * 10) / 10,
          outputMeta: { op: 'autoencoderEncodeGPU', gpuUsed: true, inputRows: effectiveN, inputDim, outputDim: hidden },
        };
      }
    } catch (err) {
      const msg = (err instanceof Error) ? err.message : String(err);
      console.warn('[topology-projection] autoencoderEncode GPU failed, falling back to CPU:', msg);
    }
  }

  // CPU fallback
  const projected = cpuAutoencoderEncode(inputData, effectiveN, inputDim, W, b, hidden);
  const durationMs = performance.now() - t0;
  return {
    ok: true, source: 'cpu-fallback',
    projected, n: effectiveN, outDim: hidden,
    durationMs: Math.round(durationMs * 10) / 10,
    outputMeta: { op: 'autoencoderEncodeGPU', gpuUsed: false, inputRows: effectiveN, inputDim, outputDim: hidden },
  };
}

/**
 * Convenience: project embeddings to 4D for manifold4 backfill.
 * Uses PCA with zero-mean (pass a pre-computed mean, or zeros).
 */
export async function projectTo4D(
  embeddings: number[][],
  components: Float32Array,
  mean?: Float32Array
): Promise<ProjectionResult> {
  const n = embeddings.length;
  const dim = embeddings[0]?.length ?? 0;
  if (n === 0 || dim === 0) {
    return {
      ok: false, source: 'cpu-fallback', projected: new Float32Array(0),
      n: 0, outDim: 4, durationMs: 0,
      outputMeta: { op: 'pcaProjectGPU', gpuUsed: false, inputRows: 0, inputDim: 0, outputDim: 4 },
    };
  }

  const flat = acquireFloat32(n * dim);
  try {
    for (let i = 0; i < n; i++) flat.set(embeddings[i], i * dim);
    const mu = mean ?? new Float32Array(dim);
    return await pcaProject(flat, mu, components, { n, dim, outDim: 4 });
  } finally {
    releaseFloat32(flat);
  }
}
