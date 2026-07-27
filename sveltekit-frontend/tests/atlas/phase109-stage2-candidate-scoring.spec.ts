import { describe, it, expect } from 'vitest';
import { CandidateScorer, CandidateScoreSchema } from '$lib/server/unknown/candidate-scorer';

describe('Phase 109 Stage 2: Candidate Scoring', () => {
  const scorer = new CandidateScorer();
  const baseTestId = 'obs:2026-07-26:test';

  describe('Identity scoring', () => {
    it('Test 1: Full identity fields score high', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:abc123',
        `${baseTestId}:001`,
        'test-workspace',
        'src/lib/server/auth.ts',
        'auth.sessions',
        { confidence: 0.95 }
      );
      expect(result.overall_result).toBe('PASS');
      expect(result.scores.identity_score).toBeGreaterThan(0.7);
      expect(result.scores.combined_score).toBeGreaterThan(0.5);
    });

    it('Test 2: Minimal identity fields score lower', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:ldr:xyz789',
        `${baseTestId}:002`,
        'ws',
        'lib.ts'
      );
      expect(result.overall_result).toBe('PASS');
      expect(result.scores.identity_score).toBeLessThan(0.75);
    });

    it('Test 3: obs: prefix bonus', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:def456',
        `${baseTestId}:003`,
        'workspace-id',
        'src/test.ts'
      );
      expect(result.scores.identity_score).toBeGreaterThan(0.75);
    });
  });

  describe('Semantic scoring', () => {
    it('Test 4: Feature ID present boosts semantic', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:ghi012',
        `${baseTestId}:004`,
        'ws',
        'src/lib/test.ts',
        'test.feature'
      );
      expect(result.scores.semantic_score).toBeGreaterThan(0.7);
    });

    it('Test 5: Feature ID + payload boost semantic further', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:jkl345',
        `${baseTestId}:005`,
        'ws',
        'src/lib/test.ts',
        'test.feature',
        { key1: 'value1', key2: 'value2', key3: 'value3' }
      );
      expect(result.scores.semantic_score).toBeGreaterThan(0.75);
    });

    it('Test 6: No semantic metadata scores lower', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:mno678',
        `${baseTestId}:006`,
        'ws',
        'src/lib/test.ts'
      );
      expect(result.scores.semantic_score).toBeLessThanOrEqual(0.6);
    });
  });

  describe('Source scoring', () => {
    it('Test 7: Conventional path boosts source score', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:pqr901',
        `${baseTestId}:007`,
        'ws',
        'src/lib/server/auth.ts'
      );
      expect(result.scores.source_score).toBeGreaterThan(0.8);
    });

    it('Test 8: Routes path scores well', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:stu234',
        `${baseTestId}:008`,
        'ws',
        'src/routes/api/test/+server.ts'
      );
      expect(result.scores.source_score).toBeGreaterThan(0.8);
    });

    it('Test 9: Script path scores well', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:vwx567',
        `${baseTestId}:009`,
        'ws',
        'scripts/atlas/test-audit.mjs'
      );
      expect(result.scores.source_score).toBeGreaterThan(0.8);
    });

    it('Test 10: File extension bonus', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:yza890',
        `${baseTestId}:010`,
        'ws',
        'src/test.svelte'
      );
      expect(result.scores.source_score).toBeGreaterThan(0.5);
    });

    it('Test 11: Malformed path penalized', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:bcd123',
        `${baseTestId}:011`,
        'ws',
        'x'
      );
      expect(result.scores.source_score).toBeLessThan(0.5);
    });
  });

  describe('Topology scoring', () => {
    it('Test 12: Workspace + feature linkage score high', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:efg456',
        `${baseTestId}:012`,
        'project-001',
        'src/lib/auth/sessions.ts',
        'auth.sessions'
      );
      expect(result.scores.topology_score).toBeGreaterThan(0.7);
    });

    it('Test 13: Workspace without feature scores medium', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:hij789',
        `${baseTestId}:013`,
        'project-001',
        'src/lib/test.ts'
      );
      expect(result.scores.topology_score).toBeGreaterThan(0.5);
      expect(result.scores.topology_score).toBeLessThan(0.8);
    });

    it('Test 14: Feature matches source pattern', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:klm012',
        `${baseTestId}:014`,
        'workspace-a',
        'src/lib/validation/rules.ts',
        'validation.rules'
      );
      expect(result.scores.topology_score).toBeGreaterThan(0.65);
    });
  });

  describe('Freshness scoring', () => {
    it('Test 15: Freshness remains neutral until timestamps are wired', () => {
      const gate = scorer['scoreFreshness']();
      expect(gate.result).toBe('WARN');
      expect(gate.description).toContain('0.50');
    });
  });

  describe('Composite scoring', () => {
    it('Test 16: Composite blend formula correct', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:nop345',
        `${baseTestId}:016`,
        'workspace-id',
        'src/lib/server/auth.ts',
        'auth.sessions',
        { level: 3 }
      );
      expect(result.overall_result).toBe('PASS');
      // Composite = identity(0.25) + semantic(0.2) + source(0.2) + topology(0.2) + freshness(0.15)
      const expected =
        result.scores.identity_score * 0.25 +
        result.scores.semantic_score * 0.2 +
        result.scores.source_score * 0.2 +
        result.scores.topology_score * 0.2 +
        result.scores.freshness_score * 0.15;
      expect(Math.abs(result.scores.combined_score - expected)).toBeLessThan(0.01);
    });

    it('Test 17: Score range 0-1 enforced', () => {
      const result = scorer.scoreObservationPure(
        'unknown:2026-07-26:scanner:qrs678',
        `${baseTestId}:017`,
        'ws',
        'src/lib/server/db.ts'
      );
      expect(result.scores.identity_score).toBeGreaterThanOrEqual(0);
      expect(result.scores.identity_score).toBeLessThanOrEqual(1);
      expect(result.scores.combined_score).toBeGreaterThanOrEqual(0);
      expect(result.scores.combined_score).toBeLessThanOrEqual(1);
    });
  });

  describe('Batch scoring (pure)', () => {
    it('Test 18: Batch process multiple observations', () => {
      const observations = [
        {
          unknown_id: 'unknown:2026-07-26:scanner:tuv901',
          observation_id: `${baseTestId}:018a`,
          workspace_id: 'ws',
          potential_source_ref: 'src/lib/test.ts',
          potential_feature_id: 'test.feature',
          evidence_payload: { key: 'value' },
        },
        {
          unknown_id: 'unknown:2026-07-26:scanner:wxy234',
          observation_id: `${baseTestId}:018b`,
          workspace_id: 'ws',
          potential_source_ref: 'src/routes/api/test.ts',
        },
      ];
      // Use pure scoring for batch to avoid DB I/O
      const results = observations.map(obs => scorer.scoreObservationPure(
        obs.unknown_id,
        obs.observation_id,
        obs.workspace_id,
        obs.potential_source_ref,
        obs.potential_feature_id,
        obs.evidence_payload
      ));
      expect(results).toHaveLength(2);
      expect(results.every(r => r.overall_result === 'PASS')).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('Test 19: Stats calculation', () => {
      const observations = [
        {
          unknown_id: 'unknown:2026-07-26:scanner:zab567',
          observation_id: `${baseTestId}:019a`,
          workspace_id: 'ws1',
          potential_source_ref: 'src/lib/auth.ts',
        },
        {
          unknown_id: 'unknown:2026-07-26:scanner:cde890',
          observation_id: `${baseTestId}:019b`,
          workspace_id: 'ws2',
          potential_source_ref: 'src/lib/db.ts',
        },
      ];
      const results = observations.map(obs => scorer.scoreObservationPure(
        obs.unknown_id,
        obs.observation_id,
        obs.workspace_id,
        obs.potential_source_ref
      ));
      const stats = CandidateScorer.getStats(results);
      expect(stats.total).toBe(2);
      expect(stats.passed).toBe(2);
      expect(stats.failed).toBe(0);
      expect(stats.success_rate).toBe(100);
      expect(stats.average_combined_score).toBeGreaterThan(0.4);
    });
  });

  describe('Schema validation', () => {
    it('Test 20: CandidateScoreSchema enforces bounds', () => {
      const validScore = {
        unknown_id: 'test-id',
        identity_score: 0.8,
        semantic_score: 0.75,
        source_score: 0.9,
        topology_score: 0.7,
        freshness_score: 1.0,
        combined_score: 0.82,
      };
      const result = CandidateScoreSchema.safeParse(validScore);
      expect(result.success).toBe(true);

      const invalidScore = {
        unknown_id: 'test-id',
        identity_score: 1.5,
        semantic_score: 0.75,
        source_score: 0.9,
        topology_score: 0.7,
        freshness_score: 1.0,
        combined_score: 0.82,
      };
      const invalidResult = CandidateScoreSchema.safeParse(invalidScore);
      expect(invalidResult.success).toBe(false);
    });
  });
});
