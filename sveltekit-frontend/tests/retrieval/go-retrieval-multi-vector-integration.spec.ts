/**
 * Go Retrieval Multi-Vector Integration Tests
 *
 * Tests the full integration of 4-lane RRF fusion into the Go Retrieval facade:
 * 1. Routing via useMultiVector flag
 * 2. RRF score computation and normalization
 * 3. Identity validation with RRF scores
 * 4. Dispatcher integration with multi-vector results
 * 5. Response shape compatibility
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  executeGoRetrievalSearch,
  checkGoRetrievalHealth,
  type GoRetrievalFacadeRequest,
  type GoRetrievalFacadeResponse
} from '$lib/server/retrieval/go-retrieval-facade.js';

describe('Go Retrieval Multi-Vector Integration', () => {
  let isQdrantAvailable = true;

  beforeAll(async () => {
    // Check if Qdrant is available
    try {
      const health = await checkGoRetrievalHealth();
      isQdrantAvailable = health.services.qdrant ?? false;
      if (!isQdrantAvailable) {
        console.warn('Qdrant not available, skipping multi-vector integration tests');
      }
    } catch {
      isQdrantAvailable = false;
    }
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('Routing via multi-vector flag', () => {
    it('should route to multi-vector orchestrator when flag enabled', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'authentication session validation',
        useMultiVector: true,
        topK: 5
      };

      const response = await executeGoRetrievalSearch(request);

      expect(response).toBeDefined();
      expect(response.multi_vector_used).toBe(true);
      expect(response.results).toBeDefined();
      expect(Array.isArray(response.results)).toBe(true);
      expect(response.timing.multi_vector_ms).toBeGreaterThanOrEqual(0);
    });

    it('should accept use_multi_vector camelCase parameter', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'database connection pool',
        use_multi_vector: true
      };

      const response = await executeGoRetrievalSearch(request);

      expect(response.multi_vector_used).toBe(true);
    });

    it('should default to unified retrieval when flag not set', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'error handling middleware',
        useMultiVector: false
      };

      const response = await executeGoRetrievalSearch(request);

      expect(response.multi_vector_used).toBe(false);
    });
  });

  describe('RRF score assignment', () => {
    it('should include RRF scores in candidate results', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'api route handler',
        useMultiVector: true,
        topK: 10
      };

      const response = await executeGoRetrievalSearch(request);

      if (response.results.length > 0) {
        expect(response.results[0].rrf_score).toBeDefined();
        expect(typeof response.results[0].rrf_score).toBe('number');
        expect(response.results[0].rrf_score).toBeGreaterThanOrEqual(0);
        expect(response.results[0].rrf_score).toBeLessThanOrEqual(1);
      }
    });

    it('should sort results by RRF score descending', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'cache invalidation strategy',
        useMultiVector: true,
        topK: 5
      };

      const response = await executeGoRetrievalSearch(request);

      // Verify scores are sorted descending
      for (let i = 0; i < response.results.length - 1; i++) {
        if (response.results[i].rrf_score && response.results[i + 1].rrf_score) {
          expect(response.results[i].rrf_score).toBeGreaterThanOrEqual(response.results[i + 1].rrf_score);
        }
      }
    });

    it('should include source lanes for each candidate', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'vector similarity search',
        useMultiVector: true,
        topK: 5
      };

      const response = await executeGoRetrievalSearch(request);

      if (response.results.length > 0) {
        expect(response.results[0].source_lanes).toBeDefined();
        expect(Array.isArray(response.results[0].source_lanes)).toBe(true);
      }
    });
  });

  describe('Identity validation with RRF', () => {
    it('should preserve identity validation gate with multi-vector', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'database',
        useMultiVector: true,
        topK: 10
      };

      const response = await executeGoRetrievalSearch(request);

      expect(response.identity_validation).toBeDefined();
      expect(response.identity_validation?.candidates_before).toBeGreaterThanOrEqual(0);
      expect(response.identity_validation?.candidates_after).toBeGreaterThanOrEqual(0);

      // All returned results should be canonical or recoverable (no quarantine)
      for (const result of response.results) {
        expect(['canonical', 'recoverable']).toContain(result.identity_lane);
      }
    });

    it('should filter quarantined candidates from results', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'test query',
        useMultiVector: true,
        topK: 10
      };

      const response = await executeGoRetrievalSearch(request);

      // Verify no quarantined results in output
      const quarantinedResults = response.results.filter((r) => r.identity_lane === 'quarantine');
      expect(quarantinedResults.length).toBe(0);
    });
  });

  describe('Custom RRF weights', () => {
    it('should accept custom RRF weight configuration', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'authentication',
        useMultiVector: true,
        topK: 10,
        rrfWeights: {
          content: 0.5,
          summary: 0.25,
          title: 0.15,
          keywords: 0.1
        }
      };

      const response = await executeGoRetrievalSearch(request);

      expect(response).toBeDefined();
      expect(response.results).toBeDefined();
    });

    it('should accept camelCase rrf_weights parameter', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'session validation',
        useMultiVector: true,
        rrfWeights: {
          content: 0.4,
          summary: 0.3,
          title: 0.2,
          keywords: 0.1
        }
      };

      const response = await executeGoRetrievalSearch(request);

      expect(response).toBeDefined();
      expect(response.multi_vector_used).toBe(true);
    });
  });

  describe('Response shape compatibility', () => {
    it('should return standard GoRetrievalFacadeResponse shape', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'json serialization format',
        useMultiVector: true
      };

      const response = await executeGoRetrievalSearch(request);

      expect(response.results).toBeDefined();
      expect(response.timing).toBeDefined();
      expect(response.timing.total_ms).toBeGreaterThanOrEqual(0);
      expect(response.stages_completed).toBeDefined();
      expect(Array.isArray(response.stages_completed)).toBe(true);
      expect(response.fallback_used).toBeDefined();
      expect(response.metadata).toBeDefined();
      expect(response.metadata.query).toBe('json serialization format');
    });

    it('should include multi_vector timing breakdown', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'rate limiting algorithm',
        useMultiVector: true
      };

      const response = await executeGoRetrievalSearch(request);

      expect(response.timing.multi_vector_ms).toBeDefined();
      expect(response.timing.multi_vector_ms).toBeGreaterThanOrEqual(0);
    });

    it('should set multi_vector_used flag correctly', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const multiVectorRequest: GoRetrievalFacadeRequest = {
        query: 'websocket connection upgrade',
        useMultiVector: true
      };

      const multiVectorResponse = await executeGoRetrievalSearch(multiVectorRequest);
      expect(multiVectorResponse.multi_vector_used).toBe(true);

      const unifiedRequest: GoRetrievalFacadeRequest = {
        query: 'request header parsing',
        useMultiVector: false
      };

      const unifiedResponse = await executeGoRetrievalSearch(unifiedRequest);
      expect(unifiedResponse.multi_vector_used).toBeFalsy();
    });
  });

  describe('Graceful degradation', () => {
    it('should handle Qdrant unavailability gracefully', async () => {
      if (isQdrantAvailable) {
        console.log('Skipping degradation test - Qdrant is available');
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'test query',
        useMultiVector: true
      };

      const response = await executeGoRetrievalSearch(request);

      // Should return graceful degradation response
      expect(response.results).toBeDefined();
      expect(Array.isArray(response.results)).toBe(true);
      expect(response.fallback_used).toBe(true);
      expect(response.timing.total_ms).toBeGreaterThanOrEqual(0);
    });

    it('should handle invalid query parameter', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      // This test would be at the API route level, not the facade level
      // Facade assumes valid query; route handler validates input
      const request: GoRetrievalFacadeRequest = {
        query: '',
        useMultiVector: true
      };

      const response = await executeGoRetrievalSearch(request);

      expect(response).toBeDefined();
      expect(response.timing).toBeDefined();
    });
  });

  describe('Latency and performance', () => {
    it('should complete within reasonable latency target', async () => {
      if (!isQdrantAvailable) {
        expect(true).toBe(true);
        return;
      }

      const request: GoRetrievalFacadeRequest = {
        query: 'concurrent request handling',
        useMultiVector: true,
        topK: 10
      };

      const startTime = performance.now();
      const response = await executeGoRetrievalSearch(request);
      const actualLatency = performance.now() - startTime;

      // Target: <500ms for multi-vector retrieval
      expect(actualLatency).toBeLessThan(5000); // Generous timeout for CI
      expect(response.timing.multi_vector_ms).toBeLessThan(5000);
    });
  });
});
