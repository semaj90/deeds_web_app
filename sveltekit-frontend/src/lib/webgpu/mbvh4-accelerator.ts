/**
 * 4-Wide Quad BVH (QBVH / MBVH4) Struct-of-Arrays (SoA) Accelerator
 * & Stackless Nibble-Bitmask Traversal Reference.
 *
 * Bridges:
 *  1. `courtroom-scene.svelte.ts` — 3D courtroom evidence stand & character ray-picking / frustum culling
 *  2. `N64TextureLODSystem.ts`    — 4KB page LOD tier promotion based on ray intersection distance
 *  3. `shaders/mbvh4_traversal.wgsl` — 128-byte (2 x 64B GPU cache line) storage buffer packer
 */

export const MBVH4_NODE_STRIDE_BYTES = 128 as const;
export const MBVH4_NODE_WORDS_32 = 32 as const;

export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];

export interface MBVH4NodeInput {
  bminX: Vec4;
  bmaxX: Vec4;
  bminY: Vec4;
  bmaxY: Vec4;
  bminZ: Vec4;
  bmaxZ: Vec4;
  /** `< 0` encodes leaf/primitive index as `~leafId`; `>= 0` encodes internal node index */
  childIndices: readonly [number, number, number, number];
  /** Parent node index (`0` for root) */
  parentIndex: number;
  /** 4-bit active child mask (`0b0001`..`0b1111`) */
  validChildMask: number;
  /** N64 Texture LOD tier (`0` = highest resolution .. `3` = lowest 4KB LOD) */
  lodTier: number;
  /** Reserved bitmask metadata flags */
  flags?: number;
}

export interface HitMask4 {
  /** 4-bit bitmask (`bits 0..3`) of hit children */
  mask: number;
  /** Distance `t_enter` for each of the 4 child lanes */
  tEnter: [number, number, number, number];
}

export interface Mbvh4TraversalResult {
  hitLeafId: number;
  closestT: number;
  promotedLodTier: number;
  nodesVisited: number;
  allHitLeaves: number[];
}

/**
 * WGSL `firstTrailingBit(x)` equivalent for non-zero 32-bit unsigned integers (0..31).
 */
export function firstTrailingBitU32(x: number): number {
  const u = x >>> 0;
  if (u === 0) return 32;
  return 31 - Math.clz32(u & -u);
}

/**
 * WGSL `firstLeadingBit(x)` equivalent for non-zero 32-bit unsigned integers (0..31).
 */
export function firstLeadingBitU32(x: number): number {
  const u = x >>> 0;
  if (u === 0) return 32;
  return 31 - Math.clz32(u);
}

/**
 * Packs an array of `MBVH4NodeInput` nodes into a contiguous 128-byte-aligned `ArrayBuffer`
 * matching `struct MBVH4Node` in `shaders/mbvh4_traversal.wgsl`.
 */
export function packMbvh4Nodes(nodes: readonly MBVH4NodeInput[]): ArrayBuffer {
  const buffer = new ArrayBuffer(nodes.length * MBVH4_NODE_STRIDE_BYTES);
  const f32 = new Float32Array(buffer);
  const i32 = new Int32Array(buffer);
  const u32 = new Uint32Array(buffer);

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const base = i * MBVH4_NODE_WORDS_32;

    // 6 x vec4<f32> = 24 floats (96 bytes)
    f32.set(n.bminX, base + 0);
    f32.set(n.bmaxX, base + 4);
    f32.set(n.bminY, base + 8);
    f32.set(n.bmaxY, base + 12);
    f32.set(n.bminZ, base + 16);
    f32.set(n.bmaxZ, base + 20);

    // child_indices: vec4<i32> (16 bytes)
    i32[base + 24] = n.childIndices[0];
    i32[base + 25] = n.childIndices[1];
    i32[base + 26] = n.childIndices[2];
    i32[base + 27] = n.childIndices[3];

    // meta: vec4<u32> (16 bytes)
    u32[base + 28] = n.parentIndex >>> 0;
    u32[base + 29] = (n.validChildMask & 0x0f) >>> 0;
    u32[base + 30] = n.lodTier >>> 0;
    u32[base + 31] = (n.flags ?? 0) >>> 0;
  }

  return buffer;
}

/**
 * Vectorized 4-Wide Slab Intersection test (exact CPU counterpart to `intersect_mbvh4_node` in WGSL).
 */
