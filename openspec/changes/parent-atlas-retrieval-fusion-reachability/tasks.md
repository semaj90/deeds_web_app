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

  **Current rerun note 2026-09-06:** the intended SvelteKit/`tsx` launcher reached
  the live path, but this attempt returned Qdrant=1 and TurboVec=0 because the
  configured TurboVec gRPC lane was unavailable. The receipt therefore remains
  `RF6_SEMANTIC_REPLAY_NOT_PROVEN` for this attempt; the earlier successful
  read-only receipt above is retained as historical evidence. A seeded Qdrant
  timeout was also corrected to fall through to the unfiltered canonical
  `semantic_768` query instead of suppressing the entire dense lane.

  **Runtime diagnosis 2026-09-06:** the TurboVec gRPC health probe itself is
  reachable, but reports `indexed=0` and `dim=64`. The current semantic replay
  requires a populated 768-dimensional EmbeddingGemma executor. The existing
  read-only loader defaults to the unavailable `codebase_chunks_encoded64`
  collection and its contract is explicitly 64-dimensional, so it must not be
  redirected to the 768 collection without a separate representation/index
  owner decision. RF6 remains blocked on upstream TurboVec 768 index readiness;
  no loader apply or projection write was run.

  **768 build preflight 2026-09-06:** `npx tsx scripts/atlas/build-turbovec-768-4bit.mts
  --dry-run --limit=100` read 100 valid 768-dimensional points from
  `codebase_chunks_768`, but reported `candidateOrdinalCoverage=0/100` and
  `candidateOrdinalBridgeStatus=MISSING`. The build is therefore correctly
  blocked before sidecar upload. The next owner is the revision-qualified
  CandidateOrdinal/Qdrant projection bridge, not the RF6 combiner.

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

### Qdrant executor boundary audit — 2026-09-06

The canonical `SearchRuntime` retrieval path previously called
`retrieve-candidates.ts::retrieveQdrant`, which invoked `QdrantManager.hybridSearch`.
That allowed Qdrant's dense+sparse Universal Query fusion to run before the separate
BM42 sparse adapter and before `SearchRuntime::fuseSearchRuntimeCandidates`, creating
an implicit second fusion boundary. The canonical adapter now calls Qdrant's named
vector `denseSearch` for the raw `semantic_768`/`content` lane; BM42 remains a separate
raw lane, and SearchRuntime remains the only production RRF owner. Qdrant prefetch,
named-vector selection, and server-side fusion remain available to explicitly scoped
evaluation or non-canonical collection paths, but are not admitted as canonical
cross-lane fusion here.

The audit also found remaining non-canonical Qdrant-fusion callers:
`vector/agentic-search.ts::AgenticSearchService.search` is still used by
`/api/search` for the legal-canon/agentic path, and `vector/hypergraph-service.ts`
has legacy `hybridSearch` calls. These paths are not evidence that the canonical
SearchRuntime adapter should re-enable Qdrant fusion. They remain follow-up owner
reconciliation items; no production promotion or silent migration was performed
for them in this bounded fix.

