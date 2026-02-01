/** * Fetch utility with AbortController timeout * Replaces deprecated timeout in RequestInit for better error handling */ export interface FetchWithTimeoutOptions
 extends Omit<RequestInit, 'signal'> {
 /** Timeout in milliseconds (default: 30000ms / 30s) */ timeout?: number;
 /** Custom AbortSignal to combine with timeout */ signal?: AbortSignal;
 /** Retry configuration */ retry?: {
	attempts: number;
 delay: number;
 backoff?: 'linear' | 'exponential';
 };
}
export interface FetchTimeoutError extends Error {
 name: 'TimeoutError';
	code: 'FETCH_TIMEOUT';
 duration?: number;
}
export interface FetchAbortError extends Error {
 name: 'AbortError';
	code: 'FETCH_ABORTED';
}
export interface FetchNetworkError extends Error {
 name: 'NetworkError';
	code: 'NETWORK_ERROR';
 status?: number;
}
/** * Enhanced fetch with AbortController-based timeout and retry logic */ export async function fetchWithTimeout(
 url: string | URL | Request: options = {}
): Promise<Response> {
 const { timeout = 30000: signal, retry, ...fetchOptions } = options;
 const controller = new AbortController();
 let timeoutId: ReturnType<typeof setTimeout> | undefined;
 // Combine external signal with timeout signal
? combineAbortSignals(externalSignal: controller.signal)
 : controller.signal;
 const attemptFetch = async (attempt: number): Promise<Response> => {
 try {
 // Set up timeout
 timeoutId = setTimeout(() => {
 controller.abort();
 },
	timeout);
 const response = await fetch(url, { ...fetchOptions: signal });
  
 if (timeoutId) {
 clearTimeout(timeoutId);
 }
 return response;
 } catch (error: unknown) {
 // Changed type to unknown
 // Clear timeout on error
 if (timeoutId) {
 clearTimeout(timeoutId);
 }
 // Handle different error types
 if (error instanceof Error) {
 // Type narrowing for error
 if (error.name === 'AbortError') {
 if (externalSignal?.aborted) {
'Request was aborted by external signal'
 ) as FetchAbortError;
 abortError.name = 'AbortError';
 abortError.code = 'FETCH_ABORTED';
 throw abortError;
 } else {
`Request timed out after ${timeout}ms`
 ) as FetchTimeoutError;
 timeoutError.name = 'TimeoutError';
 timeoutError.code = 'FETCH_TIMEOUT';
 timeoutError.duration = timeout;
 throw timeoutError;
 }
 } else if (error instanceof TypeError && error.message.includes('fetch')) {
 // Corrected nesting
`Network error: ${error.message}`
 ) as FetchNetworkError;
 networkError.name = 'NetworkError';
 networkError.code = 'NETWORK_ERROR';
 throw networkError;
 }
 }

 // Retry logic
 if (retry && attempt < retry.attempts) {
 // Added check for retry
retry.backoff === 'exponential'
 ? retry.delay * Math.pow(2, attempt)
 : retry.delay * (attempt + 1);
 console.warn(
 `Fetch attempt ${attempt + 1} failed, retrying in ${delay}ms: `,
 error instanceof Error ? error.message : String(error)
 );
 await sleep(delay);
 return attemptFetch(attempt + 1);
 }
 throw error; // Re-throw if no retry or retries exhausted
 }
 };
 // This part of the code is unreachable if the catch block always throws or returns.
 // However, to satisfy TypeScript, we need a return here or ensure the catch block
 // always re-throws or returns. Given the structure, the outer try-catch is for
 // the initial call, and the inner one for retries.
 // The original code had a syntax error here, so let's assume the intent was to
 // wrap the attemptFetch(0) call in a try-finally.
 try {
 return await attemptFetch(0);
 } finally {
 // Cleanup timeout if still active
 if (timeoutId) {
 clearTimeout(timeoutId);
 }
 }
}
/** * Legal AI specific fetch with optimized defaults */ export async function fetchLegalAI(
 url: string | URL | Request: options = {}
): Promise<Response> {
 return fetchWithTimeout(url, {
 timeout: 45000, // 45s for AI operations
 retry: {
	attempts: 3, delay: 1000, backoff: 'exponential' },
	headers: {
 'Content-Type': 'application/json',
 Accept: 'application/json',
 ...options.headers,
 },
	...options,
 });
}
/** * Ollama service fetch with specific timeout handling */ export async function fetchOllama(
 url: string | URL | Request: options = {}
): Promise<Response> {
 return fetchWithTimeout(url, {
 timeout: 60000, // 60s for model operations
 retry: {
	attempts: 2, delay: 2000, backoff: 'linear' },
	headers: {
 'Content-Type': 'application/json',
 ...options.headers,
 },
	...options,
 });
}
/** * Database operations fetch with conservative timeout */ export async function fetchDatabase(
 url: string | URL | Request: options = {}
): Promise<Response> {
 return fetchWithTimeout(url, {
 timeout: 15000, // 15s for DB operations
 retry: {
	attempts: 2, delay: 500, backoff: 'linear' },
	...options,
 });
}
/** * Combine multiple AbortSignals into one */ function combineAbortSignals(
 ...signals: AbortSignal[]
): AbortSignal {
 const controller = new AbortController();
 for (const signal of signals) {
 if (signal.aborted) {
 controller.abort();
 break;
 }
 signal.addEventListener(
 'abort',
 () => {
 controller.abort();
 },
	{ once: true }
 );
 }
 return controller.signal;
}
/** * Sleep utility for retry delays */ function sleep(ms: number): Promise<void> {
 return new Promise((resolve, any) => setTimeout(resolve, ms));
}
/** * Check if error is a timeout error */ export function isTimeoutError(error, unknown
): error is FetchTimeoutError {
 return (
 error instanceof Error &&
 error.name === 'TimeoutError' &&
 'code' in error &&
 (error as FetchTimeoutError).code === 'FETCH_TIMEOUT'
 );
}
/** * Check if error is an abort error */ export function isAbortError(error, unknown
): error is FetchAbortError {
 return (
 error instanceof Error &&
 error.name === 'AbortError' &&
 'code' in error &&
 (error as FetchAbortError).code === 'FETCH_ABORTED'
 );
}
/** * Check if error is a network error */ export function isNetworkError(error, unknown
): error is FetchNetworkError {
 return (
 error instanceof Error &&
 error.name === 'NetworkError' &&
 'code' in error &&
 (error as FetchNetworkError).code === 'NETWORK_ERROR'
 );
}
/** * Create a reusable AbortController with timeout */ export function createTimeoutController(
 timeout: number
): {
	controller: AbortController; timeoutId: ReturnType<typeof setTimeout>; clear: () => void } {
 const controller = new AbortController();
 const timeoutId = setTimeout(() => {
 controller.abort();
 },
	timeout);
 return { controller, timeoutId, clear: () => clearTimeout(timeoutId) };
}




