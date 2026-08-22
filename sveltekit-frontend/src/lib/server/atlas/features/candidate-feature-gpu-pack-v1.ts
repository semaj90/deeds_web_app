import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  CANDIDATE_SCALAR_FEATURES,
  candidateFeatureColumnarV1Schema,
  type CandidateFeatureColumnarV1,
  type CandidateScalarFeatureName,
} from './candidate-feature-columnar-v1.js';

export const CANDIDATE_FEATURE_GPU_PACK_SCHEMA = 'atlas.candidate-feature-gpu-pack.v1' as const;
export const CANDIDATE_FEATURE_GPU_GATHER_SCHEMA = 'atlas.candidate-feature-gpu-gather-reference.v1' as const;
export const DEFAULT_GPU_ROW_ALIGNMENT = 32;
export const GPU_PADDING_POLICY = 'ZERO_INVALID_MASKED_V1' as const;

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);
const featureNameSchema = z.enum(CANDIDATE_SCALAR_FEATURES);

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function encodeU16LE(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return bytes;
}

function encodeU32LE(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}

function encodeF32LE(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytes;
}

function assertPowerOfTwo(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 4096 || (value & (value - 1)) !== 0) {
    throw new Error(`FEATURE_GPU_PACK_ROW_ALIGNMENT_INVALID:${value}`);
  }
}

function verifyColumnarChecksums(columnar: CandidateFeatureColumnarV1): void {
  for (let ordinal = 0; ordinal < columnar.rowCount; ordinal += 1) {
    if (columnar.candidateOrdinals[ordinal] !== ordinal) {
      throw new Error(`FEATURE_GPU_PACK_NON_DENSE_ORDINAL:${ordinal}:${columnar.candidateOrdinals[ordinal]}`);
    }
  }
  const candidateOrdinalsChecksum = sha256(encodeU32LE(columnar.candidateOrdinals));
  if (candidateOrdinalsChecksum !== columnar.candidateOrdinalsChecksum) {
    throw new Error('FEATURE_GPU_PACK_CANDIDATE_ORDINAL_CHECKSUM_MISMATCH');
  }
  const featureValuesChecksum = sha256(encodeF32LE(columnar.featureValues));
  if (featureValuesChecksum !== columnar.featureValuesChecksum) {
    throw new Error('FEATURE_GPU_PACK_FEATURE_VALUE_CHECKSUM_MISMATCH');
  }
  const featurePresenceChecksum = sha256(Uint8Array.from(columnar.featurePresence));
  if (featurePresenceChecksum !== columnar.featurePresenceChecksum) {
    throw new Error('FEATURE_GPU_PACK_FEATURE_PRESENCE_CHECKSUM_MISMATCH');
  }
  const columnarChecksum = sha256(JSON.stringify({
    candidateSnapshotRevision: columnar.candidateSnapshotRevision,
    ordinalMapChecksum: columnar.ordinalMapChecksum,
    featureSnapshotChecksum: columnar.featureSnapshotChecksum,
    candidateOrdinalsChecksum: columnar.candidateOrdinalsChecksum,
    featureValuesChecksum: columnar.featureValuesChecksum,
    featurePresenceChecksum: columnar.featurePresenceChecksum,
    rowIdentityChecksum: columnar.rowIdentityChecksum,
    featureNames: CANDIDATE_SCALAR_FEATURES,
  }));
  if (columnarChecksum !== columnar.columnarChecksum) {
    throw new Error('FEATURE_GPU_PACK_COLUMNAR_CHECKSUM_MISMATCH');
  }
}

export function computeGpuPhysicalRows(logicalRows: number, rowAlignment = DEFAULT_GPU_ROW_ALIGNMENT): number {
  assertPowerOfTwo(rowAlignment);
  if (!Number.isInteger(logicalRows) || logicalRows < 0) {
    throw new Error(`FEATURE_GPU_PACK_LOGICAL_ROWS_INVALID:${logicalRows}`);
  }
  if (logicalRows === 0) return 0;
  return Math.ceil(logicalRows / rowAlignment) * rowAlignment;
}

