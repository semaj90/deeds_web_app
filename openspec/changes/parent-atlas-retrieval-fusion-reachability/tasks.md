# OpenSpec: Parent Atlas Retrieval Fusion Reachability Tasks

## RF5/RF6 follow-up — memory/agent owner reconciliation (2026-09-05)

Current-tree code trace, not a live endpoint replay:
`/api/search/rrf` imports `rrf-integration.ts::multiLaneRetrievalWithRRF`;
that function sends `qdrant_vector` and `turbovec_ann` as separate names
to `rrf-combiner.ts::combineViaRRF`. Its map deduplicates by supplied name,
not logical lane. Thus the same admitted candidate can get two semantic votes.
The September 1 repeated-same-name proof remains valid but does NOT prove
cross-executor semantic deduplication. Classification: REAL_CURRENT_FINDING,
SOURCE_TRACED; deployed traffic/replay not executed in this pass.

`/api/retrieval/rrf` separately calls `rrf-fusion.ts::fuseRetrievalLanes`
on caller-supplied lists. It does not call the Go facade. The facade conditionally
calls `executeMultiVectorRetrieval` in `multi-vector-orchestrator.ts`, which
calls `rrf-multi-vector.ts::fuseLanesViaRrf` for content/summary/title/keywords.
These are separate paths, not one proven nested call chain. The route checks
`locals.user`; this is authentication, not proof of an admin-role gate.

- [x] RF6-EXECUTOR-LANE-TRACE-01 record the above current call sites and retain
  SearchRuntime as the production spine; do not elevate combineViaRRF.
- [x] RF6-EXECUTOR-LANE-OWNER-01 extend the existing owner matrix with explicit
  delegate/retain decisions for these paths and define logical dense lane vs executor
  metadata (qdrant/turbovec/cuvs/cagra); supersede only conflicting matrix decisions.
  **PROVEN 2026-09-05 by current-source trace**:
  `scripts/atlas/prove-rf6-executor-lane-owner-v1.mjs` passed 11/11 checks and wrote
  `docs/reports/rf6-executor-lane-owner-v1.json`. SearchRuntime is the logical-lane
  normalization/fusion owner. `rrf-integration.ts::combineViaRRF` and `rrf-fuse.ts`
  are assigned `DELEGATE_TO_CANONICAL`, but runtime delegation remains open;
  `/api/retrieval/rrf` remains an evaluation-only independent route;
  `multi-vector-orchestrator.ts::fuseLanesViaRrf` remains a separate path pending its
  envelope/replay. Executor labels are evidence, never additional dense votes. No
  runtime, datastore, cache, model, or endpoint writes occurred.
- [x] RF6-SEMANTIC-VOTE-01 after that decision, implement one semantic vote per
  revision-qualified candidate, preserve executor evidence, and prove duplicate
  hits/rank ties plus distinct canonical chunks using focused regressions.
  **PROVEN 2026-09-05** by `scripts/atlas/prove-rf6-semantic-vote-v1.mjs`:
  `RF6_SEMANTIC_VOTE_PROVEN`, 9/9 source-contract checks and the focused
  SearchRuntime/RF6 replay suite passed 27/27. SearchRuntime now uses a
  revision-qualified dense identity when both source/workspace revisions exist,
  retains `executorIds` in `laneEvidence`, and gives each logical lane group one
  RRF contribution regardless of Qdrant/TurboVec executor count. Distinct hydrated
  chunks and source revisions remain separate; equal-score executor ties replay
  deterministically. No datastore, cache, model, or endpoint writes occurred.
- [x] RF6-SEMANTIC-REPLAY-01 run a bounded read-only production-spine replay with
  both semantic executors; no promotion, exposure, ledger, cache, or model writes.
  **PROVEN 2026-09-06** by the direct-owner replay
  `scripts/atlas/prove-rf6-semantic-live-readonly-v1.mjs`, which deliberately
  bypasses `/api/search/rrf` because that route writes `rrf:query_counts` and
  `rrf:query:{hash}` analytics. The real
  `rrf-integration.ts::multiLaneRetrievalWithRRF` path returned Qdrant=1 and
  TurboVec=7 live candidates. Three returned candidates carried semantic support;
  all reconstructed to exactly one logical semantic RRF contribution, with zero
  vote violations. Read-only mode suppresses embedding-cache writeback and skips
  the optional Gemma/Bifrost concept-enrichment branch. PostgreSQL tuple-write
  stats were unchanged; relevant Valkey key/type/value fingerprints were
  unchanged; Qdrant, Neo4j, and model writes were not performed. Receipt:
  `docs/reports/rf6-semantic-live-readonly-replay-v1.json`. Focused regressions
  (`rrf-canonical-identity.test.ts`, `rf6-live-replay-01.test.ts`) also pass 17/17.

