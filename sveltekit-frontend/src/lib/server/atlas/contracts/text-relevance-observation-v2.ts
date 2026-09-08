import { z } from 'zod';

export const TextRelevanceScoreTypeV2Schema = z.enum([
  'MXBAI_MARGIN',
  'ATLAS_GEMMA_CROSS_LOGIT',
  'ATLAS_GEMMA_MAXSIM',
]);

export type TextRelevanceScoreTypeV2 = z.infer<typeof TextRelevanceScoreTypeV2Schema>;

export const TextRelevanceNormalizationV2Schema = z.enum([
  'SIGMOID_V1',
  'LATE_HEAD_CALIBRATION_V1',
]);

export type TextRelevanceNormalizationV2 = z.infer<typeof TextRelevanceNormalizationV2Schema>;

export const TextRelevanceInferenceModeV2Schema = z.enum([
  'late32',
  'late64',
  'late128',
  'cross',
  'mxbai',
]);

export const TextRelevanceQuantizationV2Schema = z.enum(['bf16', 'fp16', 'int8', 'int4']);

export const CalibrationMethodV2Schema = z.enum(['PLATT_V1', 'ISOTONIC_V1', 'LATE_HEAD_V1']);

export const CalibrationIdentityV2Schema = z.object({
  schema: z.literal('atlas.calibration-identity.v2').default('atlas.calibration-identity.v2'),
  scoreType: TextRelevanceScoreTypeV2Schema,
  modelRevision: z.string().min(1),
  adapterRevision: z.string().min(1),
  weightRevision: z.string().min(1),
  domain: z.enum(['code', 'legal', 'mixed']),
  inferenceMode: TextRelevanceInferenceModeV2Schema,
  quantization: TextRelevanceQuantizationV2Schema,
  labelSetRevision: z.string().min(1),
  calibrationMethod: CalibrationMethodV2Schema,
}).strict();

export type CalibrationIdentityV2 = z.infer<typeof CalibrationIdentityV2Schema>;

const modelRevision = z.string().min(1);

/**
 * Score semantics are part of the observation identity.  In particular, MaxSim
 * is not passed through sigmoid merely because another reranker emits logits.
 */
export const TextRelevanceObservationV2Schema = z.object({
  schema: z.literal('atlas.text-relevance-observation.v2').default('atlas.text-relevance-observation.v2'),
  canonicalId: z.string().min(1),
  scoreType: TextRelevanceScoreTypeV2Schema,
  rawScore: z.number().finite(),
  normalizedScore: z.number().finite().min(0).max(1).nullable(),
  normalization: TextRelevanceNormalizationV2Schema.nullable(),
  calibratedScore: z.number().finite().min(0).max(1).nullable().default(null),
  modelRevision,
  adapterRevision: modelRevision.nullable().default(null),
  weightRevision: modelRevision.nullable().default(null),
  domain: z.enum(['code', 'legal', 'mixed']),
  inferenceMode: TextRelevanceInferenceModeV2Schema,
  quantization: TextRelevanceQuantizationV2Schema,
  calibrationIdentity: CalibrationIdentityV2Schema.nullable().default(null),
}).strict().superRefine((observation, ctx) => {
  const sigmoidRequired = observation.scoreType === 'MXBAI_MARGIN' || observation.scoreType === 'ATLAS_GEMMA_CROSS_LOGIT';
  if (sigmoidRequired && observation.normalization !== 'SIGMOID_V1') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['normalization'], message: 'LOGIT_SCORE_REQUIRES_SIGMOID_V1' });
  }
  if (sigmoidRequired && observation.normalizedScore === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['normalizedScore'], message: 'LOGIT_SCORE_REQUIRES_NORMALIZED_SCORE' });
  }
  if (observation.scoreType === 'ATLAS_GEMMA_MAXSIM' && observation.normalization !== null && observation.normalization !== 'LATE_HEAD_CALIBRATION_V1') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['normalization'], message: 'MAXSIM_REQUIRES_EXPLICIT_CALIBRATION' });
  }
  if (observation.scoreType === 'ATLAS_GEMMA_MAXSIM' && observation.normalizedScore !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['normalizedScore'], message: 'UNCALIBRATED_MAXSIM_MUST_NOT_LOOK_PROBABILISTIC' });
  }
  if (observation.calibratedScore !== null && observation.normalization !== 'LATE_HEAD_CALIBRATION_V1') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['calibratedScore'], message: 'CALIBRATED_SCORE_REQUIRES_LATE_HEAD_CALIBRATION_V1' });
  }
  if (observation.normalization === 'LATE_HEAD_CALIBRATION_V1' && observation.calibratedScore === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['calibratedScore'], message: 'LATE_HEAD_CALIBRATION_REQUIRES_CALIBRATED_SCORE' });
  }
  if (observation.normalization === 'LATE_HEAD_CALIBRATION_V1' && observation.calibrationIdentity === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['calibrationIdentity'], message: 'CALIBRATED_SCORE_REQUIRES_CALIBRATION_IDENTITY' });
  }
  if (observation.calibrationIdentity !== null) {
    const identity = observation.calibrationIdentity;
    const expectedAdapter = observation.adapterRevision ?? 'none';
    const expectedWeight = observation.weightRevision ?? 'none';
    const mismatches = [
      ['scoreType', identity.scoreType, observation.scoreType],
      ['modelRevision', identity.modelRevision, observation.modelRevision],
      ['adapterRevision', identity.adapterRevision, expectedAdapter],
      ['weightRevision', identity.weightRevision, expectedWeight],
      ['domain', identity.domain, observation.domain],
      ['inferenceMode', identity.inferenceMode, observation.inferenceMode],
      ['quantization', identity.quantization, observation.quantization],
    ] as const;
    for (const [field, actual, expected] of mismatches) {
      if (actual !== expected) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['calibrationIdentity', field], message: 'CALIBRATION_IDENTITY_DOES_NOT_MATCH_OBSERVATION' });
      }
    }
  }
});

