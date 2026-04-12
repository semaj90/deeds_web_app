/**
 * GET /api/analytics/token-usage
 * Returns aggregated token usage stats.
 * Query params: ?days=30&userId=uuid
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { getTokenUsageStats } from '$lib/server/ai/token-tracker.js';

const querySchema = z.object({
	days: z.coerce.number().int().min(1).max(365).default(30),
	userId: z.string().max(100).nullish(),
});

export const GET: RequestHandler = async ({ locals, url, request }) => {
	if (!locals.user) {
		return json({ success: false, data: null }, {
			headers: cacheControl.short
		});
	}

	const parsed = querySchema.safeParse({
		days: url.searchParams.get('days') ?? undefined,
		userId: url.searchParams.get('userId'),
	});
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
	}

	const stats = await getTokenUsageStats({
		userId: parsed.data.userId ?? undefined,
		sinceDaysAgo: parsed.data.days,
	});

	const responseData = { success: true, data: stats };

	const { etag, isMatch } = checkETag(responseData, request.headers);
	if (isMatch) return notModified(etag);

	return json(responseData, {
		headers: { ...cacheControl.short, ETag: etag }
	});
};
