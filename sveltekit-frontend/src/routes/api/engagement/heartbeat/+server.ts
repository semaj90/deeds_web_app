import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordHeartbeat, getIdleDuration } from '$lib/server/engagement/idle-reengagement';

/**
 * POST /api/engagement/heartbeat
 * Record user activity heartbeat for idle detection.
 * Called periodically by client telemetry (every 60s while active).
 */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	await recordHeartbeat(locals.user.id);

	return json({ success: true });
};

/**
 * GET /api/engagement/heartbeat
 * Check how long the current user has been idle.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const idleMs = await getIdleDuration(locals.user.id);

	return json({
		userId: locals.user.id,
		idleMs,
		idleMinutes: Math.round(idleMs / 60000),
		isIdle: idleMs > 30 * 60 * 1000, // 30min threshold
	});
};
