/**
 * Hybrid Retrieval Score — Loop A Feedback
 *
 * Blends multiple retrieval signals with learned demand_score weighting:
 *
 *   final_score = 0.25 * qdrant_cosine
 *               + 0.20 * pg_trgm
 *               + 0.20 * graph_authority
 *               + 0.15 * topology
 *               + 0.20 * demand_score
 *
 * The demand_score (0.0-1.0) is learned from chunk_hit_log:
 *   - Incremented when chunks are selected by supervisor (Loop B)
 *   - Used to boost retrieval rank for frequently-used chunks
 *   - Decays with age to prevent stale bias
 */

export interface HybridScoreInput {
  qdrantCosine: number;    // 0.0-1.0, cosine similarity from Qdrant
  pgTrgm: number;          // 0.0-1.0, pg_trgm similarity score
  graphAuthority: number;  // 0.0-1.0, Neo4j PageRank authority
  topologyScore: number;   // 0.0-1.0, SOM topology proximity
  demandScore: number;     // 0.0-1.0, learned from chunk_hit_log
}

export function computeHybridScore(input: HybridScoreInput): number {
  const {
    qdrantCosine = 0,
    pgTrgm = 0,
    graphAuthority = 0,
    topologyScore = 0,
    demandScore = 0,
  } = input;

  // Weighted blend with fixed weights
  const score =
    0.25 * Math.max(0, Math.min(1, qdrantCosine)) +
    0.20 * Math.max(0, Math.min(1, pgTrgm)) +
    0.20 * Math.max(0, Math.min(1, graphAuthority)) +
    0.15 * Math.max(0, Math.min(1, topologyScore)) +
    0.20 * Math.max(0, Math.min(1, demandScore));

  return Math.max(0, Math.min(1, score));
}

/**
 * Decay demand_score over time.
 * Prevents old preferences from dominating recent queries.
 *
 * Score decays exponentially with half-life of 7 days.
 */
export function decayDemandScore(
  baseScore: number,
  ageHours: number,
  halfLifeHours: number = 7 * 24, // 7 days
): number {
  const decayFactor = Math.pow(0.5, ageHours / halfLifeHours);
  return baseScore * decayFactor;
}

/**
 * Compute demand boost for a chunk.
 * Called from chunk_hit_log aggregation after supervisor merge.
 *
 * Boost formula:
 *   demand_score += 0.1 per supervisor hit
 *   capped at 1.0
 */
export function boostDemandScore(
  currentScore: number,
  increment: number = 0.1,
): number {
  return Math.min(1.0, currentScore + increment);
}
