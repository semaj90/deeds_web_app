/**
 * gRPC Retrieval Client — server-only.
 *
 * Uses retrieval.proto's RetrievalService for RAG+KAG+DAG evidence search
 * via gRPC (offloads pgvector/Qdrant/graph-hop to a dedicated service).
 *
 * Fallback: If gRPC is disabled or unavailable, returns null so the caller
 * can fall through to the inline TypeScript pipeline.
 *
 * ENV:
 *   RETRIEVAL_GRPC_URL     — gRPC server address (default: 127.0.0.1:50053)
 *   RETRIEVAL_GRPC_ENABLED — "true" to enable gRPC path (default: "false")
 */
import { ENV } from '$lib/server/env.server.js';
import type { ResearchSource } from '$lib/server/research/web-research-ingester.js';
import { buildGrpcClientChannelOptions } from './client-options.js';
import { withRpcCache } from '$lib/server/cache/rpc-cache.js';
import { RPC_TTL_SECONDS, RPC_DEADLINES_MS } from '$lib/types/rpc-cache.js';
// Proto types were in generated/proto (archived — regenerate from proto/*.proto if gRPC revived)

// ── Types (mirror retrieval.proto messages — validated against generated types) ─

export interface EvidenceSearchParams {
  query: string;
  caseId?: string;
  limit?: number;
  expandSections?: boolean;
  jurisdiction?: string;
}

export interface SearchResult {
  evidenceId: string;
  chunkIndex: number;
  content: string;
  score: number;
  metadata: {
    sectionPath?: string[];
    heading?: string;
    citations?: string[];
    fileName?: string;
    tokenCount?: number;
    extractionMethod?: string;
  };
  rerank?: {
    cosine: number;
    sharedCitations: number;
    jurisdictionMatch: number;
    sectionProximity: number;
    finalScore: number;
  };
}

export interface GraphNeighbor {
  nodeId: string;
  title: string;
  evidenceType: string;
  connectionType: string;
  strength: number;
  confidence: number;
  aiReasoning?: string;
}

export interface DocumentContext {
  evidenceId: string;
  fileName: string;
  fileType: string;
  description: string;
  aiSummary?: string;
  aiTagsJson?: string;
  keyEntitiesJson?: string;
}

export interface ContextBundle {
  hit: SearchResult;
  siblings: SearchResult[];
  sectionPath: string[];
  heading: string;
  citations: string[];
  graphNeighbors: GraphNeighbor[];
  documentContext?: DocumentContext;
}

export interface SearchTiming {
  embedMs: number;
  searchMs: number;
  rerankMs: number;
  hopMs: number;
  kagMs: number;
  dagMs: number;
  totalMs: number;
}

export interface EvidenceSearchResponse {
  results: SearchResult[];
  bundles: ContextBundle[];
  timing: SearchTiming;
  cacheSource?: string;
}

export interface RetrievedCodebaseChunk {
  id: string;
  chunkId: string;
  filePath: string;
  kind: string;
  httpMethod: string;
  routeId: string;
  source?: string;
  sourceId?: string;
  sourceType?: string;
  url?: string;
  title?: string;
  collection?: string;
  sourceMetadata: Record<string, string>;
  tags: string[];
  contentPreview: string;
  score: number;
  semanticScore?: number;
  lexicalScore?: number;
  rerankScore?: number;
  clusterId?: string;
  clusterType?: string;
  gpuCluster?: number;
  somCluster?: number;
  bmuRow?: number;
  bmuCol?: number;
  createdAt?: string;
  updatedAt?: string;
  indexedAt?: string;
  startLine: number;
  endLine: number;
}

export interface SearchChunksResponse {
  results: RetrievedCodebaseChunk[];
  totalMs: number;
}

export interface RetrievalClusterContext {
  clusterId?: string;
  clusterType?: string;
  gpuCluster?: number;
  somCluster?: number;
  bmuRow?: number;
  bmuCol?: number;
}

export interface ClusterSummaryLookupResponse {
  clusterId: number;
  summary: string;
  patterns: string[];
  keywords: string[];
  metadata: Record<string, string>;
}

