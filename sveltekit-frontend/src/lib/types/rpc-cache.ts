/**
 * SNES RPC Cache Bus — shared envelope type
 *
 * One canonical result shape across every RPC boundary:
 *   SvelteKit Remote Functions → gRPC → MCP → Qdrant → GPU → Postgres
 *
 * Every layer that wraps withRpcCache() returns this envelope so callers
 * can log, route, and invalidate uniformly regardless of transport.
 */

export type RpcTransport = 'remote-function' | 'grpc' | 'mcp' | 'qdrant' | 'gpu' | 'http';

export type RpcHitLevel =
  | 'L0_MEMORY'   // in-process memo (same request)
  | 'L1_REDIS'    // Redis exact key hit
  | 'L2_QDRANT'   // Qdrant semantic cache hit
  | 'L3_COMPUTE'  // Go gRPC / GPU compute
  | 'MISS';       // fully fresh result, written to cache

/**
 * Provenance — which data sources contributed to the payload.
 * Populated by compute functions; optional in cache hits.
 */
export interface RpcProvenance {
  qdrantIds?: string[];
  graphNodeIds?: string[];
  hyperedgeIds?: string[];
  clusterIds?: number[];
  somCells?: string[];
  grpcMethod?: string;
  mcpTool?: string;
}

/**
 * Canonical RPC cache envelope.
 * `payload` is the raw result; all other fields are cache/audit metadata.
 */
export interface RpcCacheEnvelope<T> {
  schemaVersion: 1;
  transport: RpcTransport;
  method: string;
  argsHash: string;
  cacheKey: string;
  ttlSeconds: number;
  createdAt: string;        // ISO-8601
  expiresAt: string;        // ISO-8601
  hitLevel: RpcHitLevel;
  payload: T;
  provenance?: RpcProvenance;
}

/**
 * Slim version returned from withRpcCache() — callers that only need
 * value + hit metadata can destructure this instead of the full envelope.
 */
export interface RpcCacheResult<T> {
  value: T;
  cache: {
    hit: boolean;
    hitLevel: RpcHitLevel;
    key: string;
    ttlSeconds: number;
  };
}

/**
 * Per-method deadline budgets (ms). Used by gRPC + MCP wrappers.
 * Keep in one place so they're easy to tune.
 */
export const RPC_DEADLINES_MS = {
  // gRPC retrieval
  'grpc.SearchChunks':          1500,
  'grpc.GetClusterSummary':      800,
  'grpc.ExpandAstNeighbors':    1000,
  'grpc.GetTopologyContext':    1500,
  'grpc.GetResearchContext':    3000,
  // MCP read-only tools
  'mcp.LLMS.md':               500,
  'mcp.codebase:search':        2000,
  'mcp.codebase:ace_context':   2000,
  'mcp.codebase:graph_neighbors': 1500,
  'mcp.cluster.summary.get':    1000,
  'mcp.chunk.lookup':            800,
  'mcp.rag:search':             2000,
  'mcp.gpu:similarity':          500,
  // GPU batch ops
  'gpu.centroidScoring':          100,
  'gpu.somNeighborhood':          100,
  'gpu.rerankBatch':              200,
  // Remote-function reads
  'rf.getGraphNode':              800,
  'rf.getClusterSummary':         800,
  'rf.getCacheStats':             200,
  'rf.getAgentsMd':               500,
  'rf.getTopologyCell':          1000,
} as const satisfies Record<string, number>;

/** TTL policy per transport × method pattern (seconds) */
export const RPC_TTL_SECONDS = {
  grpc:             300,   // 5 min — retrieval results
  mcp_readonly:    3600,   // 1 hr  — tool read results
  gpu_centroids:   3600,   // 1 hr  — centroid matrices stable across sessions
  gpu_rerank:        60,   // 1 min — query-specific
  remote_function:  300,   // 5 min — UI reads
  qdrant_query:     120,   // 2 min — semantic cache
} as const;
