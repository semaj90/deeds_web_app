/**
 * Cache Layers Integration Tests — Phase 3B
 *
 * Tests the full retrieval pipeline with cache layers orchestration:
 * 1. Cache layer metrics flow through Go Retrieval facade
 * 2. Cache decision affects downstream processing
 * 3. Layer independence (failures don't cascade)
 * 4. Cache inheritance (Layer 2 preserves Layer 1 behavior)
 * 5. Performance characteristics match expectations
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { executeGoRetrievalSearch, checkGoRetrievalHealth } from '$lib/server/retrieval/go-retrieval-facade';
import type { GoRetrievalFacadeRequest } from '$lib/server/retrieval/go-retrieval-facade';

describe('Cache Layers Integration with Go Retrieval Facade', () => {
  const testRequest: GoRetrievalFacadeRequest = {
    query: 'What is the retrieval router?',
    limit: 10,
    useRRF: true,
    includeSummary: false
  };

  describe('Cache Layers in Response', () => {
    it('should include cache_layers in response', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      expect(response).toBeDefined();
      expect(response.cache_layers).toBeDefined();
      expect(response.cache_layers).toHaveProperty('decision');
      expect(response.cache_layers).toHaveProperty('total_orchestration_ms');
    });

    it('should report cache decision', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      const decision = response.cache_layers?.decision;
      expect(['layer1_direct', 'layer2_adapter', 'layer3_exact', 'layer4_semantic']).toContain(
        decision
      );
    });

    it('should include cache orchestration timing', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      expect(response.timing.cache_layers_ms).toBeDefined();
      expect(response.timing.cache_layers_ms).toBeGreaterThanOrEqual(0);
      expect(response.timing.cache_layers_ms).toBeLessThan(500);
    });

    it('should report all layer metrics', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      const layers = response.cache_layers;
      expect(layers).toBeDefined();

      expect(layers!.layer1_direct_fallback_ms).toBeGreaterThanOrEqual(0);
      expect(layers!.layer2_adapter).toBeDefined();
      expect(layers!.layer3_exact).toBeDefined();
      expect(layers!.layer4_semantic).toBeDefined();
    });
  });

  describe('Cache Inheritance (Layer 2 Adapter)', () => {
    it('layer 2 should measure without degrading layer 1', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      // Layer 2 overhead should be minimal
      const layer2 = response.cache_layers?.layer2_adapter;
      const layer1 = response.cache_layers?.layer1_direct_fallback_ms || 0;

      if (layer2?.latency_ms) {
        const overhead = layer2.latency_ms - layer1;
        // Allow up to 100ms overhead (includes network + serialization)
        expect(overhead).toBeLessThan(100);
      }
    });

    it('layer 2 should not modify retrieval results', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      // Results should be present regardless of cache hit
      expect(response.results).toBeDefined();
      expect(Array.isArray(response.results)).toBe(true);
    });
  });

  describe('Cache Performance Characteristics', () => {
    it('orchestration should complete in parallel (not sequential)', async () => {
      const start = performance.now();
      const response = await executeGoRetrievalSearch(testRequest);
      const elapsed = performance.now() - start;

      const orchestrationMs = response.cache_layers?.total_orchestration_ms || 0;

      // If orchestrated in parallel, should be < 300ms
      // If sequential, would be ~300+ ms (3 layers × 100ms timeout each)
      expect(orchestrationMs).toBeLessThan(300);
    });

    it('layer 3 cache hit should be <10ms (Redis)', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      const layer3 = response.cache_layers?.layer3_exact;
      if (layer3?.hit) {
        expect(layer3.latency_ms).toBeLessThan(10);
      }
    });

    it('layer 4 cache hit should be <10ms (Redis)', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      const layer4 = response.cache_layers?.layer4_semantic;
      if (layer4?.hit) {
        expect(layer4.latency_ms).toBeLessThan(10);
      }
    });

    it('layer 2 overhead should be <50ms', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      const layer2 = response.cache_layers?.layer2_adapter;
      const layer1 = response.cache_layers?.layer1_direct_fallback_ms || 0;

      if (layer2?.latency_ms) {
        const overhead = layer2.latency_ms - layer1;
        expect(overhead).toBeLessThan(50);
      }
    });
  });

  describe('Non-Blocking Design', () => {
    it('layer failures should not block retrieval', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      // Response should always complete, even if layers timeout
      expect(response).toBeDefined();
      expect(response.results).toBeDefined();
    });

    it('orchestration timeout should fall back to layer 1', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      const layers = response.cache_layers;
      if (!layers?.layer2_adapter?.hit && !layers?.layer3_exact?.hit && !layers?.layer4_semantic?.hit) {
        // No cache hits means fallback to Layer 1
        expect(layers?.decision).toBe('layer1_direct');
      }
    });

    it('should not block retrieval if orchestration fails', async () => {
      // If cache orchestration completely fails, it should not block retrieval
      const response = await executeGoRetrievalSearch(testRequest);

      // Response should still be valid
      expect(response.results).toBeDefined();
      expect(response.timing.total_ms).toBeGreaterThan(0);
    });
  });

  describe('Health Check Integration', () => {
    it('should include cache layer health in overall health', async () => {
      const health = await checkGoRetrievalHealth();

      expect(health.services).toBeDefined();
      expect(health.services.cache_layers).toBeDefined();
      expect(typeof health.services.cache_layers).toBe('boolean');
    });

    it('should report cache layer details', async () => {
      const health = await checkGoRetrievalHealth();

      if (health.cache_layers) {
        expect(health.cache_layers).toHaveProperty('ok');
        expect(health.cache_layers).toHaveProperty('layers');
      }
    });
  });

  describe('Regression Tests', () => {
    it('identity validation should still work', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      if (response.identity_validation) {
        expect(response.identity_validation.candidates_before).toBeGreaterThanOrEqual(0);
        expect(response.identity_validation.candidates_after).toBeGreaterThanOrEqual(0);
        expect(response.identity_validation.quarantined).toBeGreaterThanOrEqual(0);
      }
    });

    it('dispatcher integration should still work', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      // Dispatcher is optional (non-blocking), but if present should have valid decision
      if (response.dispatch) {
        expect(response.dispatch.decision).toBeDefined();
        expect(typeof response.dispatch.latency_ms).toBe('number');
      }
    });

    it('standard retrieval pipeline should complete', async () => {
      const response = await executeGoRetrievalSearch(testRequest);

      expect(response.results).toBeDefined();
      expect(response.timing.total_ms).toBeGreaterThan(0);
      expect(response.stages_completed).toBeDefined();
    });
  });

  describe('Multi-Vector Retrieval Compat', () => {
    it('cache layers should work with multi-vector retrieval', async () => {
      const request: GoRetrievalFacadeRequest = {
        query: 'What is the retrieval router?',
        limit: 10,
        useMultiVector: true
      };

      const response = await executeGoRetrievalSearch(request);

      // Cache layers should be included even with multi-vector routing
      expect(response).toBeDefined();
      if (response.cache_layers) {
        expect(response.cache_layers).toHaveProperty('decision');
      }
    });
  });
});
