// sveltekit-frontend/scripts/lib/phase89-rrf.mjs
/**
 * Reciprocal Rank Fusion (RRF)
 * Combines multiple ranked lists into a single fused ranking
 */

/**
 * RRF score for a single item at rank position
 * @param {number} rank - 1-indexed rank position
 * @param {number} k - Constant (default 60, from research)
 */
export function rrf(rank, k = 60) {
  return 1 / (k + rank);
}

/**
 * Fuse multiple ranked lists using RRF
 * @param {Array<Array<Object>>} lists - Array of ranked result lists
 * @param {Array<number>} weights - Optional weights for each list (default: equal weights)
 * @param {Function} getId - Function to extract unique ID from item
 * @returns {Array<Object>} - Fused and re-ranked results
 */
export function fuseRRF(lists, weights = null, getId = (item) => item.id) {
  // Handle case where weights is a function (getId parameter)
  if (typeof weights === 'function') {
    getId = weights;
    weights = null;
  }

  // Default to equal weights
  if (!weights) {
    weights = Array(lists.length).fill(1.0);
  }

  const scores = new Map();

  for (let listIdx = 0; listIdx < lists.length; listIdx++) {
    const list = lists[listIdx];
    const weight = weights[listIdx] || 1.0;

    list.forEach((item, index) => {
      const key = getId(item);
      const rank = index + 1; // 1-indexed

      if (!scores.has(key)) {
        scores.set(key, { item, score: 0, sources: [] });
      }

      const entry = scores.get(key);
      entry.score += rrf(rank) * weight;
      entry.sources.push({ rank, list: listIdx, weight });
    });
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(x => ({
      ...x.item,
      fused_score: x.score,
      fusion_sources: x.sources
    }));
}

/**
 * Weighted RRF (allows different importance for different sources)
 * @param {Array<{list: Array, weight: number}>} weightedLists
 * @param {Function} getId
 */
export function fuseWeightedRRF(weightedLists, getId = (item) => item.id) {
  const scores = new Map();

  for (const { list, weight = 1.0, name } of weightedLists) {
    list.forEach((item, index) => {
      const key = getId(item);
      const rank = index + 1;

      if (!scores.has(key)) {
        scores.set(key, { item, score: 0, sources: [] });
      }

      const entry = scores.get(key);
      entry.score += rrf(rank) * weight;
      entry.sources.push({ rank, weight, source: name || 'unnamed' });
    });
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(x => ({
      ...x.item,
      fused_score: x.score,
      fusion_sources: x.sources
    }));
}
