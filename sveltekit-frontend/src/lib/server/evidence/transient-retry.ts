/**
 * Bounded retry for evidence source reads. Pure: no database or storage access.
 *
 * Only transient failures are retried (timeouts, throttling, 5xx, connection resets).
 * A verified "not found" is never retried, so it can be classified as SOURCE_MISSING.
 */

export type ReadErrorClass = 'TRANSIENT' | 'SOURCE_MISSING' | 'PERMANENT';

export function classifyReadError(err: unknown): ReadErrorClass {
	const e = err as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } } | null;
	const status = e?.$metadata?.httpStatusCode;
	const name = e?.name ?? e?.code ?? '';
	if (status === 404 || name === 'NoSuchKey' || name === 'NotFound') return 'SOURCE_MISSING';
	if (status === 429 || (status !== undefined && status >= 500)) return 'TRANSIENT';
	if (['TimeoutError', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'SlowDown'].includes(name)) return 'TRANSIENT';
	return 'PERMANENT';
}

export async function withBoundedRetry<T>(
	read: () => Promise<T>,
	options: { attempts: number; baseDelayMs: number; sleep?: (ms: number) => Promise<void> }
): Promise<T> {
	const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
	let lastError: unknown;
	for (let attempt = 1; attempt <= options.attempts; attempt++) {
		try {
			return await read();
		} catch (err) {
			lastError = err;
			if (classifyReadError(err) !== 'TRANSIENT' || attempt === options.attempts) throw err;
			await sleep(options.baseDelayMs * 2 ** (attempt - 1));
		}
	}
	throw lastError;
}
