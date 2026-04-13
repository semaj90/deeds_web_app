/**
 * GET /api/cache/exact-match/stats
 *
 * Returns Redis exact-match cache statistics for monitoring.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getExactMatchStats } from '$lib/server/cache/redis-exact-match.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

export const GET: RequestHandler = async ({ locals, request }) => {
	// Optional: require auth for cache stats
	// if (!locals.user?.id) {
	// 	return json({ error: 'Unauthorized' }, { status: 401 });
	// }

	try {
		const stats = await getExactMatchStats();

		const memoryMB = (stats.memoryUsedBytes / (1024 * 1024)).toFixed(2);
		const avgTtlMinutes = Math.round(stats.avgTtlSeconds / 60);

		const responseData = {
			success: true,
			stats: {
				totalKeys: stats.totalKeys,
				memoryUsedMB: parseFloat(memoryMB),
				avgTtlMinutes,
				rawBytes: stats.memoryUsedBytes,
				rawTtlSeconds: stats.avgTtlSeconds,
			},
			timestamp: new Date().toISOString(),
		};

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.short, ETag: etag }
		});
	} catch (err) {
		console.error('[/api/cache/exact-match/stats] Error:', err);
		const fallbackData = {
			success: false,
			error: 'Failed to retrieve cache stats',
			stats: {
				totalKeys: 0,
				memoryUsedMB: 0,
				avgTtlMinutes: 0,
				rawBytes: 0,
				rawTtlSeconds: 0,
			},
		};
		return json(fallbackData, {
			headers: cacheControl.short
		});
	}
};