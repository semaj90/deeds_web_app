import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { assembleACEContext } from '$lib/server/ace/context-assembler.js';

const queryRequestSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(50).optional().default(5),
  userId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const startedAt = performance.now();
  try {
    const body = await request.json().catch(() => ({}));
    const parse = queryRequestSchema.safeParse(body);
    if (!parse.success) {
      return json({
        ok: false,
        error: 'Validation failed',
        details: parse.error.format()
      }, { status: 400 });
    }

    const { query, limit, userId, caseId, conversationId } = parse.data;

    // Execute multi-lane RAG retrieval + 4x4 matrix tensor routing
    const context = await assembleACEContext({
      query,
      userId: userId || undefined,
      caseId: caseId || undefined,
      conversationId: conversationId || undefined
    });

    if (!context) {
      return json({
        ok: false,
        error: 'Retrieval pipeline failed to execute'
      }, { status: 500 });
    }

    const latencyMs = Math.round(performance.now() - startedAt);

    // Apply the requested limit to the retrieved context chunks
    const rawResults = context.codebaseContext || context.ragChunks || [];
    const results = limit ? rawResults.slice(0, limit) : rawResults;

    return json({
      ok: true,
      query_id: crypto.randomUUID(),
      query,
      results,
      routing: {
        dispatch: context.multiLane?.lanesHit ?? [],
        weights: {
          qdrant: context.cachePlanner ? 0.8 : 0.2,
          postgres: 0.1,
          neo4j: context.kagNeighbors ? 0.3 : 0.0,
          mcp: 0.0
        },
        explanation: context.multiLane?.synthesisBlock ?? 'Adaptive multi-lane routing applied.',
      },
      diagnostics: {
        latency_ms: latencyMs,
        collection: 'codebase_chunks_768',
        embedding_model: 'embeddinggemma:latest',
        timestamp: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[External query API Gateway] POST error:', err);
    return json({
      ok: false,
      error: err.message || 'Internal server error'
    }, { status: 500 });
  }
};
