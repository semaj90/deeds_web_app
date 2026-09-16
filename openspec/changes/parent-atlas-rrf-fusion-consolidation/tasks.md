## 1. Per-primitive classification (read-only investigation)

- [x] 1.1 Confirm all primitives are genuinely distinct exports, not re-exports of one shared
      implementation — **done 2026-09-12**. **Corrected from the original 5-primitive count**: a
      6th module was found during this check, and it changes the picture materially —
      `fusion-core-v1.ts`'s `fuseContributionsV1` is **already a documented, real consolidation**,
      not more sprawl. Its docstring explicitly states it unifies "the one-vote-per-lane invariant
      both existing callers already independently enforce" and references an `RF7` invariant
      pinning `k=60` as load-bearing across any future migration. Confirmed via import search: it
      is genuinely imported by both `rrf-combiner-utils.ts` (via `combineRRFLanes`) and
      `rrf-fuse.ts` — a real, prior 2-caller unification already executed in this codebase. This is
      encouraging evidence, not just a caveat: the "extract a shared core, migrate callers onto it"
      playbook this proposal would use is already proven low-risk here, once.
  - Full current primitive inventory: `fuseSearchRuntimeCandidates` (search-runtime.ts:1312,
    canonical) · `fuseContributionsV1` (fusion-core-v1.ts, already shared by 2 real callers) ·
    `combineViaRRF` (rrf-combiner.ts:100) · `computeRrfComponent`/`rrfMergeMultipleLanes`/
    `rrfMergeDenseQdrant` (retrieval-fusion-rrf.ts) · `computeRRFScore`/`fuseRetrievalLanes`
    (rrf-fusion.ts). Net: **4 independent families**, not 5 — `combineRRFLanes` and `rrf-fuse.ts`
    collapse into one (`fusion-core-v1.ts`).
- [~] 1.2/1.3 (partially advanced 2026-09-12, structural comparison done, empirical fixture-diff
      NOT done) — extracted every primitive's `k` constant and top-level formula shape via direct
      code reading (not yet a runtime side-by-side test):

      | Primitive | `k` | Formula | Structural note |
      |---|---|---|---|
      | `fuseSearchRuntimeCandidates` (canonical) | 60 | `1/(60+bestRank)` per lane-identity group | own lane/identity collapsing logic (`LaneGroup`, `identityStatus`) |
      | `fuseContributionsV1` (fusion-core-v1.ts) | 60 (`FUSION_CORE_RRF_K`, pinned via RF7) | `weight/(k+rank)`, one vote per (canonicalId, logicalLane) | independently documents the same collapsing invariant as the canonical |
      | `combineViaRRF` (rrf-combiner.ts) | 60 (default, overridable via `options.k`) | `laneWeight/(k+(rank+1))` | has its OWN logical-lane collapsing (Qdrant/TurboVec as one vote) — structurally similar intent to the canonical, but a separate implementation, and `k` is NOT pinned (overridable) unlike `fusion-core-v1.ts`'s `RF7`-invariant `k` |
      | `computeRrfComponent` (retrieval-fusion-rrf.ts) | 60 (`RRF_DENOMINATOR_CONSTANT`) | `1/(60+rank)`, no lane-collapsing seen in this function alone (collapsing may happen in its callers `rrfMergeMultipleLanes`/`rrfMergeDenseQdrant`, not checked yet) | plainest/most literal RRF formula of the set |
      | `computeRRFScore`/`fuseRetrievalLanes` (rrf-fusion.ts) | 60 (`RRF_CONSTANTS.K`) | RRF plus additional `FUSION_WEIGHTS`, `HISTORICAL_DECAY_DAYS`, `FRESHNESS_PENALTY_PER_DAY` | genuinely richer than pure RRF — likely an intentional feature-blend extension, not a pure RRF duplicate; may warrant `BACKEND` classification rather than deprecation |

      **Every primitive uses `k=60`** — no wildly divergent tuning found. The real differences are
      in lane-collapsing/dedup logic and extra weighting, not the core RRF constant. This means
      `NUMERICALLY_EQUIVALENT` is plausible for some pairs but not provable without an actual
      fixture-based side-by-side run (same candidate set through each function, diff the output
      ranking) — **not done yet**, and is the concrete next step before 1.4's classification can be
      finalized with confidence rather than structural guesswork.
