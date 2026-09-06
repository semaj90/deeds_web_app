## Memory/agent ownership update — 2026-09-05

This updates the existing retrieval-fusion-reachability owner; no new OpenSpec change or control plane.
The accompanying design addendum and spec scenarios govern the new tasks; historical
findings below remain dated evidence, not a competing current execution queue.

SearchRuntime retains normalization and fusion ownership. A logical dense lane
can have multiple executors; executor identity is provenance, not voting identity.
The current combineViaRRF same-name map cannot enforce this until callers normalize
executor results under the chosen owner boundary. Decide delegation before changing
weights or arithmetic. Preserve distinct canonical chunks, reject unqualified identity,
and retain best-rank/executor evidence without another vote.

The evaluation route and conditional Go multi-vector path are separate consumers.
Do not infer an edge from a comment pointing at a recommended production facade.
Tests must distinguish same-name duplicates from alternative-executor duplicates.
No runtime migration is included in this planning pass.

Impact: planning/spec/task reconciliation only. Runtime implementation and datastore
mutation are not performed by this update. See tasks.md for pending proof gates.

## Why

A candidate fix landed in `rrf-integration.ts` (`normalizeCanonicalIdentity`/`resolveCanonicalCandidateId`,
symbol_version_id -> packet_key -> source_ref -> lane-id-fallback precedence) to close a real bug:
`combineViaRRF`'s `deduplicateBy: 'id'` was dedup-keying on Qdrant point IDs / TurboVec candidate
IDs / stable keys instead of canonical symbol identity, letting one symbol with multiple
projections cast more than one independent RRF vote. The fix is correct, tested (10/10 unit
tests including a negative assertion that `qdrant_point_id` never survives as the canonical
candidate id), and does not fabricate identity — it only reads existing metadata fields.

Before treating that fix as "Lane D done," a reachability audit was required to answer: does
this fix actually run on a real production search request? The audit (three sequential
read-only fork passes, no files modified) found the answer is **no**, and surfaced a much
larger structural problem than one wrapper needing a rename.

## What the audit found

