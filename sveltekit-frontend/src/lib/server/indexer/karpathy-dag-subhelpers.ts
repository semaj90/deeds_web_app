import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SEMANTIC_TAGS, type SemanticTag } from './gpu-karpathy-tagger.js';

/**
 * KarpathyDagHitSchema
 * 
 * Bounded schema representing a cached DAG hit returned during dense agentic indexing.
 * Enforces provenance, revision qualification, and non-authoritative bounds.
 */
export const KarpathyDagHitSchema = z.object({
  nodeId: z.string().min(1),
  filePath: z.string().min(1),
  semanticTag: z.enum(SEMANTIC_TAGS),
  similarityScore: z.number().min(0).max(1),
  sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  dagLevel: z.enum(['FILE', 'SYMBOL', 'CLUSTER', 'FUSED_TOPOLOGY']),
  dependencies: z.array(z.string().min(1)),
  dependents: z.array(z.string().min(1)),
  cacheKey: z.string().regex(/^dag:karpathy:[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
}).strict();

export type KarpathyDagHit = z.infer<typeof KarpathyDagHitSchema>;

export interface DenseSearchQueryInput {
  query: string;
  sourceFiles: readonly string[];
  currentSourceRevisions: Readonly<Record<string, string>>; // filePath -> sha256
  topK?: number;
  minSimilarity?: number;
}

/**
 * Pure helper calculating deterministic DAG cache keys based on source revisions and semantic tag.
 */
export function buildKarpathyDagCacheKey(
  filePath: string,
  sourceRevision: string,
  tag: SemanticTag
): string {
  const hash = createHash('sha256')
    .update(`${filePath}:${sourceRevision}:${tag}`)
    .digest('hex');
  return `dag:karpathy:${hash}`;
}

/**
 * Filters and validates cached DAG hits against current source revisions to prevent stale index consumption.
 */
export function resolveValidDagHits(
  cachedHits: readonly KarpathyDagHit[],
  currentSourceRevisions: Readonly<Record<string, string>>
): KarpathyDagHit[] {
  return cachedHits.filter((hit) => {
    const currentRev = currentSourceRevisions[hit.filePath];
    return currentRev !== undefined && currentRev === hit.sourceRevision;
  });
}

/**
 * Ranks candidate DAG hits by combining semantic similarity and topological connectivity.
 * Fused Score = 0.5 * similarity + 0.3 * normalized_dependents + 0.2 * normalized_dependencies
 */
export function rankDenseDagHits(
  hits: readonly KarpathyDagHit[],
  topK = 5
): KarpathyDagHit[] {
  const scored = hits.map((hit) => {
    const depScore = Math.min(1.0, hit.dependencies.length / 10);
    const dependentsScore = Math.min(1.0, hit.dependents.length / 10);
    const fusedScore = (0.5 * (hit.similarityScore ?? (hit as unknown as { similarity?: number }).similarity ?? 0)) + 0.3 * dependentsScore + 0.2 * depScore;
    return { hit, fusedScore };
  });

  scored.sort((a, b) => b.fusedScore - a.fusedScore);
  return scored.slice(0, Math.max(1, topK)).map((s) => s.hit);
}

// ── Phase 14 "Query Viewpoint" 4-Wide Manifold Hierarchy (MBVH4 64-D TurboVec) ──

export type ContextResidencyLodTier = 0 | 1 | 2 | 3 | 4;

/**
 * 4-Wide Topological Cluster Node in the 64-D TurboVec Manifold.
 * Packs 4 child cluster bounding spheres (`centroids64D[0..3]`, `radii[0..3]`) into a single
 * wide node so a multi-intent query vector tests 4 cluster envelopes simultaneously before
 * hydrating LOD 2 (768-D EmbeddingGemma) or LOD 4 (exact UTF-8 source spans).
 */
export interface MBVH4ManifoldNode64D {
  centroids64D: readonly [Float32Array, Float32Array, Float32Array, Float32Array];
  /** Angular/cosine distance radius in `[0, 2]` (`1 - cosineSimilarity <= radii[lane]`) */
  radii: readonly [number, number, number, number];
  /** `< 0` encodes leaf cluster ordinal as `~clusterId`; `>= 0` encodes internal wide node index */
  childIndices: readonly [number, number, number, number];
  parentIndex: number;
  /** 4-bit active child mask (`0b0001`..`0b1111`) */
  validChildMask: number;
  /** Context residency LOD tier (`0` = 64-D manifold .. `2` = 768-D dense .. `4` = exact UTF-8 span) */
  lodTier: ContextResidencyLodTier;
}

export interface ManifoldHitMask4 {
  mask: number;
  cosineDistances: [number, number, number, number];
}

export interface ManifoldStacklessTraversalResult {
  admittedClusterIds: number[];
  bestClusterId: number;
  minCosineDistance: number;
  promotedLodTier: ContextResidencyLodTier;
  wideNodesVisited: number;
}

function firstTrailingBit32(x: number): number {
  const u = x >>> 0;
  if (u === 0) return 32;
  return 31 - Math.clz32(u & -u);
}

function firstLeadingBit32(x: number): number {
  const u = x >>> 0;
  if (u === 0) return 32;
  return 31 - Math.clz32(u);
}

function cosineDistance64D(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length, 64);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const va = a[i]!;
    const vb = b[i]!;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-12) return 1.0;
  const sim = Math.max(-1, Math.min(1, dot / denom));
  return 1.0 - sim;
}

