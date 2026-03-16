/**
 * POST /api/search/citations
 * Caller: WysiwygEditor.svelte
 * Proxies citation search for inline editor linking
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { citations } from '$lib/server/db/schema';
import { desc, ilike, or } from 'drizzle-orm';
import { z } from 'zod';

const searchSchema = z.object({
	query: z.string().min(1).max(500),
	limit: z.number().int().min(1).max(50).optional().default(10),
});

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = searchSchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { query, limit } = parsed.data;

	try {
		const results = await db.select().from(citations)
			.where(
				or(
					ilike(citations.statuteCode, `%${query}%`),
					ilike(citations.statuteTitle, `%${query}%`),
					ilike(citations.highlightedText, `%${query}%`)
				)
			)
			.orderBy(desc(citations.createdAt))
			.limit(limit);

		return json({ success: true, citations: results });
	} catch (err) {
		console.error('[search/citations] Failed:', err);
		return json({ success: false, error: 'Citation search failed', citations: [] });
	}
};