export const candidateFeatureGpuPackV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_GPU_PACK_SCHEMA),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: checksum,
  featureSnapshotChecksum: checksum,
  workspaceRevision: revision,
  featureRevision: revision,
  columnarChecksum: checksum,
  logicalRows: z.number().int().nonnegative(),
  physicalRows: z.number().int().nonnegative(),
  paddingRows: z.number().int().nonnegative(),
  rowAlignment: z.number().int().positive().max(4096),
  featureCount: z.literal(CANDIDATE_SCALAR_FEATURES.length),
  featureNames: z.array(featureNameSchema).length(CANDIDATE_SCALAR_FEATURES.length),
  featureValues: z.array(z.number().finite()),
  featurePresence: z.array(z.union([z.literal(0), z.literal(1)])),
  validMask: z.array(z.union([z.literal(0), z.literal(1)])),
  laneMaskU16: z.array(z.number().int().min(0).max(0xffff)),
  degradedIdentity: z.array(z.union([z.literal(0), z.literal(1)])),
  featureValuesChecksum: checksum,
  featurePresenceChecksum: checksum,
  validMaskChecksum: checksum,
  laneMaskChecksum: checksum,
  degradedIdentityChecksum: checksum,
  gpuPackChecksum: checksum,
  byteOrder: z.literal('little-endian'),
  featureDtype: z.literal('float32'),
  presenceDtype: z.literal('uint8'),
  validMaskDtype: z.literal('uint8'),
  laneMaskSourceDtype: z.literal('uint16'),
  paddingPolicy: z.literal(GPU_PADDING_POLICY),
  logicalOrdinalEqualsPhysicalRowForValidPrefix: z.literal(true),
  paddedRowsCarryIdentity: z.literal(false),
  gpuResident: z.literal(false),
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  producerRevision: revision,
}).strict().superRefine((value, ctx) => {
  const physical = value.physicalRows;
  if ((value.rowAlignment & (value.rowAlignment - 1)) !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rowAlignment'], message: 'FEATURE_GPU_PACK_ROW_ALIGNMENT_NOT_POWER_OF_TWO' });
  }
  if (value.paddingRows !== physical - value.logicalRows || physical < value.logicalRows) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paddingRows'], message: 'FEATURE_GPU_PACK_PADDING_SHAPE_MISMATCH' });
  }
  if (value.logicalRows > 0 && physical % value.rowAlignment !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['physicalRows'], message: 'FEATURE_GPU_PACK_ALIGNMENT_MISMATCH' });
  }
  if (value.logicalRows === 0 && physical !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['physicalRows'], message: 'FEATURE_GPU_PACK_EMPTY_SHAPE_MISMATCH' });
  }
  const cells = physical * value.featureCount;
  if (value.featureValues.length !== cells || value.featurePresence.length !== cells) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['featureValues'], message: 'FEATURE_GPU_PACK_CELL_COUNT_MISMATCH' });
  }
  if (value.validMask.length !== physical || value.laneMaskU16.length !== physical || value.degradedIdentity.length !== physical) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validMask'], message: 'FEATURE_GPU_PACK_ROW_BUFFER_LENGTH_MISMATCH' });
  }
  for (let row = 0; row < physical; row += 1) {
    const expected = row < value.logicalRows ? 1 : 0;
    if (value.validMask[row] !== expected) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validMask', row], message: 'FEATURE_GPU_PACK_VALID_MASK_NOT_PREFIX' });
      break;
    }
    if (row >= value.logicalRows) {
      if (value.laneMaskU16[row] !== 0 || value.degradedIdentity[row] !== 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['laneMaskU16', row], message: 'FEATURE_GPU_PACK_PADDED_METADATA_NONZERO' });
        break;
      }
      const base = row * value.featureCount;
      for (let feature = 0; feature < value.featureCount; feature += 1) {
        if (value.featureValues[base + feature] !== 0 || value.featurePresence[base + feature] !== 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['featureValues', base + feature], message: 'FEATURE_GPU_PACK_PADDED_CELL_NONZERO' });
          return;
        }
      }
    }
  }
});

export type CandidateFeatureGpuPackV1 = z.infer<typeof candidateFeatureGpuPackV1Schema>;

