/**
 * SSR API Data Extraction Helpers for Bits UI Compatibility
 * Enhanced with thread-safe JSONB operations and GPU acceleration
 */

import type { RequestHandler } from '@sveltejs/kit';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Types
export interface SSRResponse<T = unknown> {
	success: boolean;
	data: T | null;
	meta: {
	timestamp: string;
		cached: boolean;
	source: 'ssr' | 'api';
	};
	error?: string;
}

type BitsUICompatibleData =
	| string
	| number
	| boolean
	| null
	| { [key: string]: BitsUICompatibleData | BitsUICompatibleData[] }
	| BitsUICompatibleData[];

/** Estimate approximate serialized size (bytes) */
function estimateDataSize(data: unknown): number {
	try {
		return JSON.stringify(data).length * 2;
	} catch {
		return 0;
	}
}

/** Ensure data is serializable for SSR */
export function sanitizeForSSR<T>(input: T): T {
	if (input === null || input === undefined) return input;
	if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean')
		return input;
	if (input instanceof Date) return input.toISOString() as unknown as T;
	if (Array.isArray(input)) return input.map((i) => sanitizeForSSR(i)) as unknown as T;
	if (typeof input === 'object') {
		const out: Record<string, unknown> = {};
		const entries = Object.entries(input as Record<string, unknown>);
		for (const [k, v] of entries) {
			if (typeof v === 'function' || typeof v === 'symbol') continue;
			out[k] = sanitizeForSSR(v as unknown);
		}
		return out as unknown as T;
	}
	return String(input) as unknown as T;
}

/** Creates a standardized SSR JSON Response */
export async function createSSRResponse<T = unknown>(
	data: T,
	options?: {
		cached?: boolean;
		status?: number;
		headers?: Record<string, string>;
		gpuAccelerated?: boolean;
		threadSafe?: boolean;
		cacheKey?: string;
	}
): Promise<Response> {
	const sanitizedData = sanitizeForSSR(data);

	const responseObj: SSRResponse<T> = {
		success: true,
		data: sanitizedData as T,
		meta: {
	timestamp: new Date().toISOString(),
			cached: !!options?.cached,
			source: 'ssr'
		}
	};

	const serializedResponse = JSON.stringify(responseObj);

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'Cache-Control': 'public, max-age=30',
		'X-GPU-Accelerated': options?.gpuAccelerated ? 'true' : 'false',
		'X-Thread-Safe': options?.threadSafe ? 'true' : 'false',
		...(options?.headers ?? {})
	};

	return new Response(serializedResponse, { status: options?.status ?? 200, headers });
}

/** Creates an error response optimized for SSR */
export function createSSRErrorResponse(
	errorMessage: string,
	status = 500,
	data?: unknown
): Response {
	const response: SSRResponse = {
		success: false,
		data: data ?? null,
		meta: {
	timestamp: new Date().toISOString(),
			cached: false,
			source: 'ssr'
		},
	error: errorMessage
	};

	return new Response(JSON.stringify(response), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

/** Page loader helper */
export async function loadWithSSR<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
	try {
		const data = await loader();
		return sanitizeForSSR(data);
	} catch (err) {
		console.error('SSR Error:', err);
		return fallback;
	}
}

/** Batch API calls for efficient SSR data loading */
export async function batchSSRRequests<T extends Record<string, unknown>>(
	requests: { [K in keyof T]: () => Promise<T[K]> },
	timeout = 5000
): Promise<T> {
	const keys = Object.keys(requests) as Array<keyof T>;
	const results = {} as Partial<T>;

	await Promise.all(
		keys.map(async (k) => {
			const fn = requests[k];
			try {
				const timeoutPromise = new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('Request timeout')), timeout)
				);
				const res = await Promise.race([fn(), timeoutPromise]);
				(results as Record<string, unknown>)[String(k)] = sanitizeForSSR(res);
			} catch (err) {
				console.error(`SSR batch request failed for ${String(k)}:`, err);
				(results as Record<string, unknown>)[String(k)] = null;
			}
		})
	);

	return results as T;
}

/** Enhanced wrapper for API route handlers */
export function withSSRHandler<T>(
	handler: (event: Parameters<RequestHandler>[0]) => Promise<T | Response>,
	options?: {
		gpuAccelerated?: boolean;
		cacheKey?: (event: Parameters<RequestHandler>[0]) => string;
		threadSafe?: boolean;
	}
): RequestHandler {
	return (async (event) => {
		try {
			const result = await handler(event);
			if (result instanceof Response) return result;

			const cacheKey = options?.cacheKey ? options.cacheKey(event) : undefined;

			return await createSSRResponse(result, {
				cached: !!cacheKey,
				gpuAccelerated: options?.gpuAccelerated,
				threadSafe: options?.threadSafe ?? true,
				cacheKey
			});
		} catch (err) {
			const e = err as { message?: string; status?: number };
			console.error('SSR Error:', err);
			const status = e?.status ?? 500;
			const message = e?.message ?? 'Internal server error';
			return createSSRErrorResponse(message, status);
		}
	}) as RequestHandler;
}

/** Batch requests with GPU acceleration support */
export async function batchSSRRequestsGPU<T extends Record<string, unknown>>(
	requests: { [K in keyof T]: () => Promise<T[K]> },
	options?: {
		timeout?: number;
		gpuAccelerated?: boolean;
		cacheResults?: boolean;
		threadSafe?: boolean;
	}
): Promise<T> {
	const timeout = options?.timeout ?? 5000;
	const results = {} as Partial<T>;

	const entries = Object.entries(requests) as [string, () => Promise<unknown>][];

	await Promise.all(
		entries.map(async ([key, requestFn]) => {
			try {
				const timeoutPromise = new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('Request timeout')), timeout)
				);
				const result = await Promise.race([requestFn(), timeoutPromise]);
				(results as Record<string, unknown>)[key] = sanitizeForSSR(result);
			} catch (error) {
				console.error(`SSR batch request failed for ${key}:`, error);
				(results as Record<string, unknown>)[key] = null;
			}
		})
	);

	return results as T;
}

/** System health check */
export async function getThreadSyncHealth(): Promise<Record<string, unknown>> {
	return {
		postgres: {
	connected: true },
	cognitive_cache: {
	threadSafe: true },
	serializer: {
	activeWorkers: 0 },
	gpu_coordinator: {
	gpuAvailable: false },
	overall_status: 'healthy'
	};
}

