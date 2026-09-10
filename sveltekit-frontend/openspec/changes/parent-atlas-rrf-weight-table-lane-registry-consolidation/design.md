## Context

Five distinct, independently-maintained RRF-lane weight tables exist today, each with different
lane vocabularies and different numeric values (confirmed live by reading each file, not assumed
from names):

| # | File | Table name | Lane values (as of 2026-09-09) | Consumed by |
|---|---|---|---|---|
| 1 | `compute-rrf-score.ts` | `RRF_LANE_WEIGHTS` | `dense_vector:1.0, graph_authority:0.8, lexical:0.6, cache:0.5, temporal:0.3` | `combineRRFLanes()` via `rankHitsInLane`/`partitionHitsByLane` (HyperRAG fusion path) |
| 2 | `retrieval-fusion-rrf.ts` | `RRF_LANE_WEIGHTS` | `QDRANT_384:0.35, QDRANT_768:0.40, BM25:0.15, BM42:0.05, POSTGRES_LEXICAL:0.05, NEO4J_GRAPH:0.10, REDIS_CENTROID:0.05, LATE_INTERACTION_RERANKER:0.20` | `rrfMergeMultipleLanes`/`rrfMergeDenseQdrant` (classified `DEAD_ORPHAN`/unreachable per RF3 — no live production callers found in the RF1-RF6 audit) |
| 3 | `rrf-contract.ts` | `RRF_DEFAULT_WEIGHTS` | `bm42:1.0, rg:1.0, dense_384:1.0, dense_768:1.0, turbovec:0.9, topology:0.8, authority:0.6, dispatcher:0.6` | `rrf-integration.ts::multiLaneRetrievalWithRRF` (`/api/search/rrf`) |
| 4 | `unified-orchestrator.ts` | local `RRF_LANE_WEIGHTS` const | `dense_vector:1.0, turbovec:0.8, lexical:0.6` | `unified-orchestrator.ts`'s own `laneContribution()` helper, feeding `combineRRFLanes` |
| 5 | `search-lanes.ts` | inline per-lane `weight` field in each `SearchLaneConfig` | `0.4` (Qdrant dense), `0.35` (BM25/lexical), `0.38` (disabled 384-dim lane — deliberately unused), `0.20`, `0.15` | `service.ts::rrfFusion` via `getSearchLaneRegistry()` |

Table 2 is already RF3-classified `DEAD_ORPHAN` (zero live callers) — it is documented here for
completeness but is not a real production-consolidation target; migrating it would only update
dead code.

Two of the five owners (`rrf-fuse.ts`, `combineRRFLanes`) now delegate their cross-lane RRF
*summation* to `FusionCoreV1::fuseContributionsV1()` (RF6/RF7-06, commits `d1a0b5e7c4`,
`2474ce5678`). `fuseContributionsV1()` takes a `weight` field directly on each
`FusionContributionV1` — it has no opinion on where that weight number is defined or how it's
looked up, so consolidating *where the weight tables live* is now orthogonal to, and does not
require, any further change to the fusion arithmetic itself.

Separately, three lane-execution mechanisms coexist:
- `search-lanes.ts`'s `SearchLaneRegistry` (`getSearchLaneRegistry()`) — used by `service.ts`
- `unified-orchestrator.ts`'s inline per-lane fetch calls (Qdrant/TurboVec/lexical, each with its
  own weight constant and its own request-shaping code)
- `retrieve-candidates.ts::retrieveAllCandidates` — the canonical production spine's own lane
  executor, confirmed by RF1 as the live path behind `/api/retrieval/search-unified`

## Goals / Non-Goals

**Goals:**
- Record the real, current weight values for every live RRF-lane table so a future migration has
  a verifiable baseline to preserve.
- Define a shared config module shape (`rrf-weight-config-v1.ts`) that each live owner *could*
  migrate to, without deciding the migration is safe to execute yet.
- Produce an explicit, reviewable migration plan and verification method (per-route weight-value
  diffing) for a follow-on change to execute.
- Produce the architectural analysis RF7 flagged for the 3-lane-mechanism question, with a
  recommendation, without implementing a merge.

**Non-Goals:**
- Migrating any route's actual weight lookup in this change. This proposal is planning-only; a
  separate `openspec-apply-change` pass on a follow-on change would carry out the migration this
  design plans for.
