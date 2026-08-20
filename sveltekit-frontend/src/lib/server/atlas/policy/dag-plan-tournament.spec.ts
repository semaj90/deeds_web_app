import { describe, expect, it } from 'vitest';
import {
  DagTournamentPlanV1Schema,
  nominateDagTournamentChampion,
  rankDagTournamentPlans,
  scoreDagTournamentPlan,
  type DagTournamentObservationV1,
} from './dag-plan-tournament.js';

const baseStages = [
  ['CLASSIFY', 'classifier'],
  ['RETRIEVE', 'semantic-search'],
  ['HYPERGRAPH_EXPAND', 'hypergraphrag'],
  ['RERANK', 'crossencoder'],
  ['EXACT_PROMOTION', 'exact-promotion'],
  ['ACE_RESIDENCY', 'ace'],
  ['RLM_REUSE', 'rlm'],
  ['SYNTHESIS', 'ornith'],
  ['PREFILL', 'prefill'],
  ['DECODE', 'decode'],
  ['MCP_TOOL', 'mcp'],
  ['VALIDATE', 'validator'],
] as const;

function plan(planId: string, mutationAllowed = false) {
  return DagTournamentPlanV1Schema.parse({
    schema: 'atlas.dag-tournament-plan.v1',
    planId,
    queryClass: 'CODE_REPAIR',
    domainClass: 'typescript',
    hmmPolicyRevision: 'hmm-1',
    dspyPolicyRevision: null,
    learnedPolicyRevision: null,
    stages: [
      ...baseStages.map(([stage, id]) => ({
        stage,
        implementationId: id,
        implementationRevision: 'r1',
        executorId: id,
        enabled: true,
        approximate: stage === 'RETRIEVE' || stage === 'HYPERGRAPH_EXPAND' || stage === 'RERANK',
        expectedCacheTier: stage === 'ACE_RESIDENCY' ? 'VRAM' : stage === 'RLM_REUSE' ? 'VALKEY' : 'NONE',
      })),
      ...(mutationAllowed ? [{
        stage: 'MATERIALIZE' as const,
        implementationId: 'materializer', implementationRevision: 'r1', executorId: 'materializer',
        enabled: true, approximate: false, expectedCacheTier: 'NONE' as const,
      }] : []),
    ],
    exactPromotionRequired: true,
    validationRequired: true,
    mutationAllowed,
    producerRevision: 'test',
  });
}

const constraints = {
  minRetrievalRecallAtK: 0.9,
  minNdcgAtK: 0.8,
  minGroundedAnswerScore: 0.8,
  requireExecutionSuccess: true,
  requireValidatorSuccess: true,
  maxEndToEndMs: 2000,
  maxPeakVramBytes: 6_000_000_000,
  maxPeakHostMemoryBytes: 16_000_000_000,
  maxBytesMoved: 2_000_000_000,
  maxToolCalls: 8,
  maxRetries: 2,
};

const weights = {
  retrievalRecall: 3, ndcg: 2, rerankerGain: 1, groundedAnswer: 4,
  hypergraphGain: 0.5, graphGain: 0.5, cacheUtility: 0.5, rlmReuseUtility: 0.5,
  aceResidencyEfficiency: 0.5, latencyPenalty: 1, vramPenalty: 0.5,
  hostMemoryPenalty: 0.2, transferPenalty: 0.2, tokenPenalty: 0.2,
  toolPenalty: 0.2, retryPenalty: 0.5,
};

function observation(planId: string, overrides: Partial<DagTournamentObservationV1> = {}): DagTournamentObservationV1 {
  return {
    schema: 'atlas.dag-tournament-observation.v1', queryId: 'q1', planId,
    retrievalRecallAtK: 0.97, ndcgAtK: 0.9, rerankerGain: 0.08,
    groundedAnswerScore: 0.94, executionSuccess: true, validatorSuccess: true,
    mutationCorrect: null, cacheHitRatio: 0.6, rlmReuseHit: true,
    aceUsefulResidentBytes: 400, aceLoadedBytes: 500,
    hypergraphEvidenceGain: 0.07, graphEvidenceGain: 0.05,
    prefillMs: 100, decodeMs: 350, endToEndMs: 850,
    peakVramBytes: 3_000_000_000, peakHostMemoryBytes: 4_000_000_000,
    bytesMoved: 400_000_000, modelTokensInput: 10_000, modelTokensOutput: 1_000,
    toolCalls: 2, retries: 0, receiptRefs: ['receipt-1'],
    ...overrides,
  };
}

describe('DAG plan tournament', () => {
  it('requires exact promotion before MCP tool execution', () => {
    const p = plan('ok');
    expect(p.stages.findIndex((s) => s.stage === 'EXACT_PROMOTION')).toBeLessThan(p.stages.findIndex((s) => s.stage === 'MCP_TOOL'));
  });

  it('makes quality and validation hard gates before utility', () => {
    const scored = scoreDagTournamentPlan({
      plan: plan('bad'),
      observation: observation('bad', { retrievalRecallAtK: 0.2, validatorSuccess: false, endToEndMs: 20 }),
      constraints,
      weights,
    });
    expect(scored.eligible).toBe(false);
    expect(scored.violations).toContain('RETRIEVAL_RECALL');
    expect(scored.violations).toContain('VALIDATION_FAILED');
  });

  it('rewards a plan that preserves quality while reducing cache/memory/latency cost', () => {
    const a = plan('a');
    const b = plan('b');
    const ranking = rankDagTournamentPlans({
      plans: [a, b],
      observations: [
        observation('a', { endToEndMs: 1300, cacheHitRatio: 0.1, aceUsefulResidentBytes: 200, aceLoadedBytes: 1000 }),
        observation('b', { endToEndMs: 600, cacheHitRatio: 0.9, aceUsefulResidentBytes: 900, aceLoadedBytes: 1000 }),
      ],
      constraints,
      weights,
    });
    expect(ranking[0].planId).toBe('b');
  });

  it('does not send a mutation-enabled champion directly to production', () => {
    const p = plan('mutating', true);
    const ranking = [scoreDagTournamentPlan({
      plan: p,
      observation: observation('mutating', { mutationCorrect: true }),
      constraints,
      weights,
    })];
    const promotion = nominateDagTournamentChampion({ plans: [p], ranking, producerRevision: 'test', maxRollout: 'PRODUCTION' });
    expect(promotion.rollout).toBe('CANARY');
    expect(promotion.rollbackRequired).toBe(true);
  });
});
