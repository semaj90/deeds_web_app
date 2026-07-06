/**
 * RRF Combiner Utils: Merge ranked hits from multiple lanes into unified final score
 *
 * Algorithm:
 * 1. Deduplicate hits by ID across all lanes
 * 2. Sum RRF contributions for each hit across lanes
 * 3. Sort by final score descending
 * 4. Use metadata from highest-contributing lane for each hit
 */

export interface LaneContribution {
  lane: string;
  laneWeight: number;
  rank: number;
  rrfContribution: number;
}

export interface HitWithContributions {
  id: string;
  finalScore: number;
  contributions: LaneContribution[];
  primaryLane: string;
  primaryLaneContribution: number;
  metadata?: Record<string, unknown>;
  text?: string;
}

export interface CombinedRRFResult {
  id: string;
  finalScore: number;
  sourceCount: number;
  sources: string[];
  metadata?: Record<string, unknown>;
  text?: string;
  rrfBreakdown: {
    lane: string;
    contribution: number;
  }[];
}

/**
 * Merge ranked hits from multiple lanes into unified final score via RRF
 *
 * @param lanedHits - Map of lane name → ranked hits with contributions
 * @returns Sorted array of combined results with final RRF scores
 */
export function combineRRFLanes(
  lanedHits: Map<string, Array<{ id: string; rrfContribution: number; rank: number; metadata?: Record<string, unknown>; text?: string }>>
): CombinedRRFResult[] {
  // Accumulate contributions per hit ID
  const hitAccumulator = new Map<string, HitWithContributions>();

  lanedHits.forEach((hits, laneName) => {
    hits.forEach(hit => {
      if (!hitAccumulator.has(hit.id)) {
        hitAccumulator.set(hit.id, {
          id: hit.id,
          finalScore: 0,
          contributions: [],
          primaryLane: laneName,
          primaryLaneContribution: hit.rrfContribution,
          metadata: hit.metadata,
          text: hit.text
        });
      }

      const accumulated = hitAccumulator.get(hit.id)!;
      accumulated.finalScore += hit.rrfContribution;
      accumulated.contributions.push({
        lane: laneName,
        laneWeight: 1.0, // Will be set by caller if needed
        rank: hit.rank,
        rrfContribution: hit.rrfContribution
      });

      // Update primary lane if this contribution is larger
      if (hit.rrfContribution > accumulated.primaryLaneContribution) {
        accumulated.primaryLane = laneName;
        accumulated.primaryLaneContribution = hit.rrfContribution;
        accumulated.metadata = hit.metadata;
      }
    });
  });

  // Sort by final score descending
  const sorted = Array.from(hitAccumulator.values()).sort(
    (a, b) => b.finalScore - a.finalScore
  );

  // Convert to output format with breakdown
  return sorted.map(hit => ({
    id: hit.id,
    finalScore: hit.finalScore,
    sourceCount: hit.contributions.length,
    sources: [...new Set(hit.contributions.map(c => c.lane))],
    metadata: hit.metadata,
    text: hit.text,
    rrfBreakdown: hit.contributions
      .map(c => ({ lane: c.lane, contribution: c.rrfContribution }))
      .sort((a, b) => b.contribution - a.contribution)
  }));
}

/**
 * Handle hit deduplication by ID
 * When same hit appears in multiple lanes, use metadata from highest-contributing lane
 *
 * Lane priority (by default): dense_vector > graph_authority > lexical > cache > temporal
 */
export function deduplicateByIdWithMetadata(
  laneName: string,
  laneIndex: number,
  hit: { id: string; rrfContribution: number; metadata?: Record<string, unknown> },
  existing: HitWithContributions
): HitWithContributions {
  // If current contribution is higher, promote metadata from this lane
  if (hit.rrfContribution > existing.primaryLaneContribution) {
    return {
      ...existing,
      primaryLane: laneName,
      primaryLaneContribution: hit.rrfContribution,
      metadata: hit.metadata || existing.metadata
    };
  }

  // Otherwise keep existing
  return existing;
}

/**
 * Sort results by final RRF score descending
 */
