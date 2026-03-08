import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scanIdleUsers } from '$lib/server/engagement/idle-reengagement';

/**
 * POST /api/engagement/scan
 * Manually trigger an idle user scan (admin only).
 * Returns scan results: { scanned, notified, errors }
 */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const result = await scanIdleUsers();

	return json({
		success: true,
		...result,
		message: `Scanned ${result.scanned} users, sent ${result.notified} notifications`,
	});
};
