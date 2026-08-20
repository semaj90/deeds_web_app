import { z } from 'zod';

export const DagTournamentStageSchema = z.enum([
  'CLASSIFY',
  'RETRIEVE',
  'HYPERGRAPH_EXPAND',
  'GRAPH_EXPAND',
  'RERANK',
  'EXACT_PROMOTION',
  'ACE_RESIDENCY',
  'RLM_REUSE',
  'SYNTHESIS',
  'PREFILL',
  'DECODE',
  'MCP_TOOL',
  'VALIDATE',
  'MATERIALIZE',
]);
export type DagTournamentStage = z.infer<typeof DagTournamentStageSchema>;

export const DagStagePlanV1Schema = z.object({
  stage: DagTournamentStageSchema,
  implementationId: z.string().min(1),
  implementationRevision: z.string().min(1),
  executorId: z.string().min(1),
  enabled: z.boolean(),
  approximate: z.boolean(),
  expectedCacheTier: z.enum(['NONE', 'VRAM', 'PINNED_RAM', 'HOST_RAM', 'VALKEY', 'QDRANT', 'POSTGRES', 'DISK']),
}).strict();
export type DagStagePlanV1 = z.infer<typeof DagStagePlanV1Schema>;

export const DagTournamentPlanV1Schema = z.object({
  schema: z.literal('atlas.dag-tournament-plan.v1'),
  planId: z.string().min(1),
  queryClass: z.string().min(1),
  domainClass: z.string().min(1),
  hmmPolicyRevision: z.string().min(1).nullable(),
  dspyPolicyRevision: z.string().min(1).nullable(),
  learnedPolicyRevision: z.string().min(1).nullable(),
  stages: z.array(DagStagePlanV1Schema).min(1),
  exactPromotionRequired: z.boolean(),
  validationRequired: z.boolean(),
  mutationAllowed: z.boolean(),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  const enabled = value.stages.filter((stage) => stage.enabled);
  const stageSet = new Set(enabled.map((stage) => stage.stage));
  if (value.exactPromotionRequired && !stageSet.has('EXACT_PROMOTION')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stages'], message: 'exact-promotion-required plan must include EXACT_PROMOTION' });
  }
  if (value.validationRequired && !stageSet.has('VALIDATE')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stages'], message: 'validation-required plan must include VALIDATE' });
  }
  if (value.mutationAllowed && !stageSet.has('MATERIALIZE')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stages'], message: 'mutation-enabled plan must include MATERIALIZE' });
  }
  const materializeIndex = enabled.findIndex((stage) => stage.stage === 'MATERIALIZE');
  const validateIndex = enabled.findIndex((stage) => stage.stage === 'VALIDATE');
  if (materializeIndex >= 0 && (validateIndex < 0 || validateIndex > materializeIndex)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stages'], message: 'VALIDATE must precede MATERIALIZE' });
  }
  const exactIndex = enabled.findIndex((stage) => stage.stage === 'EXACT_PROMOTION');
  const toolIndex = enabled.findIndex((stage) => stage.stage === 'MCP_TOOL');
  if (toolIndex >= 0 && value.exactPromotionRequired && (exactIndex < 0 || exactIndex > toolIndex)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stages'], message: 'EXACT_PROMOTION must precede MCP_TOOL when required' });
  }
});
export type DagTournamentPlanV1 = z.infer<typeof DagTournamentPlanV1Schema>;

export const DagTournamentObservationV1Schema = z.object({
  schema: z.literal('atlas.dag-tournament-observation.v1'),
  queryId: z.string().min(1),
  planId: z.string().min(1),
  retrievalRecallAtK: z.number().finite().min(0).max(1),
  ndcgAtK: z.number().finite().min(0).max(1),
  rerankerGain: z.number().finite(),
  groundedAnswerScore: z.number().finite().min(0).max(1),
  executionSuccess: z.boolean(),
  validatorSuccess: z.boolean(),
  mutationCorrect: z.boolean().nullable(),
  cacheHitRatio: z.number().finite().min(0).max(1),
  rlmReuseHit: z.boolean(),
  aceUsefulResidentBytes: z.number().int().nonnegative(),
  aceLoadedBytes: z.number().int().nonnegative(),
  hypergraphEvidenceGain: z.number().finite(),
  graphEvidenceGain: z.number().finite(),
  prefillMs: z.number().finite().nonnegative(),
  decodeMs: z.number().finite().nonnegative(),
  endToEndMs: z.number().finite().nonnegative(),
  peakVramBytes: z.number().int().nonnegative(),
  peakHostMemoryBytes: z.number().int().nonnegative(),
  bytesMoved: z.number().int().nonnegative(),
  modelTokensInput: z.number().int().nonnegative(),
  modelTokensOutput: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  receiptRefs: z.array(z.string().min(1)),
}).strict();
export type DagTournamentObservationV1 = z.infer<typeof DagTournamentObservationV1Schema>;

