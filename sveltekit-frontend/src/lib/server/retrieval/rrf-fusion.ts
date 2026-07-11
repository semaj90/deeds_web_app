/**
 * RRF Fusion: Reciprocal Rank Fusion + Weighted Signal Blending
 *
 * Combines multiple retrieval signals (dense vectors, sparse text, graph, topology, domain)
 * using both RRF (rank-based) and weighted (score-based) fusion strategies.
 *
 * Architecture:
 * - Input: Multiple ranked candidate lists from different retrieval lanes
 * - Process: Normalize scores, compute RRF, blend weights, re-rank
 * - Output: Single unified ranked list with provenance (which lane contributed)
 *
 * Acceptance gate: Fusion score improvement > best single-lane NDCG@10 (≥3% absolute)
 */

import type { PostgresPacket, RetrievalLaneResult, FusionCandidate, FusionConfig } from './retrieval-types.js';

/**
 * RRF configuration and constants
 */
export const RRF_CONSTANTS = {
  // Reciprocal rank fusion: 1/(k + rank)
  // k value balances contribution of top vs tail candidates
  K: 60,

  // Decay for historical success: older uses matter less
  HISTORICAL_DECAY_DAYS: 30,

  // Maximum candidates to consider per lane (avoid long tails)
  MAX_CANDIDATES_PER_LANE: 100,

  // Domain confidence threshold: below this, ignore domain signal
  DOMAIN_CONFIDENCE_MIN: 0.60,

  // Freshness penalty: score decay per day stale
  FRESHNESS_PENALTY_PER_DAY: 0.02,
};

/**
 * Lane weights in final fusion blend
 *
 * Total = 1.0 (normalized)
 * These can be tuned based on evaluation results
 */
export const FUSION_WEIGHTS = {
  dense_content: 0.35,      // Full implementation detail
  dense_summary: 0.25,      // Feature/architecture intent
  dense_signature: 0.15,    // Symbol/API similarity
  topology_embedding: 0.10, // SOM/cluster neighborhood
  domain_classifier: 0.10,  // Domain prediction
  freshness: 0.05,          // Recency bonus
} as const;

// Verify weights sum to 1.0
const weightSum = Object.values(FUSION_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 0.001) {
  throw new Error(`Fusion weights must sum to 1.0, got ${weightSum}`);
}

/**
 * Normalized score from a single retrieval lane
 */
export interface LaneScore {
  candidate_id: string;
  rank: number;           // 1-indexed position in lane results
  score: number;          // Raw similarity/relevance score
  source_ref: string;
  content_hash: string;
  confidence: number;     // 0-1, lane's confidence in this result
}

/**
 * RRF contribution from a single lane
 */
export interface RRFContribution {
  lane_name: string;
  rrf_score: number;      // 1/(K + rank)
  normalized_score: number; // 0-1 scale
  weight: number;         // Lane weight in final fusion
}

/**
 * Final fused candidate with provenance
 */
export interface FusedCandidate {
  candidate_id: string;
  source_ref: string;
  content_hash: string;
  rrf_score: number;           // Sum of 1/(K + rank) across lanes
  weighted_score: number;      // Final blend score
  final_rank: number;          // 1-indexed position after fusion
  contributions: RRFContribution[]; // Which lanes contributed
  improvement_vs_best: number; // % improvement over best single lane
  winning_lane: string;        // Lane that ranked it highest
  landing_score: number;       // Score from landing lane
}

/**
 * Compute Reciprocal Rank Fusion (RRF) score
 *
 * RRF = sum(1 / (k + rank_i)) for all lanes i
 *
 * This is rank-based fusion: avoids issues with score scaling differences
 * across different retrieval methods (dense vs sparse vs graph).
 */
export function computeRRFScore(
  candidateId: string,
  laneScores: Map<string, LaneScore>,
): number {
  let rrfScore = 0;

  for (const [laneName, score] of laneScores) {
    const contribution = 1 / (RRF_CONSTANTS.K + score.rank);
    rrfScore += contribution;
  }

  return rrfScore;
}

