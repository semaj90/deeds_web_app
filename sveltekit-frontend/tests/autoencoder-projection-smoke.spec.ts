// @vitest-environment node
/**
 * GPU autoencoder + PCA projection smoke tests.
 *
 * Covers:
 *   ✓ encode returns n × hidden shape
 *   ✓ decode returns n × outputDim shape
 *   ✓ projectPCA returns n × k shape with finite values
 *   ✓ CPU fallback active in test environment (no native addon)
 *   ✓ P0: clusterEmbeddings k-clamp (k > n → clamped, no empty clusters)
 *   ✓ P0: clusterEmbeddings assignments within [0, k)
 *   ✓ P1: graphSimilarity rejects n > 2048 with RangeError
 *   ✓ P1: graphSimilarity accepts n = 0 (empty → safe return)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ── autoencoder-bridge (CPU path — addon not present in test env) ─────────────

let encode: typeof import('../src/lib/server/gpu/autoencoder-bridge.js').encode;
let decode: typeof import('../src/lib/server/gpu/autoencoder-bridge.js').decode;
let projectPCA: typeof import('../src/lib/server/gpu/autoencoder-bridge.js').projectPCA;
let isGpuAvailable: typeof import('../src/lib/server/gpu/autoencoder-bridge.js').isGpuAvailable;

beforeEach(async () => {
  ({ encode, decode, projectPCA, isGpuAvailable } =
    await import('../src/lib/server/gpu/autoencoder-bridge.js'));
});

/** Build a weight matrix that approximates an identity mapping (first k rows = I) */
function identityWeights(rows: number, cols: number): Float32Array {
  const W = new Float32Array(rows * cols);
  for (let r = 0; r < Math.min(rows, cols); r++) W[r * cols + r] = 1;
  return W;
}

describe('autoencoder-bridge — shape contracts', () => {
  const n = 4, inputDim = 8, hidden = 4, outputDim = 8;

  it('encode returns n × hidden Float32Array', () => {
    const input = new Float32Array(n * inputDim).fill(0.5);
    const W = identityWeights(hidden, inputDim);
    const b = new Float32Array(hidden);
    const out = encode(input, n, inputDim, W, b, hidden);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(n * hidden);
  });

  it('decode returns n × outputDim Float32Array', () => {
    const encoded = new Float32Array(n * hidden).fill(0.1);
    const W = identityWeights(outputDim, hidden);
    const b = new Float32Array(outputDim);
    const out = decode(encoded, n, hidden, W, b, outputDim);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(n * outputDim);
  });

  it('projectPCA returns n × k Float32Array', () => {
    const k = 3;
    const data = new Float32Array(n * inputDim).map((_, i) => i * 0.1);
    const mean = new Float32Array(inputDim);
    const components = identityWeights(k, inputDim);
    const out = projectPCA(data, n, inputDim, mean, components, k);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(n * k);
  });

  it('projectPCA values are all finite (no silent NaN)', () => {
    const k = 2;
    const data = new Float32Array(n * inputDim).fill(1.0);
    const mean = new Float32Array(inputDim).fill(0.5);
    const components = identityWeights(k, inputDim);
    const out = projectPCA(data, n, inputDim, mean, components, k);
    for (const v of out) expect(Number.isFinite(v)).toBe(true);
  });

  it('isGpuAvailable returns a boolean without throwing', () => {
    expect(typeof isGpuAvailable()).toBe('boolean');
  });
});

// ── libtorch-bridge — P0 empty cluster guard ──────────────────────────────────

let clusterEmbeddings: typeof import('../src/lib/server/gpu/libtorch-bridge.js').clusterEmbeddings;
let graphSimilarity: typeof import('../src/lib/server/gpu/libtorch-bridge.js').graphSimilarity;

beforeEach(async () => {
  ({ clusterEmbeddings, graphSimilarity } =
    await import('../src/lib/server/gpu/libtorch-bridge.js'));
});

describe('clusterEmbeddings — P0 empty cluster guard', () => {
  it('returns empty assignments on n=0 input', async () => {
    const result = await clusterEmbeddings([], 5);
    expect(result.assignments).toHaveLength(0);
    expect(result.k).toBe(0);
  });

  it('clamps k to n so no cluster is empty from the start', async () => {
    const embeddings = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ];
    const result = await clusterEmbeddings(embeddings, 100);
    expect(result.k).toBeLessThanOrEqual(embeddings.length);
    expect(result.assignments).toHaveLength(embeddings.length);
  });

  it('all assignments are within [0, k) — never an invalid cluster index', async () => {
    const embeddings = Array.from({ length: 12 }, (_, i) =>
      [Math.sin(i), Math.cos(i), i * 0.1, i * 0.05]
    );
    const result = await clusterEmbeddings(embeddings, 4);
    for (const a of result.assignments) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(result.k);
    }
  });
});

