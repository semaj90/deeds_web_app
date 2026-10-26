import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CsrGraphCursorSchema = z
  .object({
    schema: z.literal('atlas.csr-graph-cursor.v1'),
    graphRevision: z.string().min(1),
    seedSetDigest: z.string().min(1),
    edgePolicyRevision: z.string().min(1),
    maxDepth: z.number().int().min(0).max(64),
    nextOffset: z.number().int().nonnegative(),
    traversalDepth: z.number().int().nonnegative(),
    lastOrdinal: z.number().int().min(-1),
    discoveryPrefixChecksum: z.string().min(1),
  })
  .strict();

export type CsrGraphCursor = z.infer<typeof CsrGraphCursorSchema>;

export interface BoundedCsrGraph {
  numNodes: number;
  numEdges: number;
  rowOffsets: Uint32Array;
  colIndices: Uint32Array;
  graphRevision: string;
  edgePolicyRevision: string;
}

export interface TraversalStepResult {
  cursor: CsrGraphCursor;
  discoveredOrdinals: number[];
  depthCompleted: number;
  isComplete: boolean;
  totalVisited: number;
}

const MAX_PAGE_SIZE = 10_000;

export function computeSha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function computeSeedDigest(seedOrdinals: number[]): string {
  const sortedOrdinals = [...new Set(seedOrdinals)].sort((left, right) => left - right);
  return computeSha256(sortedOrdinals.join(','));
}

function validateGraph(graph: BoundedCsrGraph): void {
  if (!Number.isSafeInteger(graph.numNodes) || graph.numNodes < 0) {
    throw new Error('CSR_NODE_COUNT_INVALID');
  }
  if (!Number.isSafeInteger(graph.numEdges) || graph.numEdges < 0) {
    throw new Error('CSR_EDGE_COUNT_INVALID');
  }
  if (
    graph.rowOffsets.length !== graph.numNodes + 1 ||
    graph.colIndices.length !== graph.numEdges
  ) {
    throw new Error('CSR_BUFFER_LENGTH_MISMATCH');
  }
  if (
    graph.rowOffsets[0] !== 0 ||
    graph.rowOffsets[graph.numNodes] !== graph.numEdges
  ) {
    throw new Error('CSR_ROW_OFFSETS_INVALID');
  }
  for (let nodeOrdinal = 0; nodeOrdinal < graph.numNodes; nodeOrdinal += 1) {
    if (graph.rowOffsets[nodeOrdinal] > graph.rowOffsets[nodeOrdinal + 1]) {
      throw new Error('CSR_ROW_OFFSETS_NOT_MONOTONIC');
    }
  }
  for (const neighborOrdinal of graph.colIndices) {
    if (neighborOrdinal >= graph.numNodes) throw new Error('CSR_EDGE_ORDINAL_INVALID');
  }
  if (!graph.graphRevision.trim()) throw new Error('GRAPH_REVISION_REQUIRED');
  if (!graph.edgePolicyRevision.trim()) throw new Error('EDGE_POLICY_REVISION_REQUIRED');
}

function createPrefixHash(seedOrdinals: number[]) {
  const hash = createHash('sha256');
  for (const seedOrdinal of seedOrdinals) hash.update(`seed:${seedOrdinal}\n`);
  return hash;
}

