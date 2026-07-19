/**
 * Cluster discovery — expose the encoded-centroid store as a browsable lane.
 *
 * The cluster prefilter uses 64-dim centroids to route ANN queries to the most
 * relevant partition of the vector index.  This module exposes the same centroid
 * store as a public "discovery" API so callers can:
 *
 *   - List all known clusters with metadata (pure browse, no query required).
 *   - Score a pre-encoded 64-dim query vector against all centroids and return
 *     ranked clusters (semantic cluster discovery).
 *   - Build a Qdrant `should` filter ready for injection into a follow-up search.
 *
 * Unlike `encodedClusterPrefilter`, this module does NOT embed queries or run
 * the 768→64 autoencoder — those are the caller's responsibility when semantic
 * scoring is wanted.  This keeps the module hermetic and testable.
 *
 * Typical callers:
 *   - An admin route that wants to render a "cluster map" overview.
 *   - A search lane that receives a pre-encoded query from TurboVec/AE and
 *     wants to discover which clusters to query before issuing ANN.
 *   - Tests that probe the centroid store without network calls.
 */

import type { CentroidCacheEntry, TopKCluster } from './prefilter.types.js';
import { buildFilterFromClusters, cosineSimilarity, topKClusters } from './prefilter.shadow.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClusterEntry {
  /** Cluster ID — matches `som_cluster` payload field in Qdrant. */
  id: number;
  /**
   * Cosine similarity to the query vector when `queryVector` is supplied;
   * `null` when browsing without a query (pure listing mode).
   */
  score: number | null;
  /** Centroid coordinates in 64-dim encoded space. */
  centroid: Float32Array;
}

export interface DiscoverClustersParams {
  /**
   * Pre-encoded 64-dim query vector.  When provided, clusters are ranked by
   * cosine similarity to this vector.  When absent, all clusters are returned
   * in ascending ID order with `score: null`.
   */
  queryVector?: Float32Array;
  /** Maximum clusters to return. Default 20. */
  limit?: number;
}

export interface DiscoverClustersResponse {
  ok: boolean;
  clusters: ClusterEntry[];
  /** Total number of clusters in the centroid store. */
  totalClusters: number;
  /** Wall-clock time in milliseconds. */
  durationMs: number;
  /** Human-readable status or error description. */
  message: string;
  /**
   * Qdrant `should` filter ready to inject into an ANN search.
   * Only present when `queryVector` was supplied (semantic mode).
   */
  filter?: { should: { key: string; match: { value: number } }[] };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Discover clusters from a centroid store.
 *
 * @param centroids  The loaded centroid cache entry.  Callers obtain this via
 *                   `getCentroids64()` from `./prefilter.redis.ts`.  Accepting
 *                   an already-loaded entry keeps this function hermetic and
 *                   testable without mocking Redis.
 * @param params     Discovery parameters.
 */
export function discoverClusters(
  centroids: CentroidCacheEntry,
  params: DiscoverClustersParams = {},
): DiscoverClustersResponse {
  const t0 = Date.now();
  const limit = params.limit ?? 20;

  if (centroids.count === 0) {
    return {
      ok: false,
      clusters: [],
      totalClusters: 0,
      durationMs: 0,
      message: 'Centroid store is empty — cluster discovery unavailable',
    };
  }

  const DIM = centroids.data.length / centroids.ids.length;

  // Semantic mode: rank by cosine similarity to query vector
  if (params.queryVector !== undefined) {
    const qv = params.queryVector;

    if (qv.length !== DIM) {
      return {
        ok: false,
        clusters: [],
        totalClusters: centroids.count,
        durationMs: 0,
        message: `Query vector dimension mismatch: expected ${DIM}, got ${qv.length}`,
      };
    }

    const ranked: TopKCluster[] = topKClusters(qv, centroids, Math.min(limit, centroids.count));

    const clusters: ClusterEntry[] = ranked.map(({ id, score }) => {
      const idx = centroids.ids.indexOf(id);
      return {
        id,
        score,
        centroid: centroids.data.subarray(idx * DIM, (idx + 1) * DIM),
      };
    });

    const topIds = clusters.map(c => c.id);

    return {
      ok: true,
      clusters,
      totalClusters: centroids.count,
      durationMs: Date.now() - t0,
      message: `Found ${clusters.length} clusters (semantic mode)`,
      filter: buildFilterFromClusters(topIds),
    };
  }

  // Browse mode: return all clusters in ascending ID order, score = null
  const sorted = centroids.ids
    .map((id, i) => ({ id, i }))
    .sort((a, b) => a.id - b.id)
    .slice(0, limit);

  const clusters: ClusterEntry[] = sorted.map(({ id, i }) => ({
    id,
    score: null,
    centroid: centroids.data.subarray(i * DIM, (i + 1) * DIM),
  }));

  return {
    ok: true,
    clusters,
    totalClusters: centroids.count,
    durationMs: Date.now() - t0,
    message: `Listed ${clusters.length} of ${centroids.count} clusters (browse mode)`,
  };
}

/**
 * Score a single 64-dim vector against every centroid.
 * Returns all clusters ranked descending — useful for diagnostics.
 *
 * Does not apply softmax; returns raw cosine similarities.
 */
export function scoreAllClusters(
  centroids: CentroidCacheEntry,
  queryVector: Float32Array,
): TopKCluster[] {
  const DIM = centroids.data.length / centroids.ids.length;
  const results: TopKCluster[] = centroids.ids.map((id, i) => {
    const slice = centroids.data.subarray(i * DIM, (i + 1) * DIM);
    return { id, score: cosineSimilarity(queryVector, slice) };
  });
  return results.sort((a, b) => b.score - a.score);
}