export type TextRelevanceObservationV2 = z.infer<typeof TextRelevanceObservationV2Schema>;

function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

export function normalizeTextRelevanceScoreV2(input: {
  scoreType: TextRelevanceScoreTypeV2;
  rawScore: number;
}): Pick<TextRelevanceObservationV2, 'normalizedScore' | 'normalization'> {
  if (!Number.isFinite(input.rawScore)) throw new Error('RAW_SCORE_MUST_BE_FINITE');
  if (input.scoreType === 'ATLAS_GEMMA_MAXSIM') {
    return { normalizedScore: null, normalization: null };
  }
  return { normalizedScore: sigmoid(input.rawScore), normalization: 'SIGMOID_V1' };
}

/**
 * Batch-level validation for FT-01 through FT-11 (best-fit-score-fabric tasks.md,
 * FT-06): "Reject non-finite values, duplicate candidate rows, missing scores,
 * and a second sigmoid." Non-finite values and single-observation sigmoid
 * consistency are already enforced by `TextRelevanceObservationV2Schema`'s own
 * `.strict().superRefine()` above (per-observation, structural). Duplicate rows
 * and missing scores are properties of a SET of observations for one candidate
 * cohort, not expressible in a per-observation schema -- this function is that
 * batch-level check, applied after every observation has already been parsed
 * through the schema.
 *
 * A genuine "second sigmoid" (re-normalizing an already-normalized [0,1] value
 * as if it were a fresh raw logit) cannot be detected from the value alone --
 * 0.5 is indistinguishable between "a legitimate small raw logit" and "an
 * already-sigmoided score fed back in by mistake." `normalizeTextRelevanceScoreV2`
 * is the only sanctioned path from raw to normalized; this function does not
 * attempt a false heuristic detection of misuse it cannot actually prove.
 */
export function validateTextRelevanceObservationBatchV2(
  observations: readonly TextRelevanceObservationV2[],
  expectedCanonicalIds?: readonly string[],
): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const observation of observations) {
    if (seen.has(observation.canonicalId)) duplicates.add(observation.canonicalId);
    seen.add(observation.canonicalId);
  }
  if (duplicates.size > 0) {
    throw new Error(`DUPLICATE_CANDIDATE_ROWS: ${[...duplicates].sort().join(', ')}`);
  }
  if (expectedCanonicalIds) {
    const missing = expectedCanonicalIds.filter((id) => !seen.has(id));
    if (missing.length > 0) {
      throw new Error(`MISSING_SCORES_FOR_CANDIDATES: ${missing.sort().join(', ')}`);
    }
  }
}

export function checksumCalibrationIdentityV2(identity: CalibrationIdentityV2): string {
  const canonical = JSON.stringify(identity, Object.keys(identity).sort());
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
