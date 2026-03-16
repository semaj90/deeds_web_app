/**
 * GET /api/citations/search?q=...
 * Caller: CitationSearch.svelte
 * Proxies to main /api/citations with query-based filtering
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { citations } from '$lib/server/db/schema';
import { desc, ilike, or, sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const query = url.searchParams.get('q')?.trim();
	const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);

	if (!query || query.length < 2) {
		return json({ success: true, citations: [] });
	}

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
		console.error('[citations/search] Failed:', err);
		return json({ success: false, error: 'Search failed', citations: [] });
	}
};
