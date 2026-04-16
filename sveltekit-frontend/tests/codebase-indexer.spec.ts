/**
 * Codebase Indexer API — Vitest unit tests
 *
 * Routes covered:
 *   GET  /api/codebase-index            → Qdrant scroll, filter, client-side search
 *   POST /api/codebase-index            → semantic search via Ollama embedding + Qdrant
 *   POST /api/codebase-index/search     → vector search over codebase_chunks_768
 *   GET  /api/codebase-index/stats      → aggregated stats with simdjson fallback
 *   POST /api/codebase-index/graph-sync → fire-and-forget Neo4j sync job
 *   GET  /api/codebase-index/graph-sync → job status poll + list
 *   POST /api/codebase-index/cluster-detect → GPU k-means job
 *   GET  /api/codebase-index/cluster-detect → job list / cluster docs
 *   POST /api/codebase-index/reindex    → FastAPI reindex trigger with clustering
 *   GET  /api/codebase-index/ingest-errors → phase90 collection status
 *   POST /api/codebase-index/ingest-errors → migrate/live/both ingest modes
 *   KAG notebook contract               → cells, aceReadyCells, stats shape regression
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Static mocks (hoisted before any import) ──────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/config/env.server.js', () => ({
	getQdrantUrl: () => 'http://qdrant.test',
	getOllamaUrl: () => 'http://ollama.test',
	getCodebaseIndexUrl: () => 'http://fastapi.test',
}));

const mockOllamaFetch = vi.fn();
vi.mock('$lib/server/ollama.js', () => ({
	ollamaFetch: (...args: unknown[]) => mockOllamaFetch(...args),
}));

vi.mock('$lib/server/gpu/simdjson-bridge.js', () => ({
	fastJsonParse: (text: string) => JSON.parse(text),
	isSimdJsonAvailable: () => false,
}));

const mockSyncCodebaseToNeo4j = vi.fn();
vi.mock('$lib/server/graph/codebase-neo4j-sync.js', () => ({
	syncCodebaseToNeo4j: (...args: unknown[]) => mockSyncCodebaseToNeo4j(...args),
}));

const mockDetectCodebaseClusters = vi.fn();
vi.mock('$lib/server/graph/codebase-cluster-detection.js', () => ({
	detectCodebaseClusters: (...args: unknown[]) => mockDetectCodebaseClusters(...args),
}));

const mockCouchdb = {
	get: vi.fn(),
	allDocs: vi.fn(),
};
vi.mock('$lib/services/couchdb-client.js', () => ({
	couchdb: mockCouchdb,
}));

// child_process.exec mock — used by ingest-errors live mode.
// promisify(exec) runs at module-eval time. Node's promisify requires
// typeof original === 'function'. vi.fn() satisfies that, but we also
// need the mock to behave as a callback-style function by default.
// vi.hoisted ensures the variable is available when vi.mock factory runs.
const mockExecAsync = vi.hoisted(() => vi.fn().mockResolvedValue({ stdout: '', stderr: '' }));
vi.mock('child_process', () => ({
	exec: vi.fn(),
	execSync: vi.fn(),
	execFile: vi.fn(),
	fork: vi.fn(),
	spawn: vi.fn(),
	spawnSync: vi.fn(),
	default: {},
}));
// Intercept util.promisify so it returns our controllable async mock
// instead of trying to wrap the vi.fn() exec (which lacks Node internal symbols).
// The route only calls promisify(exec) once at module scope — so we always return mockExecAsync.
vi.mock('util', async (importOriginal) => {
	const actual = await importOriginal<typeof import('util')>();
	return {
		...actual,
		promisify: (fn: unknown) => {
			// Guard: only real functions pass through to actual promisify.
			// Vitest mocks fail Node's internal typeof check, so redirect them.
			try {
				return actual.promisify(fn as (...args: any[]) => any);
			} catch {
				return mockExecAsync;
			}
		},
	};
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonFetch(body: unknown, status = 200) {
	return async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' },
		});
}

const SAMPLE_POINT = {
	id: 1,
	payload: {
		file_path: 'src/routes/api/cases/+server.ts',
		role: 'api-route',
		surface: ['server'],
		dependencies: ['$lib/server/db/client'],
		exports: ['GET', 'POST'],
		imports: ['@sveltejs/kit'],
		comments: [],
		risk: 'high',
		change_frequency: 'weekly',
		related_routes: ['/cases'],
		tags: ['cases', 'api'],
		summary: 'CRUD API for legal cases',
		generated_at: '2026-04-15T00:00:00Z',
	},
};

const QDRANT_SCROLL_RESPONSE = {
	result: { points: [SAMPLE_POINT], next_page_offset: null },
	status: 'ok',
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/codebase-index
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/codebase-index', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// The GET handler uses global fetch (not event.fetch) for Qdrant
		vi.stubGlobal('fetch', vi.fn(jsonFetch(QDRANT_SCROLL_RESPONSE)));
	});

	it('returns 401 when unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/+server.js');
		const url = new URL('http://localhost/api/codebase-index');
		const res = await GET({ url, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('returns files and stats on successful scroll', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/+server.js');
		const url = new URL('http://localhost/api/codebase-index');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.files).toHaveLength(1);
		expect(body.files[0].payload.file_path).toBe('src/routes/api/cases/+server.ts');
		expect(body.stats.totalFiles).toBe(1);
		expect(body.stats.byRole['api-route']).toBe(1);
		expect(body.stats.byRisk['high']).toBe(1);
		expect(body.stats.bySurface['server']).toBe(1);
	});

	it('filters by role query param', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/+server.js');
		const url = new URL('http://localhost/api/codebase-index?role=api-route');
		await GET({ url, locals: { user: { id: 'u1' } } } as any);
		const [, fetchInit] = (fetch as any).mock.calls[0];
		const body = JSON.parse(fetchInit.body);
		expect(body.filter.must).toEqual(
			expect.arrayContaining([{ key: 'role', match: { value: 'api-route' } }])
		);
	});

	it('applies client-side search filter on the returned points', async () => {
		const secondPoint = {
			...SAMPLE_POINT,
			id: 2,
			payload: { ...SAMPLE_POINT.payload, file_path: 'src/lib/utils.ts', summary: 'Utility helpers', tags: ['utils'] },
		};
		vi.stubGlobal(
			'fetch',
			vi.fn(jsonFetch({ result: { points: [SAMPLE_POINT, secondPoint] }, status: 'ok' }))
		);
		const { GET } = await import('../src/routes/api/codebase-index/+server.js');
		const url = new URL('http://localhost/api/codebase-index?search=cases');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		// Only the 'cases' file matches the search term
		expect(body.files).toHaveLength(1);
		expect(body.files[0].payload.file_path).toContain('cases');
	});

	it('returns 400 for invalid query params (limit out of range)', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/+server.js');
		const url = new URL('http://localhost/api/codebase-index?limit=999');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(400);
	});

	it('returns empty files with error field when Qdrant fails', async () => {
		vi.stubGlobal('fetch', vi.fn(jsonFetch({ error: 'not found' }, 404)));
		const { GET } = await import('../src/routes/api/codebase-index/+server.js');
		const url = new URL('http://localhost/api/codebase-index');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.files).toEqual([]);
		expect(body.error).toMatch(/Qdrant request failed/);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/codebase-index (semantic search)
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/codebase-index', () => {
	const EMBED_VEC = Array.from({ length: 768 }, (_, i) => 0.001 * (i + 1));

	beforeEach(() => {
		vi.clearAllMocks();
		mockOllamaFetch.mockResolvedValue(
			new Response(JSON.stringify({ embedding: EMBED_VEC }), { status: 200 })
		);
		// Second global fetch call is Qdrant search
		vi.stubGlobal(
			'fetch',
			vi.fn(jsonFetch({ result: [{ id: 'p1', score: 0.92, payload: SAMPLE_POINT.payload }] }))
		);
	});

	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/+server.js');
		const req = new Request('http://localhost/api/codebase-index', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'auth guard pattern' }),
		});
		const res = await POST({ request: req, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 when query is empty', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/+server.js');
		const req = new Request('http://localhost/api/codebase-index', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: '' }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(400);
	});

	it('returns semantic search results', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/+server.js');
		const req = new Request('http://localhost/api/codebase-index', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'cases API route', limit: 5 }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.query).toBe('cases API route');
		expect(Array.isArray(body.files)).toBe(true);
	});

	it('returns 500 when Ollama embedding fails', async () => {
		mockOllamaFetch.mockResolvedValue(new Response('Server Error', { status: 503 }));
		const { POST } = await import('../src/routes/api/codebase-index/+server.js');
		const req = new Request('http://localhost/api/codebase-index', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'test' }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body.error).toMatch(/embed/i);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/codebase-index/search
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/codebase-index/search', () => {
	const EMBED_VEC = Array.from({ length: 768 }, (_, i) => 0.002 * i);
	const QDRANT_SEARCH_RESULT = {
		result: {
			points: [
				{
					id: 'chunk-abc',
					score: 0.87,
					payload: {
						file_path: 'src/lib/server/rag-pipeline.ts',
						file_name: 'rag-pipeline.ts',
						extension: '.ts',
						content: 'export async function ragQuery(query: string) {',
						chunk_index: 0,
						total_chunks: 3,
						tags: ['rag', 'search'],
					},
				},
			],
		},
	};

	function makeFetch(embedOk = true, searchOk = true) {
		let callCount = 0;
		return vi.fn(async (url: string, _init?: RequestInit) => {
			callCount++;
			if (String(url).includes('/api/embed'))
				return new Response(
					JSON.stringify({ embeddings: [EMBED_VEC] }),
					{ status: embedOk ? 200 : 503 }
				);
			return new Response(
				JSON.stringify(QDRANT_SEARCH_RESULT),
				{ status: searchOk ? 200 : 500 }
			);
		});
	}

	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/search/+server.js');
		const req = new Request('http://localhost/api/codebase-index/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'rag pipeline' }),
		});
		const res = await POST({ request: req, fetch: makeFetch(), locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 when query is missing', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/search/+server.js');
		const req = new Request('http://localhost/api/codebase-index/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});
		const res = await POST({ request: req, fetch: makeFetch(), locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(400);
	});

	it('returns search results with correct shape', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/search/+server.js');
		const req = new Request('http://localhost/api/codebase-index/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'rag pipeline', limit: 5 }),
		});
		const res = await POST({ request: req, fetch: makeFetch(), locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.query).toBe('rag pipeline');
		expect(body.results).toHaveLength(1);
		expect(body.results[0].score).toBe(0.87);
		expect(body.total).toBe(1);
		expect(body.vector_used).toBe('content');
	});

	it('returns 500 when embedding service fails', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/search/+server.js');
		const req = new Request('http://localhost/api/codebase-index/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'test' }),
		});
		const res = await POST({ request: req, fetch: makeFetch(false), locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(500);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/codebase-index/stats
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/codebase-index/stats', () => {
	function makeStatsFetch({
		fastApiOk = false,
		errorCards = true,
		clusterCount = true,
		codebaseCount = true,
	} = {}) {
		return vi.fn(async (url: string) => {
			const u = String(url);
			if (u.includes('fastapi.test')) {
				return new Response('{}', { status: fastApiOk ? 200 : 503 });
			}
			if (u.includes('phase90_error_cards')) {
				const points = errorCards
					? [
							{ payload: { errorCode: 'TS2345', surface: ['server'], tech: ['typescript'], timestamp: '2026-04-15T00:00:00Z' } },
							{ payload: { errorCode: 'TS2345', surface: ['client'], tech: ['svelte'], timestamp: '2026-04-10T00:00:00Z' } },
					  ]
					: [];
				return new Response(JSON.stringify({ result: { points }, status: 'ok' }), { status: 200 });
			}
			if (u.includes('phase90_error_clusters') && u.includes('count')) {
				return new Response(
					JSON.stringify({ result: { count: clusterCount ? 5 : 0 } }),
					{ status: 200 }
				);
			}
			if (u.includes('codebase_chunks_768')) {
				return new Response(
					JSON.stringify({ result: { points_count: codebaseCount ? 3140 : 0 } }),
					{ status: 200 }
				);
			}
			return new Response('{}', { status: 404 });
		});
	}

	it('returns 401 when unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/stats/+server.js');
		const res = await GET({ fetch: makeStatsFetch(), locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('returns aggregated stats from Qdrant', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/stats/+server.js');
		const res = await GET({ fetch: makeStatsFetch(), locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.totalErrors).toBe(2);
		expect(body.errorClusters).toBe(5);
		expect(body.indexedFiles).toBe(3140);
		expect(body.topErrorCodes[0]).toEqual({ code: 'TS2345', count: 2 });
		expect(body.surfaceBreakdown).toMatchObject({ server: 1, client: 1 });
		expect(body.techBreakdown).toMatchObject({ typescript: 1, svelte: 1 });
		expect(body.lastIndexed).toBe('2026-04-15T00:00:00Z');
		expect(body._perf.simdAvailable).toBe(false);
		expect(body._perf.parser).toBe('v8');
	});

	it('returns zero stats gracefully when Qdrant is unavailable', async () => {
		const fetch = vi.fn(async () => new Response('error', { status: 503 }));
		const { GET } = await import('../src/routes/api/codebase-index/stats/+server.js');
		const res = await GET({ fetch, locals: { user: { id: 'u1' } } } as any);
		// Stats endpoint returns 200 with zero values on error
		const body = await res.json();
		expect(body.totalErrors).toBe(0);
		expect(body.indexedFiles).toBe(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// POST + GET /api/codebase-index/graph-sync
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/codebase-index/graph-sync', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSyncCodebaseToNeo4j.mockResolvedValue({
			files: 1335,
			edges: 2168,
			errors: [],
		});
	});

	it('returns 401 when unauthenticated (POST)', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/graph-sync/+server.js');
		const req = new Request('http://localhost/api/codebase-index/graph-sync', { method: 'POST', body: '{}' });
		const res = await POST({ request: req, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('starts a sync job and returns jobId + started status', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/graph-sync/+server.js');
		const req = new Request('http://localhost/api/codebase-index/graph-sync', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ maxFiles: 500 }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe('started');
		expect(typeof body.jobId).toBe('string');
		expect(body.jobId).toMatch(/^[0-9a-f-]{36}$/);
		// syncCodebaseToNeo4j should have been called (fire-and-forget)
		expect(mockSyncCodebaseToNeo4j).toHaveBeenCalledWith(
			expect.objectContaining({ maxFiles: 500 })
		);
	});

	it('GET returns 401 when unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/graph-sync/+server.js');
		const url = new URL('http://localhost/api/codebase-index/graph-sync');
		const res = await GET({ url, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('GET lists recent jobs when no jobId provided', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/graph-sync/+server.js');
		const url = new URL('http://localhost/api/codebase-index/graph-sync');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.jobs)).toBe(true);
	});

	it('GET returns 404 for an unknown jobId', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/graph-sync/+server.js');
		const url = new URL(
			'http://localhost/api/codebase-index/graph-sync?jobId=00000000-0000-0000-0000-000000000000'
		);
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(404);
	});

	it('GET returns job state for a valid jobId', async () => {
		const { POST, GET } = await import('../src/routes/api/codebase-index/graph-sync/+server.js');

		// Start a job
		const postReq = new Request('http://localhost/api/codebase-index/graph-sync', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});
		const postRes = await POST({ request: postReq, locals: { user: { id: 'u1' } } } as any);
		const { jobId } = await postRes.json();

		// Poll the job — status is 'running' or 'done' depending on microtask timing
		const url = new URL(`http://localhost/api/codebase-index/graph-sync?jobId=${jobId}`);
		const getRes = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(getRes.status).toBe(200);
		const job = await getRes.json();
		expect(job.jobId).toBe(jobId);
		expect(['running', 'done', 'error']).toContain(job.status);
		expect(job.startedAt).toBeTruthy();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// POST + GET /api/codebase-index/cluster-detect
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/codebase-index/cluster-detect', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDetectCodebaseClusters.mockResolvedValue({
			filesProcessed: 500,
			clusters: 20,
			errors: [],
		});
		mockCouchdb.get.mockResolvedValue({ id: 'gpu-cluster:k20:0', data: 'cluster summary' });
		mockCouchdb.allDocs.mockResolvedValue({
			rows: [
				{ id: 'gpu-cluster:k20:0', doc: { id: 'gpu-cluster:k20:0', label: 'API Routes' } },
				{ id: 'gpu-cluster:k20:1', doc: { id: 'gpu-cluster:k20:1', label: 'Components' } },
			],
		});
	});

	it('returns 401 when unauthenticated (POST)', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/cluster-detect/+server.js');
		const req = new Request('http://localhost/api/codebase-index/cluster-detect', { method: 'POST', body: '{}' });
		const res = await POST({ request: req, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('starts a cluster job and returns jobId', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/cluster-detect/+server.js');
		const req = new Request('http://localhost/api/codebase-index/cluster-detect', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ k: 20, maxFiles: 1000 }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe('started');
		expect(typeof body.jobId).toBe('string');
		expect(mockDetectCodebaseClusters).toHaveBeenCalledWith(
			expect.objectContaining({ k: 20, maxFiles: 1000 })
		);
	});

	it('GET returns 401 when unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/cluster-detect/+server.js');
		const url = new URL('http://localhost/api/codebase-index/cluster-detect');
		const res = await GET({ url, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('GET returns recent jobs list by default', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/cluster-detect/+server.js');
		const url = new URL('http://localhost/api/codebase-index/cluster-detect');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.jobs)).toBe(true);
	});

	it('GET returns 404 for unknown jobId', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/cluster-detect/+server.js');
		const url = new URL(
			'http://localhost/api/codebase-index/cluster-detect?jobId=nonexistent-id'
		);
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(404);
	});

	it('GET returns cluster doc when k and clusterId provided', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/cluster-detect/+server.js');
		const url = new URL(
			'http://localhost/api/codebase-index/cluster-detect?k=20&clusterId=0'
		);
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.doc).toBeTruthy();
		expect(mockCouchdb.get).toHaveBeenCalledWith('graph_clusters', 'gpu-cluster:k20:0');
	});

	it('GET lists all cluster docs when list=true', async () => {
		const { GET } = await import('../src/routes/api/codebase-index/cluster-detect/+server.js');
		const url = new URL('http://localhost/api/codebase-index/cluster-detect?list=true');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.total).toBe(2);
		expect(body.docs).toHaveLength(2);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/codebase-index/reindex
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/codebase-index/reindex', () => {
	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/reindex/+server.js');
		const req = new Request('http://localhost/api/codebase-index/reindex', { method: 'POST', body: '{}' });
		const res = await POST({
			request: req,
			fetch: vi.fn(jsonFetch({ success: true })),
			locals: {},
		} as any);
		expect(res.status).toBe(401);
	});

	it('returns success with FastAPI reindex result and runs clustering', async () => {
		const mockFetch = vi.fn(async (url: string) => {
			if (String(url).includes('/api/codebase/reindex'))
				return new Response(JSON.stringify({ success: true, filesIndexed: 1200 }), { status: 200 });
			if (String(url).includes('/api/codebase/cluster'))
				return new Response(JSON.stringify({ clusters: 20 }), { status: 200 });
			return new Response('{}', { status: 404 });
		});

		const { POST } = await import('../src/routes/api/codebase-index/reindex/+server.js');
		const req = new Request('http://localhost/api/codebase-index/reindex', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ force: true, runClustering: true }),
		});
		const res = await POST({ request: req, fetch: mockFetch, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.filesIndexed).toBe(1200);
		expect(body.clustering).toEqual({ clusters: 20 });
	});

	it('returns mock success when FastAPI is unavailable', async () => {
		const mockFetch = vi.fn(async () => new Response('connection refused', { status: 503 }));
		const { POST } = await import('../src/routes/api/codebase-index/reindex/+server.js');
		const req = new Request('http://localhost/api/codebase-index/reindex', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({}),
		});
		const res = await POST({ request: req, fetch: mockFetch, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		// Graceful degradation — still returns success with mock message
		expect(body.success).toBe(true);
		expect(body.message).toMatch(/reindex/i);
	});

	it('skips clustering when runClustering=false', async () => {
		const mockFetch = vi.fn(async (url: string) => {
			if (String(url).includes('/api/codebase/reindex'))
				return new Response(JSON.stringify({ success: true }), { status: 200 });
			return new Response('{}', { status: 404 });
		});
		const { POST } = await import('../src/routes/api/codebase-index/reindex/+server.js');
		const req = new Request('http://localhost/api/codebase-index/reindex', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ runClustering: false }),
		});
		const res = await POST({ request: req, fetch: mockFetch, locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		// Cluster endpoint should not have been called
		const clusterCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
			String(url).includes('/api/codebase/cluster')
		);
		expect(clusterCalls).toHaveLength(0);
		expect(body.clustering).toBeUndefined();
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/codebase-index/kag-notebook
// ─────────────────────────────────────────────────────────────────────────────

const CLUSTER_POINT = {
	id: 'c1',
	payload: {
		cluster_label: 'Auth Errors',
		description: 'Authentication-related TypeScript errors',
		error_count: 12,
		affected_files: ['src/routes/api/cases/+server.ts'],
		kag_context: ''
	},
};

const CARD_POINT = {
	id: 'e1',
	payload: {
		cluster_id: 'c1',
		error_code: 'TS2339',
		normalized_message: 'Property does not exist on type',
		file_path: 'src/routes/api/cases/+server.ts',
	},
};

const GPU_CLUSTER_DOC = {
	_id: 'cluster-0',
	type: 'gpu-cluster',
	clusterId: 0,
	k: 20,
	memberCount: 14,
	members: [{ fileId: 'f1', filePath: 'src/routes/api/cases/+server.ts', astCluster: 'api' }],
	dominantAstCluster: 'api',
	generatedAt: '2026-04-15T00:00:00Z',
	gpuSource: 'gpu',
};

const RECO_DOC = {
	_id: 'graph-reco:file:f1',
	type: 'graph-reco',
	fileId: 'f1',
	filePath: 'src/routes/api/cases/+server.ts',
	cluster: 'api',
	recommendedImports: [
		{ targetFileId: 'f2', targetFilePath: 'src/lib/server/db/client.ts', similarity: 0.91, reason: 'shared db pattern' }
	],
	generatedAt: '2026-04-15T00:00:00Z',
	gpuSource: 'gpu',
};

/** Set up CouchDB mocks for one kag-notebook GET call (GPU clusters + import recos). */
function setupKagCouchdbMocks() {
	// mockReset flushes any queued mockResolvedValueOnce responses left over from
	// a previous test so the queue starts clean before we add new responses.
	mockCouchdb.allDocs.mockReset();
	mockCouchdb.allDocs
		.mockResolvedValueOnce({
			total_rows: 1,
			rows: [{ id: GPU_CLUSTER_DOC._id, key: GPU_CLUSTER_DOC._id, value: { rev: '1-x' }, doc: GPU_CLUSTER_DOC }],
		})
		.mockResolvedValueOnce({
			total_rows: 1,
			rows: [{ id: RECO_DOC._id, key: RECO_DOC._id, value: { rev: '1-x' }, doc: RECO_DOC }],
		});
}

