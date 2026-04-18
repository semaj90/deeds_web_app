/**
 * Semantic Codebase Search API
 * Endpoint: POST /api/codebase-index/search
 * Delegates to the canonical retrieval orchestrator (pipeline: codebase).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { orchestrateRetrieval } from '$lib/server/retrieval/orchestrator.js';

const bodySchema = z.object({
  query:  z.string().min(1).max(500),
  limit:  z.number().int().min(1).max(50).default(10),
  vector: z.string().max(30).default('content'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const { query, limit } = parsed.data;

    const result = await orchestrateRetrieval({
      query,
      pipeline:       'codebase',
      topK:           limit,
      skipGraph:      true,
      skipDag:        true,
      skipAuthority:  true,
    });

    // Map to the original SearchResult shape expected by callers
    const results = result.chunks.slice(0, limit).map(c => ({
      id:    c.documentId,
      score: c.similarity,
      payload: {
        file_path:    c.sourceId ?? '',
        file_name:    c.sourceId?.split('/').pop() ?? '',
        extension:    c.sourceId?.split('.').pop() ?? '',
        content:      c.content,
        chunk_index:  0,
        total_chunks: 0,
      },
    }));

    return json({
      query,
      results,
      total:       results.length,
      vector_used: 'content',
      latencyMs:   result.latencyMs,
    });
  } catch (error) {
    console.error('Codebase search error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};