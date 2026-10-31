import { describe, it, expect } from 'vitest';
import {
  calculateRecallAtK,
  calculateNdcgAtK,
  calculatePercentile,
  TournamentFsm,
  runRetrievalTournamentV1,
  STANDARD_FIGHTERS,
  type RetrievalBenchmarkQuery,
  type CompetitorQueryResult,
  type FighterId,
} from './retrieval-tournament-evaluator-v1.js';

describe('retrieval-tournament-evaluator-v1', () => {
  describe('metrics calculations', () => {
    it('calculates recall@k correctly', () => {
      const retrieved = ['doc1', 'doc2', 'doc3', 'doc4', 'doc5'];
      const groundTruth = ['doc2', 'doc5', 'doc9'];

      // In top 3: only doc2 is present => 1 / 3 = 0.333...
      const r3 = calculateRecallAtK(retrieved, groundTruth, 3);
      expect(r3).toBeCloseTo(0.333, 2);

      // In top 5: doc2 and doc5 are present => 2 / 3 = 0.666...
      const r5 = calculateRecallAtK(retrieved, groundTruth, 5);
      expect(r5).toBeCloseTo(0.667, 2);
    });

    it('calculates nDCG@k correctly', () => {
      const groundTruth = ['doc1', 'doc2'];
      // Perfect order
      const perfect = ['doc1', 'doc2', 'doc3'];
      expect(calculateNdcgAtK(perfect, groundTruth, 3)).toBe(1.0);

      // Reversed order
      const reversed = ['doc2', 'doc1', 'doc3'];
      expect(calculateNdcgAtK(reversed, groundTruth, 3)).toBe(1.0);

      // Slower retrieval (rank 2 and 3)
      const subOptimal = ['docX', 'doc1', 'doc2'];
      const ndcg = calculateNdcgAtK(subOptimal, groundTruth, 3);
      expect(ndcg).toBeGreaterThan(0);
      expect(ndcg).toBeLessThan(1.0);
    });

    it('calculates percentiles accurately', () => {
      const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      expect(calculatePercentile(latencies, 50)).toBe(50);
      expect(calculatePercentile(latencies, 90)).toBe(90);
      expect(calculatePercentile(latencies, 95)).toBe(100);
    });
  });

  describe('TournamentFsm', () => {
    it('enforces deterministic lifecycle transitions', () => {
      const fsm = new TournamentFsm();
      expect(fsm.state).toBe('REGISTERED');

      fsm.transitionTo('VALIDATED');
      expect(fsm.state).toBe('VALIDATED');

      fsm.transitionTo('CPU_VS_CPU');
      expect(fsm.state).toBe('CPU_VS_CPU');

      fsm.transitionTo('EVALUATED');
      expect(fsm.state).toBe('EVALUATED');

      fsm.transitionTo('SHADOW_CHALLENGER');
      expect(fsm.state).toBe('SHADOW_CHALLENGER');

      fsm.transitionTo('HUMAN_REVIEW');
      expect(fsm.state).toBe('HUMAN_REVIEW');

      fsm.transitionTo('PROMOTED');
      expect(fsm.state).toBe('PROMOTED');

      expect(fsm.history.length).toBe(6);
    });

    it('rejects invalid state transitions', () => {
      const fsm = new TournamentFsm();
      expect(() => fsm.transitionTo('CPU_VS_CPU')).toThrowError(/INVALID_FSM_TRANSITION/);
    });
  });

  describe('runRetrievalTournamentV1', () => {
    const queries: RetrievalBenchmarkQuery[] = [
      {
        queryId: 'q1',
        queryText: 'fourth amendment exclusionary rule',
        domain: 'constitutional_criminal',
        groundTruthCandidateIds: ['cand_c1', 'cand_c2'],
      },
      {
        queryId: 'q2',
        queryText: 'contractual indemnity breach of warranty',
        domain: 'commercial_contracts',
        groundTruthCandidateIds: ['cand_k1', 'cand_k2', 'cand_k3'],
      },
    ];

    const generateMockResults = (
      qualityMultiplier: number,
      baseLatency: number
    ): CompetitorQueryResult[] => [
      {
        queryId: 'q1',
        retrievedCandidateIds: qualityMultiplier > 0.8 ? ['cand_c1', 'cand_c2', 'other'] : ['other', 'cand_c1'],
        scores: [0.95, 0.88, 0.4],
        latencyMs: baseLatency,
        memoryBytesEstimate: 1024 * 64,
      },
      {
        queryId: 'q2',
        retrievedCandidateIds: qualityMultiplier > 0.8 ? ['cand_k1', 'cand_k2', 'cand_k3'] : ['cand_k1', 'other'],
        scores: [0.91, 0.89, 0.85],
        latencyMs: baseLatency * 1.1,
        memoryBytesEstimate: 1024 * 64,
      },
    ];

    it('evaluates all 5 competitors and selects the tournament winner', () => {
      const fighterQueryResults: Record<FighterId, CompetitorQueryResult[]> = {
        fighter_a_pg_lexical: generateMockResults(0.7, 12.0),
        fighter_b_dense_vector: generateMockResults(0.85, 25.0),
        fighter_c_avx2_hamming: generateMockResults(0.6, 1.5),
        fighter_d_graphrag_csr: generateMockResults(0.75, 18.0),
        fighter_e_hybrid_rrf: generateMockResults(0.95, 28.0),
      };

      const receipt = runRetrievalTournamentV1({
        tournamentId: 'tourn_parent_atlas_2026_01',
        workspaceRevision: 'git_rev_abc123',
        benchmarkQueries: queries,
        fighterQueryResults,
        slaTargetMs: 50.0,
        approvalDecision: {
          approved: true,
          approvedBy: 'operator@deeds-atlas.internal',
        },
      });

      expect(receipt.schema).toBe('atlas.retrieval-tournament-receipt.v1');
      expect(receipt.receiptChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(receipt.competitors.length).toBe(5);
      expect(receipt.metrics.length).toBe(5);
      expect(receipt.matchups.length).toBe(10); // 5 choose 2 = 10 matchups

      // Hybrid RRF (Fighter E) has highest quality and lane weight
      expect(receipt.winnerFighterId).toBe('fighter_e_hybrid_rrf');
      expect(receipt.winnerMetrics.passedSla).toBe(true);
      expect(receipt.canPromote).toBe(true);
      expect(receipt.reviewStatus).toBe('APPROVED');
      expect(receipt.reviewedBy).toBe('operator@deeds-atlas.internal');
      expect(receipt.fsmFinalState).toBe('PROMOTED');

      // Check Parent Atlas invariants
      expect(receipt.writesPerformed).toBe(false);
      expect(receipt.canonicalStoreMutated).toBe(false);
    });

    it('rejects promotion if winner breaches SLA', () => {
      const fighterQueryResults: Record<FighterId, CompetitorQueryResult[]> = {
        fighter_a_pg_lexical: generateMockResults(0.5, 80.0),
        fighter_b_dense_vector: generateMockResults(0.5, 90.0),
        fighter_c_avx2_hamming: generateMockResults(0.5, 70.0),
        fighter_d_graphrag_csr: generateMockResults(0.5, 85.0),
        fighter_e_hybrid_rrf: generateMockResults(0.5, 95.0),
      };

      const receipt = runRetrievalTournamentV1({
        tournamentId: 'tourn_parent_atlas_sla_fail',
        workspaceRevision: 'git_rev_xyz789',
        benchmarkQueries: queries,
        fighterQueryResults,
        slaTargetMs: 20.0, // Strict SLA
        approvalDecision: {
          approved: true,
          approvedBy: 'operator@deeds-atlas.internal',
        },
      });

      expect(receipt.winnerMetrics.passedSla).toBe(false);
      expect(receipt.canPromote).toBe(false);
      expect(receipt.fsmFinalState).toBe('REJECTED');
    });
  });
});
