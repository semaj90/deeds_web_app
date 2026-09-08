import { createHash } from 'node:crypto';
import { HyperedgeV1Schema, type HyperedgeV1 } from '../../graph/hyperedge-contract.js';

export const KAG_QUICK_HOP_LIMITS_V1 = {
  maxDepth: 3,
  maxFrontier: 64,
  maxHyperedges: 32,
  maxSourceSpans: 12,
} as const;

export interface KagQuickHopInputV1 {
  seedCanonicalIds: readonly string[];
  hyperedges: readonly HyperedgeV1[];
  workspaceRevision: string;
  graphRevision: string;
  maxDepth?: number;
  maxFrontier?: number;
  maxHyperedges?: number;
  maxSourceSpans?: number;
}

export interface KagQuickHopPathV1 {
  hyperedgeId: string;
  predicate: string;
  fromCanonicalId: string;
  toCanonicalId: string;
  fromRole: string;
  toRole: string;
  depth: number;
  score: number;
}

export interface KagQuickHopReceiptV1 {
  schema: 'atlas.hypergraph-quick-hop-receipt.v1';
  seedCanonicalIds: string[];
  visitedCanonicalIds: string[];
  visitedHyperedgeIds: string[];
  visitedMemberIds: string[];
  paths: KagQuickHopPathV1[];
  depthReached: number;
  frontierPeak: number;
  budgetExhausted: boolean;
  workspaceRevision: string;
  graphRevision: string;
  evidenceRefs: string[];
  checksum: string;
}

export interface KagQuickHopReaderV1 {
  readHyperedges(canonicalIds: readonly string[], snapshot: { workspaceRevision: string; graphRevision: string }): Promise<HyperedgeV1[]>;
}

/** Production composition point. Construction is side-effect free; the caller
 * still supplies the revision pair and decides when a governed traversal runs. */
export async function createPostgresKagQuickHopReaderV1(): Promise<KagQuickHopReaderV1> {
  const { readKagHyperedgesStrictV1 } = await import('./kag-hypergraph-reader-v1.js');
  return { readHyperedges: readKagHyperedgesStrictV1 };
}

