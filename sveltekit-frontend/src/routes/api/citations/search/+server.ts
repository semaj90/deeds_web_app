/**
 * GET /api/citations/search?q=...
 * Caller: CitationSearch.svelte
 * Searches user-saved citations and returns the snake_case shape the client expects.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { savedCitations } from '$lib/server/db/schema';
import { desc, ilike, or } from 'drizzle-orm';

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

		return json({
      success: true,
      citations: results.map((citation) => ({
        id: citation.id,
        statute_code: citation.statuteCode,
        statute_title: citation.statuteTitle ?? undefined,
        jurisdiction: citation.jurisdiction ?? undefined,
        severity: citation.severity ?? undefined,
        year: citation.year ?? undefined,
        source_type: citation.sourceType,
        highlighted_text: citation.highlightedText ?? undefined,
        notes: citation.notes ?? undefined,
        created_at:
          citation.createdAt instanceof Date
            ? citation.createdAt.toISOString()
            : String(citation.createdAt),
      })),
    });
	} catch (err) {
		console.error('[citations/search] Failed:', err);
		return json({ success: false, error: 'Search failed', citations: [] });
	}
};
