import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({
	mockQuery: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
	pool: {
		query: (...args: unknown[]) => mockQuery(...args),
	},
}));

describe('invalidateBuffers', () => {
	beforeEach(() => {
		mockQuery.mockReset();
		vi.restoreAllMocks();
	});

	it('silently skips optional context buffer table misses', async () => {
		mockQuery.mockRejectedValueOnce(
			Object.assign(new Error('relation "context_buffers" does not exist'), { code: '42P01' })
		);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { invalidateBuffers } = await import('./context-buffer.js');

		await expect(invalidateBuffers()).resolves.toBeUndefined();
		expect(errorSpy).not.toHaveBeenCalled();
		expect(mockQuery).toHaveBeenCalledWith(
			"DELETE FROM context_buffers WHERE buffer_key LIKE 'architecture-%'"
		);
	});

	it('still logs unexpected invalidation errors', async () => {
		mockQuery.mockRejectedValueOnce(new Error('boom'));
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { invalidateBuffers } = await import('./context-buffer.js');

		await expect(invalidateBuffers()).resolves.toBeUndefined();
		expect(errorSpy).toHaveBeenCalledWith(
			'[context-buffer] Invalidation failed:',
			expect.any(Error)
		);
	});
});