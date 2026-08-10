import { describe, expect, it } from 'vitest';
import { angularAreaForUnitVectors, cosineSimilarity, l2Normalize } from './geometry-experiment';

describe('geometry helpers', () => {
  it('normalizes safely and computes bounded cosine', () => {
    expect(l2Normalize([0, 0])).toEqual([0, 0]);
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(angularAreaForUnitVectors([1, 0], [0, 1])).toBeCloseTo(1);
  });
});
