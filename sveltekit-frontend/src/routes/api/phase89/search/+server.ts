/**
 * DEPRECATED: Phase 89 legacy search endpoint
 *
 * @deprecated Use /api/retrieval/search-unified instead
 * @see /api/retrieval/search-unified
 *
 * This route redirects to the canonical SearchRuntime endpoint.
 * Phase 89 was the old codebase indexing phase; current unified retrieval
 * includes all Phase 89 functionality plus RRF fusion and reranking.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const searchSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const q = url.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 100);

  if (!q) {
    return json({ query: '', results: [], total: 0, timestamp: new Date().toISOString() });
  }

  // Redirect to canonical endpoint
  const redirectUrl = `/api/retrieval/search-unified?q=${encodeURIComponent(q)}&topK=${limit}`;
  console.warn(`[DEPRECATED] GET /api/phase89/search redirecting to ${redirectUrl}`);

  return new Response(null, {
    status: 307,
    headers: {
      'Location': redirectUrl,
      'X-Forwarded-From': '/api/phase89/search (deprecated)',
      'Cache-Control': 'no-store',
    },
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json().catch(() => ({}));
  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success)
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

  const { query, limit } = parsed.data;

  // Redirect to canonical endpoint
  const redirectUrl = `/api/retrieval/search-unified?q=${encodeURIComponent(query)}&topK=${limit}`;
  console.warn(`[DEPRECATED] POST /api/phase89/search redirecting to ${redirectUrl}`);

  return new Response(null, {
    status: 307,
    headers: {
      'Location': redirectUrl,
      'X-Forwarded-From': '/api/phase89/search (deprecated)',
      'Cache-Control': 'no-store',
    },
  });
};
