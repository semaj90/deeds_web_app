// @vitest-environment node
/**
 * ENHANCED TEST — verifies auth, happy path, and error states.
 *
 * Route: src/routes/api/topology/centroids/+server.ts
 * Handlers: GET
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockHget, mockHgetall } = vi.hoisted(() => ({
  mockHget: vi.fn(),
  mockHgetall: vi.fn()
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    hget: mockHget,
    hgetall: mockHgetall
  })
}));

describe('src/routes/api/topology/centroids/+server.ts', () => {
  describe('GET /api/topology/centroids', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = await import('../../../../../src/routes/api/topology/centroids/+server.js') as Record<string, unknown>;
      handler = mod.GET as typeof handler;

      // Default mocks
      const data = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      mockHget.mockResolvedValue(Buffer.from(data.buffer).toString('base64'));
      mockHgetall.mockResolvedValue({
        count: '4',
        dim: '64',
        gridRows: '2',
        gridCols: '2'
      });
    });

    function makeReq() {
      return new Request('http://localhost/api/topology/centroids', { method: 'GET' });
    }
    function makeUrl() { return new URL('http://localhost/api/topology/centroids'); }

    it('401 — returns Unauthorized when locals.user is missing', async () => {
      const resp = await handler({ request: makeReq(), locals: {}, url: makeUrl(), params: {} });
      expect(resp.status).toBe(401);
      const body = await resp.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.centroids).toEqual([]);
    });

    it('200 — returns centroids when authorized', async () => {
      const resp = await handler({ 
        request: makeReq(), 
        locals: { user: { id: 1 } }, 
        url: makeUrl(), 
        params: {} 
      });
      
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.centroids).toHaveLength(4);
      expect(body.centroids[0]).toBeCloseTo(0.1);
      expect(body.meta.count).toBe(4);
    });

    it('404 — returns error when centroids are missing in Redis', async () => {
      mockHget.mockResolvedValue(null);
      
      const resp = await handler({ 
        request: makeReq(), 
        locals: { user: { id: 1 } }, 
        url: makeUrl(), 
        params: {} 
      });
      
      expect(resp.status).toBe(404);
      const body = await resp.json();
      expect(body.error).toBe('Centroids not found');
    });
  });
});
