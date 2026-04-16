// @vitest-environment node
/**
 * KAG / ingest-errors / kag-notebook contract tests
 *
 * Coverage:
 *   - ingest-errors GET: 401, success shape, degraded inline (Qdrant down)
 *   - kag-notebook GET: 401, success shape (cells + stats + exportedAt), degraded inline
 *   - phase109/kag GET: 401, success shape, degraded catch shape
 *   - Notebook contract: cells array, stats keys, aceReadyCells ≤ totalCells
 *   - ingest-errors POST: no raw error leak in catch
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeEvent, makeAuthEvent, responseJson } from '../helpers/route-test-utils.js';

/* ────────────────────────────────────────────────────────────────────────────
 * Hoisted mock variables
 * ──────────────────────────────────────────────────────────────────────────── */
const mockQdrantUrl = vi.hoisted(() => 'http://qdrant-test:6333');
const mockCouchdbAllDocs = vi.hoisted(() => vi.fn());
const mockGetKAGTraverser = vi.hoisted(() => vi.fn());

/* ────────────────────────────────────────────────────────────────────────────
 * Module mocks
 * ──────────────────────────────────────────────────────────────────────────── */
vi.mock('$lib/config/env.server.js', () => ({
	getQdrantUrl: () => mockQdrantUrl,
}));

vi.mock('$lib/services/couchdb-client.js', () => ({
	couchdb: { allDocs: mockCouchdbAllDocs },
}));

vi.mock('$lib/services/error-analysis/KAGTraverser.js', () => ({
	getKAGTraverser: mockGetKAGTraverser,
}));

/* ────────────────────────────────────────────────────────────────────────────
 * Global fetch mock — both ingest-errors and kag-notebook use module-level
 * global fetch() for Qdrant, NOT event.fetch.
 * ──────────────────────────────────────────────────────────────────────────── */
