/**
 * RRF Lane Ranker: Rank hits within a single signal lane using Reciprocal Rank Fusion
 *
 * Formula: contribution = weight / (k + rank)
 * This module ranks hits within a lane independently, producing RRF contributions
 * that are then summed across all lanes by the RRF combiner.
 */

export interface LaneHit {
  id: string;
  score: number;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface RankedLaneHit {
  id: string;
  rank: number;
  rrfContribution: number;
  originalScore: number;
  text?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Rank hits within a lane and compute RRF contributions
 *
 * Algorithm:
 * 1. Sort hits by score descending (highest score = rank 1)
 * 2. Break ties deterministically by hit ID (ascending alphabetical)
 * 3. Compute RRF contribution: weight / (k + rank) for each hit
 * 4. Return ranked hits with their contributions
 *
 * @param hits - Array of hits to rank (can be empty)
 * @param laneWeight - Weight multiplier for this lane (default 1.0)
 * @param k - RRF constant to prevent singularity at rank 1 (default 60)
 * @returns Array of hits with rank and RRF contribution scores
 */
export function rankHitsInLane(
  hits: LaneHit[],
  laneWeight: number = 1.0,
  k: number = 60
): RankedLaneHit[] {
  // Handle edge cases
  if (hits.length === 0) {
    return [];
  }

  if (hits.length === 1) {
    return [
      {
        id: hits[0].id,
        rank: 1,
        rrfContribution: (laneWeight / (k + 1)),
        originalScore: hits[0].score,
        text: hits[0].text,
        metadata: hits[0].metadata
      }
    ];
  }

  // Sort by score descending, break ties by ID ascending (deterministic)
  const sorted = [...hits].sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    // Tie-breaking: use ID for stable ordering
    return a.id.localeCompare(b.id);
  });

  // Compute RRF contributions
  return sorted.map((hit, index) => {
    const rank = index + 1; // Rank starts at 1
    const rrfContribution = laneWeight / (k + rank);

    return {
      id: hit.id,
      rank,
      rrfContribution,
      originalScore: hit.score,
      text: hit.text,
      metadata: hit.metadata
    };
  });
}

/**
 * Compute RRF score for hits with all zero scores (edge case)
 * Returns 0.0 to signal no contribution from this lane
 */
export function handleAllZeroScores(
  hits: LaneHit[],
  laneWeight: number = 1.0
): RankedLaneHit[] {
  if (hits.length === 0) {
    return [];
  }

  // All hits get the same rank (1) since scores are identical
  // Each contributes equally: weight / (k + 1)
  const k = 60;
  const rrfContribution = laneWeight / (k + 1);

  return hits.map((hit, index) => ({
    id: hit.id,
    rank: 1, // All tied at rank 1
    rrfContribution,
    originalScore: 0.0,
    text: hit.text,
    metadata: hit.metadata
  }));
}

/**
 * Validate RRF score computation
 *
 * @param contribution - The RRF contribution value
 * @param laneWeight - Weight used in computation
 * @param rank - The rank used in computation
 * @param k - The RRF constant used
 * @returns true if contribution is valid, false otherwise
 */
export function isValidRRFScore(
  contribution: number,
  laneWeight: number,
  rank: number,
  k: number
): boolean {
  if (!Number.isFinite(contribution)) {
    return false;
  }

  if (contribution < 0) {
    return false;
  }

  const expected = laneWeight / (k + rank);
  const tolerance = 1e-10;

  return Math.abs(contribution - expected) < tolerance;
}

/**
 * Unit test helper: verify RRF formula correctness with known inputs
 */
export function testRRFFormula(): {
  pass: boolean;
  tests: Array<{ name: string; pass: boolean }>;
} {
  const tests: Array<{ name: string; pass: boolean }> = [];

  // Test 1: Single hit
  const test1 = rankHitsInLane([{ id: 'a', score: 1.0 }], 1.0, 60);
  tests.push({
    name: 'Single hit: rank 1, contribution 1/61',
    pass: test1.length === 1 && test1[0].rank === 1 && Math.abs(test1[0].rrfContribution - 1/61) < 1e-10
  });

  // Test 2: Multiple hits with tie-breaking
  const test2 = rankHitsInLane(
    [
      { id: 'z', score: 0.8 },
      { id: 'a', score: 0.8 },
      { id: 'm', score: 0.5 }
    ],
    1.0,
    60
  );
  tests.push({
    name: 'Ties broken by ID (a before z)',
    pass: test2.length === 3 && test2[0].id === 'a' && test2[1].id === 'z'
  });

  // Test 3: Custom weight
  const test3 = rankHitsInLane(
    [{ id: 'x', score: 1.0 }],
    0.8,
    60
  );
  tests.push({
    name: 'Custom weight 0.8: contribution 0.8/61',
    pass: test3.length === 1 && Math.abs(test3[0].rrfContribution - 0.8/61) < 1e-10
  });

  // Test 4: All zero scores edge case
  const test4 = handleAllZeroScores(
    [
      { id: 'a', score: 0.0 },
      { id: 'b', score: 0.0 }
    ],
    1.0
  );
  tests.push({
    name: 'All zero scores: each gets rank 1',
    pass: test4.length === 2 && test4[0].rank === 1 && test4[1].rank === 1
  });

  // Test 5: Empty lane
  const test5 = rankHitsInLane([], 1.0, 60);
  tests.push({
    name: 'Empty lane returns empty array',
    pass: test5.length === 0
  });

  // Test 6: Validation function
  const isValid = isValidRRFScore(1/61, 1.0, 1, 60);
  tests.push({
    name: 'RRF score validation',
    pass: isValid
  });

  const allPass = tests.every(t => t.pass);
  return { pass: allPass, tests };
}