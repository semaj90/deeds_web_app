/**
 * Pure, dependency-free BoW (Bag-of-Words) helpers used by the retrieval spine.
 * No imports — safe to use in tests without any server mock setup.
 */

/**
 * Tokenise a query string into a set of lowercase terms (length ≥ 3).
 * Preserves intra-token separators (_, ., $, /, -) so tokens like
 * `$lib/server/search` or `som_bmu_col` survive as single terms.
 */
export function tokenizeBowQuery(query: string): Set<string> {
  return new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9_.$/-]+/i)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3),
  );
}

/**
 * Weighted dot-product between a query term set and a term→weight map.
 * Returns the raw score and which terms matched (for tracing).
 */
export function weightedBowOverlapScore(
  queryTerms: Set<string>,
  weights: Record<string, number>,
): { score: number; matchedTerms: string[] } {
  let score = 0;
  const matchedTerms: string[] = [];
  for (const [term, weight] of Object.entries(weights)) {
    if (queryTerms.has(term)) {
      score += Number(weight) || 0;
      matchedTerms.push(term);
    }
  }
  return { score, matchedTerms };
}

/**
 * Clamp a raw BoW score into a retrieval boost ∈ [0, 0.12].
 * Scale factor 0.24: a weighted overlap of 0.5 (half the cluster vocabulary
 * matching) yields the full +0.12 cap.
 */
export function boundedBowBoost(weightedScore: number): number {
  return Math.min(Math.max(weightedScore, 0) * 0.24, 0.12);
}
