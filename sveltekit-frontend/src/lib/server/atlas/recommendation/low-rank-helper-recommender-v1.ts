import { z } from 'zod';

export const LOW_RANK_HELPER_RECOMMENDER_V1_SCHEMA =
  'parent-atlas.low-rank-helper-recommender.v1' as const;

const factorVector = z.array(z.number().finite()).min(1).max(4096);

export const LowRankHelperArtifactV1Schema = z.object({
  schema: z.literal('parent-atlas.low-rank-helper-artifact.v1'),
  artifactRevision: z.string().min(1),
  rank: z.number().int().positive().max(4096),
  taskFactors: z.array(z.object({ taskFamily: z.string().min(1), factors: factorVector }).strict()),
  helperFactors: z.array(z.object({
    helperId: z.string().min(1),
    factors: factorVector,
    successRate: z.number().min(0).max(1),
    validationRate: z.number().min(0).max(1),
    medianLatencyMs: z.number().finite().nonnegative(),
    medianContextTokens: z.number().int().nonnegative(),
  }).strict()),
  trainingReceiptRefs: z.array(z.string().min(1)),
}).strict().superRefine((artifact, ctx) => {
  artifact.taskFactors.forEach((task, index) => {
    if (task.factors.length !== artifact.rank) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['taskFactors', index, 'factors'], message: 'LOW_RANK_TASK_DIMENSION_MISMATCH' });
  });
  artifact.helperFactors.forEach((helper, index) => {
    if (helper.factors.length !== artifact.rank) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['helperFactors', index, 'factors'], message: 'LOW_RANK_HELPER_DIMENSION_MISMATCH' });
  });
  const taskIds = artifact.taskFactors.map((task) => task.taskFamily);
  const helperIds = artifact.helperFactors.map((helper) => helper.helperId);
  if (new Set(taskIds).size !== taskIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['taskFactors'], message: 'LOW_RANK_DUPLICATE_TASK_FAMILY' });
  if (new Set(helperIds).size !== helperIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['helperFactors'], message: 'LOW_RANK_DUPLICATE_HELPER_ID' });
});

export interface HelperFactorV1 {
  helperId: string;
  factors: readonly number[];
  successRate: number;
  validationRate: number;
  medianLatencyMs: number;
  medianContextTokens: number;
}

export interface TaskFactorV1 {
  taskFamily: string;
  factors: readonly number[];
}

export interface LowRankHelperArtifactV1 {
  schema: 'parent-atlas.low-rank-helper-artifact.v1';
  artifactRevision: string;
  rank: number;
  taskFactors: readonly TaskFactorV1[];
  helperFactors: readonly HelperFactorV1[];
  trainingReceiptRefs: readonly string[];
}

export interface HelperRecommendationV1 {
  helperId: string;
  score: number;
  lowRankAffinity: number;
  successRate: number;
  validationRate: number;
  predictedLatencyMs: number;
  predictedContextTokens: number;
}

function dot(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += a[i] * b[i];
  return total;
}

export function recommendHelpersV1(input: {
  artifact: LowRankHelperArtifactV1;
  taskFamily: string;
  allowedHelpers: readonly string[];
  maxHelpers?: number;
  latencyBudgetMs?: number;
  contextBudgetTokens?: number;
}): readonly HelperRecommendationV1[] {
  const artifact = LowRankHelperArtifactV1Schema.parse(input.artifact);
  const task = artifact.taskFactors.find((x) => x.taskFamily === input.taskFamily);
  if (!task) return [];

  const allowed = new Set(input.allowedHelpers);
  const latencyBudget = Math.max(1, input.latencyBudgetMs ?? 10_000);
  const contextBudget = Math.max(1, input.contextBudgetTokens ?? 8_000);

  return artifact.helperFactors
    .filter((x) => allowed.has(x.helperId))
    .map((helper): HelperRecommendationV1 => {
      const lowRankAffinity = dot(task.factors, helper.factors);
      const latencyPenalty = Math.min(1, helper.medianLatencyMs / latencyBudget);
      const contextPenalty = Math.min(1, helper.medianContextTokens / contextBudget);

      const score =
        0.55 * lowRankAffinity +
        0.20 * helper.successRate +
        0.15 * helper.validationRate -
        0.06 * latencyPenalty -
        0.04 * contextPenalty;

      return {
        helperId: helper.helperId,
        score,
        lowRankAffinity,
        successRate: helper.successRate,
        validationRate: helper.validationRate,
        predictedLatencyMs: helper.medianLatencyMs,
        predictedContextTokens: helper.medianContextTokens
      };
    })
    .sort((a, b) => b.score - a.score || a.helperId.localeCompare(b.helperId))
    .slice(0, Math.max(1, input.maxHelpers ?? 4));
}

export const LowRankHelperBudgetReceiptV1Schema = z.object({
  schema: z.literal('atlas.low-rank-helper-budget-receipt.v1'),
  artifactRevision: z.string().min(1),
  taskFamily: z.string().min(1),
  tokenBudget: z.number().int().nonnegative(),
  estimatedSelectedTokens: z.number().int().nonnegative(),
  estimatedExcludedTokens: z.number().int().nonnegative(),
  recommendations: z.array(z.object({
    helperId: z.string().min(1),
    score: z.number().finite(),
    predictedContextTokens: z.number().int().nonnegative(),
  }).strict()),
  status: z.literal('ADVISORY'),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type LowRankHelperBudgetReceiptV1 = z.infer<typeof LowRankHelperBudgetReceiptV1Schema>;

/** Coarse low-rank routing only; ACE performs exact selection and token admission. */
export function recommendHelpersWithinContextBudgetV1(input: {
  artifact: LowRankHelperArtifactV1;
  taskFamily: string;
  allowedHelpers: readonly string[];
  tokenBudget: number;
  maxHelpers?: number;
}): LowRankHelperBudgetReceiptV1 {
  const artifact = LowRankHelperArtifactV1Schema.parse(input.artifact);
  if (!Number.isInteger(input.tokenBudget) || input.tokenBudget < 0) throw new Error('LOW_RANK_TOKEN_BUDGET_INVALID');
  const eligible = artifact.helperFactors.filter((helper) => input.allowedHelpers.includes(helper.helperId));
  const ranked = recommendHelpersV1({
    artifact,
    taskFamily: input.taskFamily,
    allowedHelpers: input.allowedHelpers,
    maxHelpers: Math.max(1, eligible.length),
    contextBudgetTokens: Math.max(1, input.tokenBudget),
  });
  let remaining = input.tokenBudget;
  const recommendations = ranked.filter((candidate) => {
    if (candidate.predictedContextTokens > remaining) return false;
    remaining -= candidate.predictedContextTokens;
    return true;
  }).slice(0, Math.max(0, input.maxHelpers ?? 4)).map((candidate) => ({
    helperId: candidate.helperId,
    score: candidate.score,
    predictedContextTokens: candidate.predictedContextTokens,
  }));
  const selectedTokens = recommendations.reduce((total, candidate) => total + candidate.predictedContextTokens, 0);
  const eligibleTokens = eligible.reduce((total, candidate) => total + candidate.medianContextTokens, 0);
  return LowRankHelperBudgetReceiptV1Schema.parse({
    schema: 'atlas.low-rank-helper-budget-receipt.v1',
    artifactRevision: artifact.artifactRevision,
    taskFamily: input.taskFamily,
    tokenBudget: input.tokenBudget,
    estimatedSelectedTokens: selectedTokens,
    estimatedExcludedTokens: Math.max(0, eligibleTokens - selectedTokens),
    recommendations,
    status: 'ADVISORY',
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
