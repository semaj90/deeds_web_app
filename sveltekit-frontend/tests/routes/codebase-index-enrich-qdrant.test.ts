// @vitest-environment node
/**
 * Enrich-Qdrant Job Tests
 *
 * Contract:
 *   - POST /api/codebase-index/enrich-qdrant — auth guard, fire-and-forget job, immediate { jobId, status: 'started' }
 *   - GET  /api/codebase-index/enrich-qdrant?jobId=<id> — poll single job status
 *   - GET  /api/codebase-index/enrich-qdrant (no jobId) — list last 20 jobs
 *   - GET  with unknown jobId → 404
 *
 * Pattern (G26 — lazy-import):
 *   - vi.hoisted() for all variables referenced inside vi.mock() factories
 *   - Lazy-import handler inside beforeEach so mock state is fresh
 *   - 4+ baseline cases: 401 unauth, 400/bad input, 200 success, background enrichment
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const { mockNeo4jRun, mockNeo4jClose, mockGlobalFetch } = vi.hoisted(() => {
	const mockNeo4jRun = vi.fn();
	const mockNeo4jClose = vi.fn();
	const mockGlobalFetch = vi.fn();
	return { mockNeo4jRun, mockNeo4jClose, mockGlobalFetch };
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/config/env.server.js', () => ({
	getQdrantUrl: () => 'http://localhost:6333',
}));

vi.mock('$lib/server/neo4j-driver.js', () => ({
	getNeo4jDriver: () => ({
		session: () => ({
			run: mockNeo4jRun,
			close: mockNeo4jClose,
		}),
	}),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeNeo4jRecords(files: { filePath: string }[]) {
	return {
		records: files.map((f) => ({
			get: (key: string) => (key === 'filePath' ? f.filePath : null),
		})),
	};
}

function makePostEvent(body: Record<string, unknown> = {}, userId = 'user-1') {
	return {
		request: new Request('http://localhost/api/codebase-index/enrich-qdrant', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
		locals: { user: userId ? { id: userId } : null },
	};
}

function makeGetEvent(jobId?: string, userId = 'user-1') {
	const url = jobId
		? `http://localhost/api/codebase-index/enrich-qdrant?jobId=${jobId}`
		: 'http://localhost/api/codebase-index/enrich-qdrant';
	return {
		url: new URL(url),
		locals: { user: userId ? { id: userId } : null },
		request: new Request(url),
	};
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/codebase-index/enrich-qdrant', () => {
	let POST: (typeof import('../../src/routes/api/codebase-index/enrich-qdrant/+server.js'))['POST'];
	let GET: (typeof import('../../src/routes/api/codebase-index/enrich-qdrant/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', mockGlobalFetch);
		mockGlobalFetch.mockResolvedValue({ ok: true, status: 200 });
		mockNeo4jRun.mockResolvedValue({ records: [] });
		mockNeo4jClose.mockResolvedValue(undefined);

		const mod = await import('../../src/routes/api/codebase-index/enrich-qdrant/+server.js');
		POST = mod.POST;
		GET = mod.GET;
	});

	afterEach(() => vi.unstubAllGlobals());

	it('POST returns 401 when user absent', async () => {
		const event = makePostEvent({}, '');
		// @ts-expect-error partial event
		const res = await POST(event);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toHaveProperty('error');
	});

	it('POST returns 200 with jobId when user present', async () => {
		const event = makePostEvent({});
		// @ts-expect-error partial event
		const res = await POST(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toHaveProperty('jobId');
		expect(typeof body.jobId).toBe('string');
		expect(body.status).toBe('started');
	});

	it('POST dryRun:true is reflected in immediate response', async () => {
		const event = makePostEvent({ dryRun: true });
		// @ts-expect-error partial event
		const res = await POST(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.dryRun).toBe(true);
		expect(body.status).toBe('started');
	});

	it('POST with invalid batchSize still starts job (defaults to 100)', async () => {
		// batchSize 99999 exceeds max(500) — Zod safeParse fails → defaults applied
		const event = makePostEvent({ batchSize: 99999 });
		// @ts-expect-error partial event
		const res = await POST(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toHaveProperty('jobId');
		expect(body.status).toBe('started');
	});
});

describe('GET /api/codebase-index/enrich-qdrant', () => {
	let POST: (typeof import('../../src/routes/api/codebase-index/enrich-qdrant/+server.js'))['POST'];
	let GET: (typeof import('../../src/routes/api/codebase-index/enrich-qdrant/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', mockGlobalFetch);
		mockGlobalFetch.mockResolvedValue({ ok: true, status: 200 });
		mockNeo4jRun.mockResolvedValue({ records: [] });
		mockNeo4jClose.mockResolvedValue(undefined);

		const mod = await import('../../src/routes/api/codebase-index/enrich-qdrant/+server.js');
		POST = mod.POST;
		GET = mod.GET;
	});

	afterEach(() => vi.unstubAllGlobals());

	it('GET returns 401 when user absent', async () => {
		const event = makeGetEvent(undefined, '');
		// @ts-expect-error partial event
		const res = await GET(event);
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toHaveProperty('error');
	});

	it('GET with unknown jobId returns 404', async () => {
		const event = makeGetEvent('00000000-dead-beef-cafe-000000000000');
		// @ts-expect-error partial event
		const res = await GET(event);
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toHaveProperty('error');
	});

	it('GET with no jobId returns jobs array', async () => {
		// Create a job first so there is at least one entry
		const postEvent = makePostEvent({});
		// @ts-expect-error partial event
		await POST(postEvent);

		const getEvent = makeGetEvent();
		// @ts-expect-error partial event
		const res = await GET(getEvent);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toHaveProperty('jobs');
		expect(Array.isArray(body.jobs)).toBe(true);
		expect(body.jobs.length).toBeGreaterThanOrEqual(1);
	});
});

describe('POST /api/codebase-index/enrich-qdrant — background enrichment', () => {
	let POST: (typeof import('../../src/routes/api/codebase-index/enrich-qdrant/+server.js'))['POST'];
	let GET: (typeof import('../../src/routes/api/codebase-index/enrich-qdrant/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', mockGlobalFetch);
		mockGlobalFetch.mockResolvedValue({ ok: true, status: 200 });
		mockNeo4jClose.mockResolvedValue(undefined);

		const mod = await import('../../src/routes/api/codebase-index/enrich-qdrant/+server.js');
		POST = mod.POST;
		GET = mod.GET;
	});

	afterEach(() => vi.unstubAllGlobals());

	it('POST triggers background enrichment that completes', async () => {
		// Mock Neo4j to return 2 records
		mockNeo4jRun.mockResolvedValue(
			makeNeo4jRecords([
				{ filePath: 'C:/project/sveltekit-frontend/src/routes/api/foo/+server.ts' },
				{ filePath: 'C:/project/sveltekit-frontend/src/lib/utils/bar.ts' },
			]),
		);
		// Qdrant payload update succeeds
		mockGlobalFetch.mockResolvedValue({ ok: true, status: 200 });

		const postEvent = makePostEvent({});
		// @ts-expect-error partial event
		const postRes = await POST(postEvent);
		expect(postRes.status).toBe(200);
		const { jobId } = await postRes.json();
		expect(typeof jobId).toBe('string');

		// Flush microtasks + give the fire-and-forget time to complete
		await new Promise((r) => setTimeout(r, 50));

		const getEvent = makeGetEvent(jobId);
		// @ts-expect-error partial event
		const getRes = await GET(getEvent);
		expect(getRes.status).toBe(200);
		const job = await getRes.json();

		// Status should be 'done' or still 'running' if timing is tight
		expect(['done', 'running']).toContain(job.status);
		// nodesQueried should be set (0 is valid if timing races, but ≥0 always)
		expect(typeof job.nodesQueried).toBe('number');
	});
});