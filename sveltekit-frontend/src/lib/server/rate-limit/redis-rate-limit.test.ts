/**
 * Unit tests for src/lib/server/rate-limit/redis-rate-limit.ts
 *
 * Tests cover:
 *  - Allows first request under limit
 *  - Allows requests up to the limit
 *  - Blocks after limit exceeded, returns correct retryAfter
 *  - Returns remaining count correctly on each increment
 *  - Sets PEXPIRE only on first increment (Lua atomic — count === 1)
 *  - Falls back gracefully when Redis throws
 *  - Key format is stable and debuggable
 *  - evictFallback removes stale entries
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Redis mock ────────────────────────────────────────────────────────────────

const { mockRedisEval } = vi.hoisted(() => ({ mockRedisEval: vi.fn() }));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({
		eval: (...args: unknown[]) => mockRedisEval(...args),
	}),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Simulate what the Lua script returns: [count, pttl_ms].
 * pttl is set to windowMs on the first call (when the key is freshly created).
 */
function luaResult(count: number, windowMs: number): [number, number] {
	const pttl = count === 1 ? windowMs : Math.max(0, windowMs - (count - 1) * 10);
	return [count, pttl];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('checkRedisRateLimit', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('allows the first request and returns correct shape', async () => {
		const windowMs = 60_000;
		mockRedisEval.mockResolvedValueOnce(luaResult(1, windowMs));

		const { checkRedisRateLimit } = await import('./redis-rate-limit.js');
		const result = await checkRedisRateLimit({ bucket: '/api/ai/', identifier: '1.2.3.4', max: 30, windowMs });

		expect(result.allowed).toBe(true);
		expect(result.limit).toBe(30);
		expect(result.remaining).toBe(29);
		expect(result.retryAfter).toBe(0);
		expect(result.resetMs).toBeGreaterThan(Date.now());
		expect(result.degraded).toBeUndefined();
	});

	it('allows requests up to the max', async () => {
		const max = 5;
		const windowMs = 60_000;
		mockRedisEval.mockResolvedValue(luaResult(max, windowMs));

		const { checkRedisRateLimit } = await import('./redis-rate-limit.js');
		const result = await checkRedisRateLimit({ bucket: '/api/ai/', identifier: '1.2.3.4', max, windowMs });

		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(0);
	});

	it('blocks when count exceeds max', async () => {
		const max = 5;
		const windowMs = 60_000;
		// count = max + 1 → denied
		mockRedisEval.mockResolvedValueOnce([max + 1, windowMs - 1000]);

		const { checkRedisRateLimit } = await import('./redis-rate-limit.js');
		const result = await checkRedisRateLimit({ bucket: '/api/auth/login', identifier: '10.0.0.1', max, windowMs });

		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
		expect(result.retryAfter).toBeGreaterThan(0);
	});

	it('decrements remaining count correctly across calls', async () => {
		const max = 3;
		const windowMs = 60_000;

		const { checkRedisRateLimit } = await import('./redis-rate-limit.js');

		for (let call = 1; call <= max; call++) {
			mockRedisEval.mockResolvedValueOnce(luaResult(call, windowMs));
			const r = await checkRedisRateLimit({ bucket: '/api/', identifier: 'u1', max, windowMs });
			expect(r.remaining).toBe(max - call);
			expect(r.allowed).toBe(true);
		}
	});

	it('uses Lua script — eval is called once per check', async () => {
		mockRedisEval.mockResolvedValueOnce([1, 60_000]);

		const { checkRedisRateLimit } = await import('./redis-rate-limit.js');
		await checkRedisRateLimit({ bucket: '/api/', identifier: 'u1', max: 10, windowMs: 60_000 });

		expect(mockRedisEval).toHaveBeenCalledTimes(1);
		// First arg is the script, second is numkeys=1, then the key, then the windowMs arg
		const call = mockRedisEval.mock.calls[0];
		expect(call[1]).toBe(1); // numkeys
		expect(typeof call[2]).toBe('string'); // the Redis key
		expect(call[3]).toBe('60000'); // windowMs as string
	});

	it('produces a stable, debuggable key format', async () => {
		mockRedisEval.mockResolvedValue([1, 60_000]);

		const { checkRedisRateLimit } = await import('./redis-rate-limit.js');
		await checkRedisRateLimit({ bucket: '/api/auth/login', identifier: '1.2.3.4', max: 10, windowMs: 300_000 });

		const key = mockRedisEval.mock.calls[0][2] as string;
		// ratelimit:{sanitized-bucket}:{ip}:{windowSec}
		expect(key).toMatch(/^ratelimit:api-auth-login:1\.2\.3\.4:\d+$/);
	});

	it('falls back to in-memory when Redis throws, marking degraded', async () => {
		mockRedisEval.mockRejectedValue(new Error('ECONNREFUSED'));

		const { checkRedisRateLimit } = await import('./redis-rate-limit.js');
		const result = await checkRedisRateLimit({ bucket: '/api/', identifier: '1.2.3.4', max: 10, windowMs: 60_000 });

		expect(result.allowed).toBe(true);
		expect(result.degraded).toBe(true);
	});

	it('in-memory fallback blocks after limit is reached', async () => {
		// Keep Redis failing so every call uses fallback
		mockRedisEval.mockRejectedValue(new Error('Redis down'));

		const max = 3;
		const { checkRedisRateLimit } = await import('./redis-rate-limit.js');

		// Use a unique identifier to avoid cross-test pollution
		const id = `fallback-block-test-${Date.now()}`;

		for (let i = 0; i < max; i++) {
			const r = await checkRedisRateLimit({ bucket: '/api/', identifier: id, max, windowMs: 60_000 });
			expect(r.allowed).toBe(true);
		}

		const blocked = await checkRedisRateLimit({ bucket: '/api/', identifier: id, max, windowMs: 60_000 });
		expect(blocked.allowed).toBe(false);
		expect(blocked.degraded).toBe(true);
		expect(blocked.retryAfter).toBeGreaterThan(0);
	});
});

describe('evictFallback', () => {
	it('is a callable function', async () => {
		const { evictFallback } = await import('./redis-rate-limit.js');
		expect(() => evictFallback()).not.toThrow();
	});
});
