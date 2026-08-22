/**
 * Semantic Lane Tests
 *
 * Validates cosine similarity-based domain classification against centroids
 */

import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  softmax,
  computeCentroid,
  normalizeVector,
  scoreEntityAgainstCentroid,
  classifySemanticSingle,
  classifySemanticBatch,
  computeSemanticAggregateConfidence,
  computeSemanticMetrics,
  type DomainCentroid,
} from './semantic-lane.js';

describe('Semantic Lane', () => {
  describe('cosineSimilarity', () => {
    it('should compute identical vectors as 1.0', () => {
      const v1 = [1, 0, 0];
      const v2 = [1, 0, 0];
      expect(cosineSimilarity(v1, v2)).toBe(1.0);
    });

    it('should compute perpendicular vectors as 0', () => {
      const v1 = [1, 0, 0];
      const v2 = [0, 1, 0];
      expect(cosineSimilarity(v1, v2)).toBe(0);
    });

    it('should compute opposite vectors as -1.0', () => {
      const v1 = [1, 0, 0];
      const v2 = [-1, 0, 0];
      expect(cosineSimilarity(v1, v2)).toBe(-1.0);
    });

    it('should handle scaled vectors (scale invariant)', () => {
      const v1 = [1, 2, 3];
      const v2 = [2, 4, 6];  // 2× scaled
      expect(cosineSimilarity(v1, v2)).toBe(1.0);  // Still identical direction
    });

    it('should throw on dimension mismatch', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2];
      expect(() => cosineSimilarity(v1, v2)).toThrow();
    });

    it('should handle zero vectors gracefully', () => {
      const v1 = [0, 0, 0];
      const v2 = [1, 2, 3];
      expect(cosineSimilarity(v1, v2)).toBe(0);
    });
  });

  describe('softmax', () => {
    it('should normalize scores to sum to 1', () => {
      const scores = [1.0, 2.0, 3.0];
      const normalized = softmax(scores);
      const sum = normalized.reduce((a, b) => a + b);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should preserve order', () => {
      const scores = [1.0, 3.0, 2.0];
      const normalized = softmax(scores);
      expect(normalized[1]).toBeGreaterThan(normalized[2]);
      expect(normalized[2]).toBeGreaterThan(normalized[0]);
    });

    it('should handle negative scores', () => {
      const scores = [-1.0, 0.0, 1.0];
      const normalized = softmax(scores);
      const sum = normalized.reduce((a, b) => a + b);
      expect(sum).toBeCloseTo(1.0, 5);
      expect(normalized.every((s) => s > 0)).toBe(true);
    });
  });

  describe('computeCentroid', () => {
    it('should compute centroid as mean of vectors', () => {
      const embeddings = [
        [1, 0, 0],
        [3, 0, 0],
      ];
      const centroid = computeCentroid(embeddings);
      expect(centroid).toEqual([2, 0, 0]);
    });

    it('should handle single embedding', () => {
      const embeddings = [[1, 2, 3]];
      const centroid = computeCentroid(embeddings);
      expect(centroid).toEqual([1, 2, 3]);
    });

    it('should throw on empty embeddings', () => {
      expect(() => computeCentroid([])).toThrow();
    });

    it('should throw on dimension mismatch', () => {
      const embeddings = [
        [1, 2, 3],
        [1, 2],  // Wrong dimension
      ];
      expect(() => computeCentroid(embeddings)).toThrow();
    });
  });

  describe('normalizeVector', () => {
    it('should produce unit norm vector', () => {
      const v = [3, 4];  // 3-4-5 triangle
      const normalized = normalizeVector(v);
      const norm = Math.sqrt(normalized[0] ** 2 + normalized[1] ** 2);
      expect(norm).toBeCloseTo(1.0);
    });

    it('should return zero vector unchanged', () => {
      const v = [0, 0, 0];
      const normalized = normalizeVector(v);
      expect(normalized).toEqual([0, 0, 0]);
    });
  });

  describe('scoreEntityAgainstCentroid', () => {
    it('should score identical embeddings as high', () => {
      const embedding = [1, 0, 0];
      const centroid: DomainCentroid = {
        domain: 'test',
        centroid: [1, 0, 0],
        sampleCount: 100,
        confidence: 0.9,
      };
      const score = scoreEntityAgainstCentroid(embedding, centroid);
      expect(score).toBeCloseTo(0.9, 2);  // 1.0 * 0.9
    });

    it('should score perpendicular embeddings as zero', () => {
      const embedding = [1, 0, 0];
      const centroid: DomainCentroid = {
        domain: 'test',
        centroid: [0, 1, 0],
        sampleCount: 100,
        confidence: 0.9,
      };
      const score = scoreEntityAgainstCentroid(embedding, centroid);
      expect(score).toBe(0);
    });

    it('should scale score by centroid confidence', () => {
      const embedding = [1, 0, 0];
      const highConf: DomainCentroid = {
        domain: 'test1',
        centroid: [1, 0, 0],
        sampleCount: 1000,
        confidence: 0.99,
      };
      const lowConf: DomainCentroid = {
        domain: 'test2',
        centroid: [1, 0, 0],
        sampleCount: 10,
        confidence: 0.5,
      };
      const score1 = scoreEntityAgainstCentroid(embedding, highConf);
      const score2 = scoreEntityAgainstCentroid(embedding, lowConf);
      expect(score1).toBeGreaterThan(score2);
    });
  });

  describe('classifySemanticSingle', () => {
    it('should classify against domain centroids', () => {
      const embedding = new Array(768).fill(0);
      embedding[0] = 1;  // Set first component

      const centroids = new Map<string, DomainCentroid>([
        [
          'auth',
          {
            domain: 'auth',
            centroid: embedding,
            sampleCount: 1000,
            confidence: 0.95,
          },
        ],
        [
          'retrieval',
          {
            domain: 'retrieval',
            centroid: new Array(768).fill(0).map((_, i) => (i === 1 ? 1 : 0)),
            sampleCount: 800,
            confidence: 0.85,
          },
        ],
      ]);

      const scores = classifySemanticSingle(
        '550e8400-e29b-41d4-a716-446655440000',
        embedding,
        centroids
      );

      expect(scores.length).toBeGreaterThan(0);
      expect(scores[0].domain).toBe('auth');  // Should be top
      expect(scores[0].score).toBeGreaterThan(0.5);
    });

    it('should return empty array for no centroids', () => {
      const embedding = new Array(768).fill(0);
      const scores = classifySemanticSingle(
        '550e8400-e29b-41d4-a716-446655440000',
        embedding,
        new Map()
      );
      expect(scores).toEqual([]);
    });

    it('should respect confidenceThreshold', () => {
      const embedding = new Array(768).fill(0);
      embedding[0] = 0.1;  // Low similarity

      const centroid: DomainCentroid = {
        domain: 'auth',
        centroid: new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : 0)),
        sampleCount: 1000,
        confidence: 0.5,  // Low confidence domain
      };

      const centroids = new Map([['auth', centroid]]);

      // High threshold should exclude low scores
      const scoresHigh = classifySemanticSingle(
        '550e8400-e29b-41d4-a716-446655440000',
        embedding,
        centroids,
        0.8  // High threshold
      );
      expect(scoresHigh.length).toBe(0);

      // Low threshold should include
      const scoresLow = classifySemanticSingle(
        '550e8400-e29b-41d4-a716-446655440000',
        embedding,
        centroids,
        0.1  // Low threshold
      );
      expect(scoresLow.length).toBeGreaterThan(0);
    });

    it('should respect topK parameter', () => {
      const embedding = new Array(768).fill(0);
      const centroids = new Map<string, DomainCentroid>();

      // Create 10 domains
      for (let i = 0; i < 10; i++) {
        const centroid = new Array(768).fill(0);
        centroid[i] = 1;
        centroids.set(`domain${i}`, {
          domain: `domain${i}`,
          centroid,
          sampleCount: 100 - i,
          confidence: 0.9 - i * 0.05,
        });
      }

      const scores = classifySemanticSingle(
        '550e8400-e29b-41d4-a716-446655440000',
        embedding,
        centroids,
        0.0,  // No threshold
        3  // topK = 3
      );

      expect(scores.length).toBeLessThanOrEqual(3);
    });

    it('should throw on embedding dimension mismatch', () => {
      const embedding = new Array(384).fill(0);  // Wrong dimension
      const centroids = new Map<string, DomainCentroid>();

      expect(() => classifySemanticSingle(
        '550e8400-e29b-41d4-a716-446655440000',
        embedding,
        centroids
      )).toThrow();
    });
  });

  describe('classifySemanticBatch', () => {
    it('should classify multiple entities', () => {
      const embeddings = [
        new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : 0)),
        new Array(768).fill(0).map((_, i) => (i === 1 ? 1 : 0)),
        new Array(768).fill(0).map((_, i) => (i === 2 ? 1 : 0)),
      ];

      const entities = embeddings.map((emb, i) => ({
        entityId: `entity-${i}`,
        embedding: emb,
      }));

      const centroids = new Map<string, DomainCentroid>([
        [
          'domain0',
          {
            domain: 'domain0',
            centroid: embeddings[0],
            sampleCount: 100,
            confidence: 0.9,
          },
        ],
        [
          'domain1',
          {
            domain: 'domain1',
            centroid: embeddings[1],
            sampleCount: 100,
            confidence: 0.9,
          },
        ],
      ]);

      const results = classifySemanticBatch(entities, centroids);

      expect(Object.keys(results)).toHaveLength(3);
      expect(results['entity-0'][0].domain).toBe('domain0');
      expect(results['entity-1'][0].domain).toBe('domain1');
    });
  });

  describe('computeSemanticAggregateConfidence', () => {
    it('should average scores correctly', () => {
      const scores = [
        { domain: 'auth', score: 0.8, source: 'SEMANTIC_NEIGHBOR' as const, explanation: '' },
        { domain: 'retrieval', score: 0.6, source: 'SEMANTIC_NEIGHBOR' as const, explanation: '' },
      ];

      const avg = computeSemanticAggregateConfidence(scores as any);
      expect(avg).toBe(0.7);  // (0.8 + 0.6) / 2
    });

    it('should return 0 for empty array', () => {
      const avg = computeSemanticAggregateConfidence([]);
      expect(avg).toBe(0);
    });
  });

  describe('computeSemanticMetrics', () => {
    it('should compute metrics for classifications', () => {
      const classifications = {
        entity1: [
          { domain: 'auth', score: 0.8, source: 'SEMANTIC_NEIGHBOR' as const, explanation: '' },
        ],
        entity2: [
          { domain: 'retrieval', score: 0.7, source: 'SEMANTIC_NEIGHBOR' as const, explanation: '' },
          { domain: 'embedding', score: 0.6, source: 'SEMANTIC_NEIGHBOR' as const, explanation: '' },
        ],
        entity3: [],  // No classifications
      };

      const metrics = computeSemanticMetrics(classifications as any);

      expect(metrics.totalEntities).toBe(3);
      expect(metrics.classifiedEntities).toBe(2);
      expect(metrics.coveragePercentage).toBeCloseTo(66.67, 1);
      expect(metrics.averageConfidence).toBeCloseTo(0.7, 1);
      expect(metrics.averageDomainsPerEntity).toBeCloseTo(1, 1);
      expect(metrics.minConfidenceObserved).toBe(0.6);
      expect(metrics.maxConfidenceObserved).toBe(0.8);
      expect(metrics.confidenceVariance).toBeGreaterThan(0);
    });

    it('should handle empty classifications', () => {
      const metrics = computeSemanticMetrics({});

      expect(metrics.totalEntities).toBe(0);
      expect(metrics.classifiedEntities).toBe(0);
      expect(metrics.coveragePercentage).toBe(0);
      expect(metrics.averageConfidence).toBe(0);
    });
  });

  describe('Integration: Domain Centroid Classification', () => {
    it('should classify realistic 768-dim embeddings', () => {
      // Simulate domain centroids from K-means
      const authCentroid = new Array(768)
        .fill(0)
        .map((_, i) => (i < 100 ? Math.sin(i * 0.1) : 0));  // Auth-heavy low dims

      const retrievalCentroid = new Array(768)
        .fill(0)
        .map((_, i) => (i >= 100 && i < 200 ? Math.cos(i * 0.1) : 0));  // Retrieval-heavy mid dims

      const centroids = new Map<string, DomainCentroid>([
        ['auth', { domain: 'auth', centroid: authCentroid, sampleCount: 5000, confidence: 0.95 }],
        ['retrieval', { domain: 'retrieval', centroid: retrievalCentroid, sampleCount: 4000, confidence: 0.92 }],
      ]);

      // Entity embedding similar to auth
      const entityEmbedding = new Array(768)
        .fill(0)
        .map((_, i) => (i < 100 ? Math.sin(i * 0.1) * 1.1 : 0));  // Similar to auth + some noise

      const scores = classifySemanticSingle(
        'test-entity',
        entityEmbedding,
        centroids
      );

      expect(scores.length).toBeGreaterThan(0);
      expect(scores[0].domain).toBe('auth');  // Should classify as auth
      expect(scores[0].score).toBeGreaterThan(0.5);
    });

    it('should achieve ≥80% coverage on 100-entity sample', () => {
      // Simulate 100 entities with 768-dim embeddings
      const entities = Array.from({ length: 100 }, (_, i) => ({
        entityId: `entity-${i}`,
        embedding: new Array(768).fill(0).map((_, j) => Math.sin((i + j) * 0.1)),
      }));

      // Create realistic centroids
      const centroids = new Map<string, DomainCentroid>();
      const domains = ['auth', 'retrieval', 'embedding', 'graph', 'storage'];

      for (let d = 0; d < domains.length; d++) {
        const centroid = new Array(768)
          .fill(0)
          .map((_, j) => Math.sin((d + j) * 0.1));

        centroids.set(domains[d], {
          domain: domains[d],
          centroid,
          sampleCount: 1000,
          confidence: 0.9,
        });
      }

      const results = classifySemanticBatch(entities, centroids, 0.3);
      const classifiedCount = Object.values(results).filter((scores) => scores.length > 0).length;
      const coverage = (classifiedCount / entities.length) * 100;

      expect(coverage).toBeGreaterThanOrEqual(80);
    });
  });
});
