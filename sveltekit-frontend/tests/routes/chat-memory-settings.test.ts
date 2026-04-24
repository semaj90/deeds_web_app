// @vitest-environment node
/**
 * Unit tests for /api/chat/memory/settings
 *
 * Cases covered:
 *  - 403 non-admin (GET/PATCH/DELETE)
 *  - 200 GET returns defaults when Redis has no key yet
 *  - 200 GET parses stored settings + merges metrics hash
 *  - 200 PATCH merges partial updates and persists
 *  - 400 PATCH rejects out-of-range scoreThreshold
 *  - 400 PATCH rejects invalid JSON body
 *  - 400 DELETE without target=metrics
 *  - 200 DELETE clears the metrics hash
 *  - Degraded: Redis failure on GET returns defaults + zero metrics (no 500)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { mockGetRedis } = vi.hoisted(() => ({
	mockGetRedis: vi.fn(),
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: (...args: unknown[]) => mockGetRedis(...args),
}));

import { makeAuthEvent, makeEvent, responseJson } from '../helpers/route-test-utils.js';

/** Build a stub Redis client with per-test overrides. */
function makeRedis(overrides: Partial<{
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string) => Promise<string>;
	del: (key: string) => Promise<number>;
	hgetall: (key: string) => Promise<Record<string, string>>;
}> = {}) {
	return {
		get: vi.fn(async () => null),
		set: vi.fn(async () => 'OK'),
		del: vi.fn(async () => 1),
		hgetall: vi.fn(async () => ({})),
		...overrides,
	};
}

