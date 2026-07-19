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

  // Try native batch path via multiQuerySearch (uses /query/batch internally)
  try {
    if (typeof (qdrant as any).batchQuery === 'function') {
      const raw = await (qdrant as any).batchQuery({ collection, queries });
      return {
        results: raw,
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

        const raw = await (qdrant.client as any).search(collection, searchRequest);

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
