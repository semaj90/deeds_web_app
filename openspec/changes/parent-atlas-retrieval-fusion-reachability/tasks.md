# OpenSpec: Parent Atlas Retrieval Fusion Reachability Tasks

## RF1 - Reachability trace (complete, 2026-08-08)

- [x] Trace `/api/retrieval/search-unified` end to end: `search-unified/+server.ts` ->
      `runSemanticSearchWorkflow` -> `createAtlasSearchAdapter` -> `SearchRuntime.search` ->
      `retrieveCandidates` -> `retrieve-candidates.ts::retrieveAllCandidates` (6 lanes) ->
      `SearchRuntime.fuseCandidates` (private, inline) -> score -> hydrate -> rerank -> post-process.
- [x] Confirm `search-runtime.ts` imports none of `rrf-combiner.ts`/`rrf-integration.ts`/
      `rrf-fusion.ts`/`search-lanes.ts` — the canonical spine has its own 8th independent fusion.
- [x] Confirm live lane executor: `retrieve-candidates.ts::retrieveAllCandidates`. exact/FTS/
      dense confirmed working; trigram lane is ILIKE-fallback-only (not `pg_trgm` similarity,
      mislabeled in its own comment); BM42 sparse lane wired but targets `codebase_chunks_384_hybrid`,
      confirmed 0 points live, so it runs and returns nothing; no distinct topology lane found.
- [x] Confirm `SearchLaneRegistry` (`search-lanes.ts`) is NOT authoritative on the canonical
      spine — live only via `service.ts` (2 routes).
- [x] Confirm live-but-non-canonical: `rrf-integration.ts::multiLaneRetrievalWithRRF` via
      `/api/search/rrf`; `rrf-fusion.ts::fuseRetrievalLanes` via `/api/retrieval/rrf`.
- [x] `CANONICAL_PRODUCTION_SPINE: SearchRuntime path` — established, re-confirmed twice across
      independent passes, do not re-litigate without new contradicting evidence.
- [x] `LIVE_SEARCH_FILTER: SearchMetadataFilterSchema` (search-contract.ts) on the canonical
      spine. `LIVE_LANE_SELECTOR: NONE` — all 6 `retrieveAllCandidates` lanes always run
      unconditionally, gated only by an `includeVectorLanes` boolean for 2 of them.
- [x] `rrf-integration.ts`'s `normalizeCanonicalIdentity` fix classified `NON_LIVE_FIX` relative
      to the canonical spine specifically — it is live, just on `/api/search/rrf`, not
      `/api/retrieval/search-unified`. Do not revert it; it is a proven reference implementation.
- [x] `CANONICAL_IDENTITY_ON_LIVE_PATH: DEGRADED` — quoted evidence: `retrieve-candidates.ts`
      already collapses `packetKey`/`symbolVersionId`/`id` to the raw Qdrant point ID when
      canonical payload fields are absent, with no field recording that this happened.
- [x] Validation commands (already run, evidence in `proposal.md`):
      `rg -n "multiLaneRetrievalWithRRF|SearchLaneRegistry|combineViaRRF" src/lib/server/retrieval/search-runtime.ts`
      (zero hits, confirmed)
      `curl -s http://127.0.0.1:6333/collections/codebase_chunks_384_hybrid` (0 points, confirmed)

## RF2 - RRF implementation classification (complete, 2026-08-08)

- [x] Classify `rrf-combiner.ts`, `rrf-fusion.ts`, `compute-rrf-score.ts`, `feature-envelope.ts`,
      `gpu-reranker.ts`, `rrf-combiner-utils.ts`, `rrf-fuse.ts` by role (FUSION_OWNER /
      RRF_SCORE_PRIMITIVE / FEATURE_COMPUTATION / RERANK_FEATURE) and reachability.
- [x] `FULL_FUSION_OWNER_COUNT: >= 6` confirmed (`SearchRuntime.fuseCandidates`, `combineViaRRF`,
      `fuseRetrievalLanes`, `reciprocalRankFusion`, `combineRRFLanes`, `service.ts::rrfFusion`) —
      count may rise once RF3's unread files are classified.
