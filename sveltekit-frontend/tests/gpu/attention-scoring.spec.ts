import { describe, it, expect } from 'vitest';
import {
  computeAttentionScore,
  computeAttentionBatch,
  cosineSimilarity,
  sigmoid,
  softmax,
  AttentionDefaults
} from '$lib/gpu/attention-scoring.js';

describe('Attention Scoring — Query-Weighted Relevance', () => {
  describe('cosineSimilarity — Vector similarity', () => {
    it('identical vectors return 1.0', () => {
      const v1 = new Float32Array([1, 0, 0]);
      const v2 = new Float32Array([1, 0, 0]);

      const result = cosineSimilarity(v1, v2);
      expect(result).toBeCloseTo(1.0, 5);
    });

    it('orthogonal vectors return 0.0', () => {
      const v1 = new Float32Array([1, 0, 0]);
      const v2 = new Float32Array([0, 1, 0]);

      const result = cosineSimilarity(v1, v2);
      expect(result).toBeCloseTo(0.0, 5);
    });

    it('opposite vectors return -1.0', () => {
      const v1 = new Float32Array([1, 0, 0]);
      const v2 = new Float32Array([-1, 0, 0]);

      const result = cosineSimilarity(v1, v2);
      expect(result).toBeCloseTo(-1.0, 5);
    });

    it('result in range [-1, 1]', () => {
      const v1 = new Float32Array([0.5, 0.3, 0.2]);
      const v2 = new Float32Array([0.1, 0.8, 0.1]);

      const result = cosineSimilarity(v1, v2);
      expect(result).toBeGreaterThanOrEqual(-1);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('zero vectors handled gracefully', () => {
      const v1 = new Float32Array([0, 0, 0]);
      const v2 = new Float32Array([0, 0, 0]);

      const result = cosineSimilarity(v1, v2);
      expect(result).toBe(0);
    });

    it('handles length mismatch error', () => {
      const v1 = new Float32Array([1, 0, 0]);
      const v2 = new Float32Array([1, 0]);

      expect(() => cosineSimilarity(v1, v2)).toThrow();
    });
  });

  describe('sigmoid — Activation function', () => {
    it('sigmoid(0) returns 0.5', () => {
      const result = sigmoid(0);
      expect(result).toBeCloseTo(0.5, 5);
    });

    it('sigmoid(positive) in (0.5, 1)', () => {
      const result = sigmoid(5);
      expect(result).toBeGreaterThan(0.5);
      expect(result).toBeLessThan(1);
    });

    it('sigmoid(negative) in (0, 0.5)', () => {
      const result = sigmoid(-5);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(0.5);
    });

    it('large positive values saturate to 1', () => {
      const result = sigmoid(1000);
      expect(result).toBeCloseTo(1, 5);
    });

    it('large negative values saturate to 0', () => {
      const result = sigmoid(-1000);
      expect(result).toBeCloseTo(0, 5);
    });
  });

  describe('softmax — Probability normalization', () => {
    it('softmax sums to 1.0', () => {
      const scores = [1.0, 2.0, 3.0];
      const result = softmax(scores);

      const sum = result.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('all outputs in [0, 1]', () => {
      const scores = [-2, 0, 2];
      const result = softmax(scores);

      result.forEach(prob => {
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1);
      });
    });

    it('largest input gets largest softmax output', () => {
      const scores = [1.0, 2.0, 3.0];
      const result = softmax(scores);

      expect(result[2]).toBeGreaterThan(result[1]);
      expect(result[1]).toBeGreaterThan(result[0]);
    });

    it('uniform inputs produce uniform outputs', () => {
      const scores = [1.0, 1.0, 1.0];
      const result = softmax(scores);

      result.forEach(prob => {
        expect(prob).toBeCloseTo(1/3, 5);
      });
    });
  });

  describe('computeAttentionScore — Single packet scoring', () => {
    it('returns AttentionScoreResult with all fields', () => {
      const query = new Float32Array(768).fill(0.5);
      const packet = new Float32Array(768).fill(0.5);

      const result = computeAttentionScore(query, packet);

      expect(result).toHaveProperty('cosineScore');
      expect(result).toHaveProperty('attentionScore');
      expect(result).toHaveProperty('isRelevant');
    });

    it('cosine score in range [-1, 1]', () => {
      const query = new Float32Array(768).fill(0.5);
      const packet = new Float32Array(768).fill(0.3);

      const result = computeAttentionScore(query, packet);

      // Allow for floating-point precision errors (e.g., 1.0000000000000107)
      expect(result.cosineScore).toBeGreaterThanOrEqual(-1.001);
      expect(result.cosineScore).toBeLessThanOrEqual(1.001);
    });

    it('attention score in range [0, 1]', () => {
      const query = new Float32Array(768).fill(0.5);
      const packet = new Float32Array(768).fill(0.3);

      const result = computeAttentionScore(query, packet);

      expect(result.attentionScore).toBeGreaterThanOrEqual(0);
      expect(result.attentionScore).toBeLessThanOrEqual(1);
    });

    it('identical embeddings have high attention score', () => {
      const query = new Float32Array(768).fill(0.5);
      const packet = new Float32Array(768).fill(0.5);

      const result = computeAttentionScore(query, packet);

      expect(result.cosineScore).toBeCloseTo(1.0, 3);
      // sigmoid(1.0) ≈ 0.731, so attention should be > 0.7 for identical vectors
      expect(result.attentionScore).toBeGreaterThan(0.7);
    });

    it('respects relevance threshold (default 0.3)', () => {
      const query = new Float32Array([1, 0, 0]);
      const packet = new Float32Array([1, 0, 0]);

      const result = computeAttentionScore(query, packet);

      expect(result.isRelevant).toBe(true);
    });

    it('throws on dimension mismatch', () => {
      const query = new Float32Array(768);
      const packet = new Float32Array(512);

      expect(() => computeAttentionScore(query, packet)).toThrow();
    });
  });

  describe('computeAttentionBatch — Batch packet scoring', () => {
    it('processes multiple packets without error', async () => {
      const query = new Float32Array(768).fill(0.5);
      const packets = [
        new Float32Array(768).fill(0.5),
        new Float32Array(768).fill(0.3),
      ];

      const result = await computeAttentionBatch(query, packets);

      expect(result.data).toHaveLength(2);
      expect(result.backend).toBe('cpu');
    });

    it('returns duration in milliseconds', async () => {
      const query = new Float32Array(768).fill(0.5);
      const packets = [new Float32Array(768).fill(0.5)];

      const result = await computeAttentionBatch(query, packets);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles empty packet array', async () => {
      const query = new Float32Array(768).fill(0.5);

      const result = await computeAttentionBatch(query, []);

      expect(result.data).toHaveLength(0);
      expect(result.durationMs).toBe(0);
    });

    it('softmax normalization sums to ~1.0', async () => {
      const query = new Float32Array(768).fill(0.5);
      const packets = [
        new Float32Array(768).fill(0.1),
        new Float32Array(768).fill(0.5),
        new Float32Array(768).fill(0.9),
      ];

      const result = await computeAttentionBatch(query, packets, {
        ...AttentionDefaults,
        normalization: 'softmax'
      });

      const sum = result.data.reduce((acc, r) => acc + r.attentionScore, 0);
      expect(sum).toBeCloseTo(1.0, 3);
    });

    it('sigmoid normalization produces independent scores', async () => {
      const query = new Float32Array(768).fill(0.5);
      const packets = [
        new Float32Array(768).fill(0.1),
        new Float32Array(768).fill(0.5),
      ];

      const result = await computeAttentionBatch(query, packets, {
        ...AttentionDefaults,
        normalization: 'sigmoid'
      });

      const sum = result.data.reduce((acc, r) => acc + r.attentionScore, 0);
      // Sum may not equal 1 with sigmoid (independent scores)
      expect(sum).toBeGreaterThan(0);
    });

    it('linear normalization stays in [0, 1]', async () => {
      const query = new Float32Array(768).fill(0.5);
      const packets = [
        new Float32Array(768).fill(0.1),
        new Float32Array(768).fill(0.5),
      ];

      const result = await computeAttentionBatch(query, packets, {
        ...AttentionDefaults,
        normalization: 'linear'
      });

      result.data.forEach(r => {
        expect(r.attentionScore).toBeGreaterThanOrEqual(0);
        expect(r.attentionScore).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('AttentionDefaults — Configuration', () => {
    it('defines expected default values', () => {
      expect(AttentionDefaults.temperature).toBe(1.0);
      expect(AttentionDefaults.relevanceThreshold).toBe(0.3);
      expect(AttentionDefaults.normalization).toBe('sigmoid');
    });
  });
});