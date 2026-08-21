import { z } from 'zod';
import { OkfEvidenceRefV1Schema, OkfRevisionSetV1Schema } from './okf-evidence-feature-v1.js';

export const ATLAS_PAIR_JUDGMENT_SCHEMA = 'atlas.pair-judgment.v1' as const;
export const ATLAS_RECOMMENDATION_EVIDENCE_SCHEMA = 'atlas.recommendation-evidence.v1' as const;
export const ATLAS_RELATED_FILE_SCORE_SCHEMA = 'atlas.related-file-score.v1' as const;
export const ACE_PACKET_RESIDENCY_SCHEMA = 'atlas.ace-packet-residency.v1' as const;

const RevisionedQueryCandidateBaseSchema = z.object({
  queryId: z.string().min(1),
  queryRevision: z.string().min(1),
  candidateCanonicalId: z.string().min(1),
  candidatePacketKey: z.string().min(1),
  candidateSourceRef: z.string().min(1),
  candidateSourceRevision: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  revisions: OkfRevisionSetV1Schema,
  evidenceRefs: z.array(OkfEvidenceRefV1Schema).min(1),
}).strict();

export const AtlasPairJudgmentV1Schema = RevisionedQueryCandidateBaseSchema.extend({
  schema: z.literal(ATLAS_PAIR_JUDGMENT_SCHEMA),
  retrieval: z.object({
    initialRank: z.number().int().positive(),
    semanticScore: z.number().finite().nullable(),
    lexicalScore: z.number().finite().nullable(),
    astScore: z.number().finite().nullable(),
    graphScore: z.number().finite().nullable(),
    domainScore: z.number().finite().nullable(),
    featureMatrixSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  teacher: z.object({
    modelId: z.string().min(1),
    modelRevision: z.string().min(1),
    score: z.number().finite(),
    rank: z.number().int().positive(),
  }).strict().nullable(),
  exactPromotion: z.object({
    attempted: z.boolean(),
    passed: z.boolean().nullable(),
    receiptRef: z.string().min(1).nullable(),
  }).strict(),
  executionOutcome: z.object({
    attempted: z.boolean(),
    success: z.boolean().nullable(),
    testPassed: z.boolean().nullable(),
    repairSucceeded: z.boolean().nullable(),
    receiptRefs: z.array(z.string().min(1)).default([]),
  }).strict(),
  humanRelevanceGrade: z.number().int().min(0).max(4).nullable(),
  labelRevision: z.string().min(1),
  trainingEligible: z.boolean(),
  trainingBlockReasons: z.array(z.string().min(1)).default([]),
  canonicalWritesAllowed: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.trainingEligible && value.trainingBlockReasons.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'trainingEligible rows cannot carry trainingBlockReasons' });
  }
  if (value.exactPromotion.passed === true && !value.exactPromotion.receiptRef) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'passed exact promotion requires receiptRef' });
  }
});
export type AtlasPairJudgmentV1 = z.infer<typeof AtlasPairJudgmentV1Schema>;

export const RelatedFileReasonV1Schema = z.enum([
  'CALL_RELATED',
  'PROCESS_RELATED',
  'SEMANTIC_NEIGHBOR',
  'IMPLEMENTS_FEATURE',
  'TESTS_FEATURE',
  'OBSERVED_SUCCESS',
  'GRAPH_NEIGHBOR',
]);

export const RelatedFileScoreV1Schema = z.object({
  schema: z.literal(ATLAS_RELATED_FILE_SCORE_SCHEMA),
  subjectCanonicalId: z.string().min(1),
  targetSourceRef: z.string().min(1),
  score: z.number().min(0).max(1),
  typedReasons: z.array(RelatedFileReasonV1Schema).min(1),
  evidenceRefs: z.array(OkfEvidenceRefV1Schema).min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  graphRevision: z.string().min(1).nullable(),
  featureRevision: z.string().min(1),
  compilerRevision: z.string().min(1),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type RelatedFileScoreV1 = z.infer<typeof RelatedFileScoreV1Schema>;

export const RecommendationEvidenceV1Schema = z.object({
  schema: z.literal(ATLAS_RECOMMENDATION_EVIDENCE_SCHEMA),
  recommendationId: z.string().min(1),
  subjectCanonicalId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  representationRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  revisions: OkfRevisionSetV1Schema,
  relatedFiles: z.array(RelatedFileScoreV1Schema).default([]),
  supportingReceiptRefs: z.array(z.string().min(1)).min(1),
  supportingEvidenceRefs: z.array(OkfEvidenceRefV1Schema).min(1),
  priorSuccessfulExecutionRefs: z.array(z.string().min(1)).default([]),
  inferenceConfidence: z.number().min(0).max(1),
  evidenceAuthority: z.literal(false),
  mutationAuthorized: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type RecommendationEvidenceV1 = z.infer<typeof RecommendationEvidenceV1Schema>;

export const AceResidencyTierSchema = z.enum(['HOT', 'WARM', 'COLD']);

export const ACEPacketResidencyV1Schema = z.object({
  schema: z.literal(ACE_PACKET_RESIDENCY_SCHEMA),
  packetKey: z.string().min(1),
  candidateOrdinal: z.number().int().nonnegative(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  representationRevision: z.string().min(1),
  frequency: z.number().min(0),
  breadth: z.number().min(0),
  recency: z.number().min(0).max(1),
  reuseProbability: z.number().min(0).max(1),
  semanticCost: z.number().min(0),
  hydrationCost: z.number().min(0),
  rerankCost: z.number().min(0),
  byteCost: z.number().int().nonnegative(),
  utility: z.number().finite(),
  targetTier: AceResidencyTierSchema,
  bucketKeys: z.array(z.string().min(1)).default([]),
  ttlSeconds: z.number().int().positive().nullable(),
  reasonCodes: z.array(z.string().min(1)).min(1),
  evidenceRefs: z.array(OkfEvidenceRefV1Schema).min(1),
  streamEventAuthorized: z.literal(false),
  valkeyWritesAllowed: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.targetTier === 'HOT' && value.ttlSeconds === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'HOT residency requires bounded ttlSeconds' });
  }
  if (value.bucketKeys.some((key) => !key.includes(value.workspaceRevision))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'all bucket keys must be revision qualified' });
  }
});
export type ACEPacketResidencyV1 = z.infer<typeof ACEPacketResidencyV1Schema>;

export const GpuWorkTypeSchema = z.enum(['CUVS_SEARCH', 'CUVS_KMEANS', 'CUGRAPH_RANK', 'CROSS_ENCODER']);
export const GpuWorkLeaseV1Schema = z.object({
  schema: z.literal('atlas.gpu-work-lease.v1'),
  requestId: z.string().min(1),
  workType: GpuWorkTypeSchema,
  workspaceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  estimatedVramBytes: z.number().int().nonnegative(),
  priority: z.number().int().min(0).max(100),
  deadlineEpochMs: z.number().int().positive().nullable(),
  owner: z.string().min(1),
  granted: z.boolean(),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  computationOwnerChanged: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type GpuWorkLeaseV1 = z.infer<typeof GpuWorkLeaseV1Schema>;