describe('GET /api/codebase-index/kag-notebook', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupKagCouchdbMocks();
	});

	it('returns 401 when unauthenticated', async () => {
		vi.stubGlobal('fetch', vi.fn());
		const { GET } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const url = new URL('http://localhost/api/codebase-index/kag-notebook');
		const res = await GET({ url, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('builds cells from error clusters and codebase files', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn()
				.mockImplementationOnce(jsonFetch({ result: { points: [CLUSTER_POINT] } })) // clusters
				.mockImplementationOnce(jsonFetch({ result: { points: [CARD_POINT] } }))    // cards
				.mockImplementationOnce(jsonFetch({ result: { points: [SAMPLE_POINT] } }))  // files
		);
		const { GET } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const url = new URL('http://localhost/api/codebase-index/kag-notebook');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.cells).toHaveLength(1);
		expect(body.cells[0].title).toBe('Auth Errors');
		expect(body.cells[0].errorCount).toBe(12);
		expect(body.cells[0].aceReady).toBe(true);
		expect(body.cells[0].topErrors[0].code).toBe('TS2339');
		expect(body.stats.errorClusters).toBe(1);
		expect(body.stats.gpuClusters).toBe(1);
	});

	it('enriches cells with GPU cluster id and import recommendations from CouchDB', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn()
				.mockImplementationOnce(jsonFetch({ result: { points: [CLUSTER_POINT] } }))
				.mockImplementationOnce(jsonFetch({ result: { points: [CARD_POINT] } }))
				.mockImplementationOnce(jsonFetch({ result: { points: [SAMPLE_POINT] } }))
		);
		const { GET } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const url = new URL('http://localhost/api/codebase-index/kag-notebook');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		const cell = body.cells[0];
		// GPU cluster data from CouchDB graph_clusters
		expect(cell.gpuClusterId).toBe(0);
		expect(cell.gpuClusterSize).toBe(14);
		// Import recommendations from CouchDB graph_recommendations
		expect(cell.importRecommendations).toHaveLength(1);
		expect(cell.importRecommendations[0].similarity).toBeCloseTo(0.91, 2);
	});

	it('falls back to file-profile cells when no error clusters exist', async () => {
		mockCouchdb.allDocs.mockReset()
			.mockResolvedValueOnce({ total_rows: 0, rows: [] })
			.mockResolvedValueOnce({ total_rows: 0, rows: [] });
		const highRiskPoint = {
			...SAMPLE_POINT,
			payload: { ...SAMPLE_POINT.payload, risk: 'high' },
		};
		vi.stubGlobal(
			'fetch',
			vi.fn()
				.mockImplementationOnce(jsonFetch({ result: { points: [] } }))             // no clusters
				.mockImplementationOnce(jsonFetch({ result: { points: [] } }))             // no cards
				.mockImplementationOnce(jsonFetch({ result: { points: [highRiskPoint] } })) // files
		);
		const { GET } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const url = new URL('http://localhost/api/codebase-index/kag-notebook');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		expect(body.cells[0].type).toBe('file-profile');
		expect(body.stats.errorClusters).toBe(0);
	});

	it('degrades gracefully when Qdrant is unreachable', async () => {
		mockCouchdb.allDocs.mockReset()
			.mockResolvedValue({ total_rows: 0, rows: [] });
		vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))));
		const { GET } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const url = new URL('http://localhost/api/codebase-index/kag-notebook');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.cells).toEqual([]);
		expect(body.stats.totalFiles).toBe(0);
	});

	it('respects limit query param (max 50)', async () => {
		vi.stubGlobal('fetch', vi.fn(jsonFetch({ result: { points: [] } })));
		const { GET } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const url = new URL('http://localhost/api/codebase-index/kag-notebook?limit=999');
		// Should not throw — limit is clamped to 50
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/codebase-index/kag-notebook
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/codebase-index/kag-notebook', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it('returns 401 when unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const req = new Request('http://localhost/api/codebase-index/kag-notebook', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'ace-fix', errorId: 'test-id' }),
		});
		const res = await POST({ request: req, locals: {}, fetch } as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for unknown action', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const req = new Request('http://localhost/api/codebase-index/kag-notebook', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'unknown' }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } }, fetch } as any);
		expect(res.status).toBe(400);
	});

	it('ace-fix proxies to phase109/kag and returns result', async () => {
		const mockFetch = vi.fn(jsonFetch({ result: { rootCause: 'Missing null check' }, degraded: false }));
		const { POST } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const req = new Request('http://localhost/api/codebase-index/kag-notebook', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'ace-fix', errorId: 'demo-0' }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } }, fetch: mockFetch } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.errorId).toBe('demo-0');
		expect(body.degraded).toBe(false);
		expect(mockFetch).toHaveBeenCalledWith('/api/phase109/kag', expect.objectContaining({ method: 'POST' }));
	});

	it('ace-fix returns degraded:true when Neo4j is unavailable', async () => {
		const mockFetch = vi.fn(jsonFetch({ result: null, degraded: true, message: 'Neo4j not available' }));
		const { POST } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const req = new Request('http://localhost/api/codebase-index/kag-notebook', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'ace-fix', errorId: 'demo-0' }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } }, fetch: mockFetch } as any);
		const body = await res.json();
		expect(body.degraded).toBe(true);
		expect(body.aceContext).toBeNull();
	});

	it('ace-fix requires errorId', async () => {
		const { POST } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const req = new Request('http://localhost/api/codebase-index/kag-notebook', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'ace-fix' }), // missing errorId
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } }, fetch } as any);
		expect(res.status).toBe(400);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/codebase-index/ingest-errors  (collection status)
