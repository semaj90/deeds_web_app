import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  KnnGraphEdgeV1,
  ProgressiveCandidateV1,
} from './progressive-knn-graph-contracts.js';

/**
 * Semantic KNN graph used only for bounded contextual synthesis.
 *
 * Do not project these edges into SGraph relation kinds: vector-neighbor
 * similarity is not evidence that one symbol CALLS/IMPORTS/REFERENCES another.
 */
export const KnnContextGraphV1Schema = z.object({
  schema: z.literal('atlas.knn-context-graph.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  representationId: z.string().min(1),
  representationRevision: z.string().min(1),
  metric: z.enum(['COSINE', 'L2', 'INNER_PRODUCT']),
  nodes: z.array(z.object({
    canonicalId: z.string().min(1),
    packetKey: z.string().min(1),
    sourceRevision: z.string().min(1),
  }).strict()).max(100_000),
  edges: z.array(z.object({
    sourceCanonicalId: z.string().min(1),
    targetCanonicalId: z.string().min(1),
    rank: z.number().int().positive(),
    distance: z.number().finite().nonnegative(),
    exact: z.boolean(),
  }).strict()).max(1_000_000),
  exactEdgesOnly: z.boolean(),
  producerRevision: z.string().min(1),
}).strict();
export type KnnContextGraphV1 = z.infer<typeof KnnContextGraphV1Schema>;

export const KnnAStarReceiptV1Schema = z.object({
  schema: z.literal('atlas.knn-a-star-receipt.v1'),
  requestId: z.string().min(1),
  sourceCanonicalId: z.string().min(1),
  targetCanonicalId: z.string().min(1),
  found: z.boolean(),
  pathCanonicalIds: z.array(z.string().min(1)),
  pathCost: z.number().finite().nonnegative().nullable(),
  expandedNodeCount: z.number().int().nonnegative(),
  frontierPeak: z.number().int().nonnegative(),
  maxHops: z.number().int().nonnegative(),
  heuristic: z.enum(['ZERO_EXACT', 'PROVEN_LOWER_BOUND', 'AGGRESSIVE_TIE_BREAKER']),
  optimalityClaim: z.enum(['LOWEST_NONNEGATIVE_COST', 'CONDITIONAL_ON_ADMISSIBLE_HEURISTIC', 'NONE']),
  exactTerminationAuthority: z.boolean(),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type KnnAStarReceiptV1 = z.infer<typeof KnnAStarReceiptV1Schema>;

export const KnnMultihopReceiptV1Schema = z.object({
  schema: z.literal('atlas.knn-multihop-receipt.v1'),
  requestId: z.string().min(1),
  seedCanonicalIds: z.array(z.string().min(1)).min(1),
  maxHops: z.number().int().nonnegative(),
  maxNodes: z.number().int().positive(),
  visitedCanonicalIds: z.array(z.string().min(1)),
  traversedEdgeCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type KnnMultihopReceiptV1 = z.infer<typeof KnnMultihopReceiptV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function canonicalJsonArtifact(value: unknown): { json: string; sha256: string; byteLength: number } {
  const json = canonicalJson(value);
  const bytes = Buffer.from(json, 'utf8');
  return {
    json,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  };
}

/** Deterministically dedupe exact/challenger edge rows, preferring exact and then lower distance. */
export function normalizeKnnEdges(edges: readonly KnnGraphEdgeV1[]): KnnGraphEdgeV1[] {
  const best = new Map<string, KnnGraphEdgeV1>();
  for (const edge of edges) {
    if (edge.sourceCanonicalId === edge.targetCanonicalId) continue;
    const key = `${edge.sourceCanonicalId}\0${edge.targetCanonicalId}\0${edge.metric}`;
    const prior = best.get(key);
    if (!prior
      || (edge.exact && !prior.exact)
      || (edge.exact === prior.exact && edge.distance < prior.distance)
      || (edge.exact === prior.exact && edge.distance === prior.distance && edge.rank < prior.rank)) {
      best.set(key, { ...edge });
    }
  }
  return [...best.values()].sort((a, b) =>
    a.sourceCanonicalId.localeCompare(b.sourceCanonicalId)
    || a.rank - b.rank
    || a.distance - b.distance
    || a.targetCanonicalId.localeCompare(b.targetCanonicalId)
    || Number(b.exact) - Number(a.exact));
}

export function buildKnnContextGraph(input: {
  requestId: string;
  workspaceRevision: string;
  representationId: string;
  representationRevision: string;
  metric: 'COSINE' | 'L2' | 'INNER_PRODUCT';
  candidates: readonly ProgressiveCandidateV1[];
  edges: readonly KnnGraphEdgeV1[];
  exactEdgesOnly?: boolean;
  producerRevision: string;
}): KnnContextGraphV1 {
  const byCanonical = new Map<string, ProgressiveCandidateV1>();
  for (const candidate of input.candidates) {
    const prior = byCanonical.get(candidate.canonicalId);
    if (prior && (prior.packetKey !== candidate.packetKey || prior.sourceRevision !== candidate.sourceRevision)) {
      throw new Error(`ambiguous KNN canonical identity: ${candidate.canonicalId}`);
    }
    byCanonical.set(candidate.canonicalId, candidate);
  }

  const exactEdgesOnly = input.exactEdgesOnly ?? true;
  const normalized = normalizeKnnEdges(input.edges)
    .filter((edge) => edge.metric === input.metric)
    .filter((edge) => !exactEdgesOnly || edge.exact);

  for (const edge of normalized) {
    if (!byCanonical.has(edge.sourceCanonicalId) || !byCanonical.has(edge.targetCanonicalId)) {
      throw new Error(`KNN edge references candidate outside promoted top-K: ${edge.sourceCanonicalId} -> ${edge.targetCanonicalId}`);
    }
  }

  return KnnContextGraphV1Schema.parse({
    schema: 'atlas.knn-context-graph.v1',
    requestId: input.requestId,
    workspaceRevision: input.workspaceRevision,
    representationId: input.representationId,
    representationRevision: input.representationRevision,
    metric: input.metric,
    nodes: [...byCanonical.values()]
      .map((candidate) => ({
        canonicalId: candidate.canonicalId,
        packetKey: candidate.packetKey,
        sourceRevision: candidate.sourceRevision,
      }))
      .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId)),
    edges: normalized.map((edge) => ({
      sourceCanonicalId: edge.sourceCanonicalId,
      targetCanonicalId: edge.targetCanonicalId,
      rank: edge.rank,
      distance: edge.distance,
      exact: edge.exact,
    })),
    exactEdgesOnly,
    producerRevision: input.producerRevision,
  });
}

type AdjEdge = { target: string; distance: number; rank: number };

function adjacency(graph: KnnContextGraphV1): Map<string, AdjEdge[]> {
  const out = new Map<string, AdjEdge[]>();
  for (const node of graph.nodes) out.set(node.canonicalId, []);
  for (const edge of graph.edges) out.get(edge.sourceCanonicalId)?.push({
    target: edge.targetCanonicalId,
    distance: edge.distance,
    rank: edge.rank,
  });
  for (const [source, rows] of out) {
    out.set(source, rows.sort((a, b) => a.distance - b.distance || a.rank - b.rank || a.target.localeCompare(b.target)));
  }
  return out;
}

/**
 * Exact reference A* over non-negative KNN edge costs.
 * - ZERO_EXACT is Dijkstra/UCS expressed through the A* priority g+h.
 * - PROVEN_LOWER_BOUND may terminate exactly only when caller asserts proof.
 * - aggressive scores can be used only as a secondary tie-breaker.
 */
export function searchKnnAStar(input: {
  graph: KnnContextGraphV1;
  sourceCanonicalId: string;
  targetCanonicalId: string;
  maxHops: number;
  maxExpansions: number;
  lowerBoundByCanonicalId?: Readonly<Record<string, number>>;
  lowerBoundProven?: boolean;
  aggressiveTieBreakerByCanonicalId?: Readonly<Record<string, number>>;
  producerRevision: string;
}): KnnAStarReceiptV1 {
  const graph = KnnContextGraphV1Schema.parse(input.graph);
  const nodes = new Set(graph.nodes.map((node) => node.canonicalId));
  if (!nodes.has(input.sourceCanonicalId) || !nodes.has(input.targetCanonicalId)) {
    throw new Error('KNN A* source/target must exist in the promoted context graph');
  }
  const maxHops = Math.max(0, Math.min(64, Math.trunc(input.maxHops)));
  const maxExpansions = Math.max(1, Math.trunc(input.maxExpansions));
  const lowerBoundProven = input.lowerBoundProven === true;
  if (input.lowerBoundByCanonicalId && !lowerBoundProven) {
    throw new Error('Unproven heuristic cannot be installed as the primary A* lower bound');
  }
  const out = adjacency(graph);
  const bestG = new Map<string, number>([[input.sourceCanonicalId, 0]]);
  const bestDepth = new Map<string, number>([[input.sourceCanonicalId, 0]]);
  const parent = new Map<string, string>();
  const frontier = [input.sourceCanonicalId];
  let expandedNodeCount = 0;
  let frontierPeak = 1;

  const h = (id: string): number => {
    const value = input.lowerBoundByCanonicalId?.[id] ?? 0;
    if (!Number.isFinite(value) || value < 0) throw new Error(`invalid lower-bound heuristic for ${id}`);
    return value;
  };
  const aggressive = (id: string): number => {
    const value = input.aggressiveTieBreakerByCanonicalId?.[id] ?? 0;
    return Number.isFinite(value) ? value : 0;
  };

  while (frontier.length > 0 && expandedNodeCount < maxExpansions) {
    frontier.sort((a, b) => {
      const fa = (bestG.get(a) ?? Infinity) + h(a);
      const fb = (bestG.get(b) ?? Infinity) + h(b);
      if (fa !== fb) return fa - fb;
      // Larger aggressive score wins only after the exact/admissible key ties.
      const ta = aggressive(a);
      const tb = aggressive(b);
      if (ta !== tb) return tb - ta;
      return a.localeCompare(b);
    });
    const current = frontier.shift();
    if (!current) break;
    if (current === input.targetCanonicalId) break;
    const depth = bestDepth.get(current) ?? 0;
    if (depth >= maxHops) continue;
    expandedNodeCount += 1;

    for (const edge of out.get(current) ?? []) {
      if (edge.distance < 0 || !Number.isFinite(edge.distance)) throw new Error('KNN A* requires finite non-negative edge costs');
      const nextDepth = depth + 1;
      if (nextDepth > maxHops) continue;
      const nextG = (bestG.get(current) ?? Infinity) + edge.distance;
      const priorG = bestG.get(edge.target);
      const priorDepth = bestDepth.get(edge.target) ?? Infinity;
      if (priorG === undefined || nextG < priorG - 1e-12 || (Math.abs(nextG - priorG) <= 1e-12 && nextDepth < priorDepth)) {
        bestG.set(edge.target, nextG);
        bestDepth.set(edge.target, nextDepth);
        parent.set(edge.target, current);
        if (!frontier.includes(edge.target)) frontier.push(edge.target);
      }
    }
    frontierPeak = Math.max(frontierPeak, frontier.length);
  }

  const found = bestG.has(input.targetCanonicalId) && (input.sourceCanonicalId === input.targetCanonicalId || parent.has(input.targetCanonicalId));
  const pathCanonicalIds: string[] = [];
  if (found) {
    let cursor = input.targetCanonicalId;
    pathCanonicalIds.push(cursor);
    while (cursor !== input.sourceCanonicalId) {
      const prior = parent.get(cursor);
      if (!prior) throw new Error('broken KNN A* parent chain');
      pathCanonicalIds.push(prior);
      cursor = prior;
    }
    pathCanonicalIds.reverse();
  }

  const heuristic = input.lowerBoundByCanonicalId
    ? 'PROVEN_LOWER_BOUND'
    : input.aggressiveTieBreakerByCanonicalId
      ? 'AGGRESSIVE_TIE_BREAKER'
      : 'ZERO_EXACT';

  return KnnAStarReceiptV1Schema.parse({
    schema: 'atlas.knn-a-star-receipt.v1',
    requestId: graph.requestId,
    sourceCanonicalId: input.sourceCanonicalId,
    targetCanonicalId: input.targetCanonicalId,
    found,
    pathCanonicalIds,
    pathCost: found ? bestG.get(input.targetCanonicalId) ?? 0 : null,
    expandedNodeCount,
    frontierPeak,
    maxHops,
    heuristic,
    optimalityClaim: input.lowerBoundByCanonicalId
      ? 'CONDITIONAL_ON_ADMISSIBLE_HEURISTIC'
      : 'LOWEST_NONNEGATIVE_COST',
    exactTerminationAuthority: true,
    canonicalWrites: false,
    producerRevision: input.producerRevision,
  });
}

/** Deterministic bounded breadth-first fanout over the already-promoted KNN graph. */
export function synthesizeKnnMultihop(input: {
  graph: KnnContextGraphV1;
  seedCanonicalIds: readonly string[];
  maxHops: number;
  maxNodes: number;
  producerRevision: string;
}): KnnMultihopReceiptV1 {
  const graph = KnnContextGraphV1Schema.parse(input.graph);
  const maxHops = Math.max(0, Math.min(32, Math.trunc(input.maxHops)));
  const maxNodes = Math.max(1, Math.trunc(input.maxNodes));
  const nodeSet = new Set(graph.nodes.map((node) => node.canonicalId));
  const seeds = [...new Set(input.seedCanonicalIds)].filter((id) => nodeSet.has(id)).sort();
  if (seeds.length === 0) throw new Error('KNN multihop requires at least one seed in the context graph');
  const out = adjacency(graph);
  const queue = seeds.map((id) => ({ id, depth: 0 }));
  const visited = new Set(seeds);
  let traversedEdgeCount = 0;
  let truncated = false;

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.depth >= maxHops) continue;
    for (const edge of out.get(current.id) ?? []) {
      traversedEdgeCount += 1;
      if (visited.has(edge.target)) continue;
      if (visited.size >= maxNodes) {
        truncated = true;
        continue;
      }
      visited.add(edge.target);
      queue.push({ id: edge.target, depth: current.depth + 1 });
    }
  }

  return KnnMultihopReceiptV1Schema.parse({
    schema: 'atlas.knn-multihop-receipt.v1',
    requestId: graph.requestId,
    seedCanonicalIds: seeds,
    maxHops,
    maxNodes,
    visitedCanonicalIds: queue.map((row) => row.id),
    traversedEdgeCount,
    truncated,
    canonicalWrites: false,
    producerRevision: input.producerRevision,
  });
}
