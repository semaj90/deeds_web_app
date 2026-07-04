#!/usr/bin/env node
/**
 * Shared scoring normalization helpers
 *
 * All scoring lanes that blend PageRank, authority, attention, or frequency
 * must normalize against the actual range in the candidate set — never against
 * a hardcoded constant.
 *
 * Contract:
 *   normalizeToMax(value, candidates)  — divide by max(candidates), floor at 1
 *   normalizeRange(value, min, max)    — min-max rescale to [0,1]
 *   blendRecoveryScore(prNorm, sumScore) — canonical 0.6/0.4 blend
 *   blendKarpathy(prNorm, authNorm, attnNorm) — canonical 0.4/0.3/0.3 blend
 */

/**
 * Normalize a single value against the maximum of a set.
 * Safe: floors the denominator at 1 to avoid div-by-zero.
 *
 * @param {number} value
 * @param {number[]} candidateValues
 * @returns {number} [0, 1]
 */
export function normalizeToMax(value, candidateValues) {
  const denom = Math.max(1, ...candidateValues.map(v => {
    const n = Number.parseFloat(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }));
  return Math.min(1.0, Math.max(0, Number.parseFloat(value ?? 0) / denom));
}

/**
 * Min-max rescale a value to [0, 1] over a known range.
 * When range is zero (all equal), returns 1.0 (all candidates are equally good).
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number} [0, 1]
 */
export function normalizeRange(value, min, max) {
  const range = max - min;
  if (range === 0) return 1.0;
  return Math.min(1.0, Math.max(0, (value - min) / range));
}

/**
 * Canonical recovery blend: PageRank authority 60% + summary relevance 40%.
 * Used by topology-recovery-selector.
 *
 * @param {number} prNorm    — normalized PageRank [0, 1]
 * @param {number} sumScore  — keyword match fraction [0, 1]
 * @returns {number} [0, 1]
 */
export function blendRecoveryScore(prNorm, sumScore) {
  return 0.6 * prNorm + 0.4 * sumScore;
}

/**
 * Canonical Karpathy authority blend: PageRank 40% + attention 30% + authority 30%.
 * Used by karpathy-gpu-enrich and compute-p4-karpathy-blend.
 *
 * @param {number} prNorm    — normalized PageRank [0, 1]
 * @param {number} authNorm  — normalized graph authority [0, 1]
 * @param {number} attnNorm  — normalized GPU attention score [0, 1]
 * @returns {number} [0, 1]
 */
export function blendKarpathy(prNorm, authNorm, attnNorm) {
  return 0.4 * prNorm + 0.3 * attnNorm + 0.3 * authNorm;
}
