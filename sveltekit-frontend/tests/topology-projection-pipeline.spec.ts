// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPcaProject = vi.hoisted(() => vi.fn());
const mockAutoencoderEncode = vi.hoisted(() => vi.fn());
const mockAutoencoderEncode2Layer = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/gpu/topology-projection', () => ({
  pcaProject: mockPcaProject,
  autoencoderEncode: mockAutoencoderEncode,
  autoencoderEncode2Layer: mockAutoencoderEncode2Layer,
}));

// ── Lazy imports ──────────────────────────────────────────────────────────────

let computeMean: typeof import('../src/lib/server/topology/gpu-topology-projection.js').computeMean;
let computePCAComponents: typeof import('../src/lib/server/topology/gpu-topology-projection.js').computePCAComponents;
let normalizeManifold4: typeof import('../src/lib/server/topology/gpu-topology-projection.js').normalizeManifold4;
let runTopologyProjection: typeof import('../src/lib/server/topology/gpu-topology-projection.js').runTopologyProjection;

beforeEach(async () => {
  vi.clearAllMocks();

  // Default GPU mock: CPU fallback with identity-shaped output
  mockPcaProject.mockImplementation(
    async (data: Float32Array, _mean: Float32Array, _components: Float32Array, opts: { n: number; dim: number; outDim: number }) => {
      const { n, outDim } = opts;
      const projected = new Float32Array(n * outDim);
      // Fill with deterministic values so normalization can run
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < outDim; k++) projected[i * outDim + k] = (i + k * 0.1);
      }
      return {
        ok: true, source: 'cpu-fallback', projected,
        n, outDim, durationMs: 1,
        outputMeta: { op: 'pcaProjectGPU', gpuUsed: false, inputRows: n, inputDim: opts.dim, outputDim: outDim },
      };
    }
  );

  mockAutoencoderEncode.mockImplementation(
    async (_data: Float32Array, _W: Float32Array, _b: Float32Array, opts: { n: number; dim: number; outDim: number }) => {
      const { n, outDim } = opts;
      const projected = new Float32Array(n * outDim);
      for (let i = 0; i < n * outDim; i++) projected[i] = 0.5;
      return {
        ok: true, source: 'cpu-fallback', projected,
        n, outDim, durationMs: 1,
        outputMeta: { op: 'autoencoderEncodeGPU', gpuUsed: false, inputRows: n, inputDim: opts.dim, outputDim: outDim },
      };
    }
  );

  mockAutoencoderEncode2Layer.mockImplementation(
    async (_data: Float32Array, weights: any, opts: { n: number; dim: number }) => {
      const { n } = opts;
      const { outDim } = weights;
      const projected = new Float32Array(n * outDim);
      for (let i = 0; i < n * outDim; i++) projected[i] = (i % 2 === 0 ? 0.3 : 0.7);
      return {
        ok: true, source: 'cpu-fallback', projected,
        n, outDim, durationMs: 1,
        outputMeta: { op: 'autoencoderEncodeGPU', gpuUsed: false, inputRows: n, inputDim: opts.dim, outputDim: outDim },
      };
    }
  );

  ({
    computeMean, computePCAComponents, normalizeManifold4, runTopologyProjection,
  } = await import('../src/lib/server/topology/gpu-topology-projection.js'));
});

// ── computeMean ───────────────────────────────────────────────────────────────

describe('computeMean', () => {
  it('returns zero mean for all-zero data', () => {
    const flat = new Float32Array(3 * 4); // n=3, dim=4
    const mean = computeMean(flat, 3, 4);
    expect([...mean]).toEqual([0, 0, 0, 0]);
  });

  it('computes correct mean for known values', () => {
    // 2 points in dim=3: [1,2,3] and [3,4,5] → mean [2,3,4]
    const flat = new Float32Array([1, 2, 3, 3, 4, 5]);
    const mean = computeMean(flat, 2, 3);
    expect(mean[0]).toBeCloseTo(2);
    expect(mean[1]).toBeCloseTo(3);
    expect(mean[2]).toBeCloseTo(4);
  });
});

