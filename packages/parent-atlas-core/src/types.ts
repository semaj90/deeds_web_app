/**
 * Parent Atlas Core Types
 * Canonical packet identity, retrieval contracts, and performance metrics
 */

/**
 * Canonical packet identity (immutable)
 * Postgres atlas_packets is truth; Qdrant/Neo4j/Redis are mirrors
 */
export interface PacketIdentity {
  directory_path: string; // e.g., "src/lib/server"
  source_ref: string; // e.g., "src/lib/server/auth.ts"
  file_path: string; // absolute or relative
  function_symbol?: string; // optional: "validateSession"
  feature_id: string; // e.g., "auth.sessions"
  feature_label: string; // e.g., "Authentication Sessions"
  packet_key: string; // unique identifier
}

/**
 * Enriched packet with retrieval metadata
 */
export interface Packet extends PacketIdentity {
  id: string; // duplicate of packet_key for compatibility
  summary: string; // one-liner description
  embedding?: Float32Array; // 768-dim (deprecated in atlas_packets)
  embedding_384?: Float32Array; // canonical 384-dim from codebase_chunk_index
  qdrant_point_id?: string; // reference to Qdrant point
  som_cluster?: number; // SOM cluster assignment
  pagerank_score?: number; // Neo4j PageRank
  karpathy_blend?: number; // 0.4*PR + 0.3*attn + 0.3*authority
  metadata?: Record<string, any>; // flexible extensions
}

/**
 * Retrieval result with scoring
 */
export interface RetrievalResult {
  packet: Packet;
  score: number; // [0, 1] relevance score
  scoreComponents?: {
    semantic?: number; // Qdrant cosine
    topology?: number; // Neo4j neighbor
    pagerank?: number; // Graph authority
    recency?: number; // Temporal freshness
  };
  source: 'qdrant' | 'neo4j' | 'redis' | 'bifrost'; // where it came from
  latencyMs: number; // retrieval time
}

/**
 * Cache entry metadata
 */
export interface CacheEntry<T> {
  key: string;
  value: T;
  ttl: number; // seconds
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
  lastAccessAt: Date;
}

/**
 * GPU acceleration metrics
 */
export interface GPUMetrics {
  totalCalls: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  cudaAvailable: boolean;
  cudaDevices: number;
  vramUsedMb: number;
  vramTotalMb: number;
  thermalStatusC?: number;
}

/**
 * Retrieval pipeline trace for debugging
 */
export interface RetrievalTrace {
  queryId: string;
  query: string;
  timestamp: Date;
  stages: {
    bifrost?: { hitMs: number; hit: boolean };
    qdrant?: {
      queryMs: number;
      resultCount: number;
      topScore: number;
    };
    turbovec?: {
      prefilterMs: number;
      rerankerMs: number;
      resultCount: number;
    };
    neo4j?: {
      queryMs: number;
      hopsUsed: number;
      resultCount: number;
    };
    libtorch?: {
      batchMs: number;
      vectorCount: number;
    };
  };
  totalMs: number;
  cacheHitRate: number; // [0, 1]
  selectedPackets: string[]; // packet_keys
}

/**
 * Policy orchestrator trace for training
 */
export interface PolicyTrace {
  traceId: string;
  userQuery: string;
  decomposition?: {
    subgoals: number;
    intent: string;
  };
  retrieval?: {
    totalCandidates: number;
    scored: number;
    selected: number;
  };
  policyScores?: {
    min: number;
    max: number;
    mean: number;
  };
  userFeedback?: {
    helpfulness: number; // 1-5
    accuracy: number; // 1-5
    citedPackets: string[]; // which ones were useful
  };
  reward?: {
    baseReward: number;
    packetRewards: Map<string, number>;
  };
  timestamp: Date;
}

/**
 * Search query input (user-facing)
 */
export interface SearchQuery {
  text: string;
  limit?: number;
  filters?: {
    sourceType?: 'code' | 'docs' | 'web' | 'legal';
    language?: string[];
    tags?: string[];
  };
  context?: {
    caseId?: string;
    userId?: string;
    previousContext?: string;
  };
}

/**
 * Search response (user-facing)
 */
export interface SearchResponse {
  query: string;
  results: RetrievalResult[];
  totalCount: number;
  hasMore: boolean;
  nextCursor?: string;
  trace: RetrievalTrace;
}

/**
 * Performance benchmark result
 */
export interface BenchmarkResult {
  name: string;
  operationMs: number;
  itemCount: number;
  throughput: number; // items/sec
  memorySizeMb: number;
  gpuUsedMs?: number;
  cpuUsedMs?: number;
  gpuSpeedup?: number;
  timestamp: Date;
}

/**
 * Configuration contract
 */
export interface AtlasConfig {
  // Database
  postgresUrl: string;
  // Caching
  redisUrl: string;
  bifrostUrl?: string;
  // Retrieval
  qdrantUrl: string;
  neo4jUrl: string;
  // GPU
  gpuEnabled: boolean;
  cudaDeviceId?: number;
  // Policy
  policyModelPath?: string;
  workerCount?: number;
  tokenBudget?: number;
  // Timeouts
  timeoutMs: number;
}

/**
 * Health check result
 */
export interface HealthCheck {
  healthy: boolean;
  timestamp: Date;
  services: {
    postgres?: { healthy: boolean; latencyMs?: number };
    redis?: { healthy: boolean; latencyMs?: number };
    qdrant?: { healthy: boolean; latencyMs?: number };
    neo4j?: { healthy: boolean; latencyMs?: number };
    bifrost?: { healthy: boolean; latencyMs?: number };
    turbovec?: { healthy: boolean; latencyMs?: number };
    gpu?: { healthy: boolean; device?: string };
  };
  errors?: string[];
}