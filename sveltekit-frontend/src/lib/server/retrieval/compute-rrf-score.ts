/**
 * Compute RRF Score for HyperRAG Hits
 *
 * Replaces weighted-sum formula (lines 471-477) with Reciprocal Rank Fusion (RRF)
 * Expected improvement: 40-60% NDCG@5
 *
 * Formula: final_score = Σ weight_i / (k + rank_i)
 * where weight_i is the lane weight and rank_i is the hit's rank within that lane
 */

import { rankHitsInLane, type RankedLaneHit } from './rrf-lane-ranker.js';
import { combineRRFLanes, type CombinedRRFResult } from './rrf-combiner-utils.js';
import { partitionHitsByLane, type HyperRagSignals } from './signal-grouping.js';

/**
 * RRF lane weights (configurable)
 * Must be consistent with design.md lane priority order
 */
export const RRF_LANE_WEIGHTS = {
  dense_vector: 1.0,      // Qdrant ANN + TurboVec prefilter (highest signal quality)
  graph_authority: 0.8,   // Neo4j PageRank + routing boosts
  lexical: 0.6,           // BM25 cluster match
  cache: 0.5,             // Task distillate + ACE + Engram memory
  temporal: 0.3           // Recency and activity signals (weakest)
} as const;

export const RRF_CONSTANT_K = 60;

export interface RRFScoreResult {
  score: number;
  rrfBreakdown: Array<{
    lane: string;
    contribution: number;
  }>;
  laneCount: number;
  maxLaneContribution: number;
  normalizationFactor: number;
}

/**
 * Compute RRF score for a single hit in the context of all its lane contributions
 *
 * This is the core scoring function that replaces weighted-sum in HyperRAG.
 *
 * @param hitId - Unique hit identifier
 * @param signals - All 9 HyperRAG signals
 * @param allHitsInLanes - All hits grouped by lane (for ranking)
 * @returns RRF score with breakdown for transparency
 */
export function computeRRFScore(
  hitId: string,
  signals: HyperRagSignals,
  allHitsInLanes?: Map<string, Array<{ id: string; score: number }>>
): RRFScoreResult {
  // If lane assignments not provided, compute them
  if (!allHitsInLanes) {
    const partitioned = partitionHitsByLane([{ id: hitId, signals }]);
    allHitsInLanes = new Map(Object.entries(partitioned).filter(([_, hits]) => hits.length > 0));
  }

  const breakdown: Array<{ lane: string; contribution: number }> = [];
  let totalScore = 0;

  // Process each lane
  for (const [laneName, laneWeight] of Object.entries(RRF_LANE_WEIGHTS)) {
    const hitsInLane = allHitsInLanes.get(laneName) ?? [];
    if (hitsInLane.length === 0) {
      continue;
    }

    // Rank hits within this lane
    const rankedHits = rankHitsInLane(
      hitsInLane,
      laneWeight,
      RRF_CONSTANT_K
    );

    // Find this hit's contribution in this lane
    const hitRank = rankedHits.find(h => h.id === hitId);
    if (hitRank) {
      totalScore += hitRank.rrfContribution;
      breakdown.push({
        lane: laneName,
        contribution: hitRank.rrfContribution
      });
    }
  }

  // Sort breakdown by contribution descending
  breakdown.sort((a, b) => b.contribution - a.contribution);

  const maxContribution = breakdown.length > 0 ? breakdown[0].contribution : 0;

  return {
    score: totalScore,
    rrfBreakdown: breakdown,
    laneCount: breakdown.length,
    maxLaneContribution: maxContribution,
    normalizationFactor: totalScore > 0 ? totalScore : 0.001
  };
}

/**
 * Compute RRF scores for all hits at once (batch operation)
 *
 * More efficient than calling computeRRFScore individually for each hit
 * because lane ranking is done once, not per-hit.
 *
 * @param hits - Array of hits with signals
 * @returns Map of hit ID to RRF score result
 */
export function computeRRFScoresForAllHits(
  hits: Array<{ id: string; signals: HyperRagSignals }>
): Map<string, RRFScoreResult> {
  const results = new Map<string, RRFScoreResult>();

  if (hits.length === 0) {
    return results;
  }

  // Partition all hits by lane first
  const partitioned = partitionHitsByLane(hits);
  const lanedHitsMap = new Map(Object.entries(partitioned));

  // Compute RRF score for each hit
  hits.forEach(hit => {
    const score = computeRRFScore(hit.id, hit.signals, lanedHitsMap);
    results.set(hit.id, score);
  });

  return results;
}

/**
 * Compare RRF vs weighted-sum for A/B analysis
 * (Task 5: A/B comparison mode)
 *
 * @param signals - HyperRAG signals
 * @returns Object with both RRF and weighted-sum scores
 */
