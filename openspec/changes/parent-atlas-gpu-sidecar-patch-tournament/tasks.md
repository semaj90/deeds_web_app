# OpenSpec: Parent Atlas GPU Sidecar + Patch Tournament — bounded first slice

## Separate workstation integration backlog

The broader GPU/runtime sequence is tracked separately in
`docs/parent-atlas-workstation-gpu-runtime-backlog.md` and is not part of AST
supersession. Current roadmap estimate: **58% GPU/runtime integration**.

GPU-02 ownership proof is now wired as
`npm run atlas:gpu:ownership:proof`, producing
`docs/reports/gpu-runtime-ownership-proof.{json,md}`. Current result: control-plane
owners proven; RAPIDS `:8098` reachability remains deferred.

GPU-03 semantic contract proof is now wired as
`npm run atlas:gpu:semantic:proof`, producing
`docs/reports/semantic-768-contract-proof.{json,md}`. It is read-only and records
the live Qdrant named-vector contract, llama-server chat ownership, and Ollama
embedding ownership. BM42 remains `DEGRADED/NOT_RUN` and is not a gate here.

Order remains: P0 structural correctness → P1 reproducible GPU environment and
Valkey proof → P2 cuVS/CAGRA/cuGraph retrieval evaluation → P3 TensorRT,
multithreading, simdjson, Python 3.14/free-threading, and RMM experiments.

## Deferred production-hardening gates

The following gates were added after reviewing current NVIDIA, RAPIDS, PyTorch,
Valkey, and simdjson documentation. They are acceptance work only; they do not
promote CAGRA, change RRF, or create another source-of-truth owner.

- [ ] GPU-21 filter semantics parity: canonical `SearchFilter`/revision masks
  match Qdrant exact and future cuVS/CAGRA bitset results with zero false positives.
- [ ] GPU-22 atomic index revision build/validate/swap; indexes remain rebuildable caches.
- [ ] GPU-23 CUDA stream/resource ownership and synchronization receipt.
- [ ] GPU-24 VRAM arbitration and CPU/Qdrant/Neo4j fallback receipt.
- [ ] GPU-25 JSON/HTTP, Arrow/mmap, ordinary H2D, and pinned non-blocking H2D benchmark.
- [ ] GPU-26 metric equivalence for float32 `semantic_768` cosine ranking.
- [ ] GPU-27 typed GPU degradation reasons and safe fallback behavior.
- [ ] GPU-28 NVIDIA Container Toolkit/device/image boundary proof.
- [ ] GPU-29 TensorRT engine lifecycle, dynamic profiles, warmup, cache, and memory proof.
- [ ] GPU-30 Python 3.14 extension compatibility receipt before free-threaded migration.
- [ ] GPU-31 accelerator latency, memory, fallback, revision, and recall observability receipt.
- [ ] GPU-32 Valkey expiry/eviction/cache-miss/revision-rebuild fail-open proof.

Separate deferred lanes:

- [ ] ACE-RLM-01: freeze the bounded revision-qualified `RLMEnvironment` contract.
- [ ] ACE-RLM-02: expose SearchRuntime as the only retrieval/fusion tool; no second RRF.
- [ ] ACE-RLM-03: add bounded packet/source/graph/process inspection receipts.
- [ ] ACE-RLM-04: enforce recursion, token, latency, and subcall budgets.
- [ ] ACE-RLM-05: compile final RLM state into `ContextManifest`.
- [ ] ACE-RLM-06: persist `RLMTrace → ContextManifest → ExecutionReceipt` linkage.
- [ ] ACE-RLM-07: feed execution receipts to ACE Generator/Reflector review.
- [ ] ACE-RLM-08: persist Curator-approved playbook deltas to Postgres; Valkey is hot-only.
- [ ] BF-01: use revision-qualified BitFrost packet/card/manifest/symbol/graph/retrieval/ACE keys.
- [ ] BF-02: prove Valkey `CLIENT TRACKING` invalidation; notifications are telemetry only.
- [ ] BF-03: prove optional process-local L0 invalidation from Valkey.
- [ ] BF-04: add short-lived negative eligibility caches that fail open.
- [ ] BF-05: qualify GPU filter-cache material by `indexRevision` and `filterHash`.
- [ ] BF-06: prove expiry, eviction, cache miss, revision mismatch, and Valkey outage recovery.
- [ ] SIMD-01: measure PERF0 for current JSON/JSONL parsing before adding C++.
- [ ] SIMD-02: prototype C simdjson On-Demand only at the receipt/JSONL boundary.
- [ ] SIMD-03: benchmark `iterate_many` with one parser per worker/thread.
- [ ] SIMD-04: promote only on measured improvement with a JSON-compatible fallback.

