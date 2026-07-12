#!/usr/bin/env node

/**
 * Canonical summary selection policy mirror for root-level Atlas scripts.
 *
 * Keep the same precedence as the frontend-local helper:
 *   packet -> gemma4_packet_summary -> file
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
