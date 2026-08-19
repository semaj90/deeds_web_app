import { z } from 'zod';
import {
  MeasuredMatrixDiagnosticsReceiptV1Schema,
  stableReceiptSha256,
  type MeasuredMatrixDiagnosticsReceiptV1,
} from './measured-matrix-diagnostics.js';

export const DirectSvdRunV1Schema = z.object({
  backend: z.enum(['numpy', 'torch']),
  driver: z.enum(['lapack_gesdd', 'cusolver_gesvdj', 'cusolver_gesvd']),
  device: z.enum(['cpu', 'cuda']),
  dtype: z.literal('float64'),
  status: z.enum(['EXECUTED', 'UNAVAILABLE', 'FAILED']),
  singular_values: z.array(z.number().finite().nonnegative()),
  numerical_rank: z.number().int().nonnegative().nullable(),
  condition_number_active: z.number().finite().positive().nullable(),
  reconstruction_relative_frobenius_error: z.number().finite().nonnegative().nullable(),
  duration_ms: z.number().finite().nonnegative(),
  detail: z.string().nullable().optional(),
}).strict();
export type DirectSvdRunV1 = z.infer<typeof DirectSvdRunV1Schema>;

export const DirectSvdComparisonV1Schema = z.object({
  referenceDriver: z.string().min(1),
  challengerDriver: z.string().min(1),
  status: z.enum(['NOT_COMPARABLE', 'SHAPE_MISMATCH', 'COMPARED']),
  maxAbsoluteSingularError: z.number().finite().nonnegative().nullable(),
  maxRelativeSingularError: z.number().finite().nonnegative().nullable(),
  rankAgreement: z.boolean().nullable(),
  conditionRelativeError: z.number().finite().nonnegative().nullable(),
}).strict();

