import { describe, it, expect } from 'vitest';
import { createAlignedBitsetBlob } from '$lib/server/atlas/tensors/aligned-bitset-blob-v1.js';
import {
  computeBatchJaccardCpu,
  computeBatchPopcountCpu,
  BitsetWebGpuEngine,
} from './bitset-webgpu-engine.js';

describe('BitsetWebGpuEngine & CPU Reference', () => {
  it('computes batch Jaccard similarities on CPU with exact numerical bounds', () => {
    // Query: bits [0, 1, 2]
    const query = createAlignedBitsetBlob(64, [0, 1, 2]);

    // Candidates:
    // C0: [0, 1, 2] -> identical, Jaccard = 1.0
    // C1: [3, 4, 5] -> disjoint, Jaccard = 0.0
    // C2: [2, 3, 4] -> intersection: [2] (1), union: [0, 1, 2, 3, 4] (5), Jaccard = 0.2
    // C3: [0, 1]    -> intersection: [0, 1] (2), union: [0, 1, 2] (3), Jaccard = 2/3 = 0.66667
    const c0 = createAlignedBitsetBlob(64, [0, 1, 2]);
    const c1 = createAlignedBitsetBlob(64, [3, 4, 5]);
    const c2 = createAlignedBitsetBlob(64, [2, 3, 4]);
    const c3 = createAlignedBitsetBlob(64, [0, 1]);

    const similarities = computeBatchJaccardCpu(query, [c0, c1, c2, c3]);

    expect(similarities).toHaveLength(4);
    expect(similarities[0]).toBeCloseTo(1.0, 5);
    expect(similarities[1]).toBeCloseTo(0.0, 5);
    expect(similarities[2]).toBeCloseTo(0.2, 5);
    expect(similarities[3]).toBeCloseTo(2 / 3, 5);
  });

  it('computes batch population count across multi-word bitsets', () => {
    const b0 = createAlignedBitsetBlob(500, [10, 20, 30]);
    const b1 = createAlignedBitsetBlob(500, [0, 63, 64, 127, 255]);
    const b2 = createAlignedBitsetBlob(500, []);

    const counts = computeBatchPopcountCpu([b0, b1, b2]);

    expect(counts).toHaveLength(3);
    expect(counts[0]).toBe(3);
    expect(counts[1]).toBe(5);
    expect(counts[2]).toBe(0);
  });

  it('BitsetWebGpuEngine falls back transparently to CPU when WebGPU is unavailable in Node', async () => {
    const engine = BitsetWebGpuEngine.getInstance();
    const query = createAlignedBitsetBlob(128, [1, 5, 10]);
    const candidateA = createAlignedBitsetBlob(128, [1, 5, 10]);
    const candidateB = createAlignedBitsetBlob(128, [1, 5]);

    const results = await engine.batchJaccardSimilarity(query, [candidateA, candidateB]);

    expect(results).toHaveLength(2);
    expect(results[0]).toBeCloseTo(1.0, 5);
    expect(results[1]).toBeCloseTo(2 / 3, 5);
  });

  it('handles empty candidate arrays gracefully', async () => {
    const engine = BitsetWebGpuEngine.getInstance();
    const query = createAlignedBitsetBlob(64, [1]);
    const results = await engine.batchJaccardSimilarity(query, []);
    expect(results).toHaveLength(0);
  });
});
