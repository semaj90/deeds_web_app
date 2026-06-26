/**
 * GET /api/admin/retrieval/search
 * POST /api/admin/retrieval/search
 *
 * Query the Go search service with pagination + filtering.
 * Supports cursor-based pagination via `cursor` param.
 *
 * Query params:
 *   q: string (required) — search query
 *   limit?: number (default 20, max 100)
 *   cursor?: string (base64 encoded {offset, score} for keyset pagination)
 *   jurisdiction?: string (filter)
 *   corpusType?: string (filter, e.g., "legal_documents", "legal_cases")
 *
 * Response:
 * {
 *   "hits": [{chunkId, documentId, title, snippet, score, ...}],
 *   "total": number,
 *   "cursor": "next_cursor_base64" or null (if last page),
 *   "durationMs": number,
 *   "cacheSource": "redis" | "go-search" | "qdrant"
 * }
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { searchGoService } from '$lib/server/retrieval/go-search-bridge.js';
import type { GoSearchHit } from '$lib/server/retrieval/go-search-bridge.js';

interface PaginationCursor {
  offset: number;
  score: number;
}

function decodeCursor(cursor: string | null): PaginationCursor {
  if (!cursor) {
    return { offset: 0, score: Number.MAX_VALUE };
  }

  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded) as PaginationCursor;
    return parsed;
  } catch {
    return { offset: 0, score: Number.MAX_VALUE };
  }
}

function encodeCursor(offset: number, score: number): string {
  const payload = JSON.stringify({ offset, score });
  return Buffer.from(payload).toString('base64');
}

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
  const cursor = url.searchParams.get('cursor');
  const jurisdiction = url.searchParams.get('jurisdiction') ?? undefined;
  const corpusType = url.searchParams.get('corpusType') ?? undefined;

  // Validation
  if (!query || query.length < 2) {
    return json(
      {
        hits: [],
        total: 0,
        cursor: null,
        durationMs: 0,
        error: 'Query required (minimum 2 characters)'
      },
      { status: 400 }
    );
  }

  try {
    const paginationCursor = decodeCursor(cursor);

    const result = await searchGoService({
      query,
      limit: limit + 1, // fetch one extra to detect if there's a next page
      offset: paginationCursor.offset,
      jurisdiction,
      corpusType,
      expandChunks: false
    });

    // Check if there's a next page
    const hasNextPage = result.hits.length > limit;
    const hits = result.hits.slice(0, limit) as GoSearchHit[];

    // Calculate next cursor
    let nextCursor: string | null = null;
    if (hasNextPage && hits.length > 0) {
      const lastHit = hits[hits.length - 1];
      nextCursor = encodeCursor(paginationCursor.offset + limit, lastHit.score);
    }

    return json(
      {
        hits,
        total: result.total,
        cursor: nextCursor,
        durationMs: result.durationMs,
        cacheSource: result.cacheSource,
        pagination: {
          offset: paginationCursor.offset,
          limit,
          hasMore: hasNextPage
        }
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[admin-retrieval-search] error:', err);
    return json(
      {
        hits: [],
        total: 0,
        cursor: null,
        durationMs: 0,
        error: err instanceof Error ? err.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
};

export const POST = GET; // POST with body follows same query params
