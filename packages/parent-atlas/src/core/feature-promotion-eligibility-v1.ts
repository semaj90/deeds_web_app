import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type FeatureCandidateClassificationV1 } from './feature-candidate-classification-v1.js';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const groundedFeatureEvidenceSchema = z.object({
  evidence_id: z.string().min(1),
  evidence_kind: z.string().min(1),
  source_ref: z.string().min(1),
  source_revision: z.string().min(1),
  evidence_checksum: checksum.optional(),
}).strict();
export type GroundedFeatureEvidenceV1 = z.infer<typeof groundedFeatureEvidenceSchema>;

export const featurePromotionEligibilitySchema = z.object({
  schema: z.literal('atlas.feature-promotion-eligibility.v1').default('atlas.feature-promotion-eligibility.v1'),
  observation_id: z.string().min(1),
  feature_id: z.string().min(1),
  feature_key: z.string().min(1),
  source_ref: z.string().min(1),
  source_revision: z.string().min(1),
  classifier_probability: z.number().finite().min(0).max(1),
  evidence_refs: z.array(z.string().min(1)),
  status: z.enum(['ELIGIBLE', 'BLOCKED_ABSTAINED', 'BLOCKED_NO_EVIDENCE', 'BLOCKED_SOURCE_REVISION_MISMATCH']),
  eligibility_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
  writes_performed: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'ELIGIBLE' && value.evidence_refs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence_refs'], message: 'eligible feature promotion requires grounded evidence' });
  }
});
export type FeaturePromotionEligibilityV1 = z.infer<typeof featurePromotionEligibilitySchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

/** Ground a classified proposal without creating or mutating canonical feature state. */
export function buildFeaturePromotionEligibilityV1(input: {
  classification: FeatureCandidateClassificationV1;
  selectedFeatureId?: string;
  featureKey: string;
  sourceRef: string;
  sourceRevision: string;
  evidence: GroundedFeatureEvidenceV1[];
}): FeaturePromotionEligibilityV1 {
  const selected = input.classification.candidates.find((candidate) => candidate.feature_id === input.selectedFeatureId);
  const sameRevisionEvidence = input.evidence.filter((item) => item.source_ref === input.sourceRef && item.source_revision === input.sourceRevision);
  let status: FeaturePromotionEligibilityV1['status'] = 'ELIGIBLE';
  if (input.classification.abstained || !selected) status = 'BLOCKED_ABSTAINED';
  else if (input.evidence.length === 0) status = 'BLOCKED_NO_EVIDENCE';
  else if (sameRevisionEvidence.length !== input.evidence.length) status = 'BLOCKED_SOURCE_REVISION_MISMATCH';
  const body = {
    schema: 'atlas.feature-promotion-eligibility.v1' as const,
    observation_id: input.classification.observation_id,
    feature_id: selected?.feature_id ?? input.selectedFeatureId ?? 'UNRESOLVED',
    feature_key: input.featureKey,
    source_ref: input.sourceRef,
    source_revision: input.sourceRevision,
    classifier_probability: selected?.classifier_probability ?? 0,
    evidence_refs: sameRevisionEvidence.map((item) => item.evidence_id).sort(),
    status,
    canonical_authority: false as const,
    writes_performed: false as const,
  };
  return featurePromotionEligibilitySchema.parse({ ...body, eligibility_checksum: digest(body) });
}
