#!/usr/bin/env node
/**
 * Canonical PageRank normalization helper.
 *
 * Rule: store raw PageRank; normalize only at scoring time against the
 * live max from the candidate set — never against a hardcoded constant.
 *
 * Usage:
 *   import { normalizePageRank } from './lib/normalize-pagerank.mjs';
 *   const prNorm = normalizePageRank(row.page_rank_score, maxPageRank);
 *
 * Compatible with scoring-normalize.mjs (normalizeToMax is the general form;
 * this helper is a named convenience wrapper for the PageRank lane specifically).
 */

/**
 * Normalize a single PageRank score against the observed maximum.
 *
 * @param {number|string|null} score      — raw PageRank from atlas_packets
 * @param {number|string|null} maxScore   — max(page_rank_score) from the current candidate set
 * @returns {number} [0, 1]
 */
export function normalizePageRank(score, maxScore) {
  const s   = Number(score ?? 0);
  const max = Number(maxScore ?? 0);
  if (!Number.isFinite(s)   || s   <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.min(s / max, 1);
}
