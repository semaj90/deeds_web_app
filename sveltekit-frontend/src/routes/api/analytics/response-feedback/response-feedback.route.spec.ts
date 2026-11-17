import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	insert: vi.fn(),
	delete: vi.fn(),
	values: vi.fn(),
	conflict: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({
	db: {
		select: (...args: unknown[]) => mocks.select(...args),
		insert: (...args: unknown[]) => mocks.insert(...args),
		delete: (...args: unknown[]) => mocks.delete(...args),
	},
}));
vi.mock('$lib/server/db/schema/search-analytics.js', () => ({ responseFeedback: { rating: {}, queryHash: {}, userId: {} } }));
vi.mock('drizzle-orm', () => ({
	and: (...args: unknown[]) => args,
	eq: (...args: unknown[]) => args,
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

import { GET, POST } from './+server.js';

function query(result: unknown[]) {
	const builder: Record<string, unknown> = {};
	builder.from = vi.fn(() => builder);
	builder.where = vi.fn(() => builder);
	builder.limit = vi.fn(() => builder);
	builder.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
		Promise.resolve(result).then(resolve, reject);
	return builder;
}

function postRequest(body: unknown) {
	return new Request('http://localhost/api/analytics/response-feedback', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

describe('response feedback route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.select
			.mockReturnValueOnce(query([{ up: 3, down: 1 }]))
			.mockReturnValueOnce(query([{ rating: 'up' }]));
		mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.conflict });
		mocks.conflict.mockResolvedValue(undefined);
		mocks.insert.mockReturnValue({ values: mocks.values });
		mocks.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
	});

	it('requires a numeric authenticated actor before reads or writes', async () => {
		const response = await GET({ url: new URL('http://localhost/api/analytics/response-feedback?hash=q1'), locals: {} } as never);
		expect(response.status).toBe(401);
		expect(mocks.select).not.toHaveBeenCalled();

		const post = await POST({ request: postRequest({ queryHash: 'q1', rating: 'up' }), locals: { user: { id: 'not-a-number' } } } as never);
		expect(post.status).toBe(401);
		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it('validates the query hash and feedback payload', async () => {
		const get = await GET({ url: new URL('http://localhost/api/analytics/response-feedback'), locals: { user: { id: '7' } } } as never);
		expect(get.status).toBe(400);

		const post = await POST({ request: postRequest({ queryHash: '', rating: 'maybe' }), locals: { user: { id: '7' } } } as never);
		expect(post.status).toBe(400);
		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it('upserts the authenticated user vote and returns the aggregate contract', async () => {
		const response = await POST({
			request: postRequest({ queryHash: 'q1', rating: 'up', pipeline: 'semantic_768', chunkIds: ['c1'] }),
			locals: { user: { id: '7' } },
		} as never);

		expect(response.status).toBe(200);
		expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({
			queryHash: 'q1', userId: 7, rating: 'up', pipeline: 'semantic_768', chunkIds: ['c1'],
		}));
		expect(mocks.conflict).toHaveBeenCalledWith(expect.objectContaining({ set: expect.objectContaining({ rating: 'up' }) }));
		expect(await response.json()).toEqual({ counts: { up: 3, down: 1 }, rating: 'up' });
	});
});
