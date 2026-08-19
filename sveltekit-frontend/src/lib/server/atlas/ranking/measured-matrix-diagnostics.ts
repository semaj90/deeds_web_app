import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  MatrixDiagnosticsV1Schema,
  SEARCH_POLICY_FEATURE_COUNT,
  SEARCH_POLICY_FEATURE_NAMES,
  TangPromotionPolicyV1Schema,
  TangPromotionRecommendationV1Schema,
  buildTangPromotionRecommendation,
  type MatrixDiagnosticsV1,
  type SearchPolicyFeatureMatrixV1,
  type TangPromotionPolicyV1,
  type TangPromotionRecommendationV1,
} from './adaptive-search-policy.js';

/**
 * Deterministic CPU reference diagnostics for the canonical Parent Atlas N×16
 * repair/search feature matrix.
 *
 * The matrix is measured exactly as ranking sees it: no centering, whitening,
 * PCA, or hidden normalization is applied. Since the canonical matrix has only
 * 16 columns, a deterministic symmetric Jacobi eigensolver over A^T A is small
 * enough to serve as a transparent CPU oracle before any GPU challenger exists.
 *
 * The Tang preflight matrix contains tangPromotionProbability itself. Before a
 * measured Tang policy exists that feature is normally zero, so full-column
 * conditioning would be circular and frequently singular by construction. The
 * policy therefore uses the condition number of the numerically active singular
 * subspace and records rank deficiency separately.
 */

export const MatrixDiagnosticsAlgorithmSchema = z.literal('ATA_SYMMETRIC_JACOBI_SVD_V1');
export type MatrixDiagnosticsAlgorithm = z.infer<typeof MatrixDiagnosticsAlgorithmSchema>;
export const MatrixConditionNumberDefinitionSchema = z.literal('NUMERICAL_ACTIVE_SUBSPACE');
export type MatrixConditionNumberDefinition = z.infer<typeof MatrixConditionNumberDefinitionSchema>;

export const MatrixDiagnosticsMeasurementPolicyV1Schema = z.object({
  retainedEnergyTargetPercent: z.number().finite().min(0).max(100),
  jacobiRelativeTolerance: z.number().finite().positive().max(1),
  singularValueToleranceFactor: z.number().finite().positive().max(1),
  maxSweeps: z.number().int().positive().max(4096),
}).strict();
export type MatrixDiagnosticsMeasurementPolicyV1 = z.infer<typeof MatrixDiagnosticsMeasurementPolicyV1Schema>;

export const DEFAULT_MATRIX_DIAGNOSTICS_POLICY: MatrixDiagnosticsMeasurementPolicyV1 = {
  retainedEnergyTargetPercent: 80,
  jacobiRelativeTolerance: 1e-12,
  singularValueToleranceFactor: 1e-7,
  maxSweeps: 128,
};

export const MeasuredMatrixDiagnosticsReceiptV1Schema = z.object({
  schema: z.literal('atlas.measured-matrix-diagnostics-receipt.v1'),
  requestId: z.string().min(1),
  matrixSha256: z.string().regex(/^[a-f0-9]{64}$/),
  rowCount: z.number().int().positive(),
  columnCount: z.literal(SEARCH_POLICY_FEATURE_COUNT),
  featureNames: z.array(z.string().min(1)).length(SEARCH_POLICY_FEATURE_COUNT),
  algorithm: MatrixDiagnosticsAlgorithmSchema,
  transform: z.literal('NONE'),
  converged: z.boolean(),
  sweeps: z.number().int().nonnegative(),
  numericalRank: z.number().int().nonnegative().max(SEARCH_POLICY_FEATURE_COUNT),
  sampleSufficientForColumnRank: z.boolean(),
  rankDeficient: z.boolean(),
  zeroMatrix: z.boolean(),
  singularValueTolerance: z.number().finite().nonnegative(),
  singularValues: z.array(z.number().finite().nonnegative()).length(SEARCH_POLICY_FEATURE_COUNT),
  effectiveRank: z.number().finite().positive().max(SEARCH_POLICY_FEATURE_COUNT).nullable(),
  retainedRank: z.number().int().positive().max(SEARCH_POLICY_FEATURE_COUNT).nullable(),
  retainedEnergyPercent: z.number().finite().min(0).max(100).nullable(),
  conditionNumberDefinition: MatrixConditionNumberDefinitionSchema,
  conditionNumber: z.number().finite().positive().nullable(),
  retainedEnergyTargetPercent: z.number().finite().min(0).max(100),
  legacyDiagnostics: MatrixDiagnosticsV1Schema,
  measured: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.legacyDiagnostics.rowCount !== value.rowCount || value.legacyDiagnostics.columnCount !== value.columnCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['legacyDiagnostics'],
      message: 'legacy diagnostics shape must match measured receipt shape',
    });
  }
  if (!value.converged && value.legacyDiagnostics.measured) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['legacyDiagnostics', 'measured'],
      message: 'non-converged eigensolver result may not be exposed as measured policy evidence',
    });
  }
});
export type MeasuredMatrixDiagnosticsReceiptV1 = z.infer<typeof MeasuredMatrixDiagnosticsReceiptV1Schema>;

