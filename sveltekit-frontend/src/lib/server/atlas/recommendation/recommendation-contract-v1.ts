import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

export const RECOMMENDATION_PROPOSAL_SCHEMA_V1 = 'atlas.recommendation.proposal.v1' as const;
export const RECOMMENDATION_BATCH_SCHEMA_V1 = 'atlas.recommendation.batch.v1' as const;

export const RecommendationProposalKindSchema = z.enum([
  'helper',
  'tool',
  'module',
  'next_step',
]);
export type RecommendationProposalKind = z.infer<typeof RecommendationProposalKindSchema>;

export const RecommendationQualificationSchema = z.enum([
  'ADVISORY',
  'QUALIFIED',
  'ABSTAIN',
]);
export type RecommendationQualification = z.infer<typeof RecommendationQualificationSchema>;

export const RecommendationCandidateCoordinatesSchema = z
  .object({
    canonicalId: z.string().min(1),
    packetKey: z.string().min(1),
    symbolVersionId: z.string().optional(),
    sourceRevision: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    graphRevision: z.string().nullable().default(null),
    representationRevision: z.string().min(1),
  })
  .strict();
export type RecommendationCandidateCoordinates = z.infer<
  typeof RecommendationCandidateCoordinatesSchema
>;

export const RecommendationProposalActionSchema = z
  .object({
    kind: RecommendationProposalKindSchema,
    action: z.string().min(1),
    rationale: z.string().min(1),
  })
  .strict();
export type RecommendationProposalAction = z.infer<typeof RecommendationProposalActionSchema>;

export const RecommendationScoresSchema = z
  .object({
    retrieval: z.number().min(0).max(1),
    semantic: z.number().min(0).max(1),
    structural: z.number().min(0).max(1),
    lowRank: z.number().min(0).max(1).optional(),
    learnedUtility: z.number().min(0).max(1).optional(),
    final: z.number().min(0).max(1),
  })
  .strict();
export type RecommendationScores = z.infer<typeof RecommendationScoresSchema>;

export const RecommendationProposalV1Schema = z
  .object({
    schema: z.literal(RECOMMENDATION_PROPOSAL_SCHEMA_V1),
    proposalChecksum: sha256HexSchema,
    requestId: z.string().min(1),
    queryIntent: z.string().min(1),
    candidate: RecommendationCandidateCoordinatesSchema,
    proposal: RecommendationProposalActionSchema,
    scores: RecommendationScoresSchema,
    evidenceRefs: z.array(z.string().min(1)),
    factorArtifactId: z.string().optional(),
    rankerRevision: z.string().min(1),
    contextManifestChecksum: sha256HexSchema,
    qualification: RecommendationQualificationSchema,
    requiresApproval: z.boolean(),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false),
  })
  .strict();
export type RecommendationProposalV1 = z.infer<typeof RecommendationProposalV1Schema>;

export const RecommendationBatchV1Schema = z
  .object({
    schema: z.literal(RECOMMENDATION_BATCH_SCHEMA_V1),
    batchChecksum: sha256HexSchema,
    requestId: z.string().min(1),
    queryIntent: z.string().min(1),
    proposals: z.array(RecommendationProposalV1Schema).max(4),
    abstentionReason: z.string().nullable().default(null),
    rankerRevision: z.string().min(1),
    contextManifestChecksum: sha256HexSchema,
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false),
  })
  .strict();
export type RecommendationBatchV1 = z.infer<typeof RecommendationBatchV1Schema>;

export interface CreateRecommendationProposalInputV1 {
  requestId: string;
  queryIntent: string;
  candidate: RecommendationCandidateCoordinates;
  proposal: RecommendationProposalAction;
  scores: RecommendationScores;
  evidenceRefs: readonly string[];
  factorArtifactId?: string;
  rankerRevision: string;
  contextManifestChecksum: string;
  qualification: RecommendationQualification;
  requiresApproval: boolean;
}

function stripUndefined<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) {
      result[k] = stripUndefined(v);
    }
  }
  return result as T;
}

/**
 * Creates a deterministic RecommendationProposalV1 with canonical SHA-256 integrity.
 */
export function createRecommendationProposalV1(
  input: CreateRecommendationProposalInputV1
): RecommendationProposalV1 {
  const candidate = RecommendationCandidateCoordinatesSchema.parse(input.candidate);
  const proposal = RecommendationProposalActionSchema.parse(input.proposal);
  const scores = RecommendationScoresSchema.parse(input.scores);

  const core = {
    schema: RECOMMENDATION_PROPOSAL_SCHEMA_V1,
    requestId: input.requestId,
    queryIntent: input.queryIntent,
    candidate,
    proposal,
    scores,
    evidenceRefs: [...input.evidenceRefs].sort(),
    factorArtifactId: input.factorArtifactId,
    rankerRevision: input.rankerRevision,
    contextManifestChecksum: input.contextManifestChecksum,
    qualification: input.qualification,
    requiresApproval: input.requiresApproval,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };

  const cleanCore = stripUndefined(core);
  const proposalChecksum = canonicalSha256V1(cleanCore);

  return RecommendationProposalV1Schema.parse({
    ...cleanCore,
    proposalChecksum,
  });
}

/**
 * Creates a bounded recommendation batch with maximum 4 proposals.
 */
export function createRecommendationBatchV1(input: {
  requestId: string;
  queryIntent: string;
  proposals: readonly RecommendationProposalV1[];
  rankerRevision: string;
  contextManifestChecksum: string;
  abstentionReason?: string | null;
}): RecommendationBatchV1 {
  if (input.proposals.length > 4) {
    throw new Error(`RECOMMENDATION_BATCH_LIMIT_EXCEEDED: received ${input.proposals.length} > 4`);
  }

  const core = {
    schema: RECOMMENDATION_BATCH_SCHEMA_V1,
    requestId: input.requestId,
    queryIntent: input.queryIntent,
    proposals: [...input.proposals],
    abstentionReason: input.abstentionReason ?? null,
    rankerRevision: input.rankerRevision,
    contextManifestChecksum: input.contextManifestChecksum,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };

  const cleanCore = stripUndefined(core);
  const batchChecksum = canonicalSha256V1(cleanCore);

  return RecommendationBatchV1Schema.parse({
    ...cleanCore,
    batchChecksum,
  });
}