// ── computePCAComponents ──────────────────────────────────────────────────────

describe('computePCAComponents', () => {
  it('returns Float32Array of shape [k × dim]', () => {
    const n = 10, dim = 8, k = 4;
    const flat = new Float32Array(n * dim);
    for (let i = 0; i < flat.length; i++) flat[i] = Math.sin(i);
    const mean = computeMean(flat, n, dim);
    const comps = computePCAComponents(flat, n, dim, k, mean);
    expect(comps.length).toBe(k * dim);
  });

  it('components are approximately L2-normalised', () => {
    const n = 20, dim = 6, k = 3;
    const flat = new Float32Array(n * dim);
    for (let i = 0; i < flat.length; i++) flat[i] = Math.cos(i * 0.7);
    const mean = computeMean(flat, n, dim);
    const comps = computePCAComponents(flat, n, dim, k, mean);
    for (let c = 0; c < k; c++) {
      let norm2 = 0;
      for (let d = 0; d < dim; d++) norm2 += comps[c * dim + d] ** 2;
      expect(Math.sqrt(norm2)).toBeCloseTo(1, 1);
    }
  });

  it('handles degenerate n=1 gracefully (returns zero components)', () => {
    const flat = new Float32Array([1, 2, 3, 4]);
    const mean = computeMean(flat, 1, 4);
    const comps = computePCAComponents(flat, 1, 4, 4, mean);
    expect(comps.length).toBe(4 * 4);
    // All zeros (degenerate: no variance with single sample)
    expect([...comps].every((v) => v === 0)).toBe(true);
  });
});

// ── normalizeManifold4 ────────────────────────────────────────────────────────

