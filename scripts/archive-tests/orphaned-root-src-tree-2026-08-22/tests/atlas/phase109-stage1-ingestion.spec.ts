/**
 * Phase 109 — Stage 1: Observation Ingestion Tests
 * 15 test cases covering identity validation, path normalization, deduplication,
 * and ledger recording.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ObservationIngester, RawObservationSchema } from '$lib/server/unknown/observation-ingester';
import type { RawObservation } from '$lib/server/unknown/observation-ingester';

describe('Phase 109 — Stage 1: Observation Ingestion', () => {
  const ingester = new ObservationIngester();

  // ═══════════════════════════════════════════════════════════════════════════
  // Test 1-5: Valid Observation Ingestion (All Source Kinds)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Valid observation ingestion', () => {
    it('should ingest scanner source kind observation', async () => {
      const obs: RawObservation = {
        observation_id: 'obs:test:scanner:001',
        workspace_id: 'src/lib',
        potential_source_ref: 'src/lib/server/auth.ts',
        potential_feature_id: 'auth.sessions',
        potential_feature_label: 'Session validation',
        source_kind: 'scanner',
      };

      const result = await ingester.ingest(obs);

      expect(result.overall_result).toBe('PASS');
      expect(result.status).toBe('OBSERVATION');
      expect(result.unknown_id).toMatch(/^unknown:\d{4}-\d{2}-\d{2}:scanner:/);
      expect(result.gate_results.length).toBe(5);
      expect(result.gate_results.every(g => g.result === 'PASS')).toBe(true);
    });

    it('should ingest ldr source kind observation', async () => {
      const obs: RawObservation = {
        observation_id: 'obs:test:ldr:001',
        workspace_id: 'src/routes',
        potential_source_ref: 'src/routes/api/evidence/+server.ts',
        source_kind: 'ldr',
      };

      const result = await ingester.ingest(obs);
      expect(result.overall_result).toBe('PASS');
      expect(result.unknown_id).toMatch(/ldr:/);
    });

    it('should ingest user_submission source kind observation', async () => {
      const obs: RawObservation = {
        observation_id: 'obs:test:user:001',
        workspace_id: 'src',
        potential_source_ref: 'src/lib/utils/helpers.ts',
        source_kind: 'user_submission',
      };

      const result = await ingester.ingest(obs);
      expect(result.overall_result).toBe('PASS');
      expect(result.unknown_id).toMatch(/user_submission:/);
    });

    it('should ingest edge_case source kind observation', async () => {
      const obs: RawObservation = {
        observation_id: 'obs:test:edge:001',
        workspace_id: 'src',
        potential_source_ref: 'src/lib/edge-case.ts',
        source_kind: 'edge_case',
      };

      const result = await ingester.ingest(obs);
      expect(result.overall_result).toBe('PASS');
      expect(result.unknown_id).toMatch(/edge_case:/);
    });

    it('should ingest observation with optional fields', async () => {
      const obs: RawObservation = {
        observation_id: 'obs:test:optional:001',
        workspace_id: 'src',
        potential_source_ref: 'src/lib/file.ts',
        potential_feature_id: 'feature.sub',
        potential_feature_label: 'Feature Label',
        source_kind: 'scanner',
        evidence_payload: { key: 'value', nested: { deep: 'data' } },
      };

      const result = await ingester.ingest(obs);
      expect(result.overall_result).toBe('PASS');
      expect(result.gate_results[3].description).toContain('Observation inserted');
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Test 6-7: Identity Validation Failures
    // ═══════════════════════════════════════════════════════════════════════════

    it('should reject observation with missing workspace_id', async () => {
      const obs: RawObservation = {
        observation_id: 'obs:test:missing:001',
        workspace_id: '',
        potential_source_ref: 'src/lib/file.ts',
        source_kind: 'scanner',
      };

      const result = await ingester.ingest(obs);
      expect(result.overall_result).toBe('FAIL');
      expect(result.error).toContain('workspace_id');
      expect(result.gate_results[0].result).toBe('FAIL');
    });

    it('should reject observation with missing source_ref', async () => {
      const obs: RawObservation = {
        observation_id: 'obs:test:missing:002',
        workspace_id: 'src',
        potential_source_ref: '',
        source_kind: 'scanner',
      };

      const result = await ingester.ingest(obs);
      expect(result.overall_result).toBe('FAIL');
      expect(result.error).toContain('source_ref');
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Test 8-10: Path Normalization
    // ═══════════════════════════════════════════════════════════════════════════

    it('should normalize Windows absolute path', async () => {
      const obs: RawObservation = {
        observation_id: 'obs:test:windows:001',
        workspace_id: 'src',
        potential_source_ref: 'C:\\Users\\james\\Videos\\deeds-web-app\\src\\lib\\file.ts',
        source_kind: 'scanner',
      };

      const result = await ingester.ingest(obs);
      expect(result.overall_result).toBe('PASS');
      expect(result.gate_results[1].description).toContain('C:/Users/james/Videos');
    });

    it('should normalize Windows relative path', async () => {
      const obs: RawObservation = {
        observation_id: 'obs:test:windows:002',
        workspace_id: 'src',
        potential_source_ref: 'src\\lib\\server\\auth.ts',
        source_kind: 'scanner',
      };

      const result = await ingester.ingest(obs);
      expect(result.overall_result).toBe('PASS');
      expect(result.gate_results[1].description).toContain('src/lib/server');
    });

    it('should preserve POSIX paths (no change)', async () => {
      const obs: RawObservation = {
        observation_id: 'obs:test:posix:001',
        workspace_id: 'src',
        potential_source_ref: 'src/lib/server/auth.ts',
        source_kind: 'scanner',
      };

      const result = await ingester.ingest(obs);
      expect(result.overall_result).toBe('PASS');
      expect(result.gate_results[1].description).toContain('src/lib/server/auth.ts');
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Test 11-12: Deduplication
    // ═══════════════════════════════════════════════════════════════════════════

    it('should accept unique observation_id (first ingestion)', async () => {
      const obs: RawObservation = {
        observation_id: `obs:test:unique:${Date.now()}`,
        workspace_id: 'src',
        potential_source_ref: 'src/lib/file.ts',
        source_kind: 'scanner',
      };

      const result = await ingester.ingest(obs);
      expect(result.overall_result).toBe('PASS');
      expect(result.gate_results[2].result).toBe('PASS');
      expect(result.gate_results[2].description).toContain('No duplicate');
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Test 13-15: Batch Processing and Statistics
    // ═══════════════════════════════════════════════════════════════════════════

    it('should process batch of observations', async () => {
      const observations: RawObservation[] = [
        {
          observation_id: `obs:batch:001:${Date.now()}`,
          workspace_id: 'src',
          potential_source_ref: 'src/lib/file1.ts',
          source_kind: 'scanner',
        },
        {
          observation_id: `obs:batch:002:${Date.now()}`,
          workspace_id: 'src',
          potential_source_ref: 'src/lib/file2.ts',
          source_kind: 'ldr',
        },
        {
          observation_id: `obs:batch:003:${Date.now()}`,
          workspace_id: '',
          potential_source_ref: 'src/lib/file3.ts',
          source_kind: 'user_submission',
        },
      ];

      const results = await ingester.ingestBatch(observations);
      expect(results.length).toBe(3);
      expect(results[0].overall_result).toBe('PASS');
      expect(results[1].overall_result).toBe('PASS');
      expect(results[2].overall_result).toBe('FAIL');
    });

    it('should calculate ingestion statistics correctly', async () => {
      const observations: RawObservation[] = [
        {
          observation_id: `obs:stats:001:${Date.now()}`,
          workspace_id: 'src',
          potential_source_ref: 'src/lib/file1.ts',
          source_kind: 'scanner',
        },
        {
          observation_id: `obs:stats:002:${Date.now()}`,
          workspace_id: 'src',
          potential_source_ref: 'src/lib/file2.ts',
          source_kind: 'scanner',
        },
      ];

      const results = await ingester.ingestBatch(observations);
      const stats = ObservationIngester.getStats(results);

      expect(stats.total).toBe(2);
      expect(stats.passed).toBe(2);
      expect(stats.failed).toBe(0);
      expect(stats.success_rate).toBe(100);
    });

    it('should validate input schema', () => {
      const validObs: RawObservation = {
        observation_id: 'obs:test:schema:001',
        workspace_id: 'src',
        potential_source_ref: 'src/lib/file.ts',
        source_kind: 'scanner',
      };

      const result = RawObservationSchema.safeParse(validObs);
      expect(result.success).toBe(true);
    });

    it('should reject invalid source_kind in schema', () => {
      const invalidObs = {
        observation_id: 'obs:test:schema:002',
        workspace_id: 'src',
        potential_source_ref: 'src/lib/file.ts',
        source_kind: 'invalid_kind',
      };

      const result = RawObservationSchema.safeParse(invalidObs);
      expect(result.success).toBe(false);
    });
  });
});
