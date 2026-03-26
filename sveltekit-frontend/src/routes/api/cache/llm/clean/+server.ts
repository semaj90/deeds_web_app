/**
 * POST /api/cache/llm/clean
 * Clean expired LLM cache entries
 * Can be called periodically via cron/scheduler
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cleanExpiredCache } from '$lib/server/ai/llm-cache.js';

export const POST: RequestHandler = async ({ locals }) => {
	// Optional: Require authentication for cache cleanup
	if (!locals.user) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const result = await cleanExpiredCache();

		return json({
			success: true,
			deleted: result.deleted,
			message: `Cleaned ${result.deleted} expired cache entries`,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('[Cache Cleanup] Error:', error);
		return json(
			{
				success: false,
				error: 'Cache cleanup failed',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};
