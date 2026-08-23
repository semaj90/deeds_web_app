import { describe, it, expect, beforeEach } from 'vitest';
import {
  fuseLanesViaRrf,
  validateRRFConfig,
  testRRF,
  DEFAULT_RRF_CONFIG,
  type QdrantSearchResult,
  type RRFConfig,
} from '$lib/server/retrieval/rrf-multi-vector';

describe('RRF Multi-Vector Fusion', () => {
  describe('Basic RRF Scoring', () => {
    it('should fuse 4 lanes into unified ranking', () => {
      const contentResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.95 },
        { id: 'chunk_2', score: 0.87 },
      ];

      const summaryResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.91 },
      ];

      const titleResults: QdrantSearchResult[] = [
        { id: 'chunk_3', score: 0.88 },
      ];

      const keywordResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.75 },
      ];

      const fused = fuseLanesViaRrf(contentResults, summaryResults, titleResults, keywordResults);

      expect(fused).toHaveLength(3);
      expect(fused[0].id).toBe('chunk_1'); // chunk_1 appears in all lanes
      expect(fused[0].rrf_score).toBeGreaterThan(0);
    });

    it('should handle empty results', () => {
      const fused = fuseLanesViaRrf([], [], [], []);
      expect(fused).toHaveLength(0);
    });

    it('should handle single lane results', () => {
      const contentResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.95 },
      ];

      const fused = fuseLanesViaRrf(contentResults, [], [], []);
      expect(fused).toHaveLength(1);
      expect(fused[0].id).toBe('chunk_1');
      expect(fused[0].contentScore).toBe(0.95);
      expect(fused[0].summaryScore).toBe(0);
    });

    it('should normalize scores to [0, 1]', () => {
      const contentResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.95 },
        { id: 'chunk_2', score: 0.50 },
      ];

      const fused = fuseLanesViaRrf(contentResults, [], [], []);
      expect(fused[0].normalizedScore).toBe(1.0);
      expect(fused[1].normalizedScore).toBe(0.0);
    });
  });

  describe('Lane Weighting', () => {
    it('should apply custom weights', () => {
      const config: RRFConfig = {
        weights: { content: 0.7, summary: 0.2, title: 0.1, keywords: 0.0 },
        k: 60,
        topK: 10,
      };

      const contentResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.95 },
      ];

      const summaryResults: QdrantSearchResult[] = [
        { id: 'chunk_2', score: 0.95 },
      ];

      const fused = fuseLanesViaRrf(contentResults, summaryResults, [], [], config);

      // chunk_1 should rank higher due to content weight > summary weight
      const chunk1 = fused.find(c => c.id === 'chunk_1');
      const chunk2 = fused.find(c => c.id === 'chunk_2');

      expect(chunk1!.rrf_score).toBeGreaterThan(chunk2!.rrf_score);
    });

    it('should respect zero-weight lanes', () => {
      const config: RRFConfig = {
        weights: { content: 1.0, summary: 0.0, title: 0.0, keywords: 0.0 },
        k: 60,
        topK: 10,
      };

      const contentResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.95 },
      ];

      const summaryResults: QdrantSearchResult[] = [
        { id: 'chunk_2', score: 0.95 },
      ];

      const fused = fuseLanesViaRrf(contentResults, summaryResults, [], [], config);

      // Only content lane should contribute
      const chunk1 = fused.find(c => c.id === 'chunk_1');
      const chunk2 = fused.find(c => c.id === 'chunk_2');

      expect(chunk1!.rrf_score).toBeGreaterThan(chunk2!.rrf_score);
      expect(chunk2!.summaryScore).toBeGreaterThan(0); // But payload still has summary score
    });
  });

  describe('Edge Cases', () => {
    it('should handle tied scores', () => {
      const contentResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.95 },
        { id: 'chunk_2', score: 0.95 },
      ];

      const fused = fuseLanesViaRrf(contentResults, [], [], []);
      expect(fused).toHaveLength(2);
      expect(Math.abs(fused[0].rrf_score - fused[1].rrf_score)).toBeLessThan(0.0001);
    });

    it('should respect topK limit', () => {
      const config: RRFConfig = { ...DEFAULT_RRF_CONFIG, topK: 3 };

      const contentResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.95 },
        { id: 'chunk_2', score: 0.85 },
        { id: 'chunk_3', score: 0.75 },
        { id: 'chunk_4', score: 0.65 },
        { id: 'chunk_5', score: 0.55 },
      ];

      const fused = fuseLanesViaRrf(contentResults, [], [], [], config);
      expect(fused).toHaveLength(3);
    });

    it('should handle score 0 gracefully', () => {
      const contentResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.0 },
        { id: 'chunk_2', score: 0.95 },
      ];

      const fused = fuseLanesViaRrf(contentResults, [], [], []);
      // chunk_1 should not contribute (score 0)
      const chunk1 = fused.find(c => c.id === 'chunk_1');
      const chunk2 = fused.find(c => c.id === 'chunk_2');

      expect(chunk2!.rrf_score).toBeGreaterThan(chunk1!.rrf_score);
    });

    it('should merge duplicate IDs from different lanes', () => {
      const contentResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.95 },
      ];

      const summaryResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.90 },
      ];

      const titleResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.85 },
      ];

      const keywordResults: QdrantSearchResult[] = [
        { id: 'chunk_1', score: 0.75 },
      ];

      const fused = fuseLanesViaRrf(contentResults, summaryResults, titleResults, keywordResults);

      expect(fused).toHaveLength(1);
      expect(fused[0].id).toBe('chunk_1');
      expect(fused[0].contentScore).toBe(0.95);
      expect(fused[0].summaryScore).toBe(0.90);
      expect(fused[0].titleScore).toBe(0.85);
      expect(fused[0].keywordScore).toBe(0.75);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate correct config', () => {
      const validation = validateRRFConfig(DEFAULT_RRF_CONFIG);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject weight sum != 1.0', () => {
      const config: RRFConfig = {
        weights: { content: 0.5, summary: 0.5, title: 0.0, keywords: 0.0 },
        k: 60,
        topK: 10,
      };

      const validation = validateRRFConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should reject negative weights', () => {
      const config: RRFConfig = {
        weights: { content: -0.1, summary: 0.6, title: 0.3, keywords: 0.2 },
        k: 60,
        topK: 10,
      };

      const validation = validateRRFConfig(config);
      expect(validation.valid).toBe(false);
    });

    it('should reject weight > 1.0', () => {
      const config: RRFConfig = {
        weights: { content: 1.5, summary: 0.0, title: 0.0, keywords: 0.0 },
        k: 60,
        topK: 10,
      };

      const validation = validateRRFConfig(config);
      expect(validation.valid).toBe(false);
    });

    it('should reject negative k', () => {
      const config: RRFConfig = {
        weights: { ...DEFAULT_RRF_CONFIG.weights },
        k: -10,
        topK: 10,
      };

      const validation = validateRRFConfig(config);
      expect(validation.valid).toBe(false);
    });

    it('should reject invalid topK', () => {
      const config: RRFConfig = {
        weights: { ...DEFAULT_RRF_CONFIG.weights },
        k: 60,
        topK: 0,
      };

      const validation = validateRRFConfig(config);
      expect(validation.valid).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should handle large result sets efficiently', () => {
      const largeResults: QdrantSearchResult[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `chunk_${i}`,
        score: 1.0 - i * 0.001,
      }));

      const start = performance.now();
      const fused = fuseLanesViaRrf(largeResults, largeResults, largeResults, largeResults);
      const elapsed = performance.now() - start;

      expect(fused.length).toBeLessThanOrEqual(10); // DEFAULT topK
      expect(elapsed).toBeLessThan(1000); // Should complete in <1s
    });
  });

  describe('Integration', () => {
    it('should pass built-in test', () => {
      const result = testRRF();
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBe('chunk_1'); // Should rank first (appears in all lanes)
    });
  });
});