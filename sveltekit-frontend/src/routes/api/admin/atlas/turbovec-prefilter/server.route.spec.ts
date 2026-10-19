import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('$lib/server/env.server.js', () => ({
	ENV: { TURBOVEC_SIDECAR: 'http://turbovec.test', OLLAMA_BASE_URL: 'http://ollama.test' },
}));
vi.mock('$lib/server/grpc/turbovec-cuda-client.js', () => ({ turbovecGrpcSearch: vi.fn() }));

import { GET } from './+server';

const health = {
	ok: true,
	indexed: 37,
	dim: 128,
	bits: 4,
	turbovec: true,
	source: 'postgres',
	collection: 'fixture_collection',
	representationId: 'fixture_mrl128_l2_4bit_v1',
	role: 'CHALLENGER_ONLY',
};

const getHealth = (authenticated = true) => GET({
	locals: { user: authenticated ? { id: 'test-user' } : null },
} as never);

describe('GET /api/admin/atlas/turbovec-prefilter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', mocks.fetch);
	});

	afterEach(() => vi.unstubAllGlobals());

	it('requires authentication without calling the sidecar', async () => {
		const response = await getHealth(false);
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ ok: false, health: null, error: 'UNAUTHORIZED' });
		expect(mocks.fetch).not.toHaveBeenCalled();
	});

	it('preserves the reported representation through the existing configured client', async () => {
		mocks.fetch.mockResolvedValue(new Response(JSON.stringify(health)));
		const response = await getHealth();
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ ok: true, health: { ...health, backend: null }, error: null });
		expect(mocks.fetch).toHaveBeenCalledWith('http://turbovec.test/health', {
			signal: expect.any(AbortSignal),
		});
	});

	it('keeps a reachable degraded sidecar distinct from an online index', async () => {
		mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ ...health, ok: false, indexed: 0, turbovec: false })));
		const response = await getHealth();
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ ok: true, health: { ok: false, indexed: 0, turbovec: false }, error: null });
	});

	it.each([
		['network failure', () => Promise.reject(new Error('unreachable'))],
		['upstream error', () => Promise.resolve(new Response('{}', { status: 503 }))],
		['invalid JSON', () => Promise.resolve(new Response('invalid'))],
		['invalid dimensions', () => Promise.resolve(new Response(JSON.stringify({ ...health, dim: -1 })))],
	])('returns the stable empty response on %s', async (_label, upstream) => {
		mocks.fetch.mockImplementation(upstream);
		const response = await getHealth();
		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ ok: false, health: null, error: 'TURBOVEC_UNAVAILABLE' });
	});
});
