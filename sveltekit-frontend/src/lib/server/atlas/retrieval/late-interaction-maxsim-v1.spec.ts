import { describe, expect, it } from 'vitest';
import { scoreLateInteractionMaxSimV1, type LateInteractionTokenMatrixV1 } from './late-interaction-maxsim-v1.js';

function matrix(canonicalId: string, vectors: number[][], dimension: 32 | 64 | 128 = 32): LateInteractionTokenMatrixV1 {
  return {
    canonicalId,
    sourceRevision: `source:${canonicalId}`,
    representationRevision: 'representation:test',
    modelRevision: 'model:test',
    dimension,
    tokenOrdinals: vectors.map((_, index) => index),
    vectors,
  };
}

function basis(value: number, index = 0, dimension = 32): number[] {
  const vector = Array.from({ length: dimension }, () => 0);
  vector[index] = value;
  return vector;
}

describe('late-interaction-maxsim-v1', () => {
  it('sums the best document-token dot product for each query token', () => {
    const query = matrix('query', [basis(1, 0), basis(1, 1)]);
    const candidate = matrix('candidate', [basis(1, 0), basis(0.5, 1), basis(1, 2)]);
    expect(scoreLateInteractionMaxSimV1(query, candidate, 32)).toBeCloseTo(1.5);
  });

  it('is invariant to document-token order', () => {
    const query = matrix('query', [basis(1, 0), basis(1, 1)]);
    const left = matrix('candidate', [basis(1, 0), basis(0.5, 1)]);
    const right = matrix('candidate', [basis(0.5, 1), basis(1, 0)]);
    expect(scoreLateInteractionMaxSimV1(query, left, 32)).toBe(scoreLateInteractionMaxSimV1(query, right, 32));
  });

  it('supports nested 64-dimensional LOD scoring', () => {
    const query = matrix('query', [basis(1, 7, 64)], 64);
    const candidate = matrix('candidate', [basis(1, 7, 64)], 64);
    expect(scoreLateInteractionMaxSimV1(query, candidate, 64)).toBe(1);
  });

  it('supports nested 128-dimensional LOD scoring', () => {
    const query = matrix('query', [basis(1, 127, 128)], 128);
    const candidate = matrix('candidate', [basis(1, 127, 128)], 128);
    expect(scoreLateInteractionMaxSimV1(query, candidate, 128)).toBe(1);
  });

  it('rejects an identity-free representation', () => {
    expect(() => scoreLateInteractionMaxSimV1(matrix('', [basis(1)]), matrix('candidate', [basis(1)]), 32)).toThrow('LATE_INTERACTION_IDENTITY_INCOMPLETE');
  });

  it('rejects a dimension mismatch rather than truncating silently', () => {
    expect(() => scoreLateInteractionMaxSimV1(matrix('query', [basis(1, 0, 64)], 64), matrix('candidate', [basis(1, 0, 64)], 64), 32)).toThrow('LATE_INTERACTION_DIMENSION_MISMATCH');
  });

  it('rejects duplicate token ordinals', () => {
    const query = matrix('query', [basis(1), basis(1, 1)]);
    query.tokenOrdinals = [0, 0];
    expect(() => scoreLateInteractionMaxSimV1(query, matrix('candidate', [basis(1)]), 32)).toThrow('LATE_INTERACTION_TOKEN_ORDINAL_INVALID');
  });

  it('keeps MaxSim as a raw finite score without sigmoid conversion', () => {
    const score = scoreLateInteractionMaxSimV1(matrix('query', [basis(2)]), matrix('candidate', [basis(2)]), 32);
    expect(score).toBe(4);
    expect(score).not.toBeLessThanOrEqual(1);
  });
});