export interface AstNode {
  id: string;
  symbol: string;
  kind: string;
  filePath: string;
}

export interface AstEdge {
  sourceId: string;
  targetId: string;
  edgeType: string;
}

export interface AstExpansionResponse {
  neighbors: AstNode[];
  edges: AstEdge[];
}

export interface TopologyContextResponse {
  neighbors: RetrievedCodebaseChunk[];
  somMetadataJson?: string;
  clusterMetadata?: RetrievalClusterContext;
}

export interface ResearchContextChunk {
  id: string;
  chunkId: string;
  source: ResearchSource;
  sourceId?: string;
  sourceType?: string;
  sourceMetadata: Record<string, string>;
  url: string;
  title: string;
  body: string;
  score: number;
  semanticScore?: number;
  lexicalScore?: number;
  rerankScore?: number;
  tags: string[];
  semanticTags: string[];
  clusterId?: string;
  clusterType?: string;
  gpuCluster?: number;
  somCluster?: number;
  bmuRow?: number;
  bmuCol?: number;
  createdAt?: string;
  updatedAt?: string;
  indexedAt?: string;
}

export interface ResearchContextResponse {
  research: ResearchContextChunk[];
  totalMs: number;
  source: 'grpc' | 'unavailable';
  error?: string;
}

// ── gRPC client (lazy-loaded, singleton) ────────────────────────────────

const RETRIEVAL_GRPC_URL = ENV.RETRIEVAL_GRPC_URL;
const RETRIEVAL_GRPC_ENABLED = ENV.RETRIEVAL_GRPC_ENABLED;
const RETRIEVAL_HTTP_URL = ENV.RETRIEVAL_HTTP_URL;
const RETRIEVAL_HTTP_ENABLED = ENV.RETRIEVAL_HTTP_ENABLED;
const GO_SEARCH_URL = ENV.GO_SEARCH_URL;
const GO_SEARCH_GRPC_URL = ENV.GO_SEARCH_GRPC_URL;

let grpcClient: any = null;
let grpcLoadFailed = false;
let grpcRetryAt = 0; // Timestamp for next retry after failure

let goSearchHealthClient: any = null;
let goSearchHealthLoadFailed = false;
let goSearchHealthRetryAt = 0;

