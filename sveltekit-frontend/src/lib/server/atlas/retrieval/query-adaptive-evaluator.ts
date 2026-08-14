import { z } from 'zod';

export const QueryAdaptiveEvaluationSchema = z.object({
  schema: z.literal('atlas.qas.evaluation.v1'),
  budget: z.number().int().positive(),
  baselineCount: z.number().int().nonnegative(),
  sampledCount: z.number().int().nonnegative(),
  recallAt10: z.number().min(0).max(1),
  recallAt20: z.number().min(0).max(1),
  recallAt50: z.number().min(0).max(1),
  overlapAt10: z.number().min(0).max(1),
  overlapAt20: z.number().min(0).max(1),
  overlapAt50: z.number().min(0).max(1),
  top1Preserved: z.boolean(),
  exactPromotionRate: z.number().min(0).max(1),
  candidateReduction: z.number().min(0).max(1),
}).strict();

export type QueryAdaptiveEvaluation = z.infer<typeof QueryAdaptiveEvaluationSchema>;

function atK(ids: string[], k: number): Set<string> {
  return new Set(ids.slice(0, k));
}

function ratio(intersection: number, denominator: number): number {
  return denominator === 0 ? 1 : intersection / denominator;
}

export function evaluateQueryAdaptiveSample(input: {
  baselineIds: string[];
  sampledIds: string[];
  budget: number;
  exactPromotedIds: string[];
}): QueryAdaptiveEvaluation {
  const baseline = new Set(input.baselineIds);
  const sampled = new Set(input.sampledIds);
  const overlap = (k: number) => {
    const baselineTop = atK(input.baselineIds, k);
    const sampledTop = atK(input.sampledIds, k);
    return ratio([...baselineTop].filter((id) => sampledTop.has(id)).length, baselineTop.size);
  };
  const recall = (k: number) => {
    const baselineTop = atK(input.baselineIds, k);
    return ratio([...baselineTop].filter((id) => sampled.has(id)).length, baselineTop.size);
  };
  return QueryAdaptiveEvaluationSchema.parse({
    schema: 'atlas.qas.evaluation.v1',
    budget: input.budget,
    baselineCount: input.baselineIds.length,
    sampledCount: input.sampledIds.length,
    recallAt10: recall(10),
    recallAt20: recall(20),
    recallAt50: recall(50),
    overlapAt10: overlap(10),
    overlapAt20: overlap(20),
    overlapAt50: overlap(50),
    top1Preserved: input.baselineIds[0] === input.sampledIds[0],
    exactPromotionRate: ratio(input.exactPromotedIds.filter((id) => baseline.has(id)).length, input.exactPromotedIds.length),
    candidateReduction: ratio(Math.max(0, input.baselineIds.length - input.sampledIds.length), input.baselineIds.length),
  });
}
