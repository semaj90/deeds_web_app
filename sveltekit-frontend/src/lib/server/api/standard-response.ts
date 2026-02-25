/**
 * Standardized API Response Utilities
 * Provides consistent response formats across all API routes
 */
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
	requestId?: string;
    timestamp?: string;
}

export interface ApiError {
	code: string;
	message: string;
	details?: unknown;
}

/**
 * Create a successful API response
 */
export function apiSuccess<T>(data: T, message?: string, requestId?: string) {
	const response: ApiResponse<T> = {
		success: true,
		data,
		timestamp: new Date().toISOString()
	};
	if (message) response.message = message;
	if (requestId) response.requestId = requestId;
	return json(response);
}

/**
 * Create an error API response
 */
export function apiError(message: string, status = 400, code?: string, details?: unknown, requestId?: string) {
	const response: ApiResponse = {
		success: false,
		error: message,
		timestamp: new Date().toISOString()
	};
	if (requestId) response.requestId = requestId;
	if (code || details) {
		// We use a different shape for error data if needed, or just specific fields
        // For simplicity reusing ApiResponse structure, but typically error details go in error object or data
        // Let's assume data can hold error details if needed or just omitted
        if (code) {
             // In a real generic response, we might not put 'code' in data directly if T is strict
             // but here ApiResponse<T> defaults to unknown.
             (response as any).code = code;
        }
        if (details) {
             (response as any).details = details;
        }
	}
	return json(response, { status });
}

/**
 * Validate request body against required fields
 */
export function validateRequest(body: any, requiredFields: string[]): string | null {
	if (typeof body !== 'object' || body === null) {
		return 'Invalid request body';
	}
	const bodyAsRecord = body as Record<string, unknown>;
	// Cast for property access after type guard
	for (const field of requiredFields) {
		if (!(field in bodyAsRecord) || bodyAsRecord[field] === null || bodyAsRecord[field] === undefined) {
			return `Missing required field: ${field}`;
		}
	}
	return null;
}

/**
 * Get request ID from locals (set by hooks.server.ts)
 */
export function getRequestId(event: RequestEvent): string {
    // Assuming event.locals has requestId. If not, generate one.
    // Use type assertion if locals type isn't globally available or updated yet
	return (event.locals as any)?.requestId || `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Create standardized cache headers
 */
export function getCacheHeaders(maxAge: number = 0) {
	if (maxAge === 0) {
		return {
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			'Pragma': 'no-cache',
			'Expires': '0'
		};
	}
	return {
		'Cache-Control': `public, max-age=${maxAge}`
	};
}

/**
 * Standardized API handler wrapper with error catching
 */
export function withErrorHandling<T extends RequestEvent>(handler: (event: T) => Promise<Response>) {
	return async (event: T): Promise<Response> => {
		const requestId = getRequestId(event);
		try {
			return await handler(event);
		} catch (error: Error | unknown) {
			const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
			const errorCode = error instanceof Object && 'code' in error && typeof (error as any).code === 'string'
				? (error as any).code
				: 'INTERNAL_ERROR';

			// Only include stack in development mode for Error instances
			const errorStack = error instanceof Error && process.env.NODE_ENV === 'development'
				? error.stack
				 : undefined;

			console.error(`API Error [${requestId}]:`, error);

			return apiError(
				errorMessage,
				500,
				errorCode,
				errorStack, // Pass stack as details in dev mode
				requestId
			);
		}
	};
}

