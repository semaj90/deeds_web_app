export const EMBEDDING_CONTRACT = {
  model_id: 'embeddinggemma:latest',
  embedding_dimension: 384,
  normalization: 'L2' as const,
  qdrant_collection: 'codebase_chunks_384',
  validation: {
    min_norm_squared: 0.98,
    max_norm_squared: 1.02,
  },
} as const;

export function isValidEmbedding(embedding: number[] | Float32Array): boolean {
  if (embedding.length !== 384) return false;
  let normSq = 0;
  for (let i = 0; i < embedding.length; i++) normSq += embedding[i] * embedding[i];
  return normSq >= 0.98 && normSq <= 1.02;
}

export const CANONICAL_EMBEDDING_DIM = 384;
export const CANONICAL_QDRANT_COLLECTION = 'codebase_chunks_384';
