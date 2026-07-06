/**
 * Semantic Fusion Metrics: NDCG@K, MRR@10, Multi-Lane Coverage, Latency Tracking
 *
 * Measures retrieval quality improvement from RRF fusion vs weighted-sum baseline.
 * Reference implementations: trec_eval, ir-measures
 */

/**
 * Compute NDCG@K (Normalized Discounted Cumulative Gain)
 *
 * Formula:
 *   DCG@K = Σ (rel_i / log2(i+1)) for i=1..K
 *   NDCG@K = DCG@K / IDCG@K
 *
 * @param rankedHits - Hits sorted by score descending
 * @param relevanceLabels - Map of hit ID to relevance (0=irrelevant, 1=relevant)
 * @param k - Cutoff position (default 5)
 * @returns NDCG@K score (0.0-1.0)
 */
export function computeNDCG(
  rankedHits: Array<{ id: string; score: number }>,
  relevanceLabels: Map<string, number>,
  k: number = 5
): number {
  if (rankedHits.length === 0 || relevanceLabels.size === 0) {
    return 0.0;
  }

  // Compute DCG@K
  let dcg = 0;
  for (let i = 0; i < Math.min(k, rankedHits.length); i++) {
    const hitId = rankedHits[i].id;
    const relevance = relevanceLabels.get(hitId) ?? 0;
    const position = i + 1;
    const discount = Math.log2(position + 1);
    dcg += relevance / discount;
  }

  // Compute IDCG@K (ideal ranking: all relevant items first)
  const sortedRelevances = Array.from(relevanceLabels.values()).sort((a, b) => b - a);
  let idcg = 0;
  for (let i = 0; i < Math.min(k, sortedRelevances.length); i++) {
    const relevance = sortedRelevances[i];
    const position = i + 1;
    const discount = Math.log2(position + 1);
    idcg += relevance / discount;
  }

  if (idcg === 0) {
    return 0.0;
  }

  return dcg / idcg;
}

/**
 * Compute MRR@10 (Mean Reciprocal Rank)
 *
 * Formula: MRR@10 = 1 / rank_of_first_relevant (or 0 if no relevant in top 10)
 *
 * @param rankedHits - Hits sorted by score descending
 * @param relevanceLabels - Map of hit ID to relevance (0=irrelevant, 1=relevant)
 * @param k - Cutoff position (default 10)
 * @returns MRR@K score (0.0-1.0)
 */
export function computeMRR(
  rankedHits: Array<{ id: string; score: number }>,
  relevanceLabels: Map<string, number>,
  k: number = 10
): number {
  for (let i = 0; i < Math.min(k, rankedHits.length); i++) {
    const hitId = rankedHits[i].id;
    const relevance = relevanceLabels.get(hitId) ?? 0;

    if (relevance > 0) {
      return 1.0 / (i + 1);
    }
  }

  return 0.0;
}

/**
 * Compute multi-lane coverage percentage
 *
 * Measures how many top-K results receive contributions from 2+ lanes
 * High coverage indicates strong consensus across multiple signal sources
 *
 * @param rankedHits - Hits sorted by RRF score descending
 * @param rrfBreakdowns - Map of hit ID to lane contributions
 * @param k - Cutoff position (default 5)
 * @returns Coverage percentage (0.0-100.0)
 */
export function computeMultiLaneCoverage(
  rankedHits: Array<{ id: string; score: number }>,
  rrfBreakdowns: Map<string, Array<{ lane: string; contribution: number }>>,
  k: number = 5
): number {
  if (rankedHits.length === 0) {
    return 0.0;
  }

  let multiLaneCount = 0;
  for (let i = 0; i < Math.min(k, rankedHits.length); i++) {
    const hitId = rankedHits[i].id;
    const breakdown = rrfBreakdowns.get(hitId) ?? [];

    if (breakdown.length >= 2) {
      multiLaneCount += 1;
    }
  }

  const topK = Math.min(k, rankedHits.length);
  return topK > 0 ? (multiLaneCount / topK) * 100 : 0.0;
}

/**
 * Lane distribution for a result set
 * Shows which lanes contributed to top-K results
 */
export interface LaneDistribution {
  lane: string;
  hitCount: number;
  totalContribution: number;
  avgContribution: number;
}

/**
 * Compute lane distribution for top-K results
 *
 * @param rankedHits - Hits sorted by RRF score descending
 * @param rrfBreakdowns - Map of hit ID to lane contributions
 * @param k - Cutoff position (default 5)
 * @returns Lane distribution stats
 */