/**
 * Normalize score to 0-1 range using sigmoid
 *
 * Sigmoid(x) = 1 / (1 + e^(-x))
 * Avoids clipping; provides smooth gradient
 */
export function normalizeScore(rawScore: number, scale: number = 5.0): number {
  // Scale before sigmoid to control curvature
  const scaledScore = rawScore * scale;
  return 1 / (1 + Math.exp(-scaledScore));
}

/**
 * Compute weighted fusion score
 *
 * Combines normalized signals from multiple lanes:
 * score = w_content * s_content
 *       + w_summary * s_summary
 *       + w_signature * s_signature
 *       + w_topology * s_topology
 *       + w_domain * s_domain
 *       + w_freshness * s_freshness
 *
 * All component scores are 0-1 normalized before blending.
 */
export function computeWeightedFusionScore(signals: {
  dense_content_score: number;
  dense_summary_score: number;
  dense_signature_score: number;
  topology_embedding_score: number;
  domain_probability: number;
  freshness_score: number;
}): number {
  const normalized = {
    dense_content: normalizeScore(signals.dense_content_score),
    dense_summary: normalizeScore(signals.dense_summary_score),
    dense_signature: normalizeScore(signals.dense_signature_score),
    topology_embedding: normalizeScore(signals.topology_embedding_score),
    domain_classifier: signals.domain_probability, // Already 0-1
    freshness: signals.freshness_score, // Already 0-1
  };

  return (
    FUSION_WEIGHTS.dense_content * normalized.dense_content +
    FUSION_WEIGHTS.dense_summary * normalized.dense_summary +
    FUSION_WEIGHTS.dense_signature * normalized.dense_signature +
    FUSION_WEIGHTS.topology_embedding * normalized.topology_embedding +
    FUSION_WEIGHTS.domain_classifier * normalized.domain_classifier +
    FUSION_WEIGHTS.freshness * normalized.freshness
  );
}

/**
 * Freshness score: decay older candidates
 *
 * score = max(0, 1 - (days_old * decay_per_day))
 */
export function computeFreshnessScore(lastModifiedAt: Date | string): number {
  const now = new Date();
  const modified = typeof lastModifiedAt === 'string' ? new Date(lastModifiedAt) : lastModifiedAt;
  const ageMs = now.getTime() - modified.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  return Math.max(0, 1 - ageDays * RRF_CONSTANTS.FRESHNESS_PENALTY_PER_DAY);
}

/**
 * Fuse multiple ranked lists into single unified ranking
 *
 * Algorithm:
 * 1. Collect candidates from all lanes
 * 2. For each candidate, compute RRF score (sum of 1/(K+rank) across lanes)
 * 3. For each candidate, compute weighted blend score
 * 4. Re-rank by maximum of (RRF, weighted) scores
 * 5. Record which lane had best rank (provenance)
 * 6. Compute improvement vs best single-lane result
 */
