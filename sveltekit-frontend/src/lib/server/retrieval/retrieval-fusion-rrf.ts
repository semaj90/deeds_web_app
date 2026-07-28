/**
 * Reciprocal Rank Fusion (RRF) for Multi-Lane Retrieval
 *
 * Combines scores from independent ranking functions (Qdrant 384, Qdrant 768, BM25, Neo4j)
 * without averaging directly. RRF is rank-based so it's resilient to uncalibrated score distributions.
 *
 * Formula: RRF(d) = sum over lanes ( 1 / (k + rank_in_lane) )
 * where k is a constant (typically 60) to prevent rank-0 explosion.
 */

import {
  RetrievalCandidate,
  RetrievalScoreSource,
  RetrievalRuntimeSummary,
} from '../atlas/contracts/retrieval-candidate';

const RRF_DENOMINATOR_CONSTANT = 60;  // Standard RRF constant

export interface RrfLaneRanks {
  [RetrievalScoreSource.QDRANT_384]?: number;
  [RetrievalScoreSource.QDRANT_768]?: number;
  [RetrievalScoreSource.BM25]?: number;
  [RetrievalScoreSource.BM42]?: number;
  [RetrievalScoreSource.POSTGRES_LEXICAL]?: number;
  [RetrievalScoreSource.NEO4J_GRAPH]?: number;
  [RetrievalScoreSource.REDIS_CENTROID]?: number;
}

/**
 * Compute RRF component for a single lane
 * Input: rank (0-indexed position in lane)
 * Output: RRF score component (0 < component <= 1/(k+0) ≈ 0.0167 for k=60)
 */
export function computeRrfComponent(rank: number): number {
  return 1 / (RRF_DENOMINATOR_CONSTANT + rank);
}

/**
 * Fuse candidates from multiple lanes using RRF
 *
 * Input:
 *   candidates from qdrant_384: ranked 0, 1, 2, ...
 *   candidates from qdrant_768: ranked 0, 1, 2, ...
 *   candidates from bm25: ranked 0, 1, 2, ...
 *
 * Per-lane weighting (configurable):
 *   qdrant_384: 0.35 (online retrieval, fast)
 *   qdrant_768: 0.40 (semantic authority)
 *   bm25:       0.15 (lexical recall)
 *   neo4j:      0.10 (graph traversal)
 */
export const RRF_LANE_WEIGHTS: Record<RetrievalScoreSource, number> = {
  [RetrievalScoreSource.QDRANT_384]: 0.35,
  [RetrievalScoreSource.QDRANT_768]: 0.40,
  [RetrievalScoreSource.BM25]: 0.15,
  [RetrievalScoreSource.BM42]: 0.05,
  [RetrievalScoreSource.POSTGRES_LEXICAL]: 0.05,
  [RetrievalScoreSource.NEO4J_GRAPH]: 0.10,
  [RetrievalScoreSource.REDIS_CENTROID]: 0.05,
  [RetrievalScoreSource.LATE_INTERACTION_RERANKER]: 0.20,
};

export interface RrfFusionInput {
  lane: RetrievalScoreSource;
  candidates: RetrievalCandidate[];  // Ranked 0, 1, 2, ...
}

/**
 * Fuse multiple lane results into a single ranked list
 */