- Re-tuning any lane's weight value. Every value in the table above is preserved verbatim in the
  proposed shared config.
- Merging `SearchLaneRegistry`, `unified-orchestrator.ts`'s inline calls, and
  `retrieve-candidates.ts` into one mechanism. That merge, if recommended, is its own future
  change requiring explicit human sign-off given `unified-orchestrator.ts`'s production breadth
  (`go-retrieval-facade.ts`, `cross-ranker.ts`, `/api/admin/retrieval/stream`, `/api/retrieval/go`).
- Touching `rrf-fuse.ts` (no static table — every caller supplies weights explicitly) or
  `rerank-decision-tree.ts` (a rerank feature-blend table, not an RRF-lane fusion table — a
  different capability entirely).

## Decisions

### D1: Shared config shape is a lookup-by-owner map, not one flat lane-name table

Because the 5 tables use genuinely different, non-overlapping lane vocabularies (`dense_vector`
vs `QDRANT_768` vs `dense_768` vs `bm42` for what are sometimes the same underlying signal), a
single flat `{ [laneName]: number }` table would require picking one canonical lane-naming scheme
and translating every owner's lookups through it — a much larger, riskier change than "move the
numbers to one file." Instead, the shared module exports one named constant per owner, keyed by
the *file* it replaces, each preserving that owner's own existing lane-name keys and values
verbatim:

```typescript
// rrf-weight-config-v1.ts (proposed shape, not yet created)
export const HYPERRAG_LANE_WEIGHTS = { dense_vector: 1.0, graph_authority: 0.8, lexical: 0.6, cache: 0.5, temporal: 0.3 } as const;
export const LEGACY_MULTI_LANE_WEIGHTS = { QDRANT_384: 0.35, QDRANT_768: 0.40, BM25: 0.15, BM42: 0.05, POSTGRES_LEXICAL: 0.05, NEO4J_GRAPH: 0.10, REDIS_CENTROID: 0.05, LATE_INTERACTION_RERANKER: 0.20 } as const; // DEAD_ORPHAN per RF3 -- migrated for completeness only, not because it's live
export const RRF_INTEGRATION_DEFAULT_WEIGHTS = { bm42: 1.0, rg: 1.0, dense_384: 1.0, dense_768: 1.0, turbovec: 0.9, topology: 0.8, authority: 0.6, dispatcher: 0.6 } as const;
export const UNIFIED_ORCHESTRATOR_LANE_WEIGHTS = { dense_vector: 1.0, turbovec: 0.8, lexical: 0.6 } as const;
export const SEARCH_LANE_REGISTRY_WEIGHTS = { qdrant_dense: 0.4, bm25_lexical: 0.35, qdrant_384_legacy: 0.38, /* two more, named to match search-lanes.ts's own lane identifiers once inventoried in tasks.md */ } as const;
```

This is "one file, five exports" rather than "one table, one shape" — deliberately, since forcing
a shared shape across genuinely different lane vocabularies is exactly the kind of silent
behavior risk the proposal's own "must not change effective weights" constraint rules out.
**Alternative considered**: a single `Record<string, Record<string, number>>` keyed by owner id.
Rejected — it adds an indirection layer with no behavior benefit over five flat named exports, and
makes accidental cross-owner lane-name collisions (e.g. `dense_768` meaning different things in
table 3 vs elsewhere) easier to introduce by mistake.

### D2: Migration per route is additive-then-switch, never delete-then-recreate

Each route/file listed in the table above gets migrated independently, in its own follow-on task,
via: (1) add the import from `rrf-weight-config-v1.ts`, (2) replace the local constant's
*definition* with a re-export or direct use of the shared constant (byte-identical values), (3)
run the route's own existing test suite plus a new value-diff script comparing the old inline
constant's serialized value against the new shared constant's value, (4) only then delete the old
local constant definition. No route is migrated by directly deleting its local table first.

### D3: Lane-registry consolidation gets an architecture memo, not a merge

`SearchLaneRegistry` (`search-lanes.ts`), `unified-orchestrator.ts`'s inline lane calls, and
`retrieve-candidates.ts::retrieveAllCandidates` each execute lanes differently:
- `SearchLaneRegistry` provides a `SearchLaneConfig` per lane (enabled/priority/weight/fallback)
  and a `.config()`/execution method per lane object — a registry pattern, one object per lane.