export function fuseRetrievalLanes(
  laneResults: Map<string, LaneScore[]>,
  config: Partial<FusionConfig> = {},
): FusedCandidate[] {
  const finalConfig: FusionConfig = {
    strategy: config.strategy ?? 'hybrid', // 'rrf' | 'weighted' | 'hybrid'
    maxCandidates: config.maxCandidates ?? 50,
    includeProvenance: config.includeProvenance ?? true,
  };

  // Collect all unique candidates across lanes
  const candidateMap = new Map<string, Map<string, LaneScore>>();

  for (const [laneName, scores] of laneResults) {
    for (const score of scores.slice(0, RRF_CONSTANTS.MAX_CANDIDATES_PER_LANE)) {
      if (!candidateMap.has(score.candidate_id)) {
        candidateMap.set(score.candidate_id, new Map());
      }
      candidateMap.get(score.candidate_id)!.set(laneName, score);
    }
  }

  // Compute fusion scores for each candidate
  const fusedCandidates: FusedCandidate[] = [];

  for (const [candidateId, laneScores] of candidateMap) {
    const rrfScore = computeRRFScore(candidateId, laneScores);

    // Find winning lane (best rank)
    let winningLane = '';
    let bestRank = Infinity;
    let landingScore = 0;

    for (const [laneName, score] of laneScores) {
      if (score.rank < bestRank) {
        bestRank = score.rank;
        winningLane = laneName;
        landingScore = score.score;
      }
    }

    // Get metadata from any lane (should be consistent)
    const firstScore = Array.from(laneScores.values())[0];

    // Compute weighted score (if available from all lanes, use best estimate)
    const weightedScore = computeWeightedFusionScore({
      dense_content_score: laneScores.get('qdrant_dense')?.score ?? 0,
      dense_summary_score: laneScores.get('qdrant_summary')?.score ?? 0,
      dense_signature_score: laneScores.get('qdrant_signature')?.score ?? 0,
      topology_embedding_score: laneScores.get('topology_embedding')?.score ?? 0,
      domain_probability: laneScores.get('domain_classifier')?.score ?? 0.5,
      freshness_score: computeFreshnessScore(firstScore.content_hash),
    });

    // Choose final score based on strategy
    const finalScore =
      finalConfig.strategy === 'rrf' ? rrfScore :
      finalConfig.strategy === 'weighted' ? weightedScore :
      Math.max(rrfScore, weightedScore); // 'hybrid'

    // Record provenance (which lanes contributed)
    const contributions: RRFContribution[] = [];
    if (finalConfig.includeProvenance) {
      for (const [laneName, score] of laneScores) {
        const contribution = 1 / (RRF_CONSTANTS.K + score.rank);
        const normalized = normalizeScore(score.score);
        const weight = FUSION_WEIGHTS[laneName as keyof typeof FUSION_WEIGHTS] ?? 0.1;

        contributions.push({
          lane_name: laneName,
          rrf_score: contribution,
          normalized_score: normalized,
          weight,
        });
      }
    }

    fusedCandidates.push({
      candidate_id: candidateId,
      source_ref: firstScore.source_ref,
      content_hash: firstScore.content_hash,
      rrf_score: rrfScore,
      weighted_score: weightedScore,
      final_rank: 0, // Will be set after sorting
      contributions,
      improvement_vs_best: 0, // Will be computed
      winning_lane: winningLane,
      landing_score: landingScore,
    });
  }

  // Sort by final score (descending)
  fusedCandidates.sort((a, b) => {
    const scoreA = finalConfig.strategy === 'weighted' ? a.weighted_score : a.rrf_score;
    const scoreB = finalConfig.strategy === 'weighted' ? b.weighted_score : b.rrf_score;
    return scoreB - scoreA;
  });

  // Assign final ranks
  for (let i = 0; i < fusedCandidates.length; i++) {
    fusedCandidates[i].final_rank = i + 1;
  }

  // Compute improvement vs best single lane
  const bestSingleLaneScore = Math.max(
    ...Array.from(laneResults.entries()).map(([_, scores]) =>
      scores.length > 0 ? scores[0].score : 0
    )
  );

  for (const candidate of fusedCandidates) {
    const fusedScore = finalConfig.strategy === 'weighted' ? candidate.weighted_score : candidate.rrf_score;
    const improvement = bestSingleLaneScore > 0
      ? ((fusedScore - bestSingleLaneScore) / bestSingleLaneScore) * 100
      : 0;
    candidate.improvement_vs_best = improvement;
  }

  return fusedCandidates.slice(0, finalConfig.maxCandidates);
}

/**
 * Export for testing: RRF signal normalization
 */
export function exportRFFSignals() {
  return {
    RRF_CONSTANTS,
    FUSION_WEIGHTS,
    computeRRFScore,
    normalizeScore,
    computeWeightedFusionScore,
    computeFreshnessScore,
    fuseRetrievalLanes,
  };
}
