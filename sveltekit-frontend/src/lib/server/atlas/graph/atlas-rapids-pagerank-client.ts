export interface AtlasPageRankSeedV1 {
  nodeKey: string;
  weight?: number;
}

export interface AtlasPageRankRequestV1 {
  graphRevision: string;
  seeds?: AtlasPageRankSeedV1[];
  candidateNodeKeys?: string[];
  topK?: number;
  alpha?: number;
  tol?: number;
  maxIter?: number;
  deadlineMs?: number;
}

export interface AtlasPageRankResultV1 {
  rank: number;
  gpuNodeId: number;
  nodeKey: string;
  packetKey: string | null;
  score: number;
}

export interface AtlasPageRankReceiptV1 {
  schema: 'atlas.graph-pagerank-receipt.v1';
  operation: 'pagerank' | 'personalized_pagerank';
  backend: 'cugraph.pagerank';
  algorithmRevision: string;
  graphRevision: string;
  projectionRevision: string;
  nodeTableHash: string;
  edgeTableHash: string;
  seedChecksum: string;
  seedCount: number;
  candidateFilterCount: number;
  alpha: number;
  tol: number;
  maxIter: number;
  didConverge: boolean;
  precomputedOutWeight: boolean;
  cacheHit: boolean;
  nodeCount: number;
  edgeCount: number;
  results: AtlasPageRankResultV1[];
  timings: {
    kernelMs: number;
    resultSelectMs: number;
  };
}

export interface AtlasGraphProjectionLoadRequestV1 {
  artifactDir: string;
  expectedGraphRevision?: string;
  expectedProjectionRevision?: string;
  replaceResident?: boolean;
}

export interface AtlasGraphProjectionLoadReceiptV1 {
  schema: 'atlas.graph-projection-load-receipt.v1';
  reused: boolean;
  graphRevision: string;
  projectionRevision: string;
  nodeTableHash: string;
  edgeTableHash: string;
  nodeCount: number;
  edgeCount: number;
  renumbered: boolean;
  storeTransposed: boolean;
  precomputedOutWeight: boolean;
  timings: Record<string, number>;
  gpuMemoryBefore?: Record<string, unknown> | null;
  gpuMemoryAfter?: Record<string, unknown> | null;
}

const MAX_SEEDS = 64;
const MAX_CANDIDATES = 512;

function assertPageRankRequest(input: AtlasPageRankRequestV1): void {
  if (!input.graphRevision?.trim()) throw new Error('ATLAS_PAGERANK_GRAPH_REVISION_REQUIRED');
  if ((input.seeds?.length ?? 0) > MAX_SEEDS) throw new Error(`ATLAS_PAGERANK_TOO_MANY_SEEDS:${input.seeds?.length}`);
  if ((input.candidateNodeKeys?.length ?? 0) > MAX_CANDIDATES) throw new Error(`ATLAS_PAGERANK_TOO_MANY_CANDIDATES:${input.candidateNodeKeys?.length}`);
  if (input.topK !== undefined && (!Number.isInteger(input.topK) || input.topK < 1 || input.topK > MAX_CANDIDATES)) {
    throw new Error(`ATLAS_PAGERANK_INVALID_TOPK:${input.topK}`);
  }
  if (input.alpha !== undefined && (!(input.alpha > 0) || !(input.alpha < 1))) {
    throw new Error(`ATLAS_PAGERANK_INVALID_ALPHA:${input.alpha}`);
  }
  if (input.tol !== undefined && (!(input.tol > 0) || !Number.isFinite(input.tol))) {
    throw new Error(`ATLAS_PAGERANK_INVALID_TOL:${input.tol}`);
  }
  const seenSeeds = new Set<string>();
  for (const seed of input.seeds ?? []) {
    if (!seed.nodeKey?.trim()) throw new Error('ATLAS_PAGERANK_SEED_NODE_REQUIRED');
    if (seenSeeds.has(seed.nodeKey)) throw new Error(`ATLAS_PAGERANK_DUPLICATE_SEED:${seed.nodeKey}`);
    seenSeeds.add(seed.nodeKey);
    const weight = seed.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) throw new Error(`ATLAS_PAGERANK_INVALID_SEED_WEIGHT:${seed.nodeKey}`);
  }
}

export function createAtlasRapidsPageRankClient(
  baseUrl = process.env.ATLAS_RAPIDS_SIDECAR_URL ?? 'http://127.0.0.1:8098',
) {
  async function requestJson<T>(path: string, body: unknown, timeoutMs = 15_000): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`ATLAS_RAPIDS_GRAPH_HTTP_${response.status}:${detail}`);
    }
    return await response.json() as T;
  }

  return {
    loadProjection: (input: AtlasGraphProjectionLoadRequestV1) =>
      requestJson<AtlasGraphProjectionLoadReceiptV1>('/v1/graph/load', input, 60_000),
    pagerank: (input: AtlasPageRankRequestV1) => {
      assertPageRankRequest(input);
      return requestJson<AtlasPageRankReceiptV1>(
        '/v1/graph/pagerank',
        {
          graphRevision: input.graphRevision.trim(),
          seeds: (input.seeds ?? []).map((seed) => ({ nodeKey: seed.nodeKey, weight: seed.weight ?? 1 })),
          candidateNodeKeys: input.candidateNodeKeys ?? [],
          topK: input.topK ?? 128,
          alpha: input.alpha ?? 0.85,
          tol: input.tol ?? 1e-6,
          maxIter: input.maxIter ?? 100,
          deadlineMs: input.deadlineMs,
        },
        input.deadlineMs ? Math.max(1_000, input.deadlineMs + 1_000) : 15_000,
      );
    },
  };
}