const text = (value: string, name: string) => {
  const result = value.trim();
  if (!result) throw new Error(`KAG_QUICK_HOP_${name.toUpperCase()}_REQUIRED`);
  return result;
};

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const uniqueSorted = (values: readonly string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(compare);
const checksum = (value: Omit<KagQuickHopReceiptV1, 'checksum'>) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Pure bounded incidence traversal. It accepts already-qualified HyperedgeV1
 * values and never hydrates source text, writes data, or creates pairwise cliques. */
export function runKagQuickHopV1(input: KagQuickHopInputV1): KagQuickHopReceiptV1 {
  const workspaceRevision = text(input.workspaceRevision, 'workspace_revision');
  const graphRevision = text(input.graphRevision, 'graph_revision');
  const seeds = uniqueSorted(input.seedCanonicalIds);
  if (seeds.length === 0) throw new Error('KAG_QUICK_HOP_SEEDS_REQUIRED');

  const limits = {
    maxDepth: input.maxDepth ?? KAG_QUICK_HOP_LIMITS_V1.maxDepth,
    maxFrontier: input.maxFrontier ?? KAG_QUICK_HOP_LIMITS_V1.maxFrontier,
    maxHyperedges: input.maxHyperedges ?? KAG_QUICK_HOP_LIMITS_V1.maxHyperedges,
    maxSourceSpans: input.maxSourceSpans ?? KAG_QUICK_HOP_LIMITS_V1.maxSourceSpans,
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`KAG_QUICK_HOP_${name.toUpperCase()}_INVALID`);
  }
  const edges = input.hyperedges.map((edge) => HyperedgeV1Schema.parse(edge))
    .filter((edge) => edge.workspaceRevision === workspaceRevision && edge.graphRevision === graphRevision)
    .sort((a, b) => compare(a.hyperedgeId, b.hyperedgeId));
  const edgeByMember = new Map<string, HyperedgeV1[]>();
  for (const edge of edges) for (const participant of edge.participants) {
    const list = edgeByMember.get(participant.canonicalId) ?? [];
    list.push(edge);
    edgeByMember.set(participant.canonicalId, list);
  }

  const visitedIds = new Set(seeds);
  const visitedEdges = new Set<string>();
  const paths: KagQuickHopPathV1[] = [];
  const evidence = new Set<string>();
  let frontier = seeds.slice(0, limits.maxFrontier);
  let frontierPeak = frontier.length;
  let depthReached = 0;
  let budgetExhausted = seeds.length > limits.maxFrontier;

  for (let depth = 1; depth <= limits.maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const from of frontier) {
      for (const edge of edgeByMember.get(from) ?? []) {
        if (visitedEdges.size >= limits.maxHyperedges && !visitedEdges.has(edge.hyperedgeId)) {
          budgetExhausted = true;
          break;
        }
        if (visitedEdges.has(edge.hyperedgeId)) continue;
        visitedEdges.add(edge.hyperedgeId);
        for (const ref of edge.evidenceRefs) {
          if (evidence.size < limits.maxSourceSpans) evidence.add(ref);
        }
        const origin = edge.participants.find((participant) => participant.canonicalId === from);
        for (const participant of edge.participants) {
          if (participant.canonicalId === from) continue;
          paths.push({
            hyperedgeId: edge.hyperedgeId, predicate: edge.predicate,
            fromCanonicalId: from, toCanonicalId: participant.canonicalId,
            fromRole: origin?.role ?? 'unknown', toRole: participant.role,
            depth, score: 1 / depth,
          });
          if (!visitedIds.has(participant.canonicalId)) {
            visitedIds.add(participant.canonicalId);
            next.push(participant.canonicalId);
          }
        }
      }
    }
    depthReached = depth;
    next.sort(compare);
    if (next.length > limits.maxFrontier) budgetExhausted = true;
    frontier = next.slice(0, limits.maxFrontier);
    frontierPeak = Math.max(frontierPeak, frontier.length);
  }
  const body = {
    schema: 'atlas.hypergraph-quick-hop-receipt.v1' as const,
    seedCanonicalIds: seeds,
    visitedCanonicalIds: [...visitedIds].sort(compare),
    visitedHyperedgeIds: [...visitedEdges].sort(compare),
    visitedMemberIds: [...visitedIds].sort(compare),
    paths: paths.sort((a, b) => a.depth - b.depth || compare(a.hyperedgeId, b.hyperedgeId) || compare(a.toCanonicalId, b.toCanonicalId)),
    depthReached, frontierPeak, budgetExhausted, workspaceRevision, graphRevision,
    evidenceRefs: [...evidence].sort(compare),
  };
  return { ...body, checksum: checksum(body) };
}

/** Coordinator seam for a future governed DB caller. The reader is injected so
 * this function is testable without a database and cannot silently select a
 * different revision. It collects bounded incidence pages, then delegates all
 * identity/path semantics to the pure engine above. */
export async function executeKagQuickHopV1(input: Omit<KagQuickHopInputV1, 'hyperedges'>, reader: KagQuickHopReaderV1): Promise<KagQuickHopReceiptV1> {
  const maxDepth = input.maxDepth ?? KAG_QUICK_HOP_LIMITS_V1.maxDepth;
  const maxFrontier = input.maxFrontier ?? KAG_QUICK_HOP_LIMITS_V1.maxFrontier;
  const maxHyperedges = input.maxHyperedges ?? KAG_QUICK_HOP_LIMITS_V1.maxHyperedges;
  let frontier = uniqueSorted(input.seedCanonicalIds).slice(0, maxFrontier);
  const collected = new Map<string, HyperedgeV1>();
  const seen = new Set(frontier);
  for (let depth = 0; depth < maxDepth && frontier.length > 0 && collected.size < maxHyperedges; depth++) {
    const page = await reader.readHyperedges(frontier, { workspaceRevision: input.workspaceRevision, graphRevision: input.graphRevision });
    const next: string[] = [];
    for (const edge of page) {
      if (edge.workspaceRevision !== input.workspaceRevision || edge.graphRevision !== input.graphRevision) {
        throw new Error('KAG_QUICK_HOP_READER_REVISION_MISMATCH');
      }
      if (collected.size >= maxHyperedges && !collected.has(edge.hyperedgeId)) break;
      collected.set(edge.hyperedgeId, edge);
      for (const participant of edge.participants) if (!seen.has(participant.canonicalId)) {
        seen.add(participant.canonicalId);
        next.push(participant.canonicalId);
      }
    }
    frontier = uniqueSorted(next).slice(0, maxFrontier);
  }
  return runKagQuickHopV1({ ...input, hyperedges: [...collected.values()] });
}
