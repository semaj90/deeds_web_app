/**
 * "More like this" recommendation using Qdrant's Recommend API.
 *
 * Qdrant's recommend endpoint takes one or more positive example point IDs
 * (and optionally negative IDs) and finds the nearest neighbours in the same
 * collection using the stored vector — without the caller needing to supply
 * an embedding vector.
 *
 * Why this matters:
 *   Evidence-to-evidence, packet-to-packet, and chunk-to-chunk recommendations
 *   all share the same pattern: "given this item the user is looking at, show
 *   related items." The Qdrant recommend API handles this in O(1) extra VRAM
 *   because it reuses already-indexed vectors.
 *
 * Hard rules:
 *  - At least one positive example ID is required (guards against accidental
 *    empty calls that return random results from Qdrant).
 *  - Positive and negative IDs are validated to be non-empty strings or
 *    non-negative integers before dispatch.
 *  - The positive IDs are always excluded from results (Qdrant does this
 *    natively; we also filter on our side as a belt-and-suspenders guard).
 *  - A failed recommend call returns { ok: false, results: [] } rather than
 *    throwing, so callers can degrade gracefully.
 */

import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QdrantPointId = string | number;

export interface RecommendParams {
  /** Collection to search. */
  collection: string;
  /** One or more point IDs whose vectors define the "positive" direction. */
  positiveIds: QdrantPointId[];
  /** Optional point IDs that push results away from a negative direction. */
  negativeIds?: QdrantPointId[];
  /** Named vector to use for similarity (leave blank for default). */
  vectorName?: string;
  /** Maximum results. Default 10. */
  limit?: number;
  /** Minimum score. Default 0.0. */
  scoreThreshold?: number;
  /** Optional payload filter. */
  filter?: Record<string, unknown>;
  /** Strategy: 'average_vector' (default) or 'best_score'. */
  strategy?: 'average_vector' | 'best_score';
}

export interface RecommendResult {
  id: QdrantPointId;
  score: number;
  payload: Record<string, unknown> | null;
}

export interface RecommendResponse {
  ok: boolean;
  results: RecommendResult[];
  collection: string;
  positiveIds: QdrantPointId[];
  durationMs: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidPointId(id: unknown): id is QdrantPointId {
  if (typeof id === 'string') return id.trim() !== '';
  if (typeof id === 'number') return Number.isInteger(id) && id >= 0;
  return false;
}

function validateIds(ids: QdrantPointId[], label: string): string | null {
  if (ids.length === 0) return `${label} must not be empty`;
  for (const id of ids) {
    if (!isValidPointId(id)) {
      return `${label} contains invalid point ID: ${JSON.stringify(id)}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find items similar to a set of positive example points.
 */
export async function recommend(params: RecommendParams): Promise<RecommendResponse> {
  const t0 = Date.now();
  const { collection, positiveIds, negativeIds = [], limit = 10 } = params;

  // Guard: at least one positive ID
  const posError = validateIds(positiveIds, 'positiveIds');
  if (posError) {
    return {
      ok: false,
      results: [],
      collection,
      positiveIds,
      durationMs: 0,
      message: `recommend validation failed: ${posError}`,
    };
  }

  // Guard: negative IDs (if provided) must be valid
  if (negativeIds.length > 0) {
    const negError = validateIds(negativeIds, 'negativeIds');
    if (negError) {
      return {
        ok: false,
        results: [],
        collection,
        positiveIds,
        durationMs: 0,
        message: `recommend validation failed: ${negError}`,
      };
    }
  }

  const qdrant = getQdrantManager();
  const positiveSet = new Set(positiveIds.map(String));

  try {
    const recommendRequest: Record<string, unknown> = {
      positive: positiveIds,
      limit,
      with_payload: true,
      with_vector: false,
      score_threshold: params.scoreThreshold ?? 0.0,
      strategy: params.strategy ?? 'average_vector',
    };

    if (negativeIds.length > 0) {
      recommendRequest['negative'] = negativeIds;
    }
    if (params.vectorName) {
      recommendRequest['using'] = params.vectorName;
    }
    if (params.filter) {
      recommendRequest['filter'] = params.filter;
    }

    const raw = await (qdrant.client as any).recommend(collection, recommendRequest);

    const results: RecommendResult[] = (raw as any[])
      // Belt-and-suspenders: exclude any positive IDs that Qdrant returned
      .filter((r: any) => !positiveSet.has(String(r.id)))
      .map((r: any) => ({
        id: r.id,
        score: r.score,
        payload: r.payload ?? null,
      }));

    return {
      ok: true,
      results,
      collection,
      positiveIds,
      durationMs: Date.now() - t0,
      message: `Found ${results.length} recommendations`,
    };
  } catch (err) {
    return {
      ok: false,
      results: [],
      collection,
      positiveIds,
      durationMs: Date.now() - t0,
      message: `recommend failed: ${(err as Error).message}`,
    };
  }
}