const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
	globalThis.fetch = mockFetch;
});
afterEach(() => {
	globalThis.fetch = originalFetch;
	mockFetch.mockReset();
});

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/** Response for kag-notebook's qdrantScroll — returns a fetch Response object */
function qdrantScrollResponse(points: unknown[] = []) {
	return new Response(JSON.stringify({ result: { points } }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

/** Parsed JSON for ingest-errors' qdrantRequest — it calls res.json() internally */
function qdrantCollectionJson(pointsCount: number, status = 'green') {
	return JSON.stringify({ result: { points_count: pointsCount, status } });
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1. GET /api/codebase-index/ingest-errors
 *
 * qdrantRequest() calls global fetch → res.json() → returns parsed object.
 * GET handler wraps two calls in .catch(() => null).
 * ════════════════════════════════════════════════════════════════════════════ */
describe('GET /api/codebase-index/ingest-errors', () => {
	let GET: Function;

	beforeEach(async () => {
		vi.resetModules();
		const mod = await import('../../src/routes/api/codebase-index/ingest-errors/+server.js');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const event = makeEvent({ url: '/api/codebase-index/ingest-errors' });
		const res = await GET(event);
		expect(res.status).toBe(401);
	});

	it('returns success shape with collection status', async () => {
		mockFetch.mockResolvedValue(
			new Response(qdrantCollectionJson(42, 'green'), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			})
		);

		const event = makeAuthEvent({ url: '/api/codebase-index/ingest-errors' });
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await responseJson<any>(res);

		expect(body).toHaveProperty('phase90_error_clusters');
		expect(body).toHaveProperty('phase90_error_cards');
		expect(body).toHaveProperty('source', 'phase89_error_chunks');
		expect(typeof body.sourcePoints).toBe('number');

		for (const key of ['phase90_error_clusters', 'phase90_error_cards']) {
			expect(body[key]).toHaveProperty('exists');
			expect(body[key]).toHaveProperty('points');
			expect(body[key]).toHaveProperty('status');
			expect(typeof body[key].points).toBe('number');
		}
	});

	it('degrades gracefully when Qdrant is unreachable', async () => {
		mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

		const event = makeAuthEvent({ url: '/api/codebase-index/ingest-errors' });
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await responseJson<any>(res);

		// Same shape — per-fetch .catch(() => null) → exists false, points 0, status missing
		expect(body.phase90_error_clusters).toEqual({ exists: false, points: 0, status: 'missing' });
		expect(body.phase90_error_cards).toEqual({ exists: false, points: 0, status: 'missing' });
		expect(body).toHaveProperty('source', 'phase89_error_chunks');
	});
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. GET /api/codebase-index/kag-notebook
 *
 * qdrantScroll() returns raw fetch Response (not parsed). Handler checks .ok
 * then calls .json(). CouchDB calls mocked via vi.mock.
 * ════════════════════════════════════════════════════════════════════════════ */
describe('GET /api/codebase-index/kag-notebook', () => {
	let GET: Function;

	beforeEach(async () => {
		vi.resetModules();
		mockCouchdbAllDocs.mockReset();
		const mod = await import('../../src/routes/api/codebase-index/kag-notebook/+server.js');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const event = makeEvent({ url: '/api/codebase-index/kag-notebook' });
		const res = await GET(event);
		expect(res.status).toBe(401);
	});

	it('returns success shape with cells + stats + exportedAt', async () => {
		// 3 Qdrant scroll calls → empty results (new Response per call to avoid body-already-read)
		mockFetch.mockImplementation(() => Promise.resolve(qdrantScrollResponse([])));
		mockCouchdbAllDocs.mockResolvedValue({ rows: [], total_rows: 0 });

		const event = makeAuthEvent({ url: '/api/codebase-index/kag-notebook' });
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await responseJson<any>(res);

		// Top-level shape
		expect(body).toHaveProperty('cells');
		expect(body).toHaveProperty('stats');
		expect(body).toHaveProperty('exportedAt');
		expect(Array.isArray(body.cells)).toBe(true);
		expect(typeof body.exportedAt).toBe('string');

		// Stats: all 8 keys present and numeric
		const statKeys = [
			'totalCells', 'totalFiles', 'errorClusters', 'errorCards',
			'highRiskFiles', 'aceReadyCells', 'gpuClusters', 'importRecos',
		];
		for (const key of statKeys) {
			expect(body.stats).toHaveProperty(key);
			expect(typeof body.stats[key]).toBe('number');
		}
	});

	it('notebook contract: aceReadyCells <= totalCells', async () => {
		const clusters = [
			{ id: 1, payload: { cluster_label: 'C1', error_count: 2, affected_files: ['a.ts'] } },
			{ id: 2, payload: { cluster_label: 'C2', error_count: 0, affected_files: [] } },
		];
		const cards = [
			{ payload: { cluster_id: 1, error_code: 'TS2345', normalized_message: 'bad type', file_path: 'a.ts' } },
		];

		// 3 sequential Qdrant scroll calls (clusters, cards, files)
		mockFetch
			.mockResolvedValueOnce(qdrantScrollResponse(clusters))
			.mockResolvedValueOnce(qdrantScrollResponse(cards))
			.mockResolvedValueOnce(qdrantScrollResponse([]));

		mockCouchdbAllDocs
			.mockResolvedValueOnce({ rows: [], total_rows: 0 })
			.mockResolvedValueOnce({ rows: [], total_rows: 0 });

		const event = makeAuthEvent({ url: '/api/codebase-index/kag-notebook?limit=10' });
		const res = await GET(event);
		const body = await responseJson<any>(res);

		expect(body.cells.length).toBe(2);
		expect(body.stats.totalCells).toBe(2);
		expect(body.stats.aceReadyCells).toBeLessThanOrEqual(body.stats.totalCells);
		// Cluster 1 has a matching card → aceReady; Cluster 2 has none → not aceReady
		expect(body.stats.aceReadyCells).toBe(1);
	});

	it('degrades gracefully when all services are down', async () => {
		mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
		mockCouchdbAllDocs.mockRejectedValue(new Error('ECONNREFUSED'));

		const event = makeAuthEvent({ url: '/api/codebase-index/kag-notebook' });
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await responseJson<any>(res);

		// Same shape, everything empty/zero
		expect(body).toHaveProperty('cells');
		expect(body).toHaveProperty('stats');
		expect(body).toHaveProperty('exportedAt');
		expect(body.cells).toEqual([]);
		expect(body.stats.totalCells).toBe(0);
		expect(body.stats.errorClusters).toBe(0);
		expect(body.stats.errorCards).toBe(0);
		expect(body.stats.aceReadyCells).toBe(0);
	});
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. GET /api/phase109/kag
 *
 * Uses dynamic import('$lib/services/error-analysis/KAGTraverser.js').
 * Has try/catch returning { stats: null, ready: false, message }.
 * ════════════════════════════════════════════════════════════════════════════ */
describe('GET /api/phase109/kag', () => {
	let GET: Function;

	beforeEach(async () => {
		vi.resetModules();
		mockGetKAGTraverser.mockReset();
		const mod = await import('../../src/routes/api/phase109/kag/+server.js');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const event = makeEvent({ url: '/api/phase109/kag' });
		const res = await GET(event);
		expect(res.status).toBe(401);
	});

	it('returns success shape with stats + ready', async () => {
		const fakeStats = { nodes: 50, edges: 120, clusters: 5 };
		mockGetKAGTraverser.mockReturnValue({
			waitForInit: vi.fn().mockResolvedValue(undefined),
			getStats: vi.fn().mockReturnValue(fakeStats),
			isAvailable: vi.fn().mockReturnValue(true),
		});

		const event = makeAuthEvent({ url: '/api/phase109/kag' });
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await responseJson<any>(res);

		expect(body).toHaveProperty('stats');
		expect(body).toHaveProperty('ready', true);
		expect(body.stats).toEqual(fakeStats);
	});

	it('returns degraded shape when KAG throws (no error leak)', async () => {
		mockGetKAGTraverser.mockImplementation(() => {
			throw new Error('Neo4j connection refused');
		});

		const event = makeAuthEvent({ url: '/api/phase109/kag' });
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await responseJson<any>(res);

		// Same top-level keys
		expect(body).toHaveProperty('stats', null);
		expect(body).toHaveProperty('ready', false);
		expect(body).toHaveProperty('message', 'KAG service unavailable');
		// No leaked internals
		expect(body).not.toHaveProperty('error');
		expect(JSON.stringify(body)).not.toContain('Neo4j connection refused');
	});

	it('returns degraded shape when waitForInit rejects', async () => {
		mockGetKAGTraverser.mockReturnValue({
			waitForInit: vi.fn().mockRejectedValue(new Error('timeout')),
		});

		const event = makeAuthEvent({ url: '/api/phase109/kag' });
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await responseJson<any>(res);

		expect(body.stats).toBeNull();
		expect(body.ready).toBe(false);
		expect(body.message).toBe('KAG service unavailable');
		expect(JSON.stringify(body)).not.toContain('timeout');
	});
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. POST /api/codebase-index/ingest-errors — error sanitization
 *
 * The POST handler has a try/catch. Verify the catch returns a generic
 * message, not String(err).
 * ════════════════════════════════════════════════════════════════════════════ */
describe('POST /api/codebase-index/ingest-errors — error sanitization', () => {
	let POST: Function;

	beforeEach(async () => {
		vi.resetModules();
		const mod = await import('../../src/routes/api/codebase-index/ingest-errors/+server.js');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const event = makeEvent({
			method: 'POST',
			url: '/api/codebase-index/ingest-errors',
			body: { mode: 'migrate' },
		});
		const res = await POST(event);
		expect(res.status).toBe(401);
	});

	it('catch block returns generic error, not raw message', async () => {
		// qdrantRequest inside POST calls global fetch — make it fail
		mockFetch.mockRejectedValue(new Error('Qdrant exploded with secret details'));

		const event = makeAuthEvent({
			method: 'POST',
			url: '/api/codebase-index/ingest-errors',
			body: { mode: 'migrate' },
		});
		const res = await POST(event);
		// Should be 500 with generic message
		expect(res.status).toBe(500);
		const body = await responseJson<any>(res);
		expect(body.success).toBe(false);
		expect(body).toHaveProperty('error');
		// Must NOT contain raw error internals
		expect(body.error).not.toContain('Qdrant exploded');
		expect(body.error).not.toContain('secret details');
	});
});