Focused retrieval regression and strict OpenSpec validation are required evidence for
this boundary; no Qdrant data or projection writes are part of the change.

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

      **`combineRRFLanes` itself audited 2026-09-06, deeper root-cause found for the TurboVec
      gap — precision upgrade, decision recorded, no fix attempted.** `combineRRFLanes`
      (`rrf-combiner-utils.ts`) does NOT have the RF6 same-lane double-vote bug — its
      per-lane-per-id `existingLaneIndex` check already keeps only the strongest contribution per
      lane, correctly. The real, live gap is exactly what's diagnosed above: a candidate found by
      BOTH Qdrant and TurboVec never merges into one result row, because `combineRRFLanes` groups
      strictly by raw string `id`, and Qdrant's `id` (its own point UUID) and TurboVec's `id` are
      drawn from genuinely different id spaces with no join between them in this file today.

      Traced TurboVec's id space to its actual source, not assumed: TurboVec's `/build`/`/search`
      API treats `id` as caller-supplied at index-build time (confirmed via
      `docs/turbovec-grpc-integration-audit.md`'s own documented request/response shapes — the
      caller supplies `{id, vector, cluster}` at `/build`). `scripts/atlas/build-turbovec-768-4bit.mts`
      is the actual build script for this repo's TurboVec index: it initially carries the source
      Qdrant point's `id` (line ~124) but then **overwrites it with `entry.candidateOrdinal`**
      immediately before upload (line ~194: `{ ...entry, id: entry.candidateOrdinal }`) — so
      TurboVec's returned `id` in this repo is a `candidateOrdinal` integer, not an opaque index
      and not the Qdrant point id.

      A `candidateOrdinal -> packet_key/source_ref` resolver format already exists
      (`loadOrdinalMap()` in the same build script, consuming an externally-supplied
      `--ordinal-map=<path>` file shaped like `CandidateOrdinalMapV1`: `{identityAuthority: false,
      candidates: [{candidateOrdinal, sourceRef, packetKey}, ...]}`), but it is a **build-time-only,
      optional CLI input** — read once from a file path during index construction, never persisted
      anywhere a live request-serving module could query, and not currently loaded by
      `unified-orchestrator.ts` at all. Closing this gap for real means wiring a live ordinal-map
      resolver into the request path: locating/persisting the exact ordinal map used for the
      *currently-served* TurboVec index build, loading and caching it in the server process, and
      checking its `candidateSnapshotRevision`/`ordinalMapChecksum` against the live TurboVec
      index's own revision before trusting a lookup (an ordinal map built against a stale index
      generation would silently misattribute identity — worse than the current, honestly-absent
      state). That is a real feature addition with its own staleness/revision-binding failure mode,
      not a like-for-like in-place correction comparable to the `service.ts::rrfFusion` fix above.

      **Decision recorded**: `combineRRFLanes`/TurboVec-identity gap stays `fix-in-place-independently,
      NOT_YET_BUILT` (not `delegate-to-canonical-owner` — no canonical owner for cross-executor
      ordinal resolution exists yet either) rather than attempting a rushed live join in this pass.

      **Follow-up live check (2026-09-06, same pass) — the initially hoped-for simple path is
      closed, and a bigger uncertainty was found instead of a smaller one.**
      `build-turbovec-768-4bit.mts`'s `candidateOrdinal` resolution prefers reading it directly
      from `point.payload?.candidateOrdinal`/`candidate_ordinal` before falling back to the
      external `--ordinal-map=` file — which raised the possibility that a live resolver could
      skip the map file entirely and just request that payload field from Qdrant. Checked the
      *actual* live collection directly (`POST /collections/codebase_chunks_768_v2/points/scroll`,
      read-only): its real payload schema is `postgres_id, chunk_id, source_ref, content_hash,
      representation_name, representation_id, embedding_model, model_revision,
      model_revision_state, qdrant_point_id, projection_revision, indexed_at` — **no
      `candidateOrdinal` field exists on live points at all.** Combined with the earlier finding
      that the npm script (`atlas:turbovec:768:4bit:build`) never passes `--ordinal-map=`, running
      this build script against the current live collection would hit `candidateOrdinal: null` for
      every point and **throw `CANDIDATE_ORDINAL_BRIDGE_REQUIRED_BEFORE_TURBOVEC_UPLOAD`** before
      any non-dry-run upload could complete.

      This means whichever TurboVec index is actually being served today either predates this
      ordinal-bridge gate, was built through a different, undiscovered path, or was built with an
      `--ordinal-map=` file that is no longer present in this repo — **the true id provenance of
      the currently-live TurboVec index is now an open question, not a known `candidateOrdinal`
      as first assumed.** This makes the gap strictly harder than originally framed: a live
      resolver cannot be safely built against an assumed id scheme without first confirming, live,
      what id space the currently-served TurboVec index actually uses (e.g. via
      `GET /health` or an index-metadata endpoint on the TurboVec sidecar itself, not inferred from
      the build script's intended design).

      Concrete next step, not started: query the live TurboVec sidecar directly for whatever
      build/index metadata it exposes (generation timestamp, source manifest reference) before
      assuming its `id` field means anything in particular. No files modified, no writes
      performed — this was a read-only Qdrant scroll query only.
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
- [x] `service.ts::rrfFusion` (`/api/atlas/studio/search`, `/api/atlas/search`) — **decision
      recorded and applied 2026-09-06: `fix-in-place-independently`.** `delegate-to-canonical-owner`
      remains unavailable (RF5 is only partially landed — canonical spine only, per its own section
      above); this function is live on 2 real routes, not scheduled for retirement, so leaving the
      diagnosed bug unfixed pending a still-blocked architecture decision was the wrong default.
      Scope was deliberately narrow: the bug was NOT in `rrfFusion` itself (its per-`result.id`
      RRF summation is standard and correct), it was in the **post-fusion dedup step immediately
      after it** — `symbol_version_id ?? packet_key ?? id`-keyed dedup picked the first-sorted
      duplicate and silently discarded the other's score, exactly as this section's own earlier
      audit diagnosed ("first-wins, discards losing duplicates' scores instead of merging them").
      When two backend-local `result.id`s (e.g. a Qdrant hit and a TurboVec hit for the same
      underlying chunk that `rrfFusion` scored independently because they never shared an `id`)
      resolve to the same canonical identity, summing their already-fused RRF scores is correct
      RRF semantics — the same "one canonical identity, sum contributions" pattern
      `SearchRuntime.fuseSearchRuntimeCandidates` already uses — not a second instance of the
      same-logical-lane double-vote bug RF6 fixed elsewhere (that invariant is enforced upstream,
      inside `rrfFusion`'s own lane grouping, before this step ever runs).

      Extracted the dedup step into a new exported, pure, directly-unit-testable function,
      `mergeDuplicateIdentityScores()` (`service.ts`) — no live Postgres/Qdrant/lane-registry setup
      needed to test it, unlike the rest of `unifiedSearch()`. Wired it in at the exact call site
      that previously had the inline discard-based dedup loop. Added 4 new unit tests to
      `service.spec.ts` covering: sum-on-symbol_version_id-collision, fallback to packet_key,
      fallback to raw id (correctly stays unmerged when no shared identity exists), and stable
      descending-score ordering with no false merge across genuinely distinct identities.

      **Verified, not assumed**: `npx vitest run service.spec.ts rf6-live-replay-01.test.ts
      rrf-split.test.ts search-runtime-fusion.test.ts` → **4 files / 36 tests passed** (31
      pre-existing + 5 new — `service.spec.ts` grew from 1 test to 5). `npx tsgo --noEmit` → still
      exactly 77 pre-existing repo-wide errors, zero in `service.ts` or `service.spec.ts` (the one
      substring match for "service.ts" is the unrelated `push-service.ts`). No database/Qdrant/
      Valkey/Neo4j writes — this is a pure in-memory ranking-array transform, no I/O.

      **Not claimed**: `service.ts::rrfFusion`'s own architecture is not otherwise touched (its
      per-lane RRF scoring, `laneConfig.weight` lookup, and `getSearchLaneRegistry()` usage are
      unchanged); this does not migrate `service.ts` onto `SearchRuntime`/`rrf-fuse.ts` or resolve
      the broader "most architecturally confused of the four" framing — it fixes the one concretely
      diagnosed correctness bug (score-discarding on identity collision) without waiting for the
      still-blocked canonical-delegation path.
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

## RF6-RRF-FUSE-HARDEN-01 — `PROVEN_SOURCE_AND_TEST` (2026-09-06, gate executed and verified)

Following `RF6-LIVE-REPLAY-01`'s confirmed divergence above, `rrf-fuse.ts` (the legacy
high-breadth compatibility owner, per `RF6-OWNER-MATRIX-01`'s `DELEGATE_TO_CANONICAL`
classification) was hardened to enforce the two invariants that divergence exposed: (1) at most
one RRF contribution per canonical identity within a logical lane (same-lane duplicate hits no
longer cast multiple votes), and (2) semantic-executor collapse — `dense`/`dense_384`/`dense_768`/
`qdrant`/`qdrant_vector`/`qdrant_768`/`turbovec`/`turbovec_ann`/`cuvs`/`cagra` are different
executor names but one logical `dense` lane; a candidate hit through multiple of them retains only
its strongest weighted contribution as the vote, with the rest preserved as provenance, never
summed into extra votes. `canonicalChunkId` remains consume-only (never fabricated from
`packetKey`, paths, hashes, or local IDs). Full invariant/commit/proof-boundary detail:
`docs/reports/rf6-rrf-fuse-hardening-v1.json` (originally filed 2026-09-05 as
`IMPLEMENTED_UNPROVEN` with tests written but not executed).