No endpoint invocation, datastore projection, or RF7 closure is authorized by this addendum.
The bounded SearchRuntime fusion correction above is the explicitly scoped RF6 runtime change.

### RF6-EXECUTOR-LANE-OWNER-01 decision record

| Consumer | Decision | Current boundary |
|---|---|---|
| `SearchRuntime::fuseSearchRuntimeCandidates` | `CANONICAL_OWNER` | Normalizes candidates into logical lanes (`dense`, `lexical`, `exact`, `ast`, `schema`, `rg`, `bm42`) and retains lane evidence. |
| `rrf-integration.ts::combineViaRRF` via `/api/search/rrf` | `DELEGATE_TO_CANONICAL` | Current source still passes `qdrant_vector` and `turbovec_ann` as separate executor labels; bounded SearchRuntime semantic-vote proof is complete, but runtime delegation remains open. |
| `rrf-fusion.ts::fuseRetrievalLanes` via `/api/retrieval/rrf` | `RETAIN_INDEPENDENT_EVALUATION_ONLY` | Thin caller-supplied envelope has no revision-qualified canonical identity; no production fusion promotion. |
| `multi-vector-orchestrator.ts::fuseLanesViaRrf` | `DELEGATE_TO_CANONICAL_AFTER_ENVELOPE` | Separate Go-facade path; its content/summary/title/keywords lanes require an explicit replay before migration. |
| `unified-orchestrator.ts::combineRRFLanes` | `RETAIN_PENDING_OWNER_REPLAY` | Existing same-lane arithmetic proof does not establish cross-lane canonical identity. |
| `rrf-fuse.ts` | `DELEGATE_TO_CANONICAL` | Existing replay confirmed duplicate-lane and chunk-identity divergence; no migration in this gate. |

`qdrant`, `turbovec`, `cuvs`, and `cagra` are executor identities under the logical
`dense` lane. They may be retained in `laneEvidence`/provenance but MUST contribute at
most one semantic vote per revision-qualified candidate. This decision supersedes only
conflicting future interpretation of the earlier five-owner matrix; it does not claim
that runtime delegation or RF6 semantic replay is complete.

### RF6-SEMANTIC-VOTE-PRECONDITIONS-01 — 2026-09-05

- [x] Current-source precondition audit completed by
  `scripts/atlas/prove-rf6-semantic-vote-preconditions-v1.mjs`.
  The proof now records the additive HTTP and canonical split-gRPC source path.
  The proof remains a source-contract precondition, not a live promotion claim;
  complete cross-executor qualification still requires the live gRPC replay.
  Report:
  `docs/reports/rf6-semantic-vote-preconditions-v1.json`.
- [x] `TURBOVEC-CANONICAL-ENVELOPE-HTTP-01` — additive HTTP propagation implemented:
  `scripts/atlas/prove-turbovec-ann-grpc.mjs` carries Qdrant identity/revision payload
  fields into `/build`, the live owner `sveltekit-frontend/scripts/turbovec-sidecar.py`
  retains them by stable index position and returns them as optional `identity`, and
  the TypeScript adapter passes
  them through to RRF metadata. Backend-local IDs remain provenance only. Python and
  Node syntax checks plus the focused SearchRuntime fusion regression passed; the
  canonical `turbovec.proto` now carries the optional `CandidateIdentity` envelope,
  while `turbovec_cuda.proto` remains compatibility-only.
- [x] `TURBOVEC-CANONICAL-ENVELOPE-GRPC-01` — implementation wiring completed but
  live-proven status remains open: `TurboVecService` now owns ANN health/search,
  `GpuBridgeService` owns tensor methods, and the bridge keeps the deprecated
  `TurboVecCudaService` registered for compatibility. The canonical ANN response
  carries optional identity/revision metadata from the Python sidecar. Static source
  proof passes; an isolated alternate-port bridge health smoke passed, while the
  refreshed `:50062` process now answers `TurboVecService/Health` and returns ANN
  candidates. The strict live replay still fails closed because the current Qdrant
  projection provides packet/source/content metadata but no `sourceRevision` or
  `workspaceRevision` on returned candidates (`grpc_identity_preserved=false`).
  This is now a revision-propagation/projection admission gap, not a gRPC service
  registration gap.
