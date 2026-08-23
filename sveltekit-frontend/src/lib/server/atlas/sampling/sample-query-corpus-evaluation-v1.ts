import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  sampleCandidateOrdinalsV1,
  sampleQueryMatrixV1Schema,
  type SampleQueryMatrixV1,
  type SamplingDecisionV1,
} from './sample-query-matrix-v1.js';

export const SAMPLING_TARGET_SET_SCHEMA = 'atlas.sampling-target-set.v1' as const;
export const SAMPLING_POLICY_AGGREGATE_SCHEMA = 'atlas.sampling-policy-aggregate.v1' as const;
export const SAMPLING_CORPUS_EVALUATION_SCHEMA = 'atlas.sampling-corpus-evaluation.v1' as const;
export const SAMPLING_MATRIX_COMPARISON_SCHEMA = 'atlas.sampling-matrix-comparison.v1' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);
const probability = z.number().finite().min(0).max(1);

export const SamplingTargetKindSchema = z.enum([
  'EXACT_TOP_K',
  'VALIDATED_TOP_K',
  'FROZEN_EVAL_LABELS',
  'FIXTURE_ONLY',
]);

export const samplingTargetSetV1Schema = z.object({
  schema: z.literal(SAMPLING_TARGET_SET_SCHEMA),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: sha256,
  targetKind: SamplingTargetKindSchema,
  targetOrdinals: z.array(z.number().int().nonnegative()).min(1),
  sourceReceiptChecksum: sha256,
  targetSetChecksum: sha256,
  identityAuthority: z.literal(false),
  retrievalVoteProduced: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: revision,
}).strict();
export type SamplingTargetSetV1 = z.infer<typeof samplingTargetSetV1Schema>;

export const samplingPolicyAggregateV1Schema = z.object({
  schema: z.literal(SAMPLING_POLICY_AGGREGATE_SCHEMA),
  policy: z.enum(['LENGTH_SQUARED', 'UNIFORM', 'TOP_K_ROW_NORM']),
  seeds: z.array(z.number().int().nonnegative()).min(1),
  seedCount: z.number().int().positive(),
  recallMean: probability,
  recallStdDev: z.number().finite().nonnegative(),
  recallMin: probability,
  recallMax: probability,
  pairwiseSelectionJaccardMean: probability,
  latencyMsP50: z.number().finite().nonnegative(),
  latencyMsP95: z.number().finite().nonnegative(),
  latencyMsMax: z.number().finite().nonnegative(),
  decisionSetChecksum: sha256,
}).strict();
export type SamplingPolicyAggregateV1 = z.infer<typeof samplingPolicyAggregateV1Schema>;

export const samplingCorpusEvaluationV1Schema = z.object({
  schema: z.literal(SAMPLING_CORPUS_EVALUATION_SCHEMA),
  matrixChecksum: sha256,
  sourceMatrixRevision: revision,
  sourceMatrixChecksum: sha256,
  matrixRole: z.enum(['CANDIDATE_FEATURE', 'SEMANTIC_RESIDUAL', 'LATENT_ROUTING']),
  normalization: z.enum(['NONE', 'COLUMN_STANDARDIZED', 'ROW_L2']),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: sha256,
  rowCount: z.number().int().positive(),
  columnCount: z.number().int().positive(),
  estimatedMatrixBytes: z.number().int().positive(),
  targetSetChecksum: sha256,
  targetKind: SamplingTargetKindSchema,
  targetCount: z.number().int().positive(),
  sampleSize: z.number().int().positive(),
  seeds: z.array(z.number().int().nonnegative()).min(1),
  lengthSquared: samplingPolicyAggregateV1Schema,
  uniform: samplingPolicyAggregateV1Schema,
  topKRowNorm: samplingPolicyAggregateV1Schema,
  lengthSquaredDeltaVsUniformMean: z.number().finite().min(-1).max(1),
  lengthSquaredDeltaVsTopKMean: z.number().finite().min(-1).max(1),
  lengthSquaredDegeneratesTowardUniform: z.boolean(),
  evaluationChecksum: sha256,
  measurementOnly: z.literal(true),
  identityAuthority: z.literal(false),
  retrievalVoteProduced: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  promotionAuthorized: z.literal(false),
  producerRevision: revision,
}).strict();
export type SamplingCorpusEvaluationV1 = z.infer<typeof samplingCorpusEvaluationV1Schema>;

