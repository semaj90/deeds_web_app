/**
 * RF7-LANE-ALIAS-CONVERGENCE-01 — PROVEN_ZERO_BEHAVIOR_CHANGE (2026-09-06).
 *
 * Renamed from `dense-lane-aliases.ts` per external review: the original name was misleading once
 * the module also carried lexical aliases, and continuing to grow file-local `isXAlias()` helpers
 * (`isDenseLaneAlias`, `isLexicalLaneAlias`, ...) would have slowly recreated the exact per-caller
 * duplication this module exists to eliminate. Exports one semantic normalization contract instead.
 *
 * Single source of truth for the "executor name -> logical semantic lane" equivalence class that
 * RF6-RRF-FUSE-HARDEN-01 hardened independently in two places: `search-runtime.ts`'s
 * `getFusionLogicalLane()` and `rrf-fuse.ts`'s `toLogicalLaneName()`. Both files previously
 * hand-maintained their own alias list for "these executor names are all the same dense/lexical
 * vote" — exactly the kind of duplicated equivalence-class data that can silently drift apart
 * across two independent edits (see root CLAUDE.md's Duplication Prevention section).
 *
 * `CanonicalFusionLane` names every logical fusion lane this repo's eventual canonical fusion core
 * (RF7's still-open aggregation-core consolidation, tracked separately, NOT this module) will need
 * to reason about — but `normalizeRetrievalLane()` below only actually classifies the lanes this
 * module owns real alias data for (`dense`, `lexical`). It returns `undefined` for everything else;
 * callers still own their own remaining lane classification exactly as before. This module owns
 * ONLY the alias data for the two lanes proven duplicated across both callers, not the full lane
 * taxonomy and not the aggregation algorithm — `search-runtime.ts` and `rrf-fuse.ts` still each own
 * their own fusion/dedup logic (different input shapes, different output shapes, different lane
 * vocabularies). Consolidating the full aggregation core is a separate, larger step (RF7 long-term
 * convergence), not attempted here — see `RF7-CONTRACT-PARITY-01` in this change's tasks.md for the
 * planned next step (a parity contract, `FusionContributionV1`, proving both callers reduce to the
 * same semantics via differential fixtures, BEFORE any shared aggregation kernel is extracted).
 *
 * CORRECTED 2026-09-06: an external review proposed this type as
 * `'dense'|'lexical'|'exact'|'ast'|'bm42'|'graph'|'other'` without reading the actual two callers'
 * code. Checked against both real types before use: `search-runtime.ts`'s `LogicalRetrievalLane` is
 * `'dense'|'lexical'|'exact'|'ast'|'schema'|'rg'|'bm42'` (no `graph`), and `rrf-fuse.ts`/
 * `rrf-contract.ts`'s raw `RrfLaneName` is `'bm42'|'rg'|'dense_384'|'dense_768'|'turbovec'|
 * 'topology'|'authority'|'dispatcher'` (also no `graph`). Widened the union to the real superset
 * (`schema`, `rg` added; invented `graph` dropped, `topology`/`authority`/`dispatcher` folded into
 * `other` since neither caller's *logical* lane vocabulary names them individually) rather than
 * building `FusionContributionV1` against a lane set that can't actually represent either caller's
 * real output.
 */

export type CanonicalFusionLane = 'dense' | 'lexical' | 'exact' | 'ast' | 'schema' | 'rg' | 'bm42' | 'other';

/** Executor/scoreSource names that all represent one logical dense semantic-vector vote. */
const DENSE_LANE_ALIASES: readonly string[] = [
  'dense',
  'dense_384',
  'dense_768',
  'qdrant',
  'qdrant_vector',
  'qdrant_768',
  'turbovec',
  'turbovec_ann',
  'cuvs',
  'cagra',
];

/** Executor/scoreSource names that all represent one logical lexical/BM25 vote. */
const LEXICAL_LANE_ALIASES: readonly string[] = ['bm25', 'postgres_trigram', 'lexical'];

const DENSE_LANE_ALIAS_SET = new Set(DENSE_LANE_ALIASES);
const LEXICAL_LANE_ALIAS_SET = new Set(LEXICAL_LANE_ALIASES);

/**
 * Normalizes an executor/scoreSource name to its logical fusion lane, for the two lanes this
 * module owns alias data for. Returns `undefined` for anything else (exact/ast/schema/rg/bm42/
 * topology/authority/dispatcher) — the caller falls through to its own remaining lane-
 * classification logic for those, unchanged.
 */
export function normalizeRetrievalLane(value: string): CanonicalFusionLane | undefined {
  const normalized = value.trim().toLowerCase();
  if (DENSE_LANE_ALIAS_SET.has(normalized)) return 'dense';
  if (LEXICAL_LANE_ALIAS_SET.has(normalized)) return 'lexical';
  return undefined;
}