- [x] `TURBOVEC-CANONICAL-ENVELOPE-01` adapt the existing TurboVec retrieval response
  or add an upstream read-only identity join that returns revision-qualified candidate
  metadata. Preserve backend-local IDs as executor provenance. Prove exact source/
  packet identity, sourceRevision, workspaceRevision, namespace, and candidate checksum
  as the envelope precondition for the RF6 semantic-vote/replay gates. The current
  bounded live replay uses an exact read-only join because the active Qdrant projection
  still omits workspace revision. This is an upstream envelope task, not a new fusion
  owner. **Current replay evidence (2026-09-05):** the canonical-only v2 replay at
  `docs/reports/turbovec-ann-grpc-proof-v2-replay.json`
  reports 50 usable v2 768d points, 9 returned gRPC candidates, healthy `TurboVecService`,
  `grpc_canonical_only=true`, and `grpc_identity_preserved=true`. The bridge performs
  an exact read-only `(source_ref, code_source_revision) -> workspace_revision` join
  against `graphify_files`, drops the one candidate without a unique join, and emits a
  stable identity-set checksum. The Python owner now defaults to
  `codebase_chunks_768_v2`. Raw projection qualification remains diagnostic
  (`qdrant_identity_qualified=false`) because the source payload omits workspace
  revision; the allowed upstream join supplies it without mutation. The legacy
  `codebase_chunks_768` collection remains non-canonical and is not repaired. This
  closes the bounded envelope gate and supplies the precondition used by the focused
  RF6 semantic-vote proof; it does not authorize broad Qdrant repair, semantic
  promotion, or the still-open live production replay.

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
- [x] **AUDITED 2026-09-06 — identity gap retained as an open delegation finding.** `search-lanes.ts`
      assigns Qdrant packet/source/revision fields from payload, but `GpuCuvSLane` returns only a
      backend-local index and the lexical/BM25 lanes omit a complete revision-qualified identity.
      `service.ts::joinPostgres` enriches some Qdrant results after fetch, while
      `service.ts::rrfFusion` still scores by `result.id` and final dedup falls back through
      `symbol_version_id ?? packet_key ?? id`. This confirms the service path needs a canonical
      envelope/delegation decision; no lane-name heuristic was applied.
- [x] **AUDITED 2026-09-06 — identity gap retained as an open delegation finding.**
      `unified-orchestrator.ts::qdrantSearch()` requests packet/source/source-revision/workspace
      payload fields, but `turboVecPrefilter()` returns only `id`, `score`, and `rank`.
      `buildRrfLaneMap()` therefore receives a backend-local TurboVec identity and
      `rankCandidates()` can construct a complete envelope only for Qdrant-backed hits. The
      `combineRRFLanes` owner remains open pending a revision-qualified cross-executor envelope.
- [x] **AUDITED 2026-09-06 — separate representation-lane owner retained.**
      `multi-vector-orchestrator.ts` rejects hits without packet/source identity and preserves the
      Qdrant point ID, then fuses content, summary, title, and keyword representation lanes via
      `rrf-multi-vector.ts`. `cache-layers-orchestrator.ts` measures direct/adapter/exact/semantic
      cache decisions; its telemetry writer is a separate cache-observation path, not a canonical
      fusion owner. No delegation or lane collapse was claimed from this read-only trace.
- [x] **AUDITED 2026-09-06 — conversion behavior recorded.**
      `go-retrieval-facade.ts::normalizeRequest()` maps the first source/path/language/domain
      filter values into `SearchFilter`, retains the broader arrays in `jsonb_contains`, keeps lane
      selection outside filters, and assigns the per-lane limit. It does not add source or
      workspace revision authority; the downstream unified orchestrator remains responsible for
      canonical identity validation. No schema or filter-owner change was made here.
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
- [x] Acceptance (DOWNGRADED 2026-09-01, operator review — see RF-IDENTITY-SEMANTICS-02 below):
      the original claim `CANONICAL_IDENTITY_ON_LIVE_PATH: DEGRADED -> PASS` was too strong for
      what this task actually proved. Corrected framing: `IDENTITY_DEGRADATION_OBSERVABILITY:
      PASS` (degraded cases are now observable via `identityStatus`/`identitySource` instead of
      silently absent — this part is genuinely proven), `CANONICAL_IDENTITY_HYDRATION: PARTIAL`
      (only some tiers hydrate real canonical identity; `content_hash`/`source_ref` were being
      treated as the same trust class as `symbol_version_id`/`packet_key`, which was wrong — see
      RF-IDENTITY-SEMANTICS-02), `CANONICAL_IDENTITY_ON_LIVE_PATH: PARTIAL_PROVEN` (not a full
      PASS — full end-to-end live proof against real Postgres/Qdrant data is still RF5's
      `ONE_ENTITY_ENRICHMENT_TRACE_PROVEN` step, not yet run).
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
  - Note: `combineViaRRF` (`rrf-combiner.ts`, the `/api/search/rrf` pipeline) had the
    corresponding repeated-projection and cross-executor vote-inflation defect. It is now
    covered by the 2026-09-06 RF6 fix below: one best contribution per logical lane, with
    physical executor support retained as provenance. These remain separate bugs in two
    different pipelines; fixing one does not fix the other.
