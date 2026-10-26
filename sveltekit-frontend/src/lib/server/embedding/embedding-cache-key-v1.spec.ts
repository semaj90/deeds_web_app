import { describe, expect, it } from 'vitest';
import { buildEmbeddingCacheTextHashV1 } from './embedding-cache-key-v1.js';

describe('embedding cache text identity v1', () => {
  it('separates model labels for identical text', () => {
    expect(buildEmbeddingCacheTextHashV1('same input', 'embeddinggemma:latest'))
      .not.toBe(buildEmbeddingCacheTextHashV1('same input', 'other-model'));
  });

  it('keeps text identity deterministic within a model label', () => {
    expect(buildEmbeddingCacheTextHashV1('same input', 'embeddinggemma:latest'))
      .toBe(buildEmbeddingCacheTextHashV1('same input', 'embeddinggemma:latest'));
  });

  it('rejects an empty model label', () => {
    expect(() => buildEmbeddingCacheTextHashV1('same input', '  '))
      .toThrow('EMBEDDING_CACHE_MODEL_REQUIRED');
  });
});