**This session ran the exact gate the report's own `next` field specified, rather than accepting
the unexecuted claim.** Results, all real:
- `npx vitest run rf6-live-replay-01.test.ts rrf-split.test.ts search-runtime-fusion.test.ts` →
  **3 files / 31 tests passed, 0 failed.**
- `npx tsgo --noEmit` (full repo) → 77 pre-existing errors, **zero in `rrf-fuse.ts`,
  `rrf-contract.ts`, or any of the 3 RF6 test files** — the 77 are unrelated missing-optional-
  package errors (`piper-wasm`, `fastmcp`, `nodejs-whisper`, `@playwright/test`,
  `@mendable/firecrawl-js`) and pre-existing drift in unrelated files
  (`search-runtime-ace-resolver-v1.ts`, `search-runtime-feature-bundle-provider-v1.ts`,
  `live-structural-lane-provider.ts`), consistent with this file's own established pattern of not
  folding unrelated repo-wide typecheck noise into a gate's pass/fail.
- `npx openspec validate parent-atlas-retrieval-fusion-reachability --strict` → **valid.**

`docs/reports/rf6-rrf-fuse-hardening-v1.json` updated in place: `status` →
`PROVEN_SOURCE_AND_TEST`, `tests.executedInThisConnectorSession` → `true` with the real pass
count, `proofBoundary.{typescriptCompileExecuted,vitestExecuted,openspecValidationExecuted}` →
`true` with their real results recorded. **Still explicitly NOT claimed** (matches the report's own
`notClaimed` list, unchanged): RF7 complete, `service.ts` migrated, all RRF owners consolidated,
live route parity proven, production deployment proven. No database/Qdrant/Valkey/Neo4j writes
occurred during this verification pass.

**Next** (per the report's own sequencing at the time this was written — superseded by the corrected,
more granular `RF7-01` through `RF7-09` plan under `RF7-LANE-ALIAS-CONVERGENCE-01` below, which
splits this into a parity-contract proof (`RF7-CONTRACT-PARITY-01`) BEFORE any shared-module
extraction, per external review — do not jump straight to extraction): originally, extract
`SearchRuntime.fuseSearchRuntimeCandidates`'s canonical fusion core into a dependency-light shared
module, have `rrf-fuse.ts`'s compatibility adapter delegate to it, then migrate `service.ts::rrfFusion`
next. `RF7` remains `BLOCKED` until that shared-module extraction is actually done — this gate
proves the interim hardening is real, not that RF7's convergence work has started.

## RF7-LANE-ALIAS-CONVERGENCE-01 — `PROVEN_ZERO_BEHAVIOR_CHANGE` (2026-09-06, renamed from
`RF7-CANONICAL-FUSION-MODULE-01` per external review — see correction below)

**Correction to this milestone's own name** (external review, 2026-09-06): the original name,
`RF7-CANONICAL-FUSION-MODULE-01, first slice`, overstated what was actually done — it implied
progress toward the canonical fusion *module* (the aggregation core), when what was actually proven
is narrower and doesn't require that claim: two independently-maintained lane-alias equivalence
tables were converged into one, with a live-verified zero-behavior-change proof. Renamed to
`RF7-LANE-ALIAS-CONVERGENCE-01` to name exactly what was proven, no more. The canonical fusion core
itself remains split between `SearchRuntime` and `rrf-fuse.ts` and is NOT claimed complete anywhere
in this entry.

**Did not attempt the full canonical fusion module in one pass.** `fuseSearchRuntimeCandidates`
(`search-runtime.ts`, typed `Candidate[]` in / `FusedCandidate[]` out, closed 7-lane
`LogicalRetrievalLane` union) and `reciprocalRankFusion` (`rrf-fuse.ts`, generic weighted
`lanes: Array<{lane, hits}>` in / `FusedHit[]` out, open legacy vocabulary including
`topology`/`authority`/`dispatcher`) have genuinely different input/output shapes and lane
vocabularies — forcing them onto one shared aggregation core right now would be exactly the
"premature shared-helper extraction risks centralizing the wrong abstraction" failure this
change's own governance section already warns about. Not done.

