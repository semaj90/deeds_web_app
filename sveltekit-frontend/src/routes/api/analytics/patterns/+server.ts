/**
 * GET /api/analytics/patterns — Top query patterns for a user
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { getTopQueryPatterns } from '$lib/server/analytics/event-logger.js';

export const GET: RequestHandler = async ({ url }) => {
	const userId = url.searchParams.get('userId') ?? '';
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 10), 50);

	if (!userId) {
		return json({ error: 'userId required' }, { status: 400 });
	}

	const patterns = await getTopQueryPatterns(userId, limit);
	return json({ patterns });
};
