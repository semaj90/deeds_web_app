/**
 * GET /api/analytics/summary — Weekly analytics summary for a user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getWeeklySummary } from '$lib/server/analytics/event-logger.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const querySchema = z.object({
	userId: z.string().min(1, 'userId required').max(200)
});

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'userId required' }, { status: 400 });
	}
	const { userId } = parsed.data;
	const summary = await getWeeklySummary(userId);

	const { etag, isMatch } = checkETag(summary, request.headers);
	if (isMatch) return notModified(etag);

	return json(summary, {
		headers: { ...cacheControl.medium, ETag: etag }
	});
};
