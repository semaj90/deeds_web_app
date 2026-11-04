import { describe, expect, it, vi } from 'vitest';
import { classifyReadError, withBoundedRetry } from './transient-retry.js';

describe('classifyReadError', () => {
	it('treats a verified 404 as source missing, never transient', () => {
		expect(classifyReadError({ name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })).toBe('SOURCE_MISSING');
	});
	it('treats 5xx, 429 and timeouts as transient', () => {
		expect(classifyReadError({ $metadata: { httpStatusCode: 503 } })).toBe('TRANSIENT');
		expect(classifyReadError({ $metadata: { httpStatusCode: 429 } })).toBe('TRANSIENT');
		expect(classifyReadError({ name: 'TimeoutError' })).toBe('TRANSIENT');
	});
	it('treats other errors as permanent', () => {
		expect(classifyReadError({ $metadata: { httpStatusCode: 403 } })).toBe('PERMANENT');
	});
});

describe('withBoundedRetry', () => {
	const noSleep = async () => {};

	it('retries a transient failure and then succeeds', async () => {
		const read = vi
			.fn()
			.mockRejectedValueOnce({ $metadata: { httpStatusCode: 503 } })
			.mockResolvedValueOnce('bytes');
		await expect(withBoundedRetry(read, { attempts: 3, baseDelayMs: 1, sleep: noSleep })).resolves.toBe('bytes');
		expect(read).toHaveBeenCalledTimes(2);
	});

	it('stops after the bounded attempt count', async () => {
		const read = vi.fn().mockRejectedValue({ $metadata: { httpStatusCode: 503 } });
		await expect(withBoundedRetry(read, { attempts: 3, baseDelayMs: 1, sleep: noSleep })).rejects.toBeDefined();
		expect(read).toHaveBeenCalledTimes(3);
	});

	it('does not retry a missing source', async () => {
		const read = vi.fn().mockRejectedValue({ name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
		await expect(withBoundedRetry(read, { attempts: 3, baseDelayMs: 1, sleep: noSleep })).rejects.toBeDefined();
		expect(read).toHaveBeenCalledTimes(1);
	});
});
