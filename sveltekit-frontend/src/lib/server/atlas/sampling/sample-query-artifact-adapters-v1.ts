import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
  candidateFeatureColumnarV1Schema,
  type CandidateFeatureColumnarV1,
} from '../features/candidate-feature-columnar-v1.js';
import {
  CandidateOrdinalSetV1Schema,
  verifyCandidateOrdinalSetV1,
} from '../kernel/candidate-ordinal-set-v1.js';
import {
  materializeSampleQueryMatrixV1,
  type SampleQueryMatrixV1,
} from './sample-query-matrix-v1.js';
import {
  materializeSamplingTargetSetV1,
  samplingCorpusChecksum,
  type SamplingTargetSetV1,
} from './sample-query-corpus-evaluation-v1.js';

export const SamplingFeatureProjectionModeSchema = z.enum([
  'RAW_VALUES_WITH_PRESENCE',
  'COLUMN_STANDARDIZED_WITH_PRESENCE',
]);
export type SamplingFeatureProjectionMode = z.infer<typeof SamplingFeatureProjectionModeSchema>;

export interface SemanticSamplingSourceRowV1 {
  packetKey: string;
  values: readonly number[];
}

function assertColumnarCandidateWorld(columnar: CandidateFeatureColumnarV1, ordinalMap: CandidateOrdinalMapV1): void {
  if (columnar.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision) {
    throw new Error('SAMPLING_FEATURE_CANDIDATE_SNAPSHOT_MISMATCH');
  }
  if (columnar.ordinalMapChecksum !== ordinalMap.ordinalMapChecksum) {
    throw new Error('SAMPLING_FEATURE_ORDINAL_MAP_MISMATCH');
  }
  if (columnar.rowCount !== ordinalMap.rowCount) {
    throw new Error('SAMPLING_FEATURE_ROW_COUNT_MISMATCH');
  }

  for (let ordinal = 0; ordinal < ordinalMap.rowCount; ordinal += 1) {
    if (columnar.candidateOrdinals[ordinal] !== ordinal) {
      throw new Error(`SAMPLING_FEATURE_NON_DENSE_ORDINAL:${ordinal}`);
    }
    const candidate = ordinalMap.candidates[ordinal];
    if (!candidate || candidate.candidateOrdinal !== ordinal) {
      throw new Error(`SAMPLING_FEATURE_ORDINAL_MAP_CORRUPT:${ordinal}`);
    }
    if (columnar.canonicalIds[ordinal] !== candidate.canonicalId) {
      throw new Error(`SAMPLING_FEATURE_CANONICAL_ID_MISMATCH:${ordinal}`);
    }
    if (columnar.packetKeys[ordinal] !== candidate.packetKey) {
      throw new Error(`SAMPLING_FEATURE_PACKET_KEY_MISMATCH:${ordinal}`);
    }
    if (columnar.sourceRevisions[ordinal] !== candidate.sourceRevision) {
      throw new Error(`SAMPLING_FEATURE_SOURCE_REVISION_MISMATCH:${ordinal}`);
    }
  }
}

function featureRows(columnar: CandidateFeatureColumnarV1): number[][] {
  const rows: number[][] = [];
  for (let row = 0; row < columnar.rowCount; row += 1) {
    const values: number[] = [];
    for (let feature = 0; feature < columnar.featureCount; feature += 1) {
      const cell = row * columnar.featureCount + feature;
      values.push(columnar.featureValues[cell]!);
    }
    rows.push(values);
  }
  return rows;
}

function presenceRows(columnar: CandidateFeatureColumnarV1): number[][] {
  const rows: number[][] = [];
  for (let row = 0; row < columnar.rowCount; row += 1) {
    const values: number[] = [];
    for (let feature = 0; feature < columnar.featureCount; feature += 1) {
      const cell = row * columnar.featureCount + feature;
      values.push(columnar.featurePresence[cell]!);
    }
    rows.push(values);
  }
  return rows;
}

