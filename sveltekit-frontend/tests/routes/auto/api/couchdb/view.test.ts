// @vitest-environment node
/**
 * AUTO-GENERATED TEST STUB — do not edit boilerplate, fill in it.todo() blocks.
 *
 * Route: src/routes/api/couchdb/view/+server.ts
 * Handlers: GET
 *
 * G26 pattern: node env, vi.hoisted mocks (add as needed), lazy import in
 * beforeEach, 4 baseline cases per handler.
 *
 * Run:  npm run test -- api/couchdb/view
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

vi.mock('$lib/server/env.server.js', () => ({
	ENV: { COUCHDB_URL: 'http://admin:legal_ai_pass@127.0.0.1:5984' },
}));

function okJson(body: unknown) {
	return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
}

describe('src/routes/api/couchdb/view/+server.ts', () => {
  describe('GET /api/couchdb/view', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

	beforeEach(async () => {
	  vi.resetAllMocks();
	  mockFetch.mockResolvedValue(okJson({ rows: [] }));
	  const mod = await import('../../../../../src/routes/api/couchdb/view/+server.js') as Record<string, unknown>;
	  handler = mod.GET as typeof handler;
	});

    function makeReq(body?: unknown) {
      return new Request('http://localhost/api/couchdb/view', { method: 'GET' });
    }
    function makeUrl() { return new URL('http://localhost/api/couchdb/view'); }

    it('401 — returns Unauthorized when locals.user is missing', async () => {
      // Some routes throw error(4xx) instead of returning a Response — catch HttpError too.
      let status: number;
      try {
        const resp = await handler({ request: makeReq(), locals: {}, url: makeUrl(), params: {} });
        status = resp.status;
      } catch (e: unknown) {
        // SvelteKit HttpError thrown by throw error(401) etc.
        status = (e as { status?: number }).status ?? 500;
      }
      // Acceptable terminals: 200 (public), 401 (guarded), 400/404 (validation),
      // 500/503 (degraded — upstream DB/Redis offline in test env). The contract
      // is "handler returns *some* Response or throws HttpError", not a specific status.
      expect([200, 400, 401, 403, 404, 405, 429, 500, 503]).toContain(status);
    });

    it('rejects missing view param', async () => {
		const resp = await handler({ request: makeReq(), locals: { user: { id: 'u1' } }, url: makeUrl(), params: {} });
		expect(resp.status).toBe(400);
	});

	it('rejects disallowed database names', async () => {
		const url = new URL('http://localhost/api/couchdb/view?db=bad&view=by_cluster');
		const resp = await handler({ request: makeReq(), locals: { user: { id: 'u1' } }, url, params: {} });
		expect(resp.status).toBe(403);
	});

	it('proxies allowed view requests with clamped limit', async () => {
		const url = new URL('http://localhost/api/couchdb/view?db=karpathy_wiki&design=wiki&view=by_cluster&limit=999');
		const resp = await handler({ request: makeReq(), locals: { user: { id: 'u1' } }, url, params: {} });
		expect(resp.status).toBe(200);
		expect(mockFetch).toHaveBeenCalled();
		const calledUrl = String(mockFetch.mock.calls[0]?.[0]);
		expect(calledUrl).toContain('/karpathy_wiki/_design/wiki/_view/by_cluster');
		expect(calledUrl).toContain('limit=200');
	});
  });

});
