import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getRedis: vi.fn(), embedText: vi.fn(), resolveCanonicalPacketKey: vi.fn() }));

vi.mock('$lib/server/redis.js', () => ({ getRedis: mocks.getRedis }));
vi.mock('$lib/server/embedding/embed.js', () => ({ embedText: mocks.embedText }));
vi.mock('$lib/server/atlas/identity/packet-identity-resolver.js', () => ({ resolveCanonicalPacketKey: mocks.resolveCanonicalPacketKey }));

import { POST } from './+server.js';

describe('POST /api/admin/batch-embeddings/embed authorization', () => {
	beforeEach(() => vi.clearAllMocks());

	it.each([
		[{ id: 'user-1', role: 'user' }, 403],
		[undefined, 401],
	] as const)('rejects non-admin caller before request parsing or side effects', async (user, status) => {
		const json = vi.fn();
		const event = { locals: { user }, request: { json } } as never;

		await expect(POST(event)).rejects.toMatchObject({ status });
		expect(json).not.toHaveBeenCalled();
		expect(mocks.getRedis).not.toHaveBeenCalled();
		expect(mocks.embedText).not.toHaveBeenCalled();
		expect(mocks.resolveCanonicalPacketKey).not.toHaveBeenCalled();
	});
});
