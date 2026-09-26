/**
 * Compatibility shim (DIR-INDEX-10D, parent-atlas-canonical-directory-ingestion-fabric).
 *
 * The one canonical fusion implementation is `fuseSearchRuntimeCandidates` in `search-runtime.ts`
 * (what `SearchRuntime.fuseCandidates` delegates to): logical-lane buckets, lane-local dedupe with
 * best-rank-wins, and one vote per logical lane no matter how many physical executors answered.
 *
 * This file used to hold a SECOND implementation that counted one RRF vote per physical
 * `scoreSource` (so `qdrant` + `qdrant_768` double-counted) and let a lower-ranked duplicate overwrite
 * the best rank. It was not on the live path. Its previous body is preserved in git history
 * (commit before this change); `explainFusionScore` was removed because nothing referenced it.
 *
 * Kept only so existing imports (`FusedCandidate` type in hydrate-candidates, the phase-109 smoke
 * script's `fuseCandidates`) keep working and now exercise the canonical function.
 */
import { fuseSearchRuntimeCandidates } from './search-runtime.js';
import type { Candidate, FusedCandidate as RuntimeFusedCandidate } from './search-runtime.js';

/** Runtime fused candidate; `sourceCount` is a legacy field that only old fixtures still set. */
export interface FusedCandidate extends RuntimeFusedCandidate {
  sourceCount?: number;
}

export function fuseCandidates(candidates: Candidate[]): FusedCandidate[] {
  return fuseSearchRuntimeCandidates(candidates);
}
