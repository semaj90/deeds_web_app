import { z } from 'zod';
import type { CandidateProjectionInput } from '$lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';
import type { SpectralNodeRowV1 } from '../spectral/spectral-multihop-contracts.js';
import {
  SGraphV1Schema,
  type SGraphV1,
} from './s-graph-taxonomy.js';

export const SGraphAuthoritySourceSchema = z.enum([
  'PAGERANK',
  'EIGENVECTOR_CENTRALITY',
  'NONE',
]);
export type SGraphAuthoritySource = z.infer<typeof SGraphAuthoritySourceSchema>;

export const SGraphCandidateProjectionReceiptV1Schema = z.object({
  schema: z.literal('atlas.s-graph-candidate-projection.v1'),
  representation: z.literal('S_GRAPH_V1'),
  logicalLane: z.literal('graph'),
  graphRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  algorithmsUsed: z.array(z.enum([
    'BOUNDED_K_HOP',
    'PAGERANK',
    'EIGENVECTOR_CENTRALITY',
    'OUT_DEGREE_NORMALIZATION',
  ])).max(4),
  executor: z.literal('TYPESCRIPT_REFERENCE'),
  authoritySource: SGraphAuthoritySourceSchema,
  maxHops: z.number().int().min(0).max(32),
  candidateCount: z.number().int().nonnegative(),
  graphMatchedCandidateCount: z.number().int().nonnegative(),
  spectralMatchedCandidateCount: z.number().int().nonnegative(),
  seedCanonicalIds: z.array(z.string().min(1)).max(256),
  producerRevision: z.string().min(1),
}).strict();
export type SGraphCandidateProjectionReceiptV1 = z.infer<typeof SGraphCandidateProjectionReceiptV1Schema>;

export interface SGraphCandidateProjectionInput {
  graph: SGraphV1;
  spectralRows?: readonly SpectralNodeRowV1[];
  seedCanonicalIds: readonly string[];
  maxHops?: number;
  producerRevision: string;
}

export interface SGraphCandidateProjectionResult {
  byCanonicalId: Map<string, Partial<CandidateProjectionInput>>;
  graphMatchedCanonicalIds: Set<string>;
  receipt: SGraphCandidateProjectionReceiptV1;
}

const clamp01 = (value: number): number => Number.isFinite(value)
  ? Math.max(0, Math.min(1, value))
  : 0;

function normalizePositive(value: number | null | undefined, maxValue: number): number | undefined {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0 || maxValue <= 0) return undefined;
  return clamp01(value / maxValue);
}

function chooseAuthoritySource(rows: readonly SpectralNodeRowV1[]): SGraphAuthoritySource {
  if (rows.some((row) => row.pagerank !== null && Number.isFinite(row.pagerank))) return 'PAGERANK';
  if (rows.some((row) => row.eigenvectorCentrality !== null && Number.isFinite(row.eigenvectorCentrality))) {
    return 'EIGENVECTOR_CENTRALITY';
  }
  return 'NONE';
}

function adjacencyByNodeId(graph: SGraphV1): Map<string, string[]> {
  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) outgoing.set(node.id, []);
  for (const edge of graph.edges) outgoing.get(edge.source)?.push(edge.target);
  for (const [nodeId, targets] of outgoing) {
    outgoing.set(nodeId, [...new Set(targets)].sort());
  }
  return outgoing;
}

function boundedDistances(
  graph: SGraphV1,
  seedCanonicalIds: readonly string[],
  maxHops: number,
): Map<string, number> {
  const byCanonical = new Map(graph.nodes.map((node) => [node.canonicalId, node.id] as const));
  const outgoing = adjacencyByNodeId(graph);
  const distances = new Map<string, number>();
  const queue: Array<{ nodeId: string; distance: number }> = [];

  for (const canonicalId of [...new Set(seedCanonicalIds)].sort()) {
    const nodeId = byCanonical.get(canonicalId);
    if (!nodeId || distances.has(nodeId)) continue;
    distances.set(nodeId, 0);
    queue.push({ nodeId, distance: 0 });
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.distance >= maxHops) continue;
    for (const target of outgoing.get(current.nodeId) ?? []) {
      if (distances.has(target)) continue;
      const distance = current.distance + 1;
      distances.set(target, distance);
      queue.push({ nodeId: target, distance });
    }
  }
  return distances;
}

/**
 * Project graph-owned structural evidence into the existing 25-column candidate
 * matrix contract. This function deliberately does not create a new ranking
 * lane: all outputs belong to the single logical `graph` lane.
 *
 * Important separation:
 * - SGraphV1 is the representation.
 * - bounded K-hop / PageRank / degree normalization are algorithms.
 * - this implementation is the TypeScript reference executor.
 * - `graph` is the single logical evidence lane.
 */
