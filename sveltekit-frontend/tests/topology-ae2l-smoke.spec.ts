// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runTopologyProjection } from '../src/lib/server/topology/gpu-topology-projection.js';
import type { EmbeddingInput } from '../src/lib/server/topology/gpu-topology-projection.js';

describe('Phase 10A Topology Projection ae2l-pca Smoke Test (Real Chained Execution)', () => {
  function generateMockEmbeddings(n: number, dim = 768): EmbeddingInput[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      stableKey: `file:src/test/file${i}.ts`,
      relativePath: `src/test/file${i}.ts`,
      clusterKey: `cluster:${i % 5}`,
      tags: ['ts', 'test'],
      embedding: Array.from({ length: dim }, (__, d) => {
        // Deterministic sine wave values to simulate real embeddings
        return Math.sin(i * dim + d) * 0.1;
      }),
    }));
  }

  it('runs the real 2-layer autoencoder chained with PCA (ae2l-pca) end-to-end', async () => {
    const inputs = generateMockEmbeddings(10, 768);

    // Initialize real deterministic weights for the canonical 2-layer model (768 -> 256 -> 64)
    const W1 = new Float32Array(256 * 768);
    const b1 = new Float32Array(256);
    const W2 = new Float32Array(64 * 256);
    const b2 = new Float32Array(64);

    // Fill weights with deterministic test values
    for (let i = 0; i < W1.length; i++) W1[i] = Math.sin(i) * 0.01;
    for (let i = 0; i < W2.length; i++) W2[i] = Math.cos(i) * 0.01;
    b1.fill(0.01);
    b2.fill(0.02);

    const result = await runTopologyProjection(inputs, {
      mode: 'ae2l-pca',
      normalize: true,
      autoencoderWeights2Layer: { W1, b1, W2, b2, hidden: 256, outDim: 64 },
    });

    console.log('--- ae2l-pca Chained Projection Result ---');
    console.log('Success:', result.ok);
    console.log('Projected Nodes Count:', result.nodes.length);
    console.log('Pipeline Duration (ms):', result.durationMs);
    console.log('Audit Source:', result.audit.projection.source);
    console.log('Audit Backend:', result.audit.projection.backend);
    console.log('-------------------------------------------');

    expect(result.ok).toBe(true);
    expect(result.nodes).toHaveLength(10);
    expect(result.audit.projection.source).toContain('ae2l-pca');
    expect(result.audit.projection.inputDim).toBe(768);
    expect(result.audit.projection.outputDim).toBe(4);

    // Verify coordinates are fully normalized inside [0, 1]
    for (const node of result.nodes) {
      expect(node.manifold4).toHaveLength(4);
      for (const coord of node.manifold4) {
        expect(coord).toBeGreaterThanOrEqual(0);
        expect(coord).toBeLessThanOrEqual(1);
        expect(Number.isFinite(coord)).toBe(true);
      }
    }
  });

  it('falls back gracefully to raw PCA when no 2-layer weights are supplied', async () => {
    const inputs = generateMockEmbeddings(5, 768);

    const result = await runTopologyProjection(inputs, {
      mode: 'ae2l-pca',
      normalize: true,
    });

    expect(result.ok).toBe(true);
    expect(result.nodes).toHaveLength(5);
    expect(result.audit.projection.source).toBe('cpu-pca'); // Gracefully degraded to PCA fallback
    expect(result.audit.projection.inputDim).toBe(768);
    expect(result.audit.projection.outputDim).toBe(4);
  });
});
