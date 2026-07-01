/**
 * Admin Retrieval Stream (Session 100 — Critical Path)
 *
 * Unified retrieval pipeline with SSE streaming:
 * - rg-pool → Qdrant → TurboVec → Postgres join → Gemma4 summary
 * - Progress streaming via canonical SSE-contract
 * - Automatic cleanup, timeout guards, proper error handling
 *
 * GET /api/admin/retrieval/stream?q=<query>&limit=<limit>
 * POST /api/admin/retrieval/stream { query, limit, use_rg_pool }
 *
 * Response: Server-Sent Events (text/event-stream)
 * Events:
 *   - data: { stage: "embedding", time_ms: 123 }
 *   - data: { stage: "rg_pool", matches: 5 }
 *   - data: { stage: "qdrant", candidates: 20 }
 *   - data: { stage: "turbovec", prefiltered: 10 }
 *   - data: { stage: "postgres_join", rows: 10 }
 *   - data: { stage: "ranking", top_score: 0.92 }
 *   - data: { stage: "gemma4", summary: "..." }
 *   - data: { complete: true, total_time_ms: 5123 }
 *   - Or: { error: "...", code: "..." } on failure
 */

import type { RequestHandler } from '@sveltejs/kit';
import { executeUnifiedRetrieval, executeUnifiedRetrievalWithSummarization } from '$lib/server/retrieval/unified-orchestrator.js';
import { createSSEResponse } from '$lib/server/streaming/sse-contract.js';

interface StreamEvent {
  stage?: string;
  time_ms?: number;
  matches?: number;
  candidates?: number;
  prefiltered?: number;
  rows?: number;
  top_score?: number;
  summary?: string;
  complete?: boolean;
  total_time_ms?: number;
  error?: string;
  code?: string;
}

async function* generateStreamEvents(query: string, limit: number = 10, useRgPool: boolean = true) {
  const startTime = Date.now();

  try {
    yield { stage: 'start', query, limit, time_ms: 0 };

    // Execute unified retrieval with progress updates
    const retrievalStart = Date.now();
    const result = await executeUnifiedRetrieval(
      {
        query,
        limit,
        useRRF: true,
        useLexical: true,
        useRgPool
      },
      {
        qdrant: { host: '127.0.0.1', port: 6333 },
        turbovec: { host: '127.0.0.1', port: 8791 },
        goRetrieval: { host: '127.0.0.1', port: 8100 },
        postgres: {
          host: process.env.POSTGRES_HOST || '127.0.0.1',
          port: parseInt(process.env.POSTGRES_PORT || '5434'),
          user: process.env.POSTGRES_USER || 'legal_admin',
          password: process.env.POSTGRES_PASSWORD || '123456',
          database: process.env.POSTGRES_DB || 'legal_ai_db'
        },
        ollama: { host: '127.0.0.1', port: 11434 },
        gemma4: { host: '127.0.0.1', port: 8090 }
      }
    );

    const retrievalTime = Date.now() - retrievalStart;

    // Stream stage completions
    for (const stage of result.stages_completed) {
      yield { stage, time_ms: retrievalTime };
    }

    // Stream candidate count
    yield {
      stage: 'ranking',
      candidates: result.candidates.length,
      top_score: result.candidates[0]?.score || 0
    };

    // Stream fallback status
    yield { fallback_used: result.fallback_used };

    // Optionally summarize top candidates
    if (result.candidates.length > 0) {
      const summaryStart = Date.now();
      const summaryResult = await executeUnifiedRetrievalWithSummarization(
        {
          query,
          limit,
          useRgPool
        }
      );

      if (summaryResult.summary) {
        yield {
          stage: 'gemma4_summary',
          summary: summaryResult.summary.summary,
          time_ms: Date.now() - summaryStart
        };
      }
    }

    // Stream completion
    yield {
      complete: true,
      total_time_ms: Date.now() - startTime,
      candidate_count: result.candidates.length,
      fallback_used: result.fallback_used
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[admin/retrieval/stream] Error:', error);
    yield {
      error,
      code: 'RETRIEVAL_FAILED'
    };
  }
}

export const GET: RequestHandler = async ({ url, request }) => {
  const query = url.searchParams.get('q');
  const limit = parseInt(url.searchParams.get('limit') ?? '10');
  const useRgPool = url.searchParams.get('use_rg_pool') !== 'false';

  if (!query || query.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Missing query parameter', code: 'INVALID_REQUEST' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Use SSE contract for streaming
  return createSSEResponse(generateStreamEvents(query, limit, useRgPool), {
    timeout: 60_000,
    keepAliveInterval: 15_000
  });
};

export const POST: RequestHandler = async ({ request }) => {
  if (request.headers.get('Content-Type') !== 'application/json') {
    return new Response(
      JSON.stringify({ error: 'Invalid content-type', code: 'INVALID_CONTENT_TYPE' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json() as {
      query?: string;
      limit?: number;
      use_rg_pool?: boolean;
    };

    const { query, limit = 10, use_rg_pool = true } = body;

    if (!query || query.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing query field', code: 'INVALID_REQUEST' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return createSSEResponse(generateStreamEvents(query, limit, use_rg_pool), {
      timeout: 60_000,
      keepAliveInterval: 15_000
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error, code: 'PARSE_ERROR' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
