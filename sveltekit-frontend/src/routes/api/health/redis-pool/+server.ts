/**
 * GET /api/health/redis-pool
 * Redis connection pool metrics + dispatch mode statistics
 *
 * Returns:
 * - Pool stats (active connections, utilization, health breakdown)
 * - Dispatch stats (queued vs inline job execution)
 * - Individual connection statuses
 *
 * Useful for monitoring pool health and RabbitMQ fallback behavior.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redisPool } from '$lib/server/redis.js';
import { getDispatchStats } from '$lib/server/queue/dispatch-inline.js';

export const GET: RequestHandler = async () => {
	try {
		const poolStats = redisPool.getStats();
		const dispatchStats = getDispatchStats();

		// Connection health breakdown
		const healthy = poolStats.statuses.filter((s) => s.status === 'ready').length;
		const degraded = poolStats.statuses.filter(
			(s) => s.status === 'connecting' || s.status === 'reconnecting'
		).length;
		const failed = poolStats.statuses.filter(
			(s) => s.status === 'close' || s.status === 'end'
		).length;

		// Utilization percentage
		const utilization = Math.round(
			(poolStats.totalConnections / poolStats.maxConnections) * 100
		);

		// Dispatch mode (queue vs inline)
		const totalDispatched = dispatchStats.queued + dispatchStats.inline;
		const fallbackRate =
			totalDispatched > 0
				? Math.round((dispatchStats.inline / totalDispatched) * 100)
				: 0;

		return json({
			success: true,
			data: {
				status: poolStats.isShuttingDown
					? 'shutting_down'
					: healthy > 0
						? 'healthy'
						: 'degraded',
				pool: {
					active: poolStats.totalConnections,
					max: poolStats.maxConnections,
					utilization,
					currentIndex: poolStats.currentIndex,
					health: { healthy, degraded, failed },
					connections: poolStats.statuses
				},
				dispatch: {
					...dispatchStats,
					mode: dispatchStats.queued >= dispatchStats.inline ? 'queue' : 'inline',
					fallbackRate
				}
			},
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		console.error('[/api/health/redis-pool] Error:', err);
		return json(
			{
				success: false,
				data: {
					status: 'error',
					pool: null,
					dispatch: null
				},
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};
