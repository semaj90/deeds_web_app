import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
  CANDIDATE_SCALAR_FEATURES,
  candidateFeatureColumnarV1Schema,
  type CandidateFeatureColumnarV1,
} from '../features/candidate-feature-columnar-v1.js';
import {
  materializeSampleQueryMatrixV1,
  type SampleQueryMatrixV1,
} from './sample-query-matrix-v1.js';

export const CANDIDATE_FEATURE_SAMPLE_QUERY_ADAPTER_SCHEMA = 'atlas.candidate-feature-sample-query-adapter.v1' as const;

export const CandidateFeatureSamplingNormalizationSchema = z.enum([
  'NONE',
  'COLUMN_STANDARDIZED',
]);

export const candidateFeatureSampleQueryAdapterReceiptV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_SAMPLE_QUERY_ADAPTER_SCHEMA),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  columnarChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  rowIdentityChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  featureValuesChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  featurePresenceChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  featureCount: z.literal(CANDIDATE_SCALAR_FEATURES.length),
  outputColumnCount: z.literal(CANDIDATE_SCALAR_FEATURES.length * 2),
  valueColumns: z.array(z.string()).length(CANDIDATE_SCALAR_FEATURES.length),
  presenceColumns: z.array(z.string()).length(CANDIDATE_SCALAR_FEATURES.length),
  missingValuePolicy: z.literal('VALUE_ZERO_PLUS_SEPARATE_PRESENCE_BIT'),
  normalization: CandidateFeatureSamplingNormalizationSchema,
  standardizationPolicy: z.enum(['NONE', 'PRESENT_VALUE_ZSCORE_PRESENCE_UNCHANGED']),
  matrixChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  adapterChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  identityAuthority: z.literal(false),
  retrievalVoteProduced: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type CandidateFeatureSampleQueryAdapterReceiptV1 = z.infer<typeof candidateFeatureSampleQueryAdapterReceiptV1Schema>;

