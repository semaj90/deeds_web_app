import { z } from 'zod';

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const nonNegativeInteger = z.number().int().nonnegative();
const unitScore = z.number().finite().min(0).max(1);

/**
 * Bounded, non-authoritative proposal for the next information-gathering action.
 *
 * This does not replace RetrievalParameterPlanV1, TraversalBudgetV1,
 * AgentActionProposalV1, or the capability registry. It is the bridge between
 * "what evidence is still missing?" and the existing agent action proposal.
 */
export const NextActionProposalV1Schema = z.object({
  schema: z.literal('atlas.next-action-proposal.v1'),
  executionId: z.string().min(1),
  stepOrdinal: nonNegativeInteger,
  unresolvedQuestion: z.string().min(1).max(1_000),
  proposedCapabilityId: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()),
  evidenceNeeded: z.array(z.string().min(1)).min(1).max(16),
  expectedInformationGain: unitScore,
  estimatedTokenCost: nonNegativeInteger,
  estimatedToolCalls: nonNegativeInteger.max(4),
  remainingTokenBudget: nonNegativeInteger,
  remainingToolBudget: nonNegativeInteger,
  stopCondition: z.string().min(1).max(1_000),
  plannerRevision: z.string().min(1),
  policyRevision: z.string().min(1),
  contextManifestChecksum: sha256,
  canonicalAuthority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.estimatedTokenCost > value.remainingTokenBudget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['estimatedTokenCost'],
      message: 'NEXT_ACTION_TOKEN_BUDGET_EXCEEDED',
    });
  }
  if (value.estimatedToolCalls > value.remainingToolBudget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['estimatedToolCalls'],
      message: 'NEXT_ACTION_TOOL_BUDGET_EXCEEDED',
    });
  }
});
export type NextActionProposalV1 = z.infer<typeof NextActionProposalV1Schema>;

export function buildNextActionProposalV1(
  input: Omit<NextActionProposalV1, 'schema' | 'canonicalAuthority'>,
): NextActionProposalV1 {
  return NextActionProposalV1Schema.parse({
    schema: 'atlas.next-action-proposal.v1',
    ...input,
    canonicalAuthority: false,
  });
}

export const RelativeCandidateScoreV1Schema = z.object({
  candidateId: z.string().min(1),
  validatorReward: z.number().finite(),
  validationReceiptRefs: z.array(z.string().min(1)).min(1).max(32),
  learningOutcomeRef: z.string().min(1).nullable(),
  tokenCost: nonNegativeInteger,
  latencyMs: nonNegativeInteger,
  mutationSize: nonNegativeInteger,
  relativeRank: z.number().int().positive(),
}).strict();
export type RelativeCandidateScoreV1 = z.infer<typeof RelativeCandidateScoreV1Schema>;

/**
 * GRPO-shaped evaluation receipt without policy-gradient training.
 *
 * validatorReward is supplied by the validator/outcome owner. This module only
 * computes a deterministic within-group rank and therefore does not invent a
 * new reward authority.
 */
export const GroupRelativeCandidateEvalV1Schema = z.object({
  schema: z.literal('atlas.group-relative-candidate-eval.v1'),
  groupId: z.string().min(1),
  executionId: z.string().min(1),
  validatorRevision: z.string().min(1),
  policyRevision: z.string().min(1),
  candidates: z.array(RelativeCandidateScoreV1Schema).min(2).max(16),
  selectedCandidateId: z.string().min(1),
  trainingMode: z.literal('NO_WEIGHT_UPDATE'),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  const ids = value.candidates.map((candidate) => candidate.candidateId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidates'],
      message: 'DUPLICATE_CANDIDATE_ID',
    });
  }

  const ranks = value.candidates.map((candidate) => candidate.relativeRank);
  const expectedRanks = Array.from({ length: ranks.length }, (_, index) => index + 1);
  if (new Set(ranks).size !== ranks.length || !expectedRanks.every((rank) => ranks.includes(rank))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidates'],
      message: 'RELATIVE_RANKS_MUST_BE_CONTIGUOUS',
    });
  }

  const winner = value.candidates.find((candidate) => candidate.relativeRank === 1);
  if (!winner || winner.candidateId !== value.selectedCandidateId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selectedCandidateId'],
      message: 'SELECTED_CANDIDATE_MUST_HAVE_RANK_ONE',
    });
  }
});
export type GroupRelativeCandidateEvalV1 = z.infer<typeof GroupRelativeCandidateEvalV1Schema>;