## Workstation status note — 2026-08-13

The GPU/RAPIDS implementation was not deleted. Repository sources and the dedicated
RAPIDS/cuVS sidecar remain present. The currently active 8095 NLP/AST container is a
separate lightweight runtime and reports PyTorch, cuVS, cuGraph, CuPy, and CAGRA as
unavailable. Do not interpret that capability response as deletion of this sidecar or
as proof that the dedicated 8098/WSL2 lane is live in the current session.

Current status remains: exact-KNN bounded work may be separately proven; CAGRA remains
quarantined until the recorded architecture decision is explicitly revised and a fresh
runtime/recall proof is completed. Python 3.14, multi-threading, simdjson, TensorRT,
Redis/Valkey warming, and GPU promotion remain deferred integration work.

## RESUME POINT (2026-08-03, updated — WSL2 smoke test independently re-verified this turn)

The WSL2 runtime smoke test described below as "not started" in the prior checkpoint was
actually completed later in the same wall-clock session (sidecar left running, uptime
observed >600s). This turn independently re-verified it from a fresh context rather than
trusting the report at face value, per this repo's evidence rules — see "Independent
re-verification" below. `/v1/knn/exact` is now genuinely `RUNTIME_SMOKE_PROVEN`.

**Contradiction resolved 2026-08-14**: the operator-authorized bounded probe
independently verified `POST /v1/knn/cagra` against the exact cuVS oracle on a
three-row `semantic_768` fixture with Recall@3 = `1.0` and identity parity.
The recorded exclusion remains a production decision, so the resulting state is
`RUNTIME_PROVEN_ON_TINY_FIXTURE` plus `PRODUCTION_QUARANTINED`, not promotion.
Larger-corpus recall, filters, revision swaps, fallback, and production
approval remain open.

