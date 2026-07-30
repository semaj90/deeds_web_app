export const CANONICAL_EMBEDDING_REPRESENTATION_ID = 'embeddinggemma_768_native_v1' as const;
export const CANONICAL_EMBEDDING_VECTOR_NAME = 'dense_768' as const;
export const CANONICAL_EMBEDDING_COLLECTION = 'codebase_chunks_768' as const;
export const CANONICAL_EMBEDDING_DIMENSIONS = 768 as const;
export const CANONICAL_EMBEDDING_NORMALIZATION = 'l2' as const;
export const CANONICAL_EMBEDDING_REDUCTION = 'none' as const;

export type CanonicalEmbeddingRepresentationId = typeof CANONICAL_EMBEDDING_REPRESENTATION_ID;
export type CanonicalEmbeddingVectorName = typeof CANONICAL_EMBEDDING_VECTOR_NAME;
export type CanonicalEmbeddingCollection = typeof CANONICAL_EMBEDDING_COLLECTION;
export type CanonicalEmbeddingNormalization = typeof CANONICAL_EMBEDDING_NORMALIZATION;
export type CanonicalEmbeddingReduction = typeof CANONICAL_EMBEDDING_REDUCTION;

export class CanonicalContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CanonicalContractError';
    this.code = code;
  }
}

export function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isFinite(item));
}

export function normalizeL2Vector(values: number[]): { values: number[]; norm: number } {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));

  if (!Number.isFinite(norm) || norm <= 0) {
    throw new CanonicalContractError(
      'dimension_not_768',
      'Cannot normalize an empty or zero-magnitude vector.'
    );
  }

  return {
    norm,
    values: values.map((value) => value / norm),
  };
}
