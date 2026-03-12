/**
 * Exponential backoff retry utility with jitter.
 *
 * Sprint 3: Infrastructure Hardening — transient error recovery.
 *
 * Usage:
 *   const result = await retry(() => fetch(url), { maxAttempts: 3 });
 *   const result = await retry(() => ollamaChat(prompt), { maxAttempts: 2, baseDelayMs: 200 });
 */

export interface RetryOptions {
	/** Maximum number of attempts (default: 3) */
	maxAttempts?: number;
	/** Base delay in ms before first retry (default: 100) */
	baseDelayMs?: number;
	/** Maximum delay cap in ms (default: 5000) */
	maxDelayMs?: number;
	/** Whether to add random jitter (default: true) */
	jitter?: boolean;
	/** Optional predicate: return true if the error is retryable (default: all errors) */
	isRetryable?: (err: unknown) => boolean;
	/** Optional callback on each retry (for logging) */
	onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
}

/**
 * Retry a function with jittered exponential backoff.
 *
 * Delay formula: min(baseDelayMs * 2^attempt + jitter, maxDelayMs)
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Result of fn()
 * @throws Last error if all attempts fail
 */
export async function retry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {}
): Promise<T> {
	const {
		maxAttempts = 3,
		baseDelayMs = 100,
		maxDelayMs = 5000,
		jitter = true,
		isRetryable,
		onRetry,
	} = options;

	let lastError: unknown;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;

			// Check if this error is retryable
			if (isRetryable && !isRetryable(err)) {
				throw err;
			}

			// Last attempt — don't delay, just throw
			if (attempt === maxAttempts - 1) {
				throw err;
			}

			// Calculate delay with exponential backoff + optional jitter
			const exponential = baseDelayMs * Math.pow(2, attempt);
			const jitterMs = jitter ? Math.random() * baseDelayMs : 0;
			const delay = Math.min(exponential + jitterMs, maxDelayMs);

			if (onRetry) {
				onRetry(attempt + 1, err, delay);
			}

			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError;
}

/**
 * Common retryable error predicates.
 */
export const retryPredicates = {
	/** Retry on network errors and 5xx responses */
	networkOrServer: (err: unknown): boolean => {
		if (err instanceof TypeError && err.message.includes('fetch')) return true;
		if (err instanceof Error) {
			const msg = err.message.toLowerCase();
			if (msg.includes('timeout') || msg.includes('econnrefused') ||
				msg.includes('econnreset') || msg.includes('socket hang up') ||
				msg.includes('network') || msg.includes('aborted')) return true;
			// HTTP 5xx
			const statusMatch = msg.match(/\b(5\d{2})\b/);
			if (statusMatch) return true;
		}
		return false;
	},

	/** Retry on timeout errors only */
	timeoutOnly: (err: unknown): boolean => {
		if (err instanceof Error) {
			return err.message.toLowerCase().includes('timeout') ||
				err.name === 'AbortError' ||
				err.name === 'TimeoutError';
		}
		return false;
	},
};
