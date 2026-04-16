// @vitest-environment node
/**
 * Codebase-Index Degraded-Shape + Leak-Sanitization Tests
 *
 * Contract (from CLAUDE.md):
 *   - GET handler catch blocks return the SAME top-level JSON keys as success
 *   - Degraded response uses empty/zero defaults
 *   - No internal detail (Qdrant HTTP status codes) leaks into `error` fields
 *
 * Routes covered:
 *   1. GET /api/codebase-index        — main file listing (uses global fetch)
 *   2. GET /api/codebase-index/stats  — dashboard stats (uses event.fetch)
 *   3. GET /api/codebase-index/clusters — cluster list (uses event.fetch)
 *
 * Pattern (G26 — lazy-import):
 *   - vi.hoisted() for variables referenced inside vi.mock() factories
 *   - Lazy-import handler inside beforeEach so mock state is fresh
 *   - 4 baseline cases per route: 401, success, degraded upstream, key-set parity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGlobalFetch } = vi.hoisted(() => {
	const mockGlobalFetch = vi.fn();
	return { mockGlobalFetch };
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/config/env.server.js', () => ({
	getQdrantUrl: () => 'http://localhost:6333',
	getOllamaUrl: () => 'http://localhost:11434',
	getCodebaseIndexUrl: () => 'http://localhost:8099',
}));

vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({
	fastJsonParse: (text: string) => JSON.parse(text),
	isSimdJsonAvailable: () => false,
}));

// ollamaFetch is only used by the POST handler — mock to prevent import errors
vi.mock('$lib/server/ollama.js', () => ({
	ollamaFetch: vi.fn(),
}));

// ── response factories ────────────────────────────────────────────────────────

function makeQdrantScrollOk(points: unknown[] = []) {
	const body = JSON.stringify({ result: { points } });
	return {
		ok: true,
		status: 200,
		json: () => Promise.resolve(JSON.parse(body)),
		text: () => Promise.resolve(body),
	} as unknown as Response;
}

function makeQdrantCountOk(count = 0) {
	return {
		ok: true,
		status: 200,
		json: () => Promise.resolve({ result: { count } }),
		text: () => Promise.resolve(JSON.stringify({ result: { count } })),
	} as unknown as Response;
}

function makeQdrantCollectionOk(pointsCount = 0) {
	return {
		ok: true,
		status: 200,
		json: () => Promise.resolve({ result: { points_count: pointsCount } }),
		text: () => Promise.resolve(JSON.stringify({ result: { points_count: pointsCount } })),
	} as unknown as Response;
}

function makeQdrantError(status = 503) {
	return {
		ok: false,
		status,
		json: () => Promise.reject(new Error('Qdrant down')),
		text: () => Promise.resolve('Service Unavailable'),
	} as unknown as Response;
}

/** Event for GET /api/codebase-index — handler uses global fetch, not event.fetch */
function makeCIEvent(userId: string | null = 'user-1') {
	return {
		locals: { user: userId ? { id: userId } : null },
		url: new URL('http://localhost/api/codebase-index'),
		request: new Request('http://localhost/api/codebase-index'),
		params: {},
		route: { id: '/api/codebase-index' },
	} as Parameters<typeof import('../../src/routes/api/codebase-index/+server.js').GET>[0];
}

/** Event for routes that destructure fetch from the event (stats, clusters) */
function makeEventFetch(route: string, userId: string | null = 'user-1', eventFetch = mockGlobalFetch) {
	return {
		locals: { user: userId ? { id: userId } : null },
		url: new URL(`http://localhost${route}`),
		request: new Request(`http://localhost${route}`),
		params: {},
		route: { id: route },
		fetch: eventFetch as unknown as typeof fetch,
	};
}

// ── GET /api/codebase-index ───────────────────────────────────────────────────