describe('normalizeManifold4', () => {
  it('output coordinates are in [0, 1]', () => {
    const n = 5;
    const projected = new Float32Array([
      -2, 10, 0.5, -1,
       0,  5, 1.0,  0,
       2,  0, 1.5,  1,
      -1,  8, 0.0, -0.5,
       1,  3, 2.0,  0.5,
    ]);
    const { normalized } = normalizeManifold4(projected, n);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) {
        const v = normalized[i * 4 + k];
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('min coord maps to 0, max maps to 1', () => {
    const projected = new Float32Array([1, 0, 0, 0,  3, 0, 0, 0]);
    const { normalized, min, max } = normalizeManifold4(projected, 2);
    expect(normalized[0]).toBeCloseTo(0); // min of dim 0
    expect(normalized[4]).toBeCloseTo(1); // max of dim 0
    expect(min[0]).toBeCloseTo(1);
    expect(max[0]).toBeCloseTo(3);
  });

  it('handles constant-valued dimension (no division by zero)', () => {
    const projected = new Float32Array([5, 0, 0, 0,  5, 1, 0, 0]);
    const { normalized } = normalizeManifold4(projected, 2);
    expect(Number.isFinite(normalized[0])).toBe(true);
    expect(Number.isFinite(normalized[4])).toBe(true);
  });
});

// ── runTopologyProjection ─────────────────────────────────────────────────────

describe('runTopologyProjection', () => {
  function makeInputs(n: number, dim = 8): import('../src/lib/server/topology/gpu-topology-projection.js').EmbeddingInput[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      stableKey: `file:src/test/file${i}.ts`,
      relativePath: `src/test/file${i}.ts`,
      clusterKey: `cluster:${i % 5}`,
      tags: ['ts', 'test'],
      embedding: Array.from({ length: dim }, (__, d) => Math.sin(i * dim + d)),
    }));
  }

  it('returns ok=false for empty input', async () => {
    const result = await runTopologyProjection([]);
    expect(result.ok).toBe(false);
    expect(result.nodes).toHaveLength(0);
  });

  it('returns one node per input with manifold4 coords', async () => {
    const inputs = makeInputs(5);
    const result = await runTopologyProjection(inputs);
    expect(result.ok).toBe(true);
    expect(result.nodes).toHaveLength(5);
    for (const node of result.nodes) {
      expect(node.manifold4).toHaveLength(4);
      expect(node.manifold4.every(Number.isFinite)).toBe(true);
    }
  });

  it('manifold4 coords are in [0,1] when normalize=true (default)', async () => {
    const inputs = makeInputs(10);
    const result = await runTopologyProjection(inputs, { normalize: true });
    for (const node of result.nodes) {
      for (const v of node.manifold4) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('respects maxN cap', async () => {
    const inputs = makeInputs(20);
    const result = await runTopologyProjection(inputs, { maxN: 7 });
    expect(result.n).toBe(7);
    expect(result.nodes).toHaveLength(7);
  });

  it('preserves stableKey and relativePath on nodes', async () => {
    const inputs = makeInputs(3);
    const result = await runTopologyProjection(inputs);
    expect(result.nodes[0].stableKey).toBe('file:src/test/file0.ts');
    expect(result.nodes[2].relativePath).toBe('src/test/file2.ts');
  });

  it('uses autoencoderEncode when mode=autoencoder and weights provided', async () => {
    const inputs = makeInputs(4, 8);
    const W = new Float32Array(4 * 8); // hidden=4, inputDim=8
    const b = new Float32Array(4);
    await runTopologyProjection(inputs, {
      mode: 'autoencoder',
      autoencoderWeights: { W, b, hidden: 4 },
    });
    expect(mockAutoencoderEncode).toHaveBeenCalledOnce();
    expect(mockPcaProject).not.toHaveBeenCalled();
  });

  it('falls back to pca when mode=autoencoder but no weights', async () => {
    const inputs = makeInputs(4, 8);
    await runTopologyProjection(inputs, { mode: 'autoencoder' });
    expect(mockPcaProject).toHaveBeenCalledOnce();
    expect(mockAutoencoderEncode).not.toHaveBeenCalled();
  });

  it('audit contains correct inputDim and outputDim', async () => {
    const inputs = makeInputs(3, 16);
    const result = await runTopologyProjection(inputs);
    expect(result.audit.projection.inputDim).toBe(16);
    expect(result.audit.projection.outputDim).toBe(4);
    expect(result.audit.fitSample).toBeGreaterThan(0);
  });

  it('ok=false when all embeddings are zero-dim', async () => {
    const inputs = [{ id: 'x', stableKey: 'file:x', relativePath: 'x', embedding: [] }];
    const result = await runTopologyProjection(inputs);
    expect(result.ok).toBe(false);
  });

  it('projectionSource reflects cpu-fallback from mock', async () => {
    const inputs = makeInputs(2);
    const result = await runTopologyProjection(inputs);
    expect(result.nodes[0].projectionSource).toBe('cpu-pca');
  });

  it('uses autoencoderEncode2Layer and pcaProject chained when mode=ae2l-pca and weights provided', async () => {
    const inputs = makeInputs(4, 768);
    const W1 = new Float32Array(256 * 768);
    const b1 = new Float32Array(256);
    const W2 = new Float32Array(64 * 256);
    const b2 = new Float32Array(64);
    
    const result = await runTopologyProjection(inputs, {
      mode: 'ae2l-pca',
      autoencoderWeights2Layer: { W1, b1, W2, b2, hidden: 256, outDim: 64 },
    });
    
    expect(mockAutoencoderEncode2Layer).toHaveBeenCalledOnce();
    expect(mockPcaProject).toHaveBeenCalledOnce(); // Chained PCA projection 64 -> 4
    expect(result.ok).toBe(true);
    expect(result.nodes[0].projectionSource).toBe('cpu-ae2l-pca');
  });

  it('falls back to raw PCA when mode=ae2l-pca but no 2-layer weights', async () => {
    const inputs = makeInputs(4, 768);
    const result = await runTopologyProjection(inputs, { mode: 'ae2l-pca' });
    expect(mockPcaProject).toHaveBeenCalledOnce();
    expect(mockAutoencoderEncode2Layer).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});
