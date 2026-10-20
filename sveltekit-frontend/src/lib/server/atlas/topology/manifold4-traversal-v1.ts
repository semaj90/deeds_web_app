/**
 * 4D Topology Manifold Multi-Hop Traversal (v1)
 *
 * Implements multi-hop graph expansion prioritized by 4D manifold coordinates:
 *   x, y  - 2D SOM BMU / semantic neighborhood coordinates
 *   z     - Cosine distance to cluster centroid (semantic depth)
 *   w     - Policy-adjusted GRPO reward / quality score
 *
 * Safety & Invariants:
 * - Read-only traversal; performs zero store writes (writesPerformed: false).
 * - Adheres strictly to AGENTS.md: canonicalAuthority = false, challenger projection.
 * - Deterministic output with cryptographic traversalDigest.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const Manifold4CoordinateSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);

export type Manifold4Coordinate = z.infer<typeof Manifold4CoordinateSchema>;

export const Manifold4NodeSchema = z.object({
  id: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  sourceRef: z.string().min(1),
  coords: Manifold4CoordinateSchema,
  gradeScore: z.number().min(0).max(1),
  featureLabel: z.string().min(1).optional(),
}).strict();

export type Manifold4Node = z.infer<typeof Manifold4NodeSchema>;

export interface Manifold4Adjacency {
  [nodeId: string]: readonly string[];
}

export interface Manifold4TraversalOptions {
  maxHops?: number;
  maxCandidates?: number;
  minGradeScore?: number;
  coordWeights?: {
    x?: number;
    y?: number;
    z?: number;
    w?: number;
  };
}

export interface Manifold4HopStep {
  hop: number;
  discoveredNodeIds: string[];
}

export interface Manifold4ExpandedCandidate {
  id: string;
  ordinal: number;
  sourceRef: string;
  coords: Manifold4Coordinate;
  hopDistance: number;
  manifoldDistance: number;
  combinedRankScore: number;
  gradeScore: number;
  featureLabel?: string;
}

export interface Manifold4MultiHopResult {
  schema: 'atlas.manifold4-multihop-traversal.v1';
  seeds: string[];
  totalDiscovered: number;
  hops: Manifold4HopStep[];
  candidates: Manifold4ExpandedCandidate[];
  traversalDigest: string;
  canonicalAuthority: false;
  writesPerformed: false;
}

/** Compute weighted 4D Euclidean distance between two manifold coordinates. */
export function computeManifold4Distance(
  a: Manifold4Coordinate,
  b: Manifold4Coordinate,
  weights: { x?: number; y?: number; z?: number; w?: number } = {}
): number {
  const wx = weights.x ?? 1.0;
  const wy = weights.y ?? 1.0;
  const wz = weights.z ?? 1.0;
  const ww = weights.w ?? 1.0;

  const dx = (a[0] - b[0]) * wx;
  const dy = (a[1] - b[1]) * wy;
  const dz = (a[2] - b[2]) * wz;
  const dw = (a[3] - b[3]) * ww;

  return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
}

/**
 * Perform bounded multi-hop traversal seeded from dense / TurboVec hits,
 * expanded along adjacency edges and prioritized by 4D manifold proximity.
 */
