/**
 * GET /api/library/suggestions?q=...
 *
 * Autocomplete suggestions for library search.
 * Fast-path: Go search service /suggest (heading + citation + document title).
 * Fallback:  Inline SQL (ILIKE on headings + citation_labels + document titles).
 *
 * Response: { suggestions: Array<{ suggestion: string; source: string }> }
 */

import { json }            from '@sveltejs/kit';
import { z }               from 'zod';
import { pool }            from '$lib/server/db/client';
import { ENV }             from '$lib/server/env.server.js';
import { cacheControl }    from '$lib/server/middleware/cache-headers.js';
import type { RequestHandler } from './$types';

const QuerySchema = z.object({
  q: z.string().min(1).max(200),
});

const GO_SEARCH_URL = ENV.GO_SEARCH_URL || '';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) return json({ suggestions: [] }, { status: 401 });

  const parsed = QuerySchema.safeParse({ q: url.searchParams.get('q')?.trim() ?? '' });
  if (!parsed.success) return json({ suggestions: [] });

  const { q } = parsed.data;

  // Fast-path: Go search service /suggest
  if (GO_SEARCH_URL) {
    try {
      const res = await fetch(
        `${GO_SEARCH_URL}/suggest?q=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (res.ok) {
        const data = await res.json() as { suggestions: unknown[] };
        return json(
          { suggestions: data.suggestions ?? [] },
          { headers: cacheControl.short },
        );
      }
    } catch {
      // Fall through to inline SQL
    }
  }

  // Fallback: inline SQL
  try {
    const pattern = `${q}%`;
    const res = await pool.query<{ suggestion: string; source: string }>(
      `SELECT suggestion, source FROM (
         SELECT DISTINCT heading AS suggestion, 'heading' AS source
           FROM legal_nodes
          WHERE heading ILIKE $1
          LIMIT 5
         UNION ALL
         SELECT DISTINCT citation_label, 'citation'
           FROM legal_nodes
          WHERE citation_label ILIKE $1
            AND citation_label IS NOT NULL
          LIMIT 5
         UNION ALL
         SELECT DISTINCT title, 'document'
           FROM library_documents
          WHERE title ILIKE $1
          LIMIT 5
       ) s
       ORDER BY source, suggestion
       LIMIT 15`,
      [pattern],
    );
    return json({ suggestions: res.rows }, { headers: cacheControl.short });
  } catch (err) {
    console.error('[library/suggestions] SQL fallback failed:', (err as Error).message);
    return json({ suggestions: [] });
  }
};
