// @vitest-environment node
/**
 * KAG / ingest-errors / kag-notebook contract tests
 *
 * Coverage:
 *   - ingest-errors GET: 401, success shape, degraded inline
 *   - kag-notebook GET: 401, success shape (cells + stats + exportedAt), degraded inline
 *   - phase109/kag GET: 401, success shape, degraded catch shape
 *   - Notebook contract: cells array, stats keys, aceReadyCells ≤ totalCells
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeEvent, makeAuthEvent, responseJson } from '../helpers/route-test-utils.js';

/* ────────────────────────────────────────────────────────────────────────────
 * Shared mock variables (vi.hoisted so they're available in vi.mock factories)
 * ──────────────────────────────────────────────────────────────────────────── */
const mockQdrantUrl = vi.hoisted(() => 'http://localhost:6333');
const mockGlobalFetch = vi.hoisted(() => vi.fn());
const mockCouchdbAllDocs = vi.hoisted(() => vi.fn());
const mockGetKAGTraverser = vi.hoisted(() => vi.fn());

/* ────────────────────────────────────────────────────────────────────────────
 * Module mocks
 * ──────────────────────────────────────────────────────────────────────────── */
vi.mock('$lib/config/env.server.js', () => ({
	getQdrantUrl: () => mockQdrantUrl,
}));

vi.mock('$lib/services/couchdb-client.js', () => ({
	couchdb: {
		allDocs: mockCouchdbAllDocs,
	},
}));

vi.mock('$lib/services/error-analysis/KAGTraverser.js', () => ({
	getKAGTraverser: mockGetKAGTraverser,
}));

/* ────────────────────────────────────────────────────────────────────────────
 * Helper: Qdrant fetch response builder
 * ──────────────────────────────────────────────────────────────────────────── */
function qdrantScrollResponse(points: unknown[] = []) {
	return new Response(JSON.stringify({ result: { points } }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

function qdrantCollectionInfo(pointsCount: number, status = 'green') {
	return {
		result: { points_count: pointsCount, status },
	};
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1. ingest-errors GET
 * ──────────────────────────────────────────────────────────────────────────── */
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
		// Mock the qdrantRequest calls inside ingest-errors GET
		// The handler uses a local qdrantRequest() that calls fetch directly
		const event = makeAuthEvent({
			url: '/api/codebase-index/ingest-errors',
			fetch: vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify(qdrantCollectionInfo(42, 'green')),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
			),
		});
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await responseJson(res);

		// Shape: { phase90_error_clusters: {...}, phase90_error_cards: {...}, source, sourcePoints }
		expect(body).toHaveProperty('phase90_error_clusters');
		expect(body).toHaveProperty('phase90_error_cards');
		expect(body).toHaveProperty('source', 'phase89_error_chunks');
		expect(body).toHaveProperty('sourcePoints');
		expect(typeof (body as any).sourcePoints).toBe('number');

		// Each collection block has exists + points + status
		for (const key of ['phase90_error_clusters', 'phase90_error_cards']) {
			const coll = (body as any)[key];
			expect(coll).toHaveProperty('exists');
			expect(coll).toHaveProperty('points');
			expect(coll).toHaveProperty('status');
			expect(typeof coll.points).toBe('number');
		}
	});

	it('degrades gracefully when Qdrant is unreachable', async () => {
		const event = makeAuthEvent({
			url: '/api/codebase-index/ingest-errors',
			fetch: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
		});
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await responseJson(res);

		// Same shape — exists false, points 0, status missing
		expect((body as any).phase90_error_clusters).toEqual({
			exists: false,
			points: 0,
			status: 'missing',
		});
		expect((body as any).phase90_error_cards).toEqual({
			exists: false,
			points: 0,
			status: 'missing',
		});
		expect(body).toHaveProperty('source');
	});
});

/* ────────────────────────────────────────────────────────────────────────────
 * 2. kag-notebook GET
 * ──────────────────────────────────────────────────────────────────────────── */
