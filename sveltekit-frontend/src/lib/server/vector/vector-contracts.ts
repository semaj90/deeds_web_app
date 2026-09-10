import { CANONICAL_EMBEDDING_DIMENSION } from '../atlas/contracts/canonical-chunk-contract.js';

/**
 * Vector naming and dimension contracts.
 *
 * Active semantic authority is EmbeddingGemma semantic_768. Topology/routing
 * representations are independent spaces. Historical 384 collections remain
 * explicitly decodable for migration/replay but are never selected by default.
 */
export type CodebaseVectorName =
  | 'semantic_embedding'
  | 'topology_embedding'
  | 'latent_embedding'
  | 'content'
  | 'summary'
  | 'synthesis'
  | 'error'
  | 'signature';

export const VECTOR_DIMENSIONS: Record<CodebaseVectorName, number> = {
  semantic_embedding: CANONICAL_EMBEDDING_DIMENSION,
  topology_embedding: 128,
  latent_embedding: 64,
  content: CANONICAL_EMBEDDING_DIMENSION,
  summary: CANONICAL_EMBEDDING_DIMENSION,
  synthesis: CANONICAL_EMBEDDING_DIMENSION,
  error: CANONICAL_EMBEDDING_DIMENSION,
  signature: CANONICAL_EMBEDDING_DIMENSION,
};

export const VECTOR_STRATEGIES: Record<
  CodebaseVectorName,
  {
    dimension: number;
    distance_metric: 'Cosine' | 'Euclidean' | 'DotProduct';
    use_case: string;
    score_threshold?: number;
  }
> = {
  semantic_embedding: { dimension: CANONICAL_EMBEDDING_DIMENSION, distance_metric: 'Cosine', use_case: 'Semantic content similarity via EmbeddingGemma semantic_768', score_threshold: 0.3 },
  topology_embedding: { dimension: 128, distance_metric: 'Cosine', use_case: 'Structural similarity for code topology', score_threshold: 0.5 },
  latent_embedding: { dimension: 64, distance_metric: 'Cosine', use_case: 'Routing features for clustering and cache selection', score_threshold: 0.4 },
  content: { dimension: CANONICAL_EMBEDDING_DIMENSION, distance_metric: 'Cosine', use_case: 'Native semantic_768 content vector for dense retrieval', score_threshold: 0.3 },
  summary: { dimension: CANONICAL_EMBEDDING_DIMENSION, distance_metric: 'Cosine', use_case: 'KAG/ACE summary-lens similarity', score_threshold: 0.3 },
  synthesis: { dimension: CANONICAL_EMBEDDING_DIMENSION, distance_metric: 'Cosine', use_case: 'Synthesis-memory similarity', score_threshold: 0.3 },
  error: { dimension: CANONICAL_EMBEDDING_DIMENSION, distance_metric: 'Cosine', use_case: 'Native semantic_768 error relevance', score_threshold: 0.3 },
  signature: { dimension: CANONICAL_EMBEDDING_DIMENSION, distance_metric: 'Cosine', use_case: 'Native semantic_768 structural signature', score_threshold: 0.3 },
};

export interface DenseSearchParams {
  query: string;
  queryVector: number[];
  vectorName: CodebaseVectorName;
  collection?: string;
  limit?: number;
  scoreThreshold?: number;
  filter?: Record<string, unknown>;
  skipCache?: boolean;
  efSearch?: number;
}

export function assertVectorDimension(vectorName: CodebaseVectorName, vector: number[]): void {
  const expected = VECTOR_DIMENSIONS[vectorName];
  if (!vector || !Array.isArray(vector)) throw new Error(`Vector must be an array for ${vectorName}`);
  if (vector.length !== expected) {
    throw new Error(`Vector dimension mismatch for ${vectorName}: expected ${expected}, received ${vector.length}. Ensure embedding model output matches the named vector schema.`);
  }
  for (let index = 0; index < vector.length; index += 1) {
    if (!Number.isFinite(vector[index])) throw new Error(`Vector contains non-finite value at index ${index} for ${vectorName}: ${vector[index]}`);
  }
}

export function buildQdrantVectorPayload(
  vectorName: CodebaseVectorName,
  vector: number[],
): { name: CodebaseVectorName; vector: number[] } {
  assertVectorDimension(vectorName, vector);
  return { name: vectorName, vector };
}

export const DEFAULT_VECTOR_NAME: CodebaseVectorName = 'semantic_embedding';

export const COLLECTION_VECTOR_SCHEMAS: Record<
  string,
  Partial<Record<CodebaseVectorName, number>>
> = {
  codebase_chunks_768_v2: { content: CANONICAL_EMBEDDING_DIMENSION },
  codebase_chunks_768: { content: CANONICAL_EMBEDDING_DIMENSION },
  codebase_chunks_multivector: {
    semantic_embedding: CANONICAL_EMBEDDING_DIMENSION,
    topology_embedding: 128,
    latent_embedding: 64,
  },
  code_structural_facts: {
    semantic_embedding: CANONICAL_EMBEDDING_DIMENSION,
    topology_embedding: 128,
    latent_embedding: 64,
  },
};