export const samplingMatrixComparisonV1Schema = z.object({
  schema: z.literal(SAMPLING_MATRIX_COMPARISON_SCHEMA),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: sha256,
  targetSetChecksum: sha256,
  sampleSize: z.number().int().positive(),
  seeds: z.array(z.number().int().nonnegative()).min(1),
  left: samplingCorpusEvaluationV1Schema,
  right: samplingCorpusEvaluationV1Schema,
  lengthSquaredRecallMeanDeltaRightMinusLeft: z.number().finite().min(-1).max(1),
  comparisonChecksum: sha256,
  measurementOnly: z.literal(true),
  identityAuthority: z.literal(false),
  retrievalVoteProduced: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  promotionAuthorized: z.literal(false),
  producerRevision: revision,
}).strict();
export type SamplingMatrixComparisonV1 = z.infer<typeof samplingMatrixComparisonV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

export function samplingCorpusChecksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function uniqueSortedOrdinals(values: readonly number[]): number[] {
  const unique = [...new Set(values)];
  if (unique.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error('SAMPLING_TARGET_ORDINAL_INVALID');
  }
  return unique.sort((left, right) => left - right);
}

function validateSeeds(values: readonly number[]): number[] {
  const seeds = [...values];
  if (seeds.length === 0) throw new Error('SAMPLING_SEEDS_REQUIRED');
  if (seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) {
    throw new Error('SAMPLING_SEED_INVALID');
  }
  if (new Set(seeds).size !== seeds.length) throw new Error('SAMPLING_SEED_DUPLICATE');
  return seeds;
}

export function materializeSamplingTargetSetV1(input: {
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  targetKind: z.input<typeof SamplingTargetKindSchema>;
  targetOrdinals: readonly number[];
  sourceReceiptChecksum: string;
  producerRevision: string;
}): SamplingTargetSetV1 {
  const targetOrdinals = uniqueSortedOrdinals(input.targetOrdinals);
  if (targetOrdinals.length === 0) throw new Error('SAMPLING_TARGET_SET_EMPTY');
  if (!/^[a-f0-9]{64}$/.test(input.ordinalMapChecksum)) throw new Error('SAMPLING_TARGET_ORDINAL_MAP_CHECKSUM_INVALID');
  if (!/^[a-f0-9]{64}$/.test(input.sourceReceiptChecksum)) throw new Error('SAMPLING_TARGET_SOURCE_RECEIPT_CHECKSUM_INVALID');

  const payload = {
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    targetKind: input.targetKind,
    targetOrdinals,
    sourceReceiptChecksum: input.sourceReceiptChecksum,
  };

  return samplingTargetSetV1Schema.parse({
    schema: SAMPLING_TARGET_SET_SCHEMA,
    ...payload,
    targetSetChecksum: samplingCorpusChecksum(payload),
    identityAuthority: false,
    retrievalVoteProduced: false,
    canonicalWritesAttempted: false,
    producerRevision: input.producerRevision,
  });
}

function recall(selected: readonly number[], targets: ReadonlySet<number>): number {
  let hits = 0;
  for (const ordinal of selected) if (targets.has(ordinal)) hits += 1;
  return hits / targets.size;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: readonly number[]): number {
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance);
}

