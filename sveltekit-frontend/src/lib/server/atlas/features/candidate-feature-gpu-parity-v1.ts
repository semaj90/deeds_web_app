import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  CANDIDATE_SCALAR_FEATURES,
  candidateFeatureColumnarV1Schema,
} from './candidate-feature-columnar-v1.js';
import {
  candidateFeatureGpuGatherReferenceV1Schema,
  candidateFeatureGpuPackV1Schema,
} from './candidate-feature-gpu-pack-v1.js';

export const CANDIDATE_FEATURE_GPU_PARITY_SCHEMA = 'atlas.candidate-feature-gpu-parity-receipt.v1' as const;

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export const candidateFeatureGpuParityReceiptV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_GPU_PARITY_SCHEMA),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: checksum,
  featureSnapshotChecksum: checksum,
  columnarChecksum: checksum,
  gpuPackChecksum: checksum,
  gatherChecksum: checksum,
  selectedOrdinalsChecksum: checksum,
  logicalRows: z.number().int().nonnegative(),
  physicalRows: z.number().int().nonnegative(),
  paddingRows: z.number().int().nonnegative(),
  selectedRowCount: z.number().int().nonnegative(),
  featureCount: z.literal(CANDIDATE_SCALAR_FEATURES.length),
  ordinalParity: z.literal(true),
  featureValueParity: z.literal(true),
  featurePresenceParity: z.literal(true),
  laneMaskParity: z.literal(true),
  degradedIdentityParity: z.literal(true),
  paddingMaskParity: z.literal(true),
  paddingZeroParity: z.literal(true),
  gpuExecutionObserved: z.boolean(),
  challenger: z.enum(['CPU_PACK_REFERENCE', 'PYTORCH_CUDA', 'LIBTORCH_CUDA', 'CUDF_CUDA', 'OTHER']),
  maxAbsFeatureDelta: z.number().finite().nonnegative(),
  parityChecksum: checksum,
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  producerRevision: revision,
}).strict();

export type CandidateFeatureGpuParityReceiptV1 = z.infer<typeof candidateFeatureGpuParityReceiptV1Schema>;