export const DagTournamentConstraintsV1Schema = z.object({
  minRetrievalRecallAtK: z.number().finite().min(0).max(1),
  minNdcgAtK: z.number().finite().min(0).max(1),
  minGroundedAnswerScore: z.number().finite().min(0).max(1),
  requireExecutionSuccess: z.boolean(),
  requireValidatorSuccess: z.boolean(),
  maxEndToEndMs: z.number().finite().positive(),
  maxPeakVramBytes: z.number().int().nonnegative(),
  maxPeakHostMemoryBytes: z.number().int().nonnegative(),
  maxBytesMoved: z.number().int().nonnegative(),
  maxToolCalls: z.number().int().nonnegative(),
  maxRetries: z.number().int().nonnegative(),
}).strict();
export type DagTournamentConstraintsV1 = z.infer<typeof DagTournamentConstraintsV1Schema>;

export const DagTournamentUtilityWeightsV1Schema = z.object({
  retrievalRecall: z.number().finite().nonnegative(),
  ndcg: z.number().finite().nonnegative(),
  rerankerGain: z.number().finite().nonnegative(),
  groundedAnswer: z.number().finite().nonnegative(),
  hypergraphGain: z.number().finite().nonnegative(),
  graphGain: z.number().finite().nonnegative(),
  cacheUtility: z.number().finite().nonnegative(),
  rlmReuseUtility: z.number().finite().nonnegative(),
  aceResidencyEfficiency: z.number().finite().nonnegative(),
  latencyPenalty: z.number().finite().nonnegative(),
  vramPenalty: z.number().finite().nonnegative(),
  hostMemoryPenalty: z.number().finite().nonnegative(),
  transferPenalty: z.number().finite().nonnegative(),
  tokenPenalty: z.number().finite().nonnegative(),
  toolPenalty: z.number().finite().nonnegative(),
  retryPenalty: z.number().finite().nonnegative(),
}).strict();
export type DagTournamentUtilityWeightsV1 = z.infer<typeof DagTournamentUtilityWeightsV1Schema>;

export type ScoredDagTournamentPlanV1 = {
  planId: string;
  eligible: boolean;
  utility: number;
  violations: string[];
  residencyEfficiency: number;
};

function boundedRatio(value: number, limit: number): number {
  if (limit <= 0) return value > 0 ? 1 : 0;
  return value / limit;
}