- [x] `laneEvidence` retention — **PROVEN 2026-09-05** as part of
      `RF6-SEMANTIC-VOTE-01`. Each fused logical lane records `bestRank`, `bestScore`,
      `supportingHitCount`, `supportingBackendIds`, `executorIds`, and contributing
      score sources. The lane contributes exactly once; executor multiplicity remains
      evidence only. Report: `docs/reports/rf6-semantic-vote-proof-v1.json`.
- [x] `combineViaRRF`'s cross-executor, same-logical-lane double-vote bug (distinct from the
      within-lane ranking bug just fixed) — **fixed 2026-09-06**. `qdrant_vector` and
      `turbovec_ann` now collapse to one `semantic` vote per identity while retaining both
      physical lanes in `sources`/`breakdown` as provenance. Regression coverage asserts the
      score is the stronger single contribution, not the sum. Focused RF6 tests pass; this does
      not change the separate `unified-orchestrator.ts::combineRRFLanes` owner. No datastore or
      projection writes were performed.
- [ ] Apply the equivalent fix to `unified-orchestrator.ts`'s `combineRRFLanes` — NOT started (RF6).
      **Pending contract/owner work:** its current `rrf-combiner-utils.ts` input is a plain
      `Map<string, hits>` with caller-provided IDs and lane names, without the revision-qualified
      canonical identity envelope required to distinguish executor aliases from distinct entities.
      Existing compatibility coverage still passes `7/7` (`unified-orchestrator.spec.ts` and
      `rrf-split.test.ts`) on 2026-09-06; that is not evidence to apply a lane-name heuristic here.
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

## RF-IDENTITY-SEMANTICS-02 - Identity vocabulary contract correction (complete, 2026-09-01)

Operator review adopted in full (2026-09-01), with two extra safeguards. Core correction: identity
semantics had outrun RF4/RF5's vocabulary. `content_hash` solved a real over-merge problem (RF5's
23-chunks-share-one-source_ref finding) but was wrongly promoted into the same trust class as
`symbol_version_id`/`packet_key` — a real conceptual contradiction, not a naming nitpick.

Frozen identity model:
- **CANONICAL ENTITY** `symbol_version_id`
- **CANONICAL PACKET** `packet_key`
- **CANONICAL CHUNK** `canonical_chunk_id` — only when supplied by proven packet<->chunk
  ProjectionRegistryV1/lineage hydration (see `parent-atlas-retrieval-lineage-dag-convergence`'s
  `PacketChunkMembershipV1` contract). Never reconstructed from a hash, source path, AST range,
  Qdrant point ID, or file grouping.
- **EXACT PROJECTION EVIDENCE** `content_hash` — only reaches `PROJECTION_EXACT` when a qualifying
  `HashContractV1` (`hashAlgorithm`/`hashDomain`/`producerRevision`) is also supplied. Safeguard 1:
  this repo has at least one confirmed historical hash domain where the producer hashed generated
  artifact content rather than source chunk bytes — an unqualified hash must never be silently
  trusted as interchangeable with a qualified one from a different producer. Unqualified =
  `HASH_EVIDENCE_UNQUALIFIED`, falls through, never reaches `PROJECTION_EXACT`.
- **SOURCE GROUP** `source_ref` — a file-level grouping key, never promoted to canonical status.
- **DEGRADED LOCAL IDENTITY** backend/lane-local id (Qdrant point id, TurboVec candidate id, etc.)

Safeguard 2: `canonical_chunk_id` is added to the resolver's precedence, but the resolver only
*consumes* it when present — it must never reconstruct one. Enforced in code by having no fallback
path that derives `canonicalChunkId` from any other field.

- [x] Defined `IdentityResolutionStatus` (`'CANONICAL' | 'PROJECTION_EXACT' | 'SOURCE_GROUP' |
      'DEGRADED'`), `IdentitySource` (adds `canonical_chunk_id` to the existing vocabulary),
      `HashContractV1`, `IdentityResolutionInputV2`, and `IdentityResolutionV2` (`key`,
      `resolutionStatus`, `identitySource?`, `canonicalEntityId?`, `packetKey?`,
      `canonicalChunkId?`, `evidenceRefs?`) in `identity-resolution.ts`.
- [x] Implemented `resolveCanonicalIdentityV2()` — additive, does not replace or alter the existing
      `resolveCanonicalIdentity()`/`ResolvedIdentity` V1 primitive (a concurrent same-day pass had
      already broadened V1's own `status` field from `'canonical' | 'degraded'` to
      `'canonical' | 'projection_exact' | 'source_group' | 'degraded'`, in place, with its tests
      updated to match — left untouched here, not re-litigated). V2 additionally enforces hash-
      domain qualification (V1 does not) and adds the `canonical_chunk_id` tier (V1 does not have
      one at all).
