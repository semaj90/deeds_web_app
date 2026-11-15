import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { responseFeedback } from '$lib/server/db/schema/search-analytics.js';

const queryHashSchema = z.string().min(1).max(128);
const feedbackBodySchema = z.object({
	queryHash: queryHashSchema,
	rating: z.enum(['up', 'down']).nullable(),
	pipeline: z.string().max(100).optional(),
	chunkIds: z.array(z.string().max(200)).max(500).optional(),
});

function numericUserId(value: string | undefined): number | null {
	if (!value) return null;
	const id = Number(value);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function readFeedback(queryHash: string, userId: number) {
	const [counts] = await db
		.select({
			up: sql<number>`count(*) FILTER (WHERE ${responseFeedback.rating} = 'up')::int`,
			down: sql<number>`count(*) FILTER (WHERE ${responseFeedback.rating} = 'down')::int`,
		})
		.from(responseFeedback)
		.where(eq(responseFeedback.queryHash, queryHash));

	const [ownVote] = await db
		.select({ rating: responseFeedback.rating })
		.from(responseFeedback)
		.where(and(
			eq(responseFeedback.queryHash, queryHash),
			eq(responseFeedback.userId, userId),
		))
		.limit(1);

	return {
		counts: { up: Number(counts?.up ?? 0), down: Number(counts?.down ?? 0) },
		rating: ownVote?.rating === 'up' || ownVote?.rating === 'down' ? ownVote.rating : null,
	};
}

/** Read the aggregate and current user's rating for one response hash. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const userId = numericUserId(locals.user?.id);
	if (userId === null) return json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

	const parsedHash = queryHashSchema.safeParse(url.searchParams.get('hash'));
	if (!parsedHash.success) return json({ error: 'Invalid hash' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });

	try {
		return json(await readFeedback(parsedHash.data, userId), { headers: { 'Cache-Control': 'no-store' } });
	} catch (err) {
		console.error('[response-feedback] read failed:', err);
		return json({ error: 'Unable to load feedback' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
	}
};

/** Upsert or remove this user's vote without changing the append-only analytics endpoint. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = numericUserId(locals.user?.id);
	if (userId === null) return json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

	const parsed = feedbackBodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: 'Invalid feedback' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });

	const { queryHash, rating, pipeline, chunkIds = [] } = parsed.data;
	try {
		if (rating === null) {
			await db.delete(responseFeedback).where(and(
				eq(responseFeedback.queryHash, queryHash),
				eq(responseFeedback.userId, userId),
			));
		} else {
			await db.insert(responseFeedback).values({
				queryHash,
				userId,
				rating,
				pipeline: pipeline ?? null,
				chunkIds,
			}).onConflictDoUpdate({
				target: [responseFeedback.queryHash, responseFeedback.userId],
				set: { rating, pipeline: pipeline ?? null, chunkIds, createdAt: new Date() },
			});
		}

		return json(await readFeedback(queryHash, userId), { headers: { 'Cache-Control': 'no-store' } });
	} catch (err) {
		console.error('[response-feedback] write failed:', err);
		return json({ error: 'Unable to save feedback' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
	}
};
