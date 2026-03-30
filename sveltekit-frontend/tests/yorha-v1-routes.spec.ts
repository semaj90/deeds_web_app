/**
 * Test file 15: YoRHa + V1 API Routes
 *
 * YoRHa routes (4):
 *   - /api/yorha/search (POST)
 *   - /api/yorha/cluster-health (GET)
 *   - /api/yorha/cases (GET, POST)
 *   - /api/yorha/analytics (GET)
 *
 * V1 routes (10):
 *   - /api/v1/redis/cache (POST)
 *   - /api/v1/evidence/canvas (POST)
 *   - /api/v1/evidence/analyze (POST)
 *   - /api/v1/evidence/advanced-analysis (POST)
 *   - /api/v1/chat/sessions (POST)
 *   - /api/v1/chat/search (POST)
 *   - /api/v1/chat/messages (POST)
 *   - /api/v1/ai/summary-cache (POST)
 *   - /api/v1/ai/cache-result (POST)
 *   - /api/v1/ai/generate-layout (POST)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── UUIDs ──
const TEST_USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const TEST_CASE_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

// ── ollamaFetch mock ──
const mockOllamaFetch = vi.fn(async () =>
	new Response(JSON.stringify({
		message: { content: 'Mock LLM response' },
		response: 'Mock LLM response',
		model: 'gemma3-legal:latest',
	}), { status: 200, headers: { 'Content-Type': 'application/json' } })
);
vi.mock('$lib/server/ollama.js', () => ({
	ollamaFetch: (...args: any[]) => mockOllamaFetch(...args),
}));

// ── ENV mock ──
vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		OLLAMA_BASE_URL: 'http://localhost:11434',
		QDRANT_URL: 'http://localhost:6333',
	},
}));
vi.mock('$lib/config/env.server.js', () => ({
	getOllamaUrl: () => 'http://localhost:11434',
	getQdrantUrl: () => 'http://localhost:6333',
	getRabbitMQUrl: () => 'amqp://localhost',
}));

// ── DB mock ──
const mockDbRows: any[] = [];
const mockInsertReturning: any[] = [];
const mockChain: any = {
	select: vi.fn(() => mockChain),
	from: vi.fn(() => mockChain),
	where: vi.fn(() => mockChain),
	orderBy: vi.fn(() => mockChain),
	limit: vi.fn(() => mockChain),
	offset: vi.fn(() => mockChain),
	leftJoin: vi.fn(() => mockChain),
	$withCache: vi.fn(() => mockChain),
	then: vi.fn((resolve: any, reject?: any) => Promise.resolve(mockDbRows).then(resolve, reject)),
	catch: vi.fn((fn: any) => Promise.resolve(mockDbRows).catch(fn)),
	[Symbol.iterator]: function* () { yield* mockDbRows; },
};
vi.mock('$lib/server/db/client', () => ({
	db: {
		select: vi.fn(() => mockChain),
		execute: vi.fn(async () => ({ rows: [{ c: 5, total: 10, active: 3, closed: 2, recent: 1 }] })),
		insert: vi.fn(() => ({
			values: vi.fn(() => {
				const p = Promise.resolve(undefined);
				(p as any).returning = vi.fn(async () => mockInsertReturning);
				return p;
			}),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => {
				const p2 = Promise.resolve(undefined);
				(p2 as any).where = vi.fn(() => {
					const p3 = Promise.resolve(undefined);
					(p3 as any).returning = vi.fn(async () => []);
					return p3;
				});
				return p2;
			}),
		})),
	},
	pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

// ── drizzle-orm mock ──
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...a: any[]) => a),
	desc: vi.fn((c: any) => c),
	and: vi.fn((...a: any[]) => a),
	or: vi.fn((...a: any[]) => a),
	gte: vi.fn((...a: any[]) => a),
	lte: vi.fn((...a: any[]) => a),
	ilike: vi.fn((...a: any[]) => a),
	inArray: vi.fn((...a: any[]) => a),
	count: vi.fn(() => 'count'),
	sql: Object.assign(vi.fn((s: any) => s), { raw: vi.fn((s: any) => s) }),
}));

// ── Schema mocks ──
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	evidence: { id: 'id', title: 'title', description: 'description', caseId: 'case_id', fileType: 'file_type', createdAt: 'created_at', updatedAt: 'updated_at' },
	cases: { id: 'id', title: 'title', description: 'description', status: 'status', priority: 'priority', createdAt: 'created_at', updatedAt: 'updated_at' },
	personsOfInterest: { id: 'id', name: 'name', description: 'description', threatLevel: 'threat_level', status: 'status' },
	documentTopics: { id: 'id' },
}));
vi.mock('$lib/server/db/schema.js', () => ({
	cases: { id: 'id', title: 'title', description: 'description', status: 'status', priority: 'priority', createdAt: 'created_at', updatedAt: 'updated_at' },
	evidence: { id: 'id', title: 'title', description: 'description' },
	chatMetadata: { chatId: 'chat_id', userId: 'user_id', caseId: 'case_id', title: 'title', createdAt: 'created_at', updatedAt: 'updated_at', lastMessageAt: 'last_message_at' },
	chatMessages: { id: 'id', chatId: 'chat_id', userId: 'user_id', role: 'role', content: 'content', createdAt: 'created_at', metadata: 'metadata' },
}));
vi.mock('$lib/server/db/schema', () => ({
	cases: { id: 'id', title: 'title', status: 'status', priority: 'priority' },
	evidence: { id: 'id', title: 'title', description: 'description' },
	personsOfInterest: { id: 'id', name: 'name' },
	chatMetadata: { chatId: 'chat_id', userId: 'user_id', caseId: 'case_id', title: 'title', createdAt: 'created_at', updatedAt: 'updated_at', lastMessageAt: 'last_message_at' },
	chatMessages: { id: 'id', chatId: 'chat_id', userId: 'user_id', role: 'role', content: 'content', createdAt: 'created_at', metadata: 'metadata' },
}));

// ── Redis mock ──
const mockRedis = {
	get: vi.fn(async () => null),
	set: vi.fn(),
	del: vi.fn(),
	keys: vi.fn(async () => []),
	ping: vi.fn(async () => 'PONG'),
	pipeline: vi.fn(() => ({ exec: vi.fn(async () => []) })),
	status: 'ready',
};
vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => mockRedis,
	redis: mockRedis,
	redisPool: { getConnection: () => mockRedis },
}));

// ── Qdrant + embedding mocks ──
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	qdrant: {
		hybridSearch: vi.fn(async () => ({
			results: [{ id: 'v1', score: 0.8, payload: { title: 'Hit', content: 'Match' } }],
		})),
	},
}));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	generateSingleEmbedding: vi.fn(async () => new Array(768).fill(0.01)),
	generateEmbeddings: vi.fn(async () => ({ vectors: [new Array(768).fill(0.01)] })),
}));
vi.mock('@qdrant/js-client-rest', () => ({
	QdrantClient: vi.fn().mockImplementation(() => ({
		upsert: vi.fn(async () => ({})),
		search: vi.fn(async () => []),
	})),
}));

// ── Timeouts mock ──
vi.mock('$lib/server/timeouts.js', () => ({
	TIMEOUTS: { USER_FACING: 30000, BACKGROUND: 60000 },
}));

// ── Cache mock ──
vi.mock('$lib/server/cache.js', () => ({
	setCache: vi.fn(),
}));

// ── Auth helpers mock ──
vi.mock('$lib/server/auth-helpers.js', () => ({
	requireAuth: vi.fn(async (event: any) => ({
		userId: event.locals.user?.id ?? TEST_USER_ID,
	})),
}));

// ── Validation mock ──
vi.mock('$lib/server/validation.js', () => ({
	isUuid: vi.fn((s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)),
}));

// ── Helpers ──
function makeEvent(
	method: string,
	url: string,
	opts: { body?: any; locals?: any; params?: any; fetch?: any } = {}
) {
	const urlObj = new URL(url, 'http://localhost');
	const headers = new Headers({ 'content-type': 'application/json' });
	const req: any = new Request(urlObj, {
		method,
		headers,
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
	});
	return {
		request: req,
		url: urlObj,
		params: opts.params ?? {},
		locals: opts.locals ?? { user: { id: TEST_USER_ID, role: 'admin' } },
		cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
		platform: {},
		fetch: opts.fetch ?? vi.fn(async () => new Response(JSON.stringify({}), {
			status: 200, headers: { 'Content-Type': 'application/json' },
		})),
	};
}

function jsonBody(r: Response) { return r.json(); }

beforeEach(() => {
	vi.clearAllMocks();
	mockDbRows.length = 0;
	mockInsertReturning.length = 0;
	mockRedis.get.mockResolvedValue(null);
});

// ═════════════════════════════════════════════════════════
//  YORHA ROUTES
// ═════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// /api/yorha/search (POST)
// ─────────────────────────────────────────────────────────
describe('/api/yorha/search (POST)', () => {
	it('returns search results', async () => {
		mockDbRows.push(
			{ id: 'e1', title: 'Contract Evidence', description: 'A contract document' },
		);
		const { POST } = await import('../src/routes/api/yorha/search/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/yorha/search', {
			body: { query: 'contract', limit: 10, sources: ['evidence'], vectorSearch: false },
		}) as any);
		const data = await jsonBody(res);
		expect(data.query).toBe('contract');
		expect(data.results).toBeDefined();
		expect(data.totalFound).toBeGreaterThanOrEqual(0);
	});

	it('returns 400 for short query', async () => {
		const { POST } = await import('../src/routes/api/yorha/search/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/yorha/search', {
			body: { query: 'a' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/yorha/search/+server.js');
		try {
			await POST(makeEvent('POST', 'http://localhost/api/yorha/search', {
				body: { query: 'contract' },
				locals: { user: null },
			}) as any);
			expect.unreachable('should throw');
		} catch (e: any) {
			expect(e.status).toBe(401);
		}
	});
});

// ─────────────────────────────────────────────────────────
// /api/yorha/cluster-health (GET)
// ─────────────────────────────────────────────────────────
describe('/api/yorha/cluster-health (GET)', () => {
	it('returns health metrics', async () => {
		const { GET } = await import('../src/routes/api/yorha/cluster-health/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/yorha/cluster-health') as any);
		const data = await jsonBody(res);
		expect(data.timestamp).toBeTruthy();
		expect(data.metrics).toBeDefined();
		expect(data.thresholds).toBeDefined();
		expect(data.thresholds.cpu_warning).toBe(70);
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/yorha/cluster-health/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/yorha/cluster-health', {
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/yorha/cases (GET + POST)
// ─────────────────────────────────────────────────────────
describe('/api/yorha/cases', () => {
	it('GET returns case list', async () => {
		mockDbRows.push(
			{ id: TEST_CASE_ID, title: 'Test Case', status: 'open', priority: 'high', createdAt: new Date(), updatedAt: new Date() },
		);
		const { GET } = await import('../src/routes/api/yorha/cases/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/yorha/cases') as any);
		const data = await jsonBody(res);
		expect(data.data).toBeDefined();
	});

	it('GET returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/yorha/cases/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/yorha/cases', {
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});

	it('POST creates a case', async () => {
		mockInsertReturning.push({ id: 'new-1', title: 'New Case', status: 'open', priority: 'medium' });
		const { POST } = await import('../src/routes/api/yorha/cases/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/yorha/cases', {
			body: { title: 'New Case', description: 'Test description', status: 'open', priority: 'medium' },
		}) as any);
		expect(res.status).toBe(201);
		const data = await jsonBody(res);
		expect(data.data).toBeDefined();
	});

	it('POST returns 400 for missing title', async () => {
		const { POST } = await import('../src/routes/api/yorha/cases/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/yorha/cases', {
			body: { description: 'no title' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('POST returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/yorha/cases/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/yorha/cases', {
			body: { title: 'Test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/yorha/analytics (GET)
// ─────────────────────────────────────────────────────────
describe('/api/yorha/analytics (GET)', () => {
	it('returns analytics data', async () => {
		const { GET } = await import('../src/routes/api/yorha/analytics/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/yorha/analytics') as any);
		const data = await jsonBody(res);
		expect(data.period).toBe('30d');
		expect(data.cases).toBeDefined();
		expect(data.evidence).toBeDefined();
		expect(data.system).toBeDefined();
		expect(data.generatedAt).toBeTruthy();
	});

	it('accepts period param', async () => {
		const { GET } = await import('../src/routes/api/yorha/analytics/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/yorha/analytics?period=7d') as any);
		const data = await jsonBody(res);
		expect(data.period).toBe('7d');
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/yorha/analytics/+server.js');
		try {
			await GET(makeEvent('GET', 'http://localhost/api/yorha/analytics', {
				locals: { user: null },
			}) as any);
			expect.unreachable('should throw');
		} catch (e: any) {
			expect(e.status).toBe(401);
		}
	});
});

// ═════════════════════════════════════════════════════════
//  V1 ROUTES
// ═════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// /api/v1/redis/cache (POST)
// ─────────────────────────────────────────────────────────
describe('/api/v1/redis/cache (POST)', () => {
	it('sets a cache key', async () => {
		const { POST } = await import('../src/routes/api/v1/redis/cache/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/redis/cache', {
			body: { key: 'test-key', value: { foo: 'bar' }, ttl: 3600 },
		}) as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
	});

	it('returns 400 for missing key', async () => {
		const { POST } = await import('../src/routes/api/v1/redis/cache/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/redis/cache', {
			body: { value: 'test' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/v1/redis/cache/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/redis/cache', {
			body: { key: 'k', value: 'v' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/v1/evidence/canvas (POST)
// ─────────────────────────────────────────────────────────
describe('/api/v1/evidence/canvas (POST)', () => {
	it('saves canvas state', async () => {
		const { POST } = await import('../src/routes/api/v1/evidence/canvas/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/evidence/canvas', {
			body: { caseId: TEST_CASE_ID, canvasData: { zoom: 1 }, evidenceNodes: [], connections: [] },
		}) as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
	});

	it('returns 400 for invalid UUID', async () => {
		const { POST } = await import('../src/routes/api/v1/evidence/canvas/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/evidence/canvas', {
			body: { caseId: 'not-a-uuid' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/v1/evidence/canvas/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/evidence/canvas', {
			body: { caseId: TEST_CASE_ID },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/v1/evidence/analyze (POST)
// ─────────────────────────────────────────────────────────
describe('/api/v1/evidence/analyze (POST)', () => {
	it('returns analysis for content', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response(JSON.stringify({
			message: { content: 'Entities: John Doe, Corp Inc. Relevance: high.' },
		}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		const { POST } = await import('../src/routes/api/v1/evidence/analyze/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/evidence/analyze', {
			body: { content: 'The defendant John Doe violated the contract with Corp Inc.' },
		}) as any);
		const data = await jsonBody(res);
		expect(data.analysis).toBeTruthy();
		expect(data.model).toBe('gemma3-legal:latest');
	});

	it('returns 400 for no content or evidenceId', async () => {
		const { POST } = await import('../src/routes/api/v1/evidence/analyze/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/evidence/analyze', {
			body: {},
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 502 when Ollama fails', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { POST } = await import('../src/routes/api/v1/evidence/analyze/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/evidence/analyze', {
			body: { content: 'test' },
		}) as any);
		expect(res.status).toBe(502);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/v1/evidence/analyze/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/evidence/analyze', {
			body: { content: 'test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/v1/evidence/advanced-analysis (POST)
// ─────────────────────────────────────────────────────────
describe('/api/v1/evidence/advanced-analysis (POST)', () => {
	it('returns multi-type analysis', async () => {
		mockDbRows.push({ id: 'ev-1', title: 'Contract', description: 'A legal contract about...' });
		mockOllamaFetch.mockResolvedValueOnce(new Response(JSON.stringify({
			response: '{"summary":"Contract between two parties."}',
		}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		const { POST } = await import('../src/routes/api/v1/evidence/advanced-analysis/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/evidence/advanced-analysis', {
			body: { evidenceId: 'ev-1', analysisTypes: ['summary'] },
		}) as any);
		const data = await jsonBody(res);
		expect(data.results).toBeDefined();
		expect(data.results.summary).toBeDefined();
	});

	it('returns 404 for missing evidence', async () => {
		// mockDbRows is empty
		const { POST } = await import('../src/routes/api/v1/evidence/advanced-analysis/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/evidence/advanced-analysis', {
			body: { evidenceId: 'nonexistent', analysisTypes: ['summary'] },
		}) as any);
		expect(res.status).toBe(404);
	});

	it('returns 400 for empty analysisTypes', async () => {
		const { POST } = await import('../src/routes/api/v1/evidence/advanced-analysis/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/evidence/advanced-analysis', {
			body: { evidenceId: 'ev-1', analysisTypes: [] },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/v1/evidence/advanced-analysis/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/evidence/advanced-analysis', {
			body: { evidenceId: 'ev-1', analysisTypes: ['summary'] },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/v1/chat/sessions (POST)
// ─────────────────────────────────────────────────────────
describe('/api/v1/chat/sessions (POST)', () => {
	it('creates a chat session', async () => {
		const { POST } = await import('../src/routes/api/v1/chat/sessions/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/chat/sessions', {
			body: { userId: TEST_USER_ID, title: 'Legal Research Chat' },
		}) as any);
		expect(res.status).toBe(201);
		const data = await jsonBody(res);
		expect(data.id).toMatch(/^chat_/);
		expect(data.title).toBe('Legal Research Chat');
	});

	it('returns 400 for missing userId', async () => {
		const { POST } = await import('../src/routes/api/v1/chat/sessions/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/chat/sessions', {
			body: { title: 'no user' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/v1/chat/sessions/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/chat/sessions', {
			body: { userId: TEST_USER_ID },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/v1/chat/search (POST)
// ─────────────────────────────────────────────────────────
describe('/api/v1/chat/search (POST)', () => {
	it('returns search results', async () => {
		mockDbRows.push({ id: 'msg-1', chatId: 'ch-1', role: 'user', content: 'contract law', createdAt: new Date() });
		const { POST } = await import('../src/routes/api/v1/chat/search/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/chat/search', {
			body: { query: 'contract' },
		}) as any);
		const data = await jsonBody(res);
		expect(Array.isArray(data)).toBe(true);
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/v1/chat/search/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/chat/search', {
			body: { query: '' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/v1/chat/search/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/chat/search', {
			body: { query: 'test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/v1/chat/messages (POST)
// ─────────────────────────────────────────────────────────
describe('/api/v1/chat/messages (POST)', () => {
	it('saves a chat message', async () => {
		const { POST } = await import('../src/routes/api/v1/chat/messages/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/chat/messages', {
			body: { sessionId: 'chat_123', role: 'user', content: 'What is contract law?' },
		}) as any);
		expect(res.status).toBe(201);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.messageId).toMatch(/^msg_/);
	});

	it('returns 400 for invalid role', async () => {
		const { POST } = await import('../src/routes/api/v1/chat/messages/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/chat/messages', {
			body: { sessionId: 'ch-1', role: 'invalid', content: 'test' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 for missing content', async () => {
		const { POST } = await import('../src/routes/api/v1/chat/messages/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/chat/messages', {
			body: { sessionId: 'ch-1', role: 'user' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/v1/chat/messages/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/chat/messages', {
			body: { sessionId: 'ch-1', role: 'user', content: 'test' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/v1/ai/summary-cache (POST)
// ─────────────────────────────────────────────────────────
describe('/api/v1/ai/summary-cache (POST)', () => {
	it('returns empty when no cache', async () => {
		const { POST } = await import('../src/routes/api/v1/ai/summary-cache/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/ai/summary-cache', {
			body: { textHash: 'abc123hash' },
		}) as any);
		const data = await jsonBody(res);
		expect(data).toEqual({});
	});

	it('returns cached summary when available', async () => {
		mockRedis.get.mockResolvedValueOnce(JSON.stringify({ summary: 'Cached legal summary' }));
		const { POST } = await import('../src/routes/api/v1/ai/summary-cache/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/ai/summary-cache', {
			body: { textHash: 'cached-hash' },
		}) as any);
		const data = await jsonBody(res);
		expect(data.summary).toBe('Cached legal summary');
	});

	it('returns 400 for missing textHash', async () => {
		const { POST } = await import('../src/routes/api/v1/ai/summary-cache/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/ai/summary-cache', {
			body: {},
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/v1/ai/summary-cache/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/ai/summary-cache', {
			body: { textHash: 'abc' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/v1/ai/cache-result (POST)
// ─────────────────────────────────────────────────────────
describe('/api/v1/ai/cache-result (POST)', () => {
	it('caches a result', async () => {
		const { POST } = await import('../src/routes/api/v1/ai/cache-result/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/ai/cache-result', {
			body: { textHash: 'hash123', summary: 'A brief legal summary.' },
		}) as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
	});

	it('returns 400 for missing fields', async () => {
		const { POST } = await import('../src/routes/api/v1/ai/cache-result/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/ai/cache-result', {
			body: { textHash: 'h' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/v1/ai/cache-result/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/ai/cache-result', {
			body: { textHash: 'h', summary: 's' },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/v1/ai/generate-layout (POST)
// ─────────────────────────────────────────────────────────
describe('/api/v1/ai/generate-layout (POST)', () => {
	it('generates grid layout', async () => {
		const { POST } = await import('../src/routes/api/v1/ai/generate-layout/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/ai/generate-layout', {
			body: {
				caseId: TEST_CASE_ID,
				layoutType: 'grid',
				evidenceData: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }],
			},
		}) as any);
		const data = await jsonBody(res);
		expect(data.positions).toBeDefined();
		expect(data.positions['n1']).toBeDefined();
		expect(data.positions['n1'].x).toBeGreaterThan(0);
	});

	it('generates radial layout', async () => {
		const { POST } = await import('../src/routes/api/v1/ai/generate-layout/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/ai/generate-layout', {
			body: { caseId: TEST_CASE_ID, layoutType: 'radial', evidenceData: [{ id: 'a' }] },
		}) as any);
		const data = await jsonBody(res);
		expect(data.positions).toBeDefined();
	});

	it('returns 400 for invalid caseId', async () => {
		const { POST } = await import('../src/routes/api/v1/ai/generate-layout/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/ai/generate-layout', {
			body: { caseId: 'not-uuid' },
		}) as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/v1/ai/generate-layout/+server.js');
		const res = await POST(makeEvent('POST', 'http://localhost/api/v1/ai/generate-layout', {
			body: { caseId: TEST_CASE_ID },
			locals: { user: null },
		}) as any);
		expect(res.status).toBe(401);
	});
});