function standardizePresentColumns(values: number[][], presence: number[][]): number[][] {
  const rowCount = values.length;
  const featureCount = values[0]?.length ?? 0;
  const output = values.map((row) => row.map(() => 0));

  for (let feature = 0; feature < featureCount; feature += 1) {
    const presentValues: number[] = [];
    for (let row = 0; row < rowCount; row += 1) {
      if (presence[row]![feature] === 1) presentValues.push(values[row]![feature]!);
    }
    if (presentValues.length === 0) continue;

    const mean = presentValues.reduce((sum, value) => sum + value, 0) / presentValues.length;
    const variance = presentValues.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / presentValues.length;
    const std = Math.sqrt(variance);

    for (let row = 0; row < rowCount; row += 1) {
      if (presence[row]![feature] !== 1) {
        output[row]![feature] = 0;
      } else if (std <= 1e-12) {
        output[row]![feature] = 0;
      } else {
        output[row]![feature] = (values[row]![feature]! - mean) / std;
      }
    }
  }
  return output;
}

/**
 * Build a measurement matrix from the canonical CandidateFeatureColumnarV1.
 * Presence bits are appended as explicit columns so missing evidence cannot be
 * silently conflated with a real numeric zero when row norms are measured.
 */
export function adaptCandidateFeatureColumnarToSampleQueryMatrixV1(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  columnar: z.input<typeof candidateFeatureColumnarV1Schema>;
  mode: z.input<typeof SamplingFeatureProjectionModeSchema>;
  producerRevision: string;
}): SampleQueryMatrixV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const columnar = candidateFeatureColumnarV1Schema.parse(input.columnar);
  const mode = SamplingFeatureProjectionModeSchema.parse(input.mode);
  assertColumnarCandidateWorld(columnar, ordinalMap);

  const rawValues = featureRows(columnar);
  const presence = presenceRows(columnar);
  const projectedValues = mode === 'COLUMN_STANDARDIZED_WITH_PRESENCE'
    ? standardizePresentColumns(rawValues, presence)
    : rawValues;

  const rows = projectedValues.map((values, candidateOrdinal) => ({
    candidateOrdinal,
    values: [...values, ...presence[candidateOrdinal]!],
  }));

  const sourceMatrixChecksum = samplingCorpusChecksum({
    columnarChecksum: columnar.columnarChecksum,
    featureValuesChecksum: columnar.featureValuesChecksum,
    featurePresenceChecksum: columnar.featurePresenceChecksum,
    rowIdentityChecksum: columnar.rowIdentityChecksum,
    projectionMode: mode,
    presenceBitsAppended: true,
  });

  return materializeSampleQueryMatrixV1({
    ordinalMap,
    rows,
    sourceMatrixRevision: `${columnar.featureRevision}:sampling:${mode.toLowerCase()}:v1`,
    sourceMatrixChecksum,
    matrixRole: 'CANDIDATE_FEATURE',
    normalization: mode === 'COLUMN_STANDARDIZED_WITH_PRESENCE' ? 'COLUMN_STANDARDIZED' : 'NONE',
    producerRevision: input.producerRevision,
  });
}

/**
 * Bind a semantic artifact to CandidateOrdinal by packet_key. Row position in
 * Parquet/NDJSON/Qdrant is never treated as CandidateOrdinal. The caller
 * supplies the immutable source-artifact checksum; this adapter verifies the
 * packet-key join and the derived normalized matrix.
 *
 * The current SampleQueryMatrixV1 role vocabulary calls this diagnostic matrix
 * SEMANTIC_RESIDUAL. It remains a measurement view of semantic_768 and never a
 * replacement representation or semantic vote.
 */
