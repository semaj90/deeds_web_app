// @vitest-environment node
/**
 * Pass A — Degraded-Shape Contract Tests (7 routes)
 *
 * Verifies that GET route catch blocks return the SAME top-level JSON keys
 * as the success path (with empty/zero defaults), plus `degraded: true`.
 *
 * Routes covered:
 *   1. GET /api/cache/stats
 *   2. GET /api/cache/exact-match/stats
 *   3. GET /api/citations
 *   4. GET /api/ai/stats
 *   5. GET /api/cases
 *   6. GET /api/infrastructure/status
 *   7. GET /api/yorha/analytics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── hoisted mocks ─────────────────────────────────────────────────────────────

const {
	mockScanCount,
	mockGetRedis,
	mockGetTemplateCacheStats,
	mockGetExportCacheStats,
	mockGetExactMatchStats,
	mockDbSelect,
	mockDbExecute,
	mockDbInsert,
	mockPoolQuery,
	mockOllamaFetch,
	mockCheckGrpcHealth,
	mockCheckRetrievalHealth,
	mockGetLangExtractStatus,
	mockTrtHealthCheck,
	mockTritonModelHealthCheck,
	mockGetRouterStatus,
	mockGetGpuLeaseStatus,
	mockIsCudaAvailable,
	mockValidateQdrantCollections,
	mockGetAdapterStatus,
	mockGetDispatchStats,
	mockGetInferenceLogStats,
	mockGetRabbitMQManagementUrl,
	mockGetRabbitMQManagementAuth,
} = vi.hoisted(() => ({
	mockScanCount: vi.fn().mockResolvedValue(0),
	mockGetRedis: vi.fn(),
	mockGetTemplateCacheStats: vi.fn(),
	mockGetExportCacheStats: vi.fn(),
	mockGetExactMatchStats: vi.fn(),
	mockDbSelect: vi.fn(),
	mockDbExecute: vi.fn(),
	mockDbInsert: vi.fn(),
	mockPoolQuery: vi.fn(),
	mockOllamaFetch: vi.fn(),
	mockCheckGrpcHealth: vi.fn(),
	mockCheckRetrievalHealth: vi.fn(),
	mockGetLangExtractStatus: vi.fn(),
	mockTrtHealthCheck: vi.fn(),
	mockTritonModelHealthCheck: vi.fn(),
	mockGetRouterStatus: vi.fn(),
	mockGetGpuLeaseStatus: vi.fn(),
	mockIsCudaAvailable: vi.fn().mockReturnValue(false),
	mockValidateQdrantCollections: vi.fn(),
	mockGetAdapterStatus: vi.fn().mockReturnValue({}),
	mockGetDispatchStats: vi.fn().mockReturnValue({ total: 0, succeeded: 0, failed: 0, pending: 0 }),
	mockGetInferenceLogStats: vi.fn().mockReturnValue({ total: 0, byBackend: {} }),
	mockGetRabbitMQManagementUrl: vi.fn().mockReturnValue('http://localhost:15672'),
	mockGetRabbitMQManagementAuth: vi.fn().mockReturnValue('Basic Z3Vlc3Q6Z3Vlc3Q='),
}));

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: (...a: unknown[]) => mockGetRedis(...a),
	redis: { ping: vi.fn().mockResolvedValue('PONG'), info: vi.fn().mockResolvedValue('') },
}));

vi.mock('$lib/server/cache/report-template-cache.js', () => ({
	getTemplateCacheStats: (...a: unknown[]) => mockGetTemplateCacheStats(...a),
}));

vi.mock('$lib/server/cache/pdf-export-cache.js', () => ({
	getExportCacheStats: (...a: unknown[]) => mockGetExportCacheStats(...a),
}));

vi.mock('$lib/server/cache/redis-exact-match.js', () => ({
	getExactMatchStats: (...a: unknown[]) => mockGetExactMatchStats(...a),
}));

vi.mock('$lib/server/middleware/cache-headers.js', () => ({
	cacheControl: { short: {}, private: {} },
	checkETag: vi.fn(() => ({ etag: '"test"', isMatch: false })),
	notModified: vi.fn(() => new Response(null, { status: 304 })),
}));

const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();
const mockWithCache = vi.fn();

vi.mock('$lib/server/db/client', () => {
	const chain = {
		from: (...a: unknown[]) => { mockFrom(...a); return chain; },
		where: (...a: unknown[]) => { mockWhere(...a); return chain; },
		orderBy: (...a: unknown[]) => { mockOrderBy(...a); return chain; },
		limit: (...a: unknown[]) => { mockLimit(...a); return chain; },
		offset: (...a: unknown[]) => { mockOffset(...a); return chain; },
		$withCache: (...a: unknown[]) => { mockWithCache(...a); return mockWithCache(...a); },
	};
	return {
		db: {
			select: (...a: unknown[]) => { mockDbSelect(...a); return chain; },
			execute: (...a: unknown[]) => mockDbExecute(...a),
			insert: (...a: unknown[]) => { mockDbInsert(...a); return { values: vi.fn().mockReturnValue({ returning: vi.fn() }) }; },
		},
		cases: { userId: 'userId', title: 'title', status: 'status', priority: 'priority', updatedAt: 'updatedAt' },
		citations: { caseId: 'caseId', createdAt: 'createdAt' },
		pool: { query: (...a: unknown[]) => mockPoolQuery(...a) },
		pgRows: (r: { rows?: unknown[] }) => r?.rows ?? [],
	};
});

vi.mock('$lib/server/db/schema-postgres.js', () => ({
	evidence: { id: 'id' },
	cases: { userId: 'userId', title: 'title', status: 'status', priority: 'priority', updatedAt: 'updatedAt' },
	citations: { caseId: 'caseId', createdAt: 'createdAt' },
	statutes: {},
}));

vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((col: unknown) => col),
	and: vi.fn((...args: unknown[]) => args),
	like: vi.fn((...args: unknown[]) => args),
	inArray: vi.fn((...args: unknown[]) => args),
	sql: vi.fn(() => 'sql'),
}));

vi.mock('$lib/server/cache.js', () => ({
	getFromMemoryCache: vi.fn(() => null),
	setCache: vi.fn(),
}));

vi.mock('$lib/server/law-mapping.js', () => ({
	findStateBySlug: vi.fn(),
}));

vi.mock('$lib/server/api/response-helper.js', () => ({
	apiResponses: {
		ok: (data: unknown) => Response.json(data, { status: 200 }),
		badRequest: (msg: string) => Response.json({ error: msg }, { status: 400 }),
	},
	validateRequest: vi.fn(),
}));

vi.mock('$lib/server/auth-helpers.js', () => ({
	requireAuth: vi.fn(async (event: { locals: { user: unknown } }) => ({ user: event.locals.user })),
}));

vi.mock('$lib/server/cache/invalidation.js', () => ({
	invalidateCaseCache: vi.fn(),
}));

vi.mock('$lib/server/graph/pg-neo4j-sync.js', () => ({
	syncCaseToGraph: vi.fn(),
}));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: {
		OLLAMA_BASE_URL: 'http://localhost:11434',
		QDRANT_URL: 'http://localhost:6333',
		EMBEDDING_QUIC_ENABLED: false,
		NATS_URL: '',
		TENSORRT_URL: 'http://localhost:8099',
		TRITON_URL: 'http://localhost:8000',
		TRITON_LLM_MODEL: 'test-model',
		TRITON_VLM_MODEL: 'test-vlm',
		TRITON_VISION_MODEL: 'test-vision',
		WHISPER_USE_SERVER: false,
		WHISPER_SERVER_URL: '',
	},
}));

vi.mock('$lib/server/ollama.js', () => ({
	ollamaFetch: (...a: unknown[]) => mockOllamaFetch(...a),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	checkGrpcHealth: (...a: unknown[]) => mockCheckGrpcHealth(...a),
}));

vi.mock('$lib/server/grpc/retrieval-client.js', () => ({
	checkRetrievalHealth: (...a: unknown[]) => mockCheckRetrievalHealth(...a),
}));

vi.mock('$lib/server/langextract-client.js', () => ({
	getLangExtractStatus: (...a: unknown[]) => mockGetLangExtractStatus(...a),
}));

vi.mock('$lib/server/trt-llm.js', () => ({
	healthCheck: (...a: unknown[]) => mockTrtHealthCheck(...a),
}));

vi.mock('$lib/server/triton-llm.js', () => ({
	healthCheckModel: (...a: unknown[]) => mockTritonModelHealthCheck(...a),
}));

vi.mock('$lib/server/inference/gpu-arbiter.js', () => ({
	getGpuLeaseStatus: (...a: unknown[]) => mockGetGpuLeaseStatus(...a),
}));

vi.mock('$lib/server/inference/inference-router.js', () => ({
	getRouterStatus: (...a: unknown[]) => mockGetRouterStatus(...a),
}));

vi.mock('$lib/server/gpu/libtorch-bridge.js', () => ({
	isCudaAvailable: (...a: unknown[]) => mockIsCudaAvailable(...a),
}));

vi.mock('$lib/server/config/vector-config.js', () => ({
	validateQdrantCollections: (...a: unknown[]) => mockValidateQdrantCollections(...a),
}));

vi.mock('$lib/server/inference/adapter-manifest.js', () => ({
	getAdapterStatus: (...a: unknown[]) => mockGetAdapterStatus(...a),
}));

vi.mock('$lib/server/queue/dispatch-inline.js', () => ({
	getDispatchStats: (...a: unknown[]) => mockGetDispatchStats(...a),
}));

vi.mock('$lib/server/observability/inference-log.js', () => ({
	getInferenceLogStats: (...a: unknown[]) => mockGetInferenceLogStats(...a),
}));

vi.mock('$lib/config/env.server.js', () => ({
	getRabbitMQManagementUrl: (...a: unknown[]) => mockGetRabbitMQManagementUrl(...a),
	getRabbitMQManagementAuth: (...a: unknown[]) => mockGetRabbitMQManagementAuth(...a),
	getQdrantUrl: () => 'http://localhost:6333',
}));

vi.mock('$lib/gpu/runtime-optimizations.js', () => ({
	NODE_RUNTIME_CONFIG: {
		maxOldSpaceSize: 0,
		gpuBatchSize: 0,
		gpuConcurrencyLimit: 0,
		experimentalWasmSimd: false,
		experimentalWasmThreads: false,
	},
	GPU_MARKDOWN_ENV: {
		GPU_MARKDOWN_SERVICE_URL: '',
		FALLBACK_TO_CPU: false,
	},
}));

vi.mock('zod', async (importOriginal) => {
	const real = await importOriginal<typeof import('zod')>();
	return real;
});

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvent(opts: {
	url?: string;
	locals?: Record<string, unknown>;
	headers?: Record<string, string>;
} = {}) {
	const urlStr = opts.url?.startsWith('http') ? opts.url : `http://localhost${opts.url ?? '/'}`;
	const url = new URL(urlStr);
	const headers = new Headers(opts.headers ?? {});
	const request = new Request(url, { method: 'GET', headers });
	return {
		url,
		request,
		params: {},
		locals: opts.locals ?? {},
		route: { id: null },
		cookies: { get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn(), delete: vi.fn(), serialize: vi.fn() },
		setHeaders: vi.fn(),
		isDataRequest: false,
		fetch: vi.fn(),
		platform: {},
	};
}

function authedEvent(url?: string) {
	return makeEvent({ url, locals: { user: { id: 'test-user', role: 'admin' } } });
}

function unauthedEvent(url?: string) {
	return makeEvent({ url, locals: {} });
}

/** Assert every key from `successKeys` exists in `degraded` */
function assertShapeMatch(successKeys: string[], degraded: Record<string, unknown>) {
	for (const key of successKeys) {
		expect(degraded, `degraded response missing key: ${key}`).toHaveProperty(key);
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. GET /api/cache/stats
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/cache/stats — degraded-shape contract', () => {
	let GET: (typeof import('../../src/routes/api/cache/stats/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../../src/routes/api/cache/stats/+server.js');
		GET = mod.GET;
	});

	it('degraded path returns same top-level keys as success (no message/error)', async () => {
		// Force Redis to throw
		mockGetRedis.mockImplementation(() => { throw new Error('Connection refused'); });

		const res = await GET(authedEvent('/api/cache/stats') as never);
		expect(res.status).toBe(200);
		const body = await res.json();

		// Must have success + data (same as success path)
		expect(body).toHaveProperty('success', false);
		expect(body).toHaveProperty('data');
		expect(body).toHaveProperty('degraded', true);

		// Must NOT have message/error (removed in this pass)
		expect(body).not.toHaveProperty('message');
		expect(body).not.toHaveProperty('error');

		// data sub-keys must all exist with safe defaults
		expect(body.data).toHaveProperty('redis');
		expect(body.data).toHaveProperty('template');
		expect(body.data).toHaveProperty('export');
		expect(body.data).toHaveProperty('llm');
		expect(body.data).toHaveProperty('memory');
		expect(body.data).toHaveProperty('metrics');
		expect(body.data.redis.connected).toBe(false);
		expect(body.data.redis.totalKeys).toBe(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. GET /api/cache/exact-match/stats
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/cache/exact-match/stats — degraded-shape contract', () => {
	let GET: (typeof import('../../src/routes/api/cache/exact-match/stats/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../../src/routes/api/cache/exact-match/stats/+server.js');
		GET = mod.GET;
	});

	it('degraded path has timestamp and no error key', async () => {
		mockGetExactMatchStats.mockRejectedValue(new Error('Redis down'));

		const res = await GET(authedEvent('/api/cache/exact-match/stats') as never);
		expect(res.status).toBe(200);
		const body = await res.json();

		expect(body).toHaveProperty('success', false);
		expect(body).toHaveProperty('stats');
		expect(body).toHaveProperty('timestamp');
		expect(body).toHaveProperty('degraded', true);
		expect(body).not.toHaveProperty('error');
		expect(body.stats.totalKeys).toBe(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. GET /api/citations
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/citations — degraded-shape contract', () => {
	let GET: (typeof import('../../src/routes/api/citations/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		// Make the select chain throw on final resolution
		mockWithCache.mockRejectedValue(new Error('DB down'));
		const mod = await import('../../src/routes/api/citations/+server.js');
		GET = mod.GET;
	});

	it('degraded path returns citations array + cache key, no error key', async () => {
		mockDbSelect.mockImplementation(() => {
			throw new Error('DB offline');
		});

		const res = await GET(authedEvent('/api/citations') as never);
		const body = await res.json();

		expect(body).toHaveProperty('success', false);
		expect(body).toHaveProperty('citations');
		expect(body).toHaveProperty('degraded', true);
		expect(Array.isArray(body.citations)).toBe(true);
		expect(body.citations).toHaveLength(0);
		// error key removed
		expect(body).not.toHaveProperty('error');
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. GET /api/ai/stats
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/ai/stats — degraded-shape contract', () => {
	let GET: (typeof import('../../src/routes/api/ai/stats/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../../src/routes/api/ai/stats/+server.js');
		GET = mod.GET;
	});

	it('401 response has same keys as success (no extra error key)', async () => {
		const res = await GET(unauthedEvent('/api/ai/stats') as never);
		expect(res.status).toBe(401);
		const body = await res.json();

		const expectedKeys = [
			'activeChats', 'ragQueries', 'documentsAnalyzed', 'citationsFound',
			'casesProcessed', 'assistantSessions', 'embeddingModel', 'llmModel', 'ollamaStatus',
		];
		for (const key of expectedKeys) {
			expect(body, `Missing key: ${key}`).toHaveProperty(key);
		}
		// error key was removed
		expect(body).not.toHaveProperty('error');
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. GET /api/cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/cases — degraded-shape contract', () => {
	let GET: (typeof import('../../src/routes/api/cases/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../../src/routes/api/cases/+server.js');
		GET = mod.GET;
	});

	it('degraded path wraps in { success, data, timestamp } same as success', async () => {
		// Make $withCache throw to trigger catch
		mockWithCache.mockRejectedValue(new Error('DB timeout'));

		const res = await GET(authedEvent('/api/cases') as never);
		const body = await res.json();

		// Must have the same wrapper as success path
		expect(body).toHaveProperty('success', false);
		expect(body).toHaveProperty('data');
		expect(body).toHaveProperty('timestamp');
		expect(body).toHaveProperty('degraded', true);

		// data must contain cases + pagination
		expect(body.data).toHaveProperty('cases');
		expect(body.data).toHaveProperty('pagination');
		expect(Array.isArray(body.data.cases)).toBe(true);
		expect(body.data.cases).toHaveLength(0);
		expect(body.data.pagination.hasMore).toBe(false);
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. GET /api/infrastructure/status
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/infrastructure/status — degraded-shape contract', () => {
	let GET: (typeof import('../../src/routes/api/infrastructure/status/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../../src/routes/api/infrastructure/status/+server.js');
		GET = mod.GET;
	});

	it('outer catch returns all top-level keys with safe defaults', async () => {
		// Force isCudaAvailable (which runs outside individual catches) to throw
		mockIsCudaAvailable.mockImplementation(() => { throw new Error('DLL not found'); });

		const res = await GET({ locals: { user: { id: '1', role: 'admin' } } } as never);
		expect(res.status).toBe(200);
		const body = await res.json();

		const requiredKeys = [
			'tiers', 'inference', 'gpu', 'services', 'cache',
			'queues', 'dispatch', 'inferenceLog', 'runtimeConfig',
			'latencyMs', 'ts',
		];
		assertShapeMatch(requiredKeys, body);
		expect(body).toHaveProperty('degraded', true);

		// Nested defaults
		expect(body.services.postgres).toBe(false);
		expect(body.gpu.cudaAddon).toBe(false);
		expect(body.inference.tensorrt.available).toBe(false);
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. GET /api/yorha/analytics
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/yorha/analytics — degraded-shape contract', () => {
	let GET: (typeof import('../../src/routes/api/yorha/analytics/+server.js'))['GET'];

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../../src/routes/api/yorha/analytics/+server.js');
		GET = mod.GET;
	});

	it('outer catch returns same shape as success with zero defaults', async () => {
		// Force checkETag (called after Promise.all) to throw — triggers outer catch
		const { checkETag } = await import('$lib/server/middleware/cache-headers.js');
		vi.mocked(checkETag).mockImplementation(() => { throw new Error('Unexpected'); });

		const event = authedEvent('/api/yorha/analytics');
		const res = await GET(event as never);
		expect(res.status).toBe(200);
		const body = await res.json();

		const requiredKeys = [
			'period', 'cases', 'evidence', 'errorBrain',
			'personsOfInterest', 'system', 'generatedAt',
		];
		assertShapeMatch(requiredKeys, body);
		expect(body).toHaveProperty('degraded', true);

		// Nested zero defaults
		expect(body.cases.total).toBe(0);
		expect(body.evidence.total).toBe(0);
		expect(body.errorBrain.totalErrors).toBe(0);
		expect(body.personsOfInterest.total).toBe(0);
	});
});
