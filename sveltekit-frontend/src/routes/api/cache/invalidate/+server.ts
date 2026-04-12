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
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { z } from 'zod';

const ALLOWED_PREFIXES = [
	'template:', 'report:export:', 'llm:response:',
	'case:', 'evidence:', 'report:', 'user:', 'embedding:'
] as const;

const cacheInvalidateSchema = z.object({
	pattern: z.string().min(1, 'Pattern is required').max(200)
		.refine(
			(p) => ALLOWED_PREFIXES.some(prefix => p.startsWith(prefix)),
			{ message: 'Pattern must start with an allowed prefix (template:, case:, evidence:, report:, user:, embedding:, llm:response:)' }
		)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	// Admin-only endpoint
	if (locals.user?.role !== 'admin') {
		throw error(403, 'Admin access required');
	}

	try {
		const raw = await request.json();
		const parsed = cacheInvalidateSchema.safeParse(raw);
		if (!parsed.success) {
			throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
		}
		const { pattern } = parsed.data;

		const redis: Redis = getRedis();
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

		throw error(500, 'Failed to invalidate cache');
	}
};
