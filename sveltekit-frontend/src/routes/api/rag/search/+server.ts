/**
 * DEPRECATED: RAG search endpoint consolidated into canonical SearchRuntime
 *
 * @deprecated Use /api/retrieval/search-unified instead
 * @see /api/retrieval/search-unified
 *
 * This route previously implemented:
 * - TF-IDF scoring
 * - Query reformulation (corrective RAG)
 * - Multi-adapter fan-out (Go retrieval, Qdrant, Postgres)
 * - Caching via Redis/Bifrost
 *
 * All of this is now handled by the canonical SearchRuntime, which provides:
 * - RRF fusion across multiple retrieval lanes (BM25, Qdrant, AST, exact symbol)
 * - Atomic reranking (no double-pass confusion)
 * - Transactional promotion (Postgres → Qdrant → Neo4j)
 * - Unified caching strategy (Redis + Bifrost)
 *
 * This redirect maintains backward compatibility for existing clients.
 */

import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const query = url.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '10', 10) || 10, 100);

  if (!query) {
    return json({ error: 'Missing query parameter: q', chunks: [] }, { status: 400 });
  }

  // Redirect to canonical endpoint
  const redirectUrl = `/api/retrieval/search-unified?q=${encodeURIComponent(query)}&topK=${limit}`;
  console.warn(`[DEPRECATED] GET /api/rag/search redirecting to ${redirectUrl}`);

  return new Response(null, {
    status: 307,
    headers: {
      'Location': redirectUrl,
      'X-Forwarded-From': '/api/rag/search (deprecated)',
      'Cache-Control': 'no-store',
    },
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json() as { query?: string; limit?: number };

    if (!body.query) {
      return json({ error: 'Missing query field', chunks: [] }, { status: 400 });
    }

    const limit = Math.min(body.limit || 10, 100);

    // Redirect to canonical endpoint
    const redirectUrl = `/api/retrieval/search-unified?q=${encodeURIComponent(body.query)}&topK=${limit}`;
    console.warn(`[DEPRECATED] POST /api/rag/search redirecting to ${redirectUrl}`);

    return new Response(null, {
      status: 307,
      headers: {
        'Location': redirectUrl,
        'X-Forwarded-From': '/api/rag/search (deprecated)',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('RAG search redirect error:', err);
    return json({ error: 'Invalid request', chunks: [] }, { status: 400 });
  }
};
