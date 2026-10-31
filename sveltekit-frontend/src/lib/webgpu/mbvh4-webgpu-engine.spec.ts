import { describe, expect, it } from 'vitest';
import {
  packRayQueries,
  batchTraverseMbvh4Cpu,
  type RayQueryInput,
} from './mbvh4-webgpu-engine.js';
import type { MBVH4NodeInput } from './mbvh4-accelerator.js';

describe('MBVH4 WebGPU Engine & Ray Batch Packer', () => {
  const courtroomNodes: MBVH4NodeInput[] = [
    {
      bminX: [1.5, -5.5, -4.0, 0],
      bmaxX: [5.5, -2.5, 4.0, 0],
      bminY: [0.0, 0.0, 0.0, 0],
      bmaxY: [4.5, 1.2, 3.0, 0],
      bminZ: [-2.5, -1.0, -8.0, 0],
      bmaxZ: [1.5, 1.0, -5.0, 0],
      childIndices: [1, ~0, ~1, -1],
      parentIndex: 0,
      validChildMask: 0b0111,
      lodTier: 1,
    },
    {
      bminX: [2.5, 1.75, 0, 0],
      bmaxX: [5.5, 4.25, 0, 0],
      bminY: [0.0, 0.75, 0, 0],
      bmaxY: [0.8, 4.25, 0, 0],
      bminZ: [-0.75, -1.6, 0, 0],
      bmaxZ: [0.75, -1.4, 0, 0],
      childIndices: [~2, ~3, -1, -1],
      parentIndex: 0,
      validChildMask: 0b0011,
      lodTier: 0,
    },
  ];

  it('packs ray queries into 32-byte std430 buffers with correct inverse directions', () => {
    const rays: RayQueryInput[] = [
      {
        origin: [0, 1, 0],
        tMin: 0.01,
        dir: [-1, 0, 0],
        tMax: 100,
      },
      {
        origin: [0, 2, 0],
        tMin: 0.1,
        dir: [1, 0, 0],
        tMax: 50,
      },
    ];

    const packed = packRayQueries(rays);
    expect(packed.length).toBe(16); // 2 rays * 8 floats = 16 floats = 64 bytes

    // Ray 0: origin [0, 1, 0], tMin 0.01, invDir [-1, 1e30, 1e30], tMax 100
    expect(packed[0]).toBe(0);
    expect(packed[1]).toBe(1);
    expect(packed[2]).toBe(0);
    expect(packed[3]).toBeCloseTo(0.01);
    expect(packed[4]).toBe(-1.0);
    expect(packed[7]).toBe(100);

    // Ray 1: origin [0, 2, 0], tMin 0.1, invDir [1, 1e30, 1e30], tMax 50
    expect(packed[8]).toBe(0);
    expect(packed[9]).toBe(2);
    expect(packed[10]).toBe(0);
    expect(packed[11]).toBeCloseTo(0.1);
    expect(packed[12]).toBe(1.0);
    expect(packed[15]).toBe(50);
  });

  it('correctly traverses batch rays to leaves and resolves LOD tiers', () => {
    const rays: RayQueryInput[] = [
      // Ray 0: Points at defense table (leaf ~0)
      {
        origin: [0, 0.5, 0],
        tMin: 0.1,
        dir: [-1, 0, 0],
        tMax: 50,
      },
      // Ray 1: Points at prosecution table (leaf ~2)
      {
        origin: [0, 0.5, 0],
        tMin: 0.1,
        dir: [1, 0, 0],
        tMax: 50,
      },
      // Ray 2: Misses courtroom bounds
      {
        origin: [0, 50, 0],
        tMin: 0.1,
        dir: [0, 1, 0],
        tMax: 100,
      },
    ];

    const results = batchTraverseMbvh4Cpu(courtroomNodes, rays);
    expect(results.length).toBe(3);

    // Ray 0 hits leaf 0 (defense table)
    expect(results[0].hitLeafId).toBe(0);
    expect(results[0].promotedLodTier).toBe(1);
    expect(results[0].closestT).toBeGreaterThan(0);

    // Ray 1 hits leaf 2 (prosecution table)
    expect(results[1].hitLeafId).toBe(2);
    expect(results[1].promotedLodTier).toBe(0);
    expect(results[1].closestT).toBeGreaterThan(0);

    // Ray 2 misses
    expect(results[2].hitLeafId).toBe(-1);
  });
});
