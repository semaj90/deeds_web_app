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
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import {
  evaluateSamplingPoliciesV1,
  materializeSampleQueryMatrixV1,
  sampleCandidateOrdinalsV1,
} from './sample-query-matrix-v1.js';

const SHA_A = 'a'.repeat(64);

function ordinalMap(rowCount = 4) {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate-snapshot:sample-query:v1',
    workspaceRevision: 'workspace:sample-query:v1',
    producerRevision: 'test:sample-query:v1',
    candidates: Array.from({ length: rowCount }, (_, index) => ({
      canonicalId: `canonical:${String(index).padStart(2, '0')}`,
      packetKey: `packet:${index}`,
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: 'workspace:sample-query:v1',
      sourceRevision: `source:${index}`,
      graphRevision: 'graph:sample-query:v1',
      semanticRevision: 'semantic:sample-query:v1',
      degradedIdentity: false,
      evidenceRefs: [`fixture:${index}`],
    })),
  });
}

function matrix(rows: readonly number[][], normalization: 'NONE' | 'ROW_L2' = 'NONE') {
  const map = ordinalMap(rows.length);
  return materializeSampleQueryMatrixV1({
    ordinalMap: map,
    rows: rows.map((values, candidateOrdinal) => ({ candidateOrdinal, values })),
    sourceMatrixRevision: 'matrix-source:v1',
    sourceMatrixChecksum: SHA_A,
    matrixRole: 'CANDIDATE_FEATURE',
    normalization,
    producerRevision: 'test:sample-query:v1',
  });
}

describe('SampleQueryMatrixV1', () => {
  it('preserves CandidateOrdinal alignment and never claims authority', () => {
    const value = matrix([
      [1, 0],
      [0, 2],
      [3, 4],
    ]);

    expect(value.rows.map((row) => row.candidateOrdinal)).toEqual([0, 1, 2]);
    expect(value.rows.map((row) => row.rowNormSquared)).toEqual([1, 4, 25]);
    expect(value.identityAuthority).toBe(false);
    expect(value.retrievalVoteProduced).toBe(false);
    expect(value.canonicalWritesAttempted).toBe(false);
  });

  it('detects the row-L2 case where length-squared row sampling degenerates toward uniform', () => {
    const value = matrix([
      [1, 0],
      [0, 1],
      [Math.SQRT1_2, Math.SQRT1_2],
      [-1, 0],
    ], 'ROW_L2');

    expect(value.rows.every((row) => Math.abs(row.rowNormSquared - 1) < 1e-12)).toBe(true);
    expect(value.lengthSquaredDegeneratesTowardUniform).toBe(true);

    const lengthSquared = sampleCandidateOrdinalsV1({
      matrix: value,
      policy: 'LENGTH_SQUARED',
      sampleSize: 2,
      seed: 0xa71a5,
      producerRevision: 'test:sample-query:v1',
    });
    const uniform = sampleCandidateOrdinalsV1({
      matrix: value,
      policy: 'UNIFORM',
      sampleSize: 2,
      seed: 0xa71a5,
      producerRevision: 'test:sample-query:v1',
    });

    expect(lengthSquared.selectedOrdinals).toEqual(uniform.selectedOrdinals);
    expect(lengthSquared.promotionAuthorized).toBe(false);
    expect(lengthSquared.retrievalVoteProduced).toBe(false);
  });

  it('keeps deterministic length-squared sampling distinct when row norms differ', () => {
    const value = matrix([
      [0.1, 0],
      [0.2, 0],
      [4, 0],
      [8, 0],
    ]);

    expect(value.lengthSquaredDegeneratesTowardUniform).toBe(false);

    const first = sampleCandidateOrdinalsV1({
      matrix: value,
      policy: 'LENGTH_SQUARED',
      sampleSize: 2,
      seed: 42,
      producerRevision: 'test:sample-query:v1',
    });
    const second = sampleCandidateOrdinalsV1({
      matrix: value,
      policy: 'LENGTH_SQUARED',
      sampleSize: 2,
      seed: 42,
      producerRevision: 'test:sample-query:v1',
    });

    expect(first.selectedOrdinals).toEqual(second.selectedOrdinals);
    expect(first.decisionChecksum).toBe(second.decisionChecksum);
    expect(new Set(first.selectedOrdinals).size).toBe(2);
  });

  it('evaluates length-squared against uniform and top-k without promotion', () => {
    const value = matrix([
      [0.1, 0],
      [0.2, 0],
      [3, 0],
      [6, 0],
    ]);

    const evaluation = evaluateSamplingPoliciesV1({
      matrix: value,
      targetOrdinals: [2, 3],
      sampleSize: 2,
      seed: 7,
      producerRevision: 'test:sample-query:v1',
    });

    expect(evaluation.targetCount).toBe(2);
    expect(evaluation.topKRowNormRecall).toBe(1);
    expect(evaluation.measurementOnly).toBe(true);
    expect(evaluation.promotionAuthorized).toBe(false);
    expect(evaluation.canonicalWritesAttempted).toBe(false);
  });

  it('rejects duplicate or incomplete CandidateOrdinal row worlds', () => {
    const map = ordinalMap(3);

    expect(() => materializeSampleQueryMatrixV1({
      ordinalMap: map,
      rows: [
        { candidateOrdinal: 0, values: [1] },
        { candidateOrdinal: 0, values: [2] },
        { candidateOrdinal: 2, values: [3] },
      ],
      sourceMatrixRevision: 'matrix-source:v1',
      sourceMatrixChecksum: SHA_A,
      matrixRole: 'LATENT_ROUTING',
      normalization: 'NONE',
      producerRevision: 'test:sample-query:v1',
    })).toThrow(/SAMPLE_QUERY_DUPLICATE_ORDINAL/);

    expect(() => materializeSampleQueryMatrixV1({
      ordinalMap: map,
      rows: [
        { candidateOrdinal: 0, values: [1] },
        { candidateOrdinal: 1, values: [2] },
      ],
      sourceMatrixRevision: 'matrix-source:v1',
      sourceMatrixChecksum: SHA_A,
      matrixRole: 'LATENT_ROUTING',
      normalization: 'NONE',
      producerRevision: 'test:sample-query:v1',
    })).toThrow(/SAMPLE_QUERY_ROW_COUNT_MISMATCH/);
  });
});
