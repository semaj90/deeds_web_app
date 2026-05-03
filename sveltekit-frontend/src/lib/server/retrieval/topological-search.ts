/**
 * Advanced Topological Retrieval Boost
 *
 * Leverages SOM (Self-Organizing Map) grid coordinates, PageRank centrality,
 * and hyperedge cluster membership (from run-hypergraph.ts Redis keys) to
 * refine vector search results.
 */

import type { RankedChunk } from './codebase-context';

export interface BoostOptions {
  radius?: number;           // Manhattan distance for spatial boost (default: 2)
  spatialWeight?: number;    // Multiplier for nearby buddies (default: 1.2)
  centralityWeight?: number; // Multiplier for pageRankScore (default: 0.3)
  densityMaxBoost?: number;  // Cap for cluster density boost (default: 1.5)
  hyperedgeBoost?: number;   // Additive boost for same-hyperedge chunks (default: 0.06)
}

/**
 * Hyperedge grade → numeric boost mapping.
 * Grade A (top 10% PageRank) → strongest signal; D → neutral.
 */
const GRADE_BOOST: Record<string, number> = { A: 0.10, B: 0.07, C: 0.04, D: 0.01 };

/**
 * Load hyperedge membership for a set of Qdrant point IDs from Redis.
 * Keys: hg:edge:{hash} → JSON { memberIds: string[], gradeLabel: string }
 * Index: hg:edge:idx ZSET (hashes sorted by gradeScore)
 *
 * Returns a Map<qdrantId → { hash, gradeLabel }> for O(1) lookup.
 */
async function loadHyperedgeMembership(
  ids: string[]
): Promise<Map<string, { hash: string; gradeLabel: string; gradeScore: number }>> {
  const map = new Map<string, { hash: string; gradeLabel: string; gradeScore: number }>();
  if (ids.length === 0) return map;

  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();

    // Read top-scoring hyperedges from index (cap at 50 to stay fast)
    const hashes = await redis.zrange('hg:edge:idx', 0, 49, 'REV');
    if (!hashes.length) return map;

    const blobs = await Promise.all(hashes.map((h) => redis.get(`hg:edge:${h}`)));
    const idSet = new Set(ids);

    for (let i = 0; i < hashes.length; i++) {
      const raw = blobs[i];
      if (!raw) continue;
      try {
        const edge = JSON.parse(raw) as {
          hash: string;
          memberIds: string[];
          gradeLabel: string;
          gradeScore: number;
        };
        for (const mid of edge.memberIds) {
          if (idSet.has(mid)) {
            // Keep highest-grade edge if a chunk belongs to multiple
            const existing = map.get(mid);
            if (!existing || edge.gradeScore > existing.gradeScore) {
              map.set(mid, { hash: edge.hash, gradeLabel: edge.gradeLabel, gradeScore: edge.gradeScore });
            }
          }
        }
      } catch { /* malformed blob — skip */ }
    }
  } catch { /* Redis unavailable — non-fatal */ }

  return map;
}

/**
 * Apply topological boosts to a set of ranked chunks.
 *
 * 1. Hyperedge coherence: chunks sharing the same GPU k-means hyperedge get a
 *    grade-weighted boost (A=+0.10, B=+0.07, C=+0.04, D=+0.01).
 * 2. Spatial Adjacency: chunks near each other on the SOM grid get a density boost.
 * 3. Centrality (PageRank): high-authority files get a multiplier boost.
 */
export async function applyTopologicalBoostAsync(
  results: RankedChunk[],
  opts: BoostOptions = {}
): Promise<RankedChunk[]> {
  if (results.length === 0) return results;

  const {
    radius = 2,
    spatialWeight = 1.2,
    centralityWeight = 0.3,
    densityMaxBoost = 1.5,
    hyperedgeBoost: _he = 0.06,
  } = opts;

  // Collect Qdrant IDs from results (stored as qdrantId or id field)
  const qdrantIds = results
    .map((r) => (r as unknown as Record<string, unknown>).qdrantId ?? (r as unknown as Record<string, unknown>).id)
    .filter((id): id is string => typeof id === 'string');

  const edgeMap = await loadHyperedgeMembership(qdrantIds);

  const boosted = results.map((r) => {
    const rx = r as unknown as Record<string, unknown>;
    const qdrantId = String(rx.qdrantId ?? rx.id ?? '');
    let boost = 0;

    // 1. Hyperedge coherence boost
    const edgeInfo = edgeMap.get(qdrantId);
    if (edgeInfo) {
      boost += GRADE_BOOST[edgeInfo.gradeLabel] ?? 0.01;
    }

    // 2. SOM spatial adjacency
    let adjacencyCount = 0;
    if (r.somBmuRow != null && r.somBmuCol != null) {
      for (const other of results) {
        if (other.relativePath === r.relativePath) continue;
        if (other.somBmuRow == null || other.somBmuCol == null) continue;
        const dist = Math.abs(r.somBmuRow - other.somBmuRow) + Math.abs(r.somBmuCol - other.somBmuCol);
        if (dist <= radius) adjacencyCount++;
      }
    }
    const densityBoost = adjacencyCount > 0
      ? Math.min(densityMaxBoost, Math.pow(spatialWeight, Math.min(adjacencyCount, 4)))
      : 1.0;

    // 3. PageRank centrality
    const pagerankBoost = 1.0 + ((r.pageRankScore ?? 0) * centralityWeight);

    const finalScore = Math.min(1.0, (r.score + boost) * densityBoost * pagerankBoost);

    return {
      ...r,
      score: finalScore,
      _topological_stats: {
        neighbors: adjacencyCount,
        densityBoost,
        pagerankBoost,
        hyperedgeGrade: edgeInfo?.gradeLabel ?? null,
        hyperedgeBoost: boost,
        originalScore: r.score,
      },
    };
  });

  return boosted.sort((a, b) => b.score - a.score);
}

/** Sync version (no Redis) — used as fallback when async context unavailable */
export function applyTopologicalBoost(
  results: RankedChunk[],
  opts: BoostOptions = {}
): RankedChunk[] {
  if (results.length === 0) return results;

  const { radius = 2, spatialWeight = 1.2, centralityWeight = 0.3, densityMaxBoost = 1.5 } = opts;

  const boosted = results.map((r) => {
    let adjacencyCount = 0;
    if (r.somBmuRow != null && r.somBmuCol != null) {
      for (const other of results) {
        if (other.relativePath === r.relativePath) continue;
        if (other.somBmuRow == null || other.somBmuCol == null) continue;
        const dist = Math.abs(r.somBmuRow - other.somBmuRow) + Math.abs(r.somBmuCol - other.somBmuCol);
        if (dist <= radius) adjacencyCount++;
      }
    }
    const densityBoost = adjacencyCount > 0
      ? Math.min(densityMaxBoost, Math.pow(spatialWeight, Math.min(adjacencyCount, 4)))
      : 1.0;
    const pagerankBoost = 1.0 + ((r.pageRankScore ?? 0) * centralityWeight);
    const finalScore = Math.min(1.0, r.score * densityBoost * pagerankBoost);
    return {
      ...r,
      score: finalScore,
      _topological_stats: { neighbors: adjacencyCount, densityBoost, pagerankBoost, originalScore: r.score },
    };
  });

  return boosted.sort((a, b) => b.score - a.score);
}
