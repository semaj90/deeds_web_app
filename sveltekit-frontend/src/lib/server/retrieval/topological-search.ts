/**
 * Advanced Topological Retrieval Boost
 *
 * Leverages SOM (Self-Organizing Map) grid coordinates and PageRank centrality
 * to refine vector search results.
 */

import type { RankedChunk } from './codebase-context';

export interface BoostOptions {
  radius?: number;          // Manhattan distance for spatial boost (default: 2)
  spatialWeight?: number;   // Multiplier for nearby buddies (default: 1.2)
  centralityWeight?: number; // Multiplier for pageRankScore (default: 0.3)
  densityMaxBoost?: number; // Cap for cluster density boost (default: 1.5)
}

/**
 * Apply topological boosts to a set of ranked chunks.
 *
 * 1. Spatial Adjacency: Chunks near each other on the SOM grid (even in different
 *    k-means clusters) are boosted, promoting semantically related groups.
 * 2. Centrality (PageRank): High-authority files (e.g. entrypoints, shared utils)
 *    receive a secondary boost to surface them as structural context.
 */
export function applyTopologicalBoost(
  results: RankedChunk[],
  opts: BoostOptions = {}
): RankedChunk[] {
  if (results.length === 0) return results;

  const {
    radius = 2,
    spatialWeight = 1.2,
    centralityWeight = 0.3,
    densityMaxBoost = 1.5
  } = opts;

  // 1. Identify "Spatial Neighbors" across the result set
  // This helps identify thematic "hotspots" in the current query retrieval
  const boosted = results.map((r) => {
    let adjacencyCount = 0;

    // Check every other result for spatial proximity
    if (r.somBmuRow != null && r.somBmuCol != null) {
      for (const other of results) {
        if (other.relativePath === r.relativePath) continue;
        if (other.somBmuRow == null || other.somBmuCol == null) continue;

        const dist = Math.abs(r.somBmuRow - other.somBmuRow) + Math.abs(r.somBmuCol - other.somBmuCol);
        if (dist <= radius) {
          adjacencyCount++;
        }
      }
    }

    // 2. Calculate Boosts
    // A. Topological Density Boost (exponential multiplier capped at densityMaxBoost)
    const densityBoost = adjacencyCount > 0
      ? Math.min(densityMaxBoost, Math.pow(spatialWeight, Math.min(adjacencyCount, 4)))
      : 1.0;

    // B. PageRank Centrality Boost
    // Maps [0,1] PageRank to a [1.0, 1.3] multiplier
    const rankValue = (r.pageRankScore ?? 0);
    const pagerankBoost = 1.0 + (rankValue * centralityWeight);

    // 3. Apply Boosts
    // Final score = raw_score * density * pagerank
    const finalScore = Math.min(1.0, r.score * densityBoost * pagerankBoost);

    return {
      ...r,
      score: finalScore,
      // Metadata enrichment for observability
      _topological_stats: {
        neighbors: adjacencyCount,
        densityBoost,
        pagerankBoost,
        originalScore: r.score
      }
    };
  });

  // 4. Re-sort by boosted score
  return boosted.sort((a, b) => b.score - a.score);
}