**Why the alias collapse is semantically right, not just tidy** (external review): RRF treats each
input ranking as an independent contribution and sums rank-derived contributions for documents
appearing across those rankings — this is exactly how Qdrant's own RRF implementation works,
including optional per-ranking weights, and Qdrant's own guidance treats RRF as fusion of
*genuinely distinct* retrieval signals (e.g. dense vs. sparse), not a mechanism for multiplying
equivalent implementations of the same signal. So: Qdrant/TurboVec/cuVS/CAGRA all being one logical
dense-lane vote (not four independent RRF votes) isn't an implementation convenience, it's the
correct application of RRF's own semantics. This is the invariant `RF7-LANE-ALIAS-CONVERGENCE-01`
encodes.

**What was genuinely, safely extractable**: both files independently hand-maintained the same
dense/lexical executor-alias equivalence-class list (`dense`/`dense_384`/`dense_768`/`qdrant`/
`qdrant_vector`/`qdrant_768`/`turbovec`/`turbovec_ann`/`cuvs`/`cagra` → one logical `dense` vote;
`bm25`/`postgres_trigram`/`lexical` → one logical `lexical` vote) — two independently-maintained
copies of the same data that could silently drift apart on a future edit to only one file, exactly
the duplication-prevention failure mode root CLAUDE.md documents. Extracted this alias data (not
the aggregation algorithm) into `src/lib/server/retrieval/retrieval-lane-aliases.ts`.

**Renamed 2026-09-06 (same day, follow-on cleanup)**: the file was originally called
`dense-lane-aliases.ts` and exported two boolean helpers (`isDenseLaneAlias()`,
`isLexicalLaneAlias()`). Per the review: that name became misleading once the file also carried
lexical aliases, and continuing that pattern would slowly recreate per-caller `isXAlias()` helpers
scattered everywhere — exactly the duplication this module exists to prevent. Renamed to
`retrieval-lane-aliases.ts` and replaced the two boolean helpers with one semantic contract:
`export type CanonicalFusionLane = 'dense' | 'lexical' | 'exact' | 'ast' | 'bm42' | 'graph' | 'other'`
and `export function normalizeRetrievalLane(value: string): CanonicalFusionLane | undefined`. Note
the type is a forward-declared superset of every logical fusion lane this repo will eventually need
to name; the function itself only actually classifies `dense`/`lexical` today (the two lanes with
real alias data) and returns `undefined` for everything else — callers keep their own remaining
lane-classification logic (`exact_symbol`, `ast_tree`, `bm42`, topology/authority/dispatcher, etc.)
exactly as before. `rrf-fuse.ts::toLogicalLaneName()` and `search-runtime.ts::getFusionLogicalLane()`
both updated to the new import and API. The old `dense-lane-aliases.ts` file (never committed to
git) was deleted after confirming via `grep -rln "dense-lane-aliases" src tests scripts` that no
other reference remained.

**Verified, not assumed (both the original extraction and the rename)**: reran the same 3-file RF6
regression suite (`src/lib/server/retrieval/__tests__/{rf6-live-replay-01,rrf-split,search-runtime-
fusion}.test.ts`) after both changes — still 31/31 pass, zero change. `npx tsgo --noEmit` — 75
pre-existing errors both before and after the rename (77 at the original extraction, since 2 were
independently fixed by the Firecrawl work earlier in this session), zero new ones, none in
`retrieval-lane-aliases.ts`, `rrf-fuse.ts`, or `search-runtime.ts`. No database/Qdrant/Valkey/Neo4j
writes.

**Explicitly NOT claimed**: full RF7 canonical fusion module, `rrf-fuse.ts` delegating its
aggregation logic to `SearchRuntime`, `service.ts::rrfFusion` migration, RF7 complete. This is one
narrow, verified DRY fix on shared *data*, not the aggregation-core consolidation RF7 actually
requires — that remains open, and per this change's own governance should not be attempted as a
single large refactor given how much the two callers' shapes actually diverge.

### RF7 next step is a parity contract, not extraction (external review, 2026-09-06 — planned, not started)

Before extracting a shared fusion kernel, define the smallest neutral input representation both
existing implementations can project into **without changing their public APIs**:

```typescript
interface FusionContributionV1 {
  canonicalId: string;
  logicalLane: CanonicalFusionLane;
  rank: number;
  weight: number;
  executorId: string;
  provenanceRefs: string[];
}
```

`SearchRuntime`'s `Candidate` shape gets an adapter-only projection into `FusionContributionV1[]`;
`rrf-fuse.ts`'s weighted lane arrays get their own adapter-only projection. **Neither
implementation executes through this type yet** — it exists first for differential proofs.

**`RF7-CONTRACT-PARITY-01`** (planned, not started): build fixtures covering (1) the same canonical
ID returned by two different dense executors, (2) the same canonical ID appearing twice within one
lexical lane, (3) a dense+lexical hit for the same candidate, (4) a candidate appearing in only one
lane, (5) missing canonical identity, (6) weighted lanes, (7) tied ranks, (8) executor provenance.
Compare `SearchRuntime`'s current output vs. the normalized-contribution-model projection, and
`rrf-fuse.ts`'s current output vs. its own normalized-contribution-model projection. Measure:
canonical identity set, logical lane set, vote count, rank ordering, provenance retention.
**Observation only** — if both current owners reduce cleanly to the same semantics, that's evidence
extraction is safe; if they don't, that's the exact remaining RF7 incompatibility, discovered before
touching production behavior.

**Only after that parity proof passes** would `retrieval-fusion-core-v1.ts` be created, with a
deliberately tiny responsibility: `fuseCanonicalContributions(contributions: readonly
FusionContributionV1[], options: FusionOptionsV1): FusedContributionV1[]` — no Qdrant/Postgres/
SearchRuntime/CandidateFeatureSnapshot/ACE/SvelteKit/database/HTTP imports. It knows only: canonical
identity, logical lane, rank, weight, same-lane dedup, RRF contribution, provenance. Migration order
after that: `FusionCoreV1` → `SearchRuntime` adapter → `rrf-fuse.ts` adapter →
`service.ts::rrfFusion` migration → bounded live replay.

