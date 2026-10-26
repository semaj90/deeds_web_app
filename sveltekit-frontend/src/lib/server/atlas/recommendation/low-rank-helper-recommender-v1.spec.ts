import { describe, expect, it } from 'vitest';
import {
  recommendHelpersWithinContextBudgetV1,
  recommendHelpersV1,
  type LowRankHelperArtifactV1,
} from './low-rank-helper-recommender-v1.js';

const artifact: LowRankHelperArtifactV1 = {
  schema: 'parent-atlas.low-rank-helper-artifact.v1',
  artifactRevision: 'helpers:r1',
  rank: 2,
  taskFactors: [{ taskFamily: 'atlas-navigation', factors: [1, 0] }],
  helperFactors: [
    { helperId: 'inspect-source', factors: [1, 0], successRate: 0.9, validationRate: 1, medianLatencyMs: 20, medianContextTokens: 300 },
    { helperId: 'expand-graph', factors: [0.8, 0], successRate: 0.8, validationRate: 1, medianLatencyMs: 30, medianContextTokens: 250 },
    { helperId: 'unrelated', factors: [0, 1], successRate: 0.7, validationRate: 0.9, medianLatencyMs: 10, medianContextTokens: 100 },
  ],
  trainingReceiptRefs: ['receipt:reviewed-fixture'],
};

describe('Parent Atlas low-rank advisory recommendations', () => {
  it('uses exact rank dimensions and refuses malformed factor vectors', () => {
    expect(recommendHelpersV1({ artifact, taskFamily: 'atlas-navigation', allowedHelpers: ['inspect-source'] })).toHaveLength(1);
    expect(() => recommendHelpersV1({
      artifact: { ...artifact, helperFactors: [{ ...artifact.helperFactors[0]!, factors: [1] }] },
      taskFamily: 'atlas-navigation',
      allowedHelpers: ['inspect-source'],
    })).toThrow(/LOW_RANK_HELPER_DIMENSION_MISMATCH/);
  });

  it('returns deterministic allowed suggestions within a hard token budget', () => {
    const result = recommendHelpersWithinContextBudgetV1({
      artifact,
      taskFamily: 'atlas-navigation',
      allowedHelpers: ['inspect-source', 'expand-graph', 'unrelated'],
      tokenBudget: 350,
      maxHelpers: 3,
    });
    expect(result.recommendations.map((item) => item.helperId)).toEqual(['inspect-source']);
    expect(result.estimatedSelectedTokens).toBe(300);
    expect(result.estimatedSelectedTokens).toBeLessThanOrEqual(result.tokenBudget);
    expect(result.status).toBe('ADVISORY');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects invalid budgets and does not recommend disallowed helpers', () => {
    expect(() => recommendHelpersWithinContextBudgetV1({ artifact, taskFamily: 'atlas-navigation', allowedHelpers: [], tokenBudget: -1 })).toThrow('LOW_RANK_TOKEN_BUDGET_INVALID');
    const result = recommendHelpersWithinContextBudgetV1({ artifact, taskFamily: 'atlas-navigation', allowedHelpers: ['unrelated'], tokenBudget: 100 });
    expect(result.recommendations.map((item) => item.helperId)).toEqual(['unrelated']);
  });
});
