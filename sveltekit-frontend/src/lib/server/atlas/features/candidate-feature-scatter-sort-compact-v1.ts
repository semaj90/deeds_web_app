import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  CANDIDATE_SCALAR_FEATURES,
  type CandidateScalarFeatureName,
  type CandidateFeatureColumnarV1,
  candidateFeatureColumnarV1Schema,
} from './candidate-feature-columnar-v1.js';

export const CANDIDATE_FEATURE_SCATTER_SORT_COMPACT_SCHEMA =
  'atlas.candidate-feature-scatter-sort-compact-challenger.v1' as const;

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);
const featureName = z.enum(CANDIDATE_SCALAR_FEATURES);

export const candidateFeatureScatterSortCompactV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_SCATTER_SORT_COMPACT_SCHEMA),
  candidateSnapshotRevision: revision,
  columnarChecksum: checksum,
  selectedOrdinals: z.array(z.number().int().nonnegative()),
  selectedOrdinalsChecksum: checksum,
  scatterValidMask: z.array(z.union([z.literal(0), z.literal(1)])),
  scatterValidMaskChecksum: checksum,
  sortFeature: featureName,
  sortDirection: z.enum(['ASC', 'DESC']),
  sortedOrdinals: z.array(z.number().int().nonnegative()),
  sortedOrdinalsChecksum: checksum,
  compactedOrdinals: z.array(z.number().int().nonnegative()),
  compactedOrdinalsChecksum: checksum,
  compactedRowCount: z.number().int().nonnegative(),
  topK: z.number().int().positive(),
  featureCount: z.literal(CANDIDATE_SCALAR_FEATURES.length),
  compactedFeatureValues: z.array(z.number().finite()),
  compactedFeaturePresence: z.array(z.union([z.literal(0), z.literal(1)])),
  compactedFeatureValuesChecksum: checksum,
  compactedFeaturePresenceChecksum: checksum,
  compactionPolicy: z.literal('TOP_K_STABLE_ORDINAL_TIE_BREAK'),
  identityAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.scatterValidMask.length === 0 && value.selectedOrdinals.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scatterValidMask'], message: 'FEATURE_SCATTER_MASK_EMPTY' });
  }
  if (value.sortedOrdinals.length !== value.selectedOrdinals.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sortedOrdinals'], message: 'FEATURE_SORT_ROW_COUNT_MISMATCH' });
  }
  if (value.compactedOrdinals.length !== value.compactedRowCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['compactedOrdinals'], message: 'FEATURE_COMPACT_ROW_COUNT_MISMATCH' });
  }
  const cells = value.compactedRowCount * value.featureCount;
  if (value.compactedFeatureValues.length !== cells || value.compactedFeaturePresence.length !== cells) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['compactedFeatureValues'], message: 'FEATURE_COMPACT_CELL_COUNT_MISMATCH' });
  }
});

export type CandidateFeatureScatterSortCompactV1 = z.infer<typeof candidateFeatureScatterSortCompactV1Schema>;

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
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

function featureIndex(feature: CandidateScalarFeatureName): number {
  const index = CANDIDATE_SCALAR_FEATURES.indexOf(feature);
  if (index < 0) throw new Error(`FEATURE_SCATTER_UNKNOWN_SORT_FEATURE:${feature}`);
  return index;
}

function validateOrdinals(columnar: CandidateFeatureColumnarV1, ordinals: readonly number[]): void {
  if (new Set(ordinals).size !== ordinals.length) throw new Error('FEATURE_SCATTER_DUPLICATE_ORDINAL');
  for (const ordinal of ordinals) {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= columnar.rowCount) {
      throw new Error(`FEATURE_SCATTER_ORDINAL_OUT_OF_RANGE:${ordinal}`);
    }
  }
}

/**
 * Fixture/reference challenger for a future native scatter-sort-compact executor.
 * It only transforms an already validated columnar snapshot and never promotes
 * identity or writes to a canonical/derived store.
 */
