// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  defaultLaneEstimates,
  inferRecommendationHintsFromToolArgs,
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

    expect(plan.admissible).toBe(true);
    expect(plan.selected).toContain('semantic');
    expect(plan.selected).toContain('ast');
    expect(plan.selected).toContain('exact_promotion');
  });

  it('prefers hypergraph evidence for graph reasoning when budget permits', () => {
    const plan = selectRecommendationLanes(
      generous,
      defaultLaneEstimates({ queryKind: 'graph_reasoning', requestedGraphHops: 2 }),
    );

    expect(plan.admissible).toBe(true);
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

    expect(plan.admissible).toBe(true);
    expect(plan.selected).toContain('semantic');
    expect(plan.selected).not.toContain('hypergraph');
    expect(plan.selected).not.toContain('hypersphere');
  });

  it('blocks mutation when a required proof lane cannot fit the envelope', () => {
    const plan = selectRecommendationLanes(
      {
        ...generous,
        maxLatencyMs: 25,
        maxToolCalls: 0,
      },
      defaultLaneEstimates({ queryKind: 'file_mutation' }),
    );

    expect(plan.admissible).toBe(false);
    expect(plan.blockingReasons.some((reason) => reason.startsWith('exact_promotion:'))).toBe(true);
    expect(plan.rejected.some((row) => row.reason === 'blocked_by_required_lane')).toBe(true);
  });

  it('enforces maxCandidates as a shared frontier cap, not a per-lane sum', () => {
    const within = selectRecommendationLanes(
      { ...generous, maxCandidates: 20 },
      defaultLaneEstimates({ queryKind: 'graph_reasoning', candidateCount: 20 }),
    );
    expect(within.admissible).toBe(true);
    expect(within.totals.candidateCount).toBe(20);

    const over = selectRecommendationLanes(
      { ...generous, maxCandidates: 19 },
      defaultLaneEstimates({ queryKind: 'lookup', candidateCount: 20 }),
    );
    expect(over.admissible).toBe(false);
    expect(over.blockingReasons).toContain('semantic:candidate_budget_exceeded');
  });

  it('derives structural mutation hints deterministically from existing tool key/value args', () => {
    const hints = inferRecommendationHintsFromToolArgs({
      operation: 'patch',
      filePath: 'src/lib/server/retrieval/search-runtime.ts',
      top_k: 36,
      max_hops: 2,
    });

    expect(hints.queryKind).toBe('file_mutation');
    expect(hints.structuredTarget).toBe(true);
    expect(hints.requiresExactEvidence).toBe(true);
    expect(hints.candidateCount).toBe(36);
    expect(hints.requestedGraphHops).toBe(2);
  });

  it('is deterministic for identical budgets and estimates', () => {
    const estimates = defaultLaneEstimates({ queryKind: 'graph_reasoning' });
    const a = selectRecommendationLanes(generous, estimates);
    const b = selectRecommendationLanes(generous, estimates);
    expect(a).toEqual(b);
  });
});
