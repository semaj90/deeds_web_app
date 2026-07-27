import { describe, expect, it } from 'vitest';

import {
  EMBEDDING_CONTRACT,
  getEmbeddingRepresentation,
  isValidEmbedding,
} from './embedding-contract.js';

function makeNormalizedVector(length: number): number[] {
  const value = 1 / Math.sqrt(length);
  return new Array(length).fill(value);
}

describe('embedding-contract lineage', () => {
  it('keeps native 768 and online 384 as separate named representations', () => {
    expect(getEmbeddingRepresentation('semantic_384').lane_id).toBe('dense_384');
    expect(getEmbeddingRepresentation('semantic_384').status).toBe('ACTIVE');
    expect(getEmbeddingRepresentation('semantic_384').source_dimension).toBe(768);

    expect(getEmbeddingRepresentation('legacy_768').lane_id).toBe('dense_768');
    expect(getEmbeddingRepresentation('legacy_768').status).toBe('REFERENCE_ONLY');
    expect(getEmbeddingRepresentation('legacy_768').output_dimension).toBe(768);
  });

  it('accepts normalized embeddings from both retrieval and native lanes', () => {
    expect(isValidEmbedding(makeNormalizedVector(EMBEDDING_CONTRACT.retrieval_embedding_dimension))).toBe(true);
    expect(isValidEmbedding(makeNormalizedVector(EMBEDDING_CONTRACT.native_dimension))).toBe(true);
  });

  it('rejects unsupported dimensions even when normalized', () => {
    expect(isValidEmbedding(makeNormalizedVector(256))).toBe(false);
  });
});