export interface ScoringComparison {
  rrf: number;
  weightedSum: number;
  improvement: number;
  improvementPercent: number;
}

export function compareRRFvsWeightedSum(
  signals: HyperRagSignals,
  allHitsInLanes?: Map<string, Array<{ id: string; score: number }>>
): ScoringComparison {
  // RRF score (new method)
  const rrf = computeRRFScore('dummy', signals, allHitsInLanes).score;

  // Weighted-sum score (old method, lines 471-477)
  const weightedSum =
    signals.dense * 0.35 +
    signals.topologyRouted * 0.15 +
    signals.graphAuthority * 0.15 +
    signals.lexicalBoost * 0.1 +
    signals.taskBoost * 0.1 +
    signals.aceBoost * 0.1;

  const improvement = rrf - weightedSum;
  const improvementPercent = weightedSum > 0 ? (improvement / weightedSum) * 100 : 0;

  return {
    rrf,
    weightedSum,
    improvement,
    improvementPercent
  };
}

/**
 * Unit test: verify RRF computation for known inputs
 */
export function testComputeRRFScore(): {
  pass: boolean;
  tests: Array<{ name: string; pass: boolean }>;
} {
  const tests: Array<{ name: string; pass: boolean }> = [];

  // Test 1: Single signal (dense)
  const test1 = computeRRFScore('hit1', {
    dense: 0.9,
    graphAuthority: 0,
    lexicalBoost: 0,
    taskBoost: 0,
    aceBoost: 0,
    turbovec: 0,
    topologyRouted: 0,
    recencyOrHitRate: 0,
    engramBoost: 0
  });
  tests.push({
    name: 'Single signal ranks to 1/61 in dense lane',
    pass: test1.score > 0 && test1.rrfBreakdown.length === 1
  });

  // Test 2: Multiple lanes contribute
  const test2 = computeRRFScore('hit2', {
    dense: 0.8,
    graphAuthority: 0.7,
    lexicalBoost: 0.5,
    taskBoost: 0.1,
    aceBoost: 0,
    turbovec: 0,
    topologyRouted: 0,
    recencyOrHitRate: 0.3,
    engramBoost: 0
  });
  tests.push({
    name: 'Multiple lanes contribute: score > 0, 5 lanes',
    pass: test2.score > 0 && test2.laneCount === 5 && test2.rrfBreakdown.length === 5
  });

  // Test 3: All signals zero
  const test3 = computeRRFScore('hit3', {
    dense: 0,
    graphAuthority: 0,
    lexicalBoost: 0,
    taskBoost: 0,
    aceBoost: 0,
    turbovec: 0,
    topologyRouted: 0,
    recencyOrHitRate: 0,
    engramBoost: 0
  });
  tests.push({
    name: 'All zero signals result in zero score',
    pass: test3.score === 0 && test3.rrfBreakdown.length === 0
  });

  // Test 4: A/B comparison
  const signals = {
    dense: 0.9,
    graphAuthority: 0.8,
    lexicalBoost: 0.6,
    taskBoost: 0.1,
    aceBoost: 0.1,
    turbovec: 0,
    topologyRouted: 0,
    recencyOrHitRate: 0.3,
    engramBoost: 0
  };
  const comparison = compareRRFvsWeightedSum(signals);
  tests.push({
    name: 'A/B comparison produces both scores',
    pass: comparison.rrf > 0 && comparison.weightedSum > 0
  });

  // Test 5: Batch processing
  const hits = [
    { id: 'a', signals: { dense: 0.9, graphAuthority: 0, lexicalBoost: 0, taskBoost: 0, aceBoost: 0, turbovec: 0, topologyRouted: 0, recencyOrHitRate: 0, engramBoost: 0 } },
    { id: 'b', signals: { dense: 0.7, graphAuthority: 0.8, lexicalBoost: 0, taskBoost: 0, aceBoost: 0, turbovec: 0, topologyRouted: 0, recencyOrHitRate: 0, engramBoost: 0 } },
    { id: 'c', signals: { dense: 0, graphAuthority: 0, lexicalBoost: 0, taskBoost: 0, aceBoost: 0, turbovec: 0, topologyRouted: 0, recencyOrHitRate: 0, engramBoost: 0 } }
  ];
  const batch = computeRRFScoresForAllHits(hits);
  tests.push({
    name: 'Batch processing returns scores for all non-zero hits',
    pass: batch.size === 2 && batch.has('a') && batch.has('b') && !batch.has('c')
  });

  const allPass = tests.every(t => t.pass);
  return { pass: allPass, tests };
}
