import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { VectorSearchService } from '$lib/server/vector-search-service';
import { productionServiceClient } from '$lib/api/production-service-client';
import { cacheGet, cacheSet } from '$lib/server/cache/redis';
import db from '$lib/server/db/client';
import { searchLogs } from '$lib/server/db/schema';
import { getEmbeddingFromGemma } from '$lib/server/ai/embeddinggemma-service';

interface PrecedentSearchRequest {
  query: string;
  model?: string;
  limit?: number;
}

const OLLAMA_EMBED_PATH = '/api/embed'; // example; adjust to real Ollama embedding endpoint if needed

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as PrecedentSearchRequest;
  const q = body?.query || '';
  const limit = body?.limit || 5;

  if (!q || q.trim().length === 0) {
    return json({ error: 'empty query' }, { status: 400 });
  }

  const cacheKey = `precedent:${q.slice(0, 200)}:${limit}`;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return json(cached);
  }

  // 1) Get embeddings from Ollama (or other model)
  let embeddings: number[] | null = null;
  try {
    embeddings = await getEmbeddingFromGemma(q);
  } catch (err) {
    // continue with null embeddings (vector search will return mocked results)
    // eslint-disable-next-line no-console
    console.warn('Failed to fetch embeddings from embeddinggemma-service', err);
  }

  // 2) Query vector search service
  // Use hybridVectorSearch for potential future integration of multiple vector dbs
  const vectorResults = await VectorSearchService.hybridVectorSearch(embeddings || [], { limit });

  // 3) Optionally call a Go microservice for enrichment / reranking
  const enhancedRagClient = productionServiceClient('enhanced-rag');
  let enriched: any = null;
  try {
    enriched = await enhancedRagClient.request('/api/enrich', {
      method: 'POST',
      json: { query: q, candidates: vectorResults },
    });
  } catch (err) {
    // log and proceed with vector results only
    // eslint-disable-next-line no-console
    console.warn('Production service enhanced-rag enrich failed', err);
  }

  const results = enriched?.results || vectorResults;

  // 4) Log search to DB (non-blocking)
  try {
    await db.insert(searchLogs).values({ query: q, resultCount: results.length });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Failed to log search', err);
  }

  const payload = { query: q, results };
  // cache short-term (e.g., 30 seconds)
  await cacheSet(cacheKey, payload, 30 * 1000);
  return json(payload);
};