function percentile(values: readonly number[], p: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  if (ordered.length === 1) return ordered[0]!;
  const position = (ordered.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return ordered[lower]!;
  const weight = position - lower;
  return ordered[lower]! * (1 - weight) + ordered[upper]! * weight;
}

function jaccard(left: readonly number[], right: readonly number[]): number {
  const a = new Set(left);
  const b = new Set(right);
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

function pairwiseJaccardMean(decisions: readonly SamplingDecisionV1[]): number {
  if (decisions.length <= 1) return 1;
  const scores: number[] = [];
  for (let left = 0; left < decisions.length; left += 1) {
    for (let right = left + 1; right < decisions.length; right += 1) {
      scores.push(jaccard(decisions[left]!.selectedOrdinals, decisions[right]!.selectedOrdinals));
    }
  }
  return mean(scores);
}

function aggregatePolicy(input: {
  matrix: SampleQueryMatrixV1;
  targetSet: SamplingTargetSetV1;
  policy: 'LENGTH_SQUARED' | 'UNIFORM' | 'TOP_K_ROW_NORM';
  sampleSize: number;
  seeds: readonly number[];
  producerRevision: string;
}): SamplingPolicyAggregateV1 {
  const targetSet = new Set(input.targetSet.targetOrdinals);
  const decisions: SamplingDecisionV1[] = [];
  const recalls: number[] = [];
  const latencies: number[] = [];

  for (const seed of input.seeds) {
    const started = performance.now();
    const decision = sampleCandidateOrdinalsV1({
      matrix: input.matrix,
      policy: input.policy,
      sampleSize: input.sampleSize,
      seed,
      producerRevision: input.producerRevision,
    });
    latencies.push(Math.max(0, performance.now() - started));
    decisions.push(decision);
    recalls.push(recall(decision.selectedOrdinals, targetSet));
  }

  const payload = {
    policy: input.policy,
    seeds: [...input.seeds],
    decisionChecksums: decisions.map((decision) => decision.decisionChecksum),
  };

  return samplingPolicyAggregateV1Schema.parse({
    schema: SAMPLING_POLICY_AGGREGATE_SCHEMA,
    policy: input.policy,
    seeds: [...input.seeds],
    seedCount: input.seeds.length,
    recallMean: mean(recalls),
    recallStdDev: stddev(recalls),
    recallMin: Math.min(...recalls),
    recallMax: Math.max(...recalls),
    pairwiseSelectionJaccardMean: pairwiseJaccardMean(decisions),
    latencyMsP50: percentile(latencies, 0.5),
    latencyMsP95: percentile(latencies, 0.95),
    latencyMsMax: Math.max(...latencies),
    decisionSetChecksum: samplingCorpusChecksum(payload),
  });
}

function assertSameCandidateWorld(matrix: SampleQueryMatrixV1, targets: SamplingTargetSetV1): void {
  if (matrix.candidateSnapshotRevision !== targets.candidateSnapshotRevision) {
    throw new Error('SAMPLING_TARGET_CANDIDATE_SNAPSHOT_MISMATCH');
  }
  if (matrix.ordinalMapChecksum !== targets.ordinalMapChecksum) {
    throw new Error('SAMPLING_TARGET_ORDINAL_MAP_MISMATCH');
  }
  for (const ordinal of targets.targetOrdinals) {
    if (ordinal >= matrix.rowCount) throw new Error(`SAMPLING_TARGET_ORDINAL_OUT_OF_RANGE:${ordinal}`);
  }
}

export function evaluateSamplingCorpusV1(input: {
  matrix: z.input<typeof sampleQueryMatrixV1Schema>;
  targetSet: z.input<typeof samplingTargetSetV1Schema>;
  sampleSize: number;
  seeds: readonly number[];
  producerRevision: string;
}): SamplingCorpusEvaluationV1 {
  const matrix = sampleQueryMatrixV1Schema.parse(input.matrix);
  const targetSet = samplingTargetSetV1Schema.parse(input.targetSet);
  const seeds = validateSeeds(input.seeds);
  assertSameCandidateWorld(matrix, targetSet);

  if (!Number.isInteger(input.sampleSize) || input.sampleSize <= 0 || input.sampleSize > matrix.rowCount) {
    throw new Error(`SAMPLING_CORPUS_SAMPLE_SIZE_OUT_OF_RANGE:${input.sampleSize}`);
  }

  const lengthSquared = aggregatePolicy({ matrix, targetSet, policy: 'LENGTH_SQUARED', sampleSize: input.sampleSize, seeds, producerRevision: input.producerRevision });
  const uniform = aggregatePolicy({ matrix, targetSet, policy: 'UNIFORM', sampleSize: input.sampleSize, seeds, producerRevision: input.producerRevision });
  const topKRowNorm = aggregatePolicy({ matrix, targetSet, policy: 'TOP_K_ROW_NORM', sampleSize: input.sampleSize, seeds, producerRevision: input.producerRevision });

  const payload = {
    matrixChecksum: matrix.matrixChecksum,
    sourceMatrixRevision: matrix.sourceMatrixRevision,
    sourceMatrixChecksum: matrix.sourceMatrixChecksum,
    matrixRole: matrix.matrixRole,
    normalization: matrix.normalization,
    candidateSnapshotRevision: matrix.candidateSnapshotRevision,
    ordinalMapChecksum: matrix.ordinalMapChecksum,
    rowCount: matrix.rowCount,
    columnCount: matrix.columnCount,
    estimatedMatrixBytes: matrix.rowCount * matrix.columnCount * 4,
    targetSetChecksum: targetSet.targetSetChecksum,
    targetKind: targetSet.targetKind,
    targetCount: targetSet.targetOrdinals.length,
    sampleSize: input.sampleSize,
    seeds,
    lengthSquared,
    uniform,
    topKRowNorm,
    lengthSquaredDeltaVsUniformMean: lengthSquared.recallMean - uniform.recallMean,
    lengthSquaredDeltaVsTopKMean: lengthSquared.recallMean - topKRowNorm.recallMean,
    lengthSquaredDegeneratesTowardUniform: matrix.lengthSquaredDegeneratesTowardUniform,
  };

  return samplingCorpusEvaluationV1Schema.parse({
    schema: SAMPLING_CORPUS_EVALUATION_SCHEMA,
    ...payload,
    evaluationChecksum: samplingCorpusChecksum(payload),
    measurementOnly: true,
    identityAuthority: false,
    retrievalVoteProduced: false,
    canonicalWritesAttempted: false,
    promotionAuthorized: false,
    producerRevision: input.producerRevision,
  });
}

export function compareSamplingMatricesV1(input: {
  left: z.input<typeof sampleQueryMatrixV1Schema>;
  right: z.input<typeof sampleQueryMatrixV1Schema>;
  targetSet: z.input<typeof samplingTargetSetV1Schema>;
  sampleSize: number;
  seeds: readonly number[];
  producerRevision: string;
}): SamplingMatrixComparisonV1 {
  const left = sampleQueryMatrixV1Schema.parse(input.left);
  const right = sampleQueryMatrixV1Schema.parse(input.right);
  const targetSet = samplingTargetSetV1Schema.parse(input.targetSet);
  const seeds = validateSeeds(input.seeds);

  if (left.candidateSnapshotRevision !== right.candidateSnapshotRevision) {
    throw new Error('SAMPLING_MATRIX_CANDIDATE_SNAPSHOT_MISMATCH');
  }
  if (left.ordinalMapChecksum !== right.ordinalMapChecksum) {
    throw new Error('SAMPLING_MATRIX_ORDINAL_MAP_MISMATCH');
  }
  if (left.rowCount !== right.rowCount) throw new Error('SAMPLING_MATRIX_ROW_COUNT_MISMATCH');

  const leftEvaluation = evaluateSamplingCorpusV1({ left: undefined as never, matrix: left, targetSet, sampleSize: input.sampleSize, seeds, producerRevision: input.producerRevision } as never);
  const rightEvaluation = evaluateSamplingCorpusV1({ matrix: right, targetSet, sampleSize: input.sampleSize, seeds, producerRevision: input.producerRevision });

  const payload = {
    candidateSnapshotRevision: left.candidateSnapshotRevision,
    ordinalMapChecksum: left.ordinalMapChecksum,
    targetSetChecksum: targetSet.targetSetChecksum,
    sampleSize: input.sampleSize,
    seeds,
    left: leftEvaluation,
    right: rightEvaluation,
    lengthSquaredRecallMeanDeltaRightMinusLeft: rightEvaluation.lengthSquared.recallMean - leftEvaluation.lengthSquared.recallMean,
  };

  return samplingMatrixComparisonV1Schema.parse({
    schema: SAMPLING_MATRIX_COMPARISON_SCHEMA,
    ...payload,
    comparisonChecksum: samplingCorpusChecksum(payload),
    measurementOnly: true,
    identityAuthority: false,
    retrievalVoteProduced: false,
    canonicalWritesAttempted: false,
    promotionAuthorized: false,
    producerRevision: input.producerRevision,
  });
}
