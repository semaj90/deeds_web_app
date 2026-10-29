import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ generateSingleEmbedding: vi.fn(), qdrant: { client: { getCollection: vi.fn() } }, getRedis: vi.fn() }));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({ generateSingleEmbedding: mocks.generateSingleEmbedding }));
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({ qdrant: mocks.qdrant }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: mocks.getRedis }));

import { POST } from './+server.js';

describe('POST /api/admin/parents-atlas/actions authorization', () => {
	beforeEach(() => vi.clearAllMocks());

	it.each([
		[{ id: 'user-1', role: 'user' }, 403],
		[undefined, 401],
	] as const)('rejects non-admin caller before request parsing or side effects', async (user, status) => {
		const json = vi.fn();
		const event = { locals: { user }, request: { json } } as never;

		await expect(POST(event)).rejects.toMatchObject({ status });
		expect(json).not.toHaveBeenCalled();
		expect(mocks.generateSingleEmbedding).not.toHaveBeenCalled();
		expect(mocks.qdrant.client.getCollection).not.toHaveBeenCalled();
		expect(mocks.getRedis).not.toHaveBeenCalled();
	});
});
