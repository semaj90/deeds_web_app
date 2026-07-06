/**
 * Unit Tests: Dispatcher Signal Extractor
 * Session 117: Topology signal integration
 */

import { describe, it, expect } from 'vitest';
import {
  extractDispatcherSignals,
  computeDispatcherSignalScores,
  getDecisionSignalWeight,
  dispatcherSignalsToRRFLane,
} from '../../src/lib/server/dispatcher/dispatcher-signal-extractor';
import type { DispatcherOrchestrationResult } from '../../src/lib/server/dispatcher/dispatcher-orchestrator';

describe('Dispatcher Signal Extractor', () => {
  // Test helpers
  const createMockResult = (overrides?: Partial<DispatcherOrchestrationResult>): DispatcherOrchestrationResult => ({
    success: true,
    dispatch_decision: 'synthesize',
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

  describe('extractDispatcherSignals', () => {
    it('should extract signals from successful result', () => {
      const result = createMockResult();
      const signals = extractDispatcherSignals(result);

      expect(signals.dispatch_decision).toBe('synthesize');
      expect(signals.decision_confidence).toBe(0.8);
      expect(signals.mirror_sync_count).toBe(3);
      expect(signals.mirror_success_rate).toBe(1.0);
      expect(signals.synthesis_path_length).toBe(4);
      expect(signals.total_latency_ms).toBe(1200);
      expect(signals.error_count).toBe(0);
    });

    it('should set lower confidence for failed result', () => {
      const result = createMockResult({ success: false });
      const signals = extractDispatcherSignals(result);

      expect(signals.decision_confidence).toBe(0.3);
    });

    it('should count partial mirror syncs', () => {
      const result = createMockResult({
        mirror_syncs: {
          qdrant: { synced: 5, failed: 0, duration_ms: 100 },
          neo4j: { nodes_created: 0, nodes_updated: 0, edges_created: 0, duration_ms: 0 },
          redis: { invalidated: 10, key_count: 15, duration_ms: 80 },
        },
      });
      const signals = extractDispatcherSignals(result);

      expect(signals.mirror_sync_count).toBe(2); // Qdrant and Redis only
      expect(signals.mirror_success_rate).toBeCloseTo(0.667, 2); // 2/3
    });

    it('should track errors in result', () => {
      const result = createMockResult({
        errors: ['Qdrant timeout', 'Neo4j connection failed'],
      });
      const signals = extractDispatcherSignals(result);

      expect(signals.error_count).toBe(2);
    });
  });

  describe('computeDispatcherSignalScores', () => {
    it('should normalize signals to 0-1 range', () => {
      const signals = {
        dispatch_decision: 'synthesize',
        decision_confidence: 0.8,
        mirror_sync_count: 3,
        mirror_success_rate: 1.0,
        synthesis_path_length: 4,
        total_latency_ms: 2000,
        error_count: 0,
      };

      const scores = computeDispatcherSignalScores(signals);

      expect(scores.dispatch_decision_weight).toBeLessThanOrEqual(1);
      expect(scores.dispatch_decision_weight).toBeGreaterThanOrEqual(0);
      expect(scores.execution_efficiency).toBeLessThanOrEqual(1);
      expect(scores.execution_efficiency).toBeGreaterThanOrEqual(0.3); // Min efficiency floor
      expect(scores.synthesis_scope).toBeLessThanOrEqual(1);
      expect(scores.synthesis_scope).toBeGreaterThanOrEqual(0);
      expect(scores.reliability_score).toBeLessThanOrEqual(1);
      expect(scores.reliability_score).toBeGreaterThanOrEqual(0);
    });

    it('should penalize high latency', () => {
      const scoresLow = computeDispatcherSignalScores({
        dispatch_decision: 'synthesize',
        decision_confidence: 0.8,
        mirror_sync_count: 3,
        mirror_success_rate: 1.0,
        synthesis_path_length: 4,
        total_latency_ms: 2000, // Target: score 1.0
        error_count: 0,
      });

      const scoresHigh = computeDispatcherSignalScores({
        dispatch_decision: 'synthesize',
        decision_confidence: 0.8,
        mirror_sync_count: 3,
        mirror_success_rate: 1.0,
        synthesis_path_length: 4,
        total_latency_ms: 8000, // Very high latency
        error_count: 0,
      });

      expect(scoresLow.execution_efficiency).toBeGreaterThan(scoresHigh.execution_efficiency);
    });

    it('should penalize errors', () => {
      const scoresNoError = computeDispatcherSignalScores({
        dispatch_decision: 'synthesize',
        decision_confidence: 0.8,
        mirror_sync_count: 3,
        mirror_success_rate: 1.0,
        synthesis_path_length: 4,
        total_latency_ms: 2000,
        error_count: 0,
      });

      const scoresWithError = computeDispatcherSignalScores({
        dispatch_decision: 'synthesize',
        decision_confidence: 0.8,
        mirror_sync_count: 3,
        mirror_success_rate: 1.0,
        synthesis_path_length: 4,
        total_latency_ms: 2000,
        error_count: 2,
      });

      expect(scoresNoError.reliability_score).toBeGreaterThan(scoresWithError.reliability_score);
    });
  });

  describe('getDecisionSignalWeight', () => {
    it('should return correct weight for each decision type', () => {
      expect(getDecisionSignalWeight('synthesize')).toBe(1.0);
      expect(getDecisionSignalWeight('sync_qdrant')).toBe(0.9);
      expect(getDecisionSignalWeight('sync_neo4j')).toBe(0.85);
      expect(getDecisionSignalWeight('rerank')).toBe(0.8);
      expect(getDecisionSignalWeight('validate')).toBe(0.75);
      expect(getDecisionSignalWeight('sync_redis')).toBe(0.7);
      expect(getDecisionSignalWeight('recover')).toBe(0.6);
      expect(getDecisionSignalWeight('escalate')).toBe(0.4);
      expect(getDecisionSignalWeight('quarantine')).toBe(0.2);
    });

    it('should have complete weight coverage for all decision types', () => {
      // Type system prevents unknown decisions, so just verify all 9 weights exist and are in 0-1 range
      const decisions = ['synthesize', 'sync_qdrant', 'sync_neo4j', 'rerank', 'validate', 'sync_redis', 'recover', 'escalate', 'quarantine'] as const;
      for (const decision of decisions) {
        const weight = getDecisionSignalWeight(decision);
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('dispatcherSignalsToRRFLane', () => {
    it('should generate RRF hits for each candidate', () => {
      const signals = {
        dispatch_decision: 'synthesize',
        decision_confidence: 0.8,
        mirror_sync_count: 3,
        mirror_success_rate: 1.0,
        synthesis_path_length: 4,
        total_latency_ms: 1200,
        error_count: 0,
      };

      const candidateIds = ['id1', 'id2', 'id3'];
      const hits = dispatcherSignalsToRRFLane(signals, candidateIds);

      expect(hits).toHaveLength(3);
      expect(hits[0].id).toBe('id1');
      expect(hits[1].id).toBe('id2');
      expect(hits[2].id).toBe('id3');
    });

    it('should use consistent score for all hits', () => {
      const signals = {
        dispatch_decision: 'synthesize',
        decision_confidence: 0.8,
        mirror_sync_count: 3,
        mirror_success_rate: 1.0,
        synthesis_path_length: 4,
        total_latency_ms: 1200,
        error_count: 0,
      };

      const candidateIds = ['id1', 'id2', 'id3'];
      const hits = dispatcherSignalsToRRFLane(signals, candidateIds);

      const firstScore = hits[0].score;
      expect(hits[1].score).toBe(firstScore);
      expect(hits[2].score).toBe(firstScore);
    });

    it('should have correct source and metadata', () => {
      const signals = {
        dispatch_decision: 'synthesize',
        decision_confidence: 0.8,
        mirror_sync_count: 3,
        mirror_success_rate: 1.0,
        synthesis_path_length: 4,
        total_latency_ms: 1200,
        error_count: 0,
      };

      const hits = dispatcherSignalsToRRFLane(signals, ['id1']);

      expect(hits[0].source).toBe('dispatcher_signal');
      expect(hits[0].metadata?.dispatch_decision).toBe('synthesize');
      expect(hits[0].metadata?.decision_confidence).toBe(0.8);
      expect(hits[0].metadata?.mirror_success_rate).toBe(1.0);
    });

    it('should return empty array for zero candidates', () => {
      const signals = {
        dispatch_decision: 'synthesize',
        decision_confidence: 0.8,
        mirror_sync_count: 3,
        mirror_success_rate: 1.0,
        synthesis_path_length: 4,
        total_latency_ms: 1200,
        error_count: 0,
      };

      const hits = dispatcherSignalsToRRFLane(signals, []);
      expect(hits).toHaveLength(0);
    });
  });
});
