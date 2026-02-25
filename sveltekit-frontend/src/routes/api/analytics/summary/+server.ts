/**
 * GET /api/analytics/summary — Weekly analytics summary for a user
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { getWeeklySummary } from '$lib/server/analytics/event-logger.js';

export const GET: RequestHandler = async ({ url }) => {
	const userId = url.searchParams.get('userId') ?? '';
	if (!userId) {
		return json({ error: 'userId required' }, { status: 400 });
	}
	const summary = await getWeeklySummary(userId);
	return json(summary);
};
