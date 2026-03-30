/**
 * Analytics + Tags + NLP + Search Suggestions + User Preferences + Onboarding + Ping — Unit Tests
 *
 * Tests for:
 *   /api/analytics/events (GET/POST)
 *   /api/analytics/patterns (GET)
 *   /api/analytics/summary (GET)
 *   /api/analytics/search (POST)
 *   /api/analytics/token-usage (GET)
 *   /api/tags (GET)
 *   /api/tags/[tagId] (GET)
 *   /api/tags/search (GET)
 *   /api/nlp/classify (POST)
 *   /api/nlp/sentiment (POST)
 *   /api/search/suggestions (GET)
 *   /api/user/preferences (GET/PATCH)
 *   /api/onboarding (GET/PATCH)
 *   /api/ping (GET)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Env mocks ──────────────────────────────────────────────────
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
const mockExecute = vi.fn(async () => ({ rows: [] }));
const mockReturning = vi.fn(async () => []);

function buildSelectChain(data: unknown[] = []) {
	const chain: any = {};
	chain.from = vi.fn(() => chain);
	chain.where = vi.fn(() => chain);
	chain.orderBy = vi.fn(() => chain);
	chain.limit = vi.fn(() => chain);
	chain.offset = vi.fn(() => chain);
	chain.groupBy = vi.fn(() => chain);
	chain.then = (resolve: Function) => resolve(data);
	chain[Symbol.toStringTag] = 'Promise';
	return chain;
}

const mockUpdateSet = vi.fn(() => ({
	where: vi.fn(() => ({
		returning: mockReturning,
	})),
}));

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: vi.fn(() => buildSelectChain()),
		insert: vi.fn(() => ({ values: vi.fn(async () => ({})) })),
		update: vi.fn(() => ({ set: mockUpdateSet })),
		delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: mockReturning })) })),
		execute: (...args: unknown[]) => mockExecute(...args),
	},
	pool: {
		query: vi.fn(async () => ({ rows: [{ count: '2' }] })),
	},
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'id', title: 'title', caseNumber: 'case_number', createdAt: 'created_at' },
	statutes: { id: 'id', title: 'title', section: 'section', createdAt: 'created_at' },
	evidence: { id: 'id', title: 'title', createdAt: 'created_at' },
	reports: { id: 'id', title: 'title', createdAt: 'created_at' },
	users: { id: 'id', hasCompletedOnboarding: 'has_completed_onboarding', onboardingStep: 'onboarding_step' },
}));

vi.mock('$lib/server/db/schema', () => ({
	users: { id: 'id', hasCompletedOnboarding: 'has_completed_onboarding', onboardingStep: 'onboarding_step' },
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...a: unknown[]) => ({ type: 'eq', a })),
	desc: vi.fn((...a: unknown[]) => ({ type: 'desc', a })),
	and: vi.fn((...a: unknown[]) => ({ type: 'and', a })),
	or: vi.fn((...a: unknown[]) => ({ type: 'or', a })),
	ilike: vi.fn((...a: unknown[]) => ({ type: 'ilike', a })),
	sql: Object.assign(vi.fn((...a: unknown[]) => ({ type: 'sql', a })), {
		raw: vi.fn((s: string) => s),
	}),
}));

// ── Analytics event-logger mock ────────────────────────────────
vi.mock('$lib/server/analytics/event-logger.js', () => ({
	logEvent: vi.fn(async () => {}),
	logEventBatch: vi.fn(async (events: unknown[]) => (events as unknown[]).length),
	getWeeklySummary: vi.fn(async () => ({
		totalEvents: 42,
		topEventTypes: [{ eventType: 'case_created', count: 15 }],
		dailyBreakdown: [],
	})),
	getTopQueryPatterns: vi.fn(async () => [
		{ pattern: 'contract law', count: 12 },
		{ pattern: 'evidence discovery', count: 8 },
	]),
}));

// ── Token tracker mock ─────────────────────────────────────────
vi.mock('$lib/server/ai/token-tracker.js', () => ({
	getTokenUsageStats: vi.fn(async () => ({
		totalTokens: 50000,
		promptTokens: 30000,
		completionTokens: 20000,
		requestCount: 200,
		byModel: { 'gemma3-legal': { tokens: 50000, requests: 200 } },
	})),
}));

// ── RabbitMQ mock ──────────────────────────────────────────────
vi.mock('$lib/server/queue/rabbitmq-manager-fixed.js', () => ({
	rabbitmq: {
		publishAnalyticsEvent: vi.fn(async () => {}),
		publishErrorEmbed: vi.fn(async () => {}),
	},
}));

// ── NLP analyzer mock ──────────────────────────────────────────
const mockClassifyDocument = vi.fn(async () => ({
	documentType: 'contract',
	practiceArea: 'corporate',
	confidence: 0.92,
}));

const mockAnalyzeSentiment = vi.fn(async () => ({
	sentiment: 'neutral',
	score: 0.05,
	emotions: { anger: 0.1, joy: 0.2, sadness: 0.1 },
}));

vi.mock('$lib/server/nlp/analyzer.js', () => ({
	classifyDocument: (...args: unknown[]) => mockClassifyDocument(...args),
	analyzeSentiment: (...args: unknown[]) => mockAnalyzeSentiment(...args),
}));

// ── Validation mock ────────────────────────────────────────────
vi.mock('$lib/server/validation.js', () => ({
	isValidSafeId: vi.fn((s: string) => typeof s === 'string' && s.length > 0 && /^[a-zA-Z0-9_-]+$/.test(s)),
	isUuid: vi.fn((s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)),
}));

// ── CouchDB mock ───────────────────────────────────────────────
vi.mock('$lib/services/couchdb-client.js', () => ({
	couchdb: {
		get: vi.fn(async (_db: string, id: string) => ({ _id: id, name: 'Test Tag', category: 'legal' })),
	},
}));

// ── Tag search mock ────────────────────────────────────────────
vi.mock('$lib/server/ace/tag-sync.js', () => ({
	searchTagsBySemantic: vi.fn(async () => [
		{ tag: 'contract-law', score: 0.95 },
		{ tag: 'corporate-governance', score: 0.82 },
	]),
}));

// ── Ollama fetch mock ──────────────────────────────────────────
vi.mock('$lib/server/ollama.js', () => ({
	ollamaFetch: vi.fn(async () => ({
		ok: true,
		json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
	})),
}));

// ── Redis mock ─────────────────────────────────────────────────
const mockRedisStore: Record<string, string> = {};
vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({
		get: vi.fn(async (key: string) => mockRedisStore[key] ?? null),
		set: vi.fn(async (key: string, val: string) => { mockRedisStore[key] = val; }),
	}),
}));

// ── Search types mock ──────────────────────────────────────────
vi.mock('$lib/types/search.js', () => ({}));

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

const authedLocals = { user: { id: 'user-1', email: 'test@test.com', role: 'admin' } } as any;
const anonLocals = { user: null } as any;

beforeEach(() => {
	vi.clearAllMocks();
	mockExecute.mockReset();
	mockExecute.mockResolvedValue({ rows: [] });
	// Clear Redis mock store
	for (const key in mockRedisStore) delete mockRedisStore[key];
});

// ════════════════════════════════════════════════════════════════
// PING: /api/ping
// ════════════════════════════════════════════════════════════════
describe('/api/ping (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/ping/+server');
		GET = mod.GET;
	});

	it('returns pong status', async () => {
		const res = await GET({});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.status).toBe('ok');
		expect(data.message).toBe('pong');
		expect(data.timestamp).toBeTruthy();
	});
});

// ════════════════════════════════════════════════════════════════
// ANALYTICS EVENTS: /api/analytics/events
// ════════════════════════════════════════════════════════════════
describe('/api/analytics/events (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/analytics/events/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST({
			request: mkRequest({ eventType: 'case_created' }),
			locals: anonLocals,
		});
		expect(res.status).toBe(401);
	});

	it('logs a single event', async () => {
		const res = await POST({
			request: mkRequest({ eventType: 'case_created', payload: { caseId: '123' } }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.ok).toBe(true);
	});

	it('logs batch events', async () => {
		const res = await POST({
			request: mkRequest({
				batch: [
					{ eventType: 'case_created' },
					{ eventType: 'evidence_uploaded' },
					{ eventType: 'rag_search' },
				],
			}),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.ok).toBe(true);
		expect(data.logged).toBe(3);
	});

	it('returns 400 for invalid event type', async () => {
		const res = await POST({
			request: mkRequest({ eventType: 'invalid_type' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns 400 for empty batch', async () => {
		const res = await POST({
			request: mkRequest({ batch: [] }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});
});

describe('/api/analytics/events (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/analytics/events/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({ url: mkUrl('/api/analytics/events'), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns recent events', async () => {
		mockExecute.mockResolvedValueOnce({ rows: [{ id: '1', event_type: 'case_created' }] });

		const res = await GET({ url: mkUrl('/api/analytics/events'), locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.events).toBeDefined();
	});

	it('returns 503 on DB error', async () => {
		mockExecute.mockRejectedValueOnce(new Error('DB down'));

		const res = await GET({ url: mkUrl('/api/analytics/events'), locals: authedLocals });
		expect(res.status).toBe(503);
	});
});

// ════════════════════════════════════════════════════════════════
// ANALYTICS PATTERNS: /api/analytics/patterns
// ════════════════════════════════════════════════════════════════
describe('/api/analytics/patterns (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/analytics/patterns/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({ url: mkUrl('/api/analytics/patterns', { userId: 'user-1' }), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns 400 when userId missing', async () => {
		const res = await GET({ url: mkUrl('/api/analytics/patterns'), locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('returns query patterns', async () => {
		const res = await GET({
			url: mkUrl('/api/analytics/patterns', { userId: 'user-1' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.patterns).toHaveLength(2);
		expect(data.patterns[0].pattern).toBe('contract law');
	});
});

// ════════════════════════════════════════════════════════════════
// ANALYTICS SUMMARY: /api/analytics/summary
// ════════════════════════════════════════════════════════════════
describe('/api/analytics/summary (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/analytics/summary/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({ url: mkUrl('/api/analytics/summary', { userId: 'user-1' }), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns 400 when userId missing', async () => {
		const res = await GET({ url: mkUrl('/api/analytics/summary'), locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('returns weekly summary', async () => {
		const res = await GET({
			url: mkUrl('/api/analytics/summary', { userId: 'user-1' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.totalEvents).toBe(42);
	});
});

// ════════════════════════════════════════════════════════════════
// ANALYTICS SEARCH: /api/analytics/search
// ════════════════════════════════════════════════════════════════
describe('/api/analytics/search (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/analytics/search/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST({
			request: mkRequest({ query: 'test', resultCount: 5, executionTimeMs: 120, type: 'cases' }),
			locals: anonLocals,
		});
		expect(res.status).toBe(401);
	});

	it('records search analytics', async () => {
		const res = await POST({
			request: mkRequest({ query: 'contract law', resultCount: 10, executionTimeMs: 250, type: 'laws' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
	});

	it('handles malformed body gracefully (always 200)', async () => {
		const res = await POST({
			request: mkRequest('not json'),
			locals: authedLocals,
		});
		// analytics search always returns 200 for valid users
		expect(res.status).toBe(200);
	});
});

// ════════════════════════════════════════════════════════════════
// ANALYTICS TOKEN USAGE: /api/analytics/token-usage
// ════════════════════════════════════════════════════════════════
describe('/api/analytics/token-usage (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/analytics/token-usage/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		// This route uses throw error(401) — HttpError
		await expect(
			GET({ url: mkUrl('/api/analytics/token-usage'), locals: anonLocals })
		).rejects.toThrow();
	});

	it('returns token usage stats', async () => {
		const res = await GET({
			url: mkUrl('/api/analytics/token-usage'),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.data.totalTokens).toBe(50000);
		expect(data.data.requestCount).toBe(200);
	});

	it('accepts days and userId params', async () => {
		const res = await GET({
			url: mkUrl('/api/analytics/token-usage', { days: '7', userId: 'user-1' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(200);
	});
});

// ════════════════════════════════════════════════════════════════
// TAGS: /api/tags
// ════════════════════════════════════════════════════════════════
describe('/api/tags (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/tags/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({ locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns default tags when DB returns empty', async () => {
		mockExecute.mockResolvedValueOnce({ rows: [] });

		const res = await GET({ locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.tags).toContain('contract');
		expect(data.tags).toContain('litigation');
	});

	it('returns DB tags when available', async () => {
		mockExecute.mockResolvedValueOnce({
			rows: [{ tag: 'employment' }, { tag: 'criminal' }],
		});

		const res = await GET({ locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.tags).toEqual(['employment', 'criminal']);
	});

	it('returns fallback tags on DB error', async () => {
		mockExecute.mockRejectedValueOnce(new Error('DB down'));

		const res = await GET({ locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.tags.length).toBeGreaterThan(0);
	});
});

// ════════════════════════════════════════════════════════════════
// TAGS [TAG_ID]: /api/tags/[tagId]
// ════════════════════════════════════════════════════════════════
describe('/api/tags/[tagId] (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/tags/[tagId]/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({ params: { tagId: 'contract-law' }, locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns 400 for invalid tag format', async () => {
		const res = await GET({ params: { tagId: 'bad tag!@#' }, locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('returns tag document', async () => {
		const res = await GET({ params: { tagId: 'contract-law' }, locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data._id).toBe('contract-law');
		expect(data.name).toBe('Test Tag');
	});

	it('returns 404 for missing tag', async () => {
		const { couchdb } = await import('$lib/services/couchdb-client.js');
		(couchdb.get as any).mockRejectedValueOnce(new Error('not_found'));

		const res = await GET({ params: { tagId: 'nonexistent' }, locals: authedLocals });
		expect(res.status).toBe(404);
	});
});

// ════════════════════════════════════════════════════════════════
// TAGS SEARCH: /api/tags/search
// ════════════════════════════════════════════════════════════════
describe('/api/tags/search (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/tags/search/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({ url: mkUrl('/api/tags/search', { q: 'contract' }), locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('returns 400 when q param missing', async () => {
		const res = await GET({ url: mkUrl('/api/tags/search'), locals: authedLocals });
		expect(res.status).toBe(400);
	});

	it('returns semantic search results', async () => {
		const res = await GET({
			url: mkUrl('/api/tags/search', { q: 'contract law' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.query).toBe('contract law');
		expect(data.results).toHaveLength(2);
		expect(data.count).toBe(2);
	});

	it('returns 503 when embedding fails', async () => {
		const { ollamaFetch } = await import('$lib/server/ollama.js');
		(ollamaFetch as any).mockResolvedValueOnce({ ok: false });

		const res = await GET({
			url: mkUrl('/api/tags/search', { q: 'test' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(503);
	});
});

// ════════════════════════════════════════════════════════════════
// NLP CLASSIFY: /api/nlp/classify
// ════════════════════════════════════════════════════════════════
describe('/api/nlp/classify (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/nlp/classify/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST({
			request: mkRequest({ text: 'This is a contract...' }),
			locals: anonLocals,
		});
		expect(res.status).toBe(401);
	});

	it('classifies document text', async () => {
		const res = await POST({
			request: mkRequest({ text: 'This corporate acquisition agreement...' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.documentType).toBe('contract');
		expect(data.practiceArea).toBe('corporate');
		expect(data.confidence).toBe(0.92);
	});

	it('returns 400 for empty text', async () => {
		const res = await POST({
			request: mkRequest({ text: '' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns 500 on classifier error', async () => {
		mockClassifyDocument.mockRejectedValueOnce(new Error('Model offline'));

		const res = await POST({
			request: mkRequest({ text: 'Some legal text here' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(500);
	});
});

// ════════════════════════════════════════════════════════════════
// NLP SENTIMENT: /api/nlp/sentiment
// ════════════════════════════════════════════════════════════════
describe('/api/nlp/sentiment (POST)', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/nlp/sentiment/+server');
		POST = mod.POST;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await POST({
			request: mkRequest({ text: 'The ruling was fair.' }),
			locals: anonLocals,
		});
		expect(res.status).toBe(401);
	});

	it('analyzes sentiment', async () => {
		const res = await POST({
			request: mkRequest({ text: 'The court ruled in favor of the defendant.' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.sentiment).toBe('neutral');
		expect(data.score).toBeDefined();
	});

	it('returns 400 for empty text', async () => {
		const res = await POST({
			request: mkRequest({ text: '' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(400);
	});

	it('returns 500 on analyzer error', async () => {
		mockAnalyzeSentiment.mockRejectedValueOnce(new Error('Model offline'));

		const res = await POST({
			request: mkRequest({ text: 'Some text' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(500);
	});
});

// ════════════════════════════════════════════════════════════════
// SEARCH SUGGESTIONS: /api/search/suggestions
// ════════════════════════════════════════════════════════════════
describe('/api/search/suggestions (GET)', () => {
	let GET: Function;

	beforeEach(async () => {
		const { db } = await import('$lib/server/db/client');
		// Mock the select chain for suggestion queries
		(db.select as any).mockImplementation(() => buildSelectChain([]));
		const mod = await import('../src/routes/api/search/suggestions/+server');
		GET = mod.GET;
	});

	it('returns 401 when unauthenticated', async () => {
		const res = await GET({
			url: mkUrl('/api/search/suggestions', { query: 'test' }),
			locals: anonLocals,
		});
		expect(res.status).toBe(401);
	});

	it('returns empty for short query', async () => {
		const res = await GET({
			url: mkUrl('/api/search/suggestions', { query: 'a' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.suggestions).toEqual([]);
	});

	it('returns suggestions for valid query', async () => {
		const res = await GET({
			url: mkUrl('/api/search/suggestions', { query: 'contract law' }),
			locals: authedLocals,
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(Array.isArray(data.suggestions)).toBe(true);
		expect(Array.isArray(data.enrichedSuggestions)).toBe(true);
	});

	it('filters by type=cases', async () => {
		const res = await GET({
			url: mkUrl('/api/search/suggestions', { query: 'fraud case', type: 'cases' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(200);
	});

	it('filters by type=laws', async () => {
		const res = await GET({
			url: mkUrl('/api/search/suggestions', { query: 'section 1', type: 'laws' }),
			locals: authedLocals,
		});
		expect(res.status).toBe(200);
	});
});

// ════════════════════════════════════════════════════════════════
// USER PREFERENCES: /api/user/preferences
// ════════════════════════════════════════════════════════════════
describe('/api/user/preferences (GET/PATCH)', () => {
	let GET: Function, PATCH: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/user/preferences/+server');
		GET = mod.GET;
		PATCH = mod.PATCH;
	});

	// GET
	it('GET returns 401 when unauthenticated', async () => {
		await expect(GET({ locals: anonLocals })).rejects.toThrow();
	});

	it('GET returns default preferences', async () => {
		const res = await GET({ locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.preferences.theme).toBe('dark');
		expect(data.preferences.pageSize).toBe(50);
		expect(data.preferences.language).toBe('en');
	});

	it('GET returns stored preferences when available', async () => {
		mockRedisStore['user:prefs:user-1'] = JSON.stringify({ theme: 'light', pageSize: 25 });

		const res = await GET({ locals: authedLocals });
		const data = await res.json();
		expect(data.preferences.theme).toBe('light');
		expect(data.preferences.pageSize).toBe(25);
	});

	// PATCH
	it('PATCH returns 401 when unauthenticated', async () => {
		await expect(
			PATCH({ locals: anonLocals, request: mkRequest({ theme: 'light' }) })
		).rejects.toThrow();
	});

	it('PATCH updates preferences', async () => {
		const res = await PATCH({
			locals: authedLocals,
			request: mkRequest({ theme: 'light', sidebarCollapsed: true }),
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
		expect(data.preferences.theme).toBe('light');
		expect(data.preferences.sidebarCollapsed).toBe(true);
	});

	it('PATCH rejects empty update', async () => {
		await expect(
			PATCH({ locals: authedLocals, request: mkRequest({}) })
		).rejects.toThrow();
	});

	it('PATCH rejects invalid fields', async () => {
		await expect(
			PATCH({ locals: authedLocals, request: mkRequest({ theme: 'INVALID' }) })
		).rejects.toThrow();
	});

	it('PATCH rejects unknown fields (strict schema)', async () => {
		await expect(
			PATCH({ locals: authedLocals, request: mkRequest({ hackField: true }) })
		).rejects.toThrow();
	});
});

// ════════════════════════════════════════════════════════════════
// ONBOARDING: /api/onboarding
// ════════════════════════════════════════════════════════════════
describe('/api/onboarding (GET/PATCH)', () => {
	let GET: Function, PATCH: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/onboarding/+server');
		GET = mod.GET;
		PATCH = mod.PATCH;
	});

	// GET
	it('GET returns 401 when unauthenticated', async () => {
		const res = await GET({ locals: anonLocals });
		expect(res.status).toBe(401);
	});

	it('GET returns default onboarding state', async () => {
		const res = await GET({ locals: authedLocals });
		const data = await res.json();
		expect(res.status).toBe(200);
		// Returns either default or DB values
		expect(data.hasCompletedOnboarding).toBeDefined();
		expect(data.onboardingStep).toBeDefined();
	});

	// PATCH
	it('PATCH returns 401 when unauthenticated', async () => {
		const res = await PATCH({
			locals: anonLocals,
			request: mkRequest({ hasCompletedOnboarding: true }),
		});
		expect(res.status).toBe(401);
	});

	it('PATCH updates onboarding step', async () => {
		const res = await PATCH({
			locals: authedLocals,
			request: mkRequest({ onboardingStep: 3 }),
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.ok).toBe(true);
	});

	it('PATCH marks onboarding complete', async () => {
		const res = await PATCH({
			locals: authedLocals,
			request: mkRequest({ hasCompletedOnboarding: true }),
		});
		const data = await res.json();
		expect(res.status).toBe(200);
		expect(data.ok).toBe(true);
	});

	it('PATCH returns 400 for no valid fields', async () => {
		const res = await PATCH({
			locals: authedLocals,
			request: mkRequest({}),
		});
		expect(res.status).toBe(400);
	});

	it('PATCH returns 400 for out-of-range step', async () => {
		const res = await PATCH({
			locals: authedLocals,
			request: mkRequest({ onboardingStep: 999 }),
		});
		expect(res.status).toBe(400);
	});
});
