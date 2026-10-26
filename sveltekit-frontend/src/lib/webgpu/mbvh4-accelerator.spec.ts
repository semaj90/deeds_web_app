import { describe, expect, it } from 'vitest';
import {
  MBVH4_NODE_STRIDE_BYTES,
  packMbvh4Nodes,
  traverseMbvh4Stackless,
  type MBVH4NodeInput,
  type Vec3,
} from './mbvh4-accelerator.js';
import {
  traverseKarpathyManifoldStackless,
  type MBVH4ManifoldNode64D,
} from '$lib/server/indexer/karpathy-dag-subhelpers.js';

describe('MBVH4 128-byte SoA Packer & Stackless Bitmask Traversal', () => {
  // 2-level courtroom hierarchy:
  // Root (node 0) has 3 valid children:
  //   lane 0 -> internal node 1 (prosecution + evidence stand)
  //   lane 1 -> leaf ~0 (defense table at x in [-5.5, -2.5])
  //   lane 2 -> leaf ~1 (judge bench at z in [-8.0, -5.0])
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
      // Internal node 1 (parent = 0):
      //   lane 0 -> leaf ~2 (prosecution table at x in [2.5, 5.5], z in [-0.75, 0.75])
      //   lane 1 -> leaf ~3 (evidence stand at x in [1.75, 4.25], y in [0.75, 4.25], z in [-1.6, -1.4])
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

  it('packs each MBVH4Node into exactly 128 bytes (two 64-byte GPU cache lines)', () => {
    const buf = packMbvh4Nodes(courtroomNodes);
    expect(buf.byteLength).toBe(courtroomNodes.length * MBVH4_NODE_STRIDE_BYTES);
    const i32 = new Int32Array(buf);
    const u32 = new Uint32Array(buf);
    // Node 0 child_indices at words 24..27
    expect(i32[24]).toBe(1);
    expect(i32[25]).toBe(~0);
    expect(i32[26]).toBe(~1);
    // Node 0 validChildMask at word 29
    expect(u32[29]).toBe(0b0111);
  });

  it('traverses stacklessly using a single 32-bit nibble bitstack and hits the nearest courtroom leaf', () => {
    // Ray aimed through prosecution table (z = 0, y = 0.4) toward evidence stand (z = -1.5):
    // Prosecution table (~2) is closer (t = 4.25) than evidence stand (~3, t = 6.4)
    const origin: Vec3 = [3.5, 0.4, 5.0];
    const dir: Vec3 = [0, 0, -1];
    const hit = traverseMbvh4Stackless(courtroomNodes, origin, dir, 0, 100);
    expect(hit.hitLeafId).toBe(2);
    expect(hit.closestT).toBeCloseTo(4.25, 5);
    expect(hit.promotedLodTier).toBe(0);
  });

  it('backtracks via parent pointers when a nearer leaf is in a sibling subtree', () => {
    // Ray aimed directly at evidence stand top half (y = 2.5, misses prosecution table y in [0, 0.8])
    const origin: Vec3 = [3.0, 2.5, 5.0];
    const dir: Vec3 = [0, 0, -1];
    const hit = traverseMbvh4Stackless(courtroomNodes, origin, dir, 0, 100);
    expect(hit.hitLeafId).toBe(3);
    expect(hit.closestT).toBeCloseTo(6.4, 5);
    expect(hit.promotedLodTier).toBe(0);
  });

  it('traverses Phase 14 4-Wide 64-D TurboVec manifold nodes stacklessly and promotes LOD tiers', () => {
    const makeBasis64 = (axis: number): Float32Array => {
      const v = new Float32Array(64);
      v[axis] = 1.0;
      return v;
    };

    const manifoldTree: MBVH4ManifoldNode64D[] = [
      {
        centroids64D: [makeBasis64(0), makeBasis64(1), makeBasis64(2), makeBasis64(3)],
        radii: [0.5, 0.5, 0.5, 0.5],
        childIndices: [1, ~10, ~11, -1],
        parentIndex: 0,
        validChildMask: 0b0111,
        lodTier: 1,
      },
      {
        centroids64D: [makeBasis64(0), makeBasis64(4), makeBasis64(5), makeBasis64(6)],
        radii: [0.25, 0.25, 0.25, 0.25],
        childIndices: [~20, ~21, -1, -1],
        parentIndex: 0,
        validChildMask: 0b0011,
        lodTier: 2,
      },
    ];

    const query = makeBasis64(0);
    const res = traverseKarpathyManifoldStackless(manifoldTree, query);
    expect(res.bestClusterId).toBe(20);
    expect(res.minCosineDistance).toBeCloseTo(0, 6);
    expect(res.promotedLodTier).toBe(4); // cosineDistance <= 0.15 promotes to LOD 4 (exact UTF-8 source spans)
  });
});