export function adaptSemanticRowsToRowL2SampleQueryMatrixV1(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  semanticRows: readonly SemanticSamplingSourceRowV1[];
  expectedDimension: number;
  sourceMatrixRevision: string;
  sourceArtifactChecksum: string;
  producerRevision: string;
}): SampleQueryMatrixV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  if (!Number.isInteger(input.expectedDimension) || input.expectedDimension <= 0) {
    throw new Error('SAMPLING_SEMANTIC_DIMENSION_INVALID');
  }
  if (!/^[a-f0-9]{64}$/.test(input.sourceArtifactChecksum)) {
    throw new Error('SAMPLING_SEMANTIC_SOURCE_CHECKSUM_INVALID');
  }

  const byPacketKey = new Map<string, readonly number[]>();
  for (const row of input.semanticRows) {
    const packetKey = row.packetKey.trim();
    if (!packetKey) throw new Error('SAMPLING_SEMANTIC_PACKET_KEY_REQUIRED');
    if (byPacketKey.has(packetKey)) throw new Error(`SAMPLING_SEMANTIC_DUPLICATE_PACKET_KEY:${packetKey}`);
    if (row.values.length !== input.expectedDimension) {
      throw new Error(`SAMPLING_SEMANTIC_DIMENSION_MISMATCH:${packetKey}:${row.values.length}`);
    }
    if (row.values.some((value) => !Number.isFinite(value))) {
      throw new Error(`SAMPLING_SEMANTIC_NONFINITE:${packetKey}`);
    }
    byPacketKey.set(packetKey, row.values);
  }

  const rows = ordinalMap.candidates.map((candidate) => {
    if (!candidate.packetKey) {
      throw new Error(`SAMPLING_SEMANTIC_STRONG_PACKET_KEY_REQUIRED:${candidate.candidateOrdinal}`);
    }
    const source = byPacketKey.get(candidate.packetKey);
    if (!source) throw new Error(`SAMPLING_SEMANTIC_PACKET_KEY_NOT_FOUND:${candidate.packetKey}`);
    const norm = Math.sqrt(source.reduce((sum, value) => sum + value * value, 0));
    if (!(norm > 0) || !Number.isFinite(norm)) {
      throw new Error(`SAMPLING_SEMANTIC_ZERO_OR_INVALID_NORM:${candidate.packetKey}`);
    }
    return {
      candidateOrdinal: candidate.candidateOrdinal,
      values: source.map((value) => value / Math.max(norm, 1e-12)),
    };
  });

  return materializeSampleQueryMatrixV1({
    ordinalMap,
    rows,
    sourceMatrixRevision: input.sourceMatrixRevision,
    sourceMatrixChecksum: samplingCorpusChecksum({
      sourceArtifactChecksum: input.sourceArtifactChecksum,
      expectedDimension: input.expectedDimension,
      rowBinding: 'PACKET_KEY_TO_CANDIDATE_ORDINAL',
      normalization: 'ROW_L2',
    }),
    matrixRole: 'SEMANTIC_RESIDUAL',
    normalization: 'ROW_L2',
    producerRevision: input.producerRevision,
  });
}

/**
 * Only an exact CandidateOrdinalSetV1 may define an EXACT_TOP_K target set.
 * Approximate ANN output is never silently upgraded to oracle truth.
 */
export function adaptExactCandidateOrdinalSetToSamplingTargetSetV1(input: {
  candidateSet: z.input<typeof CandidateOrdinalSetV1Schema>;
  producerRevision: string;
  topK?: number;
}): SamplingTargetSetV1 {
  const candidateSet = verifyCandidateOrdinalSetV1(input.candidateSet);
  if (candidateSet.approximate) throw new Error('SAMPLING_TARGET_EXACT_SET_REQUIRED');

  const ordered = [...candidateSet.hits].sort((left, right) => left.rank - right.rank || left.candidateOrdinal - right.candidateOrdinal);
  const topK = input.topK ?? ordered.length;
  if (!Number.isInteger(topK) || topK <= 0 || topK > ordered.length) {
    throw new Error(`SAMPLING_TARGET_TOP_K_OUT_OF_RANGE:${topK}`);
  }

  return materializeSamplingTargetSetV1({
    candidateSnapshotRevision: candidateSet.candidateSnapshotRevision,
    ordinalMapChecksum: candidateSet.ordinalMapChecksum,
    targetKind: 'EXACT_TOP_K',
    targetOrdinals: ordered.slice(0, topK).map((hit) => hit.candidateOrdinal),
    sourceReceiptChecksum: candidateSet.resultChecksum,
    producerRevision: input.producerRevision,
  });
}
