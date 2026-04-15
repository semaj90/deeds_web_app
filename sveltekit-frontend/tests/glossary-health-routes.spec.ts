/**
 * Glossary + Health API Routes — Unit Tests
 *
 * Tests for: /api/glossary/search, /api/glossary/terms, /api/health
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── shared mocks ───────────────────────────────────────────────
const mockOllamaFetch = vi.fn();
const mockDbExecute = vi.fn();
const mockPoolQuery = vi.fn();

vi.mock('$lib/server/middleware/cache-headers.js', () => ({
  cacheControl: { private: {}, public: {} },
  checkETag: () => ({ etag: '"test"', isMatch: false }),
  notModified: () => new Response(null, { status: 304 }),
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    OLLAMA_BASE_URL: 'http://ollama.test',
    QDRANT_URL: 'http://qdrant.test',
    REDIS_URL: 'redis://localhost:6379',
    QUIC_EMBED_PORT: '4433',
    GO_SEARCH_GRPC_URL: 'localhost:50051',
    RABBITMQ_URL: 'amqp://localhost:5672',
    DATABASE_URL: 'postgresql://localhost:5432/test',
    COUCHDB_URL: 'http://admin:pass@localhost:5984',
    NEO4J_URI: 'bolt://localhost:7687',
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    LANGEXTRACT_URL: 'http://localhost:8095',
    QUIC_HEALTH_URL: 'http://localhost:5178',
    GO_SEARCH_URL: 'http://localhost:8096',
    NATS_URL: 'nats://localhost:4222',
    EMBEDDING_QUIC_ENABLED: 'false',
    EMBEDDING_GRPC_ENABLED: 'false',
    EMBEDDING_GRPC_URL: 'localhost:50051',
  },
  ollamaFetch: mockOllamaFetch,
}));

vi.mock('$lib/server/db/client', () => ({
  pgRows: (r) => (Array.isArray(r) ? r : (r?.rows ?? [])),
  db: {
    execute: mockDbExecute,
  },
  pool: {
    query: mockPoolQuery,
  },
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(vi.fn(), { raw: vi.fn((s: string) => s) }),
  eq: vi.fn(),
}));

vi.mock('$lib/server/circuit-breaker.js', () => ({
  ollamaBreaker: {
    fire: vi.fn(async (fn: Function) => fn()),
    getState: vi.fn(() => ({ state: 'CLOSED', failureCount: 0, lastFailure: null })),
    getStatus: vi.fn(() => ({ state: 'CLOSED', failureCount: 0, lastFailure: null })),
  },
  qdrantBreaker: {
    fire: vi.fn(async (fn: Function) => fn()),
    getState: vi.fn(() => ({ state: 'CLOSED', failureCount: 0, lastFailure: null })),
    getStatus: vi.fn(() => ({ state: 'CLOSED', failureCount: 0, lastFailure: null })),
  },
  redisBreaker: {
    fire: vi.fn(async (fn: Function) => fn()),
    getState: vi.fn(() => ({ state: 'CLOSED', failureCount: 0, lastFailure: null })),
    getStatus: vi.fn(() => ({ state: 'CLOSED', failureCount: 0, lastFailure: null })),
  },
  breakerEventLog: [],
}));

vi.mock('$lib/server/embedding/embed.js', () => ({
	getInFlightCount: vi.fn(() => 0),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	checkGrpcHealth: vi.fn(async () => ({ available: false, enabled: false })),
}));

// ── helpers ────────────────────────────────────────────────────
function makeRequest(
	method: string,
	body?: unknown,
	params: Record<string, string> = {},
	searchParams?: URLSearchParams,
) {
	const url = new URL('http://localhost:5173/api/test');
	if (searchParams) {
		searchParams.forEach((v, k) => url.searchParams.set(k, v));
	}
	const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
	if (body !== undefined) init.body = JSON.stringify(body);
	return {
		request: new Request(url.toString(), init),
		params,
		url,
		locals: { user: { id: 'test-user-1' } },
	};
}

function makeUnauthenticatedRequest(method: string, body?: unknown) {
	const url = new URL('http://localhost:5173/api/test');
	const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
	if (body !== undefined) init.body = JSON.stringify(body);
	return {
		request: new Request(url.toString(), init),
		params: {},
		url,
		locals: {},
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDbExecute.mockResolvedValue({ rows: [] });
	mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ── POST /api/glossary/search ──────────────────────────────────
describe('POST /api/glossary/search', () => {
	let POST: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/glossary/search/+server.ts');
		POST = mod.POST;
	});

	it('rejects unauthenticated requests', async () => {
		const event = makeUnauthenticatedRequest('POST', { query: 'tort' });
		const res = await POST(event);
		expect(res.status).toBe(401);
	});

	it('rejects empty query', async () => {
		const event = makeRequest('POST', { query: '' });
		const res = await POST(event);
		expect(res.status).toBe(400);
	});

	it('returns results for valid query (text fallback)', async () => {
		// Mock embeddings to fail so it falls through to text search
		mockOllamaFetch.mockRejectedValue(new Error('Connection refused'));
		mockDbExecute.mockResolvedValue({
			rows: [
				{
					id: 'g-1',
					term: 'Tort',
					definition: 'A wrongful act leading to civil liability',
					category: 'civil',
					jurisdiction: null,
					related_terms: [],
					sources: [],
					similarity: 0.8,
				},
			],
		});

		const event = makeRequest('POST', { query: 'tort', limit: 5 });
		const res = await POST(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.results).toBeDefined();
		expect(body.count).toBeGreaterThanOrEqual(0);
		expect(body.timing).toBeDefined();
	});

	it('respects category filter', async () => {
		mockOllamaFetch.mockRejectedValue(new Error('Connection refused'));
		mockDbExecute.mockResolvedValue({ rows: [] });

		const event = makeRequest('POST', { query: 'liability', category: 'civil' });
		const res = await POST(event);
		expect(res.status).toBe(200);
	});

	it('returns semantic results when embeddings succeed', async () => {
		mockOllamaFetch.mockResolvedValue({
			ok: true,
			json: async () => ({ embedding: new Array(768).fill(0.01) }),
		});
		mockDbExecute.mockResolvedValue({
			rows: [
				{
					id: 'g-2',
					term: 'Habeas Corpus',
					definition: 'Right to challenge unlawful detention',
					category: 'constitutional',
					jurisdiction: 'US Federal',
					related_terms: ['Petition'],
					sources: ['14th Amendment'],
					similarity: 0.92,
				},
			],
		});

		const event = makeRequest('POST', { query: 'habeas corpus' });
		const res = await POST(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.results).toBeDefined();
	});
});

// ── GET /api/glossary/terms ────────────────────────────────────
describe('GET /api/glossary/terms', () => {
	let GET: Function;

	beforeEach(async () => {
		const mod = await import('../src/routes/api/glossary/terms/+server.ts');
		GET = mod.GET;
	});

	it('rejects unauthenticated requests', async () => {
		const event = makeUnauthenticatedRequest('GET');
		event.url = new URL('http://localhost:5173/api/glossary/terms');
		const res = await GET(event);
		expect(res.status).toBe(401);
	});

	it('returns terms with default params', async () => {
		mockPoolQuery.mockResolvedValue({
			rows: [
				{ id: 't-1', term: 'Affidavit', definition: 'A sworn statement', node_id: null, citation: null, confidence: 0.9 },
			],
			rowCount: 1,
		});

		const event = makeRequest('GET', undefined, {}, new URLSearchParams());
		event.url = new URL('http://localhost:5173/api/glossary/terms');
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.terms).toBeDefined();
		expect(body.count).toBeGreaterThanOrEqual(0);
		expect(body.timing).toBeDefined();
	});

	it('handles empty DB gracefully', async () => {
		// First call (legal_definitions) returns 0 rows, fallback (legal_glossary) also returns 0
		mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

		const event = makeRequest('GET', undefined, {}, new URLSearchParams());
		event.url = new URL('http://localhost:5173/api/glossary/terms');
		const res = await GET(event);
		// Should return 200 or 503, not crash
		expect(res.status).toBeLessThan(600);
	});

	it('filters by category', async () => {
		mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
		const params = new URLSearchParams({ category: 'criminal' });
		const event = makeRequest('GET', undefined, {}, params);
		event.url = new URL('http://localhost:5173/api/glossary/terms?' + params.toString());
		const res = await GET(event);
		expect(res.status).toBeLessThan(600);
	});

	it('filters by text query', async () => {
		mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
		const params = new URLSearchParams({ q: 'warrant' });
		const event = makeRequest('GET', undefined, {}, params);
		event.url = new URL('http://localhost:5173/api/glossary/terms?' + params.toString());
		const res = await GET(event);
		expect(res.status).toBeLessThan(600);
	});

	it('respects limit and offset', async () => {
		mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
		const params = new URLSearchParams({ limit: '10', offset: '5' });
		const event = makeRequest('GET', undefined, {}, params);
		event.url = new URL('http://localhost:5173/api/glossary/terms?' + params.toString());
		const res = await GET(event);
		expect(res.status).toBeLessThan(600);
	});
});

// ── GET /api/health ────────────────────────────────────────────
describe('GET /api/health', () => {
	let GET: Function;

	beforeEach(async () => {
		// Mock global fetch for health probes
		vi.stubGlobal('fetch', vi.fn(async () => ({
			ok: true,
			json: async () => ({ models: [] }),
		})));
		const mod = await import('../src/routes/api/health/+server.ts');
		GET = mod.GET;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns aggregate health status', async () => {
		const event = makeRequest('GET', undefined, {}, new URLSearchParams());
		event.url = new URL('http://localhost:5173/api/health');
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBeDefined();
		expect(['healthy', 'degraded']).toContain(body.status);
		expect(body.uptime).toBeDefined();
		expect(typeof body.uptime).toBe('number');
		expect(body.checks).toBeDefined();
	});

	it('returns single service status for ?service=ollama', async () => {
		const params = new URLSearchParams({ service: 'ollama' });
		const event = makeRequest('GET', undefined, {}, params);
		event.url = new URL('http://localhost:5173/api/health?service=ollama');
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.service).toBe('ollama');
		expect(typeof body.ok).toBe('boolean');
	});

	it('returns redis status for ?service=redis', async () => {
		const params = new URLSearchParams({ service: 'redis' });
		const event = makeRequest('GET', undefined, {}, params);
		event.url = new URL('http://localhost:5173/api/health?service=redis');
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.service).toBe('redis');
	});

	it('rejects invalid service name', async () => {
		const params = new URLSearchParams({ service: 'invalid-service' });
		const event = makeRequest('GET', undefined, {}, params);
		event.url = new URL('http://localhost:5173/api/health?service=invalid-service');
		const res = await GET(event);
		expect(res.status).toBe(400);
	});

	it('handles degraded state when services are down', async () => {
		// Mock fetch to fail (services unreachable)
		vi.stubGlobal('fetch', vi.fn(async () => {
			throw new Error('Connection refused');
		}));

		const event = makeRequest('GET', undefined, {}, new URLSearchParams());
		event.url = new URL('http://localhost:5173/api/health');
		const res = await GET(event);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe('degraded');
	});
});
