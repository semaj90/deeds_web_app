// @vitest-environment node
/**
 * Pass A — Degraded-Shape Contract Tests
 *
 * Verifies that GET route catch blocks return the SAME top-level JSON keys as
 * the success path (with empty/zero defaults), so UI code that destructures
 * the response doesn't get `undefined` reads on degraded service.
 *
 * Contract (from CLAUDE.md):
 *   - Catch blocks on GET handlers return 200 with empty-but-valid data
 *   - Every top-level key from success must appear in the degraded response
 *   - Clients should be able to destructure without ?. on top-level keys
 *
 * Routes covered (Pass A — changed routes only):
 *   1. GET /api/phase89/clusters  — added `total: 0` to catch block
 *   2. GET /api/phase89/pipeline  — added `progress/complete/processed` to catch block
 *
 * Pattern (G26 — lazy-import):
 *   - vi.hoisted() for variables referenced inside vi.mock() factories
 *   - Lazy-import the handler inside beforeEach so mock state is fresh
 *   - 3 baseline cases per route: 401 unauth (if applicable), success, degraded
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const { mockPoolQuery } = vi.hoisted(() => {
	const mockPoolQuery = vi.fn();
	return { mockPoolQuery };
});

const { mockRedisPing } = vi.hoisted(() => {
	const mockRedisPing = vi.fn().mockResolvedValue('PONG');
	return { mockRedisPing };
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

// Mock the pool used as `aiPool` inside the clusters handler
vi.mock('$lib/server/db/client', () => ({
	pool: { query: mockPoolQuery },
}));

// Mock the dynamically-imported redis module used by pipeline GET
vi.mock('$lib/server/redis.js', () => ({
	redis: { ping: mockRedisPing },
}));

vi.mock('@qdrant/js-client-rest', () => ({
	QdrantClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('$lib/config/env.server.js', () => ({
	getQdrantUrl: () => 'http://localhost:6333',
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeClustersEvent(userId: string | null = 'user-1') {
	return {
		locals: { user: userId ? { id: userId } : null },
		url: new URL('http://localhost/api/phase89/clusters'),
		request: new Request('http://localhost/api/phase89/clusters'),
		params: {},
		route: { id: '/api/phase89/clusters' },
	} as Parameters<typeof import('../../src/routes/api/phase89/clusters/+server.js').GET>[0];
}

// The pipeline GET handler takes no event params — pass an empty object cast
function makePipelineEvent() {
	return {} as Parameters<typeof import('../../src/routes/api/phase89/pipeline/+server.js').GET>[0];
}

// ── GET /api/phase89/clusters ──────────────────────────────────────────────────

describe('GET /api/phase89/clusters — degraded-shape contract', () => {
	let GET: (typeof import('../../src/routes/api/phase89/clusters/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../../src/routes/api/phase89/clusters/+server.js');
		GET = mod.GET;
	});

	it('returns 401 when user is absent', async () => {
		const res = await GET(makeClustersEvent(null));
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toHaveProperty('error');
	});

	it('success path has required top-level keys', async () => {
		mockPoolQuery.mockResolvedValue({ rows: [
			{
				cluster_id: 'c1',
				error_count: '5',
				first_seen: new Date().toISOString(),
				last_seen: new Date().toISOString(),
				sample_message: 'TypeError',
				sample_source: 'routes',
				title: 'Cluster c1',
				description: 'Type errors',
				tags: ['typescript'],
				avg_similarity: 0.9,
			},
		] });

		const res = await GET(makeClustersEvent());
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('success');
		expect(body).toHaveProperty('clusters');
		expect(body).toHaveProperty('total');
		expect(Array.isArray(body.clusters)).toBe(true);
		expect(typeof body.total).toBe('number');
	});

	it('degraded path (DB throws) has same top-level keys as success', async () => {
		mockPoolQuery.mockRejectedValue(new Error('Connection refused'));

		const res = await GET(makeClustersEvent());
		expect(res.status).toBe(200);
		const degraded = await res.json();

		// Shape contract: all success keys must exist
		expect(degraded).toHaveProperty('success');
		expect(degraded).toHaveProperty('clusters');
		expect(degraded).toHaveProperty('total');

		// Degraded defaults must be safe to destructure
		expect(Array.isArray(degraded.clusters)).toBe(true);
		expect(degraded.clusters).toHaveLength(0);
		expect(degraded.total).toBe(0);
	});

	it('degraded and success shapes share the same top-level key set (excluding extras)', async () => {
		// Success keys
		mockPoolQuery.mockResolvedValue({ rows: [] });
		const successRes = await GET(makeClustersEvent());
		const successBody = await successRes.json();
		const successKeys = Object.keys(successBody);

		// Degraded keys
		mockPoolQuery.mockRejectedValue(new Error('timeout'));
		const degradedRes = await GET(makeClustersEvent());
		const degradedBody = await degradedRes.json();

		// Every key in success must be present in degraded (degraded may add 'error')
		for (const key of successKeys) {
			expect(degradedBody).toHaveProperty(key);
		}
	});
});

// ── GET /api/phase89/pipeline ──────────────────────────────────────────────────

describe('GET /api/phase89/pipeline — degraded-shape contract', () => {
	let GET: (typeof import('../../src/routes/api/phase89/pipeline/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../../src/routes/api/phase89/pipeline/+server.js');
		GET = mod.GET;
	});

	it('success path has required top-level keys', async () => {
		mockRedisPing.mockResolvedValue('PONG');

		const res = await GET(makePipelineEvent());
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('status');
		expect(body).toHaveProperty('progress');
		expect(body).toHaveProperty('complete');
		expect(body).toHaveProperty('processed');
		expect(body).toHaveProperty('message');
	});

	it('degraded path (Redis throws) has same top-level keys as success', async () => {
		mockRedisPing.mockRejectedValue(new Error('ECONNREFUSED'));

		const res = await GET(makePipelineEvent());
		expect(res.status).toBe(200);
		const degraded = await res.json();

		// Shape contract: all success keys must exist with safe defaults
		expect(degraded).toHaveProperty('status');
		expect(degraded).toHaveProperty('progress');
		expect(degraded).toHaveProperty('complete');
		expect(degraded).toHaveProperty('processed');
		expect(degraded).toHaveProperty('message');

		// Values must be safe for UI destructuring
		expect(typeof degraded.progress).toBe('number');
		expect(typeof degraded.complete).toBe('boolean');
		expect(typeof degraded.processed).toBe('number');
		expect(degraded.progress).toBe(0);
		expect(degraded.complete).toBe(false);
		expect(degraded.processed).toBe(0);
	});

	it('degraded and success shapes share the same top-level key set', async () => {
		// Success keys
		mockRedisPing.mockResolvedValue('PONG');
		const successRes = await GET(makePipelineEvent());
		const successBody = await successRes.json();
		const successKeys = Object.keys(successBody);

		// Degraded keys
		mockRedisPing.mockRejectedValue(new Error('timeout'));
		const degradedRes = await GET(makePipelineEvent());
		const degradedBody = await degradedRes.json();

		for (const key of successKeys) {
			expect(degradedBody).toHaveProperty(key);
		}
	});
});
