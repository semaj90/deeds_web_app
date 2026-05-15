/**
 * POST /api/search/citations
 * Caller: WysiwygEditor.svelte
 * Searches user-saved citations and returns the editor result shape.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { savedCitations } from '$lib/server/db/schema';
import { desc, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';

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
	recordSearchQuery({ query, pipeline: 'kag', cacheHit: false, userId: locals.user.id });

	try {
		const results = await db
      .select()
      .from(savedCitations)
      .where(
        or(
          ilike(savedCitations.statuteCode, `%${query}%`),
          ilike(savedCitations.statuteTitle, `%${query}%`),
          ilike(savedCitations.highlightedText, `%${query}%`),
          ilike(savedCitations.notes, `%${query}%`)
        )
      )
      .orderBy(desc(savedCitations.createdAt))
      .limit(limit);

		const normalizedResults = results.map((citation) => ({
      id: citation.id,
      title: citation.statuteTitle ?? citation.statuteCode,
      citation: citation.highlightedText ?? citation.notes ?? citation.statuteCode,
      similarity: 1,
      metadata: {
        statuteCode: citation.statuteCode,
        jurisdiction: citation.jurisdiction ?? undefined,
        severity: citation.severity ?? undefined,
        year: citation.year ?? undefined,
        sourceType: citation.sourceType,
        notes: citation.notes ?? undefined,
      },
    }));

    return json({ success: true, results: normalizedResults, citations: normalizedResults });
	} catch (err) {
		console.error('[search/citations] Failed:', err);
		return json({ success: false, error: 'Citation search failed', results: [], citations: [] });
	}
};
