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
  it('keeps canonical 768 and legacy 384 as separate named representations', () => {
    expect(getEmbeddingRepresentation('semantic_768').lane_id).toBe('dense_768');
    expect(getEmbeddingRepresentation('semantic_768').status).toBe('ACTIVE');
    expect(getEmbeddingRepresentation('semantic_768').source_dimension).toBe(768);

    expect(getEmbeddingRepresentation('semantic_384').lane_id).toBe('dense_384');
    expect(getEmbeddingRepresentation('semantic_384').status).toBe('REFERENCE_ONLY');
    expect(getEmbeddingRepresentation('semantic_384').output_dimension).toBe(384);
  });

  it('accepts normalized embeddings from canonical and legacy lanes', () => {
    expect(isValidEmbedding(makeNormalizedVector(EMBEDDING_CONTRACT.retrieval_embedding_dimension))).toBe(true);
    expect(isValidEmbedding(makeNormalizedVector(EMBEDDING_CONTRACT.native_dimension))).toBe(true);
  });

  it('rejects unsupported dimensions even when normalized', () => {
    expect(isValidEmbedding(makeNormalizedVector(256))).toBe(false);
  });
});
