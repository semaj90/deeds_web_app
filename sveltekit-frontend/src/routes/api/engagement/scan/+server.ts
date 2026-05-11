import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scanIdleUsers } from '$lib/server/engagement/idle-reengagement';
import { z } from 'zod';

const scanSchema = z.object({});

/**
 * POST /api/engagement/scan
 * Manually trigger an idle user scan (admin only).
 * Returns scan results: { scanned, notified, errors }
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json().catch(() => ({}));
	scanSchema.safeParse(body);

	const result = await scanIdleUsers();

	return json({
		success: true,
		...result,
		message: `Scanned ${result.scanned} users, sent ${result.notified} notifications`,
	});
};
