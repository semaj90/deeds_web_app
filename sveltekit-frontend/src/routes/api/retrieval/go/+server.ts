/**
 * POST /api/retrieval/go
 * GET  /api/retrieval/go/health
 *
 * Go Retrieval Facade endpoint that exposes unified orchestrator through HTTP.
 * Clients call this instead of managing five independent services.
 *
 * POST /api/retrieval/go
 *   Body: { query, limit, useRRF, includeSummary, ... }
 *   Response: { results[], summary?, timing, stages_completed, fallback_used }
 *
 * GET /api/retrieval/go/health
 *   Response: { ok: boolean, services: {}, details: {} }
 */

import type { RequestHandler } from '@sveltejs/kit';
import {
  executeGoRetrievalSearch,
  checkGoRetrievalHealth,
  type GoRetrievalFacadeRequest
} from '$lib/server/retrieval/go-retrieval-facade.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as GoRetrievalFacadeRequest;

    if (!body.query) {
      return new Response(
        JSON.stringify({ error: 'query required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const includeSummary = body.includeSummary ?? body.include_summary ?? false;
    const result = await executeGoRetrievalSearch(body, includeSummary);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[go-retrieval-api] POST error:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
        results: [],
        stages_completed: [],
        fallback_used: true
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const GET: RequestHandler = async ({ url }) => {
  const path = url.pathname;

  // Health check endpoint
  if (path.endsWith('/health')) {
    try {
      const health = await checkGoRetrievalHealth();
      return new Response(JSON.stringify(health), {
        status: health.ok ? 200 : 503,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      console.error('[go-retrieval-api] health check error:', err);
      return new Response(
        JSON.stringify({
          ok: false,
          services: {},
          details: { error: err instanceof Error ? err.message : 'Unknown error' }
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Search endpoint (GET with query parameter)
  const query = url.searchParams.get('q');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const useRRF = url.searchParams.get('rrf') !== 'false';
  const useLexical = url.searchParams.get('lexical') === 'true';
  const includeSummary = url.searchParams.get('summarize') === 'true';

  if (!query) {
    return new Response(
      JSON.stringify({ error: 'q parameter required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const request: GoRetrievalFacadeRequest = {
      query,
      limit,
      useRRF,
      useLexical,
      includeSummary
    };

    const result = await executeGoRetrievalSearch(request, includeSummary);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[go-retrieval-api] GET error:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
        results: [],
        stages_completed: [],
        fallback_used: true
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