async function getGrpcClient(): Promise<any> {
  if (grpcLoadFailed) {
    // Retry after 30s instead of permanent disable
    if (Date.now() < grpcRetryAt) return null;
    grpcLoadFailed = false;
    grpcClient = null;
  }
  if (grpcClient) return grpcClient;

  try {
    const grpc = await import('@grpc/grpc-js');
    const protoLoader = await import('@grpc/proto-loader');
    const { resolve } = await import('path');

    const PROTO_PATH = resolve(process.cwd(), '../proto/active/retrieval.proto');

    const packageDefinition = await protoLoader.load(PROTO_PATH, {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
    const RetrievalService = protoDescriptor.yorha.retrieval.RetrievalService;

    grpcClient = new RetrievalService(
      RETRIEVAL_GRPC_URL,
      grpc.credentials.createInsecure(),
      buildGrpcClientChannelOptions({
        maxConnectionIdleMs: 300_000,
        maxConnectionAgeMs: 600_000,
        maxSendMessageLength: 10 * 1024 * 1024,
        maxReceiveMessageLength: 10 * 1024 * 1024,
      })
    );

    return grpcClient;
  } catch (err) {
    console.warn(
      '[retrieval-client] gRPC client init failed, will retry in 30s:',
      (err as Error).message
    );
    grpcLoadFailed = true;
    grpcRetryAt = Date.now() + 30_000;
    return null;
  }
}

async function getGoSearchHealthClient(): Promise<any> {
  if (goSearchHealthLoadFailed) {
    if (Date.now() < goSearchHealthRetryAt) return null;
    goSearchHealthLoadFailed = false;
    goSearchHealthClient = null;
  }
  if (goSearchHealthClient) return goSearchHealthClient;

  try {
    const grpc = await import('@grpc/grpc-js');
    const protoLoader = await import('@grpc/proto-loader');
    const { resolve } = await import('path');

    const protoPath = resolve(process.cwd(), 'proto/active/library_search.proto');

    const packageDefinition = await protoLoader.load(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as Record<string, any>;
    const LibrarySearchService =
      protoDescriptor.library?.search?.LibrarySearchService ??
      protoDescriptor.yorha?.legal?.LibrarySearchService ??
      protoDescriptor.libsearch?.LibrarySearchService ??
      protoDescriptor.LibrarySearchService;

    if (!LibrarySearchService) {
      throw new Error('LibrarySearchService not found in library_search.proto');
    }

    goSearchHealthClient = new LibrarySearchService(
      GO_SEARCH_GRPC_URL,
      grpc.credentials.createInsecure(),
      buildGrpcClientChannelOptions({
        maxConnectionIdleMs: 300_000,
        maxReceiveMessageLength: 10 * 1024 * 1024,
      })
    );

    return goSearchHealthClient;
  } catch (err) {
    console.warn(
      '[retrieval-client] go-search gRPC health client init failed, will retry in 30s:',
      (err as Error).message
    );
    goSearchHealthLoadFailed = true;
    goSearchHealthRetryAt = Date.now() + 30_000;
    return null;
  }
}

async function callGrpcMethod<T>(
  methodName: string,
  request: Record<string, unknown>,
  timeoutMs = 10_000
): Promise<T | null> {
  if (!RETRIEVAL_GRPC_ENABLED) return null;

  const client = await getGrpcClient();
  const method = client?.[methodName];
  if (typeof method !== 'function') {
    return null;
  }

  return new Promise((resolve) => {
    const deadline = new Date(Date.now() + timeoutMs);
    method.call(client, request, { deadline }, (err: Error | null, response: T | null) => {
      if (err) {
        console.warn(`[retrieval-client] gRPC ${methodName} failed:`, err.message);
        resolve(null);
        return;
      }

      resolve(response ?? null);
    });
  });
}

// ── gRPC evidence search ────────────────────────────────────────────────

/**
 * Search evidence via gRPC RetrievalService.
 * Returns null if gRPC is disabled/unavailable (caller falls back to inline pipeline).
 */
export async function searchEvidenceViaGrpc(
  params: EvidenceSearchParams,
  timeoutMs = 10_000
): Promise<EvidenceSearchResponse | null> {
  if (!RETRIEVAL_GRPC_ENABLED) return null;

  const client = await getGrpcClient();
  if (!client) return null;

  return new Promise((resolve) => {
    const deadline = new Date(Date.now() + timeoutMs);

    client.searchEvidence(
      {
        query: params.query,
        caseId: params.caseId ?? '',
        limit: params.limit ?? 10,
        expandSections: params.expandSections ?? true,
        jurisdiction: params.jurisdiction ?? '',
      },
      { deadline },
      (err: Error | null, response: any) => {
        if (err) {
          console.warn('[retrieval-client] gRPC SearchEvidence failed:', err.message);
          resolve(null);
          return;
        }

        if (!response) {
          resolve(null);
          return;
        }

        // Map proto response to TypeScript interface
        resolve(mapProtoResponse(response));
      }
    );
  });
}

// ── Response mapping (proto → TS) ───────────────────────────────────────

function mapProtoResult(r: any): SearchResult {
  return {
    evidenceId: r.evidenceId ?? '',
    chunkIndex: r.chunkIndex ?? 0,
    content: r.content ?? '',
    score: r.score ?? 0,
    metadata: {
      sectionPath: r.metadata?.sectionPath ?? [],
      heading: r.metadata?.heading ?? '',
      citations: r.metadata?.citations ?? [],
      fileName: r.metadata?.fileName ?? '',
      tokenCount: r.metadata?.tokenCount ?? 0,
      extractionMethod: r.metadata?.extractionMethod ?? '',
    },
    rerank: r.rerank
      ? {
          cosine: r.rerank.cosine ?? 0,
          sharedCitations: r.rerank.sharedCitations ?? 0,
          jurisdictionMatch: r.rerank.jurisdictionMatch ?? 0,
          sectionProximity: r.rerank.sectionProximity ?? 0,
          finalScore: r.rerank.finalScore ?? 0,
        }
      : undefined,
  };
}

function mapProtoNeighbor(n: any): GraphNeighbor {
  return {
    nodeId: n.nodeId ?? '',
    title: n.title ?? '',
    evidenceType: n.evidenceType ?? '',
    connectionType: n.connectionType ?? '',
    strength: n.strength ?? 0,
    confidence: n.confidence ?? 0,
    aiReasoning: n.aiReasoning || undefined,
  };
}

function mapProtoDocContext(d: any): DocumentContext | undefined {
  if (!d) return undefined;
  return {
    evidenceId: d.evidenceId ?? '',
    fileName: d.fileName ?? '',
    fileType: d.fileType ?? '',
    description: d.description ?? '',
    aiSummary: d.aiSummary || undefined,
    aiTagsJson: d.aiTagsJson || undefined,
    keyEntitiesJson: d.keyEntitiesJson || undefined,
  };
}

function mapProtoResponse(response: any): EvidenceSearchResponse {
  return {
    results: (response.results ?? []).map(mapProtoResult),
    bundles: (response.bundles ?? []).map((b: any) => ({
      hit: mapProtoResult(b.hit),
      siblings: (b.siblings ?? []).map(mapProtoResult),
      sectionPath: b.sectionPath ?? [],
      heading: b.heading ?? '',
      citations: b.citations ?? [],
      graphNeighbors: (b.graphNeighbors ?? []).map(mapProtoNeighbor),
      documentContext: mapProtoDocContext(b.documentContext),
    })),
    timing: {
      embedMs: Math.round(response.timing?.embedMs ?? 0),
      searchMs: Math.round(response.timing?.searchMs ?? 0),
      rerankMs: Math.round(response.timing?.rerankMs ?? 0),
      hopMs: Math.round(response.timing?.hopMs ?? 0),
      kagMs: Math.round(response.timing?.kagMs ?? 0),
      dagMs: Math.round(response.timing?.dagMs ?? 0),
      totalMs: Math.round(response.timing?.totalMs ?? 0),
    },
    cacheSource: response.cacheSource || undefined,
  };
}

function mapCodebaseChunk(chunk: any): RetrievedCodebaseChunk {
  const sourceMetadata = chunk?.sourceMetadata ?? {};
  const scoreMetadata = chunk?.scoreMetadata ?? {};
  const clusterMetadata = chunk?.clusterMetadata ?? {};
  const timestamps = chunk?.timestamps ?? {};
  return {
    id: chunk?.id ?? chunk?.chunkId ?? '',
    chunkId: chunk?.chunkId ?? '',
    filePath: chunk?.filePath ?? sourceMetadata?.filePath ?? '',
    kind: chunk?.kind ?? '',
    httpMethod: chunk?.httpMethod ?? '',
    routeId: chunk?.routeId ?? sourceMetadata?.routeId ?? '',
    source: sourceMetadata?.source || undefined,
    sourceId: sourceMetadata?.sourceId || undefined,
    sourceType: sourceMetadata?.sourceType || undefined,
    url: sourceMetadata?.url || undefined,
    title: sourceMetadata?.title || undefined,
    collection: sourceMetadata?.collection || undefined,
    sourceMetadata:
      sourceMetadata?.metadata && typeof sourceMetadata.metadata === 'object'
        ? sourceMetadata.metadata
        : {},
    tags: Array.isArray(chunk?.tags) ? chunk.tags : [],
    contentPreview: chunk?.contentPreview ?? '',
    score: Number(scoreMetadata?.score ?? chunk?.score ?? 0),
    semanticScore:
      typeof scoreMetadata?.semanticScore === 'number' ? scoreMetadata.semanticScore : undefined,
    lexicalScore:
      typeof scoreMetadata?.lexicalScore === 'number' ? scoreMetadata.lexicalScore : undefined,
    rerankScore:
      typeof scoreMetadata?.rerankScore === 'number' ? scoreMetadata.rerankScore : undefined,
    clusterId: clusterMetadata?.clusterId || undefined,
    clusterType: clusterMetadata?.clusterType || undefined,
    gpuCluster:
      typeof clusterMetadata?.gpuCluster === 'number' ? clusterMetadata.gpuCluster : undefined,
    somCluster:
      typeof clusterMetadata?.somCluster === 'number' ? clusterMetadata.somCluster : undefined,
    bmuRow: typeof clusterMetadata?.bmuRow === 'number' ? clusterMetadata.bmuRow : undefined,
    bmuCol: typeof clusterMetadata?.bmuCol === 'number' ? clusterMetadata.bmuCol : undefined,
    createdAt: timestamps?.createdAt || undefined,
    updatedAt: timestamps?.updatedAt || undefined,
    indexedAt: timestamps?.indexedAt || undefined,
    startLine: chunk?.startLine ?? 0,
    endLine: chunk?.endLine ?? 0,
  };
}

function mapClusterContext(clusterMetadata: any): RetrievalClusterContext | undefined {
  if (!clusterMetadata || typeof clusterMetadata !== 'object') return undefined;

  return {
    clusterId: clusterMetadata?.clusterId || undefined,
    clusterType: clusterMetadata?.clusterType || undefined,
    gpuCluster:
      typeof clusterMetadata?.gpuCluster === 'number' ? clusterMetadata.gpuCluster : undefined,
    somCluster:
      typeof clusterMetadata?.somCluster === 'number' ? clusterMetadata.somCluster : undefined,
    bmuRow: typeof clusterMetadata?.bmuRow === 'number' ? clusterMetadata.bmuRow : undefined,
    bmuCol: typeof clusterMetadata?.bmuCol === 'number' ? clusterMetadata.bmuCol : undefined,
  };
}

function mapSearchChunksResponse(response: any): SearchChunksResponse {
  return {
    results: Array.isArray(response?.results) ? response.results.map(mapCodebaseChunk) : [],
    totalMs: Number(response?.totalMs ?? 0),
  };
}

function mapClusterSummaryResponse(response: any): ClusterSummaryLookupResponse {
  return {
    clusterId: Number(response?.clusterId ?? 0),
    summary: response?.summary ?? '',
    patterns: Array.isArray(response?.patterns) ? response.patterns : [],
    keywords: Array.isArray(response?.keywords) ? response.keywords : [],
    metadata: response?.metadata && typeof response.metadata === 'object' ? response.metadata : {},
  };
}

function mapAstExpansionResponse(response: any): AstExpansionResponse {
  return {
    neighbors: Array.isArray(response?.neighbors)
      ? response.neighbors.map((neighbor: any) => ({
          id: neighbor?.id ?? '',
          symbol: neighbor?.symbol ?? '',
          kind: neighbor?.kind ?? '',
          filePath: neighbor?.filePath ?? '',
        }))
      : [],
    edges: Array.isArray(response?.edges)
      ? response.edges.map((edge: any) => ({
          sourceId: edge?.sourceId ?? '',
          targetId: edge?.targetId ?? '',
          edgeType: edge?.edgeType ?? '',
        }))
      : [],
  };
}

function mapTopologyResponse(response: any): TopologyContextResponse {
  return {
    neighbors: Array.isArray(response?.neighbors) ? response.neighbors.map(mapCodebaseChunk) : [],
    somMetadataJson: response?.somMetadataJson || undefined,
    clusterMetadata: mapClusterContext(response?.clusterMetadata),
  };
}

function mapResearchContextResponse(response: any): ResearchContextResponse {
  return {
    research: Array.isArray(response?.research)
      ? response.research.map((chunk: any) => ({
          id: chunk?.id ?? chunk?.chunkId ?? '',
          chunkId: chunk?.chunkId ?? '',
          source: (chunk?.source ?? 'web_page') as ResearchSource,
          sourceId: chunk?.sourceMetadata?.sourceId || undefined,
          sourceType: chunk?.sourceMetadata?.sourceType || undefined,
          sourceMetadata:
            chunk?.sourceMetadata?.metadata && typeof chunk.sourceMetadata.metadata === 'object'
              ? chunk.sourceMetadata.metadata
              : {},
          url: chunk?.url ?? '',
          title: chunk?.title ?? '',
          body: chunk?.body ?? '',
          score: Number(chunk?.scoreMetadata?.score ?? chunk?.score ?? 0),
          semanticScore:
            typeof chunk?.scoreMetadata?.semanticScore === 'number'
              ? chunk.scoreMetadata.semanticScore
              : undefined,
          lexicalScore:
            typeof chunk?.scoreMetadata?.lexicalScore === 'number'
              ? chunk.scoreMetadata.lexicalScore
              : undefined,
          rerankScore:
            typeof chunk?.scoreMetadata?.rerankScore === 'number'
              ? chunk.scoreMetadata.rerankScore
              : undefined,
          tags: Array.isArray(chunk?.tags) ? chunk.tags : [],
          semanticTags: Array.isArray(chunk?.semanticTags) ? chunk.semanticTags : [],
          clusterId: chunk?.clusterMetadata?.clusterId || undefined,
          clusterType: chunk?.clusterMetadata?.clusterType || undefined,
          gpuCluster:
            typeof chunk?.clusterMetadata?.gpuCluster === 'number'
              ? chunk.clusterMetadata.gpuCluster
              : undefined,
          somCluster:
            typeof chunk?.clusterMetadata?.somCluster === 'number'
              ? chunk.clusterMetadata.somCluster
              : undefined,
          bmuRow:
            typeof chunk?.clusterMetadata?.bmuRow === 'number'
              ? chunk.clusterMetadata.bmuRow
              : undefined,
          bmuCol:
            typeof chunk?.clusterMetadata?.bmuCol === 'number'
              ? chunk.clusterMetadata.bmuCol
              : undefined,
          createdAt: chunk?.timestamps?.createdAt || undefined,
          updatedAt: chunk?.timestamps?.updatedAt || undefined,
          indexedAt: chunk?.timestamps?.indexedAt || undefined,
        }))
      : [],
    totalMs: Number(response?.totalMs ?? 0),
    source: 'grpc',
  };
}

export async function searchChunksViaGrpc(
  query: string,
  limit = 10,
  collection = 'codebase_chunks_768'
): Promise<SearchChunksResponse | null> {
  const response = await callGrpcMethod<any>('searchChunks', { query, limit, collection });
  return response ? mapSearchChunksResponse(response) : null;
}

export async function getClusterSummaryViaGrpc(
  clusterId: number,
  clusterType: 'gpu' | 'som' = 'gpu'
): Promise<ClusterSummaryLookupResponse | null> {
  const response = await callGrpcMethod<any>('getClusterSummary', { clusterId, clusterType });
  return response ? mapClusterSummaryResponse(response) : null;
}

export async function expandAstNeighborsViaGrpc(
  symbol?: string,
  filePath?: string,
  depth = 1
): Promise<AstExpansionResponse | null> {
  const response = await callGrpcMethod<any>('expandAstNeighbors', { symbol, filePath, depth });
  return response ? mapAstExpansionResponse(response) : null;
}

export async function getTopologyContextViaGrpc(
  bmuRow: number,
  bmuCol: number,
  radius = 1
): Promise<TopologyContextResponse | null> {
  const response = await callGrpcMethod<any>('getTopologyContext', { bmuRow, bmuCol, radius });
  return response ? mapTopologyResponse(response) : null;
}

export async function getResearchContextViaGrpc(opts: {
  query: string;
  limit?: number;
  sourceFilter?: ResearchSource[];
  scoreThreshold?: number;
  queryEmbedding?: number[];
}): Promise<ResearchContextResponse> {
  const response = await callGrpcMethod<any>('getResearchContext', {
    query: opts.query,
    limit: opts.limit ?? 5,
    sourceFilter: opts.sourceFilter ?? [],
    scoreThreshold: opts.scoreThreshold ?? 0.55,
    queryEmbedding: opts.queryEmbedding ?? [],
  });

  if (response) {
    return mapResearchContextResponse(response);
  }
  return {
    research: [],
    totalMs: 0,
    source: 'unavailable',
    error: 'gRPC getResearchContext unavailable',
  };
}

// ── SNES RPC Cache Bus — cached retrieval client ─────────────────────────
//
// Each public method wraps its gRPC call with withRpcCache() so repeated
// calls within the TTL window return from Redis (L1) rather than the Go
// service. TTLs and deadlines come from rpc-cache.ts constants.

export const retrievalClient = {
  searchChunks: async (query: string, limit = 10, collection = 'codebase_chunks_768') => {
    const args = { query, limit, collection };
    const { value } = await withRpcCache(
      args,
      async () => (await searchChunksViaGrpc(query, limit, collection)) ?? { results: [], totalMs: 0 },
      { transport: 'grpc', method: 'SearchChunks', ttlSeconds: RPC_TTL_SECONDS.grpc, deadlineMs: RPC_DEADLINES_MS['grpc.SearchChunks'] },
    );
    return value;
  },

  getClusterSummary: async (clusterId: number, clusterType: 'gpu' | 'som' = 'gpu') => {
    const args = { clusterId, clusterType };
    const { value } = await withRpcCache(
      args,
      async () => (await getClusterSummaryViaGrpc(clusterId, clusterType)) ?? { clusterId, summary: '', patterns: [], keywords: [], metadata: {} },
      { transport: 'grpc', method: 'GetClusterSummary', ttlSeconds: RPC_TTL_SECONDS.grpc, deadlineMs: RPC_DEADLINES_MS['grpc.GetClusterSummary'] },
    );
    return value;
  },

  expandAstNeighbors: async (symbol?: string, filePath?: string, depth = 1) => {
    const args = { symbol, filePath, depth };
    const { value } = await withRpcCache(
      args,
      async () => (await expandAstNeighborsViaGrpc(symbol, filePath, depth)) ?? { neighbors: [], edges: [] },
      { transport: 'grpc', method: 'ExpandAstNeighbors', ttlSeconds: RPC_TTL_SECONDS.grpc, deadlineMs: RPC_DEADLINES_MS['grpc.ExpandAstNeighbors'] },
    );
    return value;
  },

  getTopologyContext: async (bmuRow: number, bmuCol: number, radius = 1) => {
    const args = { bmuRow, bmuCol, radius };
    const { value } = await withRpcCache(
      args,
      async () => (await getTopologyContextViaGrpc(bmuRow, bmuCol, radius)) ?? { neighbors: [] },
      { transport: 'grpc', method: 'GetTopologyContext', ttlSeconds: RPC_TTL_SECONDS.grpc, deadlineMs: RPC_DEADLINES_MS['grpc.GetTopologyContext'] },
    );
    return value;
  },

  getResearchContext: async (opts: Parameters<typeof getResearchContextViaGrpc>[0]) => {
    const { value } = await withRpcCache(
      opts,
      () => getResearchContextViaGrpc(opts),
      { transport: 'grpc', method: 'GetResearchContext', ttlSeconds: RPC_TTL_SECONDS.grpc, deadlineMs: RPC_DEADLINES_MS['grpc.GetResearchContext'] },
    );
    return value;
  },

  health: checkRetrievalHealth,
};

// ── HTTP REST fast-path (go-retrieval-service :8100) ────────────────────
//
// Lower-latency alternative to gRPC that uses the service's /search/evidence
// REST endpoint — no proto codegen required.
// Controlled by RETRIEVAL_HTTP_ENABLED (default: false).

/**
 * Search evidence via Go retrieval service HTTP REST API.
 * Returns null if disabled/unavailable (caller falls through to inline TS pipeline).
 */
export async function searchEvidenceViaHttp(
  params: EvidenceSearchParams,
  timeoutMs = 10_000
): Promise<EvidenceSearchResponse | null> {
  if (!RETRIEVAL_HTTP_ENABLED) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${RETRIEVAL_HTTP_URL}/search/evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        query:        params.query,
        case_id:      params.caseId ?? '',
        limit:        params.limit ?? 10,
        jurisdiction: params.jurisdiction ?? '',
      }),
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[retrieval-client] HTTP /search/evidence returned ${res.status}`);
      return null;
    }

    const data = await res.json() as Record<string, unknown>;
    // The Go service returns proto-shaped JSON — reuse the proto mapper
    return mapProtoResponse(data);
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.warn('[retrieval-client] HTTP search failed:', (err as Error).message);
    }
    return null;
  }
}

// ── Health check ────────────────────────────────────────────────────────

/**
 * Check retrieval service health.
 * Probe order:
 *   1. gRPC RetrievalService      (if RETRIEVAL_GRPC_ENABLED)
 *   2. HTTP go-retrieval service   (if RETRIEVAL_HTTP_ENABLED, port 8100)
 *   3. HTTP go-search-service      (if GO_SEARCH_URL, port 8096)
 *   4. gRPC go-search-library      (port 50055, last resort)
 */
export async function checkRetrievalHealth(): Promise<{
  available: boolean;
  enabled: boolean;
  url: string;
  status?: string;
  pgvectorConnected?: boolean;
  qdrantConnected?: boolean;
  service?: string;
}> {
  const base = { enabled: RETRIEVAL_GRPC_ENABLED, url: RETRIEVAL_GRPC_URL };

  if (RETRIEVAL_GRPC_ENABLED) {
    const client = await getGrpcClient();
    if (!client) {
      return { ...base, available: false, service: 'retrieval-service' };
    }

    return new Promise((resolve) => {
      const deadline = new Date(Date.now() + 3000);
      client.health({ service: 'retrieval' }, { deadline }, (err: any, response: any) => {
        if (err) {
          resolve({ ...base, available: false, service: 'retrieval-service' });
          return;
        }
        resolve({
          ...base,
          available: response.status === 'healthy',
          status: response.status,
          pgvectorConnected: response.pgvectorConnected,
          qdrantConnected: response.qdrantConnected,
          service: 'retrieval-service',
        });
      });
    });
  }

  // Try HTTP health endpoint for Go retrieval service (port 8100)
  if (RETRIEVAL_HTTP_ENABLED) {
    try {
      const res = await fetch(`${RETRIEVAL_HTTP_URL}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        return {
          enabled: true,
          url: RETRIEVAL_HTTP_URL,
          available: data.status === 'healthy',
          status: data.status as string | undefined,
          pgvectorConnected: data.pgvectorConnected as boolean | undefined,
          qdrantConnected: data.qdrantConnected as boolean | undefined,
          service: 'go-retrieval-http',
        };
      }
    } catch { /* unavailable */ }
    return { enabled: true, url: RETRIEVAL_HTTP_URL, available: false, service: 'go-retrieval-http' };
  }

  // Try go-search-service HTTP health first (no gRPC deps)
  if (GO_SEARCH_URL) {
    try {
      const res = await fetch(`${GO_SEARCH_URL}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        return {
          enabled: true,
          url: GO_SEARCH_URL,
          available: data.status === 'healthy' || data.status === 'ok',
          status: data.status as string | undefined,
          service: 'go-search-http',
        };
      }
    } catch { /* fall through to gRPC probe */ }
  }

  const goBase = { enabled: false, url: GO_SEARCH_GRPC_URL };
  const client = await getGoSearchHealthClient();
  if (!client) {
    return { ...goBase, available: false, service: 'go-search-library' };
  }

  return new Promise((resolve) => {
    const deadline = new Date(Date.now() + 3000);
    const healthMethod =
      typeof client.Health === 'function'
        ? client.Health.bind(client)
        : client.health?.bind(client);

    if (!healthMethod) {
      resolve({ ...goBase, available: false, service: 'go-search-library' });
      return;
    }

    healthMethod({}, { deadline }, (err: any, response: any) => {
      if (err) {
        resolve({ ...goBase, available: false, service: 'go-search-library' });
        return;
      }
      resolve({
        ...goBase,
        available: response.status === 'healthy',
        status: response.status,
        pgvectorConnected: response.pgvectorConnected,
        qdrantConnected: response.qdrantConnected,
        service: 'go-search-library',
      });
    });
  });
}