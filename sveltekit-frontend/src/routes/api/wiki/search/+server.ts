import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { searchWiki } from '$lib/server/kb/wiki-logic.js';
import { z } from 'zod';

const SearchSchema = z.object({
  query: z.string().min(1),
  limit: z.coerce.number().optional().default(10)
});

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const queryParam = url.searchParams.get('query');
  const limitParam = url.searchParams.get('limit');

  const validation = SearchSchema.safeParse({ query: queryParam, limit: limitParam });
  if (!validation.success) {
    return json({ success: false, error: 'Invalid parameters', details: validation.error.format() }, { status: 400 });
  }

  const { query, limit } = validation.data;

  try {
    const results = await searchWiki(query, { limit });
    return json({ success: true, results });
  } catch (err: any) {
    console.error('[Wiki API] Search error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};