export const candidateFeatureGpuGatherReferenceV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_GPU_GATHER_SCHEMA),
  gpuPackChecksum: checksum,
  candidateSnapshotRevision: revision,
  selectedOrdinals: z.array(z.number().int().nonnegative()),
  selectedRowCount: z.number().int().nonnegative(),
  featureCount: z.literal(CANDIDATE_SCALAR_FEATURES.length),
  featureNames: z.array(featureNameSchema).length(CANDIDATE_SCALAR_FEATURES.length),
  featureValues: z.array(z.number().finite()),
  featurePresence: z.array(z.union([z.literal(0), z.literal(1)])),
  laneMaskU16: z.array(z.number().int().min(0).max(0xffff)),
  degradedIdentity: z.array(z.union([z.literal(0), z.literal(1)])),
  selectedOrdinalsChecksum: checksum,
  featureValuesChecksum: checksum,
  featurePresenceChecksum: checksum,
  gatherChecksum: checksum,
  identityAuthority: z.literal(false),
  producerRevision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.selectedOrdinals.length !== value.selectedRowCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selectedOrdinals'], message: 'FEATURE_GPU_GATHER_SELECTED_ROW_COUNT_MISMATCH' });
  }
  if (new Set(value.selectedOrdinals).size !== value.selectedOrdinals.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selectedOrdinals'], message: 'FEATURE_GPU_GATHER_DUPLICATE_ORDINAL' });
  }
  if (value.featureValues.length !== value.selectedRowCount * value.featureCount || value.featurePresence.length !== value.selectedRowCount * value.featureCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['featureValues'], message: 'FEATURE_GPU_GATHER_CELL_COUNT_MISMATCH' });
  }
  if (value.laneMaskU16.length !== value.selectedRowCount || value.degradedIdentity.length !== value.selectedRowCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['laneMaskU16'], message: 'FEATURE_GPU_GATHER_ROW_BUFFER_LENGTH_MISMATCH' });
  }
});

export type CandidateFeatureGpuGatherReferenceV1 = z.infer<typeof candidateFeatureGpuGatherReferenceV1Schema>;

export function materializeCandidateFeatureGpuPack(input: {
  columnar: z.input<typeof candidateFeatureColumnarV1Schema>;
  rowAlignment?: number;
  producerRevision: string;
}): CandidateFeatureGpuPackV1 {
  const columnar = candidateFeatureColumnarV1Schema.parse(input.columnar);
  verifyColumnarChecksums(columnar);
  const rowAlignment = input.rowAlignment ?? DEFAULT_GPU_ROW_ALIGNMENT;
  const physicalRows = computeGpuPhysicalRows(columnar.rowCount, rowAlignment);
  const paddingRows = physicalRows - columnar.rowCount;
  const physicalCells = physicalRows * columnar.featureCount;
  const featureValues = Array<number>(physicalCells).fill(0);
  const featurePresence = Array<0 | 1>(physicalCells).fill(0);
  const validMask = Array<0 | 1>(physicalRows).fill(0);
  const laneMaskU16 = Array<number>(physicalRows).fill(0);
  const degradedIdentity = Array<0 | 1>(physicalRows).fill(0);

  for (let row = 0; row < columnar.rowCount; row += 1) {
    validMask[row] = 1;
    laneMaskU16[row] = columnar.laneMaskU16[row] ?? 0;
    degradedIdentity[row] = columnar.degradedIdentity[row] ?? 0;
    const sourceBase = row * columnar.featureCount;
    const targetBase = row * columnar.featureCount;
    for (let feature = 0; feature < columnar.featureCount; feature += 1) {
      featureValues[targetBase + feature] = Math.fround(columnar.featureValues[sourceBase + feature] ?? 0);
      featurePresence[targetBase + feature] = columnar.featurePresence[sourceBase + feature] ?? 0;
    }
  }

  const featureValuesChecksum = sha256(encodeF32LE(featureValues));
  const featurePresenceChecksum = sha256(Uint8Array.from(featurePresence));
  const validMaskChecksum = sha256(Uint8Array.from(validMask));
  const laneMaskChecksum = sha256(encodeU16LE(laneMaskU16));
  const degradedIdentityChecksum = sha256(Uint8Array.from(degradedIdentity));
  const gpuPackChecksum = sha256(JSON.stringify({
    candidateSnapshotRevision: columnar.candidateSnapshotRevision,
    ordinalMapChecksum: columnar.ordinalMapChecksum,
    featureSnapshotChecksum: columnar.featureSnapshotChecksum,
    columnarChecksum: columnar.columnarChecksum,
    logicalRows: columnar.rowCount,
    physicalRows,
    rowAlignment,
    featureNames: CANDIDATE_SCALAR_FEATURES,
    featureValuesChecksum,
    featurePresenceChecksum,
    validMaskChecksum,
    laneMaskChecksum,
    degradedIdentityChecksum,
    paddingPolicy: GPU_PADDING_POLICY,
  }));

  return candidateFeatureGpuPackV1Schema.parse({
    schema: CANDIDATE_FEATURE_GPU_PACK_SCHEMA,
    candidateSnapshotRevision: columnar.candidateSnapshotRevision,
    ordinalMapChecksum: columnar.ordinalMapChecksum,
    featureSnapshotChecksum: columnar.featureSnapshotChecksum,
    workspaceRevision: columnar.workspaceRevision,
    featureRevision: columnar.featureRevision,
    columnarChecksum: columnar.columnarChecksum,
    logicalRows: columnar.rowCount,
    physicalRows,
    paddingRows,
    rowAlignment,
    featureCount: columnar.featureCount,
    featureNames: [...CANDIDATE_SCALAR_FEATURES],
    featureValues,
    featurePresence,
    validMask,
    laneMaskU16,
    degradedIdentity,
    featureValuesChecksum,
    featurePresenceChecksum,
    validMaskChecksum,
    laneMaskChecksum,
    degradedIdentityChecksum,
    gpuPackChecksum,
    byteOrder: 'little-endian',
    featureDtype: 'float32',
    presenceDtype: 'uint8',
    validMaskDtype: 'uint8',
    laneMaskSourceDtype: 'uint16',
    paddingPolicy: GPU_PADDING_POLICY,
    logicalOrdinalEqualsPhysicalRowForValidPrefix: true,
    paddedRowsCarryIdentity: false,
    gpuResident: false,
    identityAuthority: false,
    canonicalOwnerChanged: false,
    producerRevision: input.producerRevision,
  });
}