export function intersectMbvh4Node(
  node: MBVH4NodeInput,
  rayOrigin: Vec3,
  rayInvDir: Vec3,
  tMin: number,
  tMax: number
): HitMask4 {
  const tEnter: [number, number, number, number] = [0, 0, 0, 0];
  let rawMask = 0;

  for (let lane = 0; lane < 4; lane++) {
    const tx0 = (node.bminX[lane]! - rayOrigin[0]) * rayInvDir[0];
    const tx1 = (node.bmaxX[lane]! - rayOrigin[0]) * rayInvDir[0];
    const ty0 = (node.bminY[lane]! - rayOrigin[1]) * rayInvDir[1];
    const ty1 = (node.bmaxY[lane]! - rayOrigin[1]) * rayInvDir[1];
    const tz0 = (node.bminZ[lane]! - rayOrigin[2]) * rayInvDir[2];
    const tz1 = (node.bmaxZ[lane]! - rayOrigin[2]) * rayInvDir[2];

    const enter = Math.max(
      Math.min(tx0, tx1),
      Math.min(ty0, ty1),
      Math.min(tz0, tz1),
      tMin
    );
    const exit = Math.min(
      Math.max(tx0, tx1),
      Math.max(ty0, ty1),
      Math.max(tz0, tz1),
      tMax
    );

    tEnter[lane] = enter;
    if (enter <= exit) {
      rawMask |= 1 << lane;
    }
  }

  return {
    mask: (rawMask & (node.validChildMask & 0x0f)) >>> 0,
    tEnter,
  };
}

/**
 * Stackless 4-bit Nibble-Bitmask Traversal (`bitstack: u32`) over an `MBVH4NodeInput[]` hierarchy.
 * Uses zero per-ray array stack allocations.
 */
export function traverseMbvh4Stackless(
  nodes: readonly MBVH4NodeInput[],
  rayOrigin: Vec3,
  rayDir: Vec3,
  tMin = 0,
  tMax = Number.POSITIVE_INFINITY
): Mbvh4TraversalResult {
  if (nodes.length === 0) {
    return {
      hitLeafId: -1,
      closestT: tMax,
      promotedLodTier: 3,
      nodesVisited: 0,
      allHitLeaves: [],
    };
  }

  const rayInvDir: Vec3 = [
    1 / (Math.abs(rayDir[0]) < 1e-12 ? (rayDir[0] >= 0 ? 1e-12 : -1e-12) : rayDir[0]),
    1 / (Math.abs(rayDir[1]) < 1e-12 ? (rayDir[1] >= 0 ? 1e-12 : -1e-12) : rayDir[1]),
    1 / (Math.abs(rayDir[2]) < 1e-12 ? (rayDir[2] >= 0 ? 1e-12 : -1e-12) : rayDir[2]),
  ];

  let closestT = tMax;
  let bestLeafId = -1;
  let bestLodTier = 3;
  let nodesVisited = 0;
  const allHitLeaves: number[] = [];

  let depth = 0;
  let bitstack = 0 >>> 0;
  let nodeIdx = 0;

  while (true) {
    nodesVisited++;
    const node = nodes[nodeIdx]!;
    const hit = intersectMbvh4Node(node, rayOrigin, rayInvDir, tMin, closestT);

    if (hit.mask !== 0) {
      const firstChildLane = firstTrailingBitU32(hit.mask);
      const remainingSiblings = (hit.mask & (hit.mask - 1)) >>> 0;

      const levelShift = depth * 4;
      bitstack =
        ((bitstack & ~(0x0f << levelShift)) | (remainingSiblings << levelShift)) >>> 0;

      const nextId = node.childIndices[firstChildLane]!;
      if (nextId >= 0) {
        nodeIdx = nextId;
        depth++;
        continue;
      } else {
        const leafId = ~nextId;
        allHitLeaves.push(leafId);
        const laneT = hit.tEnter[firstChildLane]!;
        if (laneT <= closestT) {
          closestT = laneT;
          bestLeafId = leafId;
          bestLodTier = node.lodTier;
        }
      }
    }

    // Backtrack using bitstack alone (zero array stack reads)
    let descendedToInternal = false;
    while (bitstack !== 0) {
      const highestBit = firstLeadingBitU32(bitstack);
      const targetDepth = Math.floor(highestBit / 4);

      while (depth > targetDepth) {
        nodeIdx = nodes[nodeIdx]!.parentIndex;
        depth--;
      }

      const levelShift = depth * 4;
      const levelMask = (bitstack >>> levelShift) & 0x0f;
      const siblingLane = firstTrailingBitU32(levelMask);

      const clearedLevelMask = levelMask & (levelMask - 1);
      bitstack =
        ((bitstack & ~(0x0f << levelShift)) | (clearedLevelMask << levelShift)) >>> 0;

      const parentNode = nodes[nodeIdx]!;
      const siblingId = parentNode.childIndices[siblingLane]!;
      if (siblingId >= 0) {
        nodeIdx = siblingId;
        depth++;
        descendedToInternal = true;
        break;
      } else {
        const siblingHit = intersectMbvh4Node(parentNode, rayOrigin, rayInvDir, tMin, closestT);
        if ((siblingHit.mask & (1 << siblingLane)) !== 0) {
          const leafId = ~siblingId;
          allHitLeaves.push(leafId);
          const laneT = siblingHit.tEnter[siblingLane]!;
          if (laneT <= closestT) {
            closestT = laneT;
            bestLeafId = leafId;
            bestLodTier = parentNode.lodTier;
          }
        }
      }
    }

    if (!descendedToInternal && bitstack === 0) {
      break;
    }
  }

  return {
    hitLeafId: bestLeafId,
    closestT,
    promotedLodTier: bestLodTier,
    nodesVisited,
    allHitLeaves,
  };
}
