import { describe, expect, it } from 'vitest';
import { buildLengthSquaredSamplingDecisionV1 } from './sample-query-matrix-v1.js';

describe('SampleQueryMatrixV1', () => {
  const input = { matrixRole: 'CANDIDATE_FEATURE' as const, samplingAxis: 'ROW' as const, samplingPolicy: 'LENGTH_SQUARED' as const, normalization: 'NONE' as const };
  it('computes length-squared probabilities', () => {
    const result = buildLengthSquaredSamplingDecisionV1([[1, 0], [2, 0], [0, 3]], input, 2);
    expect(result.probabilities).toEqual([1 / 14, 4 / 14, 9 / 14]);
    expect(result.canonicalIdentityAuthority).toBe(false);
    expect(result.retrievalVoteAdded).toBe(false);
  });
  it('detects row-L2 normalization degeneracy', () => {
    const result = buildLengthSquaredSamplingDecisionV1([[1, 0], [2, 0], [0, 3]], { ...input, normalization: 'ROW_L2' }, 0);
    expect(result.probabilities.every((value) => Math.abs(value - 1 / 3) < 1e-12)).toBe(true);
    expect(result.normalizationDegeneratedToUniform).toBe(true);
  });
});