export function traverseCsrWithCursor(
  graph: BoundedCsrGraph,
  seeds: number[],
  options: {
    maxDepth: number;
    maxNodesPerStep: number;
    edgePolicyRevision: string;
  },
  cursor?: CsrGraphCursor,
): TraversalStepResult {
  validateGraph(graph);
  if (
    !Number.isInteger(options.maxDepth) ||
    options.maxDepth < 0 ||
    options.maxDepth > 64
  ) {
    throw new Error('CSR_MAX_DEPTH_OUT_OF_BOUNDS');
  }
  if (
    !Number.isInteger(options.maxNodesPerStep) ||
    options.maxNodesPerStep < 1 ||
    options.maxNodesPerStep > MAX_PAGE_SIZE
  ) {
    throw new Error('CSR_PAGE_SIZE_OUT_OF_BOUNDS');
  }
  if (options.edgePolicyRevision !== graph.edgePolicyRevision) {
    throw new Error('CSR_GRAPH_EDGE_POLICY_MISMATCH');
  }
  if (
    seeds.length === 0 ||
    seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed >= graph.numNodes)
  ) {
    throw new Error('CSR_SEED_ORDINAL_INVALID');
  }

  const normalizedSeeds = [...new Set(seeds)].sort((left, right) => left - right);
  const seedSetDigest = computeSeedDigest(normalizedSeeds);
  let nextOffset = 0;
  if (cursor) {
    const parsedCursor = CsrGraphCursorSchema.safeParse(cursor);
    if (!parsedCursor.success) throw new Error('CSR_CURSOR_INVALID');
    if (cursor.graphRevision !== graph.graphRevision)
      throw new Error('CSR_CURSOR_GRAPH_REVISION_MISMATCH');
    if (cursor.seedSetDigest !== seedSetDigest)
      throw new Error('CSR_CURSOR_SEED_SET_MISMATCH');
    if (cursor.edgePolicyRevision !== options.edgePolicyRevision)
      throw new Error('CSR_CURSOR_EDGE_POLICY_MISMATCH');
    if (cursor.maxDepth !== options.maxDepth)
      throw new Error('CSR_CURSOR_DEPTH_MISMATCH');
    nextOffset = cursor.nextOffset;
  }

  const visited = new Uint8Array(graph.numNodes);
  for (const seedOrdinal of normalizedSeeds) visited[seedOrdinal] = 1;
  const prefixHash = createPrefixHash(normalizedSeeds);
  const page: number[] = [];
  let frontier = normalizedSeeds;
  let discoveredCount = 0;
  let cursorStateVerified = !cursor || nextOffset === 0;
  let pageLastOrdinal = cursor?.lastOrdinal ?? -1;
  let pageDepth = cursor?.traversalDepth ?? 0;
  let pageChecksum = cursor?.discoveryPrefixChecksum ?? prefixHash.copy().digest('hex');
  let pageEndOffset = nextOffset;

  if (cursor && nextOffset === 0) {
    const expectedSeedChecksum = prefixHash.copy().digest('hex');
    if (
      cursor.lastOrdinal !== -1 ||
      cursor.traversalDepth !== 0 ||
      cursor.discoveryPrefixChecksum !== expectedSeedChecksum
    ) {
      throw new Error('CSR_CURSOR_STATE_MISMATCH');
    }
  }

  let hasLookahead = false;
  for (let depth = 1; depth <= options.maxDepth && frontier.length > 0; depth += 1) {
    const nextFrontierSet = new Set<number>();
    for (const nodeOrdinal of frontier) {
      const startEdge = graph.rowOffsets[nodeOrdinal];
      const endEdge = graph.rowOffsets[nodeOrdinal + 1];
      for (let edgeIndex = startEdge; edgeIndex < endEdge; edgeIndex += 1) {
        const neighborOrdinal = graph.colIndices[edgeIndex];
        if (visited[neighborOrdinal] === 0) nextFrontierSet.add(neighborOrdinal);
      }
    }
    const nextFrontier = [...nextFrontierSet].sort((left, right) => left - right);

    for (const neighborOrdinal of nextFrontier) {
      visited[neighborOrdinal] = 1;
      discoveredCount += 1;
      prefixHash.update(`node:${depth}:${neighborOrdinal}\n`);

      if (cursor && discoveredCount === nextOffset) {
        cursorStateVerified = true;
        if (
          cursor.lastOrdinal !== neighborOrdinal ||
          cursor.traversalDepth !== depth ||
          cursor.discoveryPrefixChecksum !== prefixHash.copy().digest('hex')
        ) {
          throw new Error('CSR_CURSOR_STATE_MISMATCH');
        }
      }

      if (discoveredCount > nextOffset && page.length < options.maxNodesPerStep) {
        page.push(neighborOrdinal);
        pageEndOffset = discoveredCount;
        pageLastOrdinal = neighborOrdinal;
        pageDepth = depth;
        pageChecksum = prefixHash.copy().digest('hex');
      } else if (discoveredCount > nextOffset) {
        hasLookahead = true;
        break;
      }
    }

    if (hasLookahead) break;
    frontier = nextFrontier;
  }

  if (cursor && !cursorStateVerified)
    throw new Error('CSR_CURSOR_OFFSET_OUT_OF_RANGE');

  const resultCursor: CsrGraphCursor = {
    schema: 'atlas.csr-graph-cursor.v1',
    graphRevision: graph.graphRevision,
    seedSetDigest,
    edgePolicyRevision: options.edgePolicyRevision,
    maxDepth: options.maxDepth,
    nextOffset: pageEndOffset,
    traversalDepth: pageDepth,
    lastOrdinal: pageLastOrdinal,
    discoveryPrefixChecksum: pageChecksum,
  };

  return {
    cursor: resultCursor,
    discoveredOrdinals: page,
    depthCompleted: pageDepth,
    isComplete: !hasLookahead,
    totalVisited: normalizedSeeds.length + pageEndOffset,
  };
}