describe('GET /api/codebase-index — degraded-shape + leak-sanitization', () => {
	let GET: (typeof import('../../src/routes/api/codebase-index/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', mockGlobalFetch);
		const mod = await import('../../src/routes/api/codebase-index/+server.js');
		GET = mod.GET;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns 401 when user is absent', async () => {
		const res = await GET(makeCIEvent(null));
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toHaveProperty('error');
	});

	it('success path returns files, stats', async () => {
		mockGlobalFetch.mockResolvedValue(makeQdrantScrollOk());

		const res = await GET(makeCIEvent());
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('files');
		expect(body).toHaveProperty('stats');
		expect(Array.isArray(body.files)).toBe(true);
		expect(body.stats).toHaveProperty('totalFiles');
		expect(body.stats).toHaveProperty('byRole');
		expect(body.stats).toHaveProperty('byRisk');
		expect(body.stats).toHaveProperty('bySurface');
	});

	it('degraded (Qdrant !ok) returns 200 + same keys — no HTTP status-code in error', async () => {
		mockGlobalFetch.mockResolvedValue(makeQdrantError(503));

		const res = await GET(makeCIEvent());
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('files');
		expect(body).toHaveProperty('stats');
		expect(Array.isArray(body.files)).toBe(true);
		expect(body.files).toHaveLength(0);

		// Leak contract: must not expose raw Qdrant HTTP status codes
		if (body.error !== undefined) {
			expect(String(body.error)).not.toMatch(/\d{3}/);            // no 3-digit HTTP codes
			expect(String(body.error)).not.toMatch(/qdrant request failed/i);
		}
	});

	it('degraded (fetch throws) returns 200 + same shape — no stack leak', async () => {
		mockGlobalFetch.mockRejectedValue(new Error('ECONNREFUSED ::1:6333'));

		const res = await GET(makeCIEvent());
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('files');
		expect(body).toHaveProperty('stats');

		if (body.error !== undefined) {
			expect(String(body.error)).not.toMatch(/ECONNREFUSED/i);
		}
	});

	it('degraded and success shapes share required keys', async () => {
		// Collect required success keys (no items → nextOffset is undefined/absent, excluded)
		mockGlobalFetch.mockResolvedValue(makeQdrantScrollOk());
		const successRes = await GET(makeCIEvent());
		const successBody = await successRes.json();
		const requiredKeys = Object.keys(successBody).filter((k) => k !== 'nextOffset');

		// Degrade
		mockGlobalFetch.mockRejectedValue(new Error('timeout'));
		const degradedRes = await GET(makeCIEvent());
		const degradedBody = await degradedRes.json();

		for (const key of requiredKeys) {
			expect(degradedBody, `degraded missing key: ${key}`).toHaveProperty(key);
		}
	});
});

// ── GET /api/codebase-index/stats ─────────────────────────────────────────────

describe('GET /api/codebase-index/stats — degraded-shape contract', () => {
	let GET: (typeof import('../../src/routes/api/codebase-index/stats/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../../src/routes/api/codebase-index/stats/+server.js');
		GET = mod.GET;
	});

	it('returns 401 when user is absent', async () => {
		const event = makeEventFetch('/api/codebase-index/stats', null);
		const res = await GET(event as Parameters<typeof GET>[0]);
		expect(res.status).toBe(401);
	});

	it('success path (FastAPI down → Qdrant fallback) has required top-level keys', async () => {
		const eventFetch = vi
			.fn()
			.mockResolvedValueOnce(makeQdrantError(503))       // FastAPI unavailable
			.mockResolvedValueOnce(makeQdrantScrollOk())       // error cards scroll
			.mockResolvedValueOnce(makeQdrantCountOk(0))       // clusters count
			.mockResolvedValueOnce(makeQdrantCollectionOk(42)); // codebase_chunks_768

		const event = makeEventFetch('/api/codebase-index/stats', 'user-1', eventFetch);
		const res = await GET(event as Parameters<typeof GET>[0]);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('totalFiles');
		expect(body).toHaveProperty('indexedFiles');
		expect(body).toHaveProperty('totalErrors');
		expect(body).toHaveProperty('errorClusters');
		expect(body).toHaveProperty('topErrorCodes');
		expect(body).toHaveProperty('surfaceBreakdown');
		expect(body).toHaveProperty('techBreakdown');
		expect(body).toHaveProperty('lastIndexed');
		expect(body).toHaveProperty('_perf');
		expect(Array.isArray(body.topErrorCodes)).toBe(true);
	});

	it('degraded (all fetches throw) returns 200 + all required keys', async () => {
		const eventFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

		const event = makeEventFetch('/api/codebase-index/stats', 'user-1', eventFetch);
		const res = await GET(event as Parameters<typeof GET>[0]);
		expect(res.status).toBe(200);
		const body = await res.json();

		// Shape contract: all success keys must exist in degraded
		expect(body).toHaveProperty('totalFiles', 0);
		expect(body).toHaveProperty('indexedFiles', 0);
		expect(body).toHaveProperty('totalErrors', 0);
		expect(body).toHaveProperty('errorClusters', 0);
		expect(body).toHaveProperty('topErrorCodes');
		expect(body).toHaveProperty('surfaceBreakdown');
		expect(body).toHaveProperty('techBreakdown');
		expect(body).toHaveProperty('lastIndexed', null);
		expect(body).toHaveProperty('_perf');

		// _perf must be a safe object, not missing
		expect(body._perf).toHaveProperty('totalMs');
		expect(body._perf).toHaveProperty('simdAvailable');
		expect(body._perf).toHaveProperty('parser');
		expect(Array.isArray(body.topErrorCodes)).toBe(true);
		expect(body.topErrorCodes).toHaveLength(0);
	});

	it('degraded and success shapes share the same top-level key set', async () => {
		const successFetch = vi
			.fn()
			.mockResolvedValueOnce(makeQdrantError(503))
			.mockResolvedValueOnce(makeQdrantScrollOk())
			.mockResolvedValueOnce(makeQdrantCountOk(0))
			.mockResolvedValueOnce(makeQdrantCollectionOk(0));

		const successEvent = makeEventFetch('/api/codebase-index/stats', 'user-1', successFetch);
		const successRes = await GET(successEvent as Parameters<typeof GET>[0]);
		const successBody = await successRes.json();
		const successKeys = Object.keys(successBody);

		const failFetch = vi.fn().mockRejectedValue(new Error('timeout'));
		const failEvent = makeEventFetch('/api/codebase-index/stats', 'user-1', failFetch);
		const degradedRes = await GET(failEvent as Parameters<typeof GET>[0]);
		const degradedBody = await degradedRes.json();

		for (const key of successKeys) {
			expect(degradedBody, `degraded missing key: ${key}`).toHaveProperty(key);
		}
	});
});

