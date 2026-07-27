import { describe, it, expect } from 'vitest';
import { EvidenceValidator, EvidenceProofsSchema } from '$lib/server/unknown/evidence-validator';

describe('Phase 109 Stage 3: Evidence Validator', () => {
  const validator = new EvidenceValidator();
  const baseTestId = 'obs:2026-07-26:test';

  describe('Identity proof gate', () => {
    it('Test 1: Valid workspace + source_ref passes', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:abc123',
        `${baseTestId}:001`,
        'project-001',
        'src/lib/server/auth.ts'
      );
      expect(result.overall_result).toBe('PASS');
      expect(result.proofs.identity_proof).toBe('PASS');
    });

    it('Test 2: Missing workspace_id fails identity', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:xyz789',
        `${baseTestId}:002`,
        '',
        'src/lib/test.ts'
      );
      expect(result.overall_result).toBe('FAIL');
      expect(result.proofs.identity_proof).toBe('FAIL');
      expect(result.status).toBe('REJECTED');
    });

    it('Test 3: Missing source_ref fails identity', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:def456',
        `${baseTestId}:003`,
        'workspace-id',
        ''
      );
      expect(result.overall_result).toBe('FAIL');
      expect(result.proofs.identity_proof).toBe('FAIL');
    });

    it('Test 4: Malformed unknown_id warns identity', () => {
      const result = validator.validateCandidatePure(
        'malformed-id',
        `${baseTestId}:004`,
        'workspace-id',
        'src/lib/test.ts'
      );
      expect(result.proofs.identity_proof).toBe('WARN');
    });
  });

  describe('Semantic proof gate', () => {
    it('Test 5: Feature ID present passes semantic', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:ghi012',
        `${baseTestId}:005`,
        'ws',
        'src/lib/test.ts',
        'test.feature'
      );
      expect(result.proofs.semantic_proof).toBe('PASS');
    });

    it('Test 6: Missing feature_id warns semantic', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:jkl345',
        `${baseTestId}:006`,
        'ws',
        'src/lib/test.ts'
      );
      expect(result.proofs.semantic_proof).toBe('WARN');
    });

    it('Test 7: Feature ID + label passes semantic', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:mno678',
        `${baseTestId}:007`,
        'ws',
        'src/lib/test.ts',
        'test.feature',
        'Test Feature Label'
      );
      expect(result.proofs.semantic_proof).toBe('PASS');
    });

    it('Test 8: Oversized payload warns semantic', () => {
      const largePayload: Record<string, unknown> = {};
      for (let i = 0; i < 150; i++) {
        largePayload[`key_${i}`] = `value_${i}`;
      }
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:pqr901',
        `${baseTestId}:008`,
        'ws',
        'src/lib/test.ts',
        'test.feature',
        undefined,
        largePayload
      );
      expect(result.proofs.semantic_proof).toBe('WARN');
    });

    it('Test 9: Invalid payload structure fails semantic', () => {
      // Pass array instead of object (via type assertion)
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:stu234',
        `${baseTestId}:009`,
        'ws',
        'src/lib/test.ts',
        'test.feature',
        undefined,
        ['array', 'instead', 'of', 'object'] as unknown as Record<string, unknown>
      );
      expect(result.proofs.semantic_proof).toBe('FAIL');
    });
  });

  describe('Topology proof gate', () => {
    it('Test 10: Valid source_ref structure passes topology', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:vwx567',
        `${baseTestId}:010`,
        'ws',
        'src/lib/server/auth.ts',
        undefined,
        undefined,
        undefined,
        'scanner'
      );
      expect(result.proofs.topology_proof).toBe('PASS');
    });

    it('Test 11: Missing path separator fails topology', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:yza890',
        `${baseTestId}:011`,
        'ws',
        'nodashes',
        undefined,
        undefined,
        undefined,
        'scanner'
      );
      expect(result.proofs.topology_proof).toBe('FAIL');
    });

    it('Test 12: Valid source_kind passes topology', () => {
      const validKinds = ['scanner', 'ldr', 'user_submission', 'edge_case'];
      for (const kind of validKinds) {
        const result = validator.validateCandidatePure(
          `unknown:2026-07-26:${kind}:bcd123`,
          `${baseTestId}:012-${kind}`,
          'ws',
          'src/lib/test.ts',
          undefined,
          undefined,
          undefined,
          kind
        );
        expect(result.proofs.topology_proof).toBe('PASS');
      }
    });

    it('Test 13: Invalid source_kind warns topology', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:efg456',
        `${baseTestId}:013`,
        'ws',
        'src/lib/test.ts',
        undefined,
        undefined,
        undefined,
        'invalid_kind'
      );
      expect(result.proofs.topology_proof).toBe('WARN');
    });

    it('Test 14: Windows path separator accepted', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:hij789',
        `${baseTestId}:014`,
        'ws',
        'src\\lib\\test.ts'
      );
      expect(result.proofs.topology_proof).toBe('PASS');
    });
  });

  describe('Lineage proof gate', () => {
    it('Test 15: Feature namespace matches source_ref', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:klm012',
        `${baseTestId}:015`,
        'workspace-a',
        'src/lib/auth/sessions.ts',
        'auth.sessions'
      );
      expect(result.proofs.lineage_proof).toBe('PASS');
    });

    it('Test 16: Feature namespace mismatch warns lineage', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:nop345',
        `${baseTestId}:016`,
        'workspace-a',
        'src/lib/database/query.ts',
        'auth.sessions'
      );
      expect(result.proofs.lineage_proof).toBe('WARN');
    });

    it('Test 17: Workspace length reasonable passes lineage', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:qrs678',
        `${baseTestId}:017`,
        'workspace-valid-length',
        'src/lib/test.ts'
      );
      expect(result.proofs.lineage_proof).toBe('PASS');
    });

    it('Test 18: Workspace too short warns lineage', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:tuv901',
        `${baseTestId}:018`,
        'ws',
        'src/lib/test.ts'
      );
      expect(result.proofs.lineage_proof).toBe('WARN');
    });
  });

  describe('Content proof gate', () => {
    it('Test 19: Valid JSON payload passes content', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:wxy234',
        `${baseTestId}:019`,
        'ws',
        'src/lib/test.ts',
        'test.feature',
        undefined,
        { key: 'value', nested: { level: 2 }, array: [1, 2, 3] }
      );
      expect(result.proofs.content_proof).toBe('PASS');
    });

    it('Test 20: Missing payload warns content', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:zab567',
        `${baseTestId}:020`,
        'ws',
        'src/lib/test.ts',
        'test.feature'
      );
      expect(result.proofs.content_proof).toBe('WARN');
    });
  });

  describe('Hard fail gates', () => {
    it('Test 21: Identity FAIL triggers hard fail', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:cde890',
        `${baseTestId}:021`,
        '',
        'src/lib/test.ts'
      );
      expect(result.overall_result).toBe('FAIL');
      expect(result.status).toBe('REJECTED');
    });

    it('Test 22: Invalid evidence_payload hard fails validation', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:fgh123',
        `${baseTestId}:022`,
        'workspace-a',
        'src/lib/test.ts',
        'test.feature',
        undefined,
        ['not', 'a', 'plain', 'object'] as unknown as Record<string, unknown>
      );
      expect(result.proofs.semantic_proof).toBe('FAIL');
      expect(result.proofs.content_proof).toBe('FAIL');
      expect(result.overall_result).toBe('FAIL');
      expect(result.status).toBe('REJECTED');
    });

    it('Test 23: Soft warns allow validation', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:ijk456',
        `${baseTestId}:023`,
        'ws-short',
        'src/lib/test.ts',
        'database.query'
      );
      expect(result.overall_result).toBe('PASS');
      expect(result.status).toBe('VALIDATED');
      expect(result.gate_results.some(g => g.result === 'WARN')).toBe(true);
    });
  });

  describe('Aggregation and statistics', () => {
    it('Test 24: Overall result aggregation (FAIL wins)', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:lmn789',
        `${baseTestId}:024`,
        '',
        'src/lib/test.ts'
      );
      expect(result.proofs.overall_result).toBe('FAIL');
    });

    it('Test 25: Overall result aggregation (WARN if no FAIL)', () => {
      const result = validator.validateCandidatePure(
        'unknown:2026-07-26:scanner:opq012',
        `${baseTestId}:025`,
        'ws',
        'src/lib/test.ts'
      );
      // Should have WARN from missing feature_id and content
      expect(result.proofs.overall_result).toBe('WARN');
    });

    it('Test 26: Stats calculation', () => {
      const candidates = [
        {
          unknown_id: 'unknown:2026-07-26:scanner:rst345',
          observation_id: `${baseTestId}:026a`,
          workspace_id: 'ws1',
          potential_source_ref: 'src/lib/auth.ts',
          potential_feature_id: 'auth.sessions',
          evidence_payload: { key: 'value' },
        },
        {
          unknown_id: 'unknown:2026-07-26:scanner:uvw678',
          observation_id: `${baseTestId}:026b`,
          workspace_id: 'ws2',
          potential_source_ref: 'src/lib/db.ts',
          potential_feature_id: 'db.query',
        },
      ];
      const results = candidates.map(c =>
        validator.validateCandidatePure(
          c.unknown_id,
          c.observation_id,
          c.workspace_id,
          c.potential_source_ref,
          c.potential_feature_id,
          undefined,
          c.evidence_payload
        )
      );
      const stats = EvidenceValidator.getStats(results);
      expect(stats.total).toBe(2);
      expect(stats.validated).toBeGreaterThanOrEqual(0);
      expect(stats.rejected).toBe(2 - stats.validated);
    });
  });

  describe('Schema validation', () => {
    it('Test 27: EvidenceProofsSchema enforces proof values', () => {
      const validProofs = {
        unknown_id: 'test-id',
        identity_proof: 'PASS' as const,
        semantic_proof: 'WARN' as const,
        topology_proof: 'PASS' as const,
        lineage_proof: 'WARN' as const,
        content_proof: 'PASS' as const,
        overall_result: 'WARN' as const,
      };
      const result = EvidenceProofsSchema.safeParse(validProofs);
      expect(result.success).toBe(true);

      const invalidProofs = {
        unknown_id: 'test-id',
        identity_proof: 'INVALID',
        semantic_proof: 'WARN',
        topology_proof: 'PASS',
        lineage_proof: 'WARN',
        content_proof: 'PASS',
        overall_result: 'WARN',
      };
      const invalidResult = EvidenceProofsSchema.safeParse(invalidProofs);
      expect(invalidResult.success).toBe(false);
    });
  });
});
