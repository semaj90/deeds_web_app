import { describe, expect, it } from 'vitest';
import {
  assertEmbeddingDim,
  assertEmbeddingDimension,
  CANONICAL_EMBEDDING_DIMENSION
} from './embedding-dimension-guard.js';

describe('embedding-dimension-guard', () => {
  it('accepts the canonical 768d lane', () => {
    expect(() =>
      assertEmbeddingDimension(new Array(CANONICAL_EMBEDDING_DIMENSION).fill(0), 'canonical_768d')
    ).not.toThrow();
  });

  it('rejects legacy 384d writes into the canonical lane', () => {
    expect(() =>
      assertEmbeddingDimension(new Array(384).fill(0), 'canonical_768d')
    ).toThrow(/Legacy 384d lane detected/);
  });

  it('rejects non-array embeddings', () => {
    expect(() => assertEmbeddingDimension(undefined as unknown as number[], 'canonical_768d')).toThrow(
      /Expected embedding array/
    );
  });

  it('supports the requested assertEmbeddingDim alias', () => {
    expect(() => assertEmbeddingDim(new Array(384).fill(0), 384, 'legacy_384d')).not.toThrow();
  });

  it('rejects mismatched dimensions through the alias too', () => {
    expect(() => assertEmbeddingDim(new Array(384).fill(0), 768, 'canonical_768d')).toThrow(
      /Legacy 384d lane detected/
    );
  });
});