// ── libtorch-bridge — decodeManifold4 + reconstructionMse ────────────────────

let decodeManifold4: typeof import('../src/lib/server/gpu/libtorch-bridge.js').decodeManifold4;
let reconstructionMse: typeof import('../src/lib/server/gpu/libtorch-bridge.js').reconstructionMse;

beforeEach(async () => {
  ({ decodeManifold4, reconstructionMse } =
    await import('../src/lib/server/gpu/libtorch-bridge.js'));
});

describe('decodeManifold4 — CPU path (no native addon in test env)', () => {
  const hidden = 4, outputDim = 8;

  function makeWeights(h = hidden, o = outputDim) {
    // W = identity-like: W[i * o + i] = 1.0 (i < min(h,o))
    const W = new Float32Array(h * o);
    for (let i = 0; i < Math.min(h, o); i++) W[i * o + i] = 1;
    const b = new Float32Array(o);
    return { W, b, hidden: h, outputDim: o };
  }

  it('returns a Float32Array of length outputDim', () => {
    const enc = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const result = decodeManifold4(enc, makeWeights());
    expect(result.decoded).toBeInstanceOf(Float32Array);
    expect(result.decoded.length).toBe(outputDim);
  });

  it('source is cpu in test environment', () => {
    const enc = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const result = decodeManifold4(enc, makeWeights());
    expect(result.source).toBe('cpu');
  });

  it('with identity weight matrix, decoded[i] ≈ encoded[i] for i < hidden', () => {
    const enc = new Float32Array([1, 2, 3, 4]);
    const result = decodeManifold4(enc, makeWeights());
    for (let i = 0; i < hidden; i++) {
      expect(result.decoded[i]).toBeCloseTo(enc[i], 5);
    }
  });

  it('all decoded values are finite (no silent NaN)', () => {
    const enc = new Float32Array(hidden).fill(0.7);
    const result = decodeManifold4(enc, makeWeights());
    for (const v of result.decoded) expect(Number.isFinite(v)).toBe(true);
  });

  it('accepts number[] input as well as Float32Array', () => {
    const enc = [0.1, 0.2, 0.3, 0.4];
    expect(() => decodeManifold4(enc, makeWeights())).not.toThrow();
  });

  it('durationMs is non-negative', () => {
    const enc = new Float32Array(hidden).fill(0.1);
    const result = decodeManifold4(enc, makeWeights());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('reconstructionMse', () => {
  it('returns 0 for identical vectors', () => {
    const v = new Float32Array([1, 0, 0, 1]);
    expect(reconstructionMse(v, v)).toBeCloseTo(0);
  });

  it('returns null for empty vectors', () => {
    expect(reconstructionMse(new Float32Array(0), new Float32Array(0))).toBeNull();
  });

  it('normalize=true scales to cosine-distance range', () => {
    // For orthogonal unit vectors (cosine = 0), 1 - cosine = 1
    // MSE of [1,0,...,0] vs [0,1,...,0] over dim=2: mse = (1+1)/2 = 1
    // Normalised: mse * dim/2 = 1 * 2/2 = 1.0 ✓
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    const mse = reconstructionMse(a, b, true);
    expect(mse).toBeCloseTo(1.0, 5);
  });

  it('normalize=false returns raw MSE', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    const raw = reconstructionMse(a, b, false);
    expect(raw).toBeCloseTo(1.0, 5); // (1-0)²+(0-1)² / 2 = 1.0
  });
});

// ── libtorch-bridge — P1 graphSimilarity N-cap ────────────────────────────────

describe('graphSimilarity — P1 N-cap', () => {
  it('rejects n > 2048 with RangeError before any allocation', async () => {
    const huge = Array.from({ length: 2049 }, () => [0.1, 0.2]);
    await expect(graphSimilarity(huge)).rejects.toThrow(RangeError);
    await expect(graphSimilarity(huge)).rejects.toThrow(/2048/);
  });

  it('error message names an alternative (batchCosineSimilarity)', async () => {
    const huge = Array.from({ length: 2049 }, () => [0.1, 0.2]);
    await expect(graphSimilarity(huge)).rejects.toThrow(/batchCosineSimilarity/);
  });

  it('returns safe empty result on n=0', async () => {
    const result = await graphSimilarity([]);
    expect(result.n).toBe(0);
    expect(result.matrix).toHaveLength(0);
  });

  it('returns an n×n matrix on valid small input', async () => {
    const n = 3;
    const embeddings = Array.from({ length: n }, (_, i) => {
      const v = new Array(4).fill(0);
      v[i % 4] = 1;
      return v;
    });
    const result = await graphSimilarity(embeddings);
    expect(result.n).toBe(n);
    expect(result.matrix).toHaveLength(n);
    expect(result.matrix[0]).toHaveLength(n);
  });
});