export function gatherCandidateFeatureGpuRows(input: {
  pack: z.input<typeof candidateFeatureGpuPackV1Schema>;
  selectedOrdinals: readonly number[];
  producerRevision: string;
}): CandidateFeatureGpuGatherReferenceV1 {
  const pack = candidateFeatureGpuPackV1Schema.parse(input.pack);
  if (new Set(input.selectedOrdinals).size !== input.selectedOrdinals.length) {
    throw new Error('FEATURE_GPU_GATHER_DUPLICATE_ORDINAL');
  }
  const selectedOrdinals = input.selectedOrdinals.map((ordinal) => {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= pack.logicalRows) {
      throw new Error(`FEATURE_GPU_GATHER_ORDINAL_OUT_OF_RANGE:${ordinal}`);
    }
    return ordinal;
  });

  const featureValues: number[] = [];
  const featurePresence: Array<0 | 1> = [];
  const laneMaskU16: number[] = [];
  const degradedIdentity: Array<0 | 1> = [];
  for (const ordinal of selectedOrdinals) {
    const base = ordinal * pack.featureCount;
    for (let feature = 0; feature < pack.featureCount; feature += 1) {
      featureValues.push(Math.fround(pack.featureValues[base + feature] ?? 0));
      featurePresence.push(pack.featurePresence[base + feature] ?? 0);
    }
    laneMaskU16.push(pack.laneMaskU16[ordinal] ?? 0);
    degradedIdentity.push(pack.degradedIdentity[ordinal] ?? 0);
  }

  const selectedOrdinalsChecksum = sha256(encodeU32LE(selectedOrdinals));
  const featureValuesChecksum = sha256(encodeF32LE(featureValues));
  const featurePresenceChecksum = sha256(Uint8Array.from(featurePresence));
  const gatherChecksum = sha256(JSON.stringify({
    gpuPackChecksum: pack.gpuPackChecksum,
    selectedOrdinalsChecksum,
    featureValuesChecksum,
    featurePresenceChecksum,
    laneMaskChecksum: sha256(encodeU16LE(laneMaskU16)),
    degradedIdentityChecksum: sha256(Uint8Array.from(degradedIdentity)),
  }));

  return candidateFeatureGpuGatherReferenceV1Schema.parse({
    schema: CANDIDATE_FEATURE_GPU_GATHER_SCHEMA,
    gpuPackChecksum: pack.gpuPackChecksum,
    candidateSnapshotRevision: pack.candidateSnapshotRevision,
    selectedOrdinals,
    selectedRowCount: selectedOrdinals.length,
    featureCount: pack.featureCount,
    featureNames: [...CANDIDATE_SCALAR_FEATURES],
    featureValues,
    featurePresence,
    laneMaskU16,
    degradedIdentity,
    selectedOrdinalsChecksum,
    featureValuesChecksum,
    featurePresenceChecksum,
    gatherChecksum,
    identityAuthority: false,
    producerRevision: input.producerRevision,
  });
}

export function featureCellIndex(row: number, feature: CandidateScalarFeatureName): number {
  const featureIndex = CANDIDATE_SCALAR_FEATURES.indexOf(feature);
  if (featureIndex < 0) throw new Error(`FEATURE_GPU_PACK_UNKNOWN_FEATURE:${feature}`);
  return row * CANDIDATE_SCALAR_FEATURES.length + featureIndex;
}