export function verifyCandidateFeatureGpuParity(input: {
  columnar: z.input<typeof candidateFeatureColumnarV1Schema>;
  pack: z.input<typeof candidateFeatureGpuPackV1Schema>;
  gather: z.input<typeof candidateFeatureGpuGatherReferenceV1Schema>;
  challenger?: CandidateFeatureGpuParityReceiptV1['challenger'];
  gpuExecutionObserved?: boolean;
  observedFeatureValues?: readonly number[];
  observedFeaturePresence?: readonly number[];
  observedSelectedOrdinals?: readonly number[];
  producerRevision: string;
}): CandidateFeatureGpuParityReceiptV1 {
  const columnar = candidateFeatureColumnarV1Schema.parse(input.columnar);
  const pack = candidateFeatureGpuPackV1Schema.parse(input.pack);
  const gather = candidateFeatureGpuGatherReferenceV1Schema.parse(input.gather);

  if (pack.columnarChecksum !== columnar.columnarChecksum) throw new Error('FEATURE_GPU_PARITY_COLUMNAR_CHECKSUM_MISMATCH');
  if (pack.candidateSnapshotRevision !== columnar.candidateSnapshotRevision || gather.candidateSnapshotRevision !== columnar.candidateSnapshotRevision) {
    throw new Error('FEATURE_GPU_PARITY_CANDIDATE_SNAPSHOT_REVISION_MISMATCH');
  }
  if (pack.ordinalMapChecksum !== columnar.ordinalMapChecksum || pack.featureSnapshotChecksum !== columnar.featureSnapshotChecksum) {
    throw new Error('FEATURE_GPU_PARITY_LINEAGE_MISMATCH');
  }
  if (gather.gpuPackChecksum !== pack.gpuPackChecksum) throw new Error('FEATURE_GPU_PARITY_GATHER_PACK_MISMATCH');

  const selectedOrdinals = input.observedSelectedOrdinals ?? gather.selectedOrdinals;
  if (selectedOrdinals.length !== gather.selectedOrdinals.length) throw new Error('FEATURE_GPU_PARITY_ORDINAL_COUNT_MISMATCH');
  for (let i = 0; i < gather.selectedOrdinals.length; i += 1) {
    if (selectedOrdinals[i] !== gather.selectedOrdinals[i]) throw new Error(`FEATURE_GPU_PARITY_ORDINAL_MISMATCH:${i}`);
  }

  const observedValues = input.observedFeatureValues ?? gather.featureValues;
  const observedPresence = input.observedFeaturePresence ?? gather.featurePresence;
  if (observedValues.length !== gather.featureValues.length) throw new Error('FEATURE_GPU_PARITY_VALUE_COUNT_MISMATCH');
  if (observedPresence.length !== gather.featurePresence.length) throw new Error('FEATURE_GPU_PARITY_PRESENCE_COUNT_MISMATCH');

  let maxAbsFeatureDelta = 0;
  for (let index = 0; index < gather.featureValues.length; index += 1) {
    const observed = Math.fround(observedValues[index] ?? Number.NaN);
    const expected = Math.fround(gather.featureValues[index] ?? Number.NaN);
    if (!Number.isFinite(observed) || !Number.isFinite(expected)) throw new Error(`FEATURE_GPU_PARITY_NON_FINITE:${index}`);
    const delta = Math.abs(observed - expected);
    if (delta > maxAbsFeatureDelta) maxAbsFeatureDelta = delta;
    if (delta !== 0) throw new Error(`FEATURE_GPU_PARITY_VALUE_MISMATCH:${index}:${observed}:${expected}`);
    if (observedPresence[index] !== gather.featurePresence[index]) throw new Error(`FEATURE_GPU_PARITY_PRESENCE_MISMATCH:${index}`);
  }

  for (let index = 0; index < gather.selectedOrdinals.length; index += 1) {
    const ordinal = gather.selectedOrdinals[index]!;
    if (gather.laneMaskU16[index] !== columnar.laneMaskU16[ordinal]) throw new Error(`FEATURE_GPU_PARITY_LANE_MASK_MISMATCH:${ordinal}`);
    if (gather.degradedIdentity[index] !== columnar.degradedIdentity[ordinal]) throw new Error(`FEATURE_GPU_PARITY_DEGRADED_IDENTITY_MISMATCH:${ordinal}`);
  }

  for (let row = 0; row < pack.physicalRows; row += 1) {
    const expectedMask = row < pack.logicalRows ? 1 : 0;
    if (pack.validMask[row] !== expectedMask) throw new Error(`FEATURE_GPU_PARITY_VALID_MASK_MISMATCH:${row}`);
    if (row >= pack.logicalRows) {
      if (pack.laneMaskU16[row] !== 0 || pack.degradedIdentity[row] !== 0) throw new Error(`FEATURE_GPU_PARITY_PADDED_METADATA_NONZERO:${row}`);
      const base = row * pack.featureCount;
      for (let feature = 0; feature < pack.featureCount; feature += 1) {
        if (pack.featureValues[base + feature] !== 0 || pack.featurePresence[base + feature] !== 0) {
          throw new Error(`FEATURE_GPU_PARITY_PADDED_CELL_NONZERO:${row}:${feature}`);
        }
      }
    }
  }

  const challenger = input.challenger ?? 'CPU_PACK_REFERENCE';
  const gpuExecutionObserved = input.gpuExecutionObserved ?? false;
  if (challenger !== 'CPU_PACK_REFERENCE' && gpuExecutionObserved !== true) {
    throw new Error('FEATURE_GPU_PARITY_CHALLENGER_REQUIRES_GPU_EXECUTION_OBSERVATION');
  }
  if (challenger === 'CPU_PACK_REFERENCE' && gpuExecutionObserved) {
    throw new Error('FEATURE_GPU_PARITY_CPU_REFERENCE_CANNOT_CLAIM_GPU_EXECUTION');
  }

  const parityChecksum = sha256(JSON.stringify({
    candidateSnapshotRevision: columnar.candidateSnapshotRevision,
    ordinalMapChecksum: columnar.ordinalMapChecksum,
    featureSnapshotChecksum: columnar.featureSnapshotChecksum,
    columnarChecksum: columnar.columnarChecksum,
    gpuPackChecksum: pack.gpuPackChecksum,
    gatherChecksum: gather.gatherChecksum,
    selectedOrdinalsChecksum: gather.selectedOrdinalsChecksum,
    challenger,
    gpuExecutionObserved,
    maxAbsFeatureDelta,
  }));

  return candidateFeatureGpuParityReceiptV1Schema.parse({
    schema: CANDIDATE_FEATURE_GPU_PARITY_SCHEMA,
    candidateSnapshotRevision: columnar.candidateSnapshotRevision,
    ordinalMapChecksum: columnar.ordinalMapChecksum,
    featureSnapshotChecksum: columnar.featureSnapshotChecksum,
    columnarChecksum: columnar.columnarChecksum,
    gpuPackChecksum: pack.gpuPackChecksum,
    gatherChecksum: gather.gatherChecksum,
    selectedOrdinalsChecksum: gather.selectedOrdinalsChecksum,
    logicalRows: pack.logicalRows,
    physicalRows: pack.physicalRows,
    paddingRows: pack.paddingRows,
    selectedRowCount: gather.selectedRowCount,
    featureCount: pack.featureCount,
    ordinalParity: true,
    featureValueParity: true,
    featurePresenceParity: true,
    laneMaskParity: true,
    degradedIdentityParity: true,
    paddingMaskParity: true,
    paddingZeroParity: true,
    gpuExecutionObserved,
    challenger,
    maxAbsFeatureDelta,
    parityChecksum,
    identityAuthority: false,
    canonicalOwnerChanged: false,
    producerRevision: input.producerRevision,
  });
}
