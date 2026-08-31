import { createHash } from 'node:crypto';
import { z } from 'zod';
import { observationFeatureCandidateSchema, type FeatureCandidateRetrievalV1 } from './feature-candidate-retrieval-v1.js';

const probability = z.number().finite().min(0).max(1);

export const classifiedFeatureCandidateSchema = observationFeatureCandidateSchema.extend({
  classifier_probability: probability,
  classifier_rank: z.number().int().positive(),
}).strict();

export const featureCandidateClassificationSchema = z.object({
  schema: z.literal('atlas.feature-candidate-classification.v1').default('atlas.feature-candidate-classification.v1'),
  observation_id: z.string().min(1),
  registry_revision: z.string().min(1),
  retrieval_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  classifier_id: z.string().min(1),
  classifier_revision: z.string().min(1),
  calibration_revision: z.string().min(1),
  abstained: z.boolean(),
  abstain_reason: z.string().min(1).nullable(),
  candidates: z.array(classifiedFeatureCandidateSchema).max(10),
  classification_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const ranks = value.candidates.map((candidate) => candidate.classifier_rank);
  if (new Set(ranks).size !== ranks.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates'], message: 'classifier ranks must be unique' });
  if (value.abstained && !value.abstain_reason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['abstain_reason'], message: 'abstained classification requires a reason' });
  if (!value.abstained && value.abstain_reason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['abstain_reason'], message: 'non-abstained classification cannot carry an abstain reason' });
});

export type FeatureCandidateClassificationV1 = z.infer<typeof featureCandidateClassificationSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

/** Rank retrieved candidates using externally produced calibrated scores. No identity promotion occurs here. */
export function classifyFeatureCandidatesV1(input: {
  retrieval: FeatureCandidateRetrievalV1;
  classifierId: string;
  classifierRevision: string;
  calibrationRevision: string;
  probabilities: ReadonlyMap<string, number>;
  abstainThreshold?: number;
}): FeatureCandidateClassificationV1 {
  const threshold = input.abstainThreshold ?? 0.5;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('FEATURE_CLASSIFIER_INVALID_ABSTAIN_THRESHOLD');
  const candidates = input.retrieval.candidates.map((candidate) => ({
    ...candidate,
    classifier_probability: input.probabilities.get(candidate.feature_id) ?? 0,
  })).sort((a, b) => b.classifier_probability - a.classifier_probability || a.feature_ordinal - b.feature_ordinal)
    .map((candidate, index) => ({ ...candidate, classifier_rank: index + 1 }));
  const top = candidates[0]?.classifier_probability ?? 0;
  const abstained = candidates.length === 0 || top < threshold;
  const body = {
    schema: 'atlas.feature-candidate-classification.v1' as const,
    observation_id: input.retrieval.observation_id,
    registry_revision: input.retrieval.registry_revision,
    retrieval_checksum: input.retrieval.retrieval_checksum,
    classifier_id: input.classifierId,
    classifier_revision: input.classifierRevision,
    calibration_revision: input.calibrationRevision,
    abstained,
    abstain_reason: abstained ? (candidates.length === 0 ? 'NO_RETRIEVED_CANDIDATES' : 'TOP_PROBABILITY_BELOW_THRESHOLD') : null,
    candidates,
    canonical_authority: false as const,
  };
  return featureCandidateClassificationSchema.parse({ ...body, classification_checksum: digest(body) });
}