/**
 * Evaluates a 64-D query vector against all 4 child cluster bounding spheres in one 4-wide step.
 */
export function intersectManifoldNode4Wide(
  node: MBVH4ManifoldNode64D,
  queryVec64D: Float32Array
): ManifoldHitMask4 {
  const cosineDistances: [number, number, number, number] = [2, 2, 2, 2];
  let rawMask = 0;

  for (let lane = 0; lane < 4; lane++) {
    if (((node.validChildMask >>> lane) & 1) === 0) continue;
    const dist = cosineDistance64D(queryVec64D, node.centroids64D[lane]!);
    cosineDistances[lane] = dist;
    if (dist <= node.radii[lane]!) {
      rawMask |= 1 << lane;
    }
  }

  return {
    mask: (rawMask & (node.validChildMask & 0x0f)) >>> 0,
    cosineDistances,
  };
}

/**
 * Stackless 4-bit Nibble-Bitmask (`bitstack: u32`) traversal over the 4-Wide 64-D TurboVec
 * manifold hierarchy. Requires zero per-query array stack allocation.
 */
export function traverseKarpathyManifoldStackless(
  nodes: readonly MBVH4ManifoldNode64D[],
  queryVec64D: Float32Array
): ManifoldStacklessTraversalResult {
  if (nodes.length === 0) {
    return {
      admittedClusterIds: [],
      bestClusterId: -1,
      minCosineDistance: 2.0,
      promotedLodTier: 0,
      wideNodesVisited: 0,
    };
  }

  const admittedClusterIds: number[] = [];
  let bestClusterId = -1;
  let minCosineDistance = 2.0;
  let promotedLodTier: ContextResidencyLodTier = 0;
  let wideNodesVisited = 0;

  let depth = 0;
  let bitstack = 0 >>> 0;
  let nodeIdx = 0;

  while (true) {
    wideNodesVisited++;
    const node = nodes[nodeIdx]!;
    const hit = intersectManifoldNode4Wide(node, queryVec64D);

    if (hit.mask !== 0) {
      const firstChildLane = firstTrailingBit32(hit.mask);
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
        const clusterId = ~nextId;
        admittedClusterIds.push(clusterId);
        const dist = hit.cosineDistances[firstChildLane]!;
        if (dist <= minCosineDistance) {
          minCosineDistance = dist;
          bestClusterId = clusterId;
          promotedLodTier = dist <= 0.15 ? 4 : dist <= 0.35 ? 2 : node.lodTier;
        }
      }
    }

    let descendedToInternal = false;
    while (bitstack !== 0) {
      const highestBit = firstLeadingBit32(bitstack);
      const targetDepth = Math.floor(highestBit / 4);

      while (depth > targetDepth) {
        nodeIdx = nodes[nodeIdx]!.parentIndex;
        depth--;
      }

      const levelShift = depth * 4;
      const levelMask = (bitstack >>> levelShift) & 0x0f;
      const siblingLane = firstTrailingBit32(levelMask);

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
        const siblingHit = intersectManifoldNode4Wide(parentNode, queryVec64D);
        if ((siblingHit.mask & (1 << siblingLane)) !== 0) {
          const clusterId = ~siblingId;
          admittedClusterIds.push(clusterId);
          const dist = siblingHit.cosineDistances[siblingLane]!;
          if (dist <= minCosineDistance) {
            minCosineDistance = dist;
            bestClusterId = clusterId;
            promotedLodTier = dist <= 0.15 ? 4 : dist <= 0.35 ? 2 : parentNode.lodTier;
          }
        }
      }
    }

    if (!descendedToInternal && bitstack === 0) {
      break;
    }
  }

  return {
    admittedClusterIds,
    bestClusterId,
    minCosineDistance,
    promotedLodTier,
    wideNodesVisited,
  };
}
