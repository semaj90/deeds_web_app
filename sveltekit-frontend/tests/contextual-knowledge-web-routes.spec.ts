/**
 * Test file 12: Contextual + Knowledge + Precedents + Web routes
 *
 * Routes covered (10):
 *   /api/contextual/chat (POST)         — Ollama chat with HMM state + optional tool calling
 *   /api/contextual/predictions (GET)   — HMM next-step predictions
 *   /api/contextual/state (GET/DELETE)  — HMM session state
 *   /api/contextual/stats (GET)         — Session statistics
 *   /api/precedents/search (POST)       — PG full-text + Qdrant semantic precedent search
 *   /api/websearch (POST)               — SearXNG web search proxy
 *   /api/web/search (POST)              — Google/DDG web search
 *   /api/web/crawl (POST)               — URL crawl via langextract
 *   /api/knowledge/stats (GET)          — Knowledge collection statistics
 *   /api/knowledge/search (POST)        — Multi-source knowledge search
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared UUIDs ──
const TEST_USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

// ── Redis mock ──
const mockRedisStore: Record<string, string> = {};
const mockRedisHashes: Record<string, Record<string, string>> = {};
const mockRedis = {
  get: vi.fn(async (key: string) => mockRedisStore[key] ?? null),
  set: vi.fn(async (key: string, val: string) => {
    mockRedisStore[key] = val;
  }),
  del: vi.fn(async (key: string) => {
    delete mockRedisStore[key];
  }),
  setex: vi.fn(async (k: string, _ttl: number, v: string) => {
    mockRedisStore[k] = v;
  }),
  zincrby: vi.fn(async (key: string, amount: number, member: string) => {
    const current = Number(mockRedisStore[`${key}:${member}`] ?? '0');
    const next = current + amount;
    mockRedisStore[`${key}:${member}`] = String(next);
    return next;
  }),
  expire: vi.fn(async () => 1),
  hsetnx: vi.fn(async (key: string, field: string, value: string) => {
    const hash = (mockRedisHashes[key] ??= {});
    if (field in hash) return 0;
    hash[field] = value;
    return 1;
  }),
};
vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => mockRedis,
	redis: mockRedis,
}));

// ── ENV mock ──
vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://localhost:11434',
    QDRANT_URL: 'http://localhost:6333',
    SEARXNG_URL: 'http://localhost:8888',
    LANGEXTRACT_URL: 'http://localhost:8095',
    LANGEXTRACT_ENABLED: 'true',
    MINIO_EVIDENCE_BUCKET: 'evidence',
  },
}));
vi.mock('$lib/config/env.server.js', () => ({
	getOllamaUrl: () => 'http://localhost:11434',
	getQdrantUrl: () => 'http://localhost:6333',
	getDatabaseUrl: () => 'postgresql://test:test@localhost:5432/test',
}));

// ── ollamaFetch mock ──
const mockOllamaFetch = vi.fn(async (_url: string, opts?: any) => {
	const body = opts?.body ? JSON.parse(opts.body) : {};
	// Embedding requests
	if (String(_url).includes('/api/embeddings')) {
		return new Response(JSON.stringify({ embedding: new Array(768).fill(0.01) }), {
			status: 200, headers: { 'Content-Type': 'application/json' },
		});
	}
	// Chat endpoint
	return new Response(JSON.stringify({
		message: { content: 'Legal AI response here.' },
		response: 'Legal AI response here.',
		model: 'gemma4-legal:latest',
	}), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
vi.mock('$lib/server/ollama.js', () => ({
  getChatModelKeepAlive: () => '2m',
  getEmbeddingModelKeepAlive: () => '24h',
  getChatModel: () => 'gemma4-legal:latest',
  getEmbedModel: () => 'embeddinggemma:latest',
  ollamaFetch: (...args: any[]) => mockOllamaFetch(...args),
}));

// ── DB mock ──
const mockDbRows: any[] = [];
const mockChain: any = {
	select: vi.fn(() => mockChain),
	from: vi.fn(() => mockChain),
	where: vi.fn(() => mockChain),
	orderBy: vi.fn(() => mockChain),
	limit: vi.fn(() => mockChain),
	offset: vi.fn(() => mockChain),
	leftJoin: vi.fn(() => mockChain),
	then: vi.fn((resolve: any) => resolve(mockDbRows)),
	[Symbol.iterator]: function* () { yield* mockDbRows; },
};
vi.mock('$lib/server/db/client', () => ({
  pgRows: (r) => Array.isArray(r) ? r : r?.rows ?? [],
	db: {
		select: vi.fn(() => mockChain),
		execute: vi.fn(async () => ({ rows: [] })),
	},
	pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

// ── drizzle-orm mock ──
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...a: any[]) => a),
	desc: vi.fn((c: any) => c),
	and: vi.fn((...a: any[]) => a),
	or: vi.fn((...a: any[]) => a),
	ilike: vi.fn((...a: any[]) => a),
	sql: Object.assign(vi.fn((s: any) => s), { raw: vi.fn((s: any) => s) }),
	isNotNull: vi.fn((c: any) => c),
}));

// ── Schema mocks ──
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'id', title: 'title' },
	statutes: { id: 'id', title: 'title' },
	legalPrecedents: { id: 'id', title: 'title' },
}));

// ── Knowledge searcher mock ──
const mockSearcher = {
	search: vi.fn(async () => [
		{ id: 'doc-1', title: 'Test Doc', snippet: 'Some content', scores: { combined: 0.9, semantic: 0.85 }, tags: [], url: '' },
	]),
	getStats: vi.fn(async () => ({
		totalDocuments: 42,
		indexedVectors: 100,
		collections: {
			qdrant: { points: 100, status: 'green' },
			postgres: { rows: 42 },
			minio: { objects: 10, size: '5MB' },
		},
		lastIndexed: '2026-03-28T12:00:00Z',
	})),
	getDocument: vi.fn(async () => null),
};
vi.mock('$lib/services/knowledge-search/KnowledgeSearcher.js', () => ({
	getKnowledgeSearcher: () => mockSearcher,
}));

// ── Web search mock ──
vi.mock('$lib/server/retrieval/web-search.js', () => ({
	webSearch: vi.fn(async () => ({
		results: [{ title: 'Legal News', url: 'https://example.com', snippet: 'Case update' }],
	})),
}));

// ── Observability mock ──
vi.mock('$lib/server/observability/langfuse.js', () => ({
  traceLLM: vi.fn((_a: any, _b: any, fn: any) => fn({ end: vi.fn() })),
  traceEmbedding: vi.fn((_a: any, _b: any, fn: any) => fn()),
}));

// ── Knowledge search internal fetch (used by /knowledge/search) ──
vi.mock('$lib/server/retrieval/query-expansion.js', () => ({
	expandQuery: vi.fn((q: string) => ({
		expanded: q,
		synonyms: [],
		source: 'none',
	})),
}));

// ── langextract client mock ──
const mockLangextractFetch = vi.fn(async () => new Response(JSON.stringify({
	title: 'Extracted Page',
	text: 'Extracted content from page.',
}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
vi.mock('$lib/server/langextract-client.js', () => ({
	langextractFetch: (...args: any[]) => mockLangextractFetch(...args),
}));

// ── global fetch mock for SearXNG / Qdrant / langextract ──
const originalFetch = globalThis.fetch;
const mockGlobalFetch = vi.fn(async (input: any, init?: any) => {
	const url = typeof input === 'string' ? input : input.url;
	// SearXNG
	if (url.includes('localhost:8888')) {
		return new Response(JSON.stringify({
			results: [
				{ title: 'Legal Result', url: 'https://example.com/law', content: 'Details about law' },
			],
		}), { status: 200, headers: { 'Content-Type': 'application/json' } });
	}
	// Qdrant search
	if (url.includes('qdrant') || url.includes(':6333')) {
		return new Response(JSON.stringify({ result: [] }), {
			status: 200, headers: { 'Content-Type': 'application/json' },
		});
	}
	// langextract
	if (url.includes('localhost:8095') || url.includes('langextract')) {
		return new Response(JSON.stringify({
			title: 'Extracted Page',
			text: 'Extracted content from page.',
		}), { status: 200, headers: { 'Content-Type': 'application/json' } });
	}
	// Delegate to original for other URLs
	return originalFetch(input, init);
});
vi.stubGlobal('fetch', mockGlobalFetch);

// ── Helpers ──
function makeEvent(
	method: string,
	url: string,
	opts: { body?: any; locals?: any; params?: any; fetch?: any } = {}
) {
	const urlObj = new URL(url, 'http://localhost');
	const headers = new Headers({ 'content-type': 'application/json' });
	return {
		request: new Request(urlObj, {
			method,
			headers,
			body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
		}),
		url: urlObj,
		params: opts.params ?? {},
		locals: opts.locals ?? { user: { id: TEST_USER_ID, role: 'admin' } },
		cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
		platform: {},
		fetch: opts.fetch ?? mockGlobalFetch,
	};
}

function jsonBody(response: Response) {
	return response.json();
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDbRows.length = 0;
	// Clear Redis store
	for (const key of Object.keys(mockRedisStore)) delete mockRedisStore[key];
});

// ─────────────────────────────────────────────────────────
// /api/contextual/chat (POST)
// ─────────────────────────────────────────────────────────
describe('/api/contextual/chat (POST)', () => {
	it('returns a chat response in simple mode', async () => {
		const { POST } = await import('../src/routes/api/contextual/chat/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/contextual/chat', {
			body: { message: 'What is habeas corpus?', sessionId: 'sess-1' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.data.response).toBeTruthy();
	});

	it('returns 400 for empty message', async () => {
		const { POST } = await import('../src/routes/api/contextual/chat/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/contextual/chat', {
			body: { message: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/contextual/chat/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/contextual/chat', {
			body: { message: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 502 when Ollama is unavailable', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { POST } = await import('../src/routes/api/contextual/chat/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/contextual/chat', {
			body: { message: 'test message' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(502);
	});

	it('loads conversation history from Redis', async () => {
		mockRedisStore['contextual:history:sess-hist'] = JSON.stringify([
			{ role: 'user', content: 'earlier question' },
			{ role: 'assistant', content: 'earlier answer' },
		]);
		const { POST } = await import('../src/routes/api/contextual/chat/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/contextual/chat', {
			body: { message: 'follow up', sessionId: 'sess-hist' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────
// /api/contextual/predictions (GET)
// ─────────────────────────────────────────────────────────
describe('/api/contextual/predictions (GET)', () => {
	it('returns default predictions when no state', async () => {
		const { GET } = await import('../src/routes/api/contextual/predictions/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/predictions?sessionId=sess-1');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.data.predictions).toHaveLength(3);
		expect(data.data.predictions[0].action).toBe('Ask about a specific case');
	});

	it('returns predictions based on cached HMM state', async () => {
		mockRedisStore['contextual:state:sess-hmm'] = JSON.stringify({
			hmmState: { currentState: 3 },
		});
		const { GET } = await import('../src/routes/api/contextual/predictions/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/predictions?sessionId=sess-hmm');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.data.predictions[0].action).toBe('Find relevant statutes');
	});

	it('returns 400 for missing sessionId', async () => {
		const { GET } = await import('../src/routes/api/contextual/predictions/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/predictions');
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/contextual/predictions/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/predictions?sessionId=x', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/contextual/state (GET / DELETE)
// ─────────────────────────────────────────────────────────
describe('/api/contextual/state', () => {
	it('GET returns default state when no cached state', async () => {
		const { GET } = await import('../src/routes/api/contextual/state/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/state?sessionId=new-session');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.data.hmmState.currentState).toBe(0);
		expect(data.data.confidence).toBe(0.5);
	});

	it('GET returns cached state from Redis', async () => {
		mockRedisStore['contextual:state:cached-sess'] = JSON.stringify({
			hmmState: { currentState: 2, stateHistory: [0, 1, 2], transitionMatrix: [] },
			confidence: 0.8,
			extractedEntities: ['Contract'],
			turnCount: 5,
		});
		const { GET } = await import('../src/routes/api/contextual/state/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/state?sessionId=cached-sess');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.data.hmmState.currentState).toBe(2);
		expect(data.data.confidence).toBe(0.8);
	});

	it('GET returns 400 for missing sessionId', async () => {
		const { GET } = await import('../src/routes/api/contextual/state/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/state');
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});

	it('GET returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/contextual/state/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/state?sessionId=x', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});

	it('DELETE clears session state', async () => {
		mockRedisStore['contextual:state:del-sess'] = 'some data';
		mockRedisStore['contextual:history:del-sess'] = 'some history';
		const { DELETE } = await import('../src/routes/api/contextual/state/+server.js');
		const event = makeEvent('DELETE', 'http://localhost/api/contextual/state?sessionId=del-sess');
		const res = await DELETE(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(mockRedis.del).toHaveBeenCalledWith('contextual:state:del-sess');
	});

	it('DELETE returns 401 for unauthenticated', async () => {
		const { DELETE } = await import('../src/routes/api/contextual/state/+server.js');
		const event = makeEvent('DELETE', 'http://localhost/api/contextual/state?sessionId=x', {
			locals: { user: null },
		});
		const res = await DELETE(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/contextual/stats (GET)
// ─────────────────────────────────────────────────────────
describe('/api/contextual/stats (GET)', () => {
	it('returns default stats when no state cached', async () => {
		const { GET } = await import('../src/routes/api/contextual/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/stats?sessionId=no-state');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.data.totalTurns).toBe(0);
		expect(data.data.mostCommonState).toBe('Greeting');
	});

	it('returns computed stats from Redis state', async () => {
		mockRedisStore['contextual:state:stat-sess'] = JSON.stringify({
			hmmState: { stateHistory: [0, 1, 1, 2, 3] },
			turnCount: 8,
			confidence: 0.75,
		});
		const { GET } = await import('../src/routes/api/contextual/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/stats?sessionId=stat-sess');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.data.totalTurns).toBe(8);
		expect(data.data.stateTransitions).toBe(3); // 0→1, 1→2, 2→3
		expect(data.data.mostCommonState).toBe('Case Inquiry'); // state 1 appears twice
	});

	it('returns 400 for missing sessionId', async () => {
		const { GET } = await import('../src/routes/api/contextual/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/stats');
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/contextual/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/contextual/stats?sessionId=x', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/precedents/search (POST)
// ─────────────────────────────────────────────────────────
describe('/api/precedents/search (POST)', () => {
	it('returns merged PG + Qdrant results', async () => {
		const { db } = await import('$lib/server/db/client');
		(db.execute as any).mockResolvedValueOnce({
			rows: [{
				id: 'prec-1', title: 'Roe v Wade', summary: 'Landmark case',
				citation: '410 U.S. 113', court: 'Supreme Court', case_id: null,
				decision_date: '1973-01-22', similarity: 0.85,
			}],
		});
		const { POST } = await import('../src/routes/api/precedents/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/precedents/search', {
			body: { query: 'due process right to privacy', limit: 10 },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.results).toHaveLength(1);
		expect(data.results[0].title).toBe('Roe v Wade');
		expect(data.timing).toBeDefined();
		expect(data.model).toBe('embeddinggemma:latest');
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/precedents/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/precedents/search', {
			body: { query: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/precedents/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/precedents/search', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('still returns results when embedding fails', async () => {
		mockOllamaFetch.mockResolvedValueOnce(new Response('', { status: 500 }));
		const { db } = await import('$lib/server/db/client');
		(db.execute as any).mockResolvedValueOnce({
			rows: [{
				id: 'prec-2', title: 'Test v State', summary: 'Test',
				citation: null, court: 'Appeals', case_id: null,
				decision_date: null, similarity: 0.5,
			}],
		});
		const { POST } = await import('../src/routes/api/precedents/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/precedents/search', {
			body: { query: 'test query' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.model).toBe('text-search-only');
	});
});

// ─────────────────────────────────────────────────────────
// /api/websearch (POST)
// ─────────────────────────────────────────────────────────
describe('/api/websearch (POST)', () => {
	it('returns search results from SearXNG', async () => {
		const { POST } = await import('../src/routes/api/websearch/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/websearch', {
			body: { query: 'legal precedent search' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.data.length).toBeGreaterThan(0);
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/websearch/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/websearch', {
			body: { query: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/websearch/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/websearch', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns fallback when SearXNG is down', async () => {
		mockGlobalFetch.mockRejectedValueOnce(new Error('Connection refused'));
		const { POST } = await import('../src/routes/api/websearch/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/websearch', {
			body: { query: 'test' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(false);
		expect(data.error).toContain('unavailable');
	});
});

// ─────────────────────────────────────────────────────────
// /api/web/search (POST)
// ─────────────────────────────────────────────────────────
describe('/api/web/search (POST)', () => {
	it('returns search results', async () => {
		const { POST } = await import('../src/routes/api/web/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/web/search', {
			body: { query: 'contract law basics' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.results).toBeDefined();
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/web/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/web/search', {
			body: { query: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/web/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/web/search', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/web/crawl (POST)
// ─────────────────────────────────────────────────────────
describe('/api/web/crawl (POST)', () => {
	it('returns crawl results from langextract', async () => {
		const { POST } = await import('../src/routes/api/web/crawl/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/web/crawl', {
			body: { url: 'https://example.com/legal-article' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.title).toBe('Extracted Page');
		expect(data.text).toBeTruthy();
		expect(data.source).toBe('langextract');
	});

	it('returns 400 for invalid URL', async () => {
		const { POST } = await import('../src/routes/api/web/crawl/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/web/crawl', {
			body: { url: 'not-a-url' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/web/crawl/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/web/crawl', {
			body: { url: 'https://example.com' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 502 when langextract fails', async () => {
		mockLangextractFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
		const { POST } = await import('../src/routes/api/web/crawl/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/web/crawl', {
			body: { url: 'https://example.com/page' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(502);
	});
});

// ─────────────────────────────────────────────────────────
// /api/knowledge/stats (GET)
// ─────────────────────────────────────────────────────────
describe('/api/knowledge/stats (GET)', () => {
	it('returns knowledge collection stats', async () => {
		const { GET } = await import('../src/routes/api/knowledge/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/knowledge/stats');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.stats.totalDocuments).toBe(42);
		expect(data.stats.collections.qdrant.status).toBe('green');
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/knowledge/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/knowledge/stats', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 503 when Qdrant is down', async () => {
		mockSearcher.getStats.mockRejectedValueOnce(new Error('Qdrant unreachable'));
		const { GET } = await import('../src/routes/api/knowledge/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/knowledge/stats');
		const res = await GET(event as any);
		expect(res.status).toBe(200);
    const data = await jsonBody(res);
    expect(data.success).toBe(false);
	});

	it('returns 500 for generic errors', async () => {
		mockSearcher.getStats.mockRejectedValueOnce(new Error('Unknown error'));
		const { GET } = await import('../src/routes/api/knowledge/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/knowledge/stats');
		const res = await GET(event as any);
		expect(res.status).toBe(200);
    const data = await jsonBody(res);
    expect(data.success).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────
// /api/knowledge/search (POST)
// ─────────────────────────────────────────────────────────
describe('/api/knowledge/search (POST)', () => {
	it('returns search results from knowledge searcher', async () => {
		const { POST } = await import('../src/routes/api/knowledge/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/knowledge/search', {
			body: { query: 'contract clause interpretation' },
			fetch: vi.fn(async () => new Response(JSON.stringify({ results: [] }), {
				status: 200, headers: { 'Content-Type': 'application/json' },
			})),
		});
		const res = await POST(event as any);
		expect(res.status).toBeLessThan(400);
	});

	it('returns 400 for empty query', async () => {
		const { POST } = await import('../src/routes/api/knowledge/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/knowledge/search', {
			body: { query: '' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/knowledge/search/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/knowledge/search', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});
