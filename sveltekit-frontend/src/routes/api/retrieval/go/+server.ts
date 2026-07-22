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
import { z } from 'zod';
import {
  executeGoRetrievalSearch,
  checkGoRetrievalHealth,
  type GoRetrievalFacadeRequest
} from '$lib/server/retrieval/go-retrieval-facade.js';
import { CanonicalEnvelopeSchema } from '$lib/server/topology/canonical-id-hierarchy.js';
import {
  RetrievalSearchRequestSchema,
  RETRIEVAL_LIMITS,
  SearchMetadataFilterSchema
} from '$lib/server/retrieval/search-contract.js';

const GoRetrievalRequestSchema = RetrievalSearchRequestSchema.extend({
  limit: z.number().int().positive().max(RETRIEVAL_LIMITS.maxFinalResults).optional(),
  topK: z.number().int().positive().max(RETRIEVAL_LIMITS.maxTopKPerLane).optional(),
  top_k: z.number().int().positive().max(RETRIEVAL_LIMITS.maxTopKPerLane).optional(),
  useRRF: z.boolean().optional(),
  use_rrf: z.boolean().optional(),
  useLexical: z.boolean().optional(),
  use_lexical: z.boolean().optional(),
  useMultiVector: z.boolean().optional(),
  use_multi_vector: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  include_summary: z.boolean().optional(),
  summaryMaxTokens: z.number().int().positive().max(1024).optional(),
  summary_max_tokens: z.number().int().positive().max(1024).optional(),
  summaryTemperature: z.number().finite().min(0).max(2).optional(),
  summary_temperature: z.number().finite().min(0).max(2).optional(),
  filters: SearchMetadataFilterSchema.optional(),
  caseId: z.string().optional(),
  case_id: z.string().optional()
}).strict();

const RetrievalResponseSchema = z.object({
  candidates: z.array(
    CanonicalEnvelopeSchema.extend({
      packet_key: z.string(),
      source_ref: z.string(),
      rrf_score: z.number(),
      identity_lane: z.enum(['canonical', 'recoverable', 'quarantine']).optional()
    })
  ).optional()
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = GoRetrievalRequestSchema.parse(await request.json()) as GoRetrievalFacadeRequest;

    if (!body.query) {
      return new Response(
        JSON.stringify({ error: 'query required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const includeSummary = body.includeSummary ?? body.include_summary ?? false;
    const result = await executeGoRetrievalSearch(body, includeSummary);

    // Validate response envelope
    try {
      RetrievalResponseSchema.parseAsync(result).catch((validationErr) => {
        console.warn('[go-retrieval-api] response validation warning:', validationErr.message);
        // Non-blocking — log but continue
      });
    } catch (_) {
      // Validation errors are informational only
    }

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
  const limit = parseInt(url.searchParams.get('limit') || String(RETRIEVAL_LIMITS.defaultFinalResults), 10);
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
    const request = GoRetrievalRequestSchema.parse({
      query,
      limit,
      useRRF,
      useLexical,
      includeSummary
    }) as GoRetrievalFacadeRequest;

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
