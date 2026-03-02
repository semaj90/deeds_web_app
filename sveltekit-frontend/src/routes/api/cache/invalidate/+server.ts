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

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { redisPool } from '$lib/server/redis.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Admin-only endpoint
	if (locals.user?.role !== 'admin') {
		throw error(403, 'Admin access required');
	}

	try {
		const body = await request.json();
		const { pattern } = body;

		if (!pattern || typeof pattern !== 'string') {
			throw error(400, 'Invalid pattern parameter');
		}

		// Security: Only allow specific safe patterns
		const allowedPatterns = [
			'template:*',
			'template:meta:*',
			'template:ai:*',
			'template:rendered:*',
			'llm:response:*',
			'case:*',
			'evidence:*',
			'report:*',
			'user:*',
			'embedding:*',
		];

		const isAllowed = allowedPatterns.some(allowed => {
			// Simple prefix matching for safety
			const prefix = allowed.replace('*', '');
			return pattern.startsWith(prefix);
		});

		if (!isAllowed) {
			throw error(400, `Pattern not allowed: ${pattern}. Allowed patterns: ${allowedPatterns.join(', ')}`);
		}

		const redis = redisPool.getConnection();
		const keys = await redis.keys(pattern);

		if (keys.length === 0) {
			return json({
				success: true,
				message: 'No keys found matching pattern',
				invalidated: 0,
				pattern
			});
		}

		// Invalidate keys
		await redis.del(...keys);

		console.log(`[CacheInvalidate] Invalidated ${keys.length} keys matching: ${pattern}`);

		return json({
			success: true,
			message: `Invalidated ${keys.length} cache keys`,
			invalidated: keys.length,
			pattern
		});
	} catch (err) {
		console.error('[CacheInvalidate] Error:', err);

		if (err instanceof Error && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}

		throw error(500, `Failed to invalidate cache: ${(err as Error).message}`);
	}
};
