import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const searchSchema = z.object({
	query: z.string().min(1).max(2000),
	limit: z.number().int().min(1).max(100).optional().default(20),
});

/**
 * GET/POST /api/phase89/search
 * Phase89 error search — semantic search over codebase_chunks_768 using embeddings.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const q = url.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 100);
  if (!q) return json({ query: '', results: [], total: 0, timestamp: new Date().toISOString() });

  const results = await runVectorSearch(q, limit);
  return json({ query: q, results, total: results.length, timestamp: new Date().toISOString() });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const raw = await request.json().catch(() => ({}));
  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success)
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

  const { query, limit } = parsed.data;
  const results = await runVectorSearch(query, limit);
  return json({ query, results, total: results.length, timestamp: new Date().toISOString() });
};

async function runVectorSearch(query: string, limit: number) {
  try {
    const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
    const embedding = await generateSingleEmbedding(query.slice(0, 512));
    if (!embedding?.length) return [];

    const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
    const { results: hits } = await qdrant.hybridSearch({
      collection: 'codebase_chunks_768',
      query,
      queryEmbedding: embedding,
      limit: Math.min(limit, 50),
      scoreThreshold: 0.25,
    });

    return hits.map((hit) => {
      const p = (hit.payload ?? {}) as Record<string, unknown>;
      return {
        id: String(hit.id),
        content: (p.content ?? p.text ?? '') as string,
        filePath: (p.filePath ?? '') as string,
        language: (p.language ?? 'typescript') as string,
        score: hit.score ?? 0,
      };
    });
  } catch (e) {
    console.warn('[phase89/search] Vector search failed:', (e as Error).message);
    return [];
  }
}
