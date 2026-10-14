import { ENV } from '$lib/server/env.server.js';

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

export interface AtlasGraphResidentStatusV1 {
  schema: 'atlas.graph-residency.v1';
  capability: {
    available: boolean;
    backend: string;
    backendVersion: string | null;
    algorithmRevision: string;
    maxSeeds: number;
    maxResultNodes: number;
    minGraphFreeGpuMb: number;
    importError: string | null;
  };
  resident: {
    graphRevision: string;
    projectionRevision: string;
    nodeCount: number;
    edgeCount: number;
    nodeTableHash: string;
    edgeTableHash: string;
    loadedAtUnixMs: number;
  } | null;
}

export interface AtlasGraphBfsRequestV1 {
  graphRevision: string;
  projectionRevision: string;
  projectionChecksum: string;
  startNodeKey: string;
  depthLimit: number;
  expectedArtifactChecksum: string;
  expectedGraphOrdinalMapChecksum: string;
}

export interface AtlasGraphBfsReceiptV1 {
  schema: 'atlas.graph-bfs-receipt.v1';
  operation: 'bfs';
  backend: 'cugraph.bfs';
  graphRevision: string;
  projectionRevision: string;
  artifactChecksum: string;
  graphOrdinalMapChecksum: string;
  startNodeKey: string;
  depthLimit: number;
  results: Array<{
    gpuNodeId: number;
    nodeKey: string;
    packetKey: string | null;
    sourceRef?: string | null;
    sourceRevision?: string | null;
    workspaceRevision?: string | null;
    distance: number;
    pathGraphNodeKeys: string[];
  }>;
  writesPerformed: false;
  canonicalAuthority: false;
}

export interface AtlasGraphSourceRefBfsRequestV1 {
  graphRevision: string;
  projectionRevision: string;
  projectionChecksum: string;
  sourceRef: string;
  expectedSourceRevision: string;
  expectedWorkspaceRevision: string;
  depthLimit: number;
  matchLimit?: number;
  expectedArtifactChecksum: string;
  expectedGraphOrdinalMapChecksum: string;
}

