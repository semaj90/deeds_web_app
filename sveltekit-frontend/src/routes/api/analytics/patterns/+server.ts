/**
 * GET /api/analytics/patterns — Top query patterns for a user
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getTopQueryPatterns } from '$lib/server/analytics/event-logger.js';

const querySchema = z.object({
	userId: z.string().min(1, 'userId required').max(200),
	limit: z.coerce.number().int().min(1).max(50).default(10)
});

export const GET: RequestHandler = async ({ url }) => {
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'userId required' }, { status: 400 });
	}
	const { userId, limit } = parsed.data;

	const patterns = await getTopQueryPatterns(userId, limit);
	return json({ patterns });
};