export interface QdrantSearchPayload {
  vector: { name: CodebaseVectorName; vector: number[] };
  limit: number;
  score_threshold?: number;
  filter?: Record<string, unknown>;
  with_payload: boolean;
  with_vector: boolean;
  params?: { hnsw_ef: number };
}

export function buildQdrantSearchRequest(params: DenseSearchParams): QdrantSearchPayload {
  const strategy = VECTOR_STRATEGIES[params.vectorName];
  const payload: QdrantSearchPayload = {
    vector: buildQdrantVectorPayload(params.vectorName, params.queryVector),
    limit: params.limit ?? 10,
    score_threshold: params.scoreThreshold ?? strategy.score_threshold,
    filter: params.filter,
    with_payload: true,
    with_vector: false,
  };
  if (params.efSearch !== undefined) payload.params = { hnsw_ef: params.efSearch };
  return payload;
}

export interface PostgresVectorRow {
  packet_key: string;
  source_ref: string;
  semantic_embedding?: number[] | null;
  topology_embedding?: number[] | null;
  latent_embedding?: number[] | null;
}

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

export interface SOMCoordinates {
  som_row: number;
  som_col: number;
  som_index: number;
}

export interface ClusterAssignments {
  kmeans_cluster?: number;
  community_id?: bigint;
  pagerank?: number;
}

export interface DenseEmbedding {
  values: number[];
  model: string;
  dimension: number;
  version: string;
}

export interface SparseEncoding {
  indices: number[];
  values: number[];
  encoderVersion: string;
  vocabularyVersion: string;
}

export function assertDenseEmbedding(e: DenseEmbedding, expectedDim: number): void {
  if (e.dimension !== expectedDim || e.values.length !== expectedDim) {
    throw new Error(`Dense embedding contract mismatch: got ${e.dimension}/${e.values.length}, expected ${expectedDim}`);
  }
  if (e.values.some((value) => !Number.isFinite(value))) throw new Error('Dense embedding contains non-finite values');
}

export type SparseVectorName = 'bm42';

export interface CollectionContract {
  contractVersion: string;
  denseVectors: Partial<Record<CodebaseVectorName, number>>;
  sparseVectors?: SparseVectorName[];
  primaryDenseVector: CodebaseVectorName;
  primaryDimension: number;
  lifecycle: 'ACTIVE' | 'REFERENCE_ONLY' | 'LEGACY_MIGRATION_ONLY';
  description: string;
}

export const COLLECTION_CONTRACTS: Record<string, CollectionContract> = {
  codebase_chunks_768_v2: {
    contractVersion: 'atlas-qdrant-768-semantic-v2',
    denseVectors: { content: 768 },
    primaryDenseVector: 'content',
    primaryDimension: 768,
    lifecycle: 'ACTIVE',
    description: 'Active rebuildable Qdrant projection for native EmbeddingGemma semantic_768.',
  },
  codebase_chunks_768: {
    contractVersion: 'atlas-qdrant-768-source-v1',
    denseVectors: { content: 768 },
    primaryDenseVector: 'content',
    primaryDimension: 768,
    lifecycle: 'REFERENCE_ONLY',
    description: 'Pre-v2 native EmbeddingGemma 768 source/reference collection retained for parity checks.',
  },
  codebase_chunks_384_hybrid: {
    contractVersion: 'atlas-qdrant-384-hybrid-v1',
    denseVectors: { content: 384 },
    sparseVectors: ['bm42'],
    primaryDenseVector: 'content',
    primaryDimension: 384,
    lifecycle: 'LEGACY_MIGRATION_ONLY',
    description: 'Historical Atlas 384 hybrid lane; not EmbeddingGemma MRL and never semantic authority.',
  },
  codebase_chunks_384: {
    contractVersion: 'atlas-qdrant-384-dense-v1',
    denseVectors: { content: 384 },
    primaryDenseVector: 'content',
    primaryDimension: 384,
    lifecycle: 'LEGACY_MIGRATION_ONLY',
    description: 'Historical Atlas 384 dense replay lane. New reads/writes use codebase_chunks_768_v2.',
  },
};

/** Active rebuildable semantic projection — native EmbeddingGemma semantic_768. */
export const CANONICAL_SOURCE_COLLECTION = 'codebase_chunks_768_v2' as const;

/** Pre-v2 768 reference collection; dimension is still 768, authority is not. */
export const REFERENCE_SOURCE_COLLECTION = 'codebase_chunks_768' as const;

/** @deprecated Legacy 384 hybrid migration/reference lane; never canonical. */
export const CANONICAL_HYBRID_COLLECTION = 'codebase_chunks_384_hybrid' as const;

/** @deprecated Legacy 384 dense migration/reference lane; never canonical. */
export const TRANSITIONAL_DENSE_COLLECTION = 'codebase_chunks_384' as const;