export function buildGroupRelativeCandidateEvalV1(input: {
  groupId: string;
  executionId: string;
  validatorRevision: string;
  policyRevision: string;
  candidates: Array<{
    candidateId: string;
    validatorReward: number;
    validationReceiptRefs: string[];
    learningOutcomeRef?: string | null;
    tokenCost?: number;
    latencyMs?: number;
    mutationSize?: number;
  }>;
}): GroupRelativeCandidateEvalV1 {
  if (input.candidates.length < 2) throw new Error('GROUP_RELATIVE_EVAL_REQUIRES_AT_LEAST_TWO_CANDIDATES');

  const ordered = input.candidates
    .map((candidate, originalIndex) => ({ ...candidate, originalIndex }))
    .sort((left, right) =>
      right.validatorReward - left.validatorReward ||
      left.tokenCost! - right.tokenCost! ||
      left.latencyMs! - right.latencyMs! ||
      left.mutationSize! - right.mutationSize! ||
      left.candidateId.localeCompare(right.candidateId) ||
      left.originalIndex - right.originalIndex,
    );

  const candidates = ordered.map((candidate, index) => ({
    candidateId: candidate.candidateId,
    validatorReward: candidate.validatorReward,
    validationReceiptRefs: candidate.validationReceiptRefs,
    learningOutcomeRef: candidate.learningOutcomeRef ?? null,
    tokenCost: candidate.tokenCost ?? 0,
    latencyMs: candidate.latencyMs ?? 0,
    mutationSize: candidate.mutationSize ?? 0,
    relativeRank: index + 1,
  }));

  return GroupRelativeCandidateEvalV1Schema.parse({
    schema: 'atlas.group-relative-candidate-eval.v1',
    groupId: input.groupId,
    executionId: input.executionId,
    validatorRevision: input.validatorRevision,
    policyRevision: input.policyRevision,
    candidates,
    selectedCandidateId: candidates[0]!.candidateId,
    trainingMode: 'NO_WEIGHT_UPDATE',
    canonicalAuthority: false,
  });
}

/**
 * Input envelope for DSPy/GEPA shadow optimization.
 *
 * It consumes sealed LearningOutcome/validator references. It cannot update a
 * prompt program, model, policy LUT, task state, or canonical evidence.
 */
export const GepaShadowInputV1Schema = z.object({
  schema: z.literal('atlas.gepa-shadow-input.v1'),
  promptProgramRevision: z.string().min(1),
  heldOutEvalRevision: z.string().min(1),
  learningOutcomeRefs: z.array(z.string().min(1)).min(1).max(1_024),
  validatorFeedbackRefs: z.array(z.string().min(1)).min(1).max(1_024),
  metricRevision: z.string().min(1),
  optimizerRevision: z.string().min(1),
  mode: z.literal('SHADOW_ONLY'),
  promotionAllowed: z.literal(false),
  writesAllowed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict();
export type GepaShadowInputV1 = z.infer<typeof GepaShadowInputV1Schema>;

export function buildGepaShadowInputV1(
  input: Omit<
    GepaShadowInputV1,
    'schema' | 'mode' | 'promotionAllowed' | 'writesAllowed' | 'canonicalAuthority'
  >,
): GepaShadowInputV1 {
  return GepaShadowInputV1Schema.parse({
    schema: 'atlas.gepa-shadow-input.v1',
    ...input,
    mode: 'SHADOW_ONLY',
    promotionAllowed: false,
    writesAllowed: false,
    canonicalAuthority: false,
  });
}

export const agentControlPlaneOwnerAuditV1 = Object.freeze({
  retrievalParameterOwner: 'semantic-signal-routing.ts::RetrievalParameterPlanV1',
  traversalBudgetOwner: 'contracts/semantic-signal-v1.ts::TraversalBudgetV1',
  actionProposalOwner: 'agent-execution-spine-v1.ts::AgentActionProposalV1',
  learningOutcomeOwner: 'agentic/contracts/learning-outcome-v1.ts',
  thisModuleOwnsCanonicalEvidence: false,
  thisModuleOwnsTaskState: false,
  thisModuleOwnsModelWeights: false,
  thisModuleOwnsPolicyPromotion: false,
});
