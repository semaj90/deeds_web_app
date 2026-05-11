/**
 * GET /api/observability/inference-stats
 *
 * Returns inference statistics from CouchDB inference_log.
 * Aggregated by type and backend via MapReduce views.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { getStatsByType, getStatsByBackend } from '$lib/server/observability/inference-log-views.js';

export const GET: RequestHandler = async (event) => {
	const { locals } = event;
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const [byType, byBackend] = await Promise.all([
			getStatsByType(),
			getStatsByBackend(),
		]);

		return json({
			byType,
			byBackend,
			timestamp: new Date().toISOString(),
		});
	} catch {
		return json({
			byType: {},
			byBackend: {},
			timestamp: new Date().toISOString(),
		});
	}
};
