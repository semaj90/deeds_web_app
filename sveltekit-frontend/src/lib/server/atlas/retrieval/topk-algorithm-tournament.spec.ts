import { describe, expect, it } from 'vitest';
import {
  computeTournamentMetrics,
  nominateTopKTournamentChampion,
  rankTopKTournament,
  scoreTopKTournamentRun,
  type TopKQueryTournamentCaseV1,
  type TopKTournamentContestantV1,
  type TopKTournamentReferenceV1,
  type TopKTournamentRunObservationV1,
  type TopKTournamentScoringPolicyV1,
} from './topk-algorithm-tournament.js';

const tc: TopKQueryTournamentCaseV1 = {
  schema: 'atlas.topk-query-tournament-case.v1',
  queryId: 'q1',
  queryClass: 'CODE_REPAIR',
  domainClass: 'typescript',
  scenario: 'LOW_VRAM',
  k: 3,
  workspaceRevision: '742',
  graphRevision: '338',
  representationRevision: 'semantic-768-r1',
  resourceEnvelope: {
    maxLatencyMs: 20,
    maxPeakVramBytes: 512 * 1024 * 1024,
    maxHostMemoryBytes: 2 * 1024 * 1024 * 1024,
    maxBytesMoved: 128 * 1024 * 1024,
    maxToolCalls: 2,
  },
  mutationSensitive: true,
  producerRevision: 'test',
};

const reference: TopKTournamentReferenceV1 = {
  schema: 'atlas.topk-tournament-reference.v1',
  queryId: 'q1',
  k: 3,
  exactNeighborCanonicalIds: ['A', 'B', 'C'],
  relevanceJudgments: [
    { canonicalId: 'A', grade: 4 },
    { canonicalId: 'B', grade: 3 },
    { canonicalId: 'C', grade: 2 },
    { canonicalId: 'D', grade: 1 },
  ],
  exactOracle: 'CUVS_BRUTE_FORCE',
  referenceRevision: 'oracle-1',
};

const policy: TopKTournamentScoringPolicyV1 = {
  schema: 'atlas.topk-tournament-scoring-policy.v1',
  minExactRecallAtK: 2 / 3,
  minNdcgAtK: 0.7,
  requireValidationSuccess: true,
  weights: {
    exactRecall: 4,
    ndcg: 3,
    reciprocalRank: 1,
    cacheUtility: 0.5,
    latencyPenalty: 0.8,
    vramPenalty: 0.6,
    hostMemoryPenalty: 0.2,
    transferPenalty: 0.3,
    toolCallPenalty: 0.2,
  },
  policyRevision: 'policy-1',
};

function contestant(input: Partial<TopKTournamentContestantV1> & Pick<TopKTournamentContestantV1, 'contestantId' | 'algorithmId'>): TopKTournamentContestantV1 {
  return {
    contestantId: input.contestantId,
    family: 'SEMANTIC_EXECUTOR',
    algorithmId: input.algorithmId,
    logicalLane: 'semantic',
    executorId: input.executorId ?? input.algorithmId.toLowerCase(),
    implementationRevision: input.implementationRevision ?? 'impl-1',
    parameterRevision: input.parameterRevision ?? 'params-1',
    parameterChecksumSha256: input.parameterChecksumSha256 ?? null,
    exactness: input.exactness ?? 'APPROXIMATE',
    exactPromotionStillRequired: input.exactPromotionStillRequired ?? true,
  };
}

function run(contestantId: string, ids: string[], latencyMs: number, vram: number): TopKTournamentRunObservationV1 {
  return {
    schema: 'atlas.topk-tournament-run.v1',
    queryId: 'q1',
    contestantId,
    resultCanonicalIds: ids,
    latencyMs,
    peakVramBytes: vram,
    peakHostMemoryBytes: 512 * 1024 * 1024,
    bytesMoved: 32 * 1024 * 1024,
    cacheHitRatio: 0.5,
    toolCalls: 0,
    validationSuccess: true,
    executionReceiptRefs: ['receipt-1'],
  };
}

describe('top-K algorithm tournament', () => {
  it('computes exact recall, graded nDCG and reciprocal rank', () => {
    const metrics = computeTournamentMetrics({ run: run('cagra', ['A', 'C', 'D'], 4, 64), reference });
    expect(metrics.exactRecallAtK).toBeCloseTo(2 / 3);
    expect(metrics.ndcgAtK).toBeGreaterThan(0.7);
    expect(metrics.reciprocalRank).toBe(1);
  });

  it('makes quality constraints hard gates before cost utility', () => {
    const bad = scoreTopKTournamentRun({
      tournamentCase: tc,
      contestant: contestant({ contestantId: 'fast-bad', algorithmId: 'CUVS_CAGRA' }),
      run: run('fast-bad', ['X', 'Y', 'Z'], 0.1, 1),
      reference,
      policy,
    });
    expect(bad.eligible).toBe(false);
    expect(bad.violations).toContain('MIN_EXACT_RECALL');
    expect(bad.violations).toContain('MIN_NDCG');
  });

  it('ranks eligible challengers by quality/resource utility rather than raw latency only', () => {
    const contestants = [
      contestant({ contestantId: 'exact', algorithmId: 'CUVS_BRUTE_FORCE', exactness: 'EXACT', exactPromotionStillRequired: false }),
      contestant({ contestantId: 'cagra', algorithmId: 'CUVS_CAGRA' }),
    ];
    const ranking = rankTopKTournament({
      tournamentCase: tc,
      contestants,
      runs: [
        run('exact', ['A', 'B', 'C'], 18, 400 * 1024 * 1024),
        run('cagra', ['A', 'B', 'C'], 4, 100 * 1024 * 1024),
      ],
      reference,
      policy,
    });
    expect(ranking[0].contestantId).toBe('cagra');
    expect(ranking[0].eligible).toBe(true);
  });

  it('never promotes an approximate mutation-sensitive champion past shadow without exact promotion', () => {
    const champion = scoreTopKTournamentRun({
      tournamentCase: tc,
      contestant: contestant({ contestantId: 'cagra', algorithmId: 'CUVS_CAGRA' }),
      run: run('cagra', ['A', 'B', 'C'], 3, 64 * 1024 * 1024),
      reference,
      policy,
    });
    const promotion = nominateTopKTournamentChampion({
      tournamentCase: tc,
      ranking: [champion],
      policyRevision: 'policy-1',
      producerRevision: 'test',
      allowProductionRole: true,
    });
    expect(promotion.promotionRole).toBe('SHADOW_ONLY');
    expect(promotion.exactPromotionPreserved).toBe(true);
  });

  it('permits production nomination only for an eligible exact champion while still requiring held-out proof and rollback', () => {
    const exactContestant = contestant({
      contestantId: 'exact', algorithmId: 'CUVS_BRUTE_FORCE', exactness: 'EXACT', exactPromotionStillRequired: false,
    });
    const champion = scoreTopKTournamentRun({
      tournamentCase: { ...tc, mutationSensitive: false },
      contestant: exactContestant,
      run: run('exact', ['A', 'B', 'C'], 5, 64 * 1024 * 1024),
      reference,
      policy,
    });
    const promotion = nominateTopKTournamentChampion({
      tournamentCase: { ...tc, mutationSensitive: false },
      ranking: [champion],
      policyRevision: 'policy-1',
      producerRevision: 'test',
      allowProductionRole: true,
    });
    expect(promotion.promotionRole).toBe('PRODUCTION_CHAMPION');
    expect(promotion.heldOutProofRequired).toBe(true);
    expect(promotion.rollbackRequired).toBe(true);
  });
});
