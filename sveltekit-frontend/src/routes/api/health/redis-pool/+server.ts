/**
 * GET /api/health/redis-pool
 * Returns Redis connection pool statistics
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redisPool } from '$lib/server/redis';

export const GET: RequestHandler = async () => {
	try {
		const stats = redisPool.getStats();

		return json({
			success: true,
			data: {
				pool: stats,
				healthy: stats.totalConnections > 0 && !stats.isShuttingDown,
				utilizationPercent: Math.round((stats.totalConnections / stats.maxConnections) * 100)
			},
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : 'Unknown error',
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};
