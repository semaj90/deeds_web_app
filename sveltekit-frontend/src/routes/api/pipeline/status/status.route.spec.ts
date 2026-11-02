import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const limit = vi.fn();
	const query = {
		from: vi.fn(),
		innerJoin: vi.fn(),
		where: vi.fn(),
		limit,
	};
	for (const method of ['from', 'innerJoin', 'where'] as const) query[method].mockReturnValue(query);
	return {
		limit,
		query,
		select: vi.fn(() => query),
		getRedis: vi.fn(),
	};
});

vi.mock('$lib/server/db/client.js', () => ({ db: { select: mocks.select } }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: mocks.getRedis }));

describe('durable pipeline status route', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.select.mockReturnValue(mocks.query);
		for (const method of ['from', 'innerJoin', 'where'] as const) {
			mocks.query[method].mockReturnValue(mocks.query);
		}
	});

	it('returns the PostgreSQL analysis job state when present', async () => {
		mocks.limit.mockResolvedValue([{
			id: '123e4567-e89b-42d3-a456-426614174000',
			status: 'completed',
			progress: '100',
			result: { message: 'Indexed' },
			error: null,
			startedAt: new Date('2026-10-31T00:00:00.000Z'),
			completedAt: new Date('2026-10-31T00:00:01.000Z'),
		}]);
		const { GET } = await import('./[jobId]/+server.js');
		const response = await GET({
			params: { jobId: '123e4567-e89b-42d3-a456-426614174000' },
			locals: { user: { id: '7' } },
		} as never);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ status: 'completed', progress: 100, message: 'Indexed' });
		expect(mocks.getRedis).not.toHaveBeenCalled();
	});

	it('does not report cached legacy status when the durable database lookup fails', async () => {
		mocks.limit.mockRejectedValue(new Error('database unavailable'));
		const { GET } = await import('./[jobId]/+server.js');
		const response = await GET({
			params: { jobId: '123e4567-e89b-42d3-a456-426614174000' },
			locals: { user: { id: '7' } },
		} as never);

		expect(response.status).toBe(503);
		await expect(response.json()).resolves.toMatchObject({
			jobId: '123e4567-e89b-42d3-a456-426614174000',
			status: 'unavailable',
			progress: 0,
		});
		expect(mocks.getRedis).not.toHaveBeenCalled();
	});
});
