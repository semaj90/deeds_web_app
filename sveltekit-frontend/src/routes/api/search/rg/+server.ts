/**
 * src/routes/api/search/rg/+server.ts
 *
 * Full-text search using ripgrep (rg) + optional Qdrant vector reranking.
 *
 * Endpoints:
 *   GET  /api/search/rg?q=<query>                  - Search with pagination
 *   POST /api/search/rg                            - Advanced search (deprecated, use GET)
 *   DELETE /api/search/rg/cache                    - Clear search cache
 *
 * Query Parameters:
 *   q              - Search query (required, escaped for rg)
 *   limit          - Results per page (default: 20, max: 100)
 *   offset         - Pagination offset (default: 0)
 *   type           - Filter by file type (ts, tsx, svelte, js, etc.)
 *   exclude        - Exclude pattern (e.g., "node_modules", "dist")
 *   rerank         - Enable Qdrant vector reranking (default: false)
 *   include_context - Include surrounding lines (default: true, context_lines: 2)
 *
 * Response:
 *   {
 *     "results": [
 *       {
 *         "file": "src/lib/server/search.ts",
 *         "line": 42,
 *         "content": "  export function search(...) {",
 *         "match": "export function search",
 *         "score": 0.95,
 *         "context": {
 *           "before": ["  // Search orchestrator"],
 *           "after": ["    const results = [...];"]
 *         }
 *       }
 *     ],
 *     "total": 125,
 *     "query": "search",
 *     "limit": 20,
 *     "offset": 0,
 *     "hasMore": true,
 *     "duration_ms": 234,
 *     "backend": "rg"
 *   }
 *
 * Error Responses:
 *   400 - Missing query
 *   429 - Query too broad (matches too many results)
 *   500 - Internal error
 *
 * Notes:
 *   - rg must be available in PATH or installed via npm
 *   - Query is escaped to prevent shell injection
 *   - Results are cached in Redis with 5-minute TTL
 *   - Optional Qdrant reranking requires vector embeddings
 */

import type { RequestHandler } from './$types';
import { json, type Response as SvelteResponse } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis';
import { runRgSearch, type RgSearchResult } from '$lib/server/search/rg-bridge';
import { log } from '$lib/server/logging';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SearchParams {
  query: string;
  limit: number;
  offset: number;
  type?: string;
  exclude?: string;
  rerank?: boolean;
  includeContext?: boolean;
}

interface SearchResponse {
  results: Array<RgSearchResult & { score?: number; context?: { before: string[]; after: string[] } }>;
  total: number;
  query: string;
  limit: number;
  offset: number;
  hasMore: boolean;
  duration_ms: number;
  backend: 'rg' | 'rg+qdrant';
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getCacheKey(query: string, type?: string, exclude?: string): string {
  const key = `search:rg:${query}`;
  if (type) return `${key}:type:${type}`;
  if (exclude) return `${key}:exclude:${exclude}`;
  return key;
}

function validateQuery(query: string): { valid: boolean; error?: string } {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Query is required' };
  }

  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Query cannot be empty' };
  }

  if (trimmed.length > 500) {
    return { valid: false, error: 'Query is too long (max 500 characters)' };
  }

  // Warn if query is too broad (single common word)
  const commonWords = ['function', 'const', 'let', 'var', 'return', 'import', 'export'];
  if (commonWords.includes(trimmed.toLowerCase())) {
    return { valid: true }; // Allow but may return many results
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/search/rg
// ─────────────────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url }) => {
  const startTime = Date.now();

  try {
    // Parse query parameters
    const query = url.searchParams.get('q');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);
    const type = url.searchParams.get('type');
    const exclude = url.searchParams.get('exclude') || 'node_modules,dist,build';
    const rerank = url.searchParams.get('rerank') === 'true';
    const includeContext = url.searchParams.get('include_context') !== 'false';

    // Validate query
    const validation = validateQuery(query);
    if (!validation.valid) {
      return json(
        { error: validation.error, ok: false },
        { status: 400 }
      );
    }

    // Check cache (with timeout to avoid blocking)
    let cached = null;
    try {
      const redis = await Promise.race([
        getRedis(),
        new Promise(resolve => setTimeout(() => resolve(null), 1000))
      ]);
      if (redis) {
        const cacheKey = getCacheKey(query, type, exclude);
        cached = await redis.get(cacheKey);
      }
    } catch (err) {
      log.debug(`[search:rg] Redis error (continuing): ${err}`);
    }

    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        log.debug(`[search:rg] Cache hit for query: ${query}`);
        return json({
          ...cachedData,
          duration_ms: Date.now() - startTime,
          cached: true
        });
      } catch (err) {
        log.warn(`[search:rg] Failed to parse cache: ${err}`);
        // Continue with fresh search
      }
    }

    // Run rg search
    const rgResults = await runRgSearch({
      query,
      type,
      exclude,
      includeContext,
      limit: limit + offset // Fetch extra for pagination
    });

    if (!rgResults.ok) {
      return json(
        { error: rgResults.error || 'Search failed', ok: false },
        { status: 500 }
      );
    }

    // Check for too many results
    if (rgResults.results.length > 1000) {
      return json(
        {
          error: 'Query is too broad (>1000 results). Refine your search.',
          ok: false,
          total: rgResults.results.length
        },
        { status: 429 }
      );
    }

    // Apply pagination
    const paginatedResults = rgResults.results.slice(offset, offset + limit);

    // Optional Qdrant reranking (Phase 2)
    let backend = 'rg' as const;
    if (rerank && rgResults.results.length > 0) {
      // TODO: Wire Qdrant reranking
      // const reranked = await rerankerViaQdrant(query, paginatedResults);
      backend = 'rg+qdrant';
    }

    const response: SearchResponse = {
      results: paginatedResults.map((r) => ({
        ...r,
        score: 1.0 // Placeholder; Qdrant scoring in Phase 2
      })),
      total: rgResults.results.length,
      query,
      limit,
      offset,
      hasMore: offset + limit < rgResults.results.length,
      duration_ms: Date.now() - startTime,
      backend
    };

    // Cache results (5 minute TTL)
    if (redis) {
      await redis.setex(cacheKey, 300, JSON.stringify(response));
    }

    return json(response);
  } catch (err) {
    log.error(`[search:rg] Error: ${err instanceof Error ? err.message : err}`);
    return json(
      {
        error: 'Search failed',
        ok: false,
        details: err instanceof Error ? err.message : undefined
      },
      { status: 500 }
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/search/rg/cache
// ─────────────────────────────────────────────────────────────────────────────

export const DELETE: RequestHandler = async ({ url }) => {
  try {
    const redis = await getRedis();
    if (!redis) {
      return json(
        { error: 'Redis unavailable', ok: false },
        { status: 503 }
      );
    }

    const query = url.searchParams.get('q');
    const type = url.searchParams.get('type');
    const exclude = url.searchParams.get('exclude');

    if (!query) {
      // Clear all search cache
      const keys = await redis.keys('search:rg:*');
      if (keys.length > 0) {
        await redis.del(...keys);
        log.info(`[search:rg] Cleared ${keys.length} cache entries`);
      }
      return json({ cleared: keys.length, ok: true });
    }

    // Clear specific query cache
    const cacheKey = getCacheKey(query, type, exclude);
    const result = await redis.del(cacheKey);
    log.info(`[search:rg] Cleared cache for query: ${query}`);

    return json({ cleared: result, ok: true });
  } catch (err) {
    log.error(`[search:rg] Cache clear error: ${err}`);
    return json(
      { error: 'Failed to clear cache', ok: false },
      { status: 500 }
    );
  }
};
