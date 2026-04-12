/**
 * HTTP Cache-Control Header Helpers
 *
 * Apply appropriate cache directives to API responses for performance
 *
 * Usage:
 *   import { cacheControl } from '$lib/server/middleware/cache-headers.js';
 *
 *   export const GET: RequestHandler = async () => {
 *     const data = await fetchData();
 *     return json(data, {
 *       headers: cacheControl.short
 *     });
 *   };
 */

export type CacheStrategy =
	| 'no-cache' // Always revalidate (mutations, user-specific data)
	| 'private' // User-specific, can cache in browser only
	| 'short' // 1 minute cache (frequently changing data)
	| 'medium' // 5 minutes cache (moderately dynamic data)
	| 'long' // 1 hour cache (stable reference data)
	| 'immutable'; // Never changes (versioned assets)

/**
 * Cache-Control header presets
 *
 * Use these as response headers for appropriate caching behavior
 */
export const cacheControl: Record<CacheStrategy, Record<string, string>> = {
	/** Always revalidate - for mutations, real-time data, user actions */
	'no-cache': {
		'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
		Pragma: 'no-cache',
		Expires: '0',
	},

	/** Private - browser cache only, not CDN (user-specific data) */
	private: {
		'Cache-Control': 'private, max-age=300', // 5 min browser cache
	},

	/** Short cache - 1 minute (frequently changing, low staleness tolerance) */
	short: {
		'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=30',
	},

	/** Medium cache - 5 minutes (moderately dynamic data) */
	medium: {
		'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=120',
	},

	/** Long cache - 1 hour (stable reference data, legal corpus, etc.) */
	long: {
		'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=1800',
	},

	/** Immutable - never changes (hashed assets, versioned content) */
	immutable: {
		'Cache-Control': 'public, max-age=31536000, immutable', // 1 year
	},
};

/**
 * Apply cache headers to a Response object
 *
 * @param response - Response to add headers to
 * @param strategy - Cache strategy to apply
 * @returns Response with cache headers
 */
export function withCacheHeaders(response: Response, strategy: CacheStrategy): Response {
	const headers = new Headers(response.headers);
	const cacheHeaders = cacheControl[strategy];

	for (const [key, value] of Object.entries(cacheHeaders)) {
		headers.set(key, value);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/**
 * Route-specific cache strategy recommendations
 *
 * Use these as guidelines when adding cache headers to routes
 */
export const CacheStrategyRecommendations = {
	/** Health checks - short cache (don't want stale health data) */
	health: 'short' as CacheStrategy,

	/** List endpoints - medium cache (paginated lists, search results) */
	lists: 'medium' as CacheStrategy,

	/** Reference data - long cache (legal corpus, statutes, court opinions) */
	reference: 'long' as CacheStrategy,

	/** User-specific data - private cache (user profile, user cases) */
	userSpecific: 'private' as CacheStrategy,

	/** Mutations - no cache (POST/PUT/PATCH/DELETE) */
	mutations: 'no-cache' as CacheStrategy,

	/** Real-time data - no cache (SSE, live updates) */
	realtime: 'no-cache' as CacheStrategy,

	/** Static exports - long cache (generated reports, exports) */
	exports: 'long' as CacheStrategy,

	/** Search results - short cache (query-dependent, changes frequently) */
	search: 'short' as CacheStrategy,

	/** Analytics - medium cache (aggregated data, not critical staleness) */
	analytics: 'medium' as CacheStrategy,
} as const;

/**
 * Conditional caching based on authentication status
 *
 * @param hasAuth - Whether user is authenticated
 * @returns Appropriate cache strategy
 */
export function conditionalCache(hasAuth: boolean): CacheStrategy {
	return hasAuth ? 'private' : 'short';
}

/**
 * ETag-based caching helper
 *
 * Generates weak ETag from data and checks If-None-Match header
 *
 * @param data - Data to generate ETag from
 * @param requestHeaders - Request headers (to check If-None-Match)
 * @returns Object with { etag, isMatch } for 304 responses
 */
export function checkETag(data: unknown, requestHeaders: Headers): { etag: string; isMatch: boolean } {
	const dataString = typeof data === 'string' ? data : JSON.stringify(data);
	const hash = simpleHash(dataString);
	const etag = `W/"${hash}"`;
	const ifNoneMatch = requestHeaders.get('If-None-Match');
	const isMatch = ifNoneMatch === etag;

	return { etag, isMatch };
}

/**
 * Simple hash function for ETag generation
 * (FNV-1a hash - fast, good distribution)
 */
function simpleHash(str: string): string {
	let hash = 2166136261;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

/**
 * Return 304 Not Modified response
 *
 * @param etag - ETag value to include in response
 * @returns 304 Response
 */
export function notModified(etag: string): Response {
	return new Response(null, {
		status: 304,
		headers: {
			ETag: etag,
			'Cache-Control': 'public, max-age=300',
		},
	});
}
