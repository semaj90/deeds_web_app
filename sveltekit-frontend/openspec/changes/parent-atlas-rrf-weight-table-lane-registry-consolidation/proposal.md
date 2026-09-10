## Why

RF1-RF6 (`parent-atlas-retrieval-fusion-reachability`) converged the two highest-breadth
non-canonical RRF fusion owners (`rrf-fuse.ts`, `unified-orchestrator.ts`'s `combineRRFLanes`)
onto a shared arithmetic core, `FusionCoreV1::fuseContributionsV1()`. That audit explicitly
deferred two follow-on questions rather than deciding them speculatively: where per-lane RRF
weights should live once multiple owners share the same summation core, and whether the three
independent lane-execution mechanisms in this codebase (`search-lanes.ts`'s `SearchLaneRegistry`,
`unified-orchestrator.ts`'s inline per-lane calls, `retrieve-candidates.ts`'s lane set) should
converge. Both are now unblocked by the arithmetic convergence but still require an explicit
design decision before any code changes — this proposal makes that decision, on paper, without
touching production behavior.

## What Changes

- Documents the real, current shape of every distinct RRF-lane weight table found in
  `src/lib/server/retrieval/` (5 tables, each with different lane vocabularies and values — not
  the "7+" figure from the earlier audit, which counted at least one rerank-feature-blend table
  and rrf-fuse.ts's pass-through model that are not actually static RRF-lane tables).
- Proposes a single shared config module (`rrf-weight-config-v1.ts`) that each of the 5 tables'
  routes would read from, with an explicit per-route migration plan that preserves every route's
  *current* effective weight values verbatim — this is a config-location consolidation, not a
  re-tuning.
- Proposes a verification approach (per-route before/after weight-value diffing, run as a script
  against each table's real exported values) that proves no runtime behavior changed before any
  route is migrated.
- Documents the real shape of the three lane-execution mechanisms (`SearchLaneRegistry`,
  `unified-orchestrator.ts`'s inline calls, `retrieve-candidates.ts`'s lane set) and produces an
  architectural recommendation on whether/how they should converge — **as analysis and a
  recommendation only**. No merge is implemented under this proposal.

**BREAKING**: none. This proposal's own scope is read-only analysis plus a design/plan; no
production code changes are authorized by this change alone. A follow-on change, scoped
separately per this proposal's own migration plan, would carry out the actual config migration
once a human has reviewed this document.

## Capabilities

### New Capabilities

- `rrf-weight-config-consolidation`: defines the shared RRF-lane weight config module contract
  (shape, migration plan, and verification method) that a future change would implement.

### Modified Capabilities

(none — no existing spec's requirements change under this proposal; it is a new capability
definition plus an architectural recommendation document, not a modification of already-specified
behavior)

## Impact

**Affected code (read-only analysis in this change; migration deferred to a follow-on change):**
- `src/lib/server/retrieval/compute-rrf-score.ts` (`RRF_LANE_WEIGHTS`, HyperRAG lane fusion)
- `src/lib/server/retrieval/retrieval-fusion-rrf.ts` (`RRF_LANE_WEIGHTS`, Qdrant 384/768 + BM25/BM42/Postgres/Neo4j/Redis fusion)
- `src/lib/server/retrieval/rrf-contract.ts` (`RRF_DEFAULT_WEIGHTS`, consumed by `rrf-integration.ts`)
- `src/lib/server/retrieval/unified-orchestrator.ts` (local `RRF_LANE_WEIGHTS` constant)
- `src/lib/server/retrieval/search-lanes.ts` (per-lane inline `weight` fields read by `service.ts::rrfFusion` via `getSearchLaneRegistry()`)
- `src/lib/server/retrieval/retrieve-candidates.ts` (the third lane-execution mechanism referenced in the SearchLaneRegistry re-evaluation)

**Explicitly out of scope for this change** (per the original RF7 flag and this audit's own
findings):
- `src/lib/server/retrieval/rerank-decision-tree.ts`'s `DEFAULT_WEIGHTS` — a rerank feature-blend
  weight table (gemma/crossEncoder/lang/wiki/activity/encoded/pagerank scores), not an RRF-lane
  fusion weight table. Different capability; not part of this consolidation.
- `rrf-fuse.ts` itself carries no static weight table of its own — every caller supplies weights
  explicitly (or accepts the uniform-1 default), so there is nothing to migrate for it under this
  proposal.
- Any actual code migration, config-file creation, or lane-mechanism merge. This change produces
  the design and plan only.