export function sortByRRFScoreDescending(
  results: CombinedRRFResult[]
): CombinedRRFResult[] {
  return [...results].sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Filter results by minimum RRF score threshold
 */
export function filterByMinScore(
  results: CombinedRRFResult[],
  minScore: number = 0.001
): CombinedRRFResult[] {
  return results.filter(r => r.finalScore >= minScore);
}

/**
 * Preserve original signal metadata for transparency
 * Returns hits with both signals (from original retrieval) and rrfBreakdown (from RRF fusion)
 */
export function attachSignalMetadata(
  result: CombinedRRFResult,
  originalSignals: Record<string, unknown>
): CombinedRRFResult & { signals: Record<string, unknown> } {
  return {
    ...result,
    signals: originalSignals
  };
}

/**
 * Unit test: verify hit deduplication and score summation
 */
export function testRRFCombiner(): {
  pass: boolean;
  tests: Array<{ name: string; pass: boolean }>;
} {
  const tests: Array<{ name: string; pass: boolean }> = [];

  // Test 1: Hit appears in multiple lanes
  const test1Lanes = new Map([
    ['dense_vector', [
      { id: 'auth:session:validator', rrfContribution: 0.015, rank: 3, metadata: { source: 'dense' } }
    ]],
    ['graph_authority', [
      { id: 'auth:session:validator', rrfContribution: 0.012, rank: 5, metadata: { source: 'graph' } }
    ]]
  ]);
  const test1Result = combineRRFLanes(test1Lanes);
  tests.push({
    name: 'Hit appears in multiple lanes: scores sum to 0.027',
    pass: test1Result.length === 1 && Math.abs(test1Result[0].finalScore - 0.027) < 1e-10 && test1Result[0].sourceCount === 2
  });

  // Test 2: Hit appears in one lane only
  const test2Lanes = new Map([
    ['cache', [
      { id: 'cache:hit:acme', rrfContribution: 0.025, rank: 2, metadata: { source: 'cache' } }
    ]],
    ['lexical', []]
  ]);
  const test2Result = combineRRFLanes(test2Lanes);
  tests.push({
    name: 'Hit appears in one lane only: score is 0.025',
    pass: test2Result.length === 1 && Math.abs(test2Result[0].finalScore - 0.025) < 1e-10 && test2Result[0].sourceCount === 1
  });

  // Test 3: All lanes contribute
  const test3Lanes = new Map([
    ['dense_vector', [{ id: 'consensus:hit', rrfContribution: 0.015, rank: 1 }]],
    ['graph_authority', [{ id: 'consensus:hit', rrfContribution: 0.012, rank: 2 }]],
    ['lexical', [{ id: 'consensus:hit', rrfContribution: 0.008, rank: 3 }]],
    ['cache', [{ id: 'consensus:hit', rrfContribution: 0.010, rank: 4 }]],
    ['temporal', [{ id: 'consensus:hit', rrfContribution: 0.006, rank: 5 }]]
  ]);
  const test3Result = combineRRFLanes(test3Lanes);
  tests.push({
    name: 'All lanes contribute: score is 0.051',
    pass: test3Result.length === 1 && Math.abs(test3Result[0].finalScore - 0.051) < 1e-10 && test3Result[0].sourceCount === 5
  });

  // Test 4: Sorted output
  const test4Lanes = new Map([
    ['dense_vector', [
      { id: 'a', rrfContribution: 0.051, rank: 1 },
      { id: 'b', rrfContribution: 0.027, rank: 2 },
      { id: 'c', rrfContribution: 0.025, rank: 3 },
      { id: 'd', rrfContribution: 0.012, rank: 4 },
      { id: 'e', rrfContribution: 0.008, rank: 5 }
    ]]
  ]);
  const test4Result = combineRRFLanes(test4Lanes);
  const isSorted = test4Result[0].finalScore >= test4Result[1].finalScore && test4Result[1].finalScore >= test4Result[2].finalScore;
  tests.push({
    name: 'Sorted output: highest score first',
    pass: test4Result.length === 5 && isSorted
  });

  // Test 5: Empty lanes
  const test5Lanes = new Map([
    ['dense_vector', [] as any[]],
    ['graph_authority', [] as any[]]
  ]);
  const test5Result = combineRRFLanes(test5Lanes);
  tests.push({
    name: 'Empty lanes return empty result',
    pass: test5Result.length === 0
  });

  // Test 6: Metadata from highest-contributing lane
  const test6Lanes = new Map([
    ['dense_vector', [{ id: 'x', rrfContribution: 0.02, rank: 1, metadata: { high: true } }]],
    ['lexical', [{ id: 'x', rrfContribution: 0.005, rank: 10, metadata: { high: false } }]]
  ]);
  const test6Result = combineRRFLanes(test6Lanes);
  tests.push({
    name: 'Metadata from highest-contributing lane',
    pass: test6Result.length === 1 && (test6Result[0].metadata as any)?.high === true
  });

  const allPass = tests.every(t => t.pass);
  return { pass: allPass, tests };
}
