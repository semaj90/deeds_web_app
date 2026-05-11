import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordHeartbeat, getIdleDuration } from '$lib/server/engagement/idle-reengagement';
import { z } from 'zod';

const heartbeatSchema = z.object({});

/**
 * POST /api/engagement/heartbeat
 * Record user activity heartbeat for idle detection.
 * Called periodically by client telemetry (every 60s while active).
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json().catch(() => ({}));
	heartbeatSchema.safeParse(body);

	await recordHeartbeat(locals.user.id);

	return json({ success: true });
};

/**
 * GET /api/engagement/heartbeat
 * Check how long the current user has been idle.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	heartbeatSchema.safeParse(Object.fromEntries(url.searchParams));

	const idleMs = await getIdleDuration(locals.user.id);

	return json({
		userId: locals.user.id,
		idleMs,
		idleMinutes: Math.round(idleMs / 60000),
		isIdle: idleMs > 30 * 60 * 1000, // 30min threshold
	});
};