- `unified-orchestrator.ts` calls each backend (Qdrant, TurboVec, lexical) inline in its own
  function body, with its own request-shaping and its own `RRF_LANE_WEIGHTS` constant — no
  registry abstraction at all.
- `retrieve-candidates.ts::retrieveAllCandidates` is the canonical production spine's lane
  executor (confirmed live behind `/api/retrieval/search-unified` per RF1) — a different, third
  shape again.

**Recommendation (not a decision to execute — human sign-off required)**: unifying these three
is a large, cross-cutting change (touching `service.ts`, `unified-orchestrator.ts`, and every
downstream caller of each) whose benefit (one lane-execution mechanism instead of three) is real
but whose risk is concentrated in `unified-orchestrator.ts`'s production breadth — it is imported
by `go-retrieval-facade.ts` and `cross-ranker.ts`, and its own route
`/api/admin/retrieval/stream` plus `/api/retrieval/go`'s unauthenticated `GET` handler are both
real, non-debug-only consumers (per RF6's 2026-09-09 re-audit). Recommend: **do not merge now**.
Revisit only if a concrete new lane needs to be added to more than one of the three mechanisms
simultaneously — at that point the duplicated-effort cost becomes concrete rather than
speculative, and justifies the migration risk. Until then, each mechanism should stay independently
correct rather than be forced into a shared shape that doesn't yet have a forcing use case.

## Risks / Trade-offs

- **[Risk] A future migration accidentally re-derives a value instead of copying it verbatim**
  → Mitigation: D2's value-diff script compares the OLD constant's literal serialized value
  against the NEW constant's value before the old one is deleted — this is a mechanical check,
  not a manual review step, so it cannot be skipped by oversight.
- **[Risk] Table 2 (`retrieval-fusion-rrf.ts`) gets migrated as if it were live, wasting effort or
  implying it's production-relevant** → Mitigation: this design explicitly flags it
  `DEAD_ORPHAN` per RF3 and recommends migrating it last (or skipping it and archiving the file
  per this repo's archive-not-delete convention) rather than treating its migration as equally
  urgent to the four live owners.
- **[Trade-off] "One file, five exports" (D1) does not reduce the number of distinct lane
  vocabularies** — a caller reading `rrf-weight-config-v1.ts` still needs to know which named
  export belongs to which owner. This trade-off is deliberate: the proposal's own constraint
  (preserve current effective weights, don't re-derive a canonical lane taxonomy) rules out the
  larger, riskier alternative of unifying the vocabularies themselves.

## Migration Plan

This design's own migration plan is for a **follow-on change**, not this one:
1. Create `rrf-weight-config-v1.ts` with the 5 named exports in D1, values copied verbatim from
   the table in Context.
2. For each of the 4 live owners (skip or archive table 2, `DEAD_ORPHAN`), apply D2's
   additive-then-switch sequence independently, one PR/commit per owner.
3. Run each owner's existing test suite after its own migration step, plus the value-diff script,
   before proceeding to the next owner.
4. Once all 4 live owners are migrated, delete the now-unused local constant definitions.

**Rollback**: each owner's migration is a single, independent commit reverting cleanly (the local
constant definition is only deleted in the final step of that owner's own migration, so reverting
one commit restores that owner's local table without affecting the others already migrated).

## Open Questions

- Should table 2 (`retrieval-fusion-rrf.ts`, `DEAD_ORPHAN`) be migrated for completeness, or
  archived per this repo's archive-not-delete convention instead, since it has zero live callers?
  Deferred to whoever picks up the follow-on change — either is safe; migrating adds no risk,
  archiving removes dead-code noise.
- `search-lanes.ts`'s exact lane identifier names (row 5 in the Context table) were only
  partially inventoried here (2 of 5 named explicitly; the remaining 3 exist at
  `search-lanes.ts` lines ~736/808 and two more not read in this pass) — the follow-on change's
  first task should be a complete, verified inventory of all `SearchLaneConfig` weight values
  before writing the `SEARCH_LANE_REGISTRY_WEIGHTS` export, not an assumption from this design.
