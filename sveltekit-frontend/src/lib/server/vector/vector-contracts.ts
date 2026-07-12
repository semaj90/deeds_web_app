/**
 * Vector Naming & Dimension Contracts
 *
 * Separated concerns:
 * - semantic_embedding (384-dim): canonical content similarity
 * - topology_embedding (128-dim): structural relationships
 * - latent_embedding (64-dim): routing and clustering
 *
 * Named vectors are NOT multivectors (which are token-level ColBERT-style).
 * Each named vector is a complete independent representation of the same point.
 */

/**
 * Canonical vector space names
 * These MUST match Qdrant collection named vector definitions exactly
 */
export type CodebaseVectorName = 'semantic_embedding' | 'topology_embedding' | 'latent_embedding';

/**
 * Authoritative vector dimensions
 * Used for validation BEFORE sending to Qdrant
 */
export const VECTOR_DIMENSIONS: Record<CodebaseVectorName, number> = {
  semantic_embedding: 384,
  topology_embedding: 128,
  latent_embedding: 64,
};

/**
 * Vector space metadata and retrieval strategy
 */
export const VECTOR_STRATEGIES: Record<
  CodebaseVectorName,
  {
    dimension: number;
    distance_metric: 'Cosine' | 'Euclidean' | 'DotProduct';
    use_case: string;
    score_threshold?: number;
  }
> = {
  semantic_embedding: {
    dimension: 384,
    distance_metric: 'Cosine',
    use_case: 'Semantic content similarity via embeddinggemma',
    score_threshold: 0.3,
  },
  topology_embedding: {
    dimension: 128,
    distance_metric: 'Cosine',
    use_case: 'Structural similarity for code topology',
    score_threshold: 0.5,
  },
  latent_embedding: {
    dimension: 64,
    distance_metric: 'Cosine',
    use_case: 'Routing features for clustering and cache selection',
    score_threshold: 0.4,
  },
};

/**
 * Dense search parameters with explicit vector space selection
 *
 * CRITICAL: The vectorName parameter MUST be specified
 * The caller MUST provide a vector matching the dimension
 * Dimension validation is non-negotiable before Qdrant call
 */
export interface DenseSearchParams {
  query: string;
  queryVector: number[];
  vectorName: CodebaseVectorName;
  collection?: string;
  limit?: number;
  scoreThreshold?: number;
  filter?: Record<string, unknown>;
  skipCache?: boolean;
}

/**
 * Dimension validation with detailed error reporting
 */
export function assertVectorDimension(
  vectorName: CodebaseVectorName,
  vector: number[]
): void {
  const expected = VECTOR_DIMENSIONS[vectorName];

  if (!vector || !Array.isArray(vector)) {
    throw new Error(`Vector must be an array for ${vectorName}`);
  }

  if (vector.length !== expected) {
    throw new Error(
      `Vector dimension mismatch for ${vectorName}: ` +
      `expected ${expected}, received ${vector.length}. ` +
      `Ensure embedding model output matches the named vector schema.`
    );
  }

  // Check for NaN or Infinity
  for (let i = 0; i < vector.length; i++) {
    if (!Number.isFinite(vector[i])) {
      throw new Error(
        `Vector contains non-finite value at index ${i} for ${vectorName}: ${vector[i]}`
      );
    }
  }
}

/**
 * Build Qdrant search payload with explicit vector naming
 *
 * Output format required by Qdrant when multiple named vectors exist:
 * {
 *   name: "semantic_embedding",
 *   vector: [0.1, 0.2, ...]
 * }
 */
export function buildQdrantVectorPayload(
  vectorName: CodebaseVectorName,
  vector: number[]
): { name: CodebaseVectorName; vector: number[] } {
  // Validate BEFORE building payload
  assertVectorDimension(vectorName, vector);

  return {
    name: vectorName,
    vector,
  };
}

/**
 * Default vector selection strategy
 *
 * When a caller doesn't specify a vector space, use semantic embedding.
 * This is the most general-purpose retrieval baseline.
 */
export const DEFAULT_VECTOR_NAME: CodebaseVectorName = 'semantic_embedding';

/**
 * Collection → Vector Schema mapping
 *
 * Documents which named vectors are available in which collections
 */
export const COLLECTION_VECTOR_SCHEMAS: Record<
  string,
  Partial<Record<CodebaseVectorName, number>>
> = {
  codebase_chunks_768: {
    // NOTE: This collection currently uses legacy 768-dim vectors
    // Should migrate to semantic_embedding (384), topology_embedding (128), latent_embedding (64)
    // For now, if this collection is queried, we need the old contracts
  },
  codebase_chunks_named: {
    semantic_embedding: 384,
    topology_embedding: 128,
    latent_embedding: 64,
  },
  code_structural_facts: {
    semantic_embedding: 384,
    topology_embedding: 128,
    latent_embedding: 64,
  },
};

/**
 * Qdrant search payload shape for API calls
 * This is what gets sent to Qdrant's /points/search endpoint
 */
export interface QdrantSearchPayload {
  vector: { name: CodebaseVectorName; vector: number[] };
  limit: number;
  score_threshold?: number;
  filter?: Record<string, unknown>;
  with_payload: boolean;
  with_vector: boolean;
}

/**
 * Build complete Qdrant search request
 */
export function buildQdrantSearchRequest(
  params: DenseSearchParams
): QdrantSearchPayload {
  const strategy = VECTOR_STRATEGIES[params.vectorName];

  return {
    vector: buildQdrantVectorPayload(params.vectorName, params.queryVector),
    limit: params.limit ?? 10,
    score_threshold: params.scoreThreshold ?? strategy.score_threshold,
    filter: params.filter,
    with_payload: true,
    with_vector: false,
  };
}

/**
 * PostgreSQL pgvector schema for canonical storage
 *
 * All three vector spaces are stored in the canonical Postgres row:
 * - semantic_embedding vector(384): primary retrieval baseline
 * - topology_embedding vector(128): structural similarity
 * - latent_embedding vector(64): routing/clustering
 *
 * Schema example:
 * CREATE TABLE codebase_structural_facts (
 *   id uuid PRIMARY KEY,
 *   packet_key text NOT NULL,
 *   source_ref text NOT NULL,
 *   semantic_embedding vector(384),
 *   topology_embedding vector(128),
 *   latent_embedding vector(64),
 *   ...
 * );
 */

export interface PostgresVectorRow {
  packet_key: string;
  source_ref: string;
  semantic_embedding?: number[] | null;
  topology_embedding?: number[] | null;
  latent_embedding?: number[] | null;
}

/**
 * Autoencoder provenance schema
 *
 * Document encoder model, training info, and validation metrics
 */
export interface EncoderProvenance {
  encoder: {
    model_id: string;
    input_dimension: number;
    output_dimension: number;
    checkpoint_hash: string;
    trained_at: string;
    normalization: 'l2' | 'none';
    reconstruction_mse: number;
  };
}

/**
 * SOM coordinates (NOT same as K-means clusters)
 *
 * SOM: 20x20 grid = 400 addressable cells
 * K-means: variable number of clusters (e.g., 20)
 */
export interface SOMCoordinates {
  som_row: number; // 0-19
  som_col: number; // 0-19
  som_index: number; // row * 20 + col = 0-399
}

/**
 * Cluster assignments (NOT SOM coordinates)
 */
export interface ClusterAssignments {
  kmeans_cluster?: number; // 0-k for K-means result
  community_id?: bigint; // Leiden/Louvain result
  pagerank?: number; // Graph authority score
}
