import { describe, expect, it } from 'vitest';
import { buildEngramRepresentationUnavailable } from './engram-representation-result.js';

describe('Engram representation result', () => {
  it('reports an absent optional representation without mutation', () => {
    expect(
      buildEngramRepresentationUnavailable('hnsw_embedding_512', 'column is absent'),
    ).toEqual({
      status: 'REPRESENTATION_UNAVAILABLE',
      representation: 'hnsw_embedding_512',
      reason: 'column is absent',
      observations: [],
      writesPerformed: false,
    });
  });

  it('rejects an empty reason', () => {
    expect(() => buildEngramRepresentationUnavailable('hnsw_embedding', '')).toThrow();
  });
});
