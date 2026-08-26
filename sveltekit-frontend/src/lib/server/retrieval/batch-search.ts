/**
 * Batch search: execute N independent queries against a single Qdrant collection
 * in a single round-trip using Qdrant's Query API (prefetch + fusion).
 *
 * Why batch?
 *   A single HTTP/2 multiplexed request costs less than N sequential calls and
 *   less head-of-line blocking than N concurrent calls when N > ~4.
 *   The Qdrant Query API (`POST /collections/{name}/query/batch`) processes each
 *   sub-query independently and returns an array of result sets.
 *
 * Fallback:
 *   When the Qdrant client does not expose a batch query method (older SDK
 *   versions or collection types that don't support the query API), we fall back
 *   to `Promise.all` over individual searches. Results are identical; latency
 *   is slightly higher.
 *
 * Contract:
 *   - Input queries are independent — no cross-query dedup is performed here.
 *     Dedup within each result set is handled by Qdrant's RRF fusion.
 *   - Each result set is ordered by score descending.
 *   - A query that produces zero results returns `[]`, never throws.
 *   - The output array length always equals the input array length.
 */

import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';
import { efForProfile, inferEfProfile } from './hnsw-ef-profiles.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchSearchQuery {
  /** The embedding vector for this sub-query (must match collection dimension). */
  vector: number[];
  /** Named vector to query against (e.g. 'content', 'semantic_embedding'). */
  vectorName?: string;
  /** Maximum results to return for this sub-query. Default 10. */
  limit?: number;
  /** Minimum score threshold for results. Default 0.0 (all results). */
  scoreThreshold?: number;
  /** Optional payload filter for this sub-query. */
  filter?: Record<string, unknown>;
}

export interface BatchSearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown> | null;
}

export interface BatchSearchResponse {
  /** Results for each input query, in the same order as the input. */
  results: BatchSearchResult[][];
  /** Collection searched. */
  collection: string;
  /** Total wall-clock time for the entire batch (ms). */
  durationMs: number;
  /** Whether the native Qdrant batch path was used (vs Promise.all fallback). */
  nativeBatch: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Execute multiple independent search queries against one Qdrant collection.
 *
 * @param collection  Resolved collection name (e.g. 'codebase_chunks_384_hybrid').
 * @param queries     Array of sub-queries. Empty array returns immediately.
 * @param efProfile   HNSW ef profile; inferred per-query if omitted.
 */
export async function batchSearch(
  collection: string,
  queries: BatchSearchQuery[],
  efProfile?: 'interactive' | 'balanced' | 'thorough',
): Promise<BatchSearchResponse> {
  if (queries.length === 0) {
    return { results: [], collection, durationMs: 0, nativeBatch: false };
  }

  const qdrant = getQdrantManager();
  const t0 = Date.now();

  // Use the native Query API batch path when the aligned SDK exposes it.
  try {
    if (typeof (qdrant.client as any).queryBatch === 'function') {
      const searches = queries.map((q) => {
        const profile = efProfile ?? inferEfProfile({ limit: q.limit ?? 10 });
        const vector = q.vectorName
          ? { name: q.vectorName, vector: q.vector }
          : q.vector;
        return {
          query: Array.isArray(vector) ? vector : vector.vector,
          ...(Array.isArray(vector) ? {} : { using: vector.name }),
          limit: q.limit ?? 10,
          score_threshold: q.scoreThreshold ?? 0.0,
          with_payload: true,
          with_vector: false,
          params: { hnsw_ef: efForProfile(profile) },
          ...(q.filter ? { filter: q.filter } : {}),
        };
      });
      const raw = await (qdrant.client as any).queryBatch(collection, { searches });
      return {
        results: (raw as Array<{ points?: BatchSearchResult[] }>).map((result) => result.points ?? []),
        collection,
        durationMs: Date.now() - t0,
        nativeBatch: true,
      };
    }
  } catch {
    // Fall through to Promise.all path
  }

  // Fallback: parallel individual searches
  const perQueryResults = await Promise.all(
    queries.map(async (q): Promise<BatchSearchResult[]> => {
      const limit = q.limit ?? 10;
      const profile = efProfile ?? inferEfProfile({ limit });
      const ef = efForProfile(profile);

      try {
        const searchRequest: Record<string, unknown> = {
          vector: q.vectorName
            ? { name: q.vectorName, vector: q.vector }
            : q.vector,
          limit,
          score_threshold: q.scoreThreshold ?? 0.0,
          with_payload: true,
          with_vector: false,
          params: { hnsw_ef: ef },
        };

        if (q.filter) {
          searchRequest['filter'] = q.filter;
        }

        const vector = searchRequest.vector as number[] | { name: string; vector: number[] };
        const queryRequest = Array.isArray(vector)
          ? { ...searchRequest, vector: undefined, query: vector }
          : { ...searchRequest, vector: undefined, query: vector.vector, using: vector.name };
        delete queryRequest.vector;
        const response = await (qdrant.client as any).query(collection, queryRequest);
        const raw = response?.points ?? [];

        return (raw as any[]).map((r: any) => ({
          id: r.id,
          score: r.score,
          payload: r.payload ?? null,
        }));
      } catch {
        return [];
      }
    }),
  );

  return {
    results: perQueryResults,
    collection,
    durationMs: Date.now() - t0,
    nativeBatch: false,
  };
}
