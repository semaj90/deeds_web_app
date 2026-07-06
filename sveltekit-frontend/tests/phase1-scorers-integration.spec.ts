/**
 * Phase 1 Quick Wins: Scorer Integration Tests
 *
 * Validates that all three scorers (vector, graph, telemetry)
 * work correctly and can be blended into RRF
 */

import { describe, it, expect } from 'vitest';
import { computeVectorScore, testVectorScorer } from '../src/lib/server/retrieval/vector-scorer';
import { computeGraphScore, blendGraphSignals, testGraphScorer } from '../src/lib/server/retrieval/graph-scorer';
import { computeRecencyScore, computeValidationScore, blendTelemetrySignals, testTelemetryScorer } from '../src/lib/server/retrieval/telemetry-scorer';

describe('Phase 1: Scorer Integration', () => {
  describe('Vector Scorer', () => {
    it('should pass unit tests', () => {
      const result = testVectorScorer();
      expect(result.pass).toBe(true);
    });

    it('should compute perfect match (distance=0)', () => {
      const score = computeVectorScore(0);
      expect(score).toBe(1.0);
    });

    it('should compute poor match (distance=2)', () => {
      const score = computeVectorScore(2);
      expect(score).toBe(0.0);
    });

    it('should handle invalid input', () => {
      const negative = computeVectorScore(-1);
      expect(negative).toBe(1); // Negative distance clipped to 0, score = 1 - 0/2 = 1.0

      const tooLarge = computeVectorScore(5);
      expect(tooLarge).toBe(0); // Distance clipped to 2, score = 1 - 2/2 = 0.0
    });
  });

  describe('Graph Scorer', () => {
    it('should pass unit tests', () => {
      const result = testGraphScorer();
      expect(result.pass).toBe(true);
    });

    it('should compute PageRank score', () => {
      const score = computeGraphScore(0.5, 0.15, 1.0);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should blend multiple graph signals', () => {
      const blended = blendGraphSignals(0.5, 0.8, 50);
      expect(blended).toBeGreaterThan(0);
      expect(blended).toBeLessThanOrEqual(1);
    });
  });

  describe('Telemetry Scorer', () => {
    it('should pass unit tests', () => {
      const result = testTelemetryScorer();
      expect(result.pass).toBe(true);
    });

    it('should score recent access higher than old access', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const recentScore = computeRecencyScore(oneHourAgo, now);
      const staleScore = computeRecencyScore(thirtyDaysAgo, now);

      expect(recentScore).toBeGreaterThan(staleScore);
    });

    it('should validate confidence scores', () => {
      const highConf = computeValidationScore(0.95);
      const lowConf = computeValidationScore(0.3);
      const nullConf = computeValidationScore(null);

      expect(highConf).toBeGreaterThan(lowConf);
      expect(nullConf).toBe(0.5); // Neutral
    });

    it('should blend telemetry signals', () => {
      const now = new Date();
      const blended = blendTelemetrySignals(now, 0.9, 50);
      expect(blended).toBeGreaterThan(0);
      expect(blended).toBeLessThanOrEqual(1);
    });
  });

  describe('Cross-Scorer Validation', () => {
    it('should combine all three scorers into single RRF blend', () => {
      const vectorScore = computeVectorScore(0.5);      // 0.75
      const graphScore = computeGraphScore(0.5);        // 0.5
      const telemetryScore = blendTelemetrySignals(     // varies
        new Date(),
        0.8,
        50
      );

      // Weighted blend: 0.35 * vector + 0.15 * graph + 0.1 * telemetry
      const weights = { vector: 0.35, graph: 0.15, telemetry: 0.1 };
      const totalWeight = weights.vector + weights.graph + weights.telemetry;
      const blendedScore =
        (vectorScore * weights.vector +
         graphScore * weights.graph +
         telemetryScore * weights.telemetry) /
        totalWeight;

      expect(blendedScore).toBeGreaterThan(0);
      expect(blendedScore).toBeLessThanOrEqual(1);
    });

    it('should handle missing signals gracefully', () => {
      const vector = computeVectorScore(1);
      const graph = computeGraphScore(0, 0.15, 1);
      const telemetry = computeValidationScore(null);

      expect(vector).toBe(0.5);
      expect(graph).toBe(0);
      expect(telemetry).toBe(0.5);

      const blend = (vector * 0.35 + graph * 0.15 + telemetry * 0.1) / 0.6;
      expect(blend).toBeGreaterThan(0);
    });
  });

  describe('Performance Characteristics', () => {
    it('vector scorer should compute in <1ms', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        computeVectorScore(Math.random() * 2);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10); // 1000 calls should be < 10ms
    });

    it('graph scorer should compute in <1ms', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        computeGraphScore(Math.random());
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10);
    });

    it('telemetry scorer should compute in <5ms', () => {
      const start = performance.now();
      const now = new Date();
      for (let i = 0; i < 1000; i++) {
        computeRecencyScore(
          new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          now
        );
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(20); // Recency involves date math
    });
  });
});
