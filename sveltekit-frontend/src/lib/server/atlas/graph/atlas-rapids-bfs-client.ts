export interface AtlasBfsRequestV1 {
  graphRevision: string;
  seedNodeKey: string;
  candidateNodeKeys?: string[];
  maxHops?: number;
  maxNodes?: number;
  direction?: 'outbound' | 'inbound' | 'both';
  deadlineMs?: number;
}

export interface AtlasBfsResultV1 {
  rank: number;
  gpuNodeId: number;
  nodeKey: string;
  packetKey: string | null;
  hop: number;
  predecessorGpuNodeId: number | null;
  predecessorNodeKey: string | null;
  proximity: number;
}

export interface AtlasBfsReceiptV1 {
  schema: 'atlas.graph-bfs-receipt.v1';
  operation: 'bfs';
  backend: 'cugraph.bfs';
  algorithmRevision: string;
  graphRevision: string;
  projectionRevision: string;
  nodeTableHash: string;
  edgeTableHash: string;
  seedNodeKey: string;
  seedGpuNodeId: number;
  direction: 'outbound';
  maxHops: number;
  maxNodes: number;
  candidateFilterCount: number;
  nodeCount: number;
  edgeCount: number;
  truncated: boolean;
  results: AtlasBfsResultV1[];
  timings: {
    kernelMs: number;
    resultSelectMs: number;
  };
}

const MAX_CANDIDATES = 512;
const MAX_HOPS = 4;

function assertBfsRequest(input: AtlasBfsRequestV1): void {
  if (!input.graphRevision?.trim()) throw new Error('ATLAS_BFS_GRAPH_REVISION_REQUIRED');
  if (!input.seedNodeKey?.trim()) throw new Error('ATLAS_BFS_SEED_NODE_REQUIRED');
  if ((input.candidateNodeKeys?.length ?? 0) > MAX_CANDIDATES) {
    throw new Error(`ATLAS_BFS_TOO_MANY_CANDIDATES:${input.candidateNodeKeys?.length}`);
  }
  if (input.maxHops !== undefined && (!Number.isInteger(input.maxHops) || input.maxHops < 1 || input.maxHops > MAX_HOPS)) {
    throw new Error(`ATLAS_BFS_INVALID_MAX_HOPS:${input.maxHops}`);
  }
  if (input.maxNodes !== undefined && (!Number.isInteger(input.maxNodes) || input.maxNodes < 1 || input.maxNodes > MAX_CANDIDATES)) {
    throw new Error(`ATLAS_BFS_INVALID_MAX_NODES:${input.maxNodes}`);
  }
  const direction = input.direction ?? 'outbound';
  if (direction !== 'outbound') throw new Error(`ATLAS_BFS_DIRECTION_NOT_PROVEN:${direction}`);
  const seen = new Set<string>();
  for (const nodeKey of input.candidateNodeKeys ?? []) {
    if (!nodeKey?.trim()) throw new Error('ATLAS_BFS_CANDIDATE_NODE_REQUIRED');
    if (seen.has(nodeKey)) throw new Error(`ATLAS_BFS_DUPLICATE_CANDIDATE:${nodeKey}`);
    seen.add(nodeKey);
  }
}

export function createAtlasRapidsBfsClient(
  baseUrl = process.env.ATLAS_RAPIDS_SIDECAR_URL ?? 'http://127.0.0.1:8098',
) {
  return {
    bfs: async (input: AtlasBfsRequestV1): Promise<AtlasBfsReceiptV1> => {
      assertBfsRequest(input);
      const deadlineMs = input.deadlineMs ?? 5_000;
      const response = await fetch(`${baseUrl}/v1/graph/bfs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          graphRevision: input.graphRevision.trim(),
          seedNodeKey: input.seedNodeKey.trim(),
          candidateNodeKeys: input.candidateNodeKeys ?? [],
          maxHops: input.maxHops ?? 2,
          maxNodes: input.maxNodes ?? 128,
          direction: input.direction ?? 'outbound',
          deadlineMs,
        }),
        signal: AbortSignal.timeout(Math.max(1_000, deadlineMs + 1_000)),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`ATLAS_RAPIDS_BFS_HTTP_${response.status}:${detail}`);
      }
      const receipt = await response.json() as AtlasBfsReceiptV1;
      if (receipt.schema !== 'atlas.graph-bfs-receipt.v1') throw new Error('ATLAS_BFS_RECEIPT_SCHEMA_REJECTED');
      if (receipt.backend !== 'cugraph.bfs') throw new Error(`ATLAS_BFS_BACKEND_REJECTED:${receipt.backend}`);
      if (receipt.graphRevision !== input.graphRevision.trim()) throw new Error('ATLAS_BFS_GRAPH_REVISION_MISMATCH');
      if (receipt.direction !== 'outbound') throw new Error('ATLAS_BFS_RECEIPT_DIRECTION_UNPROVEN');
      return receipt;
    },
  };
}
