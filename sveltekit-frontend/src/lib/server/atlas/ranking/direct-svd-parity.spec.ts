import { describe, expect, it } from 'vitest';
import {
  SEARCH_POLICY_FEATURE_COUNT,
  SEARCH_POLICY_FEATURE_NAMES,
  type SearchPolicyFeatureMatrixV1,
} from './adaptive-search-policy.js';
import {
  measureSearchPolicyMatrixDiagnostics,
  searchPolicyMatrixSha256,
} from './measured-matrix-diagnostics.js';
import {
  compareAtaJacobiWithDirectSvd,
  type DirectSvdParityReceiptV1,
} from './direct-svd-parity.js';

function diagonalMatrix(): SearchPolicyFeatureMatrixV1 {
  const n = SEARCH_POLICY_FEATURE_COUNT;
  const values = new Float32Array(n * n);
  for (let i = 0; i < n; i += 1) values[i * n + i] = 1 - i * 0.02;
  return {
    schema: 'atlas.search-policy-feature-matrix.v1',
    packetKeys: Array.from({ length: n }, (_, i) => `packet-${i}`),
    featureNames: SEARCH_POLICY_FEATURE_NAMES,
    rows: n,
    cols: n,
    values,
    canonicalBaseFeatureCount: 9,
    policyFeatureCount: 7,
  };
}

function directReceipt(matrix: SearchPolicyFeatureMatrixV1): DirectSvdParityReceiptV1 {
  const singularValues = Array.from({ length: SEARCH_POLICY_FEATURE_COUNT }, (_, i) => 1 - i * 0.02);
  return {
    schema: 'atlas.direct-svd-parity-receipt.v1',
    requestId: 'req-svd-parity',
    matrixSha256: searchPolicyMatrixSha256(matrix),
    rows: matrix.rows,
    cols: matrix.cols,
    dtype: 'float64',
    comparisonTarget: 'SINGULAR_VALUES_NOT_SINGULAR_VECTORS',
    singularValueToleranceFactor: 1e-12,
    maxRelativeSingularErrorPolicy: 1e-6,
    maxReconstructionRelativeFrobeniusErrorPolicy: 1e-10,
    runs: [{
      backend: 'numpy',
      driver: 'lapack_gesdd',
      device: 'cpu',
      dtype: 'float64',
      status: 'EXECUTED',
      singular_values: singularValues,
      numerical_rank: SEARCH_POLICY_FEATURE_COUNT,
      condition_number_active: singularValues[0] / singularValues[singularValues.length - 1],
      reconstruction_relative_frobenius_error: 0,
      duration_ms: 1,
      detail: null,
    }],
    comparisons: [],
    status: 'GPU_UNAVAILABLE',
    cpuDirectSvdExecuted: true,
    gpuGesvdjExecuted: false,
    gpuGesvdExecuted: false,
    ataJacobiIncluded: false,
    canonicalWritesAllowed: false,
    producerRevision: 'test-direct-svd.v1',
  };
}

describe('direct SVD parity bridge', () => {
  it('accepts benign A^T A Jacobi singular values that match direct SVD', () => {
    const matrix = diagonalMatrix();
    const ata = measureSearchPolicyMatrixDiagnostics(matrix, {
      requestId: 'req-svd-parity',
      producerRevision: 'test-ata.v1',
    });
    const receipt = compareAtaJacobiWithDirectSvd({
      ata,
      direct: directReceipt(matrix),
      producerRevision: 'test-parity.v1',
    });

    expect(receipt.status).toBe('PASS');
    expect(receipt.rankAgreement).toBe(true);
    expect(receipt.ataNumericalInstabilityDetected).toBe(false);
    expect(receipt.directSvdIsAuthorityForConditioning).toBe(true);
  });

  it('fails closed when the direct SVD receipt is for a different matrix lineage', () => {
    const matrix = diagonalMatrix();
    const ata = measureSearchPolicyMatrixDiagnostics(matrix, {
      requestId: 'req-svd-parity',
      producerRevision: 'test-ata.v1',
    });
    const direct = directReceipt(matrix);
    direct.matrixSha256 = '0'.repeat(64);

    const receipt = compareAtaJacobiWithDirectSvd({
      ata,
      direct,
      producerRevision: 'test-parity.v1',
    });

    expect(receipt.status).toBe('MATRIX_MISMATCH');
    expect(receipt.reasonCodes).toContain('ATA_DIRECT_SVD_LINEAGE_OR_SHAPE_MISMATCH');
  });
});
