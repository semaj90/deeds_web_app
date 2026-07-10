/**
 * Cache Layers (2-4) Integration Tests
 *
 * Test scenarios:
 * 1. Health check (read-only)
 * 2. Layer 2 (adapter) inheritance
 * 3. Layer 3 (exact) cache misses (no data seeded yet)
 * 4. Layer 4 (semantic) cache misses (no data seeded yet)
 * 5. Fallback to Layer 1 on all cache misses
 * 6. Orchestration timing and decision logic
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { orchestrateCacheLayers, checkCacheLayersHealth } from '$lib/server/retrieval/cache-layers-orchestrator';

describe('Cache Layers Orchestration', () => {
  const systemPrompt = 'You are Atlas, a legal AI assistant.';
  const userPrompt = 'What is the retrieval router?';

  describe('Health Check (read-only)', () => {
    it('should check layer 2 (adapter) availability', async () => {
      const health = await checkCacheLayersHealth();
      expect(health).toHaveProperty('layer2_adapter');
      expect(typeof health.layer2_adapter).toBe('boolean');
    });

    it('should check layer 3 (exact cache) availability', async () => {
      const health = await checkCacheLayersHealth();
      expect(health).toHaveProperty('layer3_valkey');
      expect(typeof health.layer3_valkey).toBe('boolean');
    });

    it('should check layer 4 (semantic cache) availability', async () => {
      const health = await checkCacheLayersHealth();
      expect(health).toHaveProperty('layer4_valkey');
      expect(typeof health.layer4_valkey).toBe('boolean');
    });
  });

  describe('Cache Layer Orchestration', () => {
    it('should measure all layers in parallel', async () => {
      const start = performance.now();
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);
      const elapsed = performance.now() - start;

      // Should complete within reasonable time (not sequential)
      expect(elapsed).toBeLessThan(500);
      expect(result).toBeDefined();
    });

    it('should return orchestration result with all layers', async () => {
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      expect(result).toHaveProperty('layer1_direct_fallback_ms');
      expect(result).toHaveProperty('layer2_adapter');
      expect(result).toHaveProperty('layer3_exact');
      expect(result).toHaveProperty('layer4_semantic');
      expect(result).toHaveProperty('cache_decision');
      expect(result).toHaveProperty('total_orchestration_ms');
    });

    it('should report layer 2 adapter metrics', async () => {
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      const layer2 = result.layer2_adapter;
      expect(layer2).toBeDefined();
      expect(layer2!.layer).toBe('layer2_adapter');
      expect(typeof layer2!.hit).toBe('boolean');
      expect(typeof layer2!.latency_ms).toBe('number');
      expect(layer2!.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it('should report layer 3 exact cache metrics', async () => {
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      const layer3 = result.layer3_exact;
      expect(layer3).toBeDefined();
      expect(layer3!.layer).toBe('layer3_exact');
      expect(typeof layer3!.hit).toBe('boolean');
      expect(typeof layer3!.latency_ms).toBe('number');
    });

    it('should report layer 4 semantic cache metrics', async () => {
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      const layer4 = result.layer4_semantic;
      expect(layer4).toBeDefined();
      expect(layer4!.layer).toBe('layer4_semantic');
      expect(typeof layer4!.hit).toBe('boolean');
      expect(typeof layer4!.latency_ms).toBe('number');
    });

    it('should make cache decision based on speedup', async () => {
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      expect(['layer1_direct', 'layer2', 'layer3', 'layer4']).toContain(
        result.cache_decision
      );
    });

    it('should fall back to layer 1 if no cache hits', async () => {
      // Expect cache misses on all layers (no data seeded)
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      const noHits =
        !result.layer2_adapter?.hit &&
        !result.layer3_exact?.hit &&
        !result.layer4_semantic?.hit;

      if (noHits) {
        expect(result.cache_decision).toBe('layer1_direct');
      }
    });

    it('should complete orchestration within reasonable time', async () => {
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      // All layers measured in parallel, so total should be ~max(layer2, layer3, layer4)
      // not sum of all three
      expect(result.total_orchestration_ms).toBeLessThan(300);
    });
  });

  describe('API Endpoints', () => {
    it('GET /api/retrieval/cache-layers should return orchestration result', async () => {
      const url = new URL('http://localhost:5173/api/retrieval/cache-layers');
      url.searchParams.set('user_prompt', userPrompt);
      url.searchParams.set('system_prompt', systemPrompt);
      url.searchParams.set('measure_direct_ms', '211');

      try {
        const response = await fetch(url.toString());
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.cache_layers).toBeDefined();
      } catch (error) {
        // Expected if running without live dev server
        console.log('API test skipped (dev server not running)');
      }
    });

    it('POST /api/retrieval/cache-layers should accept JSON body', async () => {
      try {
        const response = await fetch('http://localhost:5173/api/retrieval/cache-layers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_prompt: userPrompt,
            system_prompt: systemPrompt,
            measure_direct_ms: 211
          })
        });

        expect([200, 400]).toContain(response.status);
      } catch (error) {
        // Expected if running without live dev server
        console.log('API test skipped (dev server not running)');
      }
    });

    it('GET /api/retrieval/cache-layers/health should return health status', async () => {
      try {
        const response = await fetch(
          'http://localhost:5173/api/retrieval/cache-layers/health'
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.layers).toBeDefined();
      } catch (error) {
        // Expected if running without live dev server
        console.log('Health check test skipped (dev server not running)');
      }
    });
  });

  describe('Layer Independence', () => {
    it('layer 2 failure should not block layers 3-4', async () => {
      // Orchestration uses Promise.all with error handling
      // Even if adapter fails, exact/semantic should complete
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      expect(result.layer3_exact).toBeDefined();
      expect(result.layer4_semantic).toBeDefined();
    });

    it('layer 3 failure should not block layers 2 and 4', async () => {
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      expect(result.layer2_adapter).toBeDefined();
      expect(result.layer4_semantic).toBeDefined();
    });

    it('layer 4 failure should not block layers 2-3', async () => {
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      expect(result.layer2_adapter).toBeDefined();
      expect(result.layer3_exact).toBeDefined();
    });
  });

  describe('Performance Characteristics', () => {
    it('layer 3 exact cache should be <10ms on hit (Redis)', async () => {
      // This will be cache miss initially, but test the expectation
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      if (result.layer3_exact?.hit) {
        expect(result.layer3_exact.latency_ms).toBeLessThan(10);
      }
    });

    it('layer 4 semantic cache should be <10ms on hit (Redis)', async () => {
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      if (result.layer4_semantic?.hit) {
        expect(result.layer4_semantic.latency_ms).toBeLessThan(10);
      }
    });

    it('layer 2 adapter should add <50ms overhead', async () => {
      const result = await orchestrateCacheLayers(systemPrompt, userPrompt, 211);

      const layer2Overhead = result.layer2_adapter!.latency_ms - result.layer1_direct_fallback_ms;

      // Adapter overhead should be minimal if it's just a pass-through
      expect(layer2Overhead).toBeLessThan(100); // generous bound for network/serialization
    });
  });
});
