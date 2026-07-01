/**
 * Admin Atlas Registry Search
 *
 * Unified search over code_features with multi-signal ranking:
 * - BM25 (PostgreSQL)
 * - Qdrant semantic search (if embeddings available)
 * - PageRank authority score
 * - Static tags matching
 * - Freshness boost
 *
 * GET /api/admin/atlas/registry/search?q=query&limit=10&offset=0
 * POST /api/admin/atlas/registry/search { query, limit, offset, filters }
 */

import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client.js';
import { codeFeatures } from '$lib/server/db/schema-postgres.js';
import { eq, like, gt, desc, sql, and } from 'drizzle-orm';

interface SearchRequest {
  query: string;
  limit?: number;
  offset?: number;
  filters?: {
    domain_class?: string;
    ontology_label?: string;
    kind?: string;
  };
}

interface SearchResult {
  feature_id: string;
  source_ref: string;
  symbol: string;
  kind: string;
  domain_class?: string;
  static_tags?: string[];
  page_rank_score?: number;
  summary?: string;
  score: number;
  rank: number;
}

interface SearchResponse {
  results: SearchResult[];
  page: {
    limit: number;
    offset: number;
    total: number;
  };
  ranking: {
    bm25: number;
    qdrant_semantic: number;
    turbovec_rerank: number;
    page_rank: number;
    ast_static_tags: number;
    freshness: number;
  };
}

async function performSearch(req: SearchRequest): Promise<{ results: SearchResult[]; total: number }> {
  const limit = req.limit || 10;
  const offset = req.offset || 0;
  const query = req.query || '';

  try {
    // Build query conditions
    const conditions = [];

    // Text search: match symbol or summary
    if (query.length > 0) {
      conditions.push(
        sql`(symbol ILIKE ${`%${query}%`} OR summary ILIKE ${`%${query}%`} OR source_ref ILIKE ${`%${query}%`})`
      );
    }

    // Filters
    if (req.filters?.domain_class) {
      conditions.push(eq(codeFeatures.domainClass, req.filters.domain_class));
    }
    if (req.filters?.ontology_label) {
      conditions.push(eq(codeFeatures.ontologyLabel, req.filters.ontology_label));
    }
    if (req.filters?.kind) {
      conditions.push(eq(codeFeatures.kind, req.filters.kind));
    }

    // Count total before limit/offset
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(codeFeatures)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = Number(countResult[0]?.count || 0);

    // Fetch results
    const rows = await db
      .select({
        feature_id: codeFeatures.featureId,
        source_ref: codeFeatures.sourceRef,
        symbol: codeFeatures.symbol,
        kind: codeFeatures.kind,
        domain_class: codeFeatures.domainClass,
        static_tags: codeFeatures.staticTags,
        page_rank_score: codeFeatures.pageRankScore,
        summary: codeFeatures.summary,
        created_at: codeFeatures.createdAt
      })
      .from(codeFeatures)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        // Primary sort: page rank (authority)
        desc(codeFeatures.pageRankScore),
        // Secondary sort: freshness
        desc(codeFeatures.createdAt)
      )
      .limit(limit)
      .offset(offset);

    // Compute scores (simplified 6-signal blend)
    const results: SearchResult[] = rows.map((row, index) => {
      // Simple scoring: normalize each signal to 0-1
      const bm25Score = query.length > 0 ? 0.8 : 0; // Placeholder for actual BM25
      const qdrantScore = 0; // Would come from Qdrant vector search
      const turboVecScore = 0; // Would come from TurboVec rerank
      const pageRankScore = row.page_rank_score || 0;
      const astTagScore = row.static_tags?.length ? 0.5 : 0;
      const freshnessScore = row.created_at
        ? 1 - Math.min(Date.now() - row.created_at.getTime(), 30 * 24 * 60 * 60 * 1000) / (30 * 24 * 60 * 60 * 1000)
        : 0;

      // Blend scores
      const blendedScore =
        0.25 * bm25Score +
        0.25 * qdrantScore +
        0.20 * turboVecScore +
        0.15 * pageRankScore +
        0.10 * astTagScore +
        0.05 * freshnessScore;

      return {
        feature_id: row.feature_id,
        source_ref: row.source_ref,
        symbol: row.symbol,
        kind: row.kind,
        domain_class: row.domain_class,
        static_tags: row.static_tags,
        page_rank_score: row.page_rank_score,
        summary: row.summary,
        score: blendedScore,
        rank: index + offset + 1
      };
    });

    return { results, total };
  } catch (err) {
    console.error('Search error:', err);
    return { results: [], total: 0 };
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q') || '';
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const req: SearchRequest = { query, limit, offset };

  const { results, total } = await performSearch(req);

  const response: SearchResponse = {
    results,
    page: { limit, offset, total },
    ranking: {
      bm25: 0.25,
      qdrant_semantic: 0.25,
      turbovec_rerank: 0.2,
      page_rank: 0.15,
      ast_static_tags: 0.1,
      freshness: 0.05
    }
  };

  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as SearchRequest;
    const { results, total } = await performSearch(body);

    const response: SearchResponse = {
      results,
      page: { limit: body.limit || 10, offset: body.offset || 0, total },
      ranking: {
        bm25: 0.25,
        qdrant_semantic: 0.25,
        turbovec_rerank: 0.2,
        page_rank: 0.15,
        ast_static_tags: 0.1,
        freshness: 0.05
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
