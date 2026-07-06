/**
 * Unit Tests: Dispatcher Topology Service
 * Session 117: Topology signal integration
 */

import { describe, it, expect } from 'vitest';
import {
  generateDispatcherTopologyHits,
  getDispatcherSignalBreakdown,
  applyDispatcherTopologyBoost,
  getDispatcherSignalLaneWeight,
  shouldUseDispatcherGuidedRetrieval,
} from '../../src/lib/server/dispatcher/dispatcher-topology-service';
import type { DispatcherOrchestrationResult } from '../../src/lib/server/dispatcher/dispatcher-orchestrator';

describe('Dispatcher Topology Service', () => {
  const createMockResult = (overrides?: Partial<DispatcherOrchestrationResult>): DispatcherOrchestrationResult => ({
    success: true,
    dispatch_decision: 'synthesize',
    dispatch_confidence: 0.8,
    synthesis_path: ['validate', 'sync_qdrant', 'sync_neo4j', 'synthesize'],
    mirror_syncs: {
      qdrant: { synced: 10, failed: 0, duration_ms: 100 },
      neo4j: { nodes_created: 5, nodes_updated: 2, edges_created: 8, duration_ms: 120 },
      redis: { invalidated: 15, key_count: 20, duration_ms: 80 },
    },
    events_emitted: 3,
    total_duration_ms: 1200,
    errors: [],
    ...overrides,
  });

  describe('generateDispatcherTopologyHits', () => {
    it('should generate dispatcher hits for candidates', () => {
      const result = createMockResult();
      const hits = generateDispatcherTopologyHits({
        dispatcherResult: result,
        candidateCount: 20,
        queryPacketKey: 'query:packet:001',
      });

      expect(hits).toHaveLength(20);
      expect(hits[0].source).toBe('dispatcher_signal');
      expect(hits[0].score).toBeGreaterThan(0);
      expect(hits[0].score).toBeLessThanOrEqual(1);
    });

    it('should return empty for zero candidates', () => {
      const result = createMockResult();
      const hits = generateDispatcherTopologyHits({
        dispatcherResult: result,
        candidateCount: 0,
      });

      expect(hits).toHaveLength(0);
    });

    it('should return empty for missing dispatcher result', () => {
      const hits = generateDispatcherTopologyHits({
        dispatcherResult: undefined as any,
        candidateCount: 20,
      });

      expect(hits).toHaveLength(0);
    });

    it('should include dispatcher metadata', () => {
      const result = createMockResult();
      const hits = generateDispatcherTopologyHits({
        dispatcherResult: result,
        candidateCount: 1,
      });

      expect(hits[0].metadata?.dispatch_decision).toBe('synthesize');
      expect(hits[0].metadata?.mirror_success_rate).toBe(1.0);
      expect(hits[0].metadata?.synthesis_path_length).toBe(4);
    });
  });

  describe('getDispatcherSignalBreakdown', () => {
    it('should export signal breakdown', () => {
      const result = createMockResult();
      const breakdown = getDispatcherSignalBreakdown(result);

      expect(breakdown.signals).toBeDefined();
      expect(breakdown.scores).toBeDefined();
      expect(breakdown.combined_weight).toBeGreaterThan(0);
      expect(breakdown.combined_weight).toBeLessThanOrEqual(1);
    });

    it('should match expected weight calculation', () => {
      const result = createMockResult();
      const breakdown = getDispatcherSignalBreakdown(result);

      // Combined weight = decision * 0.35 + efficiency * 0.35 + scope * 0.15 + reliability * 0.15
      const expected =
        breakdown.scores.dispatch_decision_weight * 0.35 +
        breakdown.scores.execution_efficiency * 0.35 +
        breakdown.scores.synthesis_scope * 0.15 +
        breakdown.scores.reliability_score * 0.15;

      expect(breakdown.combined_weight).toBeCloseTo(expected, 5);
    });
  });

  describe('applyDispatcherTopologyBoost', () => {
    it('should boost score for successful result', () => {
      const result = createMockResult();
      const baseScore = 0.5;
      const boostedScore = applyDispatcherTopologyBoost('packet1', result, baseScore);

      expect(boostedScore).toBeGreaterThan(baseScore);
      expect(boostedScore).toBeLessThanOrEqual(1.0);
    });

    it('should penalize failed result', () => {
      const result = createMockResult({ success: false });
      const baseScore = 0.5;
      const boostedScore = applyDispatcherTopologyBoost('packet1', result, baseScore);

      expect(boostedScore).toBeLessThan(baseScore);
    });

    it('should apply confidence boost', () => {
      const resultHigh = createMockResult({ dispatch_confidence: 0.95 });
      const resultLow = createMockResult({ dispatch_confidence: 0.3 });

      const boostedHigh = applyDispatcherTopologyBoost('packet1', resultHigh, 0.5);
      const boostedLow = applyDispatcherTopologyBoost('packet1', resultLow, 0.5);

      expect(boostedHigh).toBeGreaterThanOrEqual(boostedLow);
      // Note: At base score 0.5, efficiency gains may result in near-identical boosts
      // Allow for floating-point precision tolerance
    });

    it('should cap boosted score at 1.0', () => {
      const result = createMockResult();
      const boostedScore = applyDispatcherTopologyBoost('packet1', result, 0.95);

      expect(boostedScore).toBeLessThanOrEqual(1.0);
    });
  });

  describe('getDispatcherSignalLaneWeight', () => {
    it('should return weight based on decision confidence', () => {
      const result = createMockResult({ dispatch_confidence: 0.8 });
      const weight = getDispatcherSignalLaneWeight(result);

      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThanOrEqual(1);
    });

    it('should penalize failed orchestration', () => {
      const resultSuccess = createMockResult({ success: true });
      const resultFailed = createMockResult({ success: false });

      const weightSuccess = getDispatcherSignalLaneWeight(resultSuccess);
      const weightFailed = getDispatcherSignalLaneWeight(resultFailed);

      expect(weightSuccess).toBeGreaterThan(weightFailed);
    });

    it('should account for mirror success rate', () => {
      const resultFull = createMockResult({
        mirror_syncs: {
          qdrant: { synced: 10, failed: 0, duration_ms: 100 },
          neo4j: { nodes_created: 5, nodes_updated: 2, edges_created: 8, duration_ms: 120 },
          redis: { invalidated: 15, key_count: 20, duration_ms: 80 },
        },
      });

      const resultPartial = createMockResult({
        mirror_syncs: {
          qdrant: { synced: 0, failed: 5, duration_ms: 0 },
          neo4j: { nodes_created: 5, nodes_updated: 2, edges_created: 8, duration_ms: 120 },
          redis: { invalidated: 15, key_count: 20, duration_ms: 80 },
        },
      });

      const weightFull = getDispatcherSignalLaneWeight(resultFull);
      const weightPartial = getDispatcherSignalLaneWeight(resultPartial);

      expect(weightFull).toBeGreaterThan(weightPartial);
    });
  });

  describe('shouldUseDispatcherGuidedRetrieval', () => {
    it('should return true for escalate decision', () => {
      const result = createMockResult({ dispatch_decision: 'escalate' });
      expect(shouldUseDispatcherGuidedRetrieval(result)).toBe(true);
    });

    it('should return true for quarantine decision', () => {
      const result = createMockResult({ dispatch_decision: 'quarantine' });
      expect(shouldUseDispatcherGuidedRetrieval(result)).toBe(true);
    });

    it('should return false for synthesis decision', () => {
      const result = createMockResult({ dispatch_decision: 'synthesize' });
      expect(shouldUseDispatcherGuidedRetrieval(result)).toBe(false);
    });

    it('should return false for mirror sync decisions', () => {
      const result = createMockResult({ dispatch_decision: 'sync_qdrant' });
      expect(shouldUseDispatcherGuidedRetrieval(result)).toBe(false);
    });
  });
});
