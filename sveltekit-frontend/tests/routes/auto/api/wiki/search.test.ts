// @vitest-environment node
/**
 * ENHANCED TEST — verifies auth, zod validation, and search route behavior.
 *
 * Route: src/routes/api/wiki/search/+server.ts
 * Handlers: GET, POST
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSearchWiki } = vi.hoisted(() => ({
  mockSearchWiki: vi.fn()
}));

vi.mock('$lib/server/kb/wiki-logic', () => ({
  searchWiki: mockSearchWiki
}));

describe('src/routes/api/wiki/search/+server.ts', () => {
  describe('GET/POST /api/wiki/search', () => {
    let handlerGet: any;
    let handlerPost: any;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = await import('../../../../../src/routes/api/wiki/search/+server.js') as Record<string, unknown>;
      handlerGet = mod.GET;
      handlerPost = mod.POST;

      mockSearchWiki.mockResolvedValue([
        {
          id: 'wiki:one',
          kind: 'agents_card',
          label: 'One',
          path: 'src/lib/server/one',
          summary: 'First hit',
          score: 0.91,
          sources: ['postgres_jsonb'],
          trace: { used: ['postgres_jsonb'] }
        }
      ]);
    });

    function makeUrl(query = 'one') {
      return new URL(`http://localhost/api/wiki/search?query=${encodeURIComponent(query)}&limit=5`);
    }

    function makeRequest(body: unknown) {
      return new Request('http://localhost/api/wiki/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    it('401 — returns Unauthorized when locals.user is missing', async () => {
      const resp = await handlerGet({ url: makeUrl(), locals: {}, params: {} });
      expect(resp.status).toBe(401);
      const body = await resp.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('400 — returns Invalid parameters for empty query', async () => {
      const resp = await handlerGet({ url: makeUrl(''), locals: { user: { id: 1 } }, params: {} });
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid parameters');
    });

    it('200 — returns results for GET search', async () => {
      const resp = await handlerGet({ url: makeUrl('one'), locals: { user: { id: 1 } }, params: {} });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.results).toHaveLength(1);
      expect(mockSearchWiki).toHaveBeenCalledWith('one', { limit: 5 });
    });

    it('200 — returns results for POST search', async () => {
      const resp = await handlerPost({ request: makeRequest({ query: 'one', limit: 7 }), locals: { user: { id: 1 } }, params: {} });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(body.results).toHaveLength(1);
      expect(mockSearchWiki).toHaveBeenCalledWith('one', { limit: 7 });
    });
  });
});