export interface AtlasGraphSourceRefBfsReceiptV1 {
  schema: 'atlas.graph-source-ref-bfs-receipt.v1';
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  graphRevision: string;
  projectionRevision: string;
  projectionChecksum: string;
  artifactChecksum: string;
  graphOrdinalMapChecksum: string;
  matches: Array<{
    graphOrdinal: number;
    nodeKey: string;
    packetKey: string | null;
    sourceRef: string;
    sourceRevision: string;
    workspaceRevision: string;
    traversal: AtlasGraphBfsReceiptV1;
  }>;
  writesPerformed: false;
  canonicalAuthority: false;
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
  baseUrl = ENV.ATLAS_RAPIDS_SIDECAR_URL,
) {
  if (!baseUrl?.trim()) throw new Error('ATLAS_RAPIDS_SIDECAR_URL_REQUIRED');
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
    /** GET /v1/graph/resident — check what's currently loaded before calling pagerank(). */
    resident: async (timeoutMs = 5_000): Promise<AtlasGraphResidentStatusV1> => {
      const response = await fetch(`${baseUrl}/v1/graph/resident`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`ATLAS_RAPIDS_GRAPH_HTTP_${response.status}:${detail}`);
      }
      return await response.json() as AtlasGraphResidentStatusV1;
    },
    loadProjection: (input: AtlasGraphProjectionLoadRequestV1) =>
      requestJson<AtlasGraphProjectionLoadReceiptV1>('/v1/graph/load', input, 60_000),
    bfs: async (input: AtlasGraphBfsRequestV1): Promise<AtlasGraphBfsReceiptV1> => {
      for (const [field, value] of Object.entries(input)) {
        if (typeof value === 'string' && !value.trim()) throw new Error(`ATLAS_GRAPH_BFS_${field.toUpperCase()}_REQUIRED`);
      }
      if (!Number.isInteger(input.depthLimit) || input.depthLimit < 0 || input.depthLimit > 2) {
        throw new Error('ATLAS_GRAPH_BFS_DEPTH_OUT_OF_BOUNDS');
      }
      const receipt = await requestJson<AtlasGraphBfsReceiptV1>('/v1/graph/bfs', input, 15_000);
      if (
        receipt.schema !== 'atlas.graph-bfs-receipt.v1' ||
        receipt.operation !== 'bfs' ||
        receipt.backend !== 'cugraph.bfs' ||
        receipt.graphRevision !== input.graphRevision ||
        receipt.projectionRevision !== input.projectionRevision ||
        receipt.artifactChecksum !== input.expectedArtifactChecksum ||
        receipt.graphOrdinalMapChecksum !== input.expectedGraphOrdinalMapChecksum ||
        receipt.startNodeKey !== input.startNodeKey ||
        receipt.depthLimit !== input.depthLimit ||
        receipt.writesPerformed !== false ||
        receipt.canonicalAuthority !== false
      ) {
        throw new Error('ATLAS_GRAPH_BFS_RECEIPT_MISMATCH');
      }
      return receipt;
    },
    sourceRefBfs: async (input: AtlasGraphSourceRefBfsRequestV1): Promise<AtlasGraphSourceRefBfsReceiptV1> => {
      for (const field of [
        'graphRevision', 'projectionRevision', 'projectionChecksum', 'sourceRef',
        'expectedSourceRevision', 'expectedWorkspaceRevision', 'expectedArtifactChecksum',
        'expectedGraphOrdinalMapChecksum',
      ] as const) {
        if (!input[field]?.trim()) throw new Error(`ATLAS_GRAPH_SOURCE_REF_${field.toUpperCase()}_REQUIRED`);
      }
      if (input.sourceRef !== input.sourceRef.trim()) throw new Error('ATLAS_GRAPH_SOURCE_REF_NOT_NORMALIZED');
      if (!Number.isInteger(input.depthLimit) || input.depthLimit < 0 || input.depthLimit > 2) {
        throw new Error('ATLAS_GRAPH_SOURCE_REF_DEPTH_OUT_OF_BOUNDS');
      }
      const matchLimit = input.matchLimit ?? 16;
      if (!Number.isInteger(matchLimit) || matchLimit < 1 || matchLimit > 16) {
        throw new Error('ATLAS_GRAPH_SOURCE_REF_MATCH_LIMIT_OUT_OF_BOUNDS');
      }
      const receipt = await requestJson<AtlasGraphSourceRefBfsReceiptV1>(
        '/v1/graph/source-ref-bfs',
        { ...input, matchLimit },
        30_000,
      );
      if (
        receipt.schema !== 'atlas.graph-source-ref-bfs-receipt.v1' ||
        receipt.sourceRef !== input.sourceRef ||
        receipt.sourceRevision !== input.expectedSourceRevision ||
        receipt.workspaceRevision !== input.expectedWorkspaceRevision ||
        receipt.graphRevision !== input.graphRevision ||
        receipt.projectionRevision !== input.projectionRevision ||
        receipt.projectionChecksum !== input.projectionChecksum ||
        receipt.artifactChecksum !== input.expectedArtifactChecksum ||
        receipt.graphOrdinalMapChecksum !== input.expectedGraphOrdinalMapChecksum ||
        receipt.matches.length === 0 || receipt.matches.length > matchLimit ||
        receipt.writesPerformed !== false || receipt.canonicalAuthority !== false
      ) {
        throw new Error('ATLAS_GRAPH_SOURCE_REF_BFS_RECEIPT_MISMATCH');
      }
      const ordinals = new Set<number>();
      const nodeKeys = new Set<string>();
      for (const match of receipt.matches) {
        if (
          !Number.isInteger(match.graphOrdinal) || match.graphOrdinal < 0 ||
          !match.nodeKey.trim() || match.sourceRef !== input.sourceRef ||
          match.sourceRevision !== input.expectedSourceRevision ||
          match.workspaceRevision !== input.expectedWorkspaceRevision ||
          ordinals.has(match.graphOrdinal) || nodeKeys.has(match.nodeKey) ||
          match.traversal.graphRevision !== input.graphRevision ||
          match.traversal.projectionRevision !== input.projectionRevision ||
          match.traversal.artifactChecksum !== input.expectedArtifactChecksum ||
          match.traversal.graphOrdinalMapChecksum !== input.expectedGraphOrdinalMapChecksum ||
          match.traversal.startNodeKey !== match.nodeKey ||
          match.traversal.writesPerformed !== false || match.traversal.canonicalAuthority !== false
        ) {
          throw new Error('ATLAS_GRAPH_SOURCE_REF_BFS_MATCH_MISMATCH');
        }
        ordinals.add(match.graphOrdinal);
        nodeKeys.add(match.nodeKey);
      }
      return receipt;
    },
    pagerank: async (input: AtlasPageRankRequestV1) => {
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