export function rrfMergeMultipleLanes(
  inputs: RrfFusionInput[],
  weights?: Partial<typeof RRF_LANE_WEIGHTS>
): RetrievalCandidate[] {
  const mergedWeights = { ...RRF_LANE_WEIGHTS, ...weights };

  // Map from packetKey → accumulated RRF score + per-lane ranks
  const packetScores = new Map<
    string,
    {
      candidate: RetrievalCandidate;
      rrfScore: number;
      rrfRanks: Record<RetrievalScoreSource, number | undefined>;
    }
  >();

  // Process each lane
  for (const input of inputs) {
    const laneWeight = mergedWeights[input.lane] || 0;
    if (laneWeight === 0) continue;  // Skip lanes with zero weight

    for (let rank = 0; rank < input.candidates.length; rank++) {
      const candidate = input.candidates[rank];
      const rrfComponent = computeRrfComponent(rank) * laneWeight;

      const existing = packetScores.get(candidate.packetKey);
      if (existing) {
        // Accumulate RRF score
        existing.rrfScore += rrfComponent;
        existing.rrfRanks[input.lane] = rank;
      } else {
        // First appearance of this packet
        const rrfRanks: Record<RetrievalScoreSource, number | undefined> = {
          [RetrievalScoreSource.QDRANT_384]: undefined,
          [RetrievalScoreSource.QDRANT_768]: undefined,
          [RetrievalScoreSource.BM25]: undefined,
          [RetrievalScoreSource.BM42]: undefined,
          [RetrievalScoreSource.POSTGRES_LEXICAL]: undefined,
          [RetrievalScoreSource.NEO4J_GRAPH]: undefined,
          [RetrievalScoreSource.REDIS_CENTROID]: undefined,
          [RetrievalScoreSource.LATE_INTERACTION_RERANKER]: undefined,
        };
        rrfRanks[input.lane] = rank;

        packetScores.set(candidate.packetKey, {
          candidate,
          rrfScore: rrfComponent,
          rrfRanks,
        });
      }
    }
  }

  // Sort by RRF score (descending) and attach final ranks
  const sorted = Array.from(packetScores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map((entry, finalRank) => ({
      ...entry.candidate,
      rrfScore: entry.rrfScore,
      rrfRanks: entry.rrfRanks,
    }));

  return sorted;
}

/**
 * Simple two-lane RRF fusion (Qdrant 384 + 768, most common case)
 */
export function rrfMergeDenseQdrant(
  candidates384: RetrievalCandidate[],
  candidates768: RetrievalCandidate[]
): RetrievalCandidate[] {
  return rrfMergeMultipleLanes([
    { lane: RetrievalScoreSource.QDRANT_384, candidates: candidates384 },
    { lane: RetrievalScoreSource.QDRANT_768, candidates: candidates768 },
  ]);
}

/**
 * Compute runtime summary from fusion result
 */
export function computeRuntimeSummary(
  inputs: RrfFusionInput[],
  fusedResult: RetrievalCandidate[]
): RetrievalRuntimeSummary {
  // Count hits per lane (before merge)
  const candidateCounts: Record<RetrievalScoreSource, number> = {
    [RetrievalScoreSource.QDRANT_384]: 0,
    [RetrievalScoreSource.QDRANT_768]: 0,
    [RetrievalScoreSource.BM25]: 0,
    [RetrievalScoreSource.BM42]: 0,
    [RetrievalScoreSource.POSTGRES_LEXICAL]: 0,
    [RetrievalScoreSource.NEO4J_GRAPH]: 0,
    [RetrievalScoreSource.REDIS_CENTROID]: 0,
    [RetrievalScoreSource.LATE_INTERACTION_RERANKER]: 0,
  };

  for (const input of inputs) {
    candidateCounts[input.lane] = input.candidates.length;
  }

  // Count lane overlap (after merge)
  let dense384AndDense768 = 0;
  let dense384Only = 0;
  let dense768Only = 0;
  let otherLaneOnly = 0;

  for (const candidate of fusedResult) {
    const has384 = candidate.rrfRanks?.[RetrievalScoreSource.QDRANT_384] !== undefined;
    const has768 = candidate.rrfRanks?.[RetrievalScoreSource.QDRANT_768] !== undefined;

    if (has384 && has768) {
      dense384AndDense768++;
    } else if (has384) {
      dense384Only++;
    } else if (has768) {
      dense768Only++;
    } else {
      otherLaneOnly++;
    }
  }

  // Compute score distributions per lane
  const scoreDistribution: Record<RetrievalScoreSource, {
    mean: number;
    stddev: number;
    min: number;
    max: number;
  }> = {} as any;

  for (const input of inputs) {
    const scores = input.candidates
      .map(c => c.rawScores[scoresKeyForSource(input.lane)] ?? 0)
      .filter(s => s > 0);

    if (scores.length === 0) {
      scoreDistribution[input.lane] = { mean: 0, stddev: 0, min: 0, max: 0 };
      continue;
    }

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
    const stddev = Math.sqrt(variance);

    scoreDistribution[input.lane] = {
      mean,
      stddev,
      min: Math.min(...scores),
      max: Math.max(...scores),
    };
  }

  return {
    candidateCounts,
    uniquePacketsAfterMerge: fusedResult.length,
    laneOverlap: {
      dense384AndDense768,
      dense384Only,
      dense768Only,
      otherLaneOnly,
    },
    scoreDistribution,
  };
}

/**
 * Helper: map RetrievalScoreSource to rawScores key
 */
function scoresKeyForSource(source: RetrievalScoreSource): keyof any {
  switch (source) {
    case RetrievalScoreSource.QDRANT_384:
      return 'dense384';
    case RetrievalScoreSource.QDRANT_768:
      return 'dense768';
    case RetrievalScoreSource.BM25:
      return 'bm25';
    case RetrievalScoreSource.BM42:
      return 'bm42';
    case RetrievalScoreSource.REDIS_CENTROID:
      return 'centroid';
    case RetrievalScoreSource.NEO4J_GRAPH:
      return 'graph';
    case RetrievalScoreSource.LATE_INTERACTION_RERANKER:
      return 'lateInteraction';
    default:
      return 'unknown';
  }
}
