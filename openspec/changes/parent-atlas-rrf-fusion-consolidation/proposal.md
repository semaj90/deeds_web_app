## Why

`docs/reports/rrf-caller-classification-v1.json` (2026-09-12) classified 93 RRF-shaped call sites
into `FEATURE_ONLY` (34), `LEGACY_COMPATIBILITY` (44), `TEST_ONLY` (13), and
`CANONICAL_SEARCHRUNTIME_CALLER` (2 — both inside `search-runtime.ts` itself). Investigating the
44 `LEGACY_COMPATIBILITY` callers to make a concrete recommendation (rather than leaving it an open
question) found the sprawl is worse than the caller count alone suggests, but with one encouraging
correction found the same day: **at least 4 independent RRF fusion families exist** (not 5 as first
counted — one pair already turned out to be a real, prior consolidation, not more sprawl):

1. `fuseSearchRuntimeCandidates` (`search-runtime.ts:1312`) — the declared canonical owner
2. `fuseContributionsV1` (`fusion-core-v1.ts`) — **already a documented, real consolidation**:
   its own docstring states it unifies the lane-collapsing invariant "both existing callers
   already independently enforce," and it is genuinely imported by both `rrf-combiner-utils.ts`
   and `rrf-fuse.ts`. Evidence this proposal's own playbook (extract shared core, migrate callers
   onto it) has already worked once in this codebase, at smaller scale.
3. `combineViaRRF` (`rrf-combiner.ts:100`)
4. `computeRrfComponent` / `rrfMergeMultipleLanes` / `rrfMergeDenseQdrant` (`retrieval-fusion-rrf.ts`)
5. `computeRRFScore` / `fuseRetrievalLanes` (`rrf-fusion.ts`) — genuinely richer than pure RRF
   (adds historical-decay and freshness-penalty weighting), likely warrants `BACKEND` rather than
   deprecation

All confirmed to use the same `k=60` RRF constant — the real differences are in lane-collapsing/
deduplication logic and extra weighting layers, not core-formula drift.

Highest-concentration caller files: `rrf-fusion.ts` (11 call sites), `rrf-lane-ranker.ts` (7),
`retrieval-fusion-rrf.ts` (6), `unified-orchestrator.ts` (6), `rrf-integration.ts` (5) — spread
across at least 12 distinct files. This is the same failure class root `CLAUDE.md`'s Duplication
Prevention section already documents for PageRank (5 implementations, 2 with zero callers) and
rerankers (14 files, 13 unclassified) — a new instance, not a new category. The classification
report itself is explicit that classifying is not the same as deciding: *"Classification does NOT
imply migration... LEGACY_COMPATIBILITY and FEATURE_ONLY callers are legitimate independent owners
unless a future change explicitly consolidates them."* This proposal is that future change's
scoping step — it does not consolidate anything itself.

## What Changes

- Classify each of the 5 primitives per the existing `CANONICAL_OWNER` / `BACKEND` / `ADAPTER` /
  `EXPERIMENT` / `COMPATIBILITY` / `FIXTURE_ONLY` / `DEAD` vocabulary (root `CLAUDE.md`'s "One
  Canonical Runtime Owner Per Capability" section) — not assumed here, this proposal only commits
  to doing the classification, not to a particular outcome.
- For each non-canonical primitive: real caller count (already known per-file from the 2026-09-12
  classification), whether it's reachable from live production traffic vs. test-only, and whether
  its actual RRF math (`k` constant, weighting, tie-breaking) is numerically equivalent to
  `fuseSearchRuntimeCandidates` or produces different rankings.
- Decide, per primitive: migrate callers to the canonical owner, formally designate as a
  `BACKEND`/`ADAPTER` beneath it, or retire (archive-not-delete per this repo's convention).
- Explicitly do **not** decide any of this inside the proposal itself — the tasks below are the
  audit; the decision is a human sign-off gate before any caller is touched.

## Capabilities

### New Capabilities
- (none — this proposal classifies existing runtime ownership, it does not add a capability)

### Modified Capabilities
- `atlas-rrf-fusion-ownership` (new spec capturing the intended end-state: one canonical RRF fusion
  owner, explicit backend/adapter relationships for the rest, zero uncoordinated peer owners)

## Impact

- **Code**: potentially touches up to 12 files with RRF call sites, but no file is edited by this
  proposal itself — only classified. Any migration is a separate, later, explicitly-approved change.
- **Docs**: `docs/architecture/runtime-ownership-registry.json` and
  `runtime-ownership-baseline.json` should gain entries for these 5 primitives once classified,
  mirroring how the PageRank and reranker findings are already recorded there.
- **Risk**: none from this proposal alone (classification is read-only). Risk is deferred to
  whichever follow-up change actually migrates/retires callers.