export function projectSGraphCandidateFeatures(input: SGraphCandidateProjectionInput): SGraphCandidateProjectionResult {
  const graph = SGraphV1Schema.parse(input.graph);
  const maxHops = Math.max(0, Math.min(32, input.maxHops ?? 4));
  const spectralRows = input.spectralRows ?? [];

  const nodeByCanonical = new Map(graph.nodes.map((node) => [node.canonicalId, node] as const));
  const outgoing = adjacencyByNodeId(graph);
  const maxOutDegree = Math.max(0, ...graph.nodes.map((node) => outgoing.get(node.id)?.length ?? 0));
  const distances = boundedDistances(graph, input.seedCanonicalIds, maxHops);

  const spectralByCanonical = new Map(spectralRows.map((row) => [row.canonicalId, row] as const));
  const authoritySource = chooseAuthoritySource(spectralRows);
  const maxPagerank = Math.max(0, ...spectralRows.map((row) => row.pagerank ?? 0));
  const maxEigenvector = Math.max(0, ...spectralRows.map((row) => row.eigenvectorCentrality ?? 0));

  const byCanonicalId = new Map<string, Partial<CandidateProjectionInput>>();
  const graphMatchedCanonicalIds = new Set<string>();
  let spectralMatchedCandidateCount = 0;

  for (const [canonicalId, node] of nodeByCanonical) {
    const distance = distances.get(node.id);
    const outDegree = outgoing.get(node.id)?.length ?? 0;
    const spectral = spectralByCanonical.get(canonicalId);
    if (spectral) spectralMatchedCandidateCount += 1;

    let authority: number | undefined;
    if (authoritySource === 'PAGERANK') {
      authority = normalizePositive(spectral?.pagerank, maxPagerank);
    } else if (authoritySource === 'EIGENVECTOR_CENTRALITY') {
      authority = normalizePositive(spectral?.eigenvectorCentrality, maxEigenvector);
    }

    const graphDistance = distance === undefined
      ? undefined
      : maxHops === 0
        ? 0
        : clamp01(distance / maxHops);
    const dependencyFanout = maxOutDegree > 0 ? clamp01(outDegree / maxOutDegree) : 0;

    const projection: Partial<CandidateProjectionInput> = {
      ...(authority !== undefined ? { authority_norm: authority } : {}),
      dependency_fanout: dependencyFanout,
      ...(graphDistance !== undefined ? { graph_distance: graphDistance } : {}),
    };

    if (Object.keys(projection).length > 0) {
      byCanonicalId.set(canonicalId, projection);
      graphMatchedCanonicalIds.add(canonicalId);
    }
  }

  const algorithmsUsed: SGraphCandidateProjectionReceiptV1['algorithmsUsed'] = [
    'BOUNDED_K_HOP',
    'OUT_DEGREE_NORMALIZATION',
  ];
  if (authoritySource === 'PAGERANK') algorithmsUsed.push('PAGERANK');
  if (authoritySource === 'EIGENVECTOR_CENTRALITY') algorithmsUsed.push('EIGENVECTOR_CENTRALITY');

  return {
    byCanonicalId,
    graphMatchedCanonicalIds,
    receipt: SGraphCandidateProjectionReceiptV1Schema.parse({
      schema: 'atlas.s-graph-candidate-projection.v1',
      representation: 'S_GRAPH_V1',
      logicalLane: 'graph',
      graphRevision: graph.graphRevision,
      workspaceRevision: graph.workspaceRevision,
      sourceRevision: graph.sourceRevision,
      algorithmsUsed,
      executor: 'TYPESCRIPT_REFERENCE',
      authoritySource,
      maxHops,
      candidateCount: graph.nodes.length,
      graphMatchedCandidateCount: graphMatchedCanonicalIds.size,
      spectralMatchedCandidateCount,
      seedCanonicalIds: [...new Set(input.seedCanonicalIds)].sort(),
      producerRevision: input.producerRevision,
    }),
  };
}

/** Graph-owned values override stale graph columns, while non-graph columns stay with their existing owners. */
export function mergeSGraphProjection(
  base: CandidateProjectionInput,
  graphProjection: Partial<CandidateProjectionInput> | undefined,
): CandidateProjectionInput {
  if (!graphProjection) return { ...base };
  return {
    ...base,
    ...(graphProjection.authority_norm !== undefined ? { authority_norm: graphProjection.authority_norm } : {}),
    ...(graphProjection.graph_distance !== undefined ? { graph_distance: graphProjection.graph_distance } : {}),
    ...(graphProjection.dependency_fanout !== undefined ? { dependency_fanout: graphProjection.dependency_fanout } : {}),
  };
}
