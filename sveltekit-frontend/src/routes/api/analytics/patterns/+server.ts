/**
 * GET /api/analytics/patterns — Top query patterns for a user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getTopQueryPatterns } from '$lib/server/analytics/event-logger.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const querySchema = z.object({
	userId: z.string().min(1, 'userId required').max(200),
	limit: z.coerce.number().int().min(1).max(50).default(10)
});

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'userId required' }, { status: 400 });
	}
	const { userId, limit } = parsed.data;

	const patterns = await getTopQueryPatterns(userId, limit);
	const responseData = { patterns };

	const { etag, isMatch } = checkETag(responseData, request.headers);
	if (isMatch) return notModified(etag);

	return json(responseData, {
		headers: { ...cacheControl.medium, ETag: etag }
	});
};