export function runCandidateFeatureScatterSortCompactChallenger(input: {
  columnar: z.input<typeof candidateFeatureColumnarV1Schema>;
  selectedOrdinals?: readonly number[];
  sortFeature: CandidateScalarFeatureName;
  sortDirection?: 'ASC' | 'DESC';
  topK?: number;
  producerRevision: string;
}): CandidateFeatureScatterSortCompactV1 {
  const columnar = candidateFeatureColumnarV1Schema.parse(input.columnar);
  const selectedOrdinals = [...(input.selectedOrdinals ?? columnar.candidateOrdinals)];
  validateOrdinals(columnar, selectedOrdinals);
  const topK = input.topK ?? Math.max(1, selectedOrdinals.length);
  if (!Number.isInteger(topK) || topK < 1) throw new Error('FEATURE_COMPACT_INVALID_TOP_K');

  const sortDirection = input.sortDirection ?? 'DESC';
  const sortColumn = featureIndex(input.sortFeature);
  const sortedOrdinals = [...selectedOrdinals].sort((left, right) => {
    const leftBase = left * columnar.featureCount;
    const rightBase = right * columnar.featureCount;
    const leftPresent = columnar.featurePresence[leftBase + sortColumn] === 1;
    const rightPresent = columnar.featurePresence[rightBase + sortColumn] === 1;
    if (leftPresent !== rightPresent) return leftPresent ? -1 : 1;
    if (leftPresent) {
      const leftValue = columnar.featureValues[leftBase + sortColumn]!;
      const rightValue = columnar.featureValues[rightBase + sortColumn]!;
      if (leftValue !== rightValue) {
        return sortDirection === 'DESC' ? rightValue - leftValue : leftValue - rightValue;
      }
    }
    return left - right;
  });
  const compactedOrdinals = sortedOrdinals.slice(0, Math.min(topK, sortedOrdinals.length));
  const compactedFeatureValues: number[] = [];
  const compactedFeaturePresence: Array<0 | 1> = [];
  for (const ordinal of compactedOrdinals) {
    const base = ordinal * columnar.featureCount;
    for (let feature = 0; feature < columnar.featureCount; feature += 1) {
      compactedFeatureValues.push(Math.fround(columnar.featureValues[base + feature] ?? 0));
      compactedFeaturePresence.push(columnar.featurePresence[base + feature] ?? 0);
    }
  }

  const scatterValidMask: Array<0 | 1> = Array(columnar.rowCount).fill(0);
  for (const ordinal of selectedOrdinals) scatterValidMask[ordinal] = 1;

  return candidateFeatureScatterSortCompactV1Schema.parse({
    schema: CANDIDATE_FEATURE_SCATTER_SORT_COMPACT_SCHEMA,
    candidateSnapshotRevision: columnar.candidateSnapshotRevision,
    columnarChecksum: columnar.columnarChecksum,
    selectedOrdinals,
    selectedOrdinalsChecksum: sha256(encodeU32LE(selectedOrdinals)),
    scatterValidMask,
    scatterValidMaskChecksum: sha256(Uint8Array.from(scatterValidMask)),
    sortFeature: input.sortFeature,
    sortDirection,
    sortedOrdinals,
    sortedOrdinalsChecksum: sha256(encodeU32LE(sortedOrdinals)),
    compactedOrdinals,
    compactedOrdinalsChecksum: sha256(encodeU32LE(compactedOrdinals)),
    compactedRowCount: compactedOrdinals.length,
    topK,
    featureCount: CANDIDATE_SCALAR_FEATURES.length,
    compactedFeatureValues,
    compactedFeaturePresence,
    compactedFeatureValuesChecksum: sha256(encodeF32LE(compactedFeatureValues)),
    compactedFeaturePresenceChecksum: sha256(Uint8Array.from(compactedFeaturePresence)),
    compactionPolicy: 'TOP_K_STABLE_ORDINAL_TIE_BREAK',
    identityAuthority: false,
    canonicalOwnerChanged: false,
    canonicalWritesAttempted: false,
    producerRevision: input.producerRevision,
  });
}