**Independent re-verification performed this turn** (fresh context, did not reuse the
prior turn's claims): hit the already-running sidecar directly —
- `GET /health` — real RTX 3060 Ti, torch 2.13.0+cu130, cuvs 26.06.00, uptime ~642s.
- `POST /v1/knn/exact` with a freshly-generated synthetic 3-row/768-dim fixture
  (query = one-hot dim 0; corpus = identical / opposite / orthogonal one-hot vectors) →
  `[packet:fixture-a (0.0), packet:fixture-c (2.0)]` for `topK=2` — matches the expected
  rank order exactly for the explicitly used squared-euclidean mechanics fixture.
  This is not canonical cosine semantic-retrieval parity; the CAGRA semantic gate
  must use the frozen `semantic_768`/`content` cosine contract.
- 3 of the 5 fail-closed probes run directly: dimension mismatch (767-length vector) →
  `422 DIMENSION_MISMATCH`; duplicate `(packetKey, sourceRevision)` → `422
  DUPLICATE_CORPUS_IDENTITY`; `topK=0` on a 1-row corpus → `422 INVALID_TOPK`. All three
  correct. (Not run this turn: missing-`sourceRevision` probe, deadline-expired probe —
  still open if a fully exhaustive record is wanted.)
- 3x repeat of the same fixture request — identical ranks/distances every time
  (`[fixture-a: 0.0, fixture-c: 2.0]`), GPU free memory stable at 7124→7122 MB each call,
  no climb across repeats.

Remaining before this is a *complete* record (not blocking, just not yet done):
- Missing-`sourceRevision` probe and deadline-expired probe (2 of the original 5).
- Full 10x repeat (only 3x done this turn; prior turn claimed a 10x pass — not
  independently re-verified at n=10).
- `RAPIDS_CAGRA_ENDPOINT` verification or an explicit operator decision to keep the
  exclusion and remove/quarantine the CAGRA code path instead.
- `RAPIDS_KNN_VALID_FIXTURE: PASS`, `RAPIDS_KNN_IDENTITY_MANIFEST: PASS_ON_FIXTURE`,
  `RAPIDS_KNN_GPU_EXECUTION: PASS_ON_FIXTURE`, `RAPIDS_KNN_RESPONSE_SERIALIZATION: PASS`,
  `RAPIDS_KNN_MEMORY_TELEMETRY: PASS` — all justified by the re-verification above for
  `knn.exact` specifically; do not extend these gates to `knn.cagra`.
- **Do NOT use the live production Qdrant corpus for any further fixture** — GS1.47 found
  0/250 sampled Qdrant payloads carry `packet_key`; production `latent_64` lineage remains
  unresolved (GS1.45–1.47). Keep using synthetic revision-qualified fixtures until that's
  fixed.

**Index-type decision (recorded 2026-08-03, still in force — the CAGRA endpoint above does
not override this until an operator explicitly says so)**: `brute_force` only, as an exact
correctness oracle — never CAGRA (explicitly excluded, "do not promote CAGRA") or
IVF-Flat/IVF-PQ (unevaluated, would need their own recall proof against `brute_force`
before any production consideration). An approximate index cannot serve as ground truth
for another approximate index (Qdrant's HNSW).

**Static checks already done and clean, do not repeat**: `py_compile`, `pyflakes` (2 real
issues found and fixed: unused `Field` import, `brute_force` shadowing redefinition — both
fixed), duplicate-dict-key AST scan (confirmed clean — the visual duplication in an
earlier diff was rendering artifact only). `deadlineMs` is a **relative** budget from
request receipt, not an absolute epoch timestamp — documented in-code, kept as
`deadlineMs` (not renamed) to match `proposal.md`'s published contract.


## Part A — RAPIDS/PageRank verification

- [x] Verify `getTopPageRankClient`/`getTopPageRank` for a duplicate/unreachable-return bug — **checked 2026-08-03, not present**. Single return statement in both `neo4j-gds-client.ts:237` and `graph-analytics-service.ts:67`, both correctly default to `'pageRankScore'`.
- [x] Freeze the RAPIDS environment (`atlas-rapids-cu13`) — done: `scripts/atlas/environments/atlas-rapids-cu13.yml` + `README.md`.
- [x] Decide the one authoritative PageRank property name — decided/applied: `pageRankScore`. Canonical GDS path rerun live: 251,613 nodes updated, score range 0.15–8.21, 3,454 distinct values, 6.36s. `graphPageRank` (old canonical-service default) and lowercase `pagerank` (separate legacy/adjacent property) both remain, unreconciled — `LOWERCASE_PAGERANK_RECONCILIATION: MISSING`.
- [ ] Audit which of the ~18 candidate scripts originally wrote the old 59,692-row `pageRankScore` data (provenance, not correctness) — separate, deferred.
- [ ] NEW: `atlas_packets.page_rank_score` (Postgres, written by the cuGraph batch script) vs. the freshly-aligned Neo4j `pageRankScore` — run-revision and source-graph match not yet verified. `POSTGRES_AUTHORITY_LEDGER_REFRESH: NOT_RUN`.
- [ ] NEW: full-corpus three-way PageRank parity (NetworkX/GDS/cuGraph across all 251,613 nodes, identical snapshot identities) — only the 6-node fixture (max delta ~5.2e-9) is proven so far. `FULL_CORPUS_THREE_WAY_PAGERANK_PARITY: NOT_PROVEN`.
- [ ] NEW: compare `promote-pagerank-authority-from-neo4j.mjs` vs `promote-neo4j-pagerank-to-postgres.mts` (source property, normalization, identity key, target table, revision handling, write semantics) before any archival decision.
- [ ] NEW: `compute-pagerank-nodejs.mjs` — lowest-risk archive candidate, self-declared invalid/unused in its own header. `compute-pagerank-neo4j.mjs` — self-declared retired but still package-script-wired; needs operator decision before touching.

## Part B — GPU sidecar (health + capabilities + exact KNN only)

### Current-session update — 2026-08-14

The dedicated `atlas-rapids-cu13` WSL environment and existing
`python/atlas_rapids_sidecar.py` were started without rebuilding containers or
changing canonical services. `GET /health` reached `127.0.0.1:8098` and
reported an NVIDIA GeForce RTX 3060 Ti; cuVS was `26.06.00`.

The exact endpoint was exercised against a fresh three-row, 768-dimensional
`semantic_768` fixture. Three consecutive requests returned the same
revision-qualified packet order and preserved the `packetKey` +
`sourceRevision` identity contract. The live artifact is
`docs/reports/gpu-knn-exact-runtime-proof.{json,md}`.

Current gate result: `GPU-KNN-01 PASS`, `GPU-KNN-02 PASS_ON_LIVE_FIXTURE`,
`GPU-KNN-03 PASS_ON_TINY_FIXTURE`, `GPU-KNN-04 PASS_ON_LIVE_FIXTURE`,
`GPU-KNN-05 RECALL_AT_3=1.0_ON_TINY_FIXTURE`, and `GPU-KNN-06
DESIGN_GUARD_PASS`.

The capability endpoint advertises `knn.cagra` as runtime-smoke-proven, but
that conflicts with the recorded operator decision below. CAGRA is now
separately proven only on the bounded tiny fixture described below; it remains
`PROHIBITED` for production promotion until the operator explicitly revises
the decision. Qdrant, Valkey, Neo4j, RRF, and canonical data were not modified.

Bounded operator-authorized CAGRA probe (2026-08-14): the existing endpoint
then successfully built/searched CAGRA on the same three-row `semantic_768`
fixture used by exact KNN. Three queries matched the exact oracle at Recall@3
`1.0` and preserved `packetKey+sourceRevision`. This is recorded in
`docs/reports/gpu-knn-cagra-runtime-proof.{json,md}` as
`RUNTIME_PROVEN_ON_TINY_FIXTURE`; it is not a larger-corpus or production
promotion proof. Production CAGRA remains quarantined pending scale, filter,
revision-swap, fallback, and explicit promotion gates.

### Architecture review — 2026-08-14

cuVS brute force is the exact `semantic_768` oracle. CAGRA is one optional
dense executor, not a separate retrieval lane. Qdrant remains the persistent
projection; Valkey is cache/hot routing only; KMeans/SOM are routing metadata;
Neo4j PageRank is candidate evidence. No executor may add a second RRF vote.

- [x] `GPU_SIDECAR_HTTP_SERVICE`: minimal local RAPIDS sidecar live — `python/atlas_rapids_sidecar.py`, port 8098, `GET /health` + `GET /v1/capabilities`. Verified: process startup, real RTX 3060 Ti detection, live GPU memory reporting, package import reporting, graceful shutdown.
- [x] `GPU_CAPABILITY_REGISTRY`: capability discovery response live — now reports both bounded ops separately (`knn.exact`, `knn.cagra`).
- [x] `GPU_REQUEST_RESPONSE_SCHEMAS`: exact-KNN / CAGRA request/response contract — implemented as Pydantic models in `python/atlas_rapids_sidecar.py` (`KnnQuery`, `KnnCorpusRow`, `ExactKnnRequest`, `ExactKnnHit`, `ExactKnnResponse`, `CagraKnnResponse`).
- [x] Exact-KNN endpoint (`POST /v1/knn/exact`) with identity manifest — implemented, syntax-verified, and **independently runtime-verified** against the live sidecar (fresh revision-qualified synthetic `semantic_768` fixture, rank order, distances, fail-closed guards, repeatability, and GPU-memory stability all matched expectations). `RAPIDS_EXACT_KNN_ENDPOINT: RUNTIME_SMOKE_PROVEN` — this status is justified by re-verification performed from a fresh context, not by trusting the originating report alone.
- [ ] CAGRA endpoint (`POST /v1/knn/cagra`) with the same bounded identity manifest — tiny-fixture runtime and exact-oracle Recall@3 are proven, but production remains **quarantined** because larger-corpus recall, filter parity, revision swaps, fallback, and promotion approval are open. `RAPIDS_CAGRA_ENDPOINT: RUNTIME_PROVEN_ON_TINY_FIXTURE; PRODUCTION_QUARANTINED`.
- [x] Row-count (`ATLAS_RAPIDS_KNN_MAX_ROWS`, default 25000), top-k, VRAM (`ATLAS_RAPIDS_KNN_MIN_FREE_GPU_MB`, default 512), timeout, and duplicate-identity guards — all fail-closed with typed error codes (`DIMENSION_MISMATCH`, `MISSING_PACKET_IDENTITY`, `MISSING_REVISION_IDENTITY`, `DUPLICATE_CORPUS_IDENTITY`, `INVALID_TOPK`, `CORPUS_TOO_LARGE`, `EMPTY_CORPUS`, `INSUFFICIENT_GPU_MEMORY`, `DEADLINE_EXPIRED`, `CUVS_UNAVAILABLE`). Uses the `distances, neighbors = brute_force.search(...)` return order confirmed correct earlier this session (the swapped-order bug that was found and fixed in GS1.31-33).
- [ ] Remaining exact-KNN local proof record items (non-blocking for the current contract phase): missing `sourceRevision` fail-closed probe, deadline-expired probe, full 10x determinism run, 10x GPU-memory plateau receipt, formal fixture report artifact.
- [ ] Fixture: 20,000-row `semantic_768` sample, revision-qualified. `QDRANT_CUVS_RECALL_FIXTURE: NOT_STARTED`.
- [ ] `QDRANT_CUVS_RECALL_COMPARISON`: run recall@20 comparison, Qdrant vs cuVS exact, on the fixture above. `QDRANT_CUVS_RECALL_AT_20: NOT_STARTED`.
- [x] One internal TypeScript client (`gpu-sidecar-client.ts`) — request deadline, GPU memory-limit awareness, row→`symbol_version_id` mapping, stale-row/orphan counting. `RAPIDS_TYPESCRIPT_CLIENT: IMPLEMENTED_NOT_RUNTIME_PROVEN`.
- [ ] Exactly one bounded read-only MCP operation exposing the exact-KNN result — **only after** the client above is proven. `RAPIDS_BOUNDED_MCP_OPERATION: NOT_STARTED`.
- [ ] Explicitly NOT in this slice: clustering, tRPC admin API, Kanban GPU receipts, Arrow mmap, Redis centroid warming, CUDA IPC, Kafka CDC work.

## Part B2 — routing and hot/warm/cold evaluation backlog

- [x] **ROUTE-01** Freeze `SemanticSnapshotV1`: `atlas.semantic-snapshot.v1` manifest now validates workspace/source/representation/ordinal-map revisions, canonical identity and vector digests, float32 `semantic_768` dimensions, and Arrow IPC/mmap artifact provenance. Vector materialization and Go/CUDA consumers remain open.
- [x] **ROUTE-02** Freeze the revisioned KMeans routing metadata contract derived from `semantic_768` at K=64/128/256. Validation now requires snapshot, workspace, representation, ordinal-map, routing, assignment, and centroid lineage; centroid metadata remains routing-only and never becomes canonical identity or an additional RRF vote. Runtime clustering, Valkey warming, and candidate-reduction benchmarks remain open.
- [ ] **ROUTE-03** Evaluate the existing 20×20 SOM only as optional topology-aware routing/visualization; compare against KMeans using candidate reduction, recall, latency, and expansion rate.
- [ ] **ROUTE-04** Prove hot/warm/cold expansion: Valkey hot routing and ACE cards → Qdrant/CAGRA warm retrieval → Postgres/immutable snapshot cold reconstruction; every transition is revision-qualified and fail-open.
- [ ] **ROUTE-05** Prove the same `SearchFilter` and revision mask across Qdrant, exact cuVS, and future CAGRA; zero false positives and no executor-specific fusion lane.
- [ ] **ROUTE-06** Benchmark the routing tournament at 10K, 50K, and current semantic-card corpus sizes before considering production CAGRA or centroid warming.

### CAGRA correction and canonical corpus gates — 2026-08-14

- CAGRA is `INSTALLED/RUNTIME_PROVEN` on the WSL2 RTX 3060 Ti sidecar and
  `PRODUCTION_QUARANTINED`; the tiny three-row Recall@3 result is not quality
  proof.
- The first real comparison must use the canonical Qdrant `content` vector
  space with `semantic_768`, dimension 768, float32, cosine, explicit
  normalization, and a revisioned ordinal map. Do not use the earlier
  sqeuclidean toy fixture as semantic parity evidence.
- The exact cuVS brute-force index is the nearest-neighbor oracle. Qdrant is a
  serving executor comparison, not ground truth. CAGRA and Qdrant remain
  alternative executors behind one logical dense lane.
- Required scale sequence: 10K real Parent Atlas rows, 50K rows, then the
  full frozen semantic snapshot. Each run must report Recall@5/@10/@50,
  top-1 agreement, distance error, p50/p95 search latency, build time, VRAM,
  identity parity, and failure/fallback behavior.
- `nDCG` is deferred until a relevance-labeled retrieval set exists; do not
  manufacture relevance labels from exact-neighbor rank.
- SearchFilter-to-bitset parity, atomic index revision swaps, and VRAM
  arbitration are separate gates. CAGRA cannot become a retrieval requirement.

## Part C — Patch Tournament (Phase 1: deterministic tournament only) — GS1.41 SEAM ACCEPTED

- [x] `PatchTournament` / `PatchCandidate` / `CandidateValidationResult` schemas, one Postgres-backed tournament repository, exactly 3 candidates for one real compile error, 3 isolated Git worktrees with exact revision guards, static validation in parallel, focused tests on survivors, deterministic ranking, one `TournamentAcePacket`, top-3 Kanban card, manual approval gate, no auto-apply, no training — **all done, GS1.41's deliberately narrow first slice**.
- [ ] Before expanding past this seam: search the repo for existing `PatchTournament`/`PatchCandidate`/candidate-repository/`git worktree`/isolated-workspace/recommendation-ranking/ACE-comparison/Kanban-recommendation owners to avoid parallel schemas.
- [ ] Do not begin QLoRA/reranker training, multi-error campaigns, or auto-apply until explicitly requested.
- [ ] Latest repository-facing status update (do not treat as a new proof): `PATCH_TOURNAMENT_SPEC: RECEIVED_NOT_STARTED`, `PATCH_TOURNAMENT_BOUNDED_SEAM: QUEUED`, `GRAPHIFY_RECOVERY_PROOF_LADDER: PASS`, `GRAPH_SNAPSHOT_FRESH: PASS`, `GRAPHIFY_DAILY_COMPLETED: NOT_PROVEN`, `DEEP_AUDIT: NOT_PROVEN`.

### Proof gates (Part C)

`TOUR1_BASELINE_CAPTURED` · `TOUR2_WORKTREE_ISOLATION` · `TOUR3_CANDIDATE_IDENTITY` · `TOUR4_REVISION_GUARDS` · `TOUR5_THREE_STRATEGIES` · `TOUR6_DEDUPLICATION` · `TOUR7_STATIC_VALIDATION` · `TOUR8_FOCUSED_VALIDATION` · `TOUR11_DETERMINISTIC_RANKING` · `TOUR12_ACE_COMPARISON_PACKET` · `TOUR16_MANUAL_APPROVAL`: all `PASS` for the GS1.41 seam (`TOURNAMENT_ONE_ERROR` / `TOURNAMENT_THREE_CANDIDATES` / `TOURNAMENT_THREE_WORKTREES` / `TOURNAMENT_STATIC_VALIDATION` / `TOURNAMENT_FOCUSED_TESTS` / `TOURNAMENT_DETERMINISTIC_RANKING` / `TOURNAMENT_ACE_PACKET` / `TOURNAMENT_KANBAN_CARD` / `TOURNAMENT_MANUAL_APPROVAL`).

Not yet exercised (beyond the accepted narrow seam, still gated for a future expansion, status `NOT_RUN`): `TOUR9_INTEGRATION_VALIDATION` · `TOUR10_FRESH_REPLAY` · `TOUR13_DAG_STATE_TRANSITIONS` · `TOUR14_KAG_FACT_REFERENCES` · `TOUR15_HYPEREDGE_ROLES` · `TOUR17_DURABLE_RECEIPTS` · `TOUR18_KNOWLEDGE_OBSERVATION` · `TOUR19_NO_ONLINE_SELF_MODIFICATION` · `TOUR20_TRAINING_DATA_ELIGIBILITY`. `TOURNAMENT_AUTO_APPLY: DISABLED` (correctly held), `TOURNAMENT_TRAINING: NOT_STARTED` (correctly held).

## Part D — adjacent findings (not this proposal's scope, flagged here)

- [ ] **New bounded change needed**: `promote_recommendation`'s write path conflates two state vocabularies — recommendation status (`PROPOSED`/`APPROVED`) written into a table constrained by `semantic_lifecycle_events`'s lifecycle vocabulary (`ACTIVE`/`SUPERSEDED`/`RETRACTED`/`ARCHIVED`). Both `PROMOTE_RECOMMENDATION` and `RECOMMENDATION_SUPERSESSION` are individually `RUNTIME_SMOKE_PROVEN` via rolled-back transaction proofs, but the vocabulary conflict itself needs its own OpenSpec change — not folded into recommendation supersession or this GPU/tournament proposal.
- [ ] RRF `includeProvenance` gating fixed in `rrf-fuse.ts` (`src/mcp/tools/repair_tools.ts:554`'s call site's intent to control provenance predates the fix and was previously silently ignored) — `tsgo` 263→261, zero regressions. Separately found, NOT fixed: `rrf-split.test.ts`'s "imports search runtime and rrf integration without infra side effects" test fails (measured 10,317ms against a <3000ms budget) — pre-existing, unrelated to this session's changes, real active regression needing dedicated investigation.
- [ ] `graphify:daily` status: `GRAPHIFY_DAILY_STARTED: PARTIAL`, `GRAPHIFY_DAILY_COMPLETED: NOT_PROVEN`, `GRAPH_SNAPSHOT_FRESH: PASS` (confirmed live 2026-08-03: `codebase-graph.json` refreshed to the current proof artifact). `DEEP_AUDIT: NOT_PROVEN` pending a full daily run.

## Explicitly deferred (do not start under this task list)

- Centroid warming (Redis double-buffer, `CentroidPolicyRecord`), SOM-based routing beyond the existing 20×20 map.
- GPU retrieval microbatching service, multi-API request scheduling, BitFrost 3-level cache redesign.
- CUDA IPC / DLPack zero-copy transport.
- Learned candidate reranker, QLoRA SFT, preference optimization, RL/bandit (Patch Tournament Phases 2–5).
- Full 25-section contract set from the source spec beyond what's listed above.
