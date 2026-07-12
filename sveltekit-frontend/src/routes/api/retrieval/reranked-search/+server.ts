/**
 * Reranked Search API Endpoint
 *
 * POST /api/retrieval/reranked-search
 *
 * Purpose: High-quality retrieval by blending three signals:
 *   1. Qdrant dense vectors (0.35)
 *   2. BM25 lexical features (0.35)
 *   3. RG keyword search (0.30)
 *
 * Request: { query: string, limit?: number }
 * Response: { candidates: RerankerCandidate[], meta: {...} }
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { rgKeywordSearch, normalizeRgScore, type RgMatch } from '$lib/server/retrieval/rg-search-bridge';
import { extractBM25Scores, extractQueryTerms, type BM25ScoreMap } from '$lib/server/retrieval/bm25-score-extractor';
import { rerankerBlend, type QdrantResult, type RerankerCandidate } from '$lib/server/retrieval/reranker-blend';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import fetch from 'node-fetch';

interface SearchRequest {
  query: string;
  limit?: number;
  weights?: { qdrant: number; bm25: number; rg: number };
}

interface SearchResponse {
  candidates: RerankerCandidate[];
  meta: {
    query: string;
    totalCandidates: number;
    returned: number;
    signalStats: {
      qdrantMatches: number;
      bm25Matches: number;
      rgMatches: number;
    };
    duration_ms: number;
  };
}

/**
 * Embed query via Ollama
 */
async function embedQuery(query: string): Promise<number[]> {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/embed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma',
        input: query,
        // Note: NOT requesting dimensions - Ollama returns native 768-dim for embeddinggemma
        // Qdrant collection codebase_chunks_768 expects 768-dim vectors
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding failed: ${response.status}`);
    }

    const result = (await response.json()) as { embeddings?: number[][] };
    const embeddings = result.embeddings?.[0];
    if (!Array.isArray(embeddings) || embeddings.length !== 768) {
      throw new Error(`Invalid embedding dimension: expected 768, got ${embeddings?.length ?? 0}`);
    }
    return embeddings;
  } catch (err) {
    console.error('Embedding query failed:', err);
    return [];
  }
}

/**
 * Qdrant dense vector search
 */
async function searchQdrant(queryEmbedding: number[], limit: number): Promise<QdrantResult[]> {
  if (queryEmbedding.length === 0) {
    return [];
  }

  try {
    const qdrant = getQdrantClient();
    // Phase 8.6: Legacy reranker using 768-dim vectors
    // TODO: Migrate to canonical 384-dim semantic_embedding in Phase 9
    const result = await qdrant._denseSearch({
      query: 'reranker-query',
      queryVector: queryEmbedding,
      vectorName: 'semantic_embedding',
      collection: 'codebase_chunks_768',
      limit: Math.min(limit, 100),
      scoreThreshold: 0.1,
    });

    return result.results.map(r => ({
      id: String(r.id),
      score: r.score,
      payload: r.payload,
    }));
  } catch (err) {
    console.error('Qdrant search failed:', err);
    return [];
  }
}

export const POST: RequestHandler = async ({ request }) => {
  const startTime = Date.now();

  try {
    const body: SearchRequest = await request.json();
    const { query, limit = 20, weights = { qdrant: 0.35, bm25: 0.35, rg: 0.3 } } = body;

    if (!query || query.trim().length === 0) {
      return json(
        { error: 'Query required' },
        { status: 400 }
      );
    }

    // Extract query terms for BM25
    const queryTerms = extractQueryTerms(query);
    if (queryTerms.length === 0) {
      return json(
        { error: 'Query contains only stopwords' },
        { status: 400 }
      );
    }

    // Parallel: RG keyword search + embedding + Qdrant search
    const [rgMatches, queryEmbedding] = await Promise.all([
      rgKeywordSearch(query, { limit: 100 }),
      embedQuery(query),
    ]);
    const rgFileSet = new Set(rgMatches.map(m => m.file));

    // Parallel: BM25 extraction + Qdrant search
    const [bm25Scores, qdrantResults] = await Promise.all([
      extractBM25Scores(queryTerms, Array.from(rgFileSet)),
      searchQdrant(queryEmbedding, 100),
    ]);

    // Blend signals
    const reranked = rerankerBlend(
      qdrantResults,
      bm25Scores,
      rgMatches,
      weights
    ).slice(0, limit);

    const duration = Date.now() - startTime;

    const response: SearchResponse = {
      candidates: reranked,
      meta: {
        query,
        totalCandidates: Object.keys(bm25Scores).length + rgMatches.length,
        returned: reranked.length,
        signalStats: {
          qdrantMatches: qdrantResults.length,
          bm25Matches: Object.values(bm25Scores).filter(s => s > 0).length,
          rgMatches: rgMatches.length,
        },
        duration_ms: duration,
      },
    };

    return json(response);
  } catch (err) {
    console.error('reranked-search error:', err);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};

export const GET: RequestHandler = async () => {
  return json(
    {
      message: 'POST /api/retrieval/reranked-search',
      body: {
        query: 'string',
        limit: 'number (optional)',
        weights: '{ qdrant: 0-1, bm25: 0-1, rg: 0-1 } (optional)'
      },
    },
    { status: 405 }
  );
};
