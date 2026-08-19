import { describe, expect, it } from 'vitest';
import {
  analyzeCuvsParetoFrontier,
  buildAdaptiveSearchPlan,
  buildSearchPolicyFeatureMatrix,
  buildTangPromotionRecommendation,
  inferSearchIntents,
} from './adaptive-search-policy.js';

describe('adaptive-search-policy', () => {
  const input = {
    schema: 'atlas.adaptive-search-input.v1' as const,
    requestId: 'req-1',
    queryText: 'find callers and semantic nearest neighbors with pagerank community context',
    workspaceRevision: '742',
    graphRevision: '338',
    featureRevision: '109',
    graphWeighted: false,
    sourceNodeKnown: true,
    targetNodeKnown: false,
    candidateCount: 250_000,
    filteredFraction: 0.1,
    budget: {
      maxGraphHops: 4,
      maxGraphFanout: 128,
      maxCandidates: 250_000,
      topK: 64,
      queryBatchSize: 1,
      latencyBudgetMs: 200,
      contextTokenBudget: 16_000,
      exactPromotionTopK: 128,
    },
    matrixDiagnostics: null,
    producerRevision: 'test',
  };

  it('maps query shape to multiple bounded algorithms without extra lane votes', () => {
    const plan = buildAdaptiveSearchPlan(input);
    expect(plan.intents).toContain('STRUCTURAL_EXPANSION');
    expect(plan.intents).toContain('VECTOR_FAST');
    expect(plan.intents).toContain('AUTHORITY');
    expect(plan.intents).toContain('COMMUNITY');
    expect(plan.recommendations.some((row) => row.algorithm === 'CUVS_CAGRA')).toBe(true);
    expect(plan.recommendations.some((row) => row.algorithm === 'CUVS_BRUTE_FORCE' && row.exactOracle)).toBe(true);
    expect(plan.recommendations.every((row) => row.independentLaneVote === false)).toBe(true);
    expect(plan.laneVoteInvariant).toBe('ONE_VOTE_PER_LOGICAL_LANE');
    expect(plan.graphNeverAnswersDirectly).toBe(true);
  });

  it('distinguishes Atlas JSON artifact from current cuVS Bench YAML authoring', () => {
    const plan = buildAdaptiveSearchPlan(input);
    expect(plan.cuvsBench.atlasArtifactFormat).toBe('JSON');
    expect(plan.cuvsBench.officialCuvsBenchAuthoringFormat).toBe('YAML');
    expect(plan.cuvsBench.exactOracle.required).toBe(true);
  });

  it('uses measured low-rank diagnostics before recommending Tang-style promotion', () => {
    const rows = [[1, 0], [0.5, 0], [0.1, 0]];
    const absent = buildTangPromotionRecommendation({ packetKeys: ['a', 'b', 'c'], matrixRows: rows, diagnostics: null });
    expect(absent.status).toBe('MEASURE_FIRST');
    expect(absent.selectedPacketKeys).toEqual([]);

    const eligible = buildTangPromotionRecommendation({
      packetKeys: ['a', 'b', 'c'],
      matrixRows: rows,
      diagnostics: {
        rowCount: 3,
        columnCount: 4,
        effectiveRank: 1,
        retainedRank: 1,
        retainedEnergyPercent: 95,
        conditionNumber: 10,
        measured: true,
      },
      policy: {
        maxEffectiveRankRatio: 0.35,
        minRetainedEnergyPercent: 80,
        maxConditionNumber: 100,
        promotionCount: 2,
      },
    });
    expect(eligible.status).toBe('ELIGIBLE');
    expect(eligible.rows[0].packetKey).toBe('a');
    expect(eligible.rows[0].samplingProbability).toBeGreaterThan(eligible.rows[1].samplingProbability);
    expect(eligible.selectedPacketKeys).toEqual(['a', 'b']);
    expect(eligible.canonicalWritesAllowed).toBe(false);
  });

  it('builds the canonical 9 features plus 7 policy features', () => {
    const matrix = buildSearchPolicyFeatureMatrix({
      baseRows: [{
        packetKey: 'p1', semanticScore: 0.9, centroidAffinity: 0.8, quaternionAffinity: 0.7,
        graphAuthority: 0.6, demandUtility: 0.5, executionUtility: 0.4, recency: 0.3,
        cacheHotness: 0.2, normalizedCost: 0.1,
      }],
      policyRows: [{
        packetKey: 'p1', hopProximity: 1, pathCostUtility: 0.9, communityOverlap: 0.8,
        pprAffinity: 0.7, contextWindowUtility: 0.6, tangPromotionProbability: 0.5, exactEvidence: 1,
      }],
    });
    expect(matrix.rows).toBe(1);
    expect(matrix.cols).toBe(16);
    expect(matrix.canonicalBaseFeatureCount).toBe(9);
    expect(matrix.policyFeatureCount).toBe(7);
  });

  it('computes Pareto frontiers without retaining dominated configs', () => {
    const result = analyzeCuvsParetoFrontier([
      { configId: 'a', recall: 0.9, latencyMs: 2, qps: 500 },
      { configId: 'b', recall: 0.95, latencyMs: 3, qps: 400 },
      { configId: 'dominated', recall: 0.85, latencyMs: 4, qps: 300 },
    ]);
    expect(result.recallLatencyFrontier.map((row) => row.configId)).not.toContain('dominated');
    expect(result.recallQpsFrontier.map((row) => row.configId)).not.toContain('dominated');
  });

  it('infers exact and filtered vector intents', () => {
    const intents = inferSearchIntents('exact filtered nearest neighbor oracle', { filteredFraction: 0.95 });
    expect(intents).toContain('VECTOR_EXACT');
    expect(intents).toContain('FILTERED_VECTOR');
    expect(intents).toContain('VECTOR_FAST');
  });
});
