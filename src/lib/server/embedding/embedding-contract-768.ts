/**
 * Get the appropriate Qdrant collection for a given dimension.
 * Returns production collection for 768-dim.
 */
export function getQdrantCollectionForDimension(dim: number): string {
  if (dim === 768) return EMBEDDING_CONTRACT.qdrant_collection;
  throw new Error(`Unsupported dimension for Qdrant collection: ${dim}`);
}

/**
 * Export canonical dimension constants
 */
export const CANONICAL_EMBEDDING_DIM = EMBEDDING_CONTRACT.embedding_dimension; // 768
export const CANONICAL_EMBEDDING_MODEL = EMBEDDING_CONTRACT.model_id;
export const CANONICAL_QDRANT_COLLECTION = EMBEDDING_CONTRACT.qdrant_collection; // codebase_chunks_768