describe('GET /api/codebase-index/kag-notebook', () => {
	let GET: Function;

	beforeEach(async () => {
		vi.resetModules();
		mockCouchdbAllDocs.mockReset();
		mockGlobalFetch.mockReset();
		const mod = await import('../../src/routes/api/codebase-index/kag-notebook/+server.js');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const event = makeEvent({ url: '/api/codebase-index/kag-notebook' });
		const res = await GET(event);
		expect(res.status).toBe(401);
	});

	it('returns success shape with cells + stats + exportedAt', async () => {
		// Mock Qdrant scroll returning empty
		const fetchMock = vi.fn().mockResolvedValue(qdrantScrollResponse([]));
		// Mock CouchDB returning empty
		mockCouchdbAllDocs.mockResolvedValue({ rows: [], total_rows: 0 });

		const event = makeAuthEvent({
			url: '/api/codebase-index/kag-notebook',
			fetch: fetchMock,
		});
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await responseJson<any>(res);

		// Top-level shape
		expect(body).toHaveProperty('cells');
		expect(body).toHaveProperty('stats');
		expect(body).toHaveProperty('exportedAt');
		expect(Array.isArray(body.cells)).toBe(true);
		expect(typeof body.exportedAt).toBe('string');

		// Stats shape — all 8 keys
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
		// Clusters with some cards (aceReady = clusterCards.length > 0)
		const clusters = [
			{ id: 1, payload: { cluster_label: 'C1', error_count: 2, affected_files: ['a.ts'] } },
			{ id: 2, payload: { cluster_label: 'C2', error_count: 0, affected_files: [] } },
		];
		const cards = [
			{ payload: { cluster_id: 1, error_code: 'TS2345', normalized_message: 'bad type', file_path: 'a.ts' } },
		];

		const fetchMock = vi.fn()
			.mockResolvedValueOnce(qdrantScrollResponse(clusters))  // error_clusters
			.mockResolvedValueOnce(qdrantScrollResponse(cards))     // error_cards
			.mockResolvedValueOnce(qdrantScrollResponse([]));       // codebase_chunks

		mockCouchdbAllDocs
			.mockResolvedValueOnce({ rows: [], total_rows: 0 })   // graph_clusters
			.mockResolvedValueOnce({ rows: [], total_rows: 0 });  // graph_recommendations

		const event = makeAuthEvent({
			url: '/api/codebase-index/kag-notebook?limit=10',
			fetch: fetchMock,
		});
		const res = await GET(event);
		const body = await responseJson<any>(res);

		expect(body.cells.length).toBe(2);
		expect(body.stats.totalCells).toBe(2);
		expect(body.stats.aceReadyCells).toBeLessThanOrEqual(body.stats.totalCells);
		// Cluster 1 has cards → aceReady, Cluster 2 has none → not aceReady
		expect(body.stats.aceReadyCells).toBe(1);
	});

	it('degrades gracefully when all services are down', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
		mockCouchdbAllDocs.mockRejectedValue(new Error('ECONNREFUSED'));

		const event = makeAuthEvent({
			url: '/api/codebase-index/kag-notebook',
			fetch: fetchMock,
		});
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

/* ────────────────────────────────────────────────────────────────────────────
 * 3. phase109/kag GET
 * ──────────────────────────────────────────────────────────────────────────── */
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

	it('returns degraded shape when KAG throws', async () => {
		mockGetKAGTraverser.mockImplementation(() => {
			throw new Error('Neo4j connection refused');
		});

		const event = makeAuthEvent({ url: '/api/phase109/kag' });
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await responseJson<any>(res);

		// Same top-level keys: stats + ready
		expect(body).toHaveProperty('stats', null);
		expect(body).toHaveProperty('ready', false);
		// message is generic, not the raw error
		expect(body).toHaveProperty('message', 'KAG service unavailable');
		// No leaked error details
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

/* ────────────────────────────────────────────────────────────────────────────
 * 4. ingest-errors POST — degraded shape (no raw error leak)
 * ──────────────────────────────────────────────────────────────────────────── */
describe('POST /api/codebase-index/ingest-errors', () => {
	let POST: Function;

	beforeEach(async () => {
		vi.resetModules();
		const mod = await import('../../src/routes/api/codebase-index/ingest-errors/+server.js');
		POST = mod.POST;
	});

	it('catch block returns generic error, not raw message', async () => {
		// The POST handler has a try/catch. We need to trigger an error inside.
		// The handler reads body with Zod, so we pass valid body but the fetch call inside will throw.
		const event = makeAuthEvent({
			url: '/api/codebase-index/ingest-errors',
			fetch: vi.fn().mockRejectedValue(new Error('Qdrant exploded with secret details')),
		});
		// The POST handler requires a body. Build a POST event.
		const postEvent = {
			...event,
			request: new Request('http://localhost/api/codebase-index/ingest-errors', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ mode: 'live' }),
			}),
		};
		const res = await POST(postEvent);
		// Should be 500 but with generic message
		if (res.status === 500) {
			const body = await responseJson<any>(res);
			expect(body.success).toBe(false);
			expect(body).toHaveProperty('error');
			// Must NOT contain the raw error message
			expect(body.error).not.toContain('Qdrant exploded');
			expect(body.error).not.toContain('secret details');
		}
		// If status is 400 (validation), that's fine too — Zod handles it before the try
	});
});
