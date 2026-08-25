/**
 * @deprecated Compatibility re-export only. Renamed 2026-08-26 to
 * postgres-fts.adapter.ts because this is PostgreSQL native tsvector/GIN
 * full-text search (ts_rank_cd cover-density ranking), not BM25 — pg_search
 * is not installed in this repo. See postgres-fts.adapter.ts for the
 * canonical implementation and openspec/changes/parent-atlas-neural-prefill-
 * encoder/tasks.md's DBCTX-01/BM25 cleanup entries for the naming
 * rationale. Do not add new callers of this file — import from
 * postgres-fts.adapter.js instead.
 *
 * BM25Candidate is defined as its own flat interface here (not derived via
 * Omit<PostgresFtsCandidate, ...>) because CandidateForIdentityResolution's
 * `[key: string]: unknown` index signature makes Omit/Pick widen every named
 * property to `unknown` — a pre-existing TypeScript structural-typing quirk,
 * not something introduced by this rename. Field list matches the original
 * pre-rename shape exactly.
 */

import {
  searchPostgresFts,
  scorePostgresFtsFallback as scoreFallbackImpl,
  filterBySourceScope as filterFtsBySourceScopeImpl,
  validatePostgresFtsResults as validateFtsResultsImpl,
  type PostgresFtsCandidate,
  type PostgresFtsSearchOptions,
} from './postgres-fts.adapter.js';
import type { CandidateForIdentityResolution } from './identity-resolver.js';

export type Postgres25TextSearchOptions = PostgresFtsSearchOptions;

// Extends CandidateForIdentityResolution directly (matching the original
// pre-rename shape) rather than deriving via Omit<PostgresFtsCandidate, ...>
// — Omit/Pick over a type with CandidateForIdentityResolution's
// `[key: string]: unknown` index signature widens every named property to
// `unknown`, which silently broke retrieval-facade.ts's identity-resolution
// call site when first tried here.
export interface BM25Candidate extends CandidateForIdentityResolution {
  retrieved_via: 'bm25';
  retrieval_algorithm: 'postgres_fts_ts_rank_cd';
  identity_resolution_source: 'source_ref_content_hash_exact';
  title?: string;
  snippet?: string;
}

function toBm25Shape(candidates: PostgresFtsCandidate[]): BM25Candidate[] {
  return candidates.map((c): BM25Candidate => ({
    id: c.id,
    qdrant_point_id: c.qdrant_point_id as string | undefined,
    packet_key: c.packet_key,
    source_ref: c.source_ref,
    feature_id: c.feature_id,
    content_hash: c.content_hash,
    score: c.score,
    title: c.title,
    snippet: c.snippet,
    retrieved_via: 'bm25',
    retrieval_algorithm: 'postgres_fts_ts_rank_cd',
    identity_resolution_source: 'source_ref_content_hash_exact',
  }));
}

function toFtsShape(candidates: BM25Candidate[]): PostgresFtsCandidate[] {
  return candidates.map((c): PostgresFtsCandidate => ({
    id: c.id,
    packet_key: c.packet_key,
    source_ref: c.source_ref,
    feature_id: c.feature_id,
    content_hash: c.content_hash,
    score: c.score,
    title: c.title,
    snippet: c.snippet,
    retrieved_via: 'postgres_fts',
    indexKind: 'postgres_tsvector_english',
    retrieval_algorithm: 'postgres_fts_ts_rank_cd',
    identity_resolution_source: 'source_ref_content_hash_exact',
  }));
}

/** @deprecated use searchPostgresFts from postgres-fts.adapter.js */
export async function searchPostgresBM25(
  options: Postgres25TextSearchOptions
): Promise<BM25Candidate[]> {
  return toBm25Shape(await searchPostgresFts(options));
}

/** @deprecated use scorePostgresFtsFallback from postgres-fts.adapter.js */
export const scoreBM25 = scoreFallbackImpl;

/** @deprecated use filterBySourceScope from postgres-fts.adapter.js */
export function filterBySourceScope(
  candidates: BM25Candidate[],
  sourceScope?: string[]
): BM25Candidate[] {
  return toBm25Shape(filterFtsBySourceScopeImpl(toFtsShape(candidates), sourceScope));
}

/** @deprecated use validatePostgresFtsResults from postgres-fts.adapter.js */
export function validateBM25Results(
  candidates: BM25Candidate[],
  requireSourceRef: boolean = true
): { valid: boolean; errors: string[] } {
  return validateFtsResultsImpl(toFtsShape(candidates), requireSourceRef);
}
