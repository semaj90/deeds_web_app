import { describe, it, expect } from 'vitest';
import { RawObservationSchema } from '$lib/server/unknown/observation-ingester';

// Phase 109 Stage 1 Contract Validation Tests
// These tests validate the Zod schema contract and input validation without database dependencies.
// Database integration will be proven in APPLY_PROVEN stage after test suite passes.

describe('Phase 109 Stage 1: Observation Ingestion Contract', () => {
  const testWorkspaceId = 'test-workspace-001';

  describe('RawObservation Zod schema validation', () => {
    it('Test 1: Valid scanner observation passes schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:001',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/lib/server/auth.ts',
        potential_feature_id: 'auth.sessions',
        potential_feature_label: 'Session validation',
        source_kind: 'scanner',
        evidence_payload: { scanner_version: '1.0' }
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
    });

    it('Test 2: Valid LDR observation passes schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:002',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/lib/server/db/client.ts',
        source_kind: 'ldr'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
    });

    it('Test 3: Valid user_submission observation passes schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:003',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/routes/+page.svelte',
        potential_feature_label: 'Homepage component',
        source_kind: 'user_submission'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
    });

    it('Test 4: Valid edge_case observation passes schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:004',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/lib/components/ui/Button.svelte',
        source_kind: 'edge_case'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
    });

    it('Test 5: Minimal valid observation (required fields only)', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:005',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/minimal.ts',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
    });
  });

  describe('Identity validation failures', () => {
    it('Test 6: Missing observation_id fails schema', () => {
      const obs = {
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/test.ts',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(false);
    });

    it('Test 7: Empty observation_id fails schema', () => {
      const obs = {
        observation_id: '',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/test.ts',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(false);
    });

    it('Test 8: Missing workspace_id fails schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:008',
        potential_source_ref: 'src/test.ts',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(false);
    });

    it('Test 9: Empty workspace_id fails schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:009',
        workspace_id: '',
        potential_source_ref: 'src/test.ts',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(false);
    });

    it('Test 10: Missing potential_source_ref fails schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:010',
        workspace_id: testWorkspaceId,
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(false);
    });

    it('Test 11: Empty potential_source_ref fails schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:011',
        workspace_id: testWorkspaceId,
        potential_source_ref: '',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(false);
    });

    it('Test 12: Invalid source_kind fails schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:012',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/test.ts',
        source_kind: 'invalid_source'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(false);
    });
  });

  describe('Path normalization and optional fields', () => {
    it('Test 13: Windows absolute path accepted by schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:013',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'C:\\Users\\project\\src\\lib\\auth.ts',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
    });

    it('Test 14: Windows relative path accepted by schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:014',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src\\lib\\components\\Button.svelte',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
    });

    it('Test 15: POSIX path accepted by schema', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:015',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/lib/components/Button.svelte',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
    });
  });

  describe('Optional fields handling', () => {
    it('Test 16: Optional potential_feature_id accepted', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:016',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/test.ts',
        potential_feature_id: 'test.feature',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.potential_feature_id).toBe('test.feature');
      }
    });

    it('Test 17: Optional potential_feature_label accepted', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:017',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/test.ts',
        potential_feature_label: 'Test Feature Label',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.potential_feature_label).toBe('Test Feature Label');
      }
    });

    it('Test 18: Optional evidence_payload accepted', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:018',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/test.ts',
        evidence_payload: { custom_field: 'value', number: 42 },
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.evidence_payload).toEqual({ custom_field: 'value', number: 42 });
      }
    });

    it('Test 19: All optional fields together', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:019',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/complete.ts',
        potential_feature_id: 'complete.feature',
        potential_feature_label: 'Complete Feature',
        evidence_payload: { stage: 'testing', confidence: 0.95 },
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.potential_feature_id).toBe('complete.feature');
        expect(result.data.potential_feature_label).toBe('Complete Feature');
        expect(result.data.evidence_payload).toEqual({ stage: 'testing', confidence: 0.95 });
      }
    });
  });

  describe('Schema edge cases', () => {
    it('Test 20: observation_id with special characters', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:special-chars_001-v2',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/test.ts',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
    });

    it('Test 21: Long observation_id accepted', () => {
      const longId = 'obs:' + 'x'.repeat(200);
      const obs = {
        observation_id: longId,
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/test.ts',
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
    });

    it('Test 22: All source_kind values accepted', () => {
      const sourceKinds = ['scanner', 'ldr', 'user_submission', 'edge_case'];

      for (const sourceKind of sourceKinds) {
        const obs = {
          observation_id: `obs:2026-07-26:test:${sourceKind}`,
          workspace_id: testWorkspaceId,
          potential_source_ref: 'src/test.ts',
          source_kind: sourceKind
        };

        const result = RawObservationSchema.safeParse(obs);
        expect(result.success).toBe(true);
      }
    });

    it('Test 23: Complex evidence_payload structure', () => {
      const obs = {
        observation_id: 'obs:2026-07-26:test:023',
        workspace_id: testWorkspaceId,
        potential_source_ref: 'src/test.ts',
        evidence_payload: {
          nested: {
            level1: {
              level2: ['array', 'of', 'values']
            }
          },
          number: 42,
          boolean: true,
          null_field: null
        },
        source_kind: 'scanner'
      };

      const result = RawObservationSchema.safeParse(obs);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.evidence_payload?.nested?.level1?.level2).toEqual(['array', 'of', 'values']);
      }
    });
  });
});