**Finding 1 — the canonical production endpoint doesn't use any of the RRF modules.**
`/api/retrieval/search-unified` (the confirmed canonical endpoint per this project's own docs)
resolves: `runSemanticSearchWorkflow` -> `createAtlasSearchAdapter` -> `SearchRuntime.search` ->
`retrieveCandidates` -> `retrieve-candidates.ts::retrieveAllCandidates` (6 lanes) ->
`SearchRuntime.fuseCandidates` — a **private, inline, self-contained fusion implementation**
that imports none of `rrf-combiner.ts`, `rrf-integration.ts`, `rrf-fusion.ts`, or any other
`rrf-*` module. `search-runtime.ts:952-958` (`getFusionIdentityKey`) already has its own,
independently-written identity precedence (`symbolVersionId -> packetKey -> id`) — structurally
the same shape as the fix above, built separately, with no shared code between them.

**Finding 2 — thirteen distinct fusion/scoring implementations exist, not two or three.**
Classification by architectural role (not just grep hits) across every discovered module:

| File | Symbol | Role | Reachability |
|---|---|---|---|
| `search-runtime.ts` | `SearchRuntime.fuseCandidates` (private) | FUSION_OWNER | **LIVE_DIRECT — canonical spine** |
| `rrf-combiner.ts` | `combineViaRRF` | FUSION_OWNER | LIVE_TRANSITIVE (via rrf-integration.ts) |
| `rrf-integration.ts` | `multiLaneRetrievalWithRRF` | wraps combineViaRRF | LIVE_DIRECT, `/api/search/rrf` |
| `rrf-fusion.ts` | `fuseRetrievalLanes` | FUSION_OWNER | LIVE_DIRECT, `/api/retrieval/rrf` |
| `rrf-fuse.ts` | `reciprocalRankFusion` | FUSION_OWNER | LIVE_DIRECT, `/api/rag/search-fused` + 5 more callers incl. `unified-orchestrator.ts`, an MCP tool, admin routes — most broadly-called fusion owner found |
| `rrf-combiner-utils.ts` | `combineRRFLanes` | FUSION_OWNER | LIVE_TRANSITIVE, via `unified-orchestrator.ts` (`/api/admin/retrieval/stream`, transitively `/api/retrieval/go`, `/api/retrieval/multi-vector`) |
| `service.ts` | `rrfFusion` (inline) | FUSION_OWNER | LIVE_DIRECT, `/api/atlas/studio/search`, `/api/atlas/search` |
| `compute-rrf-score.ts` | `computeRRFScore` | RRF_SCORE_PRIMITIVE (correctly scoped, not a fusion owner despite production use) | LIVE_TRANSITIVE, via `hyperrag-fusion-service.ts` |
| `feature-envelope.ts` | `computeRRFScore(envelope)` | FEATURE_COMPUTATION (correctly excluded from identity problem) | reachable, ablation tooling |
| `gpu-reranker.ts` | private `computeRRFScore` | RERANK_FEATURE (correctly excluded — never touches raw lane lists) | reachable |
| `fuse-candidates.ts` | `fuseCandidates` | FUSION_OWNER (unreached) | **DEAD_ORPHAN** — zero functional callers; one type-only import (`hydrate-candidates.ts`). Best-designed identity precedence found outside the `rrf-integration.ts` fix (`symbolVersionId \|\| packetKey`, groups-then-ranks); imports `Candidate` from `search-runtime.ts` directly — likely an abandoned earlier attempt at this exact consolidation |
| `multi-signal-retriever.ts` | `MultiSignalRetriever` | FUSION_OWNER (unreached) | **DEAD_ORPHAN** — zero references anywhere; raw `packet_key`-only identity, stubbed placeholder methods, reads as an abandoned "Phase 2F.1" prototype |
| `retrieval-fusion-rrf.ts` | `rrfMergeMultipleLanes` | FUSION_OWNER (unreached) | **DEAD_ORPHAN** — zero references anywhere; raw `packetKey`-only identity; owns an 8th independent weight table that doesn't even sum to 1.0 (1.35 total) |

**RTO1 result: inventory complete, no new live pipeline family found.** All 3 previously-unknown
modules are dead code. `FULL_FUSION_OWNER_COUNT` for *live* fusion owners stays at 6
(`SearchRuntime.fuseCandidates`, `combineViaRRF`, `fuseRetrievalLanes`, `reciprocalRankFusion`,
`combineRRFLanes`, `service.ts::rrfFusion`) — the 3 newly-classified modules add to the dead-code
count, not the live-owner count. This closes the inventory gap that was blocking `D3_CAN_PROCEED`
and clears the way to begin shared-identity-resolver extraction (RF4) without risk of a 6th live
pipeline surfacing mid-extraction.

`k=60` is consistent everywhere it appears. RRF weight tables are not — at least 7 independently
diverged weight sources found (`rrf-fusion.ts::FUSION_WEIGHTS`, `compute-rrf-score.ts::RRF_LANE_WEIGHTS`,
`gpu-reranker.ts` inline weights, `types.ts::RRF_WEIGHTS_BY_LANE_KIND`, `rrf-contract.ts::RRF_DEFAULT_WEIGHTS`,
plus whatever the 3 unclassified files define), no two sharing values or even lane-name vocabulary.

**Finding 3 — the real identity leak is earlier than fusion, at candidate creation.**
`retrieve-candidates.ts::retrieveQdrant()` (~lines 328-329) already collapses `packetKey`,
`symbolVersionId`, and `id` to the same raw Qdrant point ID whenever the Qdrant payload lacks
`packet_key`/`symbol_version_id` — before any fusion step runs. `SearchRuntime.fuseCandidates`
then has no way to tell a real canonical match from a degraded fallback, because nothing upstream
recorded the distinction. This is the live-path equivalent of the bug the `rrf-integration.ts`
fix addressed, but it lives at candidate-boundary time, not fusion time, and on the canonical
spine specifically. `unified-orchestrator.ts::buildRrfLaneMap` (line 494) has the identical
pattern (`id: hit.id`, raw Qdrant id passed straight through with no resolution).

**Finding 4 — no shared candidate-construction boundary exists across the live pipelines.**
Five independently-live pipelines were found (`SearchRuntime`/canonical spine, `rrf-integration.ts`,
`rrf-fusion.ts`, `service.ts`, `unified-orchestrator.ts`), and they diverge **before** candidates
even exist — `service.ts` builds candidates via `SearchLaneRegistry` lane implementations
(`search-lanes.ts`), `unified-orchestrator.ts` via its own inline `qdrantSearch`/`turbovecSearch`/
rg-pool calls, `retrieve-candidates.ts` via its own 6 lanes. A fix applied to any single
candidate-construction point cannot propagate to the others because no shared function exists
for it to live in. `go-retrieval-facade.ts` is confirmed a pure adapter (delegates entirely to
`unified-orchestrator.ts`), not a 6th fusion owner — one real, existing precedent for "adapt at
the edge, canonical shape internally" (it already converts `SearchMetadataFilter` ->
`SearchFilter` at its own boundary).

**Finding 5 — `SearchFilter` (types.ts) and `SearchMetadataFilterSchema` (search-contract.ts)
are both genuinely live, not one canonical + one dead.** `SearchMetadataFilterSchema` is live on
the canonical spine (`semantic-search-workflow.ts` -> `search-runtime-adapter.ts` -> `search-runtime.ts`'s
`SearchQuerySchema`). `SearchFilter` is live on the `service.ts`/`unified-orchestrator.ts`
pipeline family. Per the audit's own instruction, this is correctly **not** counted as a
production duplicate to merge — they serve two really-separate live pipelines.

## What this proposal does NOT do

Per the audit's explicit stop conditions, honored in this proposal: no RRF implementation was
deleted, merged, or rewritten; no pipeline was unified; no GPU/CAGRA/ColBERT/semantic-glyph/LOD
work was started; `graphify:daily` was not run. The `rrf-integration.ts` fix from earlier in this
session was **not reverted** — it remains correct and stays as the reference implementation for
the identity-precedence shape (`symbol_version_id -> packet_key -> source_ref -> lane_id_fallback`,
with an `identity_resolution_source` observability tag) that the canonical spine should eventually
adopt, once it's extended into the shared candidate type rather than invented separately.

## Ordered next steps

See `tasks.md`. Summary: finish the inventory (3 unread files + `search-lanes.ts` lane
implementations' identity origin), then fix identity degradation at the canonical spine's actual
candidate-construction boundary (`retrieve-candidates.ts`, extending its existing `Candidate`
type rather than inventing a new one) before touching any RRF fusion logic again, then decide
per-pipeline whether each of the other 4 live fusion owners gets fixed in place or is marked
explicitly legacy. Long-term convergence onto one shared fusion module is named as a target but
explicitly deferred — the audit found no honest way to get there in one step from today's state.