- [x] Confirm `feature-envelope.ts::computeRRFScore(envelope, config)` performs no cross-lane
      dedup — correctly excluded from the canonical identity normalization problem.
- [x] Confirm `gpu-reranker.ts`'s private `computeRRFScore` is RERANK_FEATURE, not a fusion
      owner — operates on an already-merged `RRFCandidate[]`, never touches raw lane lists.
- [x] Confirm `compute-rrf-score.ts::computeRRFScore` is RRF_SCORE_PRIMITIVE despite production
      use via `hyperrag-fusion-service.ts` — scores one hit against pre-partitioned lanes, never
      merges candidates. Note: it imports `combineRRFLanes` but never calls it (dead import,
      separate finding from `combineRRFLanes`'s own live status elsewhere).
- [x] Identity precedence audit, all live fusion owners:
  - `rrf-combiner.ts`/`rrf-integration.ts`: `symbol_version_id -> packet_key -> source_ref -> lane id` (fixed, tested)
  - `search-runtime.ts::getFusionIdentityKey`: `symbolVersionId -> packetKey -> id` (independent, unfixed observability gap)
  - `rrf-fuse.ts`: `packetKey ?? id` only — no symbol_version_id tier
  - `rrf-fusion.ts`, `rrf-combiner-utils.ts`: no resolution at all, trust caller-supplied id/candidate_id as-is
  - `service.ts::rrfFusion`: two-stage — RRF scoring is identity-blind (raw `result.id`), separate
    post-fusion truncation dedupes by `symbol_version_id ?? packet_key ?? id`, first-wins, discards
    losing duplicates' scores instead of merging them
- [x] Weight/k config audit: `k=60` consistent everywhere. Weight tables diverged across
      `rrf-fusion.ts::FUSION_WEIGHTS`, `compute-rrf-score.ts::RRF_LANE_WEIGHTS`, `gpu-reranker.ts`
      inline weights, `types.ts::RRF_WEIGHTS_BY_LANE_KIND`, `rrf-contract.ts::RRF_DEFAULT_WEIGHTS` —
      no two share values or lane-name vocabulary.
- [x] Validation commands rerun 2026-09-01:
  - `rg -n "computeRRFScore|rrfScore|reciprocalRank" sveltekit-frontend/src/lib/server/retrieval sveltekit-frontend/src/lib/server/gpu`
  - `rg -n "combineRRFLanes" sveltekit-frontend/src/lib/server/retrieval/compute-rrf-score.ts` (confirm still-dead import)
  - Focused identity/fusion regression: `search-runtime-fusion.test.ts`,
    `rrf-canonical-identity.test.ts`, and `identity-resolution.test.ts` → **30/30 pass**.

## RF3 - Complete the inventory (RTO1 sub-part complete, 2026-08-08; remaining items open)

- [x] Classify `fuse-candidates.ts::fuseCandidates` — **DEAD_ORPHAN**. Zero functional callers
      anywhere in `src/` (confirmed via import-statement grep, not just symbol grep). Exactly one
      external reference at all: `hydrate-candidates.ts:15` imports the `FusedCandidate` *type*
      only (`import type { FusedCandidate } from './fuse-candidates.js'`) — never calls the
      function. Notable despite being dead: its identity precedence
      (`candidate.symbolVersionId?.trim() || candidate.packetKey`) groups candidates by canonical
      identity **before** ranking — i.e. it already does real within-lane + cross-lane
      identity-based grouping, architecturally closer to RF4/RF5's target than any of the 6 live
      fusion owners except the `rrf-integration.ts` fix. It also imports `Candidate` directly from
      `search-runtime.ts` — same shared type the canonical spine uses. Its own header comment
      ("Only one fusion implementation. All candidate merging happens here. No other score
      combiners exist in the codebase.") is demonstrably false (13+ implementations exist) —
      likely an earlier, abandoned attempt at exactly the consolidation RF4 now needs to do.
      **Do not silently revive this file** — understand why it was abandoned/never wired before
      treating it as more than a design reference; RF4 should read it for precedent, not import it.
- [x] Classify `multi-signal-retriever.ts::MultiSignalRetriever`/`multiSignalRetriever` —
      **DEAD_ORPHAN**. Zero references anywhere outside its own file. Identity key is raw
      `packet_key` string only, no `symbol_version_id` awareness. Labeled "Phase 2F.1" with
      stubbed `getSemanticLatency`/`getLexicalLatency` placeholder methods — reads as an
      abandoned prototype, not a partially-wired feature.
- [x] Classify `retrieval-fusion-rrf.ts::rrfMergeMultipleLanes`/`rrfMergeDenseQdrant` —
      **DEAD_ORPHAN**. Zero references anywhere outside its own file. Identity key is raw
      `packetKey` only, no `symbol_version_id` tier. Owns yet another independent weight table
      (`RRF_LANE_WEIGHTS`: qdrant_384 0.35 / qdrant_768 0.40 / bm25 0.15 / bm42 0.05 /
      postgres_lexical 0.05 / neo4j_graph 0.10 / redis_centroid 0.05 /
      late_interaction_reranker 0.20) — noted for completeness even though dead: **this table
      does not sum to 1.0** (sums to 1.35), a second, independent defect on top of being unreached.
- [x] **RTO1 result: no new live pipeline family appears.** All 3 previously-unknown files are
      confirmed dead. `FULL_FUSION_OWNER_COUNT` stays at the RF2 figure — no live fusion owner
      was added by completing this inventory. Per the agreed sequencing, this clears the way to
      begin RF4 (shared identity resolver extraction) without risk of a 6th live pipeline
      surfacing mid-extraction.
- [ ] Trace `search-lanes.ts` lane implementations' own identity-assignment code — where
      `service.ts`'s candidates get `symbol_version_id`/`packet_key`/`id` set, before they reach
      `service.ts::rrfFusion`. (Still open — separate from RTO1, tracks the `service.ts` pipeline
      specifically, not blocking RF4 since RF4 targets the canonical spine first.)
- [ ] Read `unified-orchestrator.ts::qdrantSearch()`/`turbovecSearch()` internals (lines
      ~653-670+, not read in the route census pass) — confirm identity origin before
      `buildRrfLaneMap` receives hits.
- [ ] Read `multi-vector-orchestrator.ts` and `cache-layers-orchestrator.ts` — referenced by type
      import in `go-retrieval-facade.ts`, never opened.
- [ ] Read the exact `SearchMetadataFilter -> SearchFilter` conversion code inside
      `go-retrieval-facade.ts::executeGoRetrievalSearch` (lines 446-572) line-by-line.
- [x] Validation commands run:
  - `rg -n "from '\.\./retrieval/fuse-candidates|from '\./fuse-candidates|from.*multi-signal-retriever|multiSignalRetriever|MultiSignalRetriever|from.*retrieval-fusion-rrf|rrfMergeMultipleLanes|rrfMergeDenseQdrant" sveltekit-frontend/src`
    → confirmed only `hydrate-candidates.ts`'s type-only import; no functional callers for any of the 3 files.`

## RF4 - Fix identity degradation at the canonical spine (complete, 2026-08-08)

This is the highest-value fix: it protects real production traffic through
`/api/retrieval/search-unified`, unlike the `rrf-integration.ts` fix which protects `/api/search/rrf`.

- [x] Extracted the shared precedence primitive out of `rrf-integration.ts` into a new,
      dependency-free module `identity-resolution.ts::resolveCanonicalIdentity()` — takes
      `{ symbolVersionId, packetKey, sourceRef, fallbackId }`, returns
      `{ canonicalId, source, status: 'canonical' | 'degraded' }`. `rrf-integration.ts`'s
      `resolveCanonicalCandidateId` now delegates to it (thin adapter, unchanged external
      `{id, source}` shape, all 10 pre-existing tests still pass unmodified).
- [x] Extended `search-runtime.ts`'s `Candidate` interface with `identityStatus?: 'canonical' |
      'degraded'` and `identitySource?: IdentitySource` — additive only, does not change
      `packetKey`/`symbolVersionId`'s own existing fallback values, per the "extend the existing
      type, don't invent a new abstraction" guidance.
- [x] Applied `resolveCanonicalIdentity` (via a new local `deriveIdentity()` helper) at all 8
      candidate-construction sites in `retrieve-candidates.ts`: `retrieveBM42Sparse`, `retrieveBM25`,
      `retrieveBM25Trigram`, `retrieveQdrant` (both the primary and dense-only-fallback paths),
      `retrieveExactMatches`, `retrieveASTMatches`, `retrieveRipgrep`. Every raw backend result now
      gets `identityStatus`/`identitySource` tagged at creation, before fusion ever sees it.
- [x] Updated `search-runtime.ts::fuseCandidates` — extracted its logic into a standalone,
      unit-testable module function `fuseSearchRuntimeCandidates()` (the private method now just
      delegates to it). It now propagates `identityStatus`/`identitySource` onto the fused output:
      a fused candidate is `'canonical'` if ANY contributing lane resolved real identity for it,
      `'degraded'` only if every contributing occurrence was a fallback. Absent `identityStatus`
      (pre-existing candidates from before this field existed) is treated as `'canonical'` for
      backward compatibility, never silently as `'degraded'`.
- [x] Negative-assertion tests added (`search-runtime-fusion.test.ts`, `identity-resolution.test.ts`):
      a raw Qdrant/lane id never survives as the canonical id when a real identity field was
      available; blank-string fields are treated as absent, not present.
- [x] `unified-orchestrator.ts::buildRrfLaneMap`'s identical pattern was NOT touched in this task,
      as planned — tracked under RF6 since it's a different live pipeline with its own fusion owner.
- [x] Acceptance: `CANONICAL_IDENTITY_ON_LIVE_PATH` moves from `DEGRADED` to `PASS` for the
      canonical spine — degraded cases are now observable via `identityStatus`/`identitySource`
      instead of silently absent. (Full end-to-end live proof against real Postgres/Qdrant data is
      RF5's `ONE_ENTITY_ENRICHMENT_TRACE_PROVEN` step, not yet run — this closes the code-level gap.)
- [x] Validation commands run:
  - `npx vitest run src/lib/server/retrieval/__tests__/identity-resolution.test.ts src/lib/server/retrieval/__tests__/rrf-canonical-identity.test.ts src/lib/server/retrieval/__tests__/search-runtime-fusion.test.ts` → **23/23 pass**
  - `npx tsgo --noEmit` (repo-wide) → zero errors in any modified file
  - `npx vitest run src/lib/server/retrieval/` (full directory regression) → 3 failed files / 9 failed
    tests with these changes vs. 6 failed files / 27 failed tests on unmodified baseline (confirmed
    via `git stash` + re-run) — net improvement, zero new failures, zero regressions. All remaining
    failures are pre-existing, in modules never touched by this change (`cross-ranker.ts`,
    `hyperrag-fusion-service.ts`, `promote-results.ts`, `executor-tree-test.server.test.ts`).

## RF5 - Same-lane vote inflation (partially complete for the canonical spine, 2026-08-08; other pipelines open)

- [x] `SearchRuntime.fuseCandidates`'s within-lane ranking (`sourceRanks` construction) had a real
      bug: `ranked.set(key, idx + 1)` ran unconditionally, so a duplicate identity appearing twice
      in the same lane (two chunk projections of one symbol) let the LATER, WORSE-ranked occurrence
      silently overwrite the earlier, better one — inverting "one canonical entity / one logical
      lane / one vote" to keep the worst evidence instead of the best. Fixed: `if (!ranked.has(key))`
      guard keeps the first (best, since `sourceCards` sorts best-first) occurrence's rank.
      Proven in `search-runtime-fusion.test.ts` — asserts the fused score matches the best-rank
      RRF component (`1/(60+1)`), not the worst-rank one (`1/(60+2)`).
  - Note: `combineViaRRF` (`rrf-combiner.ts`, the `/api/search/rrf` pipeline) has the OPPOSITE,
    more severe bug — it doesn't dedupe within a lane at all, it sums every occurrence's
    `rrfComponent` unconditionally (documented, not yet fixed, in
    `rrf-canonical-identity.test.ts`'s "ONE lane produces two votes" test). These are two
    different bugs in two different pipelines; fixing one does not fix the other.
- [ ] `laneEvidence` (bestRank, bestScore, supportingHits count, rawLaneIds) retention — NOT built.
      The current fix keeps the best rank's full candidate object as the fused base (so bestScore/
      bestRank/rawLaneIds are implicitly available via `contributingLanes` + the base candidate's
      own fields), but there's no explicit `laneEvidence` structure summarizing "how many
      projections did this lane actually contribute." Open item if that summary is needed for D5's
      inspectable-RRF-contributions goal.
- [ ] `combineViaRRF`'s cross-lane, same-lane-double-vote bug (distinct from the within-lane
      ranking bug just fixed) — not yet fixed. Tracked under RF6 for the `/api/search/rrf` pipeline.
- [ ] Apply the equivalent fix to `unified-orchestrator.ts`'s `combineRRFLanes` — NOT started (RF6).
- [x] **RF5 live trace attempted (2026-08-08) — surfaced a real bug in the RF4 fix itself, not
      yet corrected.** Traced `codebase_chunk_index.id = 8a56e975-ae96-4102-813c-894de6d8975a`
      (`source_ref = src/routes/api/reports/generate/+server.ts`, canonical
      `packet_key = sha256:d43c118631cd29e8c39816979ed14b5a94e54335dfee87d586416762eda63e3f`,
      no `symbol_version_id`) from Postgres into Qdrant.
  - **Confirmed live**: `codebase_chunks_768_v2`'s payload schema (52,380 points) has **no
    `packet_key` field and no `symbol_version_id` field at all** — `payload_schema` lists only
    `embedding_model`, `content_hash`, `representation_name`, `model_revision_state`,
    `postgres_id`, `projection_revision`, `indexed_at`, `source_ref`, `qdrant_point_id`,
    `chunk_id`. This is not a per-row gap, it's a schema-wide absence — every dense-lane
    candidate's `packetKey`/`symbolVersionId` fields, as built by `retrieveQdrant()`, were
    **already silently wrong before RF4** (populated from a Qdrant-side `postgres_id` UUID that
    has no relationship to the real canonical `packet_key` in Postgres — confirmed the two UUIDs
    differ). RF4's fix correctly stops trusting those wrong values and instead resolves via the
    `source_ref` tier, since `source_ref` IS present (52,380/52,380 points) and DOES match
    Postgres truth exactly.
  - **New bug found in RF4's own precedence, via live data, not static reading**: `source_ref` is
    **not unique per Qdrant point** at this collection's granularity — confirmed **23 distinct
    points share the exact same `source_ref`** (one file, 23 chunks, each with a distinct
    `content_hash`). If `source_ref` is used as the canonical dedup key here, fusion would
    incorrectly merge all 23 distinct chunks into one fused candidate — a real over-merging
    correctness bug, not a hypothetical one. `content_hash` is populated on 45,472/52,380 points
    and IS chunk-unique — a better 3rd-tier candidate than `source_ref` for this collection, but
    changing `identity-resolution.ts`'s public precedence order is a design decision affecting
    every consumer (`rrf-integration.ts` too) and was correctly NOT made unilaterally this session.
  - **Round-trip status**: `IDENTITY_ROUND_TRIP: PARTIAL` — Postgres canonical row confirmed,
    Qdrant projection located and confirmed reachable, but the join-back is **not clean**: the
    only fields the two stores actually share are `source_ref` (non-unique at chunk granularity)
    and a coincidental content match, not `packet_key`/`symbol_version_id` (absent from Qdrant
    entirely). Neo4j and Redis legs of the round trip were not attempted before context budget
    ran out — genuinely not run, not assumed.
  - **Resolved same session**: added `content_hash` as a tier between `packet_key` and
    `source_ref` in `identity-resolution.ts` (precedence now: `symbol_version_id -> packet_key ->
    content_hash -> source_ref -> lane_id_fallback`). Chunk-unique (45,472/52,380 = 87% populated
    on `codebase_chunks_768_v2`), closes the 23-way over-merge risk directly. Wired into the two
    `retrieve-candidates.ts::retrieveQdrant` sites (the only confirmed-live-broken lane) and into
    `rrf-integration.ts`'s adapter for consistency. **NOT** wired into the 6 Postgres lexical lanes
    (BM25/BM25Trigram/exact/AST/rg/BM42-sparse) — their SQL `SELECT` statements don't currently
    fetch `content_hash`, and widening every query was out of scope for this pass; tracked as an
    explicit follow-up, not silently skipped. 2 new tests added (content_hash wins over source_ref;
    content_hash sits below packet_key). 25/25 tests pass across all three identity test files.
    `tsgo --noEmit`: zero new errors.
  - **Still not run**: Neo4j and Redis legs of the round trip.
  - **Live re-verification done (2026-08-31)**: re-ran the flagged "cheap, valuable next step" —
    queried Qdrant `codebase_chunks_768_v2` live for every point sharing
    `source_ref = 'src/routes/api/reports/generate/+server.ts'`. Confirmed exactly **23 points**
    (matching the doc's claim), and **all 23 have distinct `content_hash` values** — the
    `content_hash` tier genuinely disambiguates this group with no collisions. The specific traced
    entity (`8a56e975-ae96-4102-813c-894de6d8975a`) carries `content_hash = 1907d1df05c09e2f` in
    both Qdrant's payload and Postgres's `codebase_chunk_index.content_hash` column — exact match,
    confirming the join-back genuinely works for this entity via the `content_hash` tier, not just
    in unit tests against synthetic data. `IDENTITY_ROUND_TRIP` can be upgraded from `PARTIAL` to
    `PARTIAL_PROVEN_LIVE` for the Postgres↔Qdrant leg specifically (Neo4j/Redis legs still
    unattempted, so not a full round-trip proof).

## RF6 - Per-pipeline decisions for the other 4 live fusion owners (not started, unblocked — can run parallel to RF4/RF5)

- [x] RF6-INPUT-SHAPE-01 — Adapt `audit-retrieval-signal-ranking.mjs` to the existing
      `retrieval-e2e-benchmark.json` producer shape and prove a read-only receipt. The fresh
      run reports 5/5 answered queries, 60 dense hits, 59 lexical/tree matches, 82 graph hits,
      and 60 reranked candidates while remaining `DEGRADED` for missing revision bindings and
      ACE cards. No canonical writes were performed.

**2026-09-01 input-shape audit:** `scripts/atlas/audit-retrieval-signal-ranking.mjs`
defaults to `docs/reports/agentic-recommendation-workflow.json`, which is a six-row
recommendation ledger rather than a retrieval execution receipt. Its read-only run therefore
correctly returns `BLOCKED` with identity, lexical, dense, graph, rerank, and ACE counts all
zero (`INPUT_NOT_EXECUTION_RECEIPT`). Do not relabel that ledger as live retrieval evidence;
provide an actual execution receipt or keep this diagnostic gate blocked.

The diagnostic now accepts the existing `docs/reports/retrieval-e2e-benchmark.json` shape as a
read-only adapter. The current receipt reports 5/5 answered queries, 60 Qdrant hits, 100 graph
hits, 16,255 tree/lexical matches, and 100% source-ref/feature-id coverage, but remains
`DEGRADED` because revision bindings and ACE cards are not recorded. This proves benchmark
coverage only; it does not close canonical identity or ContextManifest admission.
The benchmark producer now emits per-query source/workspace/representation/graph revision
counters and `revision_bound_count`; the audit requires every query to report a fully bound
candidate before clearing the revision blocker. The stored benchmark must be rerun read-only
before those new fields can be evaluated.

**2026-09-01 fresh benchmark:** the producer run completed `PASS` for 5/5 queries with 60
Qdrant hits, 59 lexical/tree matches, 82 graph hits, and 60 reranked candidates. All five
queries reported `revision_bound_count: 0`; no ACE cards were emitted. The signal receipt is
therefore `DEGRADED`, and the measured latency was approximately P50 9.35s / P95 11.29s, so
sub-second retrieval is not proven (`docs/reports/retrieval-e2e-benchmark.json`).

**2026-09-01 live schema check:** `public.atlas_higher_hop_index` contains packet/source/
feature/projection fields but no source, workspace, representation, or graph revision columns;
its JSON metadata only exposes Qdrant/SOM payload details. Therefore the benchmark cannot derive
revision-qualified identity from this table alone. The next patch must select an explicit
canonical join owner (for example packets plus Graphify/source bindings) and prove that join
read-only before changing the benchmark’s `revision_bound_count` semantics.

The follow-up current-workspace join audit remains blocked: 111 workspace bindings and 111
Graphify exact sources are present, but binding-to-chunk content matches are `0` and
packet-to-chunk exact/content matches are both `0` (`docs/reports/current-workspace-packet-chunk-join-v1.json`).
This prevents revision hydration from being promoted into the retrieval benchmark.

For each of `rrf-integration.ts`/`rrf-combiner.ts`, `rrf-fusion.ts`, `service.ts::rrfFusion`,
`unified-orchestrator.ts`/`rrf-combiner-utils.ts::combineRRFLanes` — decide and record one of:
delegate-to-canonical-owner (once RF4/RF5 land and a real shared boundary exists) /
fix-in-place-independently / mark-explicitly-legacy-and-schedule-retirement. Do not default to
"leave as-is silently" for any of them — each carries a live, unaddressed identity or dedup gap
per RF1/RF2's findings.

The latest proof-spine review also keeps two sequencing gates open here:
one-vote-per-lane still needs a live replay receipt, and the frozen replay
gate should not close until the live fusion-owner matrix is recorded against
that same receipt.

**2026-09-01 verification note:** focused regressions passed for the canonical
identity path and the standalone RRF implementations (`search-runtime-fusion.test.ts`,
`rrf-canonical-identity.test.ts`, `identity-resolution.test.ts`, `rrf-fusion.test.ts`,
  and `rrf-split.test.ts`: 61/61 assertions). The prior HyperRAG import blocker was
  isolated to an incomplete `ENV` test mock; after adding explicit test-only runtime
  fields, `hyperrag-fusion-service.test.ts` passes 2/2. This proves test behavior only;
  no RF6 owner decision or production wiring was inferred from these tests.

- [x] `rrf-integration.ts`/`rrf-combiner.ts` (`/api/search/rrf`) — one-vote-per-lane is now
      enforced by `combineViaRRF`'s per-candidate/per-lane map, retaining the best-ranked
      contribution for repeated projections. Identity normalization remains revision-aware
      and the focused regression covers repeated same-lane hits (`rrf-canonical-identity.test.ts`).
      Verified 2026-09-01; no production route migration was performed.
- [ ] `rrf-fusion.ts` (`/api/retrieval/rrf`) — no identity resolution at all, trusts caller
      `candidate_id`. The request schema exposes only `candidate_id`, `source_ref`, and
      `content_hash`; it does not carry `symbol_version_id`, `packet_key`, `source_revision`,
      or `workspace_revision`. The route is admin-gated and documented as an evaluation/debug
      endpoint, so classify it as `IDENTITY_METADATA_INSUFFICIENT` until a canonicalized request
      envelope or explicit legacy retirement decision is adopted. Do not infer identity from
      caller IDs or content paths. Audited 2026-09-01; no route contract change performed.
- [ ] `service.ts::rrfFusion` (`/api/atlas/studio/search`, `/api/atlas/search`) — two-stage
      identity handling is the most architecturally confused of the four; decide whether to
      collapse to one stage in place or replace with a call into the canonical boundary once it exists.
- [ ] `unified-orchestrator.ts`/`rrf-combiner-utils.ts::combineRRFLanes` (`/api/admin/retrieval/stream`,
      transitively `/api/retrieval/go`, `/api/retrieval/multi-vector`) — highest usage breadth
      alongside `rrf-fuse.ts` (6+ call sites incl. an MCP tool); weigh fix priority accordingly.
      The utility now suppresses repeated same-lane contributions and retains the strongest
      contribution, proven by the added `rrf-split.test.ts` regression. Cross-pipeline identity
      normalization, live replay, and final owner classification remain open. The current
      `buildRrfLaneMap` still uses Qdrant point IDs for dense hits, TurboVec IDs for the proxy
      lane, and file:line IDs for lexical hits; Postgres enrichment happens after fusion. This
      is `PARTIAL_PROVEN` for vote arithmetic, but `IDENTITY_METADATA_INSUFFICIENT` for
      cross-lane canonical parity. Audited 2026-09-01; no identity fallback was added.
- [ ] `rrf-fuse.ts` — most broadly-called fusion owner found in this whole audit (6+ callers).
      It currently keys its accumulator on `packetKey ?? id` and does not include a
      `symbol_version_id` tier or revision-qualified identity envelope. Keep this as a
      breadth-priority owner decision, not a completed parity fix; classify
      `IDENTITY_METADATA_INSUFFICIENT` pending caller census and canonical boundary selection.

### RF6-IDENTITY-AUDIT-01 — 2026-09-01 bounded caller review

The focused source review confirms three separate statuses: the canonical identity path and
same-lane vote arithmetic are proven by tests; `/api/retrieval/rrf` is an admin/evaluation route
whose input envelope is too thin for canonical identity; and the unified orchestrator fuses
projection/file IDs before its later Postgres join. No alternate identity was invented, and no
database, Qdrant, cache, or production writes were performed. The next RF6 gate is a live,
revision-qualified replay after the shared candidate envelope is available.

## RF7 - Long-term convergence (explicitly deferred, do not start before RF4-RF6)

- [ ] Extract `SearchRuntime.fuseCandidates`'s semantics into a shared, importable canonical
      fusion module (identity-aware, within-lane dedup, one-vote-per-lane, RRF calculation,
      provenance merge) that specialized routes can call instead of reimplementing fusion.
- [ ] Consolidate the 7+ diverged RRF weight tables into one shared config, once the fusion
      owners that would consume it are themselves converged.
- [ ] Re-evaluate whether `service.ts`'s `SearchLaneRegistry` and `unified-orchestrator.ts`'s
      inline lane calls should eventually route through `retrieve-candidates.ts`'s lane set
      instead of maintaining 3 independent lane-execution mechanisms — explicitly not decided
      by this audit, flagged for a future proposal.

## Explicitly out of scope for this change

Per the audit's stop conditions, honored throughout: no GPU/CAGRA/cuGraph work, no ColBERT/
late-interaction work, no semantic-glyph/LOD representation work, no `graphify:daily` run, no
SearchFilter/Qdrant schema changes, no deletion of any RRF implementation. These remain valid
future directions (see session discussion) but are correctly sequenced after RF4-RF6, not before.

## Acceptance criteria

- Every module in the retrieval-fusion family (13+ implementations found, 3 still unclassified)
  has a recorded role and reachability classification, evidence-linked, not assumed from filename.
- The canonical production spine's identity degradation is observable (tagged, not silent) before
  any further RRF/fusion logic is modified on that path.
- No fix claims cross-pipeline coverage it doesn't have — each of the 5 live pipelines' identity
  status is tracked and decided independently until RF7's convergence work is scoped separately.
- The `rrf-integration.ts` fix from earlier in this session remains in place, untouched, and is
  referenced as the proven precedence pattern other fixes should match, not duplicated ad hoc.
