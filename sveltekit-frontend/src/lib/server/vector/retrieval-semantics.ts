export const QDRANT_HYBRID_COLLECTION = 'codebase_chunks_384_hybrid' as const;
export const QDRANT_DENSE_FALLBACK_COLLECTION = 'codebase_chunks_384' as const;

export const QDRANT_SOURCE_EMBEDDING_DIMENSION = 768 as const;
export const QDRANT_RETRIEVAL_EMBEDDING_DIMENSION = 384 as const;

export const QDRANT_DENSE_VECTOR_NAME = 'content' as const;
export const QDRANT_SPARSE_VECTOR_NAME = 'bm42_sparse' as const;
export const QDRANT_FUSION_STRATEGY = 'rrf' as const;

export const EMBEDDINGGEMMA_PREFIX384_RETRIEVAL_CONTRACT = {
  embeddingContract: 'embeddinggemma-prefix384-v1',
  sourceEmbeddingDimension: QDRANT_SOURCE_EMBEDDING_DIMENSION,
  retrievalEmbeddingDimension: QDRANT_RETRIEVAL_EMBEDDING_DIMENSION,
  truncation: 'prefix',
  canonical: false,
  denseVectorName: QDRANT_DENSE_VECTOR_NAME,
  sparseVectorName: QDRANT_SPARSE_VECTOR_NAME,
  fusionStrategy: QDRANT_FUSION_STRATEGY,
  denseCollection: QDRANT_HYBRID_COLLECTION,
  fallbackCollection: QDRANT_DENSE_FALLBACK_COLLECTION,
} as const;

export type QdrantRetrievalSemantics =
  typeof EMBEDDINGGEMMA_PREFIX384_RETRIEVAL_CONTRACT;
