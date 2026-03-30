/**
 * Errors + Feedback + Fictional Cases + Engagement + Knowledge Stats — Unit Tests
 *
 * Tests for:
 *   /api/errors/client-report (POST)
 *   /api/errors/route-errors (GET)
 *   /api/errors/summary (GET)
 *   /api/feedback (POST)
 *   /api/fictional-cases (GET)
 *   /api/fictional-cases/[id] (GET/PATCH/DELETE)
 *   /api/engagement/heartbeat (GET/POST)
 *   /api/engagement/scan (POST)
 *   /api/knowledge/stats (GET)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: { OLLAMA_BASE_URL: 'http://ollama.test' },
}));

vi.mock('$lib/config/env.server.js', () => ({
	getOllamaUrl: () => 'http://ollama.test',
	getDatabaseUrl: () => 'postgres://localhost/test',
	getQdrantUrl: () => 'http://qdrant.test:6333',
}));

// ── DB mock ────────────────────────────────────────────────────
const mockInsert = vi.fn(() => ({ values: vi.fn(async () => ({})) }));
const mockExecute = vi.fn(async () => ({ rows: [] }));
const mockReturning = vi.fn(async () => [{ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }]);
const mockUpdate = vi.fn(() => ({
	set: vi.fn(() => ({
		where: vi.fn(() => ({
			returning: mockReturning,
		})),
	})),
}));
const mockDelete = vi.fn(() => ({
	where: vi.fn(() => ({
		returning: vi.fn(async () => [{ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }]),
	})),
}));

function buildSelectChain(data: unknown[] = []) {
	const chain: any = {};
	chain.from = vi.fn(() => chain);
	chain.where = vi.fn(() => chain);
	chain.orderBy = vi.fn(() => chain);
	chain.limit = vi.fn(() => chain);
	chain.offset = vi.fn(() => chain);
	chain.groupBy = vi.fn(() => chain);
	chain.then = (resolve: Function) => resolve(data);
	// Make the chain thenable (awaitable)
	chain[Symbol.toStringTag] = 'Promise';
	return chain;
}

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: vi.fn(() => buildSelectChain()),
		insert: (...args: unknown[]) => mockInsert(...args),
		update: (...args: unknown[]) => mockUpdate(...args),
		delete: (...args: unknown[]) => mockDelete(...args),
		execute: (...args: unknown[]) => mockExecute(...args),
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	errorEvents: { id: 'id', routePath: 'route_path', kind: 'kind', severity: 'severity', message: 'message', stack: 'stack', lineNumber: 'line_number', columnNumber: 'column_number', file: 'file', clusterId: 'cluster_id', collectedAt: 'collected_at' },
	errorClusters: { id: 'id', pattern: 'pattern', severity: 'severity', errorCount: 'error_count', routePaths: 'route_paths' },
	fictionalCases: { id: 'id', caseId: 'case_id', category: 'category', charge: 'charge', primaryStatute: 'primary_statute', defendantName: 'defendant_name', incidentDate: 'incident_date', jurisdictionCity: 'jurisdiction_city', jurisdiction: 'jurisdiction', financialLoss: 'financial_loss', generatedBy: 'generated_by', createdAt: 'created_at', narrative: 'narrative', disclaimer: 'disclaimer', metadata: 'metadata' },
	fictionalCaseCharges: { id: 'id', fictionalCaseId: 'fictional_case_id' },
	fictionalCaseActors: { id: 'id', fictionalCaseId: 'fictional_case_id' },
	fictionalCaseEvents: { id: 'id', fictionalCaseId: 'fictional_case_id', orderIndex: 'order_index' },
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...a: unknown[]) => ({ type: 'eq', a })),
	desc: vi.fn((...a: unknown[]) => ({ type: 'desc', a })),
	and: vi.fn((...a: unknown[]) => ({ type: 'and', a })),
	or: vi.fn((...a: unknown[]) => ({ type: 'or', a })),
	gte: vi.fn((...a: unknown[]) => ({ type: 'gte', a })),
	ilike: vi.fn((...a: unknown[]) => ({ type: 'ilike', a })),
	count: vi.fn(() => 'count_fn'),
	sql: Object.assign(vi.fn((...a: unknown[]) => ({ type: 'sql', a })), {
		raw: vi.fn((s: string) => s),
	}),
}));

// ── RabbitMQ mock ──────────────────────────────────────────────
vi.mock('$lib/server/queue/rabbitmq-manager-fixed.js', () => ({
	rabbitmq: {
		publishErrorEmbed: vi.fn(async () => {}),
	},
}));

// ── Auth helpers mock ──────────────────────────────────────────
vi.mock('$lib/server/auth-helpers.js', () => ({
	requireAuth: vi.fn(async () => {}),
}));

// ── Validation mock ────────────────────────────────────────────
vi.mock('$lib/server/validation.js', () => ({
	isUuid: vi.fn((s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)),
}));

// ── Feedback store mock ────────────────────────────────────────
const mockFeedbackStore = {
	recordFeedback: vi.fn(),
	getFeedbackBoost: vi.fn(() => 1.2),
	size: 5,
};

vi.mock('$lib/server/ml/feedback-store.js', () => ({
	feedbackStore: mockFeedbackStore,
}));

// ── Engagement mocks ───────────────────────────────────────────
const mockRecordHeartbeat = vi.fn(async () => {});
const mockGetIdleDuration = vi.fn(async () => 60000); // 1 min
const mockScanIdleUsers = vi.fn(async () => ({ scanned: 10, notified: 2, errors: 0 }));

vi.mock('$lib/server/engagement/idle-reengagement', () => ({
	recordHeartbeat: (...args: unknown[]) => mockRecordHeartbeat(...args),
	getIdleDuration: (...args: unknown[]) => mockGetIdleDuration(...args),
	scanIdleUsers: (...args: unknown[]) => mockScanIdleUsers(...args),
}));

// ── Knowledge stats mock ───────────────────────────────────────
const mockGetStats = vi.fn(async () => ({
	totalDocuments: 150,
	indexedVectors: 3000,
	collections: {
		qdrant: { points: 2500, status: 'green' },
		postgres: { rows: 150 },
		minio: { objects: 45, size: '250MB' },
	},
	lastIndexed: '2026-03-29T00:00:00Z',
}));

vi.mock('$lib/services/knowledge-search/KnowledgeSearcher.js', () => ({
	getKnowledgeSearcher: () => ({ getStats: mockGetStats }),
}));

// ── Helpers ────────────────────────────────────────────────────
function mkRequest(body?: unknown): Request {
	return new Request('http://localhost/api/test', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
}

function mkUrl(path: string, params?: Record<string, string>): URL {
	const u = new URL(`http://localhost${path}`);
	if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
	return u;
}

const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const authedLocals = { user: { id: 'user-1', email: 'test@test.com', role: 'admin' } } as any;
const anonLocals = { user: null } as any;

beforeEach(() => {
	vi.clearAllMocks();
	mockExecute.mockReset();
	mockExecute.mockResolvedValue({ rows: [] });
	mockReturning.mockReset();
	mockReturning.mockResolvedValue([{ id: VALID_UUID }]);
});

// ════════════════════════════════════════════════════════════════
// CLIENT ERROR REPORT: /api/errors/client-report
// ════════════════════════════════════════════════════════════════
describe('/api/errors/client-report (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/errors/client-report/+server');
		POST = mod.POST;
	});

	it('stores client errors and publishes to RabbitMQ', async () => {
		const res = await POST({
			request: mkRequest({
				errors: [
					{ message: 'TypeError: x is not a function', type: 'handleError', url: '/cases' },
					{ message: 'fetch failed', type: 'fetch-failure', url: '/api/health' },
				],
			}),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.stored).toBe(2);
		expect(data.published).toBe(2);
		expect(data.total).toBe(2);
		expect(mockInsert).toHaveBeenCalledTimes(2);
	});

	it('allows unauthenticated requests', async () => {
		const res = await POST({
			request: mkRequest({
				errors: [{ message: 'Uncaught error', type: 'uncaught' }],
			}),
			locals: anonLocals,
		});
		expect(res.status).toBe(200);
	});

	it('returns 400 for empty errors array', async () => {
		const res = await POST({
			request: mkRequest({ errors: [] }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns 400 for invalid error type', async () => {
		const res = await POST({
			request: mkRequest({
				errors: [{ message: 'test', type: 'invalid-type' }],
			}),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns 400 for missing errors field', async () => {
		const res = await POST({
			request: mkRequest({}),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('continues processing when individual errors fail', async () => {
		mockInsert
			.mockImplementationOnce(() => ({ values: vi.fn(async () => { throw new Error('DB error'); }) }))
			.mockImplementationOnce(() => ({ values: vi.fn(async () => ({})) }));

		const res = await POST({
			request: mkRequest({
				errors: [
					{ message: 'Error 1', type: 'uncaught' },
					{ message: 'Error 2', type: 'uncaught' },
				],
			}),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.stored).toBe(1); // Only second succeeded
	});
});

// ════════════════════════════════════════════════════════════════
// ROUTE ERRORS: /api/errors/route-errors
// ════════════════════════════════════════════════════════════════
describe('/api/errors/route-errors (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const { db } = await import('$lib/server/db/client');
		(db.select as any).mockImplementation((cols?: unknown) => {
			const chain: any = {};
			chain.from = vi.fn(() => chain);
			chain.where = vi.fn(() => chain);
			chain.orderBy = vi.fn(() => chain);
			chain.limit = vi.fn(() => chain);
			chain.groupBy = vi.fn(() => chain);
			chain.then = (resolve: Function) => resolve([]);
			chain[Symbol.toStringTag] = 'Promise';
			return chain;
		});
		const mod = await import('../src/routes/api/errors/route-errors/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({ url: mkUrl('/api/errors/route-errors', { route: '/cases' }), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns 400 when route param is missing', async () => {
		const res = await GET({ url: mkUrl('/api/errors/route-errors'), locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('returns error data for a route', async () => {
		const res = await GET({
			url: mkUrl('/api/errors/route-errors', { route: '/cases/[id]' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.route).toBe('/cases/[id]');
		expect(Array.isArray(data.errors)).toBe(true);
		expect(data.counts).toBeDefined();
		expect(data.total).toBeDefined();
		expect(data.since).toBeTruthy();
	});

	it('respects limit parameter', async () => {
		const res = await GET({
			url: mkUrl('/api/errors/route-errors', { route: '/cases', limit: '5' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(200);
	});

	it('returns empty on DB error', async () => {
		const { db } = await import('$lib/server/db/client');
		(db.select as any).mockImplementation(() => {
			const chain: any = {};
			chain.from = vi.fn(() => chain);
			chain.where = vi.fn(() => { throw new Error('DB down'); });
			return chain;
		});

		const res = await GET({
			url: mkUrl('/api/errors/route-errors', { route: '/cases' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.errors).toEqual([]);
	});
});

// ════════════════════════════════════════════════════════════════
// ERROR SUMMARY: /api/errors/summary
// ════════════════════════════════════════════════════════════════
describe('/api/errors/summary (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/errors/summary/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({ locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns error summary', async () => {
		mockExecute.mockResolvedValueOnce([
			{ file_path: '/cases', code: 'TS2322', count: '5' },
			{ file_path: '/evidence', code: 'TS2345', count: '3' },
		]);

		const res = await GET({ locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.total).toBe(8);
		expect(data.byRoute['/cases']).toBe(5);
		expect(data.byRoute['/evidence']).toBe(3);
	});

	it('returns empty on table missing', async () => {
		mockExecute.mockRejectedValueOnce(new Error('relation does not exist'));

		const res = await GET({ locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.total).toBe(0);
	});
});

// ════════════════════════════════════════════════════════════════
// FEEDBACK: /api/feedback
// ════════════════════════════════════════════════════════════════
describe('/api/feedback (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/feedback/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST({
			request: mkRequest({ documentId: 'doc-1', rating: 0.8 }),
			locals: anonLocals,
		});
		expect(res.status).toBe(401);
	});

	it('records feedback successfully', async () => {
		const res = await POST({
			request: mkRequest({ documentId: 'doc-1', rating: 0.8 }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.boost).toBe(1.2);
		expect(data.totalTracked).toBe(5);
		expect(mockFeedbackStore.recordFeedback).toHaveBeenCalledWith('doc-1', 0.8);
	});

	it('returns 400 for missing documentId', async () => {
		const res = await POST({
			request: mkRequest({ rating: 0.5 }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns 400 for rating out of range', async () => {
		const res = await POST({
			request: mkRequest({ documentId: 'doc-1', rating: 5 }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns 400 for empty documentId', async () => {
		const res = await POST({
			request: mkRequest({ documentId: '', rating: 0.5 }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns 500 on store error', async () => {
		mockFeedbackStore.recordFeedback.mockImplementationOnce(() => { throw new Error('Store error'); });

		const res = await POST({
			request: mkRequest({ documentId: 'doc-1', rating: 0.5 }),
			locals: authedLocals,
		});
		expect(res.status).toBe(500);
	});
});

// ════════════════════════════════════════════════════════════════
// FICTIONAL CASES (LIST): /api/fictional-cases
// ════════════════════════════════════════════════════════════════
describe('/api/fictional-cases (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const { db } = await import('$lib/server/db/client');
		// The route uses Promise.all with two parallel queries + a third for category stats
		(db.select as any).mockImplementation(() => {
			const chain: any = {};
			chain.from = vi.fn(() => chain);
			chain.where = vi.fn(() => chain);
			chain.orderBy = vi.fn(() => chain);
			chain.limit = vi.fn(() => chain);
			chain.offset = vi.fn(() => chain);
			chain.groupBy = vi.fn(() => chain);
			chain.then = (resolve: Function) => resolve([]);
			chain[Symbol.toStringTag] = 'Promise';
			return chain;
		});
		const mod = await import('../src/routes/api/fictional-cases/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({ url: mkUrl('/api/fictional-cases'), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns fictional cases list', async () => {
		const res = await GET({ url: mkUrl('/api/fictional-cases'), locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(Array.isArray(data.cases)).toBe(true);
		expect(data.total).toBeDefined();
		expect(data.limit).toBeDefined();
		expect(data.offset).toBeDefined();
		expect(Array.isArray(data.categoryStats)).toBe(true);
	});

	it('accepts filter parameters', async () => {
		const res = await GET({
			url: mkUrl('/api/fictional-cases', { category: 'fraud', q: 'embezzlement', limit: '5' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(200);
	});

	it('returns 400 for invalid limit', async () => {
		const res = await GET({
			url: mkUrl('/api/fictional-cases', { limit: '999' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});
});

// ════════════════════════════════════════════════════════════════
// FICTIONAL CASES [ID]: /api/fictional-cases/[id]
// ════════════════════════════════════════════════════════════════
describe('/api/fictional-cases/[id] (GET/PATCH/DELETE)', () => {
	let GET: Function, PATCH: Function, DELETE: Function;

	beforeEach(async () => {
		const { db } = await import('$lib/server/db/client');
		(db.select as any).mockImplementation(() => {
			const chain: any = {};
			chain.from = vi.fn(() => chain);
			chain.where = vi.fn(() => chain);
			chain.orderBy = vi.fn(() => chain);
			chain.limit = vi.fn(() => chain);
			chain.then = (resolve: Function) => resolve([{ id: VALID_UUID, charge: 'Fraud', narrative: 'Test case' }]);
			chain[Symbol.toStringTag] = 'Promise';
			return chain;
		});
		const mod = await import('../src/routes/api/fictional-cases/[id]/+server');
		GET = mod.GET;
		PATCH = mod.PATCH;
		DELETE = mod.DELETE;
	});

	// GET
	it('GET returns 401 when unauthenticated', async () => {
		const res = await GET({ params: { id: VALID_UUID }, locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('GET returns 400 for invalid UUID', async () => {
		const res = await GET({ params: { id: 'not-a-uuid' }, locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('GET returns fictional case with related data', async () => {
		const res = await GET({ params: { id: VALID_UUID }, locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.id).toBe(VALID_UUID);
	});

	it('GET returns 404 when not found', async () => {
		const { db } = await import('$lib/server/db/client');
		(db.select as any).mockImplementation(() => {
			const chain: any = {};
			chain.from = vi.fn(() => chain);
			chain.where = vi.fn(() => chain);
			chain.orderBy = vi.fn(() => chain);
			chain.limit = vi.fn(() => chain);
			chain.then = (resolve: Function) => resolve([]);
			chain[Symbol.toStringTag] = 'Promise';
			return chain;
		});

		const res = await GET({ params: { id: VALID_UUID }, locals: authedLocals });
		expect(res.status).toBe(404);
	});

	// PATCH
	it('PATCH returns 401 when unauthenticated', async () => {
		const res = await PATCH({
			params: { id: VALID_UUID },
			request: mkRequest({ narrative: 'Updated narrative' }),
			locals: anonLocals,
		});
		expect(res.status).toBe(401);
	});

	it('PATCH returns 400 for invalid UUID', async () => {
		const res = await PATCH({
			params: { id: 'bad' },
			request: mkRequest({ narrative: 'Updated' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('PATCH updates case successfully', async () => {
		mockReturning.mockResolvedValueOnce([{ id: VALID_UUID, narrative: 'Updated narrative' }]);

		const res = await PATCH({
			params: { id: VALID_UUID },
			request: mkRequest({ narrative: 'Updated narrative' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.narrative).toBe('Updated narrative');
	});

	it('PATCH returns 400 for no update fields', async () => {
		const res = await PATCH({
			params: { id: VALID_UUID },
			request: mkRequest({}),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('PATCH returns 404 when case not found', async () => {
		mockReturning.mockResolvedValueOnce([]);

		const res = await PATCH({
			params: { id: VALID_UUID },
			request: mkRequest({ narrative: 'test' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(404);
	});

	// DELETE
	it('DELETE returns 401 when unauthenticated', async () => {
		const res = await DELETE({ params: { id: VALID_UUID }, locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('DELETE returns 400 for invalid UUID', async () => {
		const res = await DELETE({ params: { id: 'bad' }, locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('DELETE removes case successfully', async () => {
		const res = await DELETE({ params: { id: VALID_UUID }, locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
	});

	it('DELETE returns 404 when case not found', async () => {
		mockDelete.mockImplementationOnce(() => ({
			where: vi.fn(() => ({
				returning: vi.fn(async () => []),
			})),
		}));

		const res = await DELETE({ params: { id: VALID_UUID }, locals: authedLocals });
		expect(res.status).toBe(404);
	});
});

// ════════════════════════════════════════════════════════════════
// ENGAGEMENT HEARTBEAT: /api/engagement/heartbeat
// ════════════════════════════════════════════════════════════════
describe('/api/engagement/heartbeat (GET/POST)', () => {
	let GET: Function, POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/engagement/heartbeat/+server');
		GET = mod.GET;
		POST = mod.POST;
	});

	// POST
	it('POST returns 401 when unauthenticated', async () => {
		// This route uses throw error(401) — SvelteKit HttpError
		await expect(POST({ locals: anonLocals })).rejects.toThrow();
	});

	it('POST records heartbeat', async () => {
		const res = await POST({ locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
		expect(mockRecordHeartbeat).toHaveBeenCalledWith('user-1');
	});

	// GET
	it('GET returns 401 when unauthenticated', async () => {
		await expect(GET({ locals: anonLocals })).rejects.toThrow();
	});

	it('GET returns idle duration', async () => {
		const res = await GET({ locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.userId).toBe('user-1');
		expect(data.idleMs).toBe(60000);
		expect(data.idleMinutes).toBe(1);
		expect(data.isIdle).toBe(false);
	});

	it('GET reports idle when over threshold', async () => {
		mockGetIdleDuration.mockResolvedValueOnce(60 * 60 * 1000); // 1 hour

		const res = await GET({ locals: authedLocals });
		const data = await res.json();
		expect(data.isIdle).toBe(true);
		expect(data.idleMinutes).toBe(60);
	});
});

// ════════════════════════════════════════════════════════════════
// ENGAGEMENT SCAN: /api/engagement/scan
// ════════════════════════════════════════════════════════════════
describe('/api/engagement/scan (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/engagement/scan/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		await expect(POST({ locals: anonLocals })).rejects.toThrow();
	});

	it('returns scan results', async () => {
		const res = await POST({ locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.scanned).toBe(10);
		expect(data.notified).toBe(2);
		expect(data.message).toContain('10');
	});
});

// ════════════════════════════════════════════════════════════════
// KNOWLEDGE STATS: /api/knowledge/stats
// ════════════════════════════════════════════════════════════════
describe('/api/knowledge/stats (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/knowledge/stats/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({ locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns knowledge statistics', async () => {
		const res = await GET({ locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.stats.totalDocuments).toBe(150);
		expect(data.stats.indexedVectors).toBe(3000);
		expect(data.stats.collections.qdrant.points).toBe(2500);
		expect(data.stats.collections.postgres.rows).toBe(150);
		expect(data.stats.collections.minio.objects).toBe(45);
	});

	it('returns 503 for Qdrant errors', async () => {
		mockGetStats.mockRejectedValueOnce(new Error('Qdrant connection refused'));

		const res = await GET({ locals: authedLocals });
		expect(res.status).toBe(503);
	});

	it('returns 500 for generic errors', async () => {
		mockGetStats.mockRejectedValueOnce(new Error('Something went wrong'));

		const res = await GET({ locals: authedLocals });
		expect(res.status).toBe(500);
	});
});
