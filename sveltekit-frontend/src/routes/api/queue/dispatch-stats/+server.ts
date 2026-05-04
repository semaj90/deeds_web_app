import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDispatchStats } from '$lib/server/queue/dispatch-inline.js';

/**
 * GET /api/queue/dispatch-stats
 *
 * Returns dispatch-inline statistics:
 * - queued: RabbitMQ was available, published to queue
 * - inline: RabbitMQ was unavailable, executed inline
 * - skipped: RabbitMQ unavailable and queue not inline-capable
 * - errors: Inline execution failed
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const stats = getDispatchStats();

	return json({
		success: true,
		stats,
		timestamp: new Date().toISOString(),
		rabbitmq: {
			status: stats.queued > 0 ? 'available' : 'unavailable or unused',
			inlineFallbackActive: stats.inline > 0
		}
	});
};