function checksum(value: unknown): string {
  const canonical = (entry: unknown): string => {
    if (entry === null || typeof entry !== 'object') return JSON.stringify(entry);
    if (Array.isArray(entry)) return `[${entry.map(canonical).join(',')}]`;
    return `{${Object.entries(entry as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  };
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function assertAligned(map: CandidateOrdinalMapV1, columnar: CandidateFeatureColumnarV1): void {
  if (columnar.candidateSnapshotRevision !== map.candidateSnapshotRevision) {
    throw new Error('FEATURE_SAMPLE_CANDIDATE_SNAPSHOT_MISMATCH');
  }
  if (columnar.ordinalMapChecksum !== map.ordinalMapChecksum) {
    throw new Error('FEATURE_SAMPLE_ORDINAL_MAP_CHECKSUM_MISMATCH');
  }
  if (columnar.workspaceRevision !== map.workspaceRevision) {
    throw new Error('FEATURE_SAMPLE_WORKSPACE_REVISION_MISMATCH');
  }
  if (columnar.rowCount !== map.rowCount) {
    throw new Error(`FEATURE_SAMPLE_ROW_COUNT_MISMATCH:${columnar.rowCount}:${map.rowCount}`);
  }
  for (let ordinal = 0; ordinal < map.rowCount; ordinal += 1) {
    if (columnar.candidateOrdinals[ordinal] !== ordinal) {
      throw new Error(`FEATURE_SAMPLE_NON_DENSE_ORDINAL:${ordinal}`);
    }
    const candidate = map.candidates[ordinal];
    if (!candidate || candidate.candidateOrdinal !== ordinal) {
      throw new Error(`FEATURE_SAMPLE_ORDINAL_MAP_CORRUPT:${ordinal}`);
    }
    if (columnar.canonicalIds[ordinal] !== candidate.canonicalId) {
      throw new Error(`FEATURE_SAMPLE_CANONICAL_ID_MISMATCH:${ordinal}`);
    }
    if (columnar.packetKeys[ordinal] !== candidate.packetKey) {
      throw new Error(`FEATURE_SAMPLE_PACKET_KEY_MISMATCH:${ordinal}`);
    }
    if (columnar.sourceRevisions[ordinal] !== candidate.sourceRevision) {
      throw new Error(`FEATURE_SAMPLE_SOURCE_REVISION_MISMATCH:${ordinal}`);
    }
  }
}

function presentValueStats(columnar: CandidateFeatureColumnarV1, featureIndex: number): { mean: number; std: number } {
  const values: number[] = [];
  for (let row = 0; row < columnar.rowCount; row += 1) {
    const cell = row * columnar.featureCount + featureIndex;
    if (columnar.featurePresence[cell] === 1) values.push(columnar.featureValues[cell]!);
  }
  if (values.length === 0) return { mean: 0, std: 1 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return { mean, std: std > 1e-12 ? std : 1 };
}

/**
 * Compile CandidateFeatureColumnarV1 into SampleQueryMatrixV1 without losing
 * the distinction between a missing feature and a measured numeric zero.
 *
 * Output columns are [12 feature values | 12 presence bits]. Missing values
 * remain value=0,presence=0; real zero remains value=0,presence=1.
 */
export function adaptCandidateFeatureColumnarToSampleQueryMatrixV1(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  columnar: z.input<typeof candidateFeatureColumnarV1Schema>;
  normalization?: z.input<typeof CandidateFeatureSamplingNormalizationSchema>;
  producerRevision: string;
}): { matrix: SampleQueryMatrixV1; receipt: CandidateFeatureSampleQueryAdapterReceiptV1 } {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const columnar = candidateFeatureColumnarV1Schema.parse(input.columnar);
  const normalization = CandidateFeatureSamplingNormalizationSchema.parse(input.normalization ?? 'NONE');
  assertAligned(ordinalMap, columnar);

  const stats = CANDIDATE_SCALAR_FEATURES.map((_, featureIndex) => presentValueStats(columnar, featureIndex));
  const rows = columnar.candidateOrdinals.map((candidateOrdinal, row) => {
    const values: number[] = [];
    const presence: number[] = [];
    for (let featureIndex = 0; featureIndex < columnar.featureCount; featureIndex += 1) {
      const cell = row * columnar.featureCount + featureIndex;
      const raw = columnar.featureValues[cell]!;
      const isPresent = columnar.featurePresence[cell] === 1;
      if (!isPresent) {
        values.push(0);
      } else if (normalization === 'COLUMN_STANDARDIZED') {
        const { mean, std } = stats[featureIndex]!;
        values.push((raw - mean) / std);
      } else {
        values.push(raw);
      }
      presence.push(isPresent ? 1 : 0);
    }
    return { candidateOrdinal, values: [...values, ...presence] };
  });

  const sourceMatrixChecksum = checksum({
    columnarChecksum: columnar.columnarChecksum,
    rowIdentityChecksum: columnar.rowIdentityChecksum,
    featureValuesChecksum: columnar.featureValuesChecksum,
    featurePresenceChecksum: columnar.featurePresenceChecksum,
    normalization,
    missingValuePolicy: 'VALUE_ZERO_PLUS_SEPARATE_PRESENCE_BIT',
  });

  const matrix = materializeSampleQueryMatrixV1({
    ordinalMap,
    rows,
    sourceMatrixRevision: columnar.featureRevision,
    sourceMatrixChecksum,
    matrixRole: 'CANDIDATE_FEATURE',
    normalization,
    producerRevision: input.producerRevision,
  });

  const receiptPayload = {
    candidateSnapshotRevision: columnar.candidateSnapshotRevision,
    ordinalMapChecksum: columnar.ordinalMapChecksum,
    columnarChecksum: columnar.columnarChecksum,
    rowIdentityChecksum: columnar.rowIdentityChecksum,
    featureValuesChecksum: columnar.featureValuesChecksum,
    featurePresenceChecksum: columnar.featurePresenceChecksum,
    featureCount: columnar.featureCount,
    outputColumnCount: CANDIDATE_SCALAR_FEATURES.length * 2,
    valueColumns: [...CANDIDATE_SCALAR_FEATURES],
    presenceColumns: CANDIDATE_SCALAR_FEATURES.map((name) => `${name}_present`),
    missingValuePolicy: 'VALUE_ZERO_PLUS_SEPARATE_PRESENCE_BIT' as const,
    normalization,
    standardizationPolicy: normalization === 'COLUMN_STANDARDIZED'
      ? 'PRESENT_VALUE_ZSCORE_PRESENCE_UNCHANGED' as const
      : 'NONE' as const,
    matrixChecksum: matrix.matrixChecksum,
  };

  const receipt = candidateFeatureSampleQueryAdapterReceiptV1Schema.parse({
    schema: CANDIDATE_FEATURE_SAMPLE_QUERY_ADAPTER_SCHEMA,
    ...receiptPayload,
    adapterChecksum: checksum(receiptPayload),
    identityAuthority: false,
    retrievalVoteProduced: false,
    canonicalWritesAttempted: false,
    producerRevision: input.producerRevision,
  });

  return { matrix, receipt };
}