// ── GET /api/codebase-index/clusters ──────────────────────────────────────────

describe('GET /api/codebase-index/clusters — degraded-shape contract', () => {
	let GET: (typeof import('../../src/routes/api/codebase-index/clusters/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../../src/routes/api/codebase-index/clusters/+server.js');
		GET = mod.GET;
	});

	it('returns 401 when user is absent', async () => {
		const event = makeEventFetch('/api/codebase-index/clusters', null);
		const res = await GET(event as Parameters<typeof GET>[0]);
		expect(res.status).toBe(401);
	});

	it('success path (Qdrant fallback) returns { clusters: [...] }', async () => {
		const eventFetch = vi
			.fn()
			.mockResolvedValueOnce(makeQdrantError(503))    // FastAPI fails
			.mockResolvedValueOnce(makeQdrantScrollOk([])); // Qdrant fallback OK

		const event = makeEventFetch('/api/codebase-index/clusters', 'user-1', eventFetch);
		const res = await GET(event as Parameters<typeof GET>[0]);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('clusters');
		expect(Array.isArray(body.clusters)).toBe(true);
	});

	it('degraded (all fetches throw) returns 200 + { clusters: [] }', async () => {
		const eventFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

		const event = makeEventFetch('/api/codebase-index/clusters', 'user-1', eventFetch);
		const res = await GET(event as Parameters<typeof GET>[0]);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('clusters');
		expect(Array.isArray(body.clusters)).toBe(true);
		expect(body.clusters).toHaveLength(0);
	});

	it('degraded and success shapes share the same top-level key set', async () => {
		const successFetch = vi
			.fn()
			.mockResolvedValueOnce(makeQdrantError(503))
			.mockResolvedValueOnce(makeQdrantScrollOk([]));

		const successEvent = makeEventFetch('/api/codebase-index/clusters', 'user-1', successFetch);
		const successRes = await GET(successEvent as Parameters<typeof GET>[0]);
		const successBody = await successRes.json();
		const successKeys = Object.keys(successBody);

		const failFetch = vi.fn().mockRejectedValue(new Error('timeout'));
		const failEvent = makeEventFetch('/api/codebase-index/clusters', 'user-1', failFetch);
		const degradedRes = await GET(failEvent as Parameters<typeof GET>[0]);
		const degradedBody = await degradedRes.json();

		for (const key of successKeys) {
			expect(degradedBody, `degraded missing key: ${key}`).toHaveProperty(key);
		}
	});
});
