// @vitest-environment node
/**
 * ENHANCED TEST — verifies auth, happy path, and degraded states.
 *
 * Route: src/routes/api/health/inference/+server.ts
 * Handlers: GET
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockResolveRuntimeConfig, mockCudaAvailable, mockTopologyHealthy } = vi.hoisted(() => ({
  mockResolveRuntimeConfig: vi.fn(),
  mockCudaAvailable: vi.fn(),
  mockTopologyHealthy: vi.fn()
}));

vi.mock('$lib/server/ai/inference-configs.js', () => ({
  resolveRuntimeConfig: mockResolveRuntimeConfig
}));

vi.mock('$lib/server/ai/cuda-graph-manager.js', () => ({
  CudaGraphManager: {
    isAvailable: mockCudaAvailable
  }
}));

vi.mock('$lib/server/retrieval/topology-search-client.js', () => ({
  isTopologySearchHealthy: mockTopologyHealthy
}));

describe('src/routes/api/health/inference/+server.ts', () => {
  describe('GET /api/health/inference', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      // Use dynamic import to ensure mocks are applied
      const mod = await import('../../../../../src/routes/api/health/inference/+server.js') as Record<string, unknown>;
      handler = mod.GET as typeof handler;

      // Default mocks
      mockResolveRuntimeConfig.mockReturnValue({
        profile: 'stock-cuda-iq4_xs',
        backend: 'cuda',
        turboQuant: false,
        runtimeAvailable: true,
        notes: 'Test notes'
      });
      mockCudaAvailable.mockReturnValue(true);
      mockTopologyHealthy.mockResolvedValue(true);
    });

    function makeReq() {
      return new Request('http://localhost/api/health/inference', { method: 'GET' });
    }
    function makeUrl() { return new URL('http://localhost/api/health/inference'); }

    it('401 — returns Unauthorized when locals.user is missing', async () => {
      const resp = await handler({ request: makeReq(), locals: {}, url: makeUrl(), params: {} });
      expect(resp.status).toBe(401);
      const body = await resp.json();
      expect(body.status).toBe('error');
      expect(body.error).toBe('Unauthorized');
      expect(body.runtime.profile).toBe('');
    });

    it('200 — returns inference health status when authorized', async () => {
      const resp = await handler({ 
        request: makeReq(), 
        locals: { user: { id: 1, email: 'test@example.com' } }, 
        url: makeUrl(), 
        params: {} 
      });
      
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe('ok');
      expect(body.runtime.profile).toBe('stock-cuda-iq4_xs');
      expect(body.gpu.cudaGraphSupported).toBe(true);
      expect(body.gpu.topologySearchHealthy).toBe(true);
    });

    it('degraded — returns status even when downstream services fail', async () => {
      mockTopologyHealthy.mockResolvedValue(false);
      
      const resp = await handler({ 
        request: makeReq(), 
        locals: { user: { id: 1 } }, 
        url: makeUrl(), 
        params: {} 
      });
      
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe('ok');
      expect(body.gpu.topologySearchHealthy).toBe(false);
    });
  });
});
