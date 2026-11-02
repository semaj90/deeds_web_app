import { describe, expect, it } from 'vitest';
import { requireDocumentEmbeddingV1 } from './document-embedding-guard.js';

describe('requireDocumentEmbeddingV1', () => {
  it('accepts a finite non-zero 768-value vector', () => {
    const vector = new Array(768).fill(0.25);
    expect(requireDocumentEmbeddingV1(vector)).toBe(vector);
  });

  it.each([
    [],
    new Array(767).fill(0.25),
    new Array(768).fill(0),
    new Array(768).fill(0.25).map((value, index) => index === 3 ? Number.NaN : value),
    null,
    { embedding: new Array(768).fill(0.25) }
  ])('rejects invalid vector payloads', (value) => {
    expect(() => requireDocumentEmbeddingV1(value)).toThrow('DOCUMENT_EMBEDDING_INVALID');
  });
});
