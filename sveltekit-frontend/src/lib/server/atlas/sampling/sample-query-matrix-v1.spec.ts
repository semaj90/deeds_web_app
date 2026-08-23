import { describe, expect, it } from 'vitest';

import {
  buildLengthSquaredSamplingDecisionV1,
  lengthSquaredProbabilitiesV1,
  type SampleQueryMatrixV1,
} from './sample-query-matrix-v1.js';

function contract(overrides: Partial<SampleQueryMatrixV1> = {}): SampleQueryMatrixV1 {
  return {
    schema: 'atlas.sample-query-matrix.v1',
    sourceSnapshotRevision: 'snapshot:v1',
    sourceMatrixChecksum: 'matrix:abc',
    ordinalMapChecksum: 'ordinal:def',
    matrixRole: 'CANDIDATE_FEATURE',
    normalization: 'NONE',
    rows: 3,
    columns: 2,
    rankTarget: 2,
    samplingAxis: 'ROW',
    samplingPolicy: 'LENGTH_SQUARED',
    canonicalIdentityAuthority: false,
    retrievalVoteAdded: false,
    producerRevision: 'sample-query-matrix-v1',
    ...overrides,
  };
}

describe('SampleQueryMatrixV1 length-squared sampling', () => {
  it('weights rows by squared L2 norm', () => {
    const probabilities = lengthSquaredProbabilitiesV1({
      matrix: [[1, 0], [2, 0], [0, 3]],
      samplingAxis: 'ROW',
    });
    expect(probabilities).toEqual([1 / 14, 4 / 14, 9 / 14]);
  });

  it('detects row-L2 normalization degenerating row sampling to uniform', () => {
    const rowL2 = [
      [1, 0],
      [0, 1],
      [Math.SQRT1_2, Math.SQRT1_2],
    ];
    const decision = buildLengthSquaredSamplingDecisionV1({
      contract: contract({ normalization: 'ROW_L2' }),
      matrix: rowL2,
    });
    expect(decision.probabilities[0]).toBeCloseTo(1 / 3, 6);
    expect(decision.probabilities[1]).toBeCloseTo(1 / 3, 6);
    expect(decision.probabilities[2]).toBeCloseTo(1 / 3, 6);
    expect(decision.normalizationDegeneratedToUniform).toBe(true);
    expect(decision.canonicalIdentityAuthority).toBe(false);
    expect(decision.retrievalVoteAdded).toBe(false);
  });

  it('keeps informative magnitudes for an unnormalized candidate feature matrix', () => {
    const decision = buildLengthSquaredSamplingDecisionV1({
      contract: contract(),
      matrix: [[1, 0], [2, 0], [0, 3]],
    });
    expect(decision.normalizationDegeneratedToUniform).toBe(false);
    expect(decision.probabilities[2]).toBeGreaterThan(decision.probabilities[1]);
    expect(decision.probabilities[1]).toBeGreaterThan(decision.probabilities[0]);
  });
});
