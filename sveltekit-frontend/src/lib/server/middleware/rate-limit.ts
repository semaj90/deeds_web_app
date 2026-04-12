/**
 * Rate Limiting Middleware
 *
 * Distributed rate limiting using Redis sliding window algorithm
 *
 * Usage:
 *   import { rateLimit } from '$lib/server/middleware/rate-limit.js';
 *
 *   export const POST: RequestHandler = async (event) => {
 *     const limited = await rateLimit(event, { maxRequests: 10, windowSec: 60 });
 *     if (limited) {
 *       return json({ error: 'Too many requests' }, {
 *         status: 429,
 *         headers: { 'Retry-After': '60' }
 *       });
 *     }
 *     // ... normal handler logic
 *   };
 */

import type { RequestEvent } from '@sveltejs/kit';
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';

export interface RateLimitConfig {
	/** Maximum requests allowed in the time window */
	maxRequests: number;
	/** Time window in seconds */
	windowSec: number;
	/** Custom key prefix (default: 'ratelimit') */
	keyPrefix?: string;
	/** Custom identifier function (default: IP address) */
	getIdentifier?: (event: RequestEvent) => string;
}

export interface RateLimitResult {
	/** Whether the request should be rate-limited */
	limited: boolean;
	/** Number of requests made in current window */
	count: number;
	/** Maximum allowed requests */
	limit: number;
	/** Seconds until window resets */
	resetIn: number;
	/** Remaining requests in current window */
	remaining: number;
}

/**
 * Rate limit check using Redis sliding window
 *
 * @param event - SvelteKit RequestEvent
 * @param config - Rate limit configuration
 * @returns RateLimitResult with limit status and metadata
 */
export async function rateLimit(
	event: RequestEvent,
	config: RateLimitConfig
): Promise<RateLimitResult> {
	const { maxRequests, windowSec, keyPrefix = 'ratelimit', getIdentifier } = config;

	// Get client identifier (IP address by default)
	const identifier = getIdentifier
		? getIdentifier(event)
		: event.getClientAddress() || 'unknown';

	// Build Redis key: ratelimit:{route}:{identifier}
	const routePath = event.route.id || event.url.pathname;
	const key = `${keyPrefix}:${routePath}:${identifier}`;

	const redis: Redis = getRedis();
	const now = Date.now();
	const windowMs = windowSec * 1000;
	const windowStart = now - windowMs;

	try {
		// Sliding window algorithm using sorted sets
		// 1. Remove old entries outside the window
		await redis.zremrangebyscore(key, '-inf', windowStart);

		// 2. Count current window entries
		const count = await redis.zcard(key);

		// 3. If under limit, add current timestamp
		if (count < maxRequests) {
			await redis.zadd(key, now, `${now}`);
			await redis.expire(key, windowSec);

			return {
				limited: false,
				count: count + 1,
				limit: maxRequests,
				resetIn: windowSec,
				remaining: maxRequests - count - 1,
			};
		}

		// 4. Over limit - calculate when window resets
		const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
		const oldestTimestamp = oldestEntry[1] ? parseInt(oldestEntry[1]) : now;
		const resetIn = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

		return {
			limited: true,
			count,
			limit: maxRequests,
			resetIn: Math.max(resetIn, 1),
			remaining: 0,
		};
	} catch (error) {
		console.error('[RateLimit] Redis error:', error);
		// On Redis failure, allow the request (fail open)
		return {
			limited: false,
			count: 0,
			limit: maxRequests,
			resetIn: windowSec,
			remaining: maxRequests,
		};
	}
}

/**
 * Helper: Apply rate limiting and return error response if limited
 *
 * @param event - SvelteKit RequestEvent
 * @param config - Rate limit configuration
 * @returns null if allowed, Response if rate-limited
 *
 * Usage:
 *   const rateLimited = await rateLimitOrRespond(event, { maxRequests: 10, windowSec: 60 });
 *   if (rateLimited) return rateLimited;
 */
export async function rateLimitOrRespond(
	event: RequestEvent,
	config: RateLimitConfig
): Promise<Response | null> {
	const result = await rateLimit(event, config);

	if (result.limited) {
		return new Response(
			JSON.stringify({
				error: 'Too Many Requests',
				message: `Rate limit exceeded. Try again in ${result.resetIn} seconds.`,
				limit: result.limit,
				resetIn: result.resetIn,
			}),
			{
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': result.resetIn.toString(),
					'X-RateLimit-Limit': result.limit.toString(),
					'X-RateLimit-Remaining': result.remaining.toString(),
					'X-RateLimit-Reset': result.resetIn.toString(),
				},
			}
		);
	}

	return null;
}

/**
 * Preset configurations for common use cases
 */
export const RateLimitPresets = {
	/** Strict: 5 requests per minute */
	strict: { maxRequests: 5, windowSec: 60 },

	/** Standard: 10 requests per minute */
	standard: { maxRequests: 10, windowSec: 60 },

	/** Relaxed: 30 requests per minute */
	relaxed: { maxRequests: 30, windowSec: 60 },

	/** High traffic: 100 requests per minute */
	highTraffic: { maxRequests: 100, windowSec: 60 },

	/** AI endpoints: 20 requests per 5 minutes */
	aiEndpoint: { maxRequests: 20, windowSec: 300 },

	/** Authentication: 5 requests per 15 minutes */
	authentication: { maxRequests: 5, windowSec: 900 },

	/** Search: 50 requests per minute */
	search: { maxRequests: 50, windowSec: 60 },
} as const;