export function computeLaneDistribution(
  rankedHits: Array<{ id: string; score: number }>,
  rrfBreakdowns: Map<string, Array<{ lane: string; contribution: number }>>,
  k: number = 5
): LaneDistribution[] {
  const laneStats = new Map<string, { count: number; totalContribution: number }>();

  for (let i = 0; i < Math.min(k, rankedHits.length); i++) {
    const hitId = rankedHits[i].id;
    const breakdown = rrfBreakdowns.get(hitId) ?? [];

    breakdown.forEach(({ lane, contribution }) => {
      if (!laneStats.has(lane)) {
        laneStats.set(lane, { count: 0, totalContribution: 0 });
      }

      const stats = laneStats.get(lane)!;
      stats.count += 1;
      stats.totalContribution += contribution;
    });
  }

  return Array.from(laneStats.entries()).map(([lane, stats]) => ({
    lane,
    hitCount: stats.count,
    totalContribution: stats.totalContribution,
    avgContribution: stats.totalContribution / stats.count
  })).sort((a, b) => b.totalContribution - a.totalContribution);
}

/**
 * Retrieval latency tracking
 */
export interface RetrievalLatency {
  totalMs: number;
  perLaneMs: Map<string, number>;
  mergeMs: number;
}

/**
 * Measure retrieval latency breakdown
 *
 * @param startTime - Start timestamp (ms)
 * @param endTime - End timestamp (ms)
 * @param perLaneTimes - Map of lane name to latency (ms)
 * @param mergeStartTime - Start of merge phase (ms)
 * @param mergeEndTime - End of merge phase (ms)
 * @returns Latency breakdown
 */
export function measureRetrievalLatency(
  startTime: number,
  endTime: number,
  perLaneTimes: Map<string, number>,
  mergeStartTime: number,
  mergeEndTime: number
): RetrievalLatency {
  return {
    totalMs: endTime - startTime,
    perLaneMs: perLaneTimes,
    mergeMs: mergeEndTime - mergeStartTime
  };
}

/**
 * Fusion latency validation (< 5ms requirement)
 *
 * @param latency - Retrieval latency
 * @returns true if within budget, false otherwise
 */
export function validateFusionLatency(latency: RetrievalLatency): boolean {
  return latency.mergeMs < 5;
}

/**
 * Retrieval quality report
 */
export interface RetrievalQualityReport {
  ndcg5: number;
  mrr10: number;
  multiLaneCoverage: number;
  laneDistribution: LaneDistribution[];
  latency: RetrievalLatency;
  hitCount: number;
}

/**
 * Build comprehensive retrieval quality report
 *
 * @param rankedHits - Results sorted by score
 * @param relevanceLabels - Manual relevance judgments
 * @param rrfBreakdowns - Lane contributions
 * @param latency - Latency measurements
 * @returns Complete report
 */
export function buildRetrievalQualityReport(
  rankedHits: Array<{ id: string; score: number }>,
  relevanceLabels: Map<string, number>,
  rrfBreakdowns: Map<string, Array<{ lane: string; contribution: number }>>,
  latency: RetrievalLatency
): RetrievalQualityReport {
  return {
    ndcg5: computeNDCG(rankedHits, relevanceLabels, 5),
    mrr10: computeMRR(rankedHits, relevanceLabels, 10),
    multiLaneCoverage: computeMultiLaneCoverage(rankedHits, rrfBreakdowns, 5),
    laneDistribution: computeLaneDistribution(rankedHits, rrfBreakdowns, 5),
    latency,
    hitCount: rankedHits.length
  };
}

/**
 * Compare two retrieval runs (baseline vs RRF)
 */
export interface MetricsComparison {
  baselineNdcg5: number;
  rrfNdcg5: number;
  improvement: number;
  improvementPercent: number;
  baselineMrr10: number;
  rrfMrr10: number;
  baselineCoverage: number;
  rrfCoverage: number;
}

/**
 * Compute improvement metrics
 *
 * @param baseline - Baseline (weighted-sum) report
 * @param rrf - RRF report
 * @returns Comparison metrics
 */
export function compareMetrics(
  baseline: RetrievalQualityReport,
  rrf: RetrievalQualityReport
): MetricsComparison {
  const ndcgImprovement = rrf.ndcg5 - baseline.ndcg5;
  const ndcgImprovementPercent = baseline.ndcg5 > 0 ? (ndcgImprovement / baseline.ndcg5) * 100 : 0;

  return {
    baselineNdcg5: baseline.ndcg5,
    rrfNdcg5: rrf.ndcg5,
    improvement: ndcgImprovement,
    improvementPercent: ndcgImprovementPercent,
    baselineMrr10: baseline.mrr10,
    rrfMrr10: rrf.mrr10,
    baselineCoverage: baseline.multiLaneCoverage,
    rrfCoverage: rrf.multiLaneCoverage
  };
}