export const DirectSvdParityReceiptV1Schema = z.object({
  schema: z.literal('atlas.direct-svd-parity-receipt.v1'),
  requestId: z.string().min(1),
  matrixSha256: z.string().min(1),
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
  dtype: z.literal('float64'),
  comparisonTarget: z.literal('SINGULAR_VALUES_NOT_SINGULAR_VECTORS'),
  singularValueToleranceFactor: z.number().finite().positive(),
  maxRelativeSingularErrorPolicy: z.number().finite().positive(),
  maxReconstructionRelativeFrobeniusErrorPolicy: z.number().finite().positive(),
  runs: z.array(DirectSvdRunV1Schema).min(1),
  comparisons: z.array(DirectSvdComparisonV1Schema),
  status: z.enum(['PASS', 'FAIL', 'GPU_UNAVAILABLE']),
  cpuDirectSvdExecuted: z.boolean(),
  gpuGesvdjExecuted: z.boolean(),
  gpuGesvdExecuted: z.boolean(),
  ataJacobiIncluded: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type DirectSvdParityReceiptV1 = z.infer<typeof DirectSvdParityReceiptV1Schema>;

export const AtaDirectSvdParityPolicyV1Schema = z.object({
  maxActiveSingularRelativeError: z.number().finite().positive().max(1),
  maxConditionRelativeError: z.number().finite().positive().max(1),
}).strict();
export type AtaDirectSvdParityPolicyV1 = z.infer<typeof AtaDirectSvdParityPolicyV1Schema>;

export const AtaDirectSvdParityReceiptV1Schema = z.object({
  schema: z.literal('atlas.ata-direct-svd-parity-receipt.v1'),
  requestId: z.string().min(1),
  matrixSha256: z.string().regex(/^[a-f0-9]{64}$/),
  ataReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  directSvdReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  comparedDriver: z.literal('lapack_gesdd'),
  comparedSingularCount: z.number().int().nonnegative(),
  ataNumericalRank: z.number().int().nonnegative(),
  directRankAtAtaTolerance: z.number().int().nonnegative(),
  maxActiveSingularAbsoluteError: z.number().finite().nonnegative().nullable(),
  maxActiveSingularRelativeError: z.number().finite().nonnegative().nullable(),
  conditionRelativeError: z.number().finite().nonnegative().nullable(),
  rankAgreement: z.boolean(),
  status: z.enum(['PASS', 'FAIL', 'DIRECT_SVD_UNAVAILABLE', 'MATRIX_MISMATCH']),
  reasonCodes: z.array(z.string().min(1)).min(1),
  ataNumericalInstabilityDetected: z.boolean(),
  directSvdIsAuthorityForConditioning: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type AtaDirectSvdParityReceiptV1 = z.infer<typeof AtaDirectSvdParityReceiptV1Schema>;

export const DEFAULT_ATA_DIRECT_SVD_PARITY_POLICY: AtaDirectSvdParityPolicyV1 = {
  maxActiveSingularRelativeError: 1e-4,
  maxConditionRelativeError: 1e-3,
};

function relativeError(reference: number, observed: number): number {
  if (reference === 0) return observed === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(observed - reference) / Math.abs(reference);
}

export function compareAtaJacobiWithDirectSvd(input: {
  ata: MeasuredMatrixDiagnosticsReceiptV1;
  direct: DirectSvdParityReceiptV1;
  policy?: AtaDirectSvdParityPolicyV1;
  producerRevision: string;
}): AtaDirectSvdParityReceiptV1 {
  const ata = MeasuredMatrixDiagnosticsReceiptV1Schema.parse(input.ata);
  const direct = DirectSvdParityReceiptV1Schema.parse(input.direct);
  const policy = AtaDirectSvdParityPolicyV1Schema.parse(
    input.policy ?? DEFAULT_ATA_DIRECT_SVD_PARITY_POLICY,
  );
  const ataReceiptSha256 = stableReceiptSha256(ata);
  const directSvdReceiptSha256 = stableReceiptSha256(direct);

  if (ata.requestId !== direct.requestId
    || ata.matrixSha256 !== direct.matrixSha256
    || ata.rowCount !== direct.rows
    || ata.columnCount !== direct.cols) {
    return AtaDirectSvdParityReceiptV1Schema.parse({
      schema: 'atlas.ata-direct-svd-parity-receipt.v1',
      requestId: ata.requestId,
      matrixSha256: ata.matrixSha256,
      ataReceiptSha256,
      directSvdReceiptSha256,
      comparedDriver: 'lapack_gesdd',
      comparedSingularCount: 0,
      ataNumericalRank: ata.numericalRank,
      directRankAtAtaTolerance: 0,
      maxActiveSingularAbsoluteError: null,
      maxActiveSingularRelativeError: null,
      conditionRelativeError: null,
      rankAgreement: false,
      status: 'MATRIX_MISMATCH',
      reasonCodes: ['ATA_DIRECT_SVD_LINEAGE_OR_SHAPE_MISMATCH'],
      ataNumericalInstabilityDetected: false,
      directSvdIsAuthorityForConditioning: true,
      canonicalWritesAllowed: false,
      producerRevision: input.producerRevision,
    });
  }

  const cpu = direct.runs.find((run) => run.driver === 'lapack_gesdd' && run.status === 'EXECUTED');
  if (!cpu) {
    return AtaDirectSvdParityReceiptV1Schema.parse({
      schema: 'atlas.ata-direct-svd-parity-receipt.v1',
      requestId: ata.requestId,
      matrixSha256: ata.matrixSha256,
      ataReceiptSha256,
      directSvdReceiptSha256,
      comparedDriver: 'lapack_gesdd',
      comparedSingularCount: 0,
      ataNumericalRank: ata.numericalRank,
      directRankAtAtaTolerance: 0,
      maxActiveSingularAbsoluteError: null,
      maxActiveSingularRelativeError: null,
      conditionRelativeError: null,
      rankAgreement: false,
      status: 'DIRECT_SVD_UNAVAILABLE',
      reasonCodes: ['LAPACK_GESDD_DIRECT_SVD_NOT_EXECUTED'],
      ataNumericalInstabilityDetected: false,
      directSvdIsAuthorityForConditioning: true,
      canonicalWritesAllowed: false,
      producerRevision: input.producerRevision,
    });
  }

  const directRankAtAtaTolerance = cpu.singular_values
    .filter((value) => value > ata.singularValueTolerance).length;
  const comparedSingularCount = Math.min(
    ata.numericalRank,
    directRankAtAtaTolerance,
    ata.singularValues.length,
    cpu.singular_values.length,
  );

  let maxAbsolute = 0;
  let maxRelative = 0;
  for (let i = 0; i < comparedSingularCount; i += 1) {
    const reference = cpu.singular_values[i];
    const observed = ata.singularValues[i];
    maxAbsolute = Math.max(maxAbsolute, Math.abs(observed - reference));
    maxRelative = Math.max(maxRelative, relativeError(reference, observed));
  }

  const directActive = cpu.singular_values.filter((value) => value > ata.singularValueTolerance);
  const directCondition = directActive.length > 0
    ? directActive[0] / directActive[directActive.length - 1]
    : null;
  const conditionRelativeError = ata.conditionNumber != null && directCondition != null
    ? relativeError(directCondition, ata.conditionNumber)
    : null;
  const rankAgreement = ata.numericalRank === directRankAtAtaTolerance;

  const singularPass = comparedSingularCount > 0
    && Number.isFinite(maxRelative)
    && maxRelative <= policy.maxActiveSingularRelativeError;
  const conditionPass = conditionRelativeError == null
    ? ata.conditionNumber == null && directCondition == null
    : Number.isFinite(conditionRelativeError)
      && conditionRelativeError <= policy.maxConditionRelativeError;
  const pass = rankAgreement && singularPass && conditionPass;
  const reasonCodes: string[] = [];
  if (pass) reasonCodes.push('ATA_JACOBI_MATCHES_DIRECT_SVD_WITHIN_POLICY');
  if (!rankAgreement) reasonCodes.push('NUMERICAL_RANK_DISAGREEMENT');
  if (!singularPass) reasonCodes.push('ACTIVE_SINGULAR_VALUE_PARITY_FAILED');
  if (!conditionPass) reasonCodes.push('ACTIVE_SUBSPACE_CONDITION_PARITY_FAILED');

  return AtaDirectSvdParityReceiptV1Schema.parse({
    schema: 'atlas.ata-direct-svd-parity-receipt.v1',
    requestId: ata.requestId,
    matrixSha256: ata.matrixSha256,
    ataReceiptSha256,
    directSvdReceiptSha256,
    comparedDriver: 'lapack_gesdd',
    comparedSingularCount,
    ataNumericalRank: ata.numericalRank,
    directRankAtAtaTolerance,
    maxActiveSingularAbsoluteError: comparedSingularCount ? maxAbsolute : null,
    maxActiveSingularRelativeError: comparedSingularCount ? maxRelative : null,
    conditionRelativeError,
    rankAgreement,
    status: pass ? 'PASS' : 'FAIL',
    reasonCodes,
    ataNumericalInstabilityDetected: !pass,
    directSvdIsAuthorityForConditioning: true,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}