// POST /api/codebase-index/ingest-errors (migrate / live / both)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal 768-dim zero vector for fixture data. */
const ZERO_VEC = new Array(768).fill(0);

/** One phase89 cluster point returned by Qdrant scroll. */
const PHASE89_POINT = {
	id: 286855502,
	vector: ZERO_VEC,
	payload: {
		cluster_id: 3,
		error_type: 'general-ts-error',
		summary: "Cluster centers on general-ts-error. Example: '??' and '||' operations cannot be mixed.",
		member_count: 4,
	},
};

// Fetch mock for ingest-errors: dispatches by URL/method to return Qdrant-shaped responses.
// GET phase90 collections -> exists/404, POST phase89 scroll -> points, PUT -> success.
function makeIngestFetch({
	phase90Exists = false,
	phase89Points = [PHASE89_POINT],
}: {
	phase90Exists?: boolean;
	phase89Points?: typeof PHASE89_POINT[];
} = {}) {
	return vi.fn(async (url: string, init?: RequestInit) => {
		const u = String(url);
		const method = init?.method?.toUpperCase() ?? 'GET';

		// PUT collection creation or point upsert → always succeed
		if (method === 'PUT') {
			return new Response(JSON.stringify({ result: null, status: 'ok' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// POST scroll on phase89 source
		if (method === 'POST' && u.includes('phase89_error_chunks/points/scroll')) {
			return new Response(
				JSON.stringify({ result: { points: phase89Points, next_page_offset: null } }),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// GET collection info
		if (method === 'GET' && u.includes('/collections/')) {
			const isPhase90 = u.includes('phase90_error_clusters') || u.includes('phase90_error_cards');
			if (isPhase90 && !phase90Exists) {
				return new Response(JSON.stringify({ status: 'error', error: 'Not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			const pts = isPhase90 ? (phase90Exists ? phase89Points.length : 0) : phase89Points.length;
			return new Response(
				JSON.stringify({ result: { status: 'green', points_count: pts } }),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Fallback
		return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
	});
}

describe('GET /api/codebase-index/ingest-errors', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns 401 when unauthenticated', async () => {
		vi.stubGlobal('fetch', makeIngestFetch());
		const { GET } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const res = await GET({ locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('reports both phase90 collections as existing when they are present', async () => {
		vi.stubGlobal('fetch', makeIngestFetch({ phase90Exists: true }));
		const { GET } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const res = await GET({ locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body['phase90_error_clusters'].exists).toBe(true);
		expect(body['phase90_error_clusters'].points).toBe(1); // one phase89 point → 1 count
		expect(body['phase90_error_cards'].exists).toBe(true);
		expect(body.sourcePoints).toBe(13); // hard-coded source doc count
	});

	it('reports collections as missing when they do not exist', async () => {
		vi.stubGlobal('fetch', makeIngestFetch({ phase90Exists: false }));
		const { GET } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const res = await GET({ locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		expect(body['phase90_error_clusters'].exists).toBe(false);
		expect(body['phase90_error_clusters'].status).toBe('missing');
	});
});

describe('POST /api/codebase-index/ingest-errors — migrate mode', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns 401 when unauthenticated', async () => {
		vi.stubGlobal('fetch', makeIngestFetch());
		const { POST } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const req = new Request('http://localhost/api/codebase-index/ingest-errors', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'migrate' }),
		});
		const res = await POST({ request: req, locals: {} } as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for invalid mode', async () => {
		vi.stubGlobal('fetch', makeIngestFetch());
		const { POST } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const req = new Request('http://localhost/api/codebase-index/ingest-errors', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'invalid-mode' }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(400);
	});

	it('migrate: reads phase89, upserts phase90 collections, returns ingested counts', async () => {
		const mockFetch = makeIngestFetch({ phase90Exists: false, phase89Points: [PHASE89_POINT] });
		vi.stubGlobal('fetch', mockFetch);
		const { POST } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const req = new Request('http://localhost/api/codebase-index/ingest-errors', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'migrate', force: true }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.mode).toBe('migrate');
		expect(body.ingested.clusters).toBe(1);
		expect(body.ingested.cards).toBe(1);
		// Qdrant PUT upsert calls should have been made for both collections
		const putCalls = mockFetch.mock.calls.filter(([, init]: [string, RequestInit]) => init?.method === 'PUT');
		expect(putCalls.length).toBeGreaterThanOrEqual(2); // collection creation + point upserts
	});

	it('migrate: skips when phase90 already has data and force=false (idempotent)', async () => {
		vi.stubGlobal('fetch', makeIngestFetch({ phase90Exists: true }));
		const { POST } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const req = new Request('http://localhost/api/codebase-index/ingest-errors', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'migrate', force: false }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.skipped).toBe(true);
		expect(body.existingClusters).toBeGreaterThan(0);
	});

	it('migrate force=true: re-ingests even when phase90 data exists', async () => {
		vi.stubGlobal('fetch', makeIngestFetch({ phase90Exists: true, phase89Points: [PHASE89_POINT] }));
		const { POST } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const req = new Request('http://localhost/api/codebase-index/ingest-errors', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'migrate', force: true }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.skipped).toBeUndefined();
		expect(body.ingested.clusters).toBe(1);
	});

	it('migrate: card cluster_id matches the Qdrant point id of its parent cluster', async () => {
		// This guards against the aceReady=false regression where cluster_id was set to
		// sequential index instead of the Qdrant point ID.  The kag-notebook matches cards
		// with: c.payload?.cluster_id === cluster.id  (point ID, not sequential index).
		const mockFetch = makeIngestFetch({ phase90Exists: false, phase89Points: [PHASE89_POINT] });
		vi.stubGlobal('fetch', mockFetch);
		const { POST } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const req = new Request('http://localhost/api/codebase-index/ingest-errors', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'migrate', force: true }),
		});
		await POST({ request: req, locals: { user: { id: 'u1' } } } as any);

		// Find the PUT call that upserts card points
		const cardUpsert = mockFetch.mock.calls.find(([url, init]: [string, RequestInit]) => {
			if (init?.method !== 'PUT') return false;
			if (!String(url).includes('phase90_error_cards/points')) return false;
			const pts = JSON.parse(String(init.body ?? '{}')).points;
			return Array.isArray(pts) && pts.length > 0;
		});
		expect(cardUpsert).toBeDefined();
		const pts = JSON.parse(String(cardUpsert[1].body)).points;
		// cluster_id in card payload must equal the source phase89 Qdrant point ID
		expect(pts[0].payload.cluster_id).toBe(PHASE89_POINT.id);
	});
});

describe('POST /api/codebase-index/ingest-errors — live mode', () => {
	beforeEach(() => vi.clearAllMocks());

	it('live: handles tsc exec failure gracefully — returns 0 clusters', async () => {
		// execAsync rejects → route catches → empty tscOutput → 0 errors parsed → 0 clusters
		mockExecAsync.mockRejectedValue(new Error('tsc binary not found'));
		vi.stubGlobal('fetch', makeIngestFetch({ phase90Exists: false }));
		const { POST } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const req = new Request('http://localhost/api/codebase-index/ingest-errors', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'live', force: true }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.ingested.clusters).toBe(0);
	});

	it('live: parses tsc output into error clusters', async () => {
		const tscOutput = [
			"src/routes/api/cases/+server.ts(42,10): error TS2304: Cannot find name 'db'.",
			"src/routes/api/cases/+server.ts(88,5): error TS2304: Cannot find name 'db'.",
			"src/lib/server/auth.ts(15,3): error TS2339: Property 'user' does not exist.",
		].join('\n');

		mockExecAsync.mockResolvedValue({ stdout: tscOutput, stderr: '' });
		vi.stubGlobal('fetch', makeIngestFetch({ phase90Exists: false }));
		const { POST } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const req = new Request('http://localhost/api/codebase-index/ingest-errors', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'live', force: true }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		expect(body.success).toBe(true);
		// 2 distinct error codes (TS2304, TS2339) → 2 clusters
		expect(body.ingested.clusters).toBe(2);
		// 3 total errors → 3 cards
		expect(body.ingested.cards).toBe(3);
	});
});

describe('POST /api/codebase-index/ingest-errors — both mode', () => {
	beforeEach(() => vi.clearAllMocks());

	it('both: falls back to migrate when live produces 0 clusters', async () => {
		// execAsync throws → 0 live clusters → falls back to migrate
		mockExecAsync.mockRejectedValue(new Error('tsc not found'));
		vi.stubGlobal('fetch', makeIngestFetch({ phase90Exists: false, phase89Points: [PHASE89_POINT] }));
		const { POST } = await import('../src/routes/api/codebase-index/ingest-errors/+server.js');
		const req = new Request('http://localhost/api/codebase-index/ingest-errors', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mode: 'both', force: true }),
		});
		const res = await POST({ request: req, locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		expect(body.success).toBe(true);
		// Live contributed 0, migrate fallback contributed 1
		expect(body.ingested.clusters).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// KAG notebook contract — regression guard
// ─────────────────────────────────────────────────────────────────────────────

describe('KAG notebook contract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupKagCouchdbMocks();
	});

	it('response always contains required top-level keys', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn()
				.mockImplementationOnce(jsonFetch({ result: { points: [] } }))
				.mockImplementationOnce(jsonFetch({ result: { points: [] } }))
				.mockImplementationOnce(jsonFetch({ result: { points: [] } }))
		);
		const { GET } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const url = new URL('http://localhost/api/codebase-index/kag-notebook');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		// Top-level contract
		expect(body).toHaveProperty('cells');
		expect(body).toHaveProperty('stats');
		expect(body).toHaveProperty('exportedAt');
		expect(Array.isArray(body.cells)).toBe(true);
		// Stats shape
		const { stats } = body;
		expect(stats).toHaveProperty('totalCells');
		expect(stats).toHaveProperty('totalFiles');
		expect(stats).toHaveProperty('errorClusters');
		expect(stats).toHaveProperty('errorCards');
		expect(stats).toHaveProperty('highRiskFiles');
		expect(stats).toHaveProperty('aceReadyCells');
		expect(stats).toHaveProperty('gpuClusters');
		expect(stats).toHaveProperty('importRecos');
	});

	it('aceReadyCells equals number of cells that have topErrors', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn()
				.mockImplementationOnce(jsonFetch({ result: { points: [CLUSTER_POINT] } }))
				.mockImplementationOnce(jsonFetch({ result: { points: [CARD_POINT] } }))
				.mockImplementationOnce(jsonFetch({ result: { points: [SAMPLE_POINT] } }))
		);
		const { GET } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const url = new URL('http://localhost/api/codebase-index/kag-notebook');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		const aceReadyCount = body.cells.filter((c: { aceReady: boolean }) => c.aceReady).length;
		expect(body.stats.aceReadyCells).toBe(aceReadyCount);
	});

	it('cluster_id / point-id matching: cells built from clusters get their error cards (aceReady=true)', async () => {
		// Guards the regression where card cluster_id was sequential index instead of Qdrant point ID.
		// CLUSTER_POINT.id = 'c1', CARD_POINT.payload.cluster_id = 'c1' → should match.
		vi.stubGlobal(
			'fetch',
			vi.fn()
				.mockImplementationOnce(jsonFetch({ result: { points: [CLUSTER_POINT] } }))
				.mockImplementationOnce(jsonFetch({ result: { points: [CARD_POINT] } }))
				.mockImplementationOnce(jsonFetch({ result: { points: [] } }))
		);
		const { GET } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const url = new URL('http://localhost/api/codebase-index/kag-notebook');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		expect(body.cells[0].aceReady).toBe(true);
		expect(body.cells[0].topErrors).toHaveLength(1);
	});

	it('stats counts are consistent with cells array length', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn()
				.mockImplementationOnce(jsonFetch({ result: { points: [CLUSTER_POINT] } }))
				.mockImplementationOnce(jsonFetch({ result: { points: [CARD_POINT] } }))
				.mockImplementationOnce(jsonFetch({ result: { points: [SAMPLE_POINT] } }))
		);
		const { GET } = await import('../src/routes/api/codebase-index/kag-notebook/+server.js');
		const url = new URL('http://localhost/api/codebase-index/kag-notebook');
		const res = await GET({ url, locals: { user: { id: 'u1' } } } as any);
		const body = await res.json();
		expect(body.stats.totalCells).toBe(body.cells.length);
		expect(body.stats.errorClusters).toBe(1);
		expect(body.stats.errorCards).toBe(1);
	});
});
