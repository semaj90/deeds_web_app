// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getValkeyClient, redis } = vi.hoisted(() => {
	const redis = {
		scan: vi.fn(),
		mget: vi.fn()
	};
	return { redis, getValkeyClient: vi.fn(() => redis) };
});

vi.mock('$lib/server/cache/valkey-client.js', () => ({ getValkeyClient }));
vi.mock('$lib/server/db/client', () => ({ db: { execute: vi.fn() } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { QDRANT_URL: 'http://127.0.0.1:6333' } }));

import { GET } from './+server.js';

describe('/api/codebase-index/export/bundle Redis sections', () => {
	beforeEach(() => {
		getValkeyClient.mockClear();
		redis.scan.mockReset().mockResolvedValue(['0', []]);
		redis.mget.mockReset().mockResolvedValue([]);
	});

	it('uses the shared Valkey client for wiki notes and cache stats without disposing it', async () => {
		const response = await GET({
			url: new URL('http://localhost/api/codebase-index/export/bundle?include=wikiNotes,cacheStats'),
			locals: { user: { id: 'test-user' } }
		} as never);

		expect(response.status).toBe(200);
		expect(getValkeyClient).toHaveBeenCalledTimes(2);
		expect(redis.scan).toHaveBeenCalled();
		await expect(response.json()).resolves.toMatchObject({
			wikiNotes: [],
			cacheStats: expect.any(Object),
			meta: { sources: { wikiNotes: true, cacheStats: true } }
		});
	});

	it('keeps the existing degraded-source behavior when Valkey rejects authentication', async () => {
		redis.scan.mockRejectedValue(new Error('NOAUTH Authentication required.'));
		const response = await GET({
			url: new URL('http://localhost/api/codebase-index/export/bundle?include=wikiNotes,cacheStats'),
			locals: { user: { id: 'test-user' } }
		} as never);

		const body = await response.json();
		expect(body.wikiNotes).toBeNull();
		expect(body.cacheStats).toBeNull();
		expect(body.meta.errors).toMatchObject({
			wikiNotes: 'NOAUTH Authentication required.',
			cacheStats: 'NOAUTH Authentication required.'
		});
	});
});
