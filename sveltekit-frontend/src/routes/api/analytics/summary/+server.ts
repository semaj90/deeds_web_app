/**
 * GET /api/analytics/summary — Weekly analytics summary for a user
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getWeeklySummary } from '$lib/server/analytics/event-logger.js';

const querySchema = z.object({
	userId: z.string().min(1, 'userId required').max(200)
});

export const GET: RequestHandler = async ({ url }) => {
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'userId required' }, { status: 400 });
	}
	const { userId } = parsed.data;
	const summary = await getWeeklySummary(userId);
	return json(summary);
};
