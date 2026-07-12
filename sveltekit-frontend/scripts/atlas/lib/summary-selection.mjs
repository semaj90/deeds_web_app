#!/usr/bin/env node

/**
 * Canonical summary selection policy.
 *
 * Summary embeddings and envelope materializers should use the same explicit
 * set of summary levels so the embedding lane does not widen silently.
 *
 * Canonical levels, in precedence order:
 *   1. packet
 *   2. gemma4_packet_summary
 *   3. file
 *
 * Rows with summary_level = NULL remain legacy/ambiguous and are excluded
 * from the default canonical embedding lane.
 */

export const CANONICAL_SUMMARY_LEVELS = Object.freeze([
  'packet',
  'gemma4_packet_summary',
  'file',
]);

export function canonicalSummaryLevelPredicate(column = 'summary_level') {
  return `${column} IN ('packet', 'gemma4_packet_summary', 'file')`;
}

export function canonicalSummaryLevelRank(alias = 'layer') {
  return `CASE
    WHEN ${alias}.summary_level = 'packet' THEN 0
    WHEN ${alias}.summary_level = 'gemma4_packet_summary' THEN 1
    WHEN ${alias}.summary_level = 'file' THEN 2
    ELSE 99
  END`;
}

export function canonicalSummaryLevelOrder(alias = 'layer') {
  return `${canonicalSummaryLevelRank(alias)}, ${alias}.generated_at DESC NULLS LAST, ${alias}.created_at DESC NULLS LAST`;
}
