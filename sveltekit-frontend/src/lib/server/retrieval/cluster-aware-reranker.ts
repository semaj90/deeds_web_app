/**
 * Cluster-aware reranker.
 *
 * After GRPO/cross-encoder scoring, this pass boosts chunks that share the
 * same GPU cluster as the top-scoring result.  Coherent cluster membership
 * is a proxy for "architecturally related" — the model benefits from chunks
 * that collectively describe one subsystem rather than n unrelated ones.
 *
 * Algorithm:
 *   1. Find the dominant cluster (cluster with highest max score among chunks).
 *   2. Apply a small multiplicative boost (CLUSTER_BOOST) to all chunks in
 *      that cluster — floored by SAME_CLUSTER_FLOOR so already-zero chunks
 *      stay relevant.
 *   3. Re-sort descending by adjusted score.
 *   4. Optionally inject a 1-line cluster label ("// cluster 7 — auth/session")
 *      as the first chunk so the LLM has spatial context.
 *
 * BoW texture integration:
 *   When `bowTile` is supplied (from bag-cache.ts / getBowTextureForCluster),
 *   the top-5 terms are appended to each in-cluster chunk's content so the
 *   reranker's cross-encoder has richer lexical overlap with the query.
 *
 * Non-fatal — callers wrap in try/catch.
 */

import { getRedis } from '$lib/server/redis.js';
import type { BowTextureTile } from '$lib/server/langextract/bag-cache.js';

export interface RAGChunkLike {
  content: string;
  score: number;
  source: string;
  gpuCluster?: number;
  somCluster?: number;
}

export interface ClusterRerankerOpts {
  /** Multiplicative boost for same-cluster chunks (default 1.08) */
  clusterBoost?: number;
  /** Minimum adjusted score floor (default 0.01) */
  floor?: number;
  /** Inject cluster label as first pseudo-chunk (default true) */
  injectLabel?: boolean;
  /** Optional BoW tile for the dominant cluster — top terms appended */
  bowTile?: BowTextureTile | null;
  /** Max terms to append from BoW tile (default 5) */
  bowTerms?: number;
}

const CLUSTER_BOOST       = 1.08;
const SAME_CLUSTER_FLOOR  = 0.01;
const CLUSTER_LABEL_PREFIX = '// graphify-cluster';

export async function applyClusterCoherenceBoost(
  chunks: RAGChunkLike[],
  opts: ClusterRerankerOpts = {}
): Promise<RAGChunkLike[]> {
  if (chunks.length < 2) return chunks;

  const boost      = opts.clusterBoost ?? CLUSTER_BOOST;
  const floor      = opts.floor        ?? SAME_CLUSTER_FLOOR;
  const injectLabel = opts.injectLabel  ?? true;
  const bowTerms   = opts.bowTerms      ?? 5;

  // Find dominant cluster: highest-scoring chunk that has a gpuCluster tag
  let domCluster: number | null = null;
  let domScore = -Infinity;
  for (const c of chunks) {
    if (c.gpuCluster != null && c.score > domScore) {
      domScore   = c.score;
      domCluster = c.gpuCluster;
    }
  }

  if (domCluster === null) return chunks; // no cluster metadata — skip

  // Fetch cluster label from Redis (set by graphify:cluster-summaries)
  let clusterLabel = `cluster ${domCluster}`;
  try {
    const redis = getRedis();
    const raw   = await redis.get(`summary:cluster:${domCluster}`);
    if (raw) {
      const parsed = JSON.parse(raw) as { purpose?: string; summary?: string };
      const label  = parsed.purpose ?? parsed.summary ?? '';
      if (label) clusterLabel = `cluster ${domCluster} — ${label.slice(0, 80)}`;
    }
  } catch { /* non-fatal */ }

  // Build BoW suffix for in-cluster chunks
  const bowSuffix = opts.bowTile?.terms?.slice(0, bowTerms).join(', ')
    ? `\n// related-terms: ${opts.bowTile!.terms.slice(0, bowTerms).join(', ')}`
    : '';

  // Apply boost
  const adjusted = chunks.map((c) => {
    if (c.gpuCluster !== domCluster) return c;
    return {
      ...c,
      score:   Math.max(floor, c.score * boost),
      content: c.content + bowSuffix,
    };
  });

  // Re-sort
  const sorted = adjusted.sort((a, b) => b.score - a.score);

  // Inject cluster label pseudo-chunk at position 0
  if (injectLabel) {
    const label: RAGChunkLike = {
      content: `${CLUSTER_LABEL_PREFIX} ${clusterLabel}`,
      score:   0,
      source:  `cluster:${domCluster}:label`,
      gpuCluster: domCluster,
    };
    return [label, ...sorted];
  }

  return sorted;
}

/** Extract the dominant GPU cluster id from the top-N chunks. */
export function extractDominantCluster(chunks: RAGChunkLike[], topN = 5): number | null {
  const freq = new Map<number, number>();
  for (const c of chunks.slice(0, topN)) {
    if (c.gpuCluster != null) freq.set(c.gpuCluster, (freq.get(c.gpuCluster) ?? 0) + 1);
  }
  if (!freq.size) return null;
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
