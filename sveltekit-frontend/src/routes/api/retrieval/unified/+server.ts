/**
 * GET /api/retrieval/unified
 * POST /api/retrieval/unified
 *
 * Unified retrieval endpoint orchestrating:
 * Postgres → Embedding → Qdrant → TurboVec → Postgres join → Ranking
 *
 * Query parameters (GET):
 * - q: search query (required)
 * - limit: max results (default: 10)
 * - rrf: enable RRF fusion (default: true)
 * - lexical: include lexical/BM25 (default: false)
 * - summarize: include Gemma4 summary (default: false)
 *
 * POST body:
 * {
 *   "query": "string",
 *   "limit": number,
 *   "useRRF": boolean,
 *   "useLexical": boolean,
 *   "includeSummary": boolean,
 *   "summaryOptions": { "max_tokens": number, "temperature": number }
 * }
 */

import type { RequestHandler } from '@sveltejs/kit';
import {
  executeUnifiedRetrieval,
  executeUnifiedRetrievalWithSummarization,
  type RetrievalRequest
} from '$lib/server/retrieval/unified-orchestrator.js';

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const rrf = url.searchParams.get('rrf') !== 'false';
  const lexical = url.searchParams.get('lexical') === 'true';
  const summarize = url.searchParams.get('summarize') === 'true';

  if (!query) {
    return new Response(
      JSON.stringify({ error: 'query parameter required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const request: RetrievalRequest = {
      query,
      limit,
      useRRF: rrf,
      useLexical: lexical
    };

    if (summarize) {
      const result = await executeUnifiedRetrievalWithSummarization(request);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      const result = await executeUnifiedRetrieval(request);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (err) {
    console.error('Unified retrieval error:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
        candidates: [],
        stages_completed: [],
        fallback_used: true
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as {
      query: string;
      limit?: number;
      useRRF?: boolean;
      useLexical?: boolean;
      includeSummary?: boolean;
      summaryOptions?: { max_tokens?: number; temperature?: number };
    };

    if (!body.query) {
      return new Response(
        JSON.stringify({ error: 'query required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const retrievalRequest: RetrievalRequest = {
      query: body.query,
      limit: body.limit,
      useRRF: body.useRRF,
      useLexical: body.useLexical
    };

    if (body.includeSummary) {
      const result = await executeUnifiedRetrievalWithSummarization(retrievalRequest, undefined, body.summaryOptions);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      const result = await executeUnifiedRetrieval(retrievalRequest);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (err) {
    console.error('Unified retrieval error:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
        candidates: [],
        stages_completed: [],
        fallback_used: true
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
