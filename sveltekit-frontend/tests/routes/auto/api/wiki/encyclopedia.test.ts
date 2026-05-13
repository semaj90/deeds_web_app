// @vitest-environment node
/**
 * ENHANCED TEST — verifies auth, zod validation, and happy path.
 *
 * Route: src/routes/api/wiki/encyclopedia/+server.ts
 * Handlers: POST
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAssemble } = vi.hoisted(() => ({
  mockAssemble: vi.fn()
}));

vi.mock('$lib/server/wiki/encyclopedia', () => ({
  assembleACEContext: mockAssemble
}));

describe('src/routes/api/wiki/encyclopedia/+server.ts', () => {
  describe('POST /api/wiki/encyclopedia', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = await import('../../../../../src/routes/api/wiki/encyclopedia/+server.js') as Record<string, unknown>;
      handler = mod.POST as typeof handler;

      mockAssemble.mockResolvedValue({
        summary: 'Topological summary of Svelte 5',
        entities: ['runes', 'snippets'],
        relations: []
      });
    });

    function makeReq(body: unknown) {
      return new Request('http://localhost/api/wiki/encyclopedia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }
    function makeUrl() { return new URL('http://localhost/api/wiki/encyclopedia'); }

    it('401 — returns Unauthorized when locals.user is missing', async () => {
      const resp = await handler({ request: makeReq({ query: 'test' }), locals: {}, url: makeUrl(), params: {} });
      expect(resp.status).toBe(401);
      const body = await resp.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('400 — returns Invalid input for empty query', async () => {
      const resp = await handler({ 
        request: makeReq({ query: '' }), 
        locals: { user: { id: 1 } }, 
        url: makeUrl(), 
        params: {} 
      });
      
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.error).toBe('Invalid input');
    });

    it('200 — returns context data for valid query', async () => {
      const resp = await handler({ 
        request: makeReq({ query: 'Svelte 5 runes' }), 
        locals: { user: { id: 1 } }, 
        url: makeUrl(), 
        params: {} 
      });
      
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.error).toBeNull();
      expect(body.data.summary).toBe('Topological summary of Svelte 5');
      expect(mockAssemble).toHaveBeenCalledWith('Svelte 5 runes');
    });

    it('500 — returns Internal server error on failure', async () => {
      mockAssemble.mockRejectedValue(new Error('DB failure'));
      
      const resp = await handler({ 
        request: makeReq({ query: 'test' }), 
        locals: { user: { id: 1 } }, 
        url: makeUrl(), 
        params: {} 
      });
      
      expect(resp.status).toBe(500);
      const body = await resp.json();
      expect(body.error).toBe('Internal server error');
    });
  });
});