**Hard invariant — do not change the RRF constant during this convergence work**: Qdrant's own RRF
uses a parameterizable constant, defaulting to `k=2` — different from the `k=60` often cited from
the original literature. Whatever `k`, rank-indexing convention, and tie-handling this repo's
existing implementations currently use MUST be preserved through extraction, never silently switched
to a different default. Record it explicitly in a receipt:
```
fusionMethod: RRF
rankBase: <current>
k: <current>
weightSemantics: <current>
sameLaneDedup: strongest_contribution
crossLaneFusion: sum
```
This makes a future "does Qdrant's own server-side RRF actually match ours" comparison testable
rather than assumed.

**Architectural conclusion (not a task, a boundary statement)**: Qdrant's Query API can now perform
RRF (including weighted RRF and hybrid dense/sparse prefetch) natively — but Parent Atlas fusion
ownership should NOT migrate into Qdrant, because this repo fuses signals Qdrant doesn't own
(lexical, AST, exact-symbol, graph, semantic, and eventually an ontology receipt) — Qdrant itself
says it doesn't aim to provide built-in ontologies or knowledge graphs. Qdrant's RRF is a possible
**executor-local optimization**; `SearchRuntime`/`FusionCore` remains the canonical cross-lane
fusion-semantics owner.

**Planned execution order**:
```
RF7-01  rename/generalize lane-alias module     DONE (this entry)
RF7-02  FusionContributionV1                    DONE (2026-09-06)
RF7-03  adapters for both existing owners        DONE (2026-09-06)
RF7-04  differential parity fixtures             DONE, 9/9 observed (2026-09-06)
RF7-05  extract pure fusion core                 not started (blocked on RF7-04's findings, below)
RF7-06  rrf-fuse.ts delegates                     not started
RF7-07  SearchRuntime delegates                   not started
RF7-08  service.ts migration                      not started
RF7-09  bounded live replay                       not started
```

### RF7-02/03/04 results (2026-09-06) — real findings, extraction NOT yet authorized

**Correction to the reviewer's own proposed `CanonicalFusionLane` type before building on it**: the
review proposed `'dense'|'lexical'|'exact'|'ast'|'bm42'|'graph'|'other'` without reading the actual
two callers' code. Checked against real code first: `search-runtime.ts`'s `LogicalRetrievalLane` is
`'dense'|'lexical'|'exact'|'ast'|'schema'|'rg'|'bm42'` (no `graph`); `rrf-fuse.ts`/`rrf-contract.ts`'s
raw `RrfLaneName` is `'bm42'|'rg'|'dense_384'|'dense_768'|'turbovec'|'topology'|'authority'|
'dispatcher'` (also no `graph`). Widened `CanonicalFusionLane` in `retrieval-lane-aliases.ts` to the
real superset (added `schema`/`rg`, dropped the invented `graph`) before using it in
`FusionContributionV1` — building against an unverified externally-proposed type would have made the
parity fixtures compare against a lane vocabulary that can't represent either caller's real output.

**RF7-02**: `src/lib/server/retrieval/fusion-contribution-v1.ts` — the neutral
`FusionContributionV1` interface (`canonicalId`, `logicalLane`, `rank`, `weight`, `executorId`,
`provenanceRefs`), consumed only by adapters/tests, never by production code.