export const MeasuredTangPolicyReceiptV1Schema = z.object({
  schema: z.literal('atlas.measured-tang-policy-receipt.v1'),
  requestId: z.string().min(1),
  matrixSha256: z.string().regex(/^[a-f0-9]{64}$/),
  diagnosticsReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  policy: TangPromotionPolicyV1Schema,
  recommendation: TangPromotionRecommendationV1Schema,
  qualified: z.boolean(),
  qualificationReasonCodes: z.array(z.string().min(1)).min(1),
  stochasticExecutionRequired: z.literal(true),
  proposalOnly: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type MeasuredTangPolicyReceiptV1 = z.infer<typeof MeasuredTangPolicyReceiptV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (Array.isArray(item)) return item;
    if (item && typeof item === 'object' && !(item instanceof Float32Array)) {
      return Object.keys(item as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((out, key) => {
          out[key] = (item as Record<string, unknown>)[key];
          return out;
        }, {});
    }
    if (item instanceof Float32Array) return Array.from(item);
    return item;
  });
}

export function stableReceiptSha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function searchPolicyMatrixSha256(matrix: SearchPolicyFeatureMatrixV1): string {
  if (matrix.cols !== SEARCH_POLICY_FEATURE_COUNT || matrix.featureNames.length !== SEARCH_POLICY_FEATURE_COUNT) {
    throw new Error(`MATRIX_DIAGNOSTICS_EXPECTED_NX${SEARCH_POLICY_FEATURE_COUNT}`);
  }
  if (matrix.values.length !== matrix.rows * matrix.cols) {
    throw new Error('MATRIX_DIAGNOSTICS_VALUE_LENGTH_MISMATCH');
  }
  const bytes = Buffer.from(matrix.values.buffer, matrix.values.byteOffset, matrix.values.byteLength);
  const header = stableJson({
    packetKeys: matrix.packetKeys,
    featureNames: matrix.featureNames,
    rows: matrix.rows,
    cols: matrix.cols,
  });
  return createHash('sha256').update(header).update(bytes).digest('hex');
}

function gramMatrix(matrix: SearchPolicyFeatureMatrixV1): Float64Array {
  const n = matrix.cols;
  const gram = new Float64Array(n * n);
  for (let row = 0; row < matrix.rows; row += 1) {
    const offset = row * n;
    for (let i = 0; i < n; i += 1) {
      const xi = matrix.values[offset + i];
      for (let j = i; j < n; j += 1) {
        gram[i * n + j] += xi * matrix.values[offset + j];
      }
    }
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      gram[j * n + i] = gram[i * n + j];
    }
  }
  return gram;
}

