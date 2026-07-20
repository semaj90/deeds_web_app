/**
 * Unified retrieval types for Phase 3 GPU Acceleration
 * Consolidates RawCandidate, QdrantSearchResult, and GpuSearchCandidate into single SearchResult
 */

/**
 * Search lanes available in the retrieval pipeline
 */
export type SearchLane = 'qdrant' | 'gpu-cuvs' | 'bm25' | 'lexical' | 'turbovec' | 'hybrid';

/**
 * Unified search result type used across all retrieval endpoints
 * Replaces: RawCandidate, QdrantSearchResult, GpuSearchCandidate, SearchCandidate
 */
export interface SearchResult {
  /** Unique identifier from the search backend */
  id: string;

  /** Rank in the result set (0-indexed) */
  rank: number;

  /** Relevance score [0, 1] from the search backend */
  score: number;

  /** Confidence in the result [0, 1], source-specific */
  confidence: number;

  /** Which search lane produced this result */
  source: SearchLane;

  /** Canonical packet identity */
  packet_key: string | null;

  /** File/module reference */
  source_ref: string | null;

  /** Code feature identifier */
  feature_id: string | null;

  /** File path */
  file_path: string | null;

  /** Human-readable summary */
  summary: string | null;

  /** Backend-specific metadata */
  metadata: {
    /** Qdrant point ID if from Qdrant */
    qdrant_point_id?: string;

    /** Qdrant collection name */
    qdrant_collection?: string;

    /** GPU search indices if from cuVS */
    gpu_indices?: number[];

    /** GPU search distances */
    gpu_distances?: number[];

    /** Full Qdrant payload (cached) */
    payload?: Record<string, unknown>;

    /** TurboVec rerank score if applicable */
    turbovec_score?: number;

    /** SOM grid coordinates if available */
    som_cell_x?: number;
    som_cell_y?: number;

    /** KMeans cluster if available */
    kmeans_cluster_id?: number;

    /** Reranker features if computed */
    reranker_features?: Record<string, number>;

    /** Updated timestamp if available */
    updated_at?: string | Date;

    /** Any additional lane-specific metadata */
    [key: string]: unknown;
  };
}

/**
 * Request contract for unified search
 */
export interface SearchRequest {
  /** Query string or pre-embedded vector */
  query: string | Float32Array;

  /** Number of results to return */
  k?: number;

  /** Embedding dimension override (default: 384 for GPU, 768 for Qdrant) */
  embedding_dim?: number;

  /** Filter by packet_key if known */
  packet_key?: string;

  /** Filter by source_ref pattern */
  source_ref?: string;

  /** Filter by feature_id */
  feature_id?: string;

  /** Which search lanes to use (default: ['qdrant', 'gpu-cuvs']) */
  lanes?: SearchLane[];

  /** Summarize results via LLM */
  summarize?: boolean;

  /** Include full payload in metadata (may be large) */
  full_payload?: boolean;
}

/**
 * Response contract for unified search
 */
export interface SearchResponse {
  /** Ranked candidates */
  candidates: SearchResult[];

  /** Execution timing breakdown */
  timing: {
    /** Total request time */
    total_ms: number;

    /** Embedding generation */
    embed_ms?: number;

    /** Qdrant search */
    qdrant_ms?: number;

    /** GPU search */
    gpu_ms?: number;

    /** PostgreSQL join */
    postgres_ms?: number;

    /** Reranking */
    rerank_ms?: number;

    /** LLM summary (if requested) */
    summary_ms?: number;
  };

  /** Execution metadata */
  metadata: {
    /** Lanes that were attempted */
    lanes_attempted: SearchLane[];

    /** Lanes that succeeded */
    lanes_succeeded: SearchLane[];

    /** Lanes that failed and fallback was used */
    lanes_failed: SearchLane[];

    /** Total candidates before reranking */
    candidates_before_rerank?: number;

    /** Final candidate count */
    candidates_count: number;

    /** Whether results were truncated */
    truncated: boolean;

    /** Query embedding used (for cache key) */
    query_embedding_hash?: string;

    /** Any error messages from failed lanes (non-blocking) */
    warnings?: string[];
  };

  /** Optional LLM summary */
  summary?: string;
}

/**
 * Filter for search results
 */
export interface SearchFilter {
  /** Minimum confidence threshold */
  min_confidence?: number;

  /** Minimum score threshold */
  min_score?: number;

  /** Allowed search lanes */
  lanes?: SearchLane[];

  /** Exclude certain feature_ids */
  exclude_feature_ids?: string[];

  /** Only include specific packet_keys */
  include_packet_keys?: string[];
}

/**
 * Lane configuration for search
 */
export interface SearchLaneConfig {
  /** Whether this lane is enabled */
  enabled: boolean;

  /** Priority order (lower = higher priority) */
  priority: number;

  /** Weight in RRF fusion [0, 1] */
  weight: number;

  /** Fallback lane if this one fails */
  fallback?: SearchLane;

  /** Lane-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Embedding service result
 */
export interface EmbeddingResult {
  /** The embedding vector */
  vector: Float32Array;

  /** Model used */
  model: string;

  /** Embedding dimension */
  dimension: number;

  /** Whether result came from cache */
  cached: boolean;

  /** Cache level (L1/L2/none) */
  cache_level?: 'L1' | 'L2';

  /** Execution time in ms */
  exec_ms: number;
}

/**
 * Backward compatibility: alias for old RawCandidate type
 */
export type RawCandidate = SearchResult & {
  lane: string;
  data: {
    packet_key: string | null;
    source_ref: string | null;
    canonical_source_ref: string | null;
    source_ref_key: string | null;
    file_path: string | null;
    feature_id: string | null;
    qdrant_point_id: string | null;
    qdrant_collection: string;
    payload: any;
    fusion_score: number;
  };
};
