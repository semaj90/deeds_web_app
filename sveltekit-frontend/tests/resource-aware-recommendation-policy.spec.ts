// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  defaultLaneEstimates,
  selectRecommendationLanes,
  type RecommendationBudget,
} from '../src/lib/server/ai/resource-aware-recommendation-policy.js';

const generous: RecommendationBudget = {
  maxCandidates: 200,
  maxGraphHops: 3,
  maxToolCalls: 4,
  maxContextTokens: 4096,
  maxGpuBytes: 64 * 1024 * 1024,
  maxLatencyMs: 250,
};

describe('resource-aware recommendation policy', () => {
  it('requires AST and exact promotion for file mutation', () => {
    const plan = selectRecommendationLanes(
      generous,
      defaultLaneEstimates({ queryKind: 'file_mutation' }),
    );

    expect(plan.selected).toContain('semantic');
    expect(plan.selected).toContain('ast');
    expect(plan.selected).toContain('exact_promotion');
  });

  it('prefers hypergraph evidence for graph reasoning when budget permits', () => {
    const plan = selectRecommendationLanes(
      generous,
      defaultLaneEstimates({ queryKind: 'graph_reasoning', requestedGraphHops: 2 }),
    );

    expect(plan.selected).toContain('hypergraph');
    expect(plan.totals.graphHops).toBeLessThanOrEqual(2);
  });

  it('drops optional expensive lanes under a tight budget without dropping semantic', () => {
    const plan = selectRecommendationLanes(
      {
        ...generous,
        maxLatencyMs: 20,
        maxToolCalls: 0,
        maxContextTokens: 100,
        maxGpuBytes: 0,
        maxGraphHops: 0,
      },
      defaultLaneEstimates({ queryKind: 'lookup' }),
    );

    expect(plan.selected).toContain('semantic');
    expect(plan.selected).not.toContain('hypergraph');
    expect(plan.selected).not.toContain('hypersphere');
  });

  it('is deterministic for identical budgets and estimates', () => {
    const estimates = defaultLaneEstimates({ queryKind: 'graph_reasoning' });
    const a = selectRecommendationLanes(generous, estimates);
    const b = selectRecommendationLanes(generous, estimates);
    expect(a).toEqual(b);
  });
});
