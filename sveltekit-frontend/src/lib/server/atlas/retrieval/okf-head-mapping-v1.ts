import { z } from 'zod';
import type { DomainClassificationV1 } from '../contracts/okf-cross-domain-v1.js';
import { CandidateHeadSchema, type CandidateHead } from './candidate-materialization-v1.js';

export const CandidateHeadBit = {
  semantic: 1 << 0,
  structural: 1 << 1,
  graph: 1 << 2,
  execution: 1 << 3,
  domain: 1 << 4,
  program: 1 << 5,
  memory: 1 << 6,
} as const;

export const OkfHeadPolicyV1Schema = z.object({
  schema: z.literal('atlas.okf-head-policy.v1'),
  policyRevision: z.string().min(1),
  defaultHeads: z.array(CandidateHeadSchema).min(1).max(7),
  domainHeads: z.record(z.string().min(1), z.array(CandidateHeadSchema).min(1).max(7)),
  minimumConfidence: z.number().finite().min(0).max(1),
  producerRevision: z.string().min(1),
}).strict();
export type OkfHeadPolicyV1 = z.infer<typeof OkfHeadPolicyV1Schema>;

export const OkfHeadMappingV1Schema = z.object({
  schema: z.literal('atlas.okf-head-mapping.v1'),
  subjectRef: z.string().min(1),
  domainId: z.string().min(1),
  taxonomyRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  headMask: z.number().int().min(1).max(127),
  heads: z.array(CandidateHeadSchema).min(1).max(7),
  classificationConfidence: z.number().finite().min(0).max(1),
  evidenceRefs: z.array(z.string().min(1)).min(1).max(64),
  policyRevision: z.string().min(1),
  canonicalWrites: z.literal(false),
}).strict();
export type OkfHeadMappingV1 = z.infer<typeof OkfHeadMappingV1Schema>;

function maskForHeads(heads: readonly CandidateHead[]): number {
  return heads.reduce((mask, head) => mask | CandidateHeadBit[head], 0);
}

export function mapOkfClassificationToHeads(input: {
  classification: DomainClassificationV1;
  policy: OkfHeadPolicyV1;
}): OkfHeadMappingV1 {
  const classification = input.classification;
  const policy = OkfHeadPolicyV1Schema.parse(input.policy);
  if (classification.lifecycle === 'SUPERSEDED') throw new Error('OKF_HEAD_MAPPING_SUPERSEDED_CLASSIFICATION');
  if (classification.confidence < policy.minimumConfidence) throw new Error('OKF_HEAD_MAPPING_CONFIDENCE_BELOW_POLICY');
  const heads = policy.domainHeads[classification.domainId] ?? policy.defaultHeads;
  return OkfHeadMappingV1Schema.parse({
    schema: 'atlas.okf-head-mapping.v1',
    subjectRef: classification.subjectRef,
    domainId: classification.domainId,
    taxonomyRevision: classification.taxonomyRevision,
    sourceRevision: classification.sourceRevision,
    headMask: maskForHeads(heads),
    heads,
    classificationConfidence: classification.confidence,
    evidenceRefs: classification.evidenceRefs,
    policyRevision: policy.policyRevision,
    canonicalWrites: false,
  });
}