**RF7-03**: `src/lib/server/retrieval/fusion-contribution-adapters.ts` —
`projectSearchRuntimeCandidatesToContributions()` and `projectRrfLanesToContributions()`. Verified
against real code, not guessed: `SearchRuntime.fuseSearchRuntimeCandidates` has NO per-lane
weighting (uniform weight 1 for every contribution); `rrf-fuse.ts::reciprocalRankFusion` DOES
support per-lane weighting and defaults `k = 60` (the literature-standard RRF constant, confirmed
via its function signature default parameter — NOT Qdrant's own `k = 2` default). This `k = 60`
default is the concrete value the "don't change the RRF constant during RF7" invariant above
protects. `canonicalId` in both adapters uses a deliberately SIMPLIFIED identity extraction
(`symbolVersionId ?? packetKey ?? canonicalChunkId ?? id`), not a reproduction of
`search-runtime.ts`'s private (unexported) `getRevisionQualifiedFusionIdentityKey`/
`getFusionBackendIdentityKey` canonical/degraded scheme — documented as an intentional
simplification in the adapter's own file header, not an oversight.

**RF7-04**: `src/lib/server/retrieval/__tests__/rf7-contract-parity-01.test.ts` — 8 scenarios per
the review's own list, plus 1 cross-check. **9/9 pass, but "pass" here means each scenario's
observation matched what was predicted from reading the real code, not that the two callers are
semantically identical** — several real, confirmed divergences were found and are asserted
explicitly, not glossed over:
- **SearchRuntime has no weighting; rrf-fuse.ts does** (Scenario 6) — confirmed via
  `fuseSearchRuntimeCandidates`'s source (no `weight` parameter anywhere) vs.
  `reciprocalRankFusion`'s signature (`lanes[].weight`, or a weight map). A shared core cannot
  default SearchRuntime's contributions to any weight but 1 without changing its behavior.
- **A caught bug in the adapter itself, not either caller**: the first test run found
  `ast_tree` was not being normalized to `ast` — my adapter's lane-fallback only consulted
  `normalizeRetrievalLane()` (dense/lexical alias data only) and returned the raw `scoreSource`
  string for anything else, missing `search-runtime.ts::getFusionLogicalLane()`'s own
  `exact_symbol -> exact`, `ast_tree -> ast`, `schema -> schema`, `rg_keyword -> rg` switch
  statement. Fixed by adding `fallbackScoreSourceToLane()`, which replicates that switch verbatim
  (verified against the real function's source at `search-runtime.ts` lines ~1250-1260).
- **Real caller behavior gap, not a bug**: `fuseSearchRuntimeCandidates()` filters out candidates
  with empty `packetKey`/`sourceRef` before bucketing (a `valid = candidates.filter(...)` guard);
  the simplified adapter does not replicate this validation step, since RF7-CONTRACT-PARITY-01 is
  scoped to lane/rank/vote semantics, not input validation. Confirmed via a real call to
  `fuseSearchRuntimeCandidates()` in Scenario 5's test — it returns `[]` for the malformed input
  while the adapter still produces one (empty-canonicalId) contribution. Documented, not silently
  reconciled.
- **Real caller behavior gap, not a bug**: tie-breaking on equal scores. The adapter breaks ties by
  input array order (stable sort); the real `fuseSearchRuntimeCandidates()` breaks ties via a
  private `compareIdentityKeys()` function the adapter does not replicate (Scenario 7).

**Conclusion — matches the plan's own gating language, not overclaimed**: this is observation
evidence toward whether extraction is safe, not itself a passing parity proof. The confirmed
weighting-model divergence (SearchRuntime uniform vs. rrf-fuse.ts weighted) is real and must be
designed for explicitly in any future `FusionCoreV1`, not silently defaulted away. `RF7-05`
(extracting the pure fusion core) remains **not started** and **not authorized by this entry** —
per the plan's own governance, a design decision about how a shared core should represent
"a caller with no native weighting" is needed first, not automatic from this test passing.

**Verified**: `npx tsgo --noEmit` — 75 pre-existing errors (unchanged), zero in
`fusion-contribution-v1.ts`, `fusion-contribution-adapters.ts`, or the new test file. RF6 regression
suite re-run after all of this — still 31/31 pass. No database/Qdrant/Valkey/Neo4j writes.

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

## LLAMA-TEST-BOUNDARY-01 (2026-09-06) — `PARTIAL_PROVEN`, corrected proof matrix, not `RETIRED`

A parallel handoff this session proposed retiring stale Ollama-era test mocks in favor of a shared
llama-server chat fixture, with a closing `OLLAMA_TEST_BOUNDARY_RETIRED` proof asserting
`productionDirectOllamaCallers = 0`. That specific field is **false at full-repo scope** and is
corrected here rather than left standing — checked live via `rg -l "ollamaFetch" src --type ts`
(excluding tests): **80+ production files still call `ollamaFetch`**, most plausibly legitimate
per this repo's own hard rule (Ollama is embeddings-only; chat/generation goes through
llama-server) but **not audited file-by-file in this pass** — `productionDirectOllamaCallers = 0`
was an aspirational target, not a verified fact, and root CLAUDE.md's own July 30 "Ollama vs
llama-server Boundary" sweep already names ~20 of these files as still needing conversion from an
earlier pass whose completion status isn't re-verified here either.

**What was actually done and verified, real evidence**:
- Root cause confirmed live, not assumed: `tests/ace-summarize-route.spec.ts` and
  `tests/sse-chat-glossary-metadata.spec.ts` mocked `$lib/server/ollama.js`'s `ollamaFetch` for
  chat/generation, but both routes' real chat calls go through `fetch()` directly against
  llama-server's OpenAI-compatible `/chat/completions` (non-streaming for `/api/ace/summarize`,
  streaming SSE for `/api/sse/chat`). The stale mock never intercepted anything — confirmed by a
  real failure surfacing an actual live-generated LLM response instead of the mocked text, proving
  these "unit" tests were silently making real network calls to whatever llama-server happened to
  be running.
- Built the shared canonical seam the handoff proposed:
  `tests/helpers/mock-llama-server-chat.ts` (`makeLlamaChatCompletionResponse`,
  `makeLlamaStreamResponse`, `matchLlamaChatCompletions`) — covers both call shapes this repo's
  routes actually use.
