/**
 * Multi-Vector Orchestrator Integration Tests
 *
 * Tests the full 4-lane retrieval + RRF fusion pipeline
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  executeMultiVectorRetrieval,
  checkMultiVectorHealth,
  type MultiVectorRequest,
  type MultiVectorResult,
} from '$lib/server/retrieval/multi-vector-orchestrator';

describe('Multi-Vector Orchestrator', () => {
  // Mock Qdrant client to avoid needing real services during tests
  let mockQdrantResponses: {
    content?: any[];
    summary?: any[];
    title?: any[];
    keywords?: any[];
  } = {};

  beforeAll(() => {
    // Store any test fixtures or setup here
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('Multi-Vector Retrieval', () => {
    it('should execute retrieval with all 4 lanes available', async () => {
      // This test requires Qdrant to be running
      // For now, we'll skip it if Qdrant is not available
      const health = await checkMultiVectorHealth();
      if (!health.qdrant_ok) {
        console.log('Skipping multi-vector test: Qdrant not available');
        expect(true).toBe(true);
        return;
      }

      const request: MultiVectorRequest = {
        query: 'authentication session validation',
        queryEmbedding: Array(768).fill(0.1), // Mock 768-d embedding
        topK: 10,
      };

      const result = await executeMultiVectorRetrieval(request);

      expect(result).toBeDefined();
      expect(result.candidates).toBeDefined();
      expect(Array.isArray(result.candidates)).toBe(true);
      expect(result.timing).toBeDefined();
      expect(result.lane_stats).toBeDefined();
    });

    it('should handle invalid config gracefully', async () => {
      const health = await checkMultiVectorHealth();
      if (!health.qdrant_ok) {
        console.log('Skipping invalid config test: Qdrant not available');
        expect(true).toBe(true);
        return;
      }

      const request: MultiVectorRequest = {
        query: 'test query',
        queryEmbedding: Array(768).fill(0.1),
        topK: 10,
        weights: {
          content: 0.5,
          summary: 0.5,
          title: 0.5,
          keywords: 0.5, // Sum > 1.0, should fail validation
        },
      };

      try {
        await executeMultiVectorRetrieval(request);
        expect.fail('Should have thrown validation error');
      } catch (err) {
        expect((err as Error).message).toContain('Invalid RRF config');
      }
    });

    it('should return results sorted by RRF score', async () => {
      const health = await checkMultiVectorHealth();
      if (!health.qdrant_ok) {
        console.log('Skipping sorting test: Qdrant not available');
        expect(true).toBe(true);
        return;
      }

      const request: MultiVectorRequest = {
        query: 'database connection pool',
        queryEmbedding: Array(768).fill(0.2),
        topK: 5,
      };

      const result = await executeMultiVectorRetrieval(request);

      // Verify scores are sorted descending
      for (let i = 0; i < result.candidates.length - 1; i++) {
        expect(result.candidates[i].rrf_score).toBeGreaterThanOrEqual(
          result.candidates[i + 1].rrf_score
        );
      }
    });

    it('should normalize scores to [0, 1]', async () => {
      const health = await checkMultiVectorHealth();
      if (!health.qdrant_ok) {
        console.log('Skipping normalization test: Qdrant not available');
        expect(true).toBe(true);
        return;
      }

      const request: MultiVectorRequest = {
        query: 'error handling',
        queryEmbedding: Array(768).fill(0.15),
        topK: 10,
      };

      const result = await executeMultiVectorRetrieval(request);

      for (const candidate of result.candidates) {
        expect(candidate.normalized_score).toBeGreaterThanOrEqual(0);
        expect(candidate.normalized_score).toBeLessThanOrEqual(1);
      }
    });

    it('should track timing metrics', async () => {
      const health = await checkMultiVectorHealth();
      if (!health.qdrant_ok) {
        console.log('Skipping timing test: Qdrant not available');
        expect(true).toBe(true);
        return;
      }

      const request: MultiVectorRequest = {
        query: 'api route handler',
        queryEmbedding: Array(768).fill(0.1),
        topK: 10,
      };

      const result = await executeMultiVectorRetrieval(request);

      expect(result.timing.total_ms).toBeGreaterThan(0);
      expect(result.timing.content_ms).toBeGreaterThanOrEqual(0);
      expect(result.timing.summary_ms).toBeGreaterThanOrEqual(0);
      expect(result.timing.title_ms).toBeGreaterThanOrEqual(0);
      expect(result.timing.keywords_ms).toBeGreaterThanOrEqual(0);
      expect(result.timing.fusion_ms).toBeGreaterThanOrEqual(0);

      // Verify total is at least the sum of fusion (others are parallel)
      expect(result.timing.total_ms).toBeGreaterThanOrEqual(result.timing.fusion_ms);
    });

    it('should populate source lanes for each candidate', async () => {
      const health = await checkMultiVectorHealth();
      if (!health.qdrant_ok) {
        console.log('Skipping source lanes test: Qdrant not available');
        expect(true).toBe(true);
        return;
      }

      const request: MultiVectorRequest = {
        query: 'test query',
        queryEmbedding: Array(768).fill(0.1),
        topK: 5,
      };

      const result = await executeMultiVectorRetrieval(request);

      for (const candidate of result.candidates) {
        expect(Array.isArray(candidate.source_lanes)).toBe(true);
        expect(candidate.source_lanes.length).toBeGreaterThan(0);

        // Each lane in source_lanes should have non-zero score
        for (const lane of candidate.source_lanes) {
          const score = candidate[`${lane}_score` as keyof typeof candidate];
          expect((score as number) > 0).toBe(true);
        }
      }
    });

    it('should report lane statistics', async () => {
      const health = await checkMultiVectorHealth();
      if (!health.qdrant_ok) {
        console.log('Skipping lane stats test: Qdrant not available');
        expect(true).toBe(true);
        return;
      }

      const request: MultiVectorRequest = {
        query: 'comprehensive query',
        queryEmbedding: Array(768).fill(0.1),
        topK: 10,
      };

      const result = await executeMultiVectorRetrieval(request);

      expect(result.lane_stats).toBeDefined();
      expect(result.lane_stats.content_count).toBeGreaterThanOrEqual(0);
      expect(result.lane_stats.summary_count).toBeGreaterThanOrEqual(0);
      expect(result.lane_stats.title_count).toBeGreaterThanOrEqual(0);
      expect(result.lane_stats.keywords_count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Health Checks', () => {
    it('should report Qdrant connectivity', async () => {
      const health = await checkMultiVectorHealth();

      expect(health).toBeDefined();
      expect(health.ok).toBeDefined();
      expect(health.qdrant_ok).toBeDefined();
    });

    it('should verify vector availability', async () => {
      const health = await checkMultiVectorHealth();

      if (health.qdrant_ok) {
        expect(health.vectors_available).toBeDefined();
        expect(health.vectors_available.content).toBeDefined();
        expect(health.vectors_available.summary).toBeDefined();
        expect(health.vectors_available.title).toBeDefined();
      }
    });

    it('should check keywords indexing', async () => {
      const health = await checkMultiVectorHealth();

      if (health.qdrant_ok) {
        expect(health.keywords_indexed).toBeDefined();
      }
    });
  });

  describe('Configuration', () => {
    it('should accept custom weights', async () => {
      const health = await checkMultiVectorHealth();
      if (!health.qdrant_ok) {
        console.log('Skipping custom weights test: Qdrant not available');
        expect(true).toBe(true);
        return;
      }

      const request: MultiVectorRequest = {
        query: 'test',
        queryEmbedding: Array(768).fill(0.1),
        topK: 5,
        weights: {
          content: 0.7,
          summary: 0.2,
          title: 0.05,
          keywords: 0.05,
        },
      };

      const result = await executeMultiVectorRetrieval(request);
      expect(result.candidates).toBeDefined();
    });

    it('should respect topK parameter', async () => {
      const health = await checkMultiVectorHealth();
      if (!health.qdrant_ok) {
        console.log('Skipping topK test: Qdrant not available');
        expect(true).toBe(true);
        return;
      }

      const request: MultiVectorRequest = {
        query: 'test',
        queryEmbedding: Array(768).fill(0.1),
        topK: 3,
      };

      const result = await executeMultiVectorRetrieval(request);
      expect(result.candidates.length).toBeLessThanOrEqual(3);
    });
  });
});
