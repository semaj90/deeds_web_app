/**
 * Canonical Embedding Contract v1
 * 
 * Defines the authoritative embedding dimensions, models, and Qdrant collections
 * for the Legal-AI platform. This is the single source of truth for embedding
 * dimensions across all retrieval lanes.
 * 
 * EmbeddingGemma outputs 768 dimensions natively. Matryoshka truncations
 * are supported at 512, 256, 128 (not 384).
 */

export const EMBEDDING_CONTRACT = {
  model_id: process.env.PRIMARY_EMBEDDING_MODEL ?? 'embeddinggemma:latest',
  embedding_dimension: 768,
  qdrant_collection: 'codebase_chunks_768',
  matryoshka: [128, 256, 512, 768],
  legacy_384_collection: 'codebase_chunks_384_hybrid'
} as const;

export type EmbeddingContract = typeof EMBEDDING_CONTRACT;

export function validateEmbeddingDimensions(dim: number): { valid: boolean; reason?: string } {
  if (dim === EMBEDDING_CONTRACT.embedding_dimension) return { valid: true };
  if (EMBEDDING_CONTRACT.matryoshka.includes(dim)) return { valid: true, reason: 'Matryoshka projection ' + dim + 'd supported' };
  if (dim === 384) return { valid: false, reason: 'Dimension ' + dim + ' is legacy 384 contract' };
  return { valid: false, reason: 'Unsupported dimension ' + dim + '. Supported: ' + EMBEDDING_CONTRACT.embedding_dimension + ', ' + EMBEDDING_CONTRACT.matryoshka.join(', ') };
}

export function getQdrantCollectionForDimension(dim: number): string {
  const v = validateEmbeddingDimensions(dim);
  if (!v.valid) throw new Error('getQdrantCollectionForDimension(' + dim + '): ' + v.reason);
  return EMBEDDING_CONTRACT.qdrant_collection;
}

export const CANONICAL_EMBEDDING_DIM = EMBEDDING_CONTRACT.embedding_dimension;
export const CANONICAL_EMBEDDING_MODEL = EMBEDDING_CONTRACT.model_id;
export const CANONICAL_QDRANT_COLLECTION = EMBEDDING_CONTRACT.qdrant_collection;

export function assertCanonicalEmbeddingDimensions(vector: number[] | Float32Array): void {
  const dim = vector.length;
  const v = validateEmbeddingDimensions(dim);
  if (!v.valid) throw new Error('assertCanonicalEmbeddingDimensions: Expected ' + EMBEDDING_CONTRACT.embedding_dimension + 'd embedding, got ' + dim + 'd. ' + v.reason);
}

export interface ResolvedEmbeddingLane {
  model: string;
  dimensions: number;
  collection: string;
  projection: string;
}

export function resolveEmbeddingLane(vector: number[] | Float32Array, modelOverride?: string): ResolvedEmbeddingLane {
  const dim = vector.length;
  const model = modelOverride ?? EMBEDDING_CONTRACT.model_id;
  if (dim === EMBEDDING_CONTRACT.embedding_dimension) return { model, dimensions: dim, collection: EMBEDDING_CONTRACT.qdrant_collection, projection: 'canonical' };
  if (EMBEDDING_CONTRACT.matryoshka.includes(dim)) return { model, dimensions: dim, collection: EMBEDDING_CONTRACT.qdrant_collection, projection: 'matryoshka' };
  if (dim === 384) return { model, dimensions: dim, collection: EMBEDDING_CONTRACT.legacy_384_collection, projection: 'legacy' };
  throw new Error('resolveEmbeddingLane: Unsupported dimension ' + dim + '. Supported: ' + EMBEDDING_CONTRACT.embedding_dimension + ', ' + EMBEDDING_CONTRACT.matryoshka.join(', ') + ', 384 (legacy)');
}

