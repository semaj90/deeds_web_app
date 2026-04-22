/**
 * POST /api/research/search
 *
 * Semantic search over chunks_web_search Qdrant collection.
 * Returns ranked research chunks from GitHub / Reddit / web crawl.
 *
 * Body:
 *   query: string
 *   sources?: ResearchSource[]
 *   limit?: number       (default 10, max 50)
 *   scoreThreshold?: number  (default 0.55)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const bodySchema = z.object({
  query: z.string().min(1).max(1000),
  sources: z
    .array(
      z.enum(['github_issue', 'github_code', 'github_repo', 'reddit_post', 'web_page', 'official_docs'])
    )
    .optional(),
  limit: z.number().min(1).max(50).default(10),
  scoreThreshold: z.number().min(0).max(1).default(0.55),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ results: [], error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ results: [], error: 'Invalid request' }, { status: 400 });
  }

  const { query, sources, limit, scoreThreshold } = parsed.data;

  try {
    const { generateEmbedding } = await import('$lib/server/grpc/embedding-client.js');
    const embedding = await generateEmbedding(query);

    if (!embedding?.length) {
      return json({ results: [], error: 'Embedding service unavailable' });
    }

    const { searchResearchChunks } = await import(
      '$lib/server/research/web-research-ingester.js'
    );
    const results = await searchResearchChunks({
      queryEmbedding: embedding,
      limit,
      sourceFilter: sources?.length ? sources : undefined,
      scoreThreshold,
    });

    return json({ results, query });
  } catch (err) {
    console.error('[/api/research/search] error:', err);
    return json({ results: [], error: 'Search failed' });
  }
};
