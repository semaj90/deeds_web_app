export const CANONICAL_EMBEDDING_DIMENSION = 768;

export type EmbeddingLane = 'canonical_768d' | 'legacy_384d';
export type ExpectedEmbeddingDim = 384 | 768;

const LEGACY_DIMENSIONS = new Set([384]);

export function assertEmbeddingDimension(
  embedding: readonly number[],
  lane: EmbeddingLane = 'canonical_768d',
  expectedDimension: ExpectedEmbeddingDim = CANONICAL_EMBEDDING_DIMENSION
): void {
  if (!Array.isArray(embedding)) {
    throw new Error(`Expected embedding array for ${lane}, got ${typeof embedding}`);
  }

  if (!Number.isInteger(expectedDimension) || expectedDimension <= 0) {
    throw new Error(`Invalid expected embedding dimension for ${lane}: ${expectedDimension}`);
  }

  if (embedding.length !== expectedDimension) {
    const legacyHint = LEGACY_DIMENSIONS.has(embedding.length)
      ? 'Legacy 384d lane detected; do not write into the canonical 768d path.'
      : null;
    throw new Error(
      [
        `Embedding dimension mismatch for ${lane}: expected ${expectedDimension}, got ${embedding.length}.`,
        legacyHint,
      ]
        .filter(Boolean)
        .join(' ')
    );
  }
}

export function assertEmbeddingDim(
  vector: readonly number[],
  expectedDim: ExpectedEmbeddingDim = CANONICAL_EMBEDDING_DIMENSION,
  lane: string = 'canonical_768d'
): void {
  assertEmbeddingDimension(vector, lane as EmbeddingLane, expectedDim);
}
