/**
 * Multi-Vector Retrieval API Route
 *
 * Exposes the 4-lane RRF fusion endpoint for client requests.
 * POST /api/retrieval/multi-vector with query + optional RRF weights
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { executeGoRetrievalSearch, type GoRetrievalFacadeRequest } from '$lib/server/retrieval/go-retrieval-facade.js';

const MultiVectorRequestSchema = z.object({
  query: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
  rrf_weights: z.record(z.string(), z.number()).optional(),
  rrfWeights: z.record(z.string(), z.number()).optional(),
  include_summary: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  top_k: z.number().int().positive().max(200).optional(),
  topK: z.number().int().positive().max(200).optional()
}).refine((data) => Boolean(data.query || data.q), {
  message: 'query is required'
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const parsed = MultiVectorRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json(
        { error: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // Build facade request with multi-vector flag
    const facadeRequest: GoRetrievalFacadeRequest = {
      query: (body.q || body.query) as string,
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
