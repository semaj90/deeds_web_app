/**
 * GET /api/citations/search?q=...
 * Caller: CitationSearch.svelte
 * Searches user-saved citations and returns the snake_case shape the client expects.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { savedCitations } from '$lib/server/db/schema';
import { desc, ilike, or } from 'drizzle-orm';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';

const querySchema = z.object({
	q: z.string().max(500).default(''),
	limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const GET: RequestHandler = async ({ locals, url, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { q: query, limit } = parsed.data;

  recordSearchQuery({ query, pipeline: 'kag', cacheHit: false, userId: locals.user.id });

  if (!query.trim() || query.trim().length < 2) {
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

    const responseData = {
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
    };
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);
    return json(responseData, { headers: { ...cacheControl.private, ETag: etag } });
  } catch (err) {
    console.error('[citations/search] Failed:', err);
    return json({ success: false, error: 'Search failed', citations: [] });
  }
};