function symmetricJacobiEigenvalues(
  source: Float64Array,
  dimension: number,
  policy: MatrixDiagnosticsMeasurementPolicyV1,
): { eigenvalues: number[]; converged: boolean; sweeps: number } {
  const a = new Float64Array(source);
  let sweeps = 0;

  for (; sweeps < policy.maxSweeps; sweeps += 1) {
    let maxDiagonal = 0;
    let maxOffDiagonal = 0;
    for (let i = 0; i < dimension; i += 1) {
      maxDiagonal = Math.max(maxDiagonal, Math.abs(a[i * dimension + i]));
      for (let j = i + 1; j < dimension; j += 1) {
        maxOffDiagonal = Math.max(maxOffDiagonal, Math.abs(a[i * dimension + j]));
      }
    }
    const threshold = policy.jacobiRelativeTolerance * Math.max(1, maxDiagonal);
    if (maxOffDiagonal <= threshold) {
      return {
        eigenvalues: Array.from({ length: dimension }, (_, i) => a[i * dimension + i]),
        converged: true,
        sweeps,
      };
    }

    for (let p = 0; p < dimension - 1; p += 1) {
      for (let q = p + 1; q < dimension; q += 1) {
        const pq = p * dimension + q;
        const apq = a[pq];
        if (Math.abs(apq) <= threshold) continue;

        const app = a[p * dimension + p];
        const aqq = a[q * dimension + q];
        const tau = (aqq - app) / (2 * apq);
        const t = tau >= 0
          ? 1 / (tau + Math.sqrt(1 + tau * tau))
          : -1 / (-tau + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        for (let k = 0; k < dimension; k += 1) {
          if (k === p || k === q) continue;
          const akp = a[k * dimension + p];
          const akq = a[k * dimension + q];
          const nextKp = c * akp - s * akq;
          const nextKq = s * akp + c * akq;
          a[k * dimension + p] = nextKp;
          a[p * dimension + k] = nextKp;
          a[k * dimension + q] = nextKq;
          a[q * dimension + k] = nextKq;
        }

        a[p * dimension + p] = c * c * app - 2 * s * c * apq + s * s * aqq;
        a[q * dimension + q] = s * s * app + 2 * s * c * apq + c * c * aqq;
        a[pq] = 0;
        a[q * dimension + p] = 0;
      }
    }
  }

  return {
    eigenvalues: Array.from({ length: dimension }, (_, i) => a[i * dimension + i]),
    converged: false,
    sweeps,
  };
}

function effectiveRank(singularValues: readonly number[], tolerance: number): number | null {
  const active = singularValues.filter((value) => value > tolerance);
  const sum = active.reduce((total, value) => total + value, 0);
  if (!(sum > 0)) return null;
  let entropy = 0;
  for (const value of active) {
    const p = value / sum;
    entropy -= p * Math.log(p);
  }
  return Math.exp(entropy);
}

function retainedEnergy(
  singularValues: readonly number[],
  targetPercent: number,
): { rank: number | null; percent: number | null } {
  const energies = singularValues.map((value) => value * value);
  const total = energies.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return { rank: null, percent: null };

  let cumulative = 0;
  for (let index = 0; index < energies.length; index += 1) {
    cumulative += energies[index];
    const percent = (cumulative / total) * 100;
    if (percent + Number.EPSILON >= targetPercent) {
      return { rank: index + 1, percent: Math.min(100, percent) };
    }
  }
  return { rank: energies.length, percent: 100 };
}

function matrixRows(matrix: SearchPolicyFeatureMatrixV1): number[][] {
  return Array.from({ length: matrix.rows }, (_unused, rowIndex) => {
    const start = rowIndex * matrix.cols;
    return Array.from(matrix.values.slice(start, start + matrix.cols));
  });
}

export function measureSearchPolicyMatrixDiagnostics(
  matrix: SearchPolicyFeatureMatrixV1,
  options: {
    requestId: string;
    policy?: MatrixDiagnosticsMeasurementPolicyV1;
    producerRevision: string;
  },
): MeasuredMatrixDiagnosticsReceiptV1 {
  if (matrix.rows <= 0 || matrix.packetKeys.length !== matrix.rows) {
    throw new Error('MATRIX_DIAGNOSTICS_EMPTY_OR_IDENTITY_MISMATCH');
  }
  if (matrix.cols !== SEARCH_POLICY_FEATURE_COUNT) {
    throw new Error(`MATRIX_DIAGNOSTICS_EXPECTED_NX${SEARCH_POLICY_FEATURE_COUNT}`);
  }
  if (matrix.featureNames.join('\0') !== SEARCH_POLICY_FEATURE_NAMES.join('\0')) {
    throw new Error('MATRIX_DIAGNOSTICS_FEATURE_ORDER_MISMATCH');
  }

  const policy = MatrixDiagnosticsMeasurementPolicyV1Schema.parse(options.policy ?? DEFAULT_MATRIX_DIAGNOSTICS_POLICY);
  const matrixSha256 = searchPolicyMatrixSha256(matrix);
  const eig = symmetricJacobiEigenvalues(gramMatrix(matrix), matrix.cols, policy);
  const singularValues = eig.eigenvalues
    .map((value) => Math.sqrt(Math.max(0, value)))
    .sort((a, b) => b - a);
  const sigmaMax = singularValues[0] ?? 0;
  const singularValueTolerance = sigmaMax > 0
    ? policy.singularValueToleranceFactor * Math.max(matrix.rows, matrix.cols) * sigmaMax
    : 0;
  const numericalRank = singularValues.filter((value) => value > singularValueTolerance).length;
  const maxPossibleRank = Math.min(matrix.rows, matrix.cols);
  const rankDeficient = numericalRank < maxPossibleRank;
  const zeroMatrix = sigmaMax === 0;
  const sampleSufficientForColumnRank = matrix.rows >= matrix.cols;
  const effRank = eig.converged ? effectiveRank(singularValues, singularValueTolerance) : null;
  const retained = eig.converged
    ? retainedEnergy(singularValues, policy.retainedEnergyTargetPercent)
    : { rank: null, percent: null };
  const smallestActive = numericalRank > 0 ? singularValues[numericalRank - 1] : 0;
  const conditionNumber = eig.converged && !zeroMatrix && smallestActive > 0
    ? sigmaMax / smallestActive
    : null;

  const legacyDiagnostics: MatrixDiagnosticsV1 = MatrixDiagnosticsV1Schema.parse({
    rowCount: matrix.rows,
    columnCount: matrix.cols,
    effectiveRank: effRank,
    retainedRank: retained.rank,
    retainedEnergyPercent: retained.percent,
    conditionNumber,
    measured: eig.converged,
  });

  return MeasuredMatrixDiagnosticsReceiptV1Schema.parse({
    schema: 'atlas.measured-matrix-diagnostics-receipt.v1',
    requestId: options.requestId,
    matrixSha256,
    rowCount: matrix.rows,
    columnCount: SEARCH_POLICY_FEATURE_COUNT,
    featureNames: [...SEARCH_POLICY_FEATURE_NAMES],
    algorithm: 'ATA_SYMMETRIC_JACOBI_SVD_V1',
    transform: 'NONE',
    converged: eig.converged,
    sweeps: eig.sweeps,
    numericalRank,
    sampleSufficientForColumnRank,
    rankDeficient,
    zeroMatrix,
    singularValueTolerance,
    singularValues,
    effectiveRank: effRank,
    retainedRank: retained.rank,
    retainedEnergyPercent: retained.percent,
    conditionNumberDefinition: 'NUMERICAL_ACTIVE_SUBSPACE',
    conditionNumber,
    retainedEnergyTargetPercent: policy.retainedEnergyTargetPercent,
    legacyDiagnostics,
    measured: true,
    canonicalWritesAllowed: false,
    producerRevision: options.producerRevision,
  });
}

export function buildMeasuredTangPolicyReceipt(input: {
  requestId: string;
  matrix: SearchPolicyFeatureMatrixV1;
  diagnostics: MeasuredMatrixDiagnosticsReceiptV1;
  policy: TangPromotionPolicyV1;
  producerRevision: string;
}): MeasuredTangPolicyReceiptV1 {
  const diagnostics = MeasuredMatrixDiagnosticsReceiptV1Schema.parse(input.diagnostics);
  const policy = TangPromotionPolicyV1Schema.parse(input.policy);
  const matrixSha256 = searchPolicyMatrixSha256(input.matrix);
  if (diagnostics.requestId !== input.requestId) throw new Error('TANG_DIAGNOSTICS_REQUEST_ID_MISMATCH');
  if (diagnostics.matrixSha256 !== matrixSha256) throw new Error('TANG_DIAGNOSTICS_MATRIX_SHA256_MISMATCH');
  if (diagnostics.rowCount !== input.matrix.rows || diagnostics.columnCount !== input.matrix.cols) {
    throw new Error('TANG_DIAGNOSTICS_MATRIX_SHAPE_MISMATCH');
  }

  const recommendation: TangPromotionRecommendationV1 = buildTangPromotionRecommendation({
    packetKeys: input.matrix.packetKeys,
    matrixRows: matrixRows(input.matrix),
    diagnostics: diagnostics.legacyDiagnostics,
    policy,
  });

  const qualificationReasonCodes: string[] = [];
  if (!diagnostics.converged) qualificationReasonCodes.push('JACOBI_DIAGNOSTICS_DID_NOT_CONVERGE');
  if (!diagnostics.sampleSufficientForColumnRank) qualificationReasonCodes.push('ROW_COUNT_BELOW_FEATURE_COUNT_LOW_RANK_NOT_QUALIFIED');
  if (diagnostics.zeroMatrix) qualificationReasonCodes.push('ZERO_MATRIX_NOT_QUALIFIED');
  if (diagnostics.rankDeficient) qualificationReasonCodes.push('NUMERICAL_RANK_DEFICIENT_ACTIVE_SUBSPACE_CONDITION_USED');
  if (recommendation.status !== 'ELIGIBLE') qualificationReasonCodes.push(`TANG_POLICY_${recommendation.status}`);
  if (recommendation.status === 'ELIGIBLE') qualificationReasonCodes.push('MEASURED_TANG_POLICY_ELIGIBLE');

  const qualified = diagnostics.converged
    && diagnostics.sampleSufficientForColumnRank
    && !diagnostics.zeroMatrix
    && recommendation.status === 'ELIGIBLE';

  return MeasuredTangPolicyReceiptV1Schema.parse({
    schema: 'atlas.measured-tang-policy-receipt.v1',
    requestId: input.requestId,
    matrixSha256,
    diagnosticsReceiptSha256: stableReceiptSha256(diagnostics),
    policy,
    recommendation,
    qualified,
    qualificationReasonCodes: qualificationReasonCodes.length
      ? qualificationReasonCodes
      : ['TANG_POLICY_NOT_QUALIFIED'],
    stochasticExecutionRequired: true,
    proposalOnly: true,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}
