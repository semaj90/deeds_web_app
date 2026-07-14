/**
 * DEPRECATED: This endpoint has been consolidated into the canonical SearchRuntime.
 *
 * @deprecated Use /api/retrieval/search-unified instead
 * @see /api/retrieval/search-unified
 *
 * This route now redirects to /api/retrieval/search-unified to maintain backward compatibility
 * while eliminating duplicate code paths. The canonical unified retrieval runtime is the only
 * production control plane for code search.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
  const q = url.searchParams.get('q');
  const limit = url.searchParams.get('limit') || '10';

  if (!q) {
    return json({ error: 'Missing query parameter: q' }, { status: 400 });
  }

  // Build redirect URL to canonical endpoint
  const redirectUrl = `/api/retrieval/search-unified?q=${encodeURIComponent(q)}&topK=${limit}`;

  console.warn(`[DEPRECATED] GET /api/retrieval/unified redirecting to ${redirectUrl}`);

  // HTTP 307 temporary redirect (maintain GET method)
  return new Response(null, {
    status: 307,
    headers: {
      'Location': redirectUrl,
      'X-Forwarded-From': '/api/retrieval/unified (deprecated)',
      'Cache-Control': 'no-store',
    },
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = (await request.json()) as {
      query: string;
      limit?: number;
    };

    if (!body.query) {
      return json({ error: 'query required' }, { status: 400 });
    }

    // Build redirect URL to canonical endpoint
    const limit = body.limit || 10;
    const redirectUrl = `/api/retrieval/search-unified?q=${encodeURIComponent(body.query)}&topK=${limit}`;

    console.warn(`[DEPRECATED] POST /api/retrieval/unified redirecting to ${redirectUrl}`);

    // HTTP 307 temporary redirect (maintain POST method)
    return new Response(null, {
      status: 307,
      headers: {
        'Location': redirectUrl,
        'X-Forwarded-From': '/api/retrieval/unified (deprecated)',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Unified retrieval redirect error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
