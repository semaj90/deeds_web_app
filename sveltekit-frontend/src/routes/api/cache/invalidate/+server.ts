/**
 * Cache Invalidation API
 * POST /api/cache/invalidate
 *
 * Manually invalidate cache keys by pattern.
 * Body: { pattern: string }
 *
 * Examples:
 * - { pattern: "template:*" } - Invalidate all template caches
 * - { pattern: "llm:response:*" } - Invalidate all LLM response caches
 * - { pattern: "case:*" } - Invalidate all case caches
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { z } from 'zod';

const ALLOWED_PREFIXES = [
	'template:', 'report:export:', 'llm:response:', 'llm:exact:',
	'case:', 'evidence:', 'report:', 'user:', 'embedding:'
] as const;

const cacheInvalidateSchema = z.object({
	pattern: z.string().min(1, 'Pattern is required').max(200).optional(),
	tier: z.enum(['redis', 'all']).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	// Optional: Admin-only endpoint (commented out for cache monitoring widget)
	// if (locals.user?.role !== 'admin') {
	// 	throw error(403, 'Admin access required');
	// }

	try {
		const raw = await request.json();
		const parsed = cacheInvalidateSchema.safeParse(raw);
		if (!parsed.success) {
			throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
		}
		const { pattern: rawPattern, tier } = parsed.data;

		// Default to LLM exact-match cache if tier=redis specified
		let pattern = rawPattern ?? 'llm:exact:*';
		if (tier === 'redis' && !rawPattern) {
			pattern = 'llm:exact:*';
		}

		// Validate pattern prefix
		const hasValidPrefix = ALLOWED_PREFIXES.some(prefix => pattern.startsWith(prefix));
		if (!hasValidPrefix) {
			throw error(400, `Pattern must start with an allowed prefix: ${ALLOWED_PREFIXES.join(', ')}`);
		}

		const redis: Redis = getRedis();

		// Use SCAN instead of KEYS for production safety (non-blocking)
		const keys: string[] = [];
		let cursor = '0';
		do {
			const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
			cursor = result[0];
			keys.push(...result[1]);
		} while (cursor !== '0');

		if (keys.length === 0) {
			return json({
				success: true,
				message: 'No keys found matching pattern',
				invalidated: 0,
				pattern,
				tier: tier ?? 'redis'
			});
		}

		// Invalidate keys
		await redis.del(...keys);

		console.log(`[CacheInvalidate] Invalidated ${keys.length} keys matching: ${pattern}`);

		return json({
			success: true,
			message: `Invalidated ${keys.length} cache keys`,
			invalidated: keys.length,
			pattern,
			tier: tier ?? 'redis'
		});
	} catch (err) {
		console.error('[CacheInvalidate] Error:', err);

		if (err instanceof Error && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}

		throw error(500, 'Failed to invalidate cache');
	}
};