export function scoreDagTournamentPlan(input: {
  plan: DagTournamentPlanV1;
  observation: DagTournamentObservationV1;
  constraints: DagTournamentConstraintsV1;
  weights: DagTournamentUtilityWeightsV1;
}): ScoredDagTournamentPlanV1 {
  const plan = DagTournamentPlanV1Schema.parse(input.plan);
  const obs = DagTournamentObservationV1Schema.parse(input.observation);
  const c = DagTournamentConstraintsV1Schema.parse(input.constraints);
  const w = DagTournamentUtilityWeightsV1Schema.parse(input.weights);
  if (plan.planId !== obs.planId) throw new Error('DAG tournament plan/observation mismatch');

  const violations: string[] = [];
  if (obs.retrievalRecallAtK < c.minRetrievalRecallAtK) violations.push('RETRIEVAL_RECALL');
  if (obs.ndcgAtK < c.minNdcgAtK) violations.push('NDCG');
  if (obs.groundedAnswerScore < c.minGroundedAnswerScore) violations.push('GROUNDED_ANSWER');
  if (c.requireExecutionSuccess && !obs.executionSuccess) violations.push('EXECUTION_FAILED');
  if (c.requireValidatorSuccess && !obs.validatorSuccess) violations.push('VALIDATION_FAILED');
  if (plan.mutationAllowed && obs.mutationCorrect !== true) violations.push('MUTATION_NOT_PROVEN_CORRECT');
  if (obs.endToEndMs > c.maxEndToEndMs) violations.push('LATENCY_BUDGET');
  if (obs.peakVramBytes > c.maxPeakVramBytes) violations.push('VRAM_BUDGET');
  if (obs.peakHostMemoryBytes > c.maxPeakHostMemoryBytes) violations.push('HOST_MEMORY_BUDGET');
  if (obs.bytesMoved > c.maxBytesMoved) violations.push('TRANSFER_BUDGET');
  if (obs.toolCalls > c.maxToolCalls) violations.push('TOOL_BUDGET');
  if (obs.retries > c.maxRetries) violations.push('RETRY_BUDGET');

  const residencyEfficiency = obs.aceLoadedBytes === 0
    ? 1
    : Math.min(1, obs.aceUsefulResidentBytes / obs.aceLoadedBytes);
  const quality = w.retrievalRecall * obs.retrievalRecallAtK
    + w.ndcg * obs.ndcgAtK
    + w.rerankerGain * obs.rerankerGain
    + w.groundedAnswer * obs.groundedAnswerScore
    + w.hypergraphGain * obs.hypergraphEvidenceGain
    + w.graphGain * obs.graphEvidenceGain
    + w.cacheUtility * obs.cacheHitRatio
    + w.rlmReuseUtility * Number(obs.rlmReuseHit)
    + w.aceResidencyEfficiency * residencyEfficiency;
  const cost = w.latencyPenalty * boundedRatio(obs.endToEndMs, c.maxEndToEndMs)
    + w.vramPenalty * boundedRatio(obs.peakVramBytes, c.maxPeakVramBytes)
    + w.hostMemoryPenalty * boundedRatio(obs.peakHostMemoryBytes, c.maxPeakHostMemoryBytes)
    + w.transferPenalty * boundedRatio(obs.bytesMoved, c.maxBytesMoved)
    + w.tokenPenalty * (obs.modelTokensInput + obs.modelTokensOutput) / 100_000
    + w.toolPenalty * boundedRatio(obs.toolCalls, Math.max(1, c.maxToolCalls))
    + w.retryPenalty * boundedRatio(obs.retries, Math.max(1, c.maxRetries));

  return {
    planId: plan.planId,
    eligible: violations.length === 0,
    utility: Number((quality - cost).toFixed(9)),
    violations,
    residencyEfficiency: Number(residencyEfficiency.toFixed(9)),
  };
}

export function rankDagTournamentPlans(input: {
  plans: readonly DagTournamentPlanV1[];
  observations: readonly DagTournamentObservationV1[];
  constraints: DagTournamentConstraintsV1;
  weights: DagTournamentUtilityWeightsV1;
}): ScoredDagTournamentPlanV1[] {
  const byPlan = new Map(input.observations.map((row) => [row.planId, row]));
  return input.plans
    .map((plan) => {
      const obs = byPlan.get(plan.planId);
      if (!obs) throw new Error(`missing observation for DAG plan ${plan.planId}`);
      return scoreDagTournamentPlan({ plan, observation: obs, constraints: input.constraints, weights: input.weights });
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.utility - a.utility || a.planId.localeCompare(b.planId));
}

export const DagTournamentPromotionV1Schema = z.object({
  schema: z.literal('atlas.dag-tournament-promotion.v1'),
  queryClass: z.string().min(1),
  domainClass: z.string().min(1),
  championPlanId: z.string().min(1),
  rollout: z.enum(['SHADOW', 'CANARY', 'PREFERRED', 'PRODUCTION']),
  heldOutReplayRequired: z.literal(true),
  liveCanaryRequiredBeforeProduction: z.literal(true),
  rollbackRequired: z.literal(true),
  exactPromotionPreserved: z.literal(true),
  dagAuthorityPreserved: z.literal(true),
  producerRevision: z.string().min(1),
}).strict();

export function nominateDagTournamentChampion(input: {
  plans: readonly DagTournamentPlanV1[];
  ranking: readonly ScoredDagTournamentPlanV1[];
  producerRevision: string;
  maxRollout?: 'SHADOW' | 'CANARY' | 'PREFERRED' | 'PRODUCTION';
}) {
  const champion = input.ranking.find((row) => row.eligible);
  if (!champion) throw new Error('no eligible DAG tournament champion');
  const plan = input.plans.find((candidate) => candidate.planId === champion.planId);
  if (!plan) throw new Error('champion plan not found');
  const requested = input.maxRollout ?? 'SHADOW';
  const rollout = plan.mutationAllowed && requested === 'PRODUCTION' ? 'CANARY' : requested;
  return DagTournamentPromotionV1Schema.parse({
    schema: 'atlas.dag-tournament-promotion.v1',
    queryClass: plan.queryClass,
    domainClass: plan.domainClass,
    championPlanId: plan.planId,
    rollout,
    heldOutReplayRequired: true,
    liveCanaryRequiredBeforeProduction: true,
    rollbackRequired: true,
    exactPromotionPreserved: true,
    dagAuthorityPreserved: true,
    producerRevision: input.producerRevision,
  });
}
