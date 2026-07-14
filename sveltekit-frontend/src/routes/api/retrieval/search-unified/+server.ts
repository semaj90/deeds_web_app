/**
 * Unified Search API Route
 *
 * Entry point: GET/POST /api/retrieval/search-unified?q=...
 *
 * Single canonical endpoint for all retrieval operations.
 * Nothing else handles search. Everything flows through here.
 */

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { createSearchRuntime, SearchQuerySchema } from '$lib/server/retrieval/search-runtime.js';

export const GET: RequestHandler = async ({ url, locals }) => {
  const q = url.searchParams.get('q');
  const topK = url.searchParams.get('topK') ? parseInt(url.searchParams.get('topK')!) : 20;

  if (!q) {
    return json(
      { error: 'Missing query parameter: q' },
      { status: 400 },
    );
  }

  try {
    const runtime = createSearchRuntime({
      userId: locals.user?.id,
    });

    const result = await runtime.search({
      text: q,
      topK: Math.min(topK, 100),
    });

    return json(result);
  } catch (error) {
    console.error('Search error:', error);
    return json(
      {
        error: 'Search failed',
        packets: [],
        metadata: { query: q, candidatesRetrieved: 0, candidatesFused: 0, candidatesReranked: 0, durationMs: 0, stages: { retrieve: 0, fuse: 0, hydrate: 0, rerank: 0 } },
        provenance: { retrievalSources: [], fusionMethod: 'rrf', rerankModel: 'none', rerankerUsed: false },
      },
      { status: 500 },
    );
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const query = SearchQuerySchema.parse({
      ...body,
      userId: locals.user?.id,
    });

    const runtime = createSearchRuntime({
      userId: query.userId,
      caseId: query.caseId,
    });

    const result = await runtime.search(query);

    return json(result);
  } catch (error) {
    console.error('Search error:', error);
    return json(
      {
        error: 'Search failed',
        packets: [],
        metadata: { query: '', candidatesRetrieved: 0, candidatesFused: 0, candidatesReranked: 0, durationMs: 0, stages: { retrieve: 0, fuse: 0, hydrate: 0, rerank: 0 } },
        provenance: { retrievalSources: [], fusionMethod: 'rrf', rerankModel: 'none', rerankerUsed: false },
      },
      { status: 500 },
    );
  }
};
