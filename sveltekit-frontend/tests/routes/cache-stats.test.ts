/**
 * Unit tests for GET /api/admin/cache-stats
 *
 * Cases covered:
 *  - 401 non-admin (no user)
 *  - 401 non-admin (user without admin role)
 *  - 200 success — valid l1_redis + samples shape
 *  - 200 degraded — upstream Redis failure returns empty-valid shape, no error leak
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Static module mocks ───────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { mockGetExactMatchStats, mockGetRedis } = vi.hoisted(() => ({
	mockGetExactMatchStats: vi.fn(),
	mockGetRedis: vi.fn(),
}));

vi.mock('$lib/server/cache/redis-exact-match.js', () => ({
	getExactMatchStats: (...args: unknown[]) => mockGetExactMatchStats(...args),
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: (...args: unknown[]) => mockGetRedis(...args),
}));

// api-response uses json from @svelteks/kit — let it run normally in tests
vi.mock('$lib/server/api-response.js', async (importOriginal) => {
	const real = await importOriginal<typeof import('$lib/server/api-response.js')>();
	return real;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

import { makeAuthEvent, makeEvent, responseJson } from '../helpers/route-test-utils.js';

function makeRedis(overrides: Partial<{
	keys: () => Promise<string[]>;
	info: (section: string) => Promise<string>;
	get: (key: string) => Promise<string | null>;
	ttl: (key: string) => Promise<number>;
}> = {}) {
	return {
		keys: vi.fn(async () => ['llm:abc123']),
		info: vi.fn(async (_section: string) =>
			'keyspace_hits:200\nkeyspace_misses:50\nused_memory:2097152'
		),
		get: vi.fn(async () => 'cached-response'),
		ttl: vi.fn(async () => 3600),
		...overrides,
	};
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/admin/cache-stats', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetExactMatchStats.mockResolvedValue({ totalKeys: 10, memoryUsedBytes: 2097152 });
		mockGetRedis.mockReturnValue(makeRedis());
	});

	it('returns 401 when user is not authenticated', async () => {
		const { GET } = await import('../../src/routes/api/admin/cache-stats/+server.js');
		const event = makeEvent({ url: '/api/admin/cache-stats' });
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 401 when user does not have admin role', async () => {
		const { GET } = await import('../../src/routes/api/admin/cache-stats/+server.js');
		const event = makeAuthEvent({ url: '/api/admin/cache-stats', role: 'user' });
		const res = await GET(event as any);
		expect(res.status).toBe(401);
	});

	it('returns 200 with valid cache stats shape on success', async () => {
		const { GET } = await import('../../src/routes/api/admin/cache-stats/+server.js');
		const event = makeAuthEvent({ url: '/api/admin/cache-stats', role: 'admin' });
		const res = await GET(event as any);
		expect(res.status).toBe(200);

		const body = await responseJson<Record<string, unknown>>(res);
		expect(body.success).toBe(true);
		expect(body).toHaveProperty('timestamp');
		expect(body).toHaveProperty('l1_redis');
		expect(body).toHaveProperty('samples');
		expect(body).toHaveProperty('performance');
		expect(body).toHaveProperty('recommendations');

		const l1 = body.l1_redis as Record<string, unknown>;
		expect(typeof l1.hitRate).toBe('string');
		expect(typeof l1.totalKeys).toBe('number');
	});

	it('returns 200 degraded shape (no error leak) when Redis is unavailable', async () => {
		mockGetRedis.mockReturnValue(makeRedis({
			keys: async () => { throw new Error('ECONNREFUSED — do not leak this'); },
		}));

		const { GET } = await import('../../src/routes/api/admin/cache-stats/+server.js');
		const event = makeAuthEvent({ url: '/api/admin/cache-stats', role: 'admin' });
		const res = await GET(event as any);

		// Must be 200 — GET degraded-response contract
		expect(res.status).toBe(200);

		const body = await responseJson<Record<string, unknown>>(res);
		// degraded: true injected by degradedJson()
		expect(body.degraded).toBe(true);
		// Internal error must NOT be present
		expect(body.error).toBeUndefined();
		// All top-level success keys must still exist
		expect(body).toHaveProperty('l1_redis');
		expect(body).toHaveProperty('samples');
		expect(body).toHaveProperty('performance');
		expect(body).toHaveProperty('recommendations');
	});
});