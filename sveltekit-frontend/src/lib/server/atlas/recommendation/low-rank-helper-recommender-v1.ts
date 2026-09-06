export const LOW_RANK_HELPER_RECOMMENDER_V1_SCHEMA =
  'parent-atlas.low-rank-helper-recommender.v1' as const;

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
  const n = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < n; i += 1) total += a[i] * b[i];
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
  const task = input.artifact.taskFactors.find((x) => x.taskFamily === input.taskFamily);
  if (!task) return [];

  const allowed = new Set(input.allowedHelpers);
  const latencyBudget = Math.max(1, input.latencyBudgetMs ?? 10_000);
  const contextBudget = Math.max(1, input.contextBudgetTokens ?? 8_000);

  return input.artifact.helperFactors
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
