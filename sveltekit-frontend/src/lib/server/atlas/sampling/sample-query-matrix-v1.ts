import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';

function sumSquares(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value * value;
  return sum;
}

const rowNormSquared = sumSquares;

export const SAMPLE_QUERY_MATRIX_SCHEMA = 'atlas.sample-query-matrix.v1' as const;
export const SAMPLING_DECISION_SCHEMA = 'atlas.sampling-decision.v1' as const;
export const SAMPLING_EVALUATION_SCHEMA = 'atlas.sampling-evaluation.v1' as const;

const revision = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const SampleQueryMatrixRoleSchema = z.enum([
  'CANDIDATE_FEATURE',
  'SEMANTIC_RESIDUAL',
  'LATENT_ROUTING',
]);

export const SampleQueryNormalizationSchema = z.enum([
  'NONE',
  'COLUMN_STANDARDIZED',
  'ROW_L2',
]);

export const SamplingPolicySchema = z.enum([
  'LENGTH_SQUARED',
  'UNIFORM',
  'TOP_K_ROW_NORM',
]);

export const sampleQueryMatrixRowV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  values: z.array(z.number().finite()).min(1),
  rowNormSquared: z.number().finite().nonnegative(),
}).strict();

export const sampleQueryMatrixV1Schema = z.object({
  schema: z.literal(SAMPLE_QUERY_MATRIX_SCHEMA),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: sha256,
  workspaceRevision: revision,
  sourceMatrixRevision: revision,
  sourceMatrixChecksum: sha256,
  matrixRole: SampleQueryMatrixRoleSchema,
  normalization: SampleQueryNormalizationSchema,
  rowCount: z.number().int().positive(),
  columnCount: z.number().int().positive(),
  rows: z.array(sampleQueryMatrixRowV1Schema).min(1),
  totalRowNormSquared: z.number().finite().nonnegative(),
  rowNormCoefficientOfVariation: z.number().finite().nonnegative(),
  lengthSquaredDegeneratesTowardUniform: z.boolean(),
  matrixChecksum: sha256,
  identityAuthority: z.literal(false),
  retrievalVoteProduced: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: revision,
}).strict();
export type SampleQueryMatrixV1 = z.infer<typeof sampleQueryMatrixV1Schema>;

export const samplingDecisionV1Schema = z.object({
  schema: z.literal(SAMPLING_DECISION_SCHEMA),
  matrixChecksum: sha256,
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: sha256,
  policy: SamplingPolicySchema,
  sampleSize: z.number().int().positive(),
  seed: z.number().int().nonnegative(),
  selectedOrdinals: z.array(z.number().int().nonnegative()),
  selectionWeights: z.array(z.number().finite().nonnegative()),
  selectedRowNormSquared: z.array(z.number().finite().nonnegative()),
  decisionChecksum: sha256,
  identityAuthority: z.literal(false),
  retrievalVoteProduced: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  promotionAuthorized: z.literal(false),
  producerRevision: revision,
}).strict();
export type SamplingDecisionV1 = z.infer<typeof samplingDecisionV1Schema>;

export const samplingEvaluationV1Schema = z.object({
  schema: z.literal(SAMPLING_EVALUATION_SCHEMA),
  matrixChecksum: sha256,
  targetOrdinals: z.array(z.number().int().nonnegative()),
  targetCount: z.number().int().nonnegative(),
  sampleSize: z.number().int().positive(),
  lengthSquaredRecall: z.number().finite().min(0).max(1),
  uniformRecall: z.number().finite().min(0).max(1),
  topKRowNormRecall: z.number().finite().min(0).max(1),
  lengthSquaredDeltaVsUniform: z.number().finite().min(-1).max(1),
  lengthSquaredDeltaVsTopK: z.number().finite().min(-1).max(1),
  lengthSquaredDegeneratesTowardUniform: z.boolean(),
  evaluationChecksum: sha256,
  measurementOnly: z.literal(true),
  promotionAuthorized: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: revision,
}).strict();
export type SamplingEvaluationV1 = z.infer<typeof samplingEvaluationV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

export function sampleQueryChecksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function coefficientOfVariation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => {
    const delta = value - mean;
    return sum + delta * delta;
  }, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function assertOrdinalAlignment(map: CandidateOrdinalMapV1, rows: readonly { candidateOrdinal: number }[]): void {
  if (rows.length !== map.rowCount) {
    throw new Error(`SAMPLE_QUERY_ROW_COUNT_MISMATCH:rows=${rows.length}:ordinals=${map.rowCount}`);
  }
  const seen = new Set<number>();
  for (const row of rows) {
    if (seen.has(row.candidateOrdinal)) throw new Error(`SAMPLE_QUERY_DUPLICATE_ORDINAL:${row.candidateOrdinal}`);
    seen.add(row.candidateOrdinal);
    if (!map.candidates[row.candidateOrdinal] || map.candidates[row.candidateOrdinal].candidateOrdinal !== row.candidateOrdinal) {
      throw new Error(`SAMPLE_QUERY_ORDINAL_NOT_IN_MAP:${row.candidateOrdinal}`);
    }
  }
  for (let ordinal = 0; ordinal < map.rowCount; ordinal += 1) {
    if (!seen.has(ordinal)) throw new Error(`SAMPLE_QUERY_MISSING_ORDINAL:${ordinal}`);
  }
}