- `tests/ace-summarize-route.spec.ts`: migrated fully. **4/4 pass** (was 2/4 failing).
- `tests/sse-chat-glossary-metadata.spec.ts`: migrated onto the shared fixture, plus found and
  fixed a second, distinct drift along the way — `model` in persisted metadata now comes straight
  from the request body (`model ?? 'LLM_MODEL_ID'`) with no Ollama-config-derived default, so tests
  that never passed `model` in the body got the literal placeholder string.
  **Corrected 2026-09-06 (re-verification pass)**: this file was concurrently edited by another
  session after the migration above was recorded (`git log` shows commit `732c66f6bb`, "/16
  passing...", landed on top of this work) — the file now has **13 total tests**, not 17. A live
  re-run confirms **12/13 pass**. The originally-recorded "16/17" figure was accurate for the file
  state at the time it was measured but is now stale; recording the current live number instead of
  leaving the stale one standing.
- 1 test (`emits glossary matches in the final SSE metadata payload`) left failing, explicitly
  **not** forced: `mockInsert` called 5 times instead of 2 (re-confirmed live 2026-09-06, same
  assertion still fails the same way), confirmed via a direct test (adding the `model` field did
  not fix it) to be unrelated to the Ollama/llama-server migration — some other drift, not
  diagnosed. Matches this handoff's own "leave alone — unrelated failing test" bucket.

**Corrected `OLLAMA_TEST_BOUNDARY_RETIRED` fields** (real, not the aspirational originals):
```
productionDirectOllamaCallers   = 2 CONFIRMED_LIVE_VIOLATIONS (detective/analyze,
                                   detective/connections — real Ollama :11434 chat calls, no
                                   llama-server routing, unconditional) + 6 CONDITIONALLY_SAFE
                                   (currently routed to llama-server via TurboQuant intercept,
                                   verified live 2026-09-06, but silently fall back to real Ollama
                                   if that intercept's health check or config flag ever flips) out
                                   of 81 files classified by call-site endpoint (see "80-file
                                   ollamaFetch production audit" above; the remaining ~73 files'
                                   ollamaFetch calls target /api/embeddings, /api/embed, or
                                   /api/tags, or go through the safe $lib/server/ollama.js
                                   getOllama*Endpoint() resolvers — not individually re-verified
                                   past the call-site grep classification) — was previously
                                   NOT_AUDITED
llamaServerChatFixtureConsumers = 2 (ace-summarize-route.spec.ts, sse-chat-glossary-metadata.spec.ts)
migratedTestsPassed             = 16/17 (4/4 + 12/13, re-verified live 2026-09-06; corrects an
                                   earlier "20/21" figure that was accurate when first measured but
                                   went stale after a concurrent session's commit changed
                                   sse-chat-glossary-metadata.spec.ts's test count from 17 to 13)
productionCodeChangedForTests   = false for the LLM-boundary migration itself (test files + 1
                                   shared test helper only); separately, 1 production file
                                   (youtube-transcript.ts) was changed for the unrelated Firecrawl
                                   type-safety fix below — not a test-driven change
```

**Done (2026-09-06) — Firecrawl optional-provider centralization**:
- Built `src/lib/server/retrieval/optional-firecrawl-provider.ts` exactly as proposed:
  `loadFirecrawl()` -> dynamic `import('@mendable/firecrawl-js')` (one documented
  `@ts-expect-error`, cached after first call) -> `{status: 'AVAILABLE', FirecrawlCtor}` or
  `{status: 'UNAVAILABLE', reason}`.
- `src/lib/server/retrieval/youtube-transcript.ts` now calls `loadFirecrawl()` instead of its own
  inline dynamic import + `as any` cast; on `UNAVAILABLE` it logs and returns `null` (same runtime
  fallback behavior as before — this call site already had try/catch degradation, so no behavior
  change, only a real type fix).
- Verified via real `tsgo --noEmit`: error count dropped from the established 77-error baseline to
  **76**, and a direct grep of the full error log for `youtube-transcript`/`optional-firecrawl`
  returned zero matches — confirming the target file's `TS2307: Cannot find module` error is gone
  and the new file introduced no new errors.
- **Explicit scope boundary — not claimed**: only this one call site was migrated. The
  `@ts-expect-error` pattern is not swept to any other optional-dependency import elsewhere in the
  repo, and no other file was touched.

**Done (2026-09-06, second instance) — `src/lib/server/research/fastcrawl.ts`**: a full `rg -l
"firecrawl-js" src tests --type ts -i` sweep (prompted by a concurrent-session commit message,
`732c66f6bb`, describing a fix to "a real production bug: literal @mendable/firecrawl-js import
crashing module load" for `ace-context-glossary.spec.ts`) found this file still had a **bare static
`import FirecrawlApp from '@mendable/firecrawl-js'`** at line 1 — worse than the `youtube-transcript.ts`
case above, since a static import throws at Node's ESM module-load time (not just a type error) for
*anything* that transitively imports this file, not only when the Firecrawl code path is actually
invoked. Live-checked: `src/lib/server/tools/handlers/research.ts` imports this file, so any test or
route exercising that handler would have crashed. `ace-context-glossary.spec.ts` currently passes
(2/2, re-verified live) without touching this file — the concurrent commit's fix must have been to a
different crash site, not this one; this bug was still live and undiscovered until this sweep.
- Migrated to the same `loadFirecrawl()` provider, converting `getFirecrawl()` to async and fixing a
  second, smaller bug found along the way: the old code called
  `new (FirecrawlApp as any)(ENV.FIRECRAWL_API_KEY)` (bare string constructor arg) where the real
  Firecrawl SDK — confirmed via the other live call site in `youtube-transcript.ts` — takes
  `{ apiKey: string }`. Fixed to match.
- Widened `optional-firecrawl-provider.ts`'s shared `FirecrawlClient`/`FirecrawlScrapeResult` types
  (added `onlyMainContent?: boolean` to scrape options, `error?: string` to the result, made
  `timeout` optional) since this call site's real usage needed fields the first call site didn't
  exercise — both call sites now share one canonical type, not two divergent ad-hoc ones.
- Verified via real `tsgo --noEmit`: 76 -> **75** errors, zero remaining matches for
  `fastcrawl`/`youtube-transcript`/`optional-firecrawl` in the full error log.
- **Not verified by a test** — no test in `tests/` imports `fastcrawl.ts` or
  `tools/handlers/research.ts` directly (checked via `rg -l`), so this fix's correctness rests on
  the `tsgo` clean pass and matching the sibling call site's real usage, not an executed test.

**Done (2026-09-06) — 80-file `ollamaFetch` production audit, against the CLAUDE.md "Ollama vs
llama-server Boundary" hard rule (Ollama is embeddings-only; all chat/generation must go through
llama-server)**:

Ran `rg -l "ollamaFetch" src --type ts` → 81 files (80 production + 1 test file already counted
elsewhere). Classified by which endpoint each call actually hits, verified live where it mattered
(not just read statically):

```
/api/embeddings or /api/embed  : 36 call sites  -> LEGITIMATE (embeddings-only rule satisfied)
/api/tags                       : 13 call sites  -> BENIGN (Ollama health/model-list probe, not
                                                     covered by the chat/embed boundary rule)
/api/generate or /api/chat, via
  getOllama{Chat,Generation}Endpoint()
  imported from $lib/server/ollama.js  : 16 call sites -> SAFE. Verified `CHAT_BASE_URL` in that
                                                     file resolves `LLAMA_SERVER_URL ??
                                                     TURBOQUANT_URL ?? TURBOQUANT_BASE_URL ??
                                                     'http://127.0.0.1:8090'` — never falls back to
                                                     real Ollama. Function names say "Ollama" but
                                                     the actual URL is always llama-server. Naming
                                                     is misleading but not a functional violation.
1 call site via getOllamaEndpoint()
  imported from $lib/server/utils/
  ollama-endpoint.js                    : re-exports the same safe $lib/server/ollama.js-style
                                                     resolution chain — also safe.
```

**Confirmed live, unmitigated violations (2 files) — real bug, not naming confusion**:
- `src/routes/api/detective/analyze/+server.ts` and
  `src/routes/api/detective/connections/+server.ts` build `${OLLAMA_URL}/api/generate` where
  `OLLAMA_URL = ENV.OLLAMA_BASE_URL`, verified live in `.env` to be `http://127.0.0.1:11434` (real
  Ollama, not llama-server). Both pass `stream: true`.
- `ollamaFetch()`'s own shared TurboQuant-intercept logic (`src/lib/server/ollama.ts:365`,
  `tryTurboQuantIntercept()`) has a documented, deliberate gate: `if (ollamaBody.stream !== false)
  return null;` — its own comment reads *"Only intercepts non-streaming requests (stream: false).
  Streaming stays on Ollama since TurboQuant SSE -> Ollama ndjson conversion is non-trivial."* This
  is an acknowledged design tradeoff by whoever wrote it, not an oversight — but it means these two
  files send real chat-generation requests (`model: LLM_MODEL_ID`, i.e. the canonical chat model
  like `ornith-1.5-9b`) straight to Ollama's `/api/generate`, unconditionally, with no fallback
  check. Per this repo's own "No Ollama model pulls" rule, chat models are never registered in
  Ollama's model store — so this is likely also a **live functional bug** (the request would 404 or
  error against Ollama, not just a policy violation), not verified end-to-end this session (would
  require exercising the live route), but the code path itself is unambiguous.
