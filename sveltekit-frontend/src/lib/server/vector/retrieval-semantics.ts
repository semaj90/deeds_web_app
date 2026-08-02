export const QDRANT_SOURCE_COLLECTION = 'codebase_chunks_768_v2' as const;
export const QDRANT_HYBRID_COLLECTION = 'codebase_chunks_768_v2' as const;
export const QDRANT_DENSE_FALLBACK_COLLECTION = QDRANT_HYBRID_COLLECTION;

export const QDRANT_SOURCE_EMBEDDING_DIMENSION = 768 as const;
export const QDRANT_RETRIEVAL_EMBEDDING_DIMENSION = 768 as const;

export const QDRANT_DENSE_VECTOR_NAME = 'content' as const;
// Canonical sparse vector name per qdrant-collection-contracts.ts
export const QDRANT_SPARSE_VECTOR_NAME = 'bm42' as const;
export const QDRANT_FUSION_STRATEGY = 'rrf' as const;

export const QDRANT_COLLECTION_BY_TIER = {
  hot: QDRANT_HYBRID_COLLECTION,
  warm: QDRANT_HYBRID_COLLECTION,
  cold: QDRANT_SOURCE_COLLECTION,
} as const;

export const EMBEDDINGGEMMA_PREFIX768_RETRIEVAL_CONTRACT = {
  embeddingContract: 'embeddinggemma-prefix768-v1',
  sourceEmbeddingDimension: QDRANT_SOURCE_EMBEDDING_DIMENSION,
  retrievalEmbeddingDimension: QDRANT_RETRIEVAL_EMBEDDING_DIMENSION,
  truncation: 'none',
  canonical: true,
  denseVectorName: QDRANT_DENSE_VECTOR_NAME,
  sparseVectorName: QDRANT_SPARSE_VECTOR_NAME,
  fusionStrategy: QDRANT_FUSION_STRATEGY,
  sourceCollection: QDRANT_SOURCE_COLLECTION,
  denseCollection: QDRANT_HYBRID_COLLECTION,
  fallbackCollection: QDRANT_DENSE_FALLBACK_COLLECTION,
} as const;

export const EMBEDDINGGEMMA_PREFIX384_RETRIEVAL_CONTRACT =
  EMBEDDINGGEMMA_PREFIX768_RETRIEVAL_CONTRACT;

/**
 * Compatibility alias for legacy callers.
 *
 * The canonical dense retrieval contract is 768/v2. Keep this alias only for
 * code paths that still expect the older 384 retrieval naming.
 */

export type QdrantRetrievalSemantics =
  typeof EMBEDDINGGEMMA_PREFIX768_RETRIEVAL_CONTRACT;