/**
 * Materialize an immutable sample/query matrix over the same CandidateOrdinal
 * world as the retrieval/ranking fabrics. This function never changes the
 * source values or normalizes them implicitly; the normalization field records
 * the upstream matrix contract and is part of the checksum.
 */
export function materializeSampleQueryMatrixV1(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  rows: readonly { candidateOrdinal: number; values: readonly number[] }[];
  sourceMatrixRevision: string;
  sourceMatrixChecksum: string;
  matrixRole: z.input<typeof SampleQueryMatrixRoleSchema>;
  normalization: z.input<typeof SampleQueryNormalizationSchema>;
  producerRevision: string;
  uniformityCvThreshold?: number;
}): SampleQueryMatrixV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  if (input.rows.length === 0) throw new Error('SAMPLE_QUERY_MATRIX_EMPTY');
  assertOrdinalAlignment(ordinalMap, input.rows);

  const ordered = [...input.rows].sort((left, right) => left.candidateOrdinal - right.candidateOrdinal);
  const columnCount = ordered[0]!.values.length;
  if (columnCount === 0) throw new Error('SAMPLE_QUERY_MATRIX_ZERO_COLUMNS');

  const rows = ordered.map((row) => {
    if (row.values.length !== columnCount) {
      throw new Error(`SAMPLE_QUERY_COLUMN_COUNT_MISMATCH:${row.candidateOrdinal}`);
    }
    const values = row.values.map((value) => {
      if (!Number.isFinite(value)) throw new Error(`SAMPLE_QUERY_NONFINITE_VALUE:${row.candidateOrdinal}`);
      return value;
    });
    return sampleQueryMatrixRowV1Schema.parse({
      candidateOrdinal: row.candidateOrdinal,
      values,
      rowNormSquared: rowNormSquared(values),
    });
  });

  const norms = rows.map((row) => row.rowNormSquared);
  const totalRowNormSquared = norms.reduce((sum, value) => sum + value, 0);
  const rowNormCoefficientOfVariation = coefficientOfVariation(norms);
  const threshold = input.uniformityCvThreshold ?? 1e-6;
  const lengthSquaredDegeneratesTowardUniform = rowNormCoefficientOfVariation <= threshold;

  const payload = {
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    workspaceRevision: ordinalMap.workspaceRevision,
    sourceMatrixRevision: input.sourceMatrixRevision,
    sourceMatrixChecksum: input.sourceMatrixChecksum,
    matrixRole: input.matrixRole,
    normalization: input.normalization,
    rowCount: rows.length,
    columnCount,
    rows,
    totalRowNormSquared,
    rowNormCoefficientOfVariation,
    lengthSquaredDegeneratesTowardUniform,
  };

  return sampleQueryMatrixV1Schema.parse({
    schema: SAMPLE_QUERY_MATRIX_SCHEMA,
    ...payload,
    matrixChecksum: sampleQueryChecksum(payload),
    identityAuthority: false,
    retrievalVoteProduced: false,
    canonicalWritesAttempted: false,
    producerRevision: input.producerRevision,
  });
}