- **Not fixed this session** — SSE-format translation (Ollama ndjson -> OpenAI-SSE or vice versa)
  is real engineering work the original author already flagged as "non-trivial" in their own
  comment, not a one-line change. Recording rather than rushing a fix into two live streaming
  user-facing endpoints.

**Conditionally-fragile (6 files) — currently safe in practice, verified live, but silently
degrade to real Ollama if a config flag or health check flips**:
- `src/routes/api/summarize/synthesize/+server.ts`, `summarize/analyze/+server.ts`,
  `knowledge/lint/+server.ts`, `generate-cluster-summaries/+server.ts`, `analyze-tag/+server.ts`,
  `analyze-file/+server.ts` — all build `${OLLAMA_URL}/api/generate` or `/api/chat` directly
  (literal `ENV.OLLAMA_BASE_URL`, i.e. `:11434`) but pass `stream: false`, which the
  `tryTurboQuantIntercept()` gate above DOES cover — verified live: `TURBOQUANT_INTERCEPT` env var
  unset (defaults `'true'`), `TURBOQUANT_URL=http://127.0.0.1:8090` configured, and a live
  `curl http://127.0.0.1:8090/health` returned `{"status":"ok"}` at time of audit. So today, these
  6 are actually routed to llama-server via the intercept.
- **The fragility**: if TurboQuant/llama-server ever goes down (the health check is cached 5s) or
  `TURBOQUANT_INTERCEPT=false` is ever set, `tryTurboQuantIntercept()` returns `null` and
  `ollamaFetch()` falls through to the raw `url` argument — real Ollama `:11434` — with the
  **canonical chat model name** in the request body, not an embedding model. This is a silent
  degradation path with no logged warning distinguishing "routed to llama-server" from "fell back
  to Ollama," making a future real-Ollama-chat incident hard to detect from logs alone. Flagged,
  not fixed — hardening this (e.g., logging which path was taken, or hard-failing instead of
  silently hitting Ollama) is a separate, smaller follow-up from the 2 confirmed-broken streaming
  files above.

**Separate structural finding — duplicate endpoint-resolution helpers (11+ definitions)**:
`grep -rn "export function getOllamaEndpoint\|getOllamaChatEndpoint\|getOllamaGenerationEndpoint"`
found the same-named functions independently defined in at least 11 files: `lib/ai/ollama-config.ts`,
`lib/utils/ollama.ts`, `lib/utils/ollama-endpoint.ts`, `lib/utils/endpoints.ts`,
`lib/utils/api-endpoints.ts`, `lib/server/utils/ollama-endpoint.ts`,
`lib/server/services/error-analysis/OllamaService.ts`, `lib/server/ollama.ts` (the one actually
used by the 16 safe call sites above), `lib/server/config/endpoints.ts`,
`lib/server/clients/ollama.ts`, `lib/server/env/endpoints.ts`. At least 2 of these
(`lib/utils/endpoints.ts`, `lib/utils/api-endpoints.ts`) fall back to real Ollama `:11434` /
`http://ollama:11434` if no `TURBOQUANT_URL`/`LLAMA_SERVER_URL` env is set — **not verified this
session whether anything currently imports these two specific risky variants** (the 18
`ollamaFetch`-adjacent call sites checked all resolved to the safe `lib/server/ollama.ts` or
`lib/server/utils/ollama-endpoint.ts` versions). This matches CLAUDE.md's own "Duplication
Prevention" rule almost exactly (N competing owners of one capability) — recorded here as a new,
previously-undocumented instance of that pattern, not remediated (consolidating 11 files down to
one canonical owner is a change with a much larger blast radius than this session's scope).

**Not done** — the ~85-file broader test sweep the original handoff described (auditing
`ollamaFetch` mocks inside test files, as opposed to production call sites) was not attempted this
session; scoped out in favor of the production-code audit above.
