// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock('../../../../../../../../sveltekit-frontend/src/lib/server/env.server.js', () => ({
  ENV: {
    QDRANT_URL: 'http://qdrant.test',
  },
}));

describe('sveltekit-frontend/src/routes/api/mcp/select-tools/+server.ts', () => {
  describe('POST /sveltekit-frontend/src/routes/api/mcp/select-tools', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      vi.stubGlobal('fetch', mocks.fetch);
      const mod = await import('../../../../../../../../sveltekit-frontend/src/routes/api/mcp/select-tools/+server.js') as Record<string, unknown>;
      handler = mod.POST as typeof handler;
    });

    function makeReq(body?: unknown) {
      return new Request(
        'http://localhost/sveltekit-frontend/src/routes/api/mcp/select-tools',
        body !== undefined
          ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
      );
    }

    function makeUrl() {
      return new URL('http://localhost/sveltekit-frontend/src/routes/api/mcp/select-tools');
    }

    it('400 — rejects invalid input shape', async () => {
      const resp = await handler({ request: makeReq({ top_k: 0 }), locals: {}, url: makeUrl(), params: {} });
      expect(resp.status).toBe(400);
      const data = await resp.json();
      expect(data.error).toBe('Invalid request');
    });

    it('200 — returns bootstrap, recent, and qdrant-ranked tools', async () => {
      const { recordToolUsage } = await import('../../../../../../../../sveltekit-frontend/src/lib/server/ai/tool-selection.js');
      recordToolUsage('graph.expand_neighborhood');

      mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/api/embeddings')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ embedding: Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0)) }),
          } as Response;
        }

        if (String(url).includes('/collections/codebase_chunks_768/points/search')) {
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          expect(body.vector?.name).toBe('content');
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                result: [
                  {
                    score: 0.92,
                    payload: {
                      tool_name: 'trace.kag_search',
                      llama_name: 'trace__kag_search',
                      ontology: ['retrieval'],
                    },
                  },
                  {
                    score: 0.87,
                    payload: {
                      tool_name: 'kb.search_cards',
                      llama_name: 'kb__search_cards',
                      ontology: ['knowledge_base'],
                    },
                  },
                ],
              }),
          } as Response;
        }

        throw new Error(`Unexpected fetch: ${url}`);
      });

      const resp = await handler({
        request: makeReq({ query: 'tool search for retrieval', top_k: 2, bootstrap: true, domain: 'code' }),
        locals: {},
        url: makeUrl(),
        params: {},
      });

      expect(resp.status).toBe(200);
      const data = await resp.json();

      expect(data.bootstrap).toBe(true);
      expect(data.source).toBe('qdrant');
      expect(data.embed_ok).toBe(true);
      expect(data.always_include).toContain('search.dev_context');
      expect(data.recent_tools).toContain('graph.expand_neighborhood');
      expect(data.mcp_names).toEqual(
        expect.arrayContaining([
          'search.dev_context',
          'codebase.rg_search',
          'trace.kag_search',
          'graph.expand_neighborhood',
        ])
      );
      expect(data.llama_names).toEqual(
        expect.arrayContaining([
          'search__dev_context',
          'codebase__rg_search',
          'trace__kag_search',
          'graph__expand_neighborhood',
        ])
      );
      expect(Array.isArray(data.tool_defs)).toBe(true);
      expect(data.tool_defs.length).toBeGreaterThan(0);
    });

    it('200 — falls back to the bounded defaults when embedding search is unavailable', async () => {
      mocks.fetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'service unavailable',
      } as Response);

      const resp = await handler({
        request: makeReq({ query: 'unclear request', top_k: 3 }),
        locals: {},
        url: makeUrl(),
        params: {},
      });

      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.source).toBe('fallback');
      expect(data.embed_ok).toBe(false);
      expect(data.mcp_names).toEqual(expect.arrayContaining(['search.dev_context', 'codebase.rg_search']));
    });
  });
});
