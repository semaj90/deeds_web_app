/**
 * Graceful Error Handler for Backend Failures
 * Provides user-friendly error messages, retry logic, and logging
 *
 * Requirements: 5.5
 */

export interface BackendError {
	service: 'database' | 'minio' | 'redis' | 'ollama' | 'qdrant' | 'unknown';
	message: string;
	userMessage: string;
	retryable: boolean;
	timestamp: string;
	originalError?: Error;
}

export interface RetryConfig {
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs: number;
	backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxRetries: 3,
	baseDelayMs: 100,
	maxDelayMs: 5000,
	backoffMultiplier: 2
};

/**
 * Map error to user-friendly message based on service type
 */
export function createBackendError(
	error: Error | unknown,
	service: BackendError['service'] = 'unknown'
): BackendError {
	const err = error instanceof Error ? error : new Error(String(error));
	const timestamp = new Date().toISOString();

	// Determine if error is retryable
	const retryablePatterns = [
		'ECONNREFUSED',
		'ETIMEDOUT',
		'ECONNRESET',
		'timeout',
		'connection',
		'temporarily unavailable'
	];
	const retryable = retryablePatterns.some(pattern =>
		err.message.toLowerCase().includes(pattern.toLowerCase())
	);

	// Generate user-friendly message based on service
	const userMessages: Record<BackendError['service'], string> = {
		database: 'Unable to load data. Please try again in a moment.',
		minio: 'File storage is temporarily unavailable. Please try again.',
		redis: 'Session service is experiencing issues. Please refresh the page.',
		ollama: 'AI service is temporarily unavailable. Please try again later.',
		qdrant: 'Search service is temporarily unavailable. Please try again.',
		unknown: 'An unexpected error occurred. Please try again.'
	};

	return {
		service,
		message: err.message,
		userMessage: userMessages[service],
		retryable,
		timestamp,
		originalError: err
	};
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(
	attempt: number,
	config: RetryConfig
): number {
	const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
	// Add jitter (±10%)
	const jitter = delay * 0.1 * (Math.random() * 2 - 1);
	return Math.min(delay + jitter, config.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute function with retry and exponential backoff
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	options: {
		service?: BackendError['service'];
		config?: Partial<RetryConfig>;
		onRetry?: (attempt: number, error: BackendError) => void;
	} = {}
): Promise<{ data: T; retries: number } | { error: BackendError; retries: number }> {
	const config = { ...DEFAULT_RETRY_CONFIG, ...options.config };
	const service = options.service ?? 'unknown';
	let lastError: BackendError | null = null;

	for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
		try {
			const data = await fn();
			return { data, retries: attempt };
		} catch (error) {
			lastError = createBackendError(error, service);

			// Don't retry if error is not retryable
			if (!lastError.retryable) {
				console.warn(`⚠️ Non-retryable error from ${service}:`, lastError.message);
				return { error: lastError, retries: attempt };
			}

			// Don't retry on last attempt
			if (attempt === config.maxRetries) {
				console.error(`❌ Max retries (${config.maxRetries}) exceeded for ${service}`);
				return { error: lastError, retries: attempt };
			}

			// Calculate delay and wait
			const delay = calculateBackoffDelay(attempt, config);
			console.log(`🔄 Retry ${attempt + 1}/${config.maxRetries} for ${service} in ${Math.round(delay)}ms`);

			if (options.onRetry) {
				options.onRetry(attempt + 1, lastError);
			}

			await sleep(delay);
		}
	}

	// Should never reach here, but TypeScript needs it
	return { error: lastError!, retries: config.maxRetries };
}

/**
 * Execute function with fallback value on failure
 */
export async function withFallback<T>(
	fn: () => Promise<T>,
	fallback: T,
	options: {
		service?: BackendError['service'];
		logError?: boolean;
	} = {}
): Promise<{ data: T; fromFallback: boolean; error?: string }> {
	const { service = 'unknown', logError = true } = options;

	try {
		const data = await fn();
		return { data, fromFallback: false };
	} catch (error) {
		const backendError = createBackendError(error, service);

		if (logError) {
			console.warn(`⚠️ ${service} failed, using fallback:`, backendError.message);
		}

		return {
			data: fallback,
			fromFallback: true,
			error: backendError.userMessage
		};
	}
}

/**
 * Log error for debugging with structured format
 */
export function logBackendError(error: BackendError): void {
	const logEntry = {
		timestamp: error.timestamp,
		service: error.service,
		message: error.message,
		retryable: error.retryable,
		stack: error.originalError?.stack
	};

	console.error('🔴 Backend Error:', JSON.stringify(logEntry, null, 2));
}

/**
 * Create error response for API endpoints
 */
export function createErrorResponse(
	error: BackendError,
	statusCode: number = 500
): Response {
	return new Response(
		JSON.stringify({
			error: error.userMessage,
			service: error.service,
			retryable: error.retryable,
			timestamp: error.timestamp
		}),
		{
			status: statusCode,
			headers: {
				'Content-Type': 'application/json'
			}
		}
	);
}

export default {
	createBackendError,
	withRetry,
	withFallback,
	logBackendError,
	createErrorResponse
};
