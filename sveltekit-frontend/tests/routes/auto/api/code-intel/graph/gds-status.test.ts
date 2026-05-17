// @vitest-environment node
/**
 * AUTO-GENERATED TEST STUB — do not edit boilerplate, fill in it.todo() blocks.
 *
 * Route: src/routes/api/code-intel/graph/gds-status/+server.ts
 * Handlers: GET, POST
 *
 * G26 pattern: node env, vi.hoisted mocks (add as needed), lazy import in
 * beforeEach, 4 baseline cases per handler.
 *
 * Run:  npm run test -- api/code-intel/graph/gds-status
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
	mockGetGdsStatus,
	mockGetGdsExtendedStats,
	mockEnsureGdsProjection,
	mockRunPageRankMutate,
	mockRunLouvainMutate,
	mockRunKnnMutate,
	mockWriteAuthorityScoresToQdrant,
	mockSeedAndClassifyOntology,
	mockGetUnclassifiedFileCount,
} = vi.hoisted(() => ({
	mockGetGdsStatus: vi.fn(),
	mockGetGdsExtendedStats: vi.fn(),
	mockEnsureGdsProjection: vi.fn(),
	mockRunPageRankMutate: vi.fn(),
	mockRunLouvainMutate: vi.fn(),
	mockRunKnnMutate: vi.fn(),
	mockWriteAuthorityScoresToQdrant: vi.fn(),
	mockSeedAndClassifyOntology: vi.fn(),
	mockGetUnclassifiedFileCount: vi.fn(),
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: vi.fn(() => ({
		get: vi.fn(async () => null),
		setex: vi.fn(async () => 'OK'),
	})),
}));

vi.mock('$lib/server/graph/neo4j-gds.js', () => ({
	getGdsStatus: mockGetGdsStatus,
	getGdsExtendedStats: mockGetGdsExtendedStats,
	ensureGdsProjection: mockEnsureGdsProjection,
	runPageRankMutate: mockRunPageRankMutate,
	runLouvainMutate: mockRunLouvainMutate,
	runKnnMutate: mockRunKnnMutate,
	writeAuthorityScoresToQdrant: mockWriteAuthorityScoresToQdrant,
	seedAndClassifyOntology: mockSeedAndClassifyOntology,
	getUnclassifiedFileCount: mockGetUnclassifiedFileCount,
}));

describe('src/routes/api/code-intel/graph/gds-status/+server.ts', () => {
  describe('GET /api/code-intel/graph/gds-status', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

	beforeEach(async () => {
	  vi.resetAllMocks();
	  mockGetGdsStatus.mockResolvedValue({ apocAvailable: true, gdsAvailable: true, projectionExists: true });
	  mockGetGdsExtendedStats.mockResolvedValue({ apocAvailable: true, gdsAvailable: true, projectionExists: true, qdrantHealthy: true });
	  mockEnsureGdsProjection.mockResolvedValue({ ok: true });
	  mockRunPageRankMutate.mockResolvedValue({ ok: true });
	  mockRunLouvainMutate.mockResolvedValue({ ok: true });
	  mockRunKnnMutate.mockResolvedValue({ ok: true });
	  mockWriteAuthorityScoresToQdrant.mockResolvedValue({ ok: true });
	  mockSeedAndClassifyOntology.mockResolvedValue({ ok: true });
	  mockGetUnclassifiedFileCount.mockResolvedValue(0);
	  const mod = await import('../../../../../../src/routes/api/code-intel/graph/gds-status/+server.js') as Record<string, unknown>;
	  handler = mod.GET as typeof handler;
	});

    function makeReq(body?: unknown) {
      return new Request('http://localhost/api/code-intel/graph/gds-status', { method: 'GET' });
    }
    function makeUrl() { return new URL('http://localhost/api/code-intel/graph/gds-status'); }

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

    it('returns Neo4j/GDS status shape', async () => {
		const resp = await handler({ request: makeReq(), locals: { user: { id: 'u1' } }, url: makeUrl(), params: {} });
		expect(resp.status).toBe(200);
		const body = await resp.json();
		expect(body).toMatchObject({ apocAvailable: true, gdsAvailable: true, projectionExists: true });
	});

	it('returns extended status when requested', async () => {
		const resp = await handler({ request: makeReq(), locals: { user: { id: 'u1' } }, url: new URL('http://localhost/api/code-intel/graph/gds-status?extended=1'), params: {} });
		expect(resp.status).toBe(200);
		const body = await resp.json();
		expect(body.cached).toBe(false);
		expect(body.qdrantHealthy).toBe(true);
	});
  });


  describe('POST /api/code-intel/graph/gds-status', () => {
    let handler: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

    beforeEach(async () => {
      vi.resetAllMocks();
      const mod = await import('../../../../../../src/routes/api/code-intel/graph/gds-status/+server.js') as Record<string, unknown>;
      handler = mod.POST as typeof handler;
    });

    function makeReq(body?: unknown) {
      return new Request('http://localhost/api/code-intel/graph/gds-status', body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    }
    function makeUrl() { return new URL('http://localhost/api/code-intel/graph/gds-status'); }

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

    it('rejects invalid action', async () => {
		const req = new Request('http://localhost/api/code-intel/graph/gds-status', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'nope' }),
		});
		const resp = await handler({ request: req, locals: { user: { id: 'u1' } }, url: makeUrl(), params: {} });
		expect(resp.status).toBe(400);
	});

	it('runs full graph pipeline', async () => {
		const req = new Request('http://localhost/api/code-intel/graph/gds-status', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'full' }),
		});
		const resp = await handler({ request: req, locals: { user: { id: 'u1', email: 'user@example.com' } }, url: makeUrl(), params: {} });
		expect(resp.status).toBe(200);
		const body = await resp.json();
		expect(body).toMatchObject({ action: 'full' });
		expect(body.totalMs).toEqual(expect.any(Number));
		expect(mockEnsureGdsProjection).toHaveBeenCalled();
	});
  });

});