describe('/api/chat/memory/settings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── Auth ───────────────────────────────────────────────────────────────

	it('GET returns 403 when user is not admin', async () => {
		mockGetRedis.mockReturnValue(makeRedis());
		const { GET } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);

		const event = makeEvent({ url: '/api/chat/memory/settings' });
		const res = await GET(event as any);
		expect(res.status).toBe(403);
	});

	it('GET returns 403 for authenticated non-admin user', async () => {
		mockGetRedis.mockReturnValue(makeRedis());
		const { GET } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);

		const event = makeAuthEvent({
			url: '/api/chat/memory/settings',
			role: 'user',
		});
		const res = await GET(event as any);
		expect(res.status).toBe(403);
	});

	it('PATCH returns 403 for non-admin', async () => {
		mockGetRedis.mockReturnValue(makeRedis());
		const { PATCH } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);

		const event = makeEvent({
			url: '/api/chat/memory/settings',
			method: 'PATCH',
			body: { enabled: false },
		});
		const res = await PATCH(event as any);
		expect(res.status).toBe(403);
	});

	it('DELETE returns 403 for non-admin', async () => {
		mockGetRedis.mockReturnValue(makeRedis());
		const { DELETE } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);

		const event = makeEvent({
			url: '/api/chat/memory/settings?target=metrics',
			method: 'DELETE',
		});
		const res = await DELETE(event as any);
		expect(res.status).toBe(403);
	});

	// ── GET happy path ─────────────────────────────────────────────────────

	it('GET returns defaults when Redis has no settings key', async () => {
		mockGetRedis.mockReturnValue(
			makeRedis({
				get: async () => null,
				hgetall: async () => ({}),
			})
		);

		const { GET } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);
		const event = makeAuthEvent({ url: '/api/chat/memory/settings' });
		const res = await GET(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson<{
			enabled: boolean;
			scoreThreshold: number;
			metrics: {
				calls: number;
				hits: number;
				failures: number;
				avgLatencyMs: number;
				avgHitsPerCall: number;
				avgScore: number;
			};
		}>(res);

		expect(body.enabled).toBe(true);
		expect(body.scoreThreshold).toBe(0.65);
		expect(body.metrics).toEqual({
			calls: 0,
			hits: 0,
			failures: 0,
			avgLatencyMs: 0,
			avgHitsPerCall: 0,
			avgScore: 0,
		});
	});

	it('GET returns stored settings and derived metrics', async () => {
		mockGetRedis.mockReturnValue(
			makeRedis({
				get: async (key: string) => {
					if (key === 'chat_memory:settings') {
						return JSON.stringify({ enabled: false, scoreThreshold: 0.8 });
					}
					return null;
				},
				hgetall: async () => ({
					calls: '100',
					hits: '40',
					failures: '2',
					latencyMsTotal: '5000',
					scoreTotal: '32.8',
				}),
			})
		);

		const { GET } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);
		const event = makeAuthEvent({ url: '/api/chat/memory/settings' });
		const res = await GET(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson<{
			enabled: boolean;
			scoreThreshold: number;
			metrics: any;
		}>(res);

		expect(body.enabled).toBe(false);
		expect(body.scoreThreshold).toBe(0.8);
		expect(body.metrics.calls).toBe(100);
		expect(body.metrics.hits).toBe(40);
		expect(body.metrics.avgLatencyMs).toBe(50); // 5000/100
		expect(body.metrics.avgHitsPerCall).toBe(0.4); // 40/100
		expect(body.metrics.avgScore).toBeCloseTo(0.82, 2); // 32.8/40
	});

	// ── PATCH happy path ──────────────────────────────────────────────────

	it('PATCH merges partial enabled update and returns combined state', async () => {
		const storedGet = vi.fn(async (key: string) => {
			if (key === 'chat_memory:settings') {
				return JSON.stringify({ enabled: true, scoreThreshold: 0.7 });
			}
			return null;
		});
		const set = vi.fn(async () => 'OK');
		mockGetRedis.mockReturnValue(
			makeRedis({ get: storedGet, set, hgetall: async () => ({}) })
		);

		const { PATCH } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/settings',
			method: 'PATCH',
			body: { enabled: false },
		});
		const res = await PATCH(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson<{ enabled: boolean; scoreThreshold: number }>(res);
		expect(body.enabled).toBe(false);
		expect(body.scoreThreshold).toBe(0.7); // unchanged

		// The merged settings are serialized to Redis
		expect(set).toHaveBeenCalledTimes(1);
		const [key, value] = set.mock.calls[0];
		expect(key).toBe('chat_memory:settings');
		expect(JSON.parse(value as string)).toEqual({ enabled: false, scoreThreshold: 0.7 });
	});

	it('PATCH accepts combined update of both fields', async () => {
		const set = vi.fn(async () => 'OK');
		mockGetRedis.mockReturnValue(makeRedis({ set }));

		const { PATCH } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/settings',
			method: 'PATCH',
			body: { enabled: true, scoreThreshold: 0.55 },
		});
		const res = await PATCH(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson<{ enabled: boolean; scoreThreshold: number }>(res);
		expect(body).toEqual({ enabled: true, scoreThreshold: 0.55 });
	});

	// ── PATCH validation ───────────────────────────────────────────────────

	it('PATCH rejects scoreThreshold > 1', async () => {
		mockGetRedis.mockReturnValue(makeRedis());
		const { PATCH } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/settings',
			method: 'PATCH',
			body: { scoreThreshold: 1.5 },
		});
		const res = await PATCH(event as any);
		expect(res.status).toBe(400);
	});

	it('PATCH rejects scoreThreshold < 0', async () => {
		mockGetRedis.mockReturnValue(makeRedis());
		const { PATCH } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/settings',
			method: 'PATCH',
			body: { scoreThreshold: -0.1 },
		});
		const res = await PATCH(event as any);
		expect(res.status).toBe(400);
	});

	it('PATCH rejects invalid JSON body', async () => {
		mockGetRedis.mockReturnValue(makeRedis());
		const { PATCH } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);

		// Build event with a Request whose body isn't valid JSON
		const event = makeEvent({
			url: '/api/chat/memory/settings',
			method: 'PATCH',
			locals: { user: { id: 'u1', role: 'admin' } },
		}) as any;
		event.request = new Request('http://localhost/api/chat/memory/settings', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: 'not-json',
		});

		const res = await PATCH(event as any);
		expect(res.status).toBe(400);
	});

	// ── DELETE ─────────────────────────────────────────────────────────────

	it('DELETE requires target=metrics', async () => {
		mockGetRedis.mockReturnValue(makeRedis());
		const { DELETE } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/settings',
			method: 'DELETE',
		});
		const res = await DELETE(event as any);
		expect(res.status).toBe(400);
	});

	it('DELETE target=metrics clears the metrics hash', async () => {
		const del = vi.fn(async () => 1);
		mockGetRedis.mockReturnValue(makeRedis({ del }));

		const { DELETE } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);
		const event = makeAuthEvent({
			url: '/api/chat/memory/settings?target=metrics',
			method: 'DELETE',
		});
		const res = await DELETE(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson<{ ok: boolean }>(res);
		expect(body.ok).toBe(true);
		expect(del).toHaveBeenCalledWith('chat_memory:metrics');
	});

	// ── Degraded upstream ──────────────────────────────────────────────────

	it('GET returns defaults + zero metrics when Redis throws (no 500)', async () => {
		mockGetRedis.mockReturnValue(
			makeRedis({
				get: async () => {
					throw new Error('ECONNREFUSED');
				},
				hgetall: async () => {
					throw new Error('ECONNREFUSED');
				},
			})
		);

		const { GET } = await import(
			'../../src/routes/api/chat/memory/settings/+server.js'
		);
		const event = makeAuthEvent({ url: '/api/chat/memory/settings' });
		const res = await GET(event as any);

		expect(res.status).toBe(200);
		const body = await responseJson<{
			enabled: boolean;
			scoreThreshold: number;
			metrics: any;
		}>(res);

		// Degraded shape matches success shape (no undefined leaks)
		expect(body.enabled).toBe(true);
		expect(body.scoreThreshold).toBe(0.65);
		expect(body.metrics.calls).toBe(0);
		expect(body.metrics.avgLatencyMs).toBe(0);
	});
});