- [x] This is a small contract correction, not a retrieval redesign, per the operator's explicit
      instruction — no fusion owner (`SearchRuntime.fuseCandidates`, `rrf-integration.ts`, etc.)
      was migrated onto V2 in this task. That migration is `RF-QDRANT-HYDRATION-02` below.
- [x] 8 new tests added (`identity-resolution.test.ts`), covering the explicit hard cases: hydrated
      `canonical_chunk_id` consumed as `CANONICAL`; qualified `content_hash` -> `PROJECTION_EXACT`;
      unqualified `content_hash` (no `hashContract`) does NOT reach `PROJECTION_EXACT`, falls
      through to `SOURCE_GROUP`/`DEGRADED`; a partially-qualified hash contract (missing
      `producerRevision`) is treated as unqualified; bare `source_ref` -> `SOURCE_GROUP` never
      `CANONICAL`; negative assertion that `canonicalChunkId` is never populated on the result
      unless explicitly supplied (proves no reconstruction). 18/18 pass in the full file
      (10 pre-existing V1 + 8 new V2). Repo-wide `tsgo --noEmit`: zero errors touching this file.
- [x] Cross-reference recorded, not enforced by code: this correction does NOT block
      `PKT-LINEAGE-08`'s production canary (`parent-atlas-retrieval-lineage-dag-convergence`) — the
      two are independent lanes that can proceed in parallel. `RF-QDRANT-HYDRATION-02` and
      `RF5-LIVE-REPLAY-01` (below) should consume the lineage program's `PacketChunkMembershipV1`/
      `ProjectionRegistryV1` hydration as it becomes proven, rather than constructing an
      alternative `canonical_chunk_id` source inside retrieval fusion.

### Operator verdict on this whole change (2026-09-01)

| Item | Verdict |
|---|---|
| RF1, RF2 reachability | KEEP |
| RF3 inventory | KEEP — fix stale counts (the dead `RRF_LANE_WEIGHTS` "doesn't sum to 1.0" note stays recorded as a fact about that dead table, not a live defect; weighted RRF does not require weights to sum to 1 — `score(d) = Σ weight_i / (k + rank_i(d))` is valid unnormalized) |
| RF4 observability | KEEP — downgrade canonical claim (done above) |
| RF5 vote arithmetic | KEEP |
| RF5 identity vocabulary | REVISED (this task) — `content_hash` and `source_ref` removed from `CANONICAL` status; `canonical_chunk_id` added, consumed-only, never reconstructed |
| RF6 owner census | RECONCILE — see `RF6-OWNER-MATRIX-01` below |
| RF6 cross-owner proof | OPEN |
| RF7 shared consolidation | BLOCKED — do not start before RF5/RF6 converge; premature shared-helper extraction risks centralizing the wrong abstraction |

### Corrected RF sequence (2026-09-01)

```
RF-IDENTITY-SEMANTICS-02  (this task, complete)
       |
RF-QDRANT-HYDRATION-02    bind the canonical semantic (dense) lane to the EXISTING
                           ProjectionRegistryV1/PacketChunkMembershipV1 hydration authority --
                           do not invent a second identity bridge inside fusion. Target shape:
                           Qdrant physical point -> ProjectionRegistryV1 -> Postgres canonical
                           hydration (packet_key, canonical_chunk_id, symbol_version_id when
                           applicable) -> revision coordinates fusion. content_hash becomes
                           verification evidence, not the dedup key.
       |
RF5-LIVE-REPLAY-01         Invariant: one logical lane, one canonical hydrated entity, at most
                           one RRF vote. Explicit hard cases to test: same entity via multiple
                           Qdrant physical hits; same entity via multiple backend-local IDs; same
                           packet with multiple legitimate canonical chunks; same source_ref with
                           different canonical chunks; same content_hash but wrong/unproven hash
                           domain (this last case is what prevents the new resolver from
                           recreating either the old source_ref over-merge or a new hash-based
                           over-merge).
       |
RF6-OWNER-MATRIX-01        Reconcile the COUNT before doing code work. If 5 live non-canonical
                           fusion families exist, freeze exactly 5 rows -- no ambiguous "other" row
                           while 5 are separately listed. Per-row fields: owner, productionReachable,
                           logicalLaneVocabulary, identitySemantics, dedupLocation, weightOwner,
                           decision (DELEGATE_TO_CANONICAL | RETAIN_INDEPENDENT | LEGACY_RETIRE).
       |
RF6-LIVE-REPLAY-01
       |
RF7  (still BLOCKED -- wait for RF5/RF6 to converge before any shared-helper extraction)
```

Boundary this sequence preserves (do not alias any of these merely because they happen to be
available as strings/integers on the same object): Qdrant point ID = physical projection
coordinate; CandidateOrdinal = retrieval snapshot coordinate; `canonicalChunkId` = chunk identity;
`packetKey` = file-level packet identity; `symbolVersionId` = symbol version identity.