- [x] 1.3b **Done 2026-09-12** for the 2 confirmed-live primitives (`combineViaRRF`,
      `fuseSearchRuntimeCandidates`) — deferred for `rrf-fusion.ts` (richer weighting, needs its own
      fixture design) and skipped for `retrieval-fusion-rrf.ts` (dead per 1.2b). Built
      `sveltekit-frontend/src/lib/server/retrieval/__tests__/rrf-cross-primitive-parity.test.ts`,
      3/3 pass:
      1. **Confirmed a real behavioral difference, not just a structural guess**: `combineViaRRF`
         does NOT collapse hits across lanes by shared `packet_key` unless the caller
         pre-normalizes identity first (via `normalizeCanonicalIdentity`, the same pattern
         `rrf-integration.ts` already uses in production) — `fuseSearchRuntimeCandidates` does this
         collapsing unconditionally, internally. Same raw inputs, different `id` values per lane →
         `combineViaRRF` produces 2 separate candidates where the canonical produces 1, until the
         caller normalizes.
      2. **Confirmed `NUMERICALLY_EQUIVALENT` once identity is pre-normalized**: with matching
         `packet_key`-based ids across lanes (the real-world condition `rrf-integration.ts` already
         satisfies), both primitives produce the identical combined score (`2 * 1/(60+1)`) for a
         2-lane, rank-1-each, no-weighting scenario.
      3. **Confirmed a genuine, structural (not fixable-by-normalization) divergence**:
         `combineViaRRF` supports a per-lane `weights` option the canonical has no equivalent for
         at all — supplying non-default weights produces a provably different score
         (`2.0/61 + 1.0/61` vs. the canonical's unweighted `2/61`). This is real added capability,
         not a bug — any consolidation plan must decide whether `search-runtime.ts` needs a
         lane-weight extension or whether `combineViaRRF`'s weighting is itself the thing to
         retire.
      Verdict for these two: `RETRIEVAL_COMPATIBLE` (equivalent under matching conditions, with a
      real, documented divergence in lane-weighting capability) — not blind `NUMERICALLY_EQUIVALENT`,
      and not a false "they're just duplicates, delete one" either.
- [x] 1.2b **Done 2026-09-12.** Traced real importers of each remaining primitive (excluding the
      already-merged `fusion-core-v1.ts` pair), then one more hop to confirm route reachability
      where the direct caller wasn't itself a route:

      | Primitive | Live? | Evidence |
      |---|---|---|
      | `combineViaRRF` (rrf-combiner.ts) | **CONFIRMED LIVE** | `rrf-integration.ts` → `dispatcher-topology-service.ts` → `dispatcher/index.ts`, and `rrf-integration.ts` is itself reachable from `routes/api/search/rrf/+server.ts` |
      | `computeRRFScore`/`fuseRetrievalLanes` (rrf-fusion.ts) | **CONFIRMED LIVE** | directly imported by `routes/api/retrieval/rrf/+server.ts`, plus `gpu-reranker.ts`, `compute-rrf-score.ts`, `feature-envelope.ts`, `hyperrag-fusion-service.ts` |
      | `computeRrfComponent`/`rrfMergeMultipleLanes`/`rrfMergeDenseQdrant` (`retrieval-fusion-rrf.ts`) | **STRONG DEAD CANDIDATE** | zero external importers found anywhere in `src/` — the entire file (not just these 3 functions) appears to have no callers outside itself. Not yet formally verified against `git log`/blame per the "file existing is not evidence it's live" rule, but no static reference exists to chase. |

      **This is a real, actionable finding**: of the 4 independent (non-`fusion-core-v1.ts`)
      primitives, one (`retrieval-fusion-rrf.ts`) looks like dead code that can likely be archived
      outright rather than migrated or reconciled — a much cheaper resolution than a caller
      migration. The other two (`combineViaRRF`, `rrf-fusion.ts`) are both genuinely live in
      production via real API routes, confirming they need the full classification treatment
      (migrate vs. formally designate as `BACKEND`), not a quick archive.
- [ ] 1.4 Classify each primitive: `CANONICAL_OWNER` (only `fuseSearchRuntimeCandidates` by
      default), `BACKEND`, `ADAPTER`, `EXPERIMENT`, `COMPATIBILITY`, `FIXTURE_ONLY`, or `DEAD`. Can
      be provisionally informed by the structural table above but should wait for 1.2b/1.3b before
      being treated as final.

## 2. Registry update

- [ ] 2.1 Add entries to `docs/architecture/runtime-ownership-registry.json` /
      `runtime-ownership-baseline.json` for all 5 primitives, mirroring the existing PageRank and
      reranker entries.

## 3. Decision (human sign-off, not made by this change)

- [ ] 3.1 For each non-`CANONICAL_OWNER` primitive: migrate its callers, formally designate it a
      `BACKEND`/`ADAPTER`, or retire it (archive-not-delete). This is the actual consolidation —
      out of scope for this proposal, tracked here only so it isn't lost.
