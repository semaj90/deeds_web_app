import { describe, expect, it } from 'vitest';
import {
  SEARCH_POLICY_FEATURE_COUNT,
  SEARCH_POLICY_FEATURE_NAMES,
  type SearchPolicyFeatureMatrixV1,
} from './adaptive-search-policy.js';
import {
  buildMeasuredTangPolicyReceipt,
  measureSearchPolicyMatrixDiagnostics,
  searchPolicyMatrixSha256,
} from './measured-matrix-diagnostics.js';

function diagonalMatrix(rows: number, diagonal: readonly number[]): SearchPolicyFeatureMatrixV1 {
  const cols = SEARCH_POLICY_FEATURE_COUNT;
  const values = new Float32Array(rows * cols);
  for (let i = 0; i < Math.min(rows, cols, diagonal.length); i += 1) {
    values[i * cols + i] = diagonal[i];
  }
  return {
    schema: 'atlas.search-policy-feature-matrix.v1',
    packetKeys: Array.from({ length: rows }, (_, index) => `packet-${index}`),
    featureNames: SEARCH_POLICY_FEATURE_NAMES,
    rows,
    cols,
    values,
    canonicalBaseFeatureCount: 9,
    policyFeatureCount: 7,
  };
}

describe('measured N×16 matrix diagnostics', () => {
  it('measures a full-sample approximately low-rank N×16 matrix and qualifies Tang policy', () => {
    const matrix = diagonalMatrix(16, [1, ...Array(15).fill(0.02)]);
    const diagnostics = measureSearchPolicyMatrixDiagnostics(matrix, {
      requestId: 'req-low-rank',
      producerRevision: 'test',
    });

    expect(diagnostics.matrixSha256).toBe(searchPolicyMatrixSha256(matrix));
    expect(diagnostics.algorithm).toBe('ATA_SYMMETRIC_JACOBI_SVD_V1');
    expect(diagnostics.transform).toBe('NONE');
    expect(diagnostics.conditionNumberDefinition).toBe('NUMERICAL_ACTIVE_SUBSPACE');
    expect(diagnostics.converged).toBe(true);
    expect(diagnostics.sampleSufficientForColumnRank).toBe(true);
    expect(diagnostics.numericalRank).toBe(16);
    expect(diagnostics.effectiveRank).not.toBeNull();
    expect(diagnostics.effectiveRank!).toBeLessThan(SEARCH_POLICY_FEATURE_COUNT * 0.35);
    expect(diagnostics.retainedRank).toBe(1);
    expect(diagnostics.retainedEnergyPercent!).toBeGreaterThan(99);
    expect(diagnostics.conditionNumber).toBeGreaterThan(40);
    expect(diagnostics.conditionNumber).toBeLessThan(60);
    expect(diagnostics.canonicalWritesAllowed).toBe(false);

    const tang = buildMeasuredTangPolicyReceipt({
      requestId: 'req-low-rank',
      matrix,
      diagnostics,
      policy: {
        maxEffectiveRankRatio: 0.35,
        minRetainedEnergyPercent: 80,
        maxConditionNumber: 100,
        promotionCount: 4,
      },
      producerRevision: 'test',
    });

    expect(tang.qualified).toBe(true);
    expect(tang.recommendation.status).toBe('ELIGIBLE');
    expect(tang.recommendation.selectedPacketKeys).toHaveLength(4);
    expect(tang.stochasticExecutionRequired).toBe(true);
    expect(tang.proposalOnly).toBe(true);
    expect(tang.canonicalWritesAllowed).toBe(false);
  });

  it('allows measured numerical rank deficiency to support the low-rank hypothesis without circular rejection', () => {
    const matrix = diagonalMatrix(16, [1, ...Array(4).fill(0.02), ...Array(11).fill(0)]);
    const diagnostics = measureSearchPolicyMatrixDiagnostics(matrix, {
      requestId: 'req-rank-deficient',
      producerRevision: 'test',
    });

    expect(diagnostics.sampleSufficientForColumnRank).toBe(true);
    expect(diagnostics.rankDeficient).toBe(true);
    expect(diagnostics.numericalRank).toBe(5);
    expect(diagnostics.conditionNumberDefinition).toBe('NUMERICAL_ACTIVE_SUBSPACE');
    expect(diagnostics.conditionNumber).toBeGreaterThan(40);
    expect(diagnostics.conditionNumber).toBeLessThan(60);

    const tang = buildMeasuredTangPolicyReceipt({
      requestId: 'req-rank-deficient',
      matrix,
      diagnostics,
      policy: {
        maxEffectiveRankRatio: 0.35,
        minRetainedEnergyPercent: 80,
        maxConditionNumber: 100,
        promotionCount: 4,
      },
      producerRevision: 'test',
    });

    expect(tang.recommendation.status).toBe('ELIGIBLE');
    expect(tang.qualified).toBe(true);
    expect(tang.qualificationReasonCodes).toContain('NUMERICAL_RANK_DEFICIENT_ACTIVE_SUBSPACE_CONDITION_USED');
  });

  it('does not qualify apparent low rank when N is smaller than the 16-feature width', () => {
    const matrix = diagonalMatrix(8, [1, ...Array(7).fill(0.02)]);
    const diagnostics = measureSearchPolicyMatrixDiagnostics(matrix, {
      requestId: 'req-undersampled',
      producerRevision: 'test',
    });

    expect(diagnostics.sampleSufficientForColumnRank).toBe(false);

    const tang = buildMeasuredTangPolicyReceipt({
      requestId: 'req-undersampled',
      matrix,
      diagnostics,
      policy: {
        maxEffectiveRankRatio: 0.35,
        minRetainedEnergyPercent: 80,
        maxConditionNumber: 100,
        promotionCount: 2,
      },
      producerRevision: 'test',
    });

    expect(tang.qualified).toBe(false);
    expect(tang.qualificationReasonCodes).toContain('ROW_COUNT_BELOW_FEATURE_COUNT_LOW_RANK_NOT_QUALIFIED');
    expect(tang.canonicalWritesAllowed).toBe(false);
  });

  it('binds diagnostics to the exact matrix checksum', () => {
    const matrix = diagonalMatrix(16, [1, ...Array(15).fill(0.02)]);
    const diagnostics = measureSearchPolicyMatrixDiagnostics(matrix, {
      requestId: 'req-checksum',
      producerRevision: 'test',
    });
    const altered = diagonalMatrix(16, [0.9, ...Array(15).fill(0.02)]);

    expect(() => buildMeasuredTangPolicyReceipt({
      requestId: 'req-checksum',
      matrix: altered,
      diagnostics,
      policy: {
        maxEffectiveRankRatio: 0.35,
        minRetainedEnergyPercent: 80,
        maxConditionNumber: 100,
        promotionCount: 4,
      },
      producerRevision: 'test',
    })).toThrow(/MATRIX_SHA256_MISMATCH/);
  });
});