### RETRIEVAL-02 tightening (recorded here, implemented in the sibling
`parent-atlas-retrieval-lineage-dag-convergence` change's census)

Per the same review: retain the census, but classify every direct Qdrant reader as one of
`NAMED_VECTOR_REQUIRED_MISSING` / `DEFAULT_VECTOR_VALID` / `EXPLICIT_NAMED_VECTOR_VALID` /
`COLLECTION_SCHEMA_UNKNOWN` / `NON_QDRANT_FALSE_POSITIVE`, rather than a flat "has using / doesn't
have using" split. A missing `using` is a proven defect only once target collection, its vector
schema, and the required vector name are all known — for `codebase_chunks_768_v2`'s `content`
vector that condition is satisfied; it is not automatically satisfied for every other call site the
census found. Not re-implemented in this file — see the sibling change's `RETRIEVAL-02` task for
the actual script update.

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

## RF-IDENTITY-CALLER-MATRIX-01 (2026-09-01/02, done) — verdict `V2_READY_FOR_CANONICAL_HYDRATION`

Full result recorded in `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`'s "Three bounded
tracks" section (Track B) — not duplicated here in full to avoid drift between the two files.
Summary: no live caller of any of the 3 `resolveCanonicalIdentity`/`V2` implementations ever
labels `content_hash` or `source_ref` as `'canonical'` — the canonical `SearchRuntime` spine
(`retrieve-candidates.ts` -> `search-runtime.ts`) already grades them `projection_exact`/
`source_group`. No `V1_LIVE_SEMANTIC_COLLISION`. `resolveCanonicalIdentityV2` has zero production
callers yet — clear to wire it as the `RF-QDRANT-HYDRATION-02` resolver without migrating existing
V1 callers. Found and fixed one real, live, currently-broken `tsc` type contract in
`search-runtime.ts` (`Candidate`/`LaneGroup`/`AggregatedCandidate.identityStatus` still 2-way,
RF-IDENTITY-SEMANTICS-02 broadened the resolver to 4-way) — type-only fix, zero dedup/runtime
behavior change (verified: `identityStatus === 'canonical'` branches already treated every other
value identically). One stale test fixed to match. Next: `RF-QDRANT-HYDRATION-02` (not started).

## RF-QDRANT-HYDRATION-02 (2026-09-02, done — WIRED, not yet DEDUP_PROVEN)

Full result in `parent-atlas-retrieval-lineage-dag-convergence/tasks.md` (not duplicated here to
avoid drift). Summary: `ProjectionRegistryV1` already existed, fully tested, correctly designed,
zero production callers. Wired it into `retrieve-candidates.ts::retrieveQdrant`'s dense
`semantic_768` lane (both primary and fallback paths) as a fail-open, observability-only
`canonicalChunkId` attachment — not yet consumed by dedup/fusion, which stays on V1
`resolveCanonicalIdentity` precedence. 4 new tests, `tsc` clean, 38/38 pass. Next:
`RF5-LIVE-REPLAY-01`.

## RF5-LIVE-REPLAY-01 (2026-09-02, done)

Full result in `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`. Summary: ran all 5 named
hard cases against `fuseSearchRuntimeCandidates`. Cases 1/2/4/5 already safe by construction; case 3
("same packet with multiple legitimate canonical chunks") was a real live over-merge bug —
`getFusionIdentityKey()` ignored `canonicalChunkId`, fixed additively (zero behavior change when
`canonicalChunkId` is unset). 5 new tests, 43/43 total pass, `tsc` clean. `RF6-OWNER-MATRIX-01` and
`RF6-LIVE-REPLAY-01` remain explicitly not started.

## RF6-OWNER-MATRIX-01 (2026-09-02, read-only, done) — 5 owners frozen, no refactor, no live replay

Read-only census only, per explicit instruction: no refactor, no live replay, no RF7. Exactly 5
live non-canonical fusion owner rows frozen (matches this file's own prior count — no ambiguous
"other" row introduced). Fields consolidated from this file's existing `RF6-IDENTITY-AUDIT-01`
findings plus direct code reading this session (weight ownership, dedup key exact field, revision
qualification) to fill the gaps those findings left open.

