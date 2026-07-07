/**
 * Multi-Vector Retrieval API Route
 *
 * Exposes the 4-lane RRF fusion endpoint for client requests.
 * POST /api/retrieval/multi-vector with query + optional RRF weights
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { executeGoRetrievalSearch, type GoRetrievalFacadeRequest } from '$lib/server/retrieval/go-retrieval-facade.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    // Validate request
    if (!body.query || typeof body.query !== 'string') {
      return json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 }
      );
    }

    // Build facade request with multi-vector flag
    const facadeRequest: GoRetrievalFacadeRequest = {
      query: body.q || body.query,
      useMultiVector: true,
      rrfWeights: body.rrf_weights || body.rrfWeights,
      includeSummary: body.include_summary ?? body.includeSummary ?? false,
      topK: body.top_k ?? body.topK ?? 10
    };

    // Execute retrieval
    const response = await executeGoRetrievalSearch(facadeRequest, facadeRequest.includeSummary);

    return json(response);
  } catch (err) {
    console.error('[multi-vector-api] error:', err);

    // Return graceful degradation
    return json(
      {
        results: [],
        timing: {
          embedding_ms: 0,
          qdrant_search_ms: 0,
          turbovec_transform_ms: 0,
          postgres_join_ms: 0,
          total_ms: 0,
          multi_vector_ms: 0
        },
        stages_completed: [],
        fallback_used: true,
        multi_vector_used: true,
        metadata: {
          query: '',
          query_embedding_dim: 0,
          qdrant_candidates: 0,
          turbovec_candidates: 0,
          postgres_join_count: 0,
          top_k: 0
        }
      }
    );
  }
};