/** Mulberry32: deterministic fixture PRNG, not cryptographic randomness. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedWithoutReplacement(
  rows: readonly z.infer<typeof sampleQueryMatrixRowV1Schema>[],
  weights: readonly number[],
  sampleSize: number,
  seed: number,
): number[] {
  const random = mulberry32(seed);
  const keyed = rows.map((row, index) => {
    const weight = weights[index] ?? 0;
    if (weight <= 0) return { candidateOrdinal: row.candidateOrdinal, key: Number.POSITIVE_INFINITY };
    const u = Math.max(random(), Number.EPSILON);
    return { candidateOrdinal: row.candidateOrdinal, key: -Math.log(u) / weight };
  });

  const positive = keyed
    .filter((entry) => Number.isFinite(entry.key))
    .sort((left, right) => left.key - right.key || left.candidateOrdinal - right.candidateOrdinal)
    .slice(0, sampleSize)
    .map((entry) => entry.candidateOrdinal);

  if (positive.length === sampleSize) return positive;

  const selected = new Set(positive);
  const fallback = rows
    .map((row) => row.candidateOrdinal)
    .filter((ordinal) => !selected.has(ordinal))
    .sort((left, right) => left - right)
    .slice(0, sampleSize - positive.length);
  return [...positive, ...fallback];
}

export function sampleCandidateOrdinalsV1(input: {
  matrix: z.input<typeof sampleQueryMatrixV1Schema>;
  policy: z.input<typeof SamplingPolicySchema>;
  sampleSize: number;
  seed: number;
  producerRevision: string;
}): SamplingDecisionV1 {
  const matrix = sampleQueryMatrixV1Schema.parse(input.matrix);
  if (!Number.isInteger(input.sampleSize) || input.sampleSize <= 0 || input.sampleSize > matrix.rowCount) {
    throw new Error(`SAMPLING_SIZE_OUT_OF_RANGE:${input.sampleSize}`);
  }
  if (!Number.isInteger(input.seed) || input.seed < 0) throw new Error(`SAMPLING_SEED_INVALID:${input.seed}`);

  let weights: number[];
  let selectedOrdinals: number[];

  if (input.policy === 'TOP_K_ROW_NORM') {
    weights = matrix.rows.map((row) => row.rowNormSquared);
    selectedOrdinals = [...matrix.rows]
      .sort((left, right) => right.rowNormSquared - left.rowNormSquared || left.candidateOrdinal - right.candidateOrdinal)
      .slice(0, input.sampleSize)
      .map((row) => row.candidateOrdinal);
  } else {
    weights = input.policy === 'LENGTH_SQUARED'
      ? matrix.rows.map((row) => row.rowNormSquared)
      : matrix.rows.map(() => 1);
    selectedOrdinals = weightedWithoutReplacement(matrix.rows, weights, input.sampleSize, input.seed);
  }

  const rowByOrdinal = new Map(matrix.rows.map((row) => [row.candidateOrdinal, row] as const));
  const selectionWeights = selectedOrdinals.map((ordinal) => weights[ordinal] ?? 0);
  const selectedRowNormSquared = selectedOrdinals.map((ordinal) => rowByOrdinal.get(ordinal)!.rowNormSquared);
  const payload = {
    matrixChecksum: matrix.matrixChecksum,
    candidateSnapshotRevision: matrix.candidateSnapshotRevision,
    ordinalMapChecksum: matrix.ordinalMapChecksum,
    policy: input.policy,
    sampleSize: input.sampleSize,
    seed: input.seed,
    selectedOrdinals,
    selectionWeights,
    selectedRowNormSquared,
  };

  return samplingDecisionV1Schema.parse({
    schema: SAMPLING_DECISION_SCHEMA,
    ...payload,
    decisionChecksum: sampleQueryChecksum(payload),
    identityAuthority: false,
    retrievalVoteProduced: false,
    canonicalWritesAttempted: false,
    promotionAuthorized: false,
    producerRevision: input.producerRevision,
  });
}

function recallAtSelection(selected: readonly number[], targets: ReadonlySet<number>): number {
  if (targets.size === 0) return 1;
  let hitCount = 0;
  for (const ordinal of selected) if (targets.has(ordinal)) hitCount += 1;
  return hitCount / targets.size;
}

export function evaluateSamplingPoliciesV1(input: {
  matrix: z.input<typeof sampleQueryMatrixV1Schema>;
  targetOrdinals: readonly number[];
  sampleSize: number;
  seed: number;
  producerRevision: string;
}): SamplingEvaluationV1 {
  const matrix = sampleQueryMatrixV1Schema.parse(input.matrix);
  const targets = [...new Set(input.targetOrdinals)].sort((left, right) => left - right);
  for (const ordinal of targets) {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= matrix.rowCount) {
      throw new Error(`SAMPLING_TARGET_ORDINAL_OUT_OF_RANGE:${ordinal}`);
    }
  }

  const lengthSquared = sampleCandidateOrdinalsV1({
    matrix,
    policy: 'LENGTH_SQUARED',
    sampleSize: input.sampleSize,
    seed: input.seed,
    producerRevision: input.producerRevision,
  });
  const uniform = sampleCandidateOrdinalsV1({
    matrix,
    policy: 'UNIFORM',
    sampleSize: input.sampleSize,
    seed: input.seed,
    producerRevision: input.producerRevision,
  });
  const topK = sampleCandidateOrdinalsV1({
    matrix,
    policy: 'TOP_K_ROW_NORM',
    sampleSize: input.sampleSize,
    seed: input.seed,
    producerRevision: input.producerRevision,
  });

  const targetSet = new Set(targets);
  const lengthSquaredRecall = recallAtSelection(lengthSquared.selectedOrdinals, targetSet);
  const uniformRecall = recallAtSelection(uniform.selectedOrdinals, targetSet);
  const topKRowNormRecall = recallAtSelection(topK.selectedOrdinals, targetSet);
  const payload = {
    matrixChecksum: matrix.matrixChecksum,
    targetOrdinals: targets,
    targetCount: targets.length,
    sampleSize: input.sampleSize,
    lengthSquaredRecall,
    uniformRecall,
    topKRowNormRecall,
    lengthSquaredDeltaVsUniform: lengthSquaredRecall - uniformRecall,
    lengthSquaredDeltaVsTopK: lengthSquaredRecall - topKRowNormRecall,
    lengthSquaredDegeneratesTowardUniform: matrix.lengthSquaredDegeneratesTowardUniform,
  };

  return samplingEvaluationV1Schema.parse({
    schema: SAMPLING_EVALUATION_SCHEMA,
    ...payload,
    evaluationChecksum: sampleQueryChecksum(payload),
    measurementOnly: true,
    promotionAuthorized: false,
    canonicalWritesAttempted: false,
    producerRevision: input.producerRevision,
  });
}
