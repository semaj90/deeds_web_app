// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const mocks = vi.hoisted(() => ({
	chatRateCheck: vi.fn(() => ({ allowed: true, resetTime: Date.now() + 60_000 })),
	getVectorCache: vi.fn(async () => ({ entry: null })),
	generateEmbeddings: vi.fn(async () => ({
		vectors: [Array.from({ length: 768 }, () => 0.01)],
		source: 'grpc',
		cacheHit: false,
		attempts: [{ transport: 'grpc', status: 'success', detail: 'ok', durationMs: 5 }],
	})),
	embedText: vi.fn(async () => new Float32Array(Array.from({ length: 768 }, () => 0.01))),
	sparseHybridSearch: vi.fn(async () => ({
		results: [],
		metadata: { searchType: 'hybrid-rrf' },
	})),
	sectionFilteredSearch: vi.fn(async () => ({ results: [], metadata: {} })),
	computeTFIDF: vi.fn(() => []),
	setEmbeddingCache: vi.fn(async () => {}),
	setVectorCache: vi.fn(async () => {}),
	setCache: vi.fn(async () => {}),
	getFromMemoryCache: vi.fn(() => ({ found: false })),
	getFromRedisCache: vi.fn(async () => null),
	getCaseVersion: vi.fn(async () => 0),
	recordSearchQuery: vi.fn(),
	recordQueryLog: vi.fn(),
	applyQloraBoost: vi.fn(async () => 0),
}));

vi.mock('$lib/server/middleware/rate-limiter.js', () => ({
	chatRateLimiter: {
		check: (...args: unknown[]) => mocks.chatRateCheck(...args),
	},
}));

vi.mock('$lib/server/api/response-helper.js', () => ({
	apiResponses: {
		badRequest: (message: string) => new Response(JSON.stringify({ error: message }), { status: 400 }),
		badGateway: (message: string) => new Response(JSON.stringify({ error: message }), { status: 502 }),
		serverError: (message: string) => new Response(JSON.stringify({ error: message }), { status: 500 }),
		serviceUnavailable: (message: string) => new Response(JSON.stringify({ error: message }), { status: 503 }),
	},
}));

vi.mock('$lib/server/vector-cache.js', () => ({
	getVectorCache: (...args: unknown[]) => mocks.getVectorCache(...args),
	setVectorCache: (...args: unknown[]) => mocks.setVectorCache(...args),
	getEmbeddingCache: vi.fn(async () => null),
	setEmbeddingCache: (...args: unknown[]) => mocks.setEmbeddingCache(...args),
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	generateEmbeddings: (...args: unknown[]) => mocks.generateEmbeddings(...args),
}));

vi.mock('$lib/server/embedding/embed.js', () => ({
	embedText: (...args: unknown[]) => mocks.embedText(...args),
}));

vi.mock('$lib/server/observability/langfuse.js', () => ({
	traceEmbedding: async (_query: string, _model: string, fn: () => Promise<Float32Array>) => fn(),
}));

vi.mock('$lib/server/ollama.js', () => ({
	getChatModelKeepAlive: () => '2m',
	ollamaFetch: vi.fn(),
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
	qdrant: {
		sparseHybridSearch: (...args: unknown[]) => mocks.sparseHybridSearch(...args),
		sectionFilteredSearch: (...args: unknown[]) => mocks.sectionFilteredSearch(...args),
	},
}));

vi.mock('$lib/server/retrieval/tfidf-scorer.js', () => ({
	computeTFIDF: (...args: unknown[]) => mocks.computeTFIDF(...args),
}));

vi.mock('$lib/server/cache-keys.js', () => ({
	retrievalKey: {
		forQuery: vi.fn(() => 'retrieval:query'),
		global: vi.fn(() => 'retrieval:global'),
	},
	getCaseVersion: (...args: unknown[]) => mocks.getCaseVersion(...args),
	TTL: { RETRIEVAL: 300 },
}));

vi.mock('$lib/server/cache.js', () => ({
	setCache: (...args: unknown[]) => mocks.setCache(...args),
	getFromMemoryCache: (...args: unknown[]) => mocks.getFromMemoryCache(...args),
	getFromRedisCache: (...args: unknown[]) => mocks.getFromRedisCache(...args),
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: vi.fn(() => ({ get: vi.fn(), setex: vi.fn() })),
}));

vi.mock('$lib/server/analytics/search-analytics.js', () => ({
	recordSearchQuery: (...args: unknown[]) => mocks.recordSearchQuery(...args),
	recordQueryLog: (...args: unknown[]) => mocks.recordQueryLog(...args),
	recordChunkHits: vi.fn(),
	queryHash: vi.fn(() => 'hash'),
}));

vi.mock('$lib/server/production-logger.js', () => ({
	productionLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('$lib/server/retrieval/qlora-boost.js', () => ({
	applyQloraBoost: (...args: unknown[]) => mocks.applyQloraBoost(...args),
}));

describe('/api/rag/search', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				const collection = url.includes('legal_documents') ? 'legal_documents' : 'evidence_items';
				return new Response(
					JSON.stringify({
						result: [
							{
								id: `${collection}-1`,
								score: 0.91,
								payload: {
									content: `${collection} matching content`,
									title: `${collection} title`,
									source_type: 'document',
									chunk_id: `${collection}-chunk-1`,
								},
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			})
		);
	});

	it('keeps legal_documents and evidence_items on dense-only search even when use_hybrid is true', async () => {
		const { POST } = await import('./+server.js');
		const request = new Request('http://localhost/api/rag/search?dag=false', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'Miranda warning custodial interrogation', top_k: 3, min_score: 0.2, use_hybrid: true }),
		});

		const response = await POST({ request, url: new URL(request.url), locals: { user: { id: 'u1' } } } as any);
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body.diagnostics?.retrieval?.hybridUsed).toBe(false);
		expect(body.diagnostics?.retrieval?.collections).toEqual(['legal_documents', 'evidence_items']);
		expect(mocks.sparseHybridSearch).not.toHaveBeenCalled();
		expect(body.chunks).toHaveLength(2);
	});
});
