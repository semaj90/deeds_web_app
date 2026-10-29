// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRedis = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/redis.js', () => ({ getRedis }));

import { POST } from './+server.js';

describe('POST /api/cache/bitfrost-effectiveness', () => {
	beforeEach(() => {
		getRedis.mockReset();
	});

	it('rejects malformed JSON before accessing Redis', async () => {
		const request = new Request('http://localhost/api/cache/bitfrost-effectiveness', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{',
		});

		const response = await POST({ request, locals: { user: { id: 'admin-1', role: 'admin' } } } as any);

		expect(response.status).toBe(400);
		expect(getRedis).not.toHaveBeenCalled();
	});

	it('rejects unknown actions before accessing Redis', async () => {
		const request = new Request('http://localhost/api/cache/bitfrost-effectiveness', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'flush-everything' }),
		});

		const response = await POST({ request, locals: { user: { id: 'admin-1', role: 'admin' } } } as any);

		expect(response.status).toBe(400);
		expect(getRedis).not.toHaveBeenCalled();
	});
});