| Field | `rrf-integration.ts`/`rrf-combiner.ts` | `rrf-fusion.ts` | `service.ts::rrfFusion` | `unified-orchestrator.ts`/`rrf-combiner-utils.ts::combineRRFLanes` | `rrf-fuse.ts` |
|---|---|---|---|---|---|
| entrypoint | `/api/search/rrf` | `/api/retrieval/rrf` (admin-gated eval/debug) | `/api/atlas/studio/search`, `/api/atlas/search` | `/api/admin/retrieval/stream`, transitively `/api/retrieval/go`, `/api/retrieval/multi-vector` | 6+ callers incl. an MCP tool (broadest usage of the 5) |
| productionReachable | YES | YES (admin route, still live) | YES | YES | YES |
| logicalLaneVocabulary | canonical `LogicalRetrievalLane` (dense/lexical/exact/ast/schema/rg/bm42) | ad hoc lane names keyed by `FUSION_WEIGHTS` | `SearchLaneRegistry` lane names | caller-supplied lane name strings (`Map<string, ...>` keys) | fixed `RrfLaneName` enum (bm42/rg/dense_384/dense_768/turbovec/topology/authority/dispatcher) |
| candidateEnvelope | `Candidate` (rich: symbolVersionId/packetKey/sourceRef/contentHash/canonicalChunkId) | thin (`candidate_id`, `source_ref`, `content_hash` only — no symbol_version_id/packet_key/revision fields) | `SearchResult` (post-join, has source_ref/content_hash from an earlier stage) | thin (`id`, `rrfContribution`, `rank`, `metadata`) | thin (`id`/`packetKey`, `score`, `rank`, `payload`) |
| identityResolver | `resolveCanonicalIdentity` (V1, shared) | none — trusts caller `candidate_id` directly | none at the fusion step itself (an earlier stage joins `atlas_packets` by `source_ref`, but `rrfFusion()` re-keys on raw `result.id`, discarding that join) | none — trusts caller `id` directly | none — trusts caller `packetKey ?? id` directly |
| canonicalHydration | yes (`ProjectionRegistryV1` via `RF-QDRANT-HYDRATION-02`, dense lane only) | no | partial, then discarded (see identityResolver) | no | no |
| dedupLocation | `getFusionIdentityKey`/`getFusionBackendIdentityKey`, canonical-vs-degraded aware | `candidateMap` keyed on raw `candidate_id` | `scoreMap` keyed on raw `result.id` | `hitAccumulator` keyed on raw `hit.id` | `byPacket` keyed on raw `packetKey ?? id` |
| oneLaneOneVoteSemantics | YES (best-rank-wins within a lane, proven by tests) | not applicable to this router's per-lane score merge (best-of-all-lanes per candidate_id, not a per-lane vote model) | NO (`scoreMap.set(key, (scoreMap.get(key) ?? 0) + weighted)` sums unconditionally, no per-lane cap) | YES (`if (hit.rrfContribution <= existingLane.rrfContribution) return` — proven by `rrf-split.test.ts`) | NO (`current.fusionScore += score` sums unconditionally per hit, no per-lane cap — a lane returning duplicate `packetKey`s can cast >1 vote) |
| weightOwner | shared config (`RRF_LANE_WEIGHTS`-style, canonical path) | this file itself — module-level `FUSION_WEIGHTS` constant | `SearchLaneRegistry` (`lane.config().weight`) — a 3rd distinct weight-ownership model | caller (pre-weighted `rrfContribution` passed in; internal `laneWeight` field hardcoded to `1.0`, explicitly "will be set by caller if needed") | caller (`weightsOrOptions` map passed in per call, default `1`) |
| weightPolicy | centrally defined, `k=60` standard RRF | centrally defined, **enforced to sum to 1.0** (`if (Math.abs(weightSum - 1.0) > 0.001) throw`) — the only owner of the 5 with a hard invariant on its own weights | per-lane-config, no sum invariant | no sum invariant, weight math is entirely upstream of this function | no sum invariant, defaults every unweighted lane to `1` |
| revisionQualified | YES for the dense lane only (`workspaceRevision`/`sourceRevision` fields on `Candidate`, post RF-QDRANT-HYDRATION-02) | NO (no revision fields in the request/response schema at all) | NO at the fusion step (revision fields, if any, are dropped by the same re-keying that drops packet identity) | NO (no revision fields in the lane-hit shape) | NO (no revision fields in the lane-hit shape) |
| evidenceQualified | YES (`laneEvidence`, `supportingBackendIds`, `contributingSources` per fused candidate) | partial (per-lane scores retained in `candidateMap`, but no cross-lane evidence trail object) | NO (`rescored` only carries the final `score`, no per-lane breakdown) | YES (`rrfBreakdown`/`contributions` array per hit, richest evidence trail of the 4 non-canonical owners) | partial (`provenance` object per fused hit, rank+contribution only, no lane-weight-policy trail) |
| decision | `CANONICAL_OWNER` (not part of this row set — the reference other rows are measured against) | `RETAIN_INDEPENDENT` — admin/eval-only surface, thin envelope is fit-for-purpose for a debug endpoint; migrating it to canonical identity would over-engineer a diagnostic tool. Revisit only if it is ever promoted to a non-admin route. | `DELEGATE_TO_CANONICAL` — the most architecturally confused of the 5 (a real Postgres identity join happens upstream and is then discarded at the fusion step); highest-value target once a real shared boundary exists, per this file's own prior note. | `RETAIN_INDEPENDENT` (for now) — one-lane-one-vote is already correctly proven here; its remaining gap (no canonical identity, only raw `id`) is real but this owner's dedup discipline is already better than 3 of the other 4, so delegating it is lower priority than fixing `service.ts`/`rrf-fuse.ts` first. | `DELEGATE_TO_CANONICAL` (highest breadth priority, per this file's own prior note — 6+ callers incl. an MCP tool) — the one-vote-per-lane gap (real, not yet proven) combined with the widest blast radius makes this the second-highest-value target after `service.ts`. |

**No shared RF7 extraction performed or proposed as part of this task** (still `BLOCKED` per this
file's own governance section, pending RF5/RF6 convergence). No route was migrated, no fusion owner
was refactored, no live replay was run. This is a classification-only artifact.

**Next**: `RF6-LIVE-REPLAY-01` (not started — a live, revision-qualified replay after this classification, per this file's own frozen RF sequence). Per the corrected sequence, RF7 remains blocked until both RF5 and RF6 converge; RF6-OWNER-MATRIX-01 alone does not unblock it.

## RF6-LIVE-REPLAY-01 (2026-09-02, read-only observation, done) — confirmed divergence found, no migration performed

Per explicit instruction, ran before any `service.ts`/`rrf-fuse.ts` migration: observe actual
behavioral divergence over the 6 named hard cases, comparing the two highest-risk owners against
the canonical owner (`fuseSearchRuntimeCandidates`).

**`service.ts::rrfFusion` could NOT be live-replayed** — it is an unexported, module-private
function coupled to a live, stateful `getSearchLaneRegistry()` lookup. Testing it in isolation
would require either exporting it (a production code change — explicitly out of scope, "no
refactor") or fixture-mocking the registry/DB layer, a materially bigger lift than this
observational step warrants. Its divergence risk remains evidenced only by `RF6-OWNER-MATRIX-01`'s
static code reading, not a live replay. Recorded as an explicit limitation, not silently treated
as covered.

**`rrf-fuse.ts` was fully live-replayed** (self-contained, exported, no external dependencies) —
6 new tests, `sveltekit-frontend/src/lib/server/retrieval/__tests__/rf6-live-replay-01.test.ts`,
all passing (i.e., the assertions correctly describe *actual observed* behavior, not an ideal):

| Case | Canonical owner | `rrf-fuse.ts` | Divergence |
|---|---|---|---|
| 1. multiple physical IDs, same entity | collapses to 1 vote | collapses to 1 vote | none |
| 2. duplicate hit, same logical lane | caps to 1 vote per lane (best-rank wins) | **sums both hits' contributions unconditionally** — one lane casts 2 votes, inflating the score | **CONFIRMED, real** |
| 3. same packet, distinct canonical chunks | stays separate (RF5 fix) | **merges into 1 row, second chunk's identity silently dropped** — the hit shape has no `canonicalChunkId` field at all, so this cannot even be expressed | **CONFIRMED, structural** |
| 4. same source_ref, distinct chunks | already safe (backend-key dedup) | `sourceRef` is accepted as an optional hit field but never read for dedup (confirmed by code reading) — inert, not separately replayable | not reachable as a distinct case on this owner |
| 5. content_hash, unproven domain | never promoted to canonical | no `content_hash` field exists in the hit shape at all — whatever a caller puts in `packetKey` is fully canonical-equivalent, with no lower trust tier | **structural gap**, not proven exploitable without a caller collision |
| 6. degraded/hydration-miss identity | tracked and observable (`identityStatus`) | no `identityStatus` concept anywhere in `FusedHit` — a real vs. fallback identity is unrepresentable in the output | **CONFIRMED, structural** |

**Verdict**: real, concrete divergence confirmed on cases 2 and 3 (not merely theoretical), plus
structural unrepresentability on cases 5 and 6. This corroborates `RF6-OWNER-MATRIX-01`'s
`DELEGATE_TO_CANONICAL` decision for `rrf-fuse.ts` with actual behavioral evidence, not just static
reasoning. **No migration was performed** — per explicit instruction, this task is observation
only. `tsc` clean; 6/6 new tests pass (verified alongside the existing suite — one unrelated,
pre-existing failure was found in `cross-ranker.test.ts` during this same regression run,
BM25/topology score-normalization assertions with no relationship to identity/fusion code,
confirmed via `git log`/`git status` to predate this session; not touched, out of scope).

**Next**: migrating `service.ts`/`rrf-fuse.ts` to the canonical owner remains explicitly
un-started, pending further authorization. `RF7` remains `BLOCKED`.

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
