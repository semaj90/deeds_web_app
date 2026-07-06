/**
 * Vector Scorer — Compute semantic similarity score from Qdrant results
 *
 * Phase 1 Quick Win: Replace stub returning 0 with real Qdrant distance scoring
 * Expected impact: +15% NDCG@5 when combined with other scorers
 */

/**
 * Compute vector score from Qdrant search result distance
 *
 * Qdrant returns cosine distance in range [0, 2]:
 * - 0 = perfect match (identical vectors)
 * - 1 = orthogonal vectors (uncorrelated)
 * - 2 = opposite vectors (negated)
 *
 * Normalize to [0, 1] range where 1 = best match, 0 = worst match
 */
export function computeVectorScore(qdrantDistance: number): number {
  // Normalize Qdrant distance (0-2) to score (1-0)
  // Formula: 1 - (distance / 2) handles [0, 2] range correctly
  // - distance=0 → score=1.0 (perfect match)
  // - distance=1 → score=0.5 (orthogonal)
  // - distance=2 → score=0.0 (opposite)
  // Clamp distance to valid range [0, 2] before normalization
  const clampedDistance = Math.max(0, Math.min(2, qdrantDistance));
  const normalized = 1 - clampedDistance / 2;
  return normalized;
}

/**
 * Compute vector score from similarity value (alternative)
 * Use if Qdrant returns similarity instead of distance
 *
 * Similarity in range [-1, 1]:
 * - 1 = perfect match
 * - 0 = uncorrelated
 * - -1 = opposite
 */
export function computeVectorScoreFromSimilarity(similarity: number): number {
  // Normalize similarity [-1, 1] to score [0, 1]
  // Formula: (similarity + 1) / 2
  // - similarity=1 → score=1.0
  // - similarity=0 → score=0.5
  // - similarity=-1 → score=0.0
  const normalized = (similarity + 1) / 2;
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Compute average vector score across multiple candidates
 * Useful for blending multiple vector search results
 */
export function computeAverageVectorScore(distances: number[]): number {
  if (distances.length === 0) return 0;
  const scores = distances.map(computeVectorScore);
  const sum = scores.reduce((a, b) => a + b, 0);
  return sum / scores.length;
}

/**
 * Unit test: verify vector score computation
 */
export function testVectorScorer(): { pass: boolean; message: string } {
  const tests = [
    { distance: 0, expected: 1.0, name: 'Perfect match (distance=0)' },
    { distance: 1, expected: 0.5, name: 'Orthogonal (distance=1)' },
    { distance: 2, expected: 0.0, name: 'Opposite (distance=2)' },
    { distance: 0.5, expected: 0.75, name: 'Good match (distance=0.5)' },
    { distance: 1.5, expected: 0.25, name: 'Poor match (distance=1.5)' },
  ];

  let allPass = true;
  const results = tests.map(test => {
    const actual = computeVectorScore(test.distance);
    const pass = Math.abs(actual - test.expected) < 0.001;
    if (!pass) allPass = false;
    return `${pass ? '✓' : '✗'} ${test.name}: expected ${test.expected}, got ${actual}`;
  });

  return {
    pass: allPass,
    message: results.join('\n')
  };
}