export function traverseManifold4MultiHop(
  seeds: readonly string[],
  nodes: ReadonlyMap<string, Manifold4Node> | Record<string, Manifold4Node>,
  adjacency: Manifold4Adjacency,
  options: Manifold4TraversalOptions = {}
): Manifold4MultiHopResult {
  const maxHops = Math.min(Math.max(options.maxHops ?? 2, 1), 16);
  const maxCandidates = Math.min(Math.max(options.maxCandidates ?? 50, 1), 500);
  const minGradeScore = options.minGradeScore ?? 0.35;
  const weights = options.coordWeights ?? {};

  const nodeMap = nodes instanceof Map ? nodes : new Map(Object.entries(nodes));

  const validSeeds = seeds.filter((s) => nodeMap.has(s));
  if (validSeeds.length === 0) {
    return {
      schema: 'atlas.manifold4-multihop-traversal.v1',
      seeds: [],
      totalDiscovered: 0,
      hops: [],
      candidates: [],
      traversalDigest: createHash('sha256').update('empty').digest('hex'),
      canonicalAuthority: false,
      writesPerformed: false,
    };
  }

  // Pre-calculate seed centroid in 4D space
  const seedCoords = validSeeds.map((s) => nodeMap.get(s)!.coords);
  const seedCentroid: Manifold4Coordinate = [
    seedCoords.reduce((acc, c) => acc + c[0], 0) / seedCoords.length,
    seedCoords.reduce((acc, c) => acc + c[1], 0) / seedCoords.length,
    seedCoords.reduce((acc, c) => acc + c[2], 0) / seedCoords.length,
    seedCoords.reduce((acc, c) => acc + c[3], 0) / seedCoords.length,
  ];

  const visited = new Set<string>(validSeeds);
  const hopRecords: Manifold4HopStep[] = [];
  let currentFrontier = new Set<string>(validSeeds);

  // Track discovery details per node: nodeId -> { hop, manifoldDist }
  const discoveryMap = new Map<string, { hop: number; manifoldDist: number }>();

  // Initialize seeds at hop 0
  for (const s of validSeeds) {
    const node = nodeMap.get(s)!;
    const dist = computeManifold4Distance(node.coords, seedCentroid, weights);
    discoveryMap.set(s, { hop: 0, manifoldDist: dist });
  }

  for (let hop = 1; hop <= maxHops; hop++) {
    const nextFrontier = new Set<string>();
    const hopDiscovered: string[] = [];

    for (const currentId of currentFrontier) {
      const neighbors = adjacency[currentId] ?? [];
      for (const nbrId of neighbors) {
        if (visited.has(nbrId)) continue;

        const nbrNode = nodeMap.get(nbrId);
        if (!nbrNode) continue;
        if (nbrNode.gradeScore < minGradeScore) continue;

        visited.add(nbrId);
        nextFrontier.add(nbrId);
        hopDiscovered.push(nbrId);

        const dist = computeManifold4Distance(nbrNode.coords, seedCentroid, weights);
        discoveryMap.set(nbrId, { hop, manifoldDist: dist });

        if (visited.size >= maxCandidates) break;
      }
      if (visited.size >= maxCandidates) break;
    }

    if (hopDiscovered.length > 0) {
      hopRecords.push({ hop, discoveredNodeIds: hopDiscovered });
    }

    if (nextFrontier.size === 0 || visited.size >= maxCandidates) break;
    currentFrontier = nextFrontier;
  }

  // Build ranked candidates
  const candidates: Manifold4ExpandedCandidate[] = [];
  for (const id of visited) {
    const node = nodeMap.get(id);
    const meta = discoveryMap.get(id);
    if (!node || !meta) continue;

    // Combined score: high reward (w), low manifold distance, low hop count
    // Score in [0, 1]: reward * 0.5 + (1 / (1 + manifoldDist)) * 0.3 + (1 / (1 + hop)) * 0.2
    const distFactor = 1 / (1 + meta.manifoldDist);
    const hopFactor = 1 / (1 + meta.hop);
    const combinedScore = node.gradeScore * 0.5 + distFactor * 0.3 + hopFactor * 0.2;

    candidates.push({
      id: node.id,
      ordinal: node.ordinal,
      sourceRef: node.sourceRef,
      coords: node.coords,
      hopDistance: meta.hop,
      manifoldDistance: roundTo(meta.manifoldDist, 4),
      combinedRankScore: roundTo(combinedScore, 4),
      gradeScore: roundTo(node.gradeScore, 4),
      featureLabel: node.featureLabel,
    });
  }

  // Sort candidates by combined rank score descending
  candidates.sort((a, b) => b.combinedRankScore - a.combinedRankScore);

  // Compute traversal cryptographic digest
  const digestPayload = candidates.map((c) => `${c.id}:${c.hopDistance}:${c.combinedRankScore}`).join('|');
  const traversalDigest = createHash('sha256').update(digestPayload).digest('hex');

  return {
    schema: 'atlas.manifold4-multihop-traversal.v1',
    seeds: validSeeds,
    totalDiscovered: candidates.length,
    hops: hopRecords,
    candidates: candidates.slice(0, maxCandidates),
    traversalDigest,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
