/**
 * Test file 9: Cache CRUD, Cache Invalidate, Cache LLM Clean/Stats,
 * Cache Metrics, Cache Recent-Queries, Cache Set, Recommendations,
 * Recommendations Metrics/Track, Docs, ML Cluster Status, System Env
 *
 * Routes covered (13):
 *   /api/cache (GET/POST/DELETE)
 *   /api/cache/invalidate (POST)
 *   /api/cache/llm/clean (POST)
 *   /api/cache/llm/stats (GET)
 *   /api/cache/metrics (GET)
 *   /api/cache/recent-queries (GET/POST)
 *   /api/cache/set (POST)
 *   /api/recommendations (GET/POST)
 *   /api/recommendations/metrics (GET)
 *   /api/recommendations/track (POST)
 *   /api/docs (GET)
 *   /api/ml/cluster-status (GET/POST)
 *   /api/system/env (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared UUID ──
const TEST_USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

// ── Redis mock (in-memory store) ──
const mockRedisStore: Record<string, string> = {};
const mockSortedSet: Array<{ member: string; score: number }> = [];

const redisMock = {
	get: vi.fn(async (k: string) => mockRedisStore[k] ?? null),
	set: vi.fn(async (k: string, v: string, ...args: any[]) => {
		mockRedisStore[k] = v;
		return 'OK';
	}),
	setex: vi.fn(async (k: string, _ttl: number, v: string) => {
		mockRedisStore[k] = v;
		return 'OK';
	}),
	del: vi.fn(async (...keys: string[]) => {
		let count = 0;
		for (const k of keys) {
			if (mockRedisStore[k] !== undefined) {
				delete mockRedisStore[k];
				count++;
			}
		}
		return count;
	}),
	keys: vi.fn(async (_p: string) => Object.keys(mockRedisStore)),
	dbsize: vi.fn(async () => Object.keys(mockRedisStore).length),
	ping: vi.fn(async () => 'PONG'),
	flushdb: vi.fn(async () => 'OK'),
	info: vi.fn(async (_section: string) => {
		if (_section === 'memory') return 'used_memory:1048576\nused_memory_human:1M\n';
		return 'keyspace_hits:100\nkeyspace_misses:20\ntotal_connections_received:50\n';
	}),
	zadd: vi.fn(async (_key: string, score: number, member: string) => {
		mockSortedSet.push({ member, score });
		return 1;
	}),
	zrevrange: vi.fn(async (_key: string, _start: number, _stop: number, _ws?: string) => {
		const sorted = [...mockSortedSet].sort((a, b) => b.score - a.score);
		const result: string[] = [];
		for (const entry of sorted) {
			result.push(entry.member, String(entry.score));
		}
		return result;
	}),
	zremrangebyrank: vi.fn(async () => 0),
};

vi.mock('$lib/server/redis.js', () => ({
	redis: redisMock,
	getRedis: () => redisMock,
	redisPool: { getConnection: () => redisMock },
}));

// ── DB mock (Drizzle chain) ──
const mockDbRows: any[] = [];
const mockChain = {
	select: vi.fn(() => mockChain),
	from: vi.fn(() => mockChain),
	where: vi.fn(() => mockChain),
	orderBy: vi.fn(() => mockChain),
	limit: vi.fn(() => mockChain),
	offset: vi.fn(() => mockChain),
	then: vi.fn((resolve: any) => resolve(mockDbRows)),
	[Symbol.iterator]: function* () { yield* mockDbRows; },
};
vi.mock('$lib/server/db/client', () => ({
	db: {
		select: vi.fn(() => mockChain),
		execute: vi.fn(async () => mockDbRows),
	},
}));

// ── Schema mocks ──
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	documentTopics: { topicId: 'topic_id', documentId: 'document_id', membershipProbability: 'membership_probability' },
	legalDocuments: { id: 'id' },
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((...a: any[]) => a),
	desc: vi.fn((c: any) => c),
	sql: vi.fn((s: any) => s),
}));

// ── LLM cache mock ──
vi.mock('$lib/server/ai/llm-cache.js', () => ({
	cleanExpiredCache: vi.fn(async () => ({ deleted: 7 })),
}));

// ── Qdrant mock ──
vi.mock('$lib/server/vector/qdrant-manager.js', () => {
	const mockClient = {
		getCollection: vi.fn(async () => ({
			points_count: 42,
			status: 'green',
			config: { params: { vectors: { size: 768 } } },
		})),
		scroll: vi.fn(async (_col: string, opts: any) => {
			if (opts?.filter) return { points: [] };
			return {
				points: [
					{ payload: { query: 'test query...', model: 'gemma', cachedAt: '2026-03-01', expiresAt: '2026-04-01' } },
				],
			};
		}),
	};
	return {
		QdrantManager: vi.fn(() => ({
			client: mockClient,
			collections: { llm_cache: 'llm_cache' },
		})),
		qdrant: { client: mockClient },
	};
});

// ── Recommendation modules ──
vi.mock('$lib/server/ml/multi-modal-ranker.js', () => ({
	rankCombinedResults: vi.fn(async () => []),
}));
vi.mock('$lib/server/ml/user-history.js', () => ({
	UserHistoryTracker: vi.fn(() => ({
		getUserTopicPreferences: vi.fn(async () => [{ topic: 'contract', score: 0.9 }]),
		getRecentInteractions: vi.fn(async () => [{ type: 'view', docId: 'd1' }]),
		getInteractionStats: vi.fn(async () => ({ totalViews: 10 })),
		trackInteraction: vi.fn(async () => {}),
		recordView: vi.fn(async () => {}),
		recordClick: vi.fn(async () => {}),
		recordSave: vi.fn(async () => {}),
		recordShare: vi.fn(async () => {}),
		recordDismiss: vi.fn(async () => {}),
	})),
}));
vi.mock('$lib/server/auth-helpers.js', () => ({
	requireAuth: vi.fn(async (event: any) => ({
		user: event.locals.user || { id: TEST_USER_ID, role: 'admin' },
	})),
}));
vi.mock('$lib/server/ml/recommendation-metrics.js', () => ({
	recommendationMetrics: {
		getSummary: vi.fn(async () => ({ totalRecommendations: 100, clickRate: 0.35 })),
		getExportData: vi.fn(async () => ({ hourly: [], abTests: [] })),
		recordRecommendation: vi.fn(),
	},
}));
vi.mock('$lib/server/ml/recommendation-glyph.js', () => ({
	encodeRecommendations: vi.fn(() => []),
	glyphsToBase64: vi.fn(() => ''),
}));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({
	generateEmbeddings: vi.fn(async () => [[0.1, 0.2, 0.3]]),
}));
vi.mock('$lib/server/graph/graph-centrality.js', () => ({
	fetchGraphDocuments: vi.fn(async () => []),
	computeCentralityForNodes: vi.fn(async () => ({})),
}));

// ── ML cluster status mocks ──
vi.mock('$lib/server/ml/topic-clustering-worker.js', () => ({
	getClusteringStatus: vi.fn(() => ({
		jobId: 'job-1',
		status: 'completed',
		startTime: 1711700000000,
		endTime: 1711700060000,
		documentsProcessed: 50,
		silhouetteScore: 0.72,
		cacheInvalidated: true,
		error: null,
	})),
	startClusteringJob: vi.fn(async () => 'job-2'),
}));

// ── API registry mock ──
vi.mock('$lib/server/api-registry.js', () => {
	const endpoints = [
		{ path: '/api/cases', method: 'GET', category: 'Cases', status: 'active', description: 'List cases' },
		{ path: '/api/auth/me', method: 'GET', category: 'Auth', status: 'active', description: 'Current user' },
		{ path: '/api/legacy/old', method: 'GET', category: 'Legacy', status: 'deprecated', description: 'Old endpoint' },
	];
	return {
		API_REGISTRY: endpoints,
		getEndpointsByCategory: vi.fn((cat: string) => endpoints.filter(e => e.category === cat)),
		getCategories: vi.fn(() => ['Cases', 'Auth', 'Legacy']),
		searchEndpoints: vi.fn((q: string) => endpoints.filter(e => e.description.toLowerCase().includes(q.toLowerCase()))),
		getRegistrySummary: vi.fn(() => ({ total: 3, active: 2, deprecated: 1 })),
	};
});

// ── Helpers ──
function makeEvent(
	method: string,
	url: string,
	opts: { body?: any; locals?: any; params?: any } = {}
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
	};
}

function jsonBody(response: Response) {
	return response.json();
}

beforeEach(() => {
	vi.clearAllMocks();
	// Clear in-memory stores
	Object.keys(mockRedisStore).forEach(k => delete mockRedisStore[k]);
	mockSortedSet.length = 0;
	mockDbRows.length = 0;
});

// ─────────────────────────────────────────────────────────
// /api/cache (GET)
// ─────────────────────────────────────────────────────────
describe('/api/cache (GET)', () => {
	it('returns cache stats when action=stats', async () => {
		const { GET } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache?action=stats');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.stats).toHaveProperty('memory');
		expect(data.stats).toHaveProperty('redis');
		expect(data.stats).toHaveProperty('combined');
	});

	it('returns health status when action=health', async () => {
		const { GET } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache?action=health');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.health.redis.status).toBe('healthy');
		expect(data.health.overall).toBe('healthy');
	});

	it('returns health degraded when redis ping fails', async () => {
		redisMock.ping.mockRejectedValueOnce(new Error('down'));
		const { GET } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache?action=health');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.health.redis.status).toBe('unavailable');
		expect(data.health.overall).toBe('degraded');
	});

	it('returns cached:false when key not found', async () => {
		const { GET } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache?key=nonexistent');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.cached).toBe(false);
	});

	it('returns 400 for missing action/key', async () => {
		const { GET } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache');
		const res = await GET(event as any);
		expect(res.status).toBe(400);
	});
});

// ─────────────────────────────────────────────────────────
// /api/cache (POST)
// ─────────────────────────────────────────────────────────
describe('/api/cache (POST)', () => {
	it('stores a value in cache', async () => {
		const { POST } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache', {
			body: { key: 'test-key', value: { data: 'hello' } },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.key).toBe('test-key');
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache', {
			body: { key: 'k', value: 'v' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for invalid body', async () => {
		const { POST } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache', {
			body: { value: 'no key' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});
});

// ─────────────────────────────────────────────────────────
// /api/cache (DELETE)
// ─────────────────────────────────────────────────────────
describe('/api/cache (DELETE)', () => {
	it('clears all cache when action=clear', async () => {
		const { DELETE } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('DELETE', 'http://localhost/api/cache?action=clear');
		const res = await DELETE(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.message).toBe('Cache cleared');
	});

	it('deletes a specific key', async () => {
		const { DELETE } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('DELETE', 'http://localhost/api/cache?key=some-key');
		const res = await DELETE(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.key).toBe('some-key');
	});

	it('returns 401 for unauthenticated', async () => {
		const { DELETE } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('DELETE', 'http://localhost/api/cache?action=clear', {
			locals: { user: null },
		});
		const res = await DELETE(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for missing action/key', async () => {
		const { DELETE } = await import('../src/routes/api/cache/+server.js');
		const event = makeEvent('DELETE', 'http://localhost/api/cache');
		const res = await DELETE(event as any);
		expect(res.status).toBe(400);
	});
});

// ─────────────────────────────────────────────────────────
// /api/cache/invalidate (POST)
// ─────────────────────────────────────────────────────────
describe('/api/cache/invalidate (POST)', () => {
	it('invalidates keys matching pattern', async () => {
		mockRedisStore['template:a'] = '1';
		mockRedisStore['template:b'] = '2';
		const { POST } = await import('../src/routes/api/cache/invalidate/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/invalidate', {
			body: { pattern: 'template:*' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.invalidated).toBeGreaterThanOrEqual(0);
	});

	it('rejects non-admin users', async () => {
		const { POST } = await import('../src/routes/api/cache/invalidate/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/invalidate', {
			body: { pattern: 'template:*' },
			locals: { user: { id: TEST_USER_ID, role: 'user' } },
		});
		await expect(POST(event as any)).rejects.toThrow();
	});

	it('rejects disallowed prefix', async () => {
		const { POST } = await import('../src/routes/api/cache/invalidate/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/invalidate', {
			body: { pattern: 'secret:*' },
		});
		await expect(POST(event as any)).rejects.toThrow();
	});

	it('returns 0 invalidated when no keys match', async () => {
		redisMock.keys.mockResolvedValueOnce([]);
		const { POST } = await import('../src/routes/api/cache/invalidate/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/invalidate', {
			body: { pattern: 'template:xyz' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.invalidated).toBe(0);
	});
});

// ─────────────────────────────────────────────────────────
// /api/cache/llm/clean (POST)
// ─────────────────────────────────────────────────────────
describe('/api/cache/llm/clean (POST)', () => {
	it('cleans expired cache entries', async () => {
		const { POST } = await import('../src/routes/api/cache/llm/clean/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/llm/clean');
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.deleted).toBe(7);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/cache/llm/clean/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/llm/clean', {
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/cache/llm/stats (GET)
// ─────────────────────────────────────────────────────────
describe('/api/cache/llm/stats (GET)', () => {
	it('returns LLM cache statistics', async () => {
		const { GET } = await import('../src/routes/api/cache/llm/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache/llm/stats');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.stats.totalEntries).toBe(42);
		expect(data.stats.vectorsDim).toBe(768);
		expect(data.stats.recentEntries).toHaveLength(1);
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/cache/llm/stats/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache/llm/stats', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/cache/metrics (GET)
// ─────────────────────────────────────────────────────────
describe('/api/cache/metrics (GET)', () => {
	it('returns cache performance metrics', async () => {
		const { GET } = await import('../src/routes/api/cache/metrics/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache/metrics');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data).toHaveProperty('retrieval');
		expect(data).toHaveProperty('embedding');
		expect(data).toHaveProperty('memory');
		expect(data).toHaveProperty('performance');
		expect(data.retrieval.hits).toBe(100);
		expect(data.retrieval.misses).toBe(20);
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/cache/metrics/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache/metrics', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});

	it('handles Redis unavailable gracefully', async () => {
		redisMock.info.mockRejectedValueOnce(new Error('down'));
		redisMock.info.mockRejectedValueOnce(new Error('down'));
		redisMock.dbsize.mockRejectedValueOnce(new Error('down'));
		const { GET } = await import('../src/routes/api/cache/metrics/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache/metrics');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.retrieval.hits).toBe(0);
		expect(data.memory.totalCachedItems).toBe(0);
	});
});

// ─────────────────────────────────────────────────────────
// /api/cache/recent-queries (GET/POST)
// ─────────────────────────────────────────────────────────
describe('/api/cache/recent-queries (GET)', () => {
	it('returns recent query list', async () => {
		mockSortedSet.push({ member: JSON.stringify({ query: 'test', cached: true, responseTime: 50 }), score: Date.now() });
		const { GET } = await import('../src/routes/api/cache/recent-queries/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache/recent-queries');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBeGreaterThanOrEqual(1);
		expect(data[0].query).toBe('test');
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/cache/recent-queries/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/cache/recent-queries', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

describe('/api/cache/recent-queries (POST)', () => {
	it('records a new query', async () => {
		const { POST } = await import('../src/routes/api/cache/recent-queries/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/recent-queries', {
			body: { query: 'contract breach', cached: false, responseTime: 200 },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(redisMock.zadd).toHaveBeenCalled();
	});

	it('returns 400 for missing query field', async () => {
		const { POST } = await import('../src/routes/api/cache/recent-queries/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/recent-queries', {
			body: { cached: true },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/cache/recent-queries/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/recent-queries', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/cache/set (POST)
// ─────────────────────────────────────────────────────────
describe('/api/cache/set (POST)', () => {
	it('sets a cache key in Redis', async () => {
		const { POST } = await import('../src/routes/api/cache/set/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/set', {
			body: { key: 'mykey', value: { x: 1 }, ttl: 300, namespace: 'test' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/cache/set/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/set', {
			body: { key: 'k', value: 'v' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for missing key', async () => {
		const { POST } = await import('../src/routes/api/cache/set/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/cache/set', {
			body: { value: 'no key' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});
});

// ─────────────────────────────────────────────────────────
// /api/recommendations (GET)
// ─────────────────────────────────────────────────────────
describe('/api/recommendations (GET)', () => {
	it('returns user interaction history', async () => {
		const { GET } = await import('../src/routes/api/recommendations/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/recommendations');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.data.topicPreferences).toHaveLength(1);
		expect(data.data.recentInteractions).toHaveLength(1);
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/recommendations/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/recommendations', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/recommendations (POST)
// ─────────────────────────────────────────────────────────
describe('/api/recommendations (POST)', () => {
	it('enqueues a recommendation job', async () => {
		const { POST } = await import('../src/routes/api/recommendations/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/recommendations', {
			body: { query: 'Find contract breach precedents', topK: 5 },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.data.jobId).toBeTruthy();
		expect(data.data.status).toBe('processing');
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/recommendations/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/recommendations', {
			body: { query: 'test' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 400 for missing query', async () => {
		const { POST } = await import('../src/routes/api/recommendations/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/recommendations', {
			body: { topK: 5 },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('handles Redis unavailable gracefully', async () => {
		redisMock.setex.mockRejectedValueOnce(new Error('Redis down'));
		const { POST } = await import('../src/routes/api/recommendations/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/recommendations', {
			body: { query: 'test query' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.data.jobId).toBeNull();
	});
});

// ─────────────────────────────────────────────────────────
// /api/recommendations/metrics (GET)
// ─────────────────────────────────────────────────────────
describe('/api/recommendations/metrics (GET)', () => {
	it('returns summary by default', async () => {
		const { GET } = await import('../src/routes/api/recommendations/metrics/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/recommendations/metrics');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.totalRecommendations).toBe(100);
		expect(data.clickRate).toBe(0.35);
	});

	it('returns export data when export=true', async () => {
		const { GET } = await import('../src/routes/api/recommendations/metrics/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/recommendations/metrics?export=true&period=24h');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data).toHaveProperty('hourly');
		expect(data).toHaveProperty('abTests');
	});

	it('returns 401 for unauthenticated', async () => {
		const { GET } = await import('../src/routes/api/recommendations/metrics/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/recommendations/metrics', {
			locals: { user: null },
		});
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/recommendations/track (POST)
// ─────────────────────────────────────────────────────────
describe('/api/recommendations/track (POST)', () => {
	it('tracks a view interaction', async () => {
		mockDbRows.length = 0;
		const { POST } = await import('../src/routes/api/recommendations/track/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/recommendations/track', {
			body: { interactionType: 'view', documentId: 'doc-123', durationSeconds: 30 },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
	});

	it('tracks a click interaction', async () => {
		mockDbRows.length = 0;
		const { POST } = await import('../src/routes/api/recommendations/track/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/recommendations/track', {
			body: { interactionType: 'click', documentId: 'doc-456', recommendationId: 'rec-1' },
		});
		const res = await POST(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
	});

	it('returns 400 for invalid interactionType', async () => {
		const { POST } = await import('../src/routes/api/recommendations/track/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/recommendations/track', {
			body: { interactionType: 'invalid', documentId: 'doc-1' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 for missing documentId', async () => {
		const { POST } = await import('../src/routes/api/recommendations/track/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/recommendations/track', {
			body: { interactionType: 'view' },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/recommendations/track/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/recommendations/track', {
			body: { interactionType: 'view', documentId: 'doc-1' },
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/docs (GET)
// ─────────────────────────────────────────────────────────
describe('/api/docs (GET)', () => {
	it('returns all endpoints', async () => {
		const { GET } = await import('../src/routes/api/docs/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/docs');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.count).toBe(3);
		expect(data.categories).toContain('Cases');
		expect(data.summary.total).toBe(3);
	});

	it('filters by category', async () => {
		const { GET } = await import('../src/routes/api/docs/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/docs?category=Auth');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.endpoints.length).toBe(1);
		expect(data.endpoints[0].path).toBe('/api/auth/me');
	});

	it('searches endpoint descriptions', async () => {
		const { GET } = await import('../src/routes/api/docs/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/docs?q=cases');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.endpoints.length).toBeGreaterThanOrEqual(1);
	});

	it('filters by status', async () => {
		const { GET } = await import('../src/routes/api/docs/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/docs?status=deprecated');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.endpoints.every((e: any) => e.status === 'deprecated')).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ml/cluster-status (GET)
// ─────────────────────────────────────────────────────────
describe('/api/ml/cluster-status (GET)', () => {
	it('returns clustering status and statistics', async () => {
		mockDbRows.push(
			{ topicId: 1, documentId: 'd1', membershipProbability: 0.8 },
			{ topicId: 1, documentId: 'd2', membershipProbability: 0.7 },
			{ topicId: 2, documentId: 'd3', membershipProbability: 0.9 },
		);
		const { GET } = await import('../src/routes/api/ml/cluster-status/+server.js');
		const event = makeEvent('GET', 'http://localhost/api/ml/cluster-status');
		const res = await GET(event as any);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.job.status).toBe('completed');
		expect(data.job.silhouetteScore).toBe(0.72);
		expect(data.statistics.topicCount).toBe(15);
	});
});

// ─────────────────────────────────────────────────────────
// /api/ml/cluster-status (POST)
// ─────────────────────────────────────────────────────────
describe('/api/ml/cluster-status (POST)', () => {
	it('starts a clustering job', async () => {
		const { POST } = await import('../src/routes/api/ml/cluster-status/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ml/cluster-status', {
			body: { force: true },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(202);
		const data = await jsonBody(res);
		expect(data.success).toBe(true);
		expect(data.job.id).toBe('job-2');
		expect(data.job.status).toBe('started');
	});

	it('returns 401 for unauthenticated', async () => {
		const { POST } = await import('../src/routes/api/ml/cluster-status/+server.js');
		const event = makeEvent('POST', 'http://localhost/api/ml/cluster-status', {
			body: {},
			locals: { user: null },
		});
		const res = await POST(event as any);
		expect(res.status).toBe(401);
	});
});

// ─────────────────────────────────────────────────────────
// /api/system/env (GET)
// ─────────────────────────────────────────────────────────
describe('/api/system/env (GET)', () => {
	it('returns sanitized env flags', async () => {
		const { GET } = await import('../src/routes/api/system/env/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/system/env') as any);
		const data = await jsonBody(res);
		expect(data).toHaveProperty('timestamp');
		expect(data).toHaveProperty('has');
		expect(typeof data.has.REDIS_URL).toBe('boolean');
		expect(typeof data.has.DATABASE_URL).toBe('boolean');
		expect(data).toHaveProperty('nodeVersion');
		expect(data).toHaveProperty('environment');
	});

	it('does not expose secret values', async () => {
		const { GET } = await import('../src/routes/api/system/env/+server.js');
		const res = await GET(makeEvent('GET', 'http://localhost/api/system/env') as any);
		const text = JSON.stringify(await jsonBody(res));
		// Ensure no secret values leaked — only boolean flags
		expect(text).not.toMatch(/password|secret_key_value|bearer/i);
	});
});
