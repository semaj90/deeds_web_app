/**
 * POST /api/atlas/studio/search
 *
 * Unified retrieval endpoint (Phase 3 Week 2-3)
 * Wires to the unified orchestrator (service.ts) for comparative testing
 * against the existing cascade pipeline.
 *
 * Request:
 *   {
 *     query: string (required)
 *     k: number (default 10, max 100) - number of results
 *     lanes?: string[] (default ['gpu-cuvs', 'qdrant', 'bm25'])
 *     summarize?: boolean (default false)
 *   }
 *
 * Response:
 *   {
 *     candidates: SearchResult[]
 *     timing: { embed_ms, gpu_ms, qdrant_ms, postgres_ms, total_ms, ... }
 *     metadata: {
 *       lanes_attempted: string[]
 *       lanes_succeeded: string[]
 *       lanes_failed: string[]
 *       candidates_count: number
 *       truncated: boolean
 *       warnings?: string[]
 *     }
 *     summary?: string
 *   }
 */

import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { unifiedSearch } from '$lib/server/retrieval/service.js';
import type { RequestHandler } from './$types';

const SearchSchema = z.object({
  query: z.string().min(1).max(4000),
  k: z.number().int().min(1).max(100).optional().default(10),
  lanes: z.array(z.string()).optional(),
  summarize: z.boolean().optional().default(false),
});

type SearchRequest = z.infer<typeof SearchSchema>;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    const parsed = SearchSchema.safeParse(body);

    if (!parsed.success) {
      return json(
        { error: 'Invalid request', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { query, k, lanes, summarize } = parsed.data;

    // Call the unified retrieval service
    const result = await unifiedSearch({
      query,
      k,
      lanes,
      summarize,
    });

    return json(result, { status: 200 });
  } catch (err) {
    console.error('[studio/search] Error:', err instanceof Error ? err.message : '');
    return json(
      {
        candidates: [],
        timing: { total_ms: 0 },
        metadata: {
          lanes_attempted: [],
          lanes_succeeded: [],
          lanes_failed: [],
          candidates_count: 0,
          truncated: false,
          warnings: [err instanceof Error ? err.message : 'Unknown error'],
        },
      },
      { status: 503 }
    );
  }
};

export const GET: RequestHandler = async () => {
  return json({
    info: 'Unified retrieval endpoint (Phase 3 Week 2-3)',
    endpoint: '/api/atlas/studio/search',
    method: 'POST',
    schema: {
      query: 'string (required)',
      k: 'number (optional, default 10)',
      lanes: 'string[] (optional, default [gpu-cuvs, qdrant, bm25])',
      summarize: 'boolean (optional, default false)',
    },
  });
};
