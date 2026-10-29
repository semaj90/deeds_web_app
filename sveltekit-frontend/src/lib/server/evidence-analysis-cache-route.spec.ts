import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	execute: vi.fn(),
	getFromMemoryCache: vi.fn(),
	setCache: vi.fn(),
	redisGet: vi.fn()
}));

vi.mock('$lib/server/db/client', () => ({
	db: { execute: mocks.execute },
	pgRows: (rows: unknown) => rows
}));

vi.mock('$lib/server/cache.js', () => ({
	getFromMemoryCache: mocks.getFromMemoryCache,
	setCache: mocks.setCache
}));

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({ get: mocks.redisGet })
}));

import { GET } from '../../routes/api/evidence/analysis/cache/+server.js';

function request(params: Record<string, string>, userId = '7') {
	const url = new URL('http://localhost/api/evidence/analysis/cache');
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	return GET({ url, locals: { user: { id: userId } } } as Parameters<typeof GET>[0]);
}

describe('evidence analysis cache route ownership', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getFromMemoryCache.mockReturnValue({ found: true, value: [{ id: 'cached' }] });
		mocks.execute.mockResolvedValue([{ authorized: false }]);
	});

	it('does not read cache tiers when the evidence belongs to another user', async () => {
		const response = await request({ evidenceId: '11111111-1111-4111-8111-111111111111' });

		expect(response.status).toBe(404);
		expect(mocks.getFromMemoryCache).not.toHaveBeenCalled();
		expect(mocks.redisGet).not.toHaveBeenCalled();
	});

	it('checks case ownership before serving a cached case result', async () => {
		mocks.execute.mockResolvedValue([{ authorized: true }]);
		const caseId = '22222222-2222-4222-8222-222222222222';
		const response = await request({ caseId, limit: '10' });

		expect(response.status).toBe(200);
		expect(mocks.getFromMemoryCache).toHaveBeenCalledWith(`analysis_cache:7::${caseId}:all:10`);
	});

	it('fails closed for user IDs that cannot map to the integer owner columns', async () => {
		const response = await request(
			{ caseId: '22222222-2222-4222-8222-222222222222' },
			'not-an-integer-user'
		);

		expect(response.status).toBe(404);
		expect(mocks.execute).not.toHaveBeenCalled();
		expect(mocks.getFromMemoryCache).not.toHaveBeenCalled();
	});
});