/**
 * Unit test: verify metric calculations
 */
export function testSemanticFusionMetrics(): {
  pass: boolean;
  tests: Array<{ name: string; pass: boolean }>;
} {
  const tests: Array<{ name: string; pass: boolean }> = [];

  // Test 1: Perfect ranking (all top-5 relevant)
  const test1Hits = [
    { id: 'a', score: 0.9 },
    { id: 'b', score: 0.8 },
    { id: 'c', score: 0.7 },
    { id: 'd', score: 0.6 },
    { id: 'e', score: 0.5 }
  ];
  const test1Labels = new Map([['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 1]]);
  const test1NDCG = computeNDCG(test1Hits, test1Labels, 5);
  tests.push({
    name: 'Perfect ranking: NDCG@5 = 1.0',
    pass: Math.abs(test1NDCG - 1.0) < 1e-6
  });

  // Test 2: Partial ranking (3/5 relevant)
  const test2Labels = new Map([['a', 1], ['b', 1], ['c', 1], ['d', 0], ['e', 0]]);
  const test2NDCG = computeNDCG(test1Hits, test2Labels, 5);
  tests.push({
    name: 'Partial ranking: NDCG@5 between 0 and 1',
    pass: test2NDCG > 0 && test2NDCG < 1
  });

  // Test 3: No relevant results
  const test3Labels = new Map([['a', 0], ['b', 0], ['c', 0], ['d', 0], ['e', 0]]);
  const test3NDCG = computeNDCG(test1Hits, test3Labels, 5);
  tests.push({
    name: 'No relevant results: NDCG@5 = 0.0',
    pass: test3NDCG === 0.0
  });

  // Test 4: MRR@10 - first result correct
  const test4Labels = new Map([['a', 1]]);
  const test4MRR = computeMRR(test1Hits, test4Labels, 10);
  tests.push({
    name: 'First result relevant: MRR@10 = 1.0',
    pass: Math.abs(test4MRR - 1.0) < 1e-6
  });

  // Test 5: MRR@10 - tenth result correct
  const test5Hits = Array.from({ length: 10 }, (_, i) => ({
    id: String.fromCharCode(97 + i),
    score: 1 - i * 0.1
  }));
  const test5Labels = new Map([['j', 1]]);
  const test5MRR = computeMRR(test5Hits, test5Labels, 10);
  tests.push({
    name: 'Tenth result relevant: MRR@10 = 0.1',
    pass: Math.abs(test5MRR - 0.1) < 1e-6
  });

  // Test 6: Multi-lane coverage
  const test6Breakdown = new Map([
    ['a', [{ lane: 'dense', contribution: 0.5 }, { lane: 'graph', contribution: 0.3 }]],
    ['b', [{ lane: 'dense', contribution: 0.4 }]],
    ['c', [{ lane: 'lexical', contribution: 0.2 }, { lane: 'cache', contribution: 0.1 }]],
    ['d', [{ lane: 'temporal', contribution: 0.1 }]],
    ['e', [{ lane: 'dense', contribution: 0.3 }, { lane: 'lexical', contribution: 0.1 }]]
  ]);
  const test6Coverage = computeMultiLaneCoverage(test1Hits, test6Breakdown, 5);
  tests.push({
    name: 'Multi-lane coverage: 60% (3 of 5 have 2+ lanes)',
    pass: Math.abs(test6Coverage - 60) < 1
  });

  // Test 7: Lane distribution
  const test7Distribution = computeLaneDistribution(test1Hits, test6Breakdown, 5);
  tests.push({
    name: 'Lane distribution: dense lane appears most',
    pass: test7Distribution.length > 0 && test7Distribution[0].lane === 'dense'
  });

  // Test 8: Latency validation
  const test8Latency = {
    totalMs: 25,
    perLaneMs: new Map([['dense', 5], ['graph', 8], ['lexical', 4]]),
    mergeMs: 3
  };
  const test8Valid = validateFusionLatency(test8Latency);
  tests.push({
    name: 'Fusion latency < 5ms passes validation',
    pass: test8Valid === true
  });

  const allPass = tests.every(t => t.pass);
  return { pass: allPass, tests };
}
