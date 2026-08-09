Gate-by-gate, matching this repo's established discipline for large external plans
(see `parent-atlas-agentic-repair-bundle-integration` and
`parent-atlas-graph-runtime-enhancement`'s own precedent) — nothing past Gate 1's
first task is implied to start just because an earlier task finished. Each gate must
go green (live-verified, not just "code written") before the next starts.

## 0. Pre-flight (do this before any Gate 1 code)

- [ ] 0.1 Verify `atlas_rapids_sidecar.py` is still live and its exact-KNN endpoint
      still passes its existing runtime smoke check (`GET /health`,
      `GET /v1/capabilities`, one real `POST /v1/knn/exact` call) — don't build on
      top of an assumption that it's still healthy.
- [ ] 0.2 Read `openspec/changes/parent-atlas-retrieval-fusion-reachability/tasks.md`
      in full before starting Gate 2 — it owns the 13-owner RRF census and RF6
      fusion-ownership decision; this change's Gate 2 must not duplicate that work.
- [ ] 0.3 Read `openspec/changes/phase-2f1-real-evaluation-corpus/` in full before
      starting Gate 3 — check whether a reference query/labeled-result corpus already
      exists there before building a new replay fixture.

## 1. Gate 1 — Lock graph ownership

- [ ] 1.1 Write a dispatcher/registry test for
      `graph-analysis-runner.ts::runGraphAnalysis()` — asserts each algorithm
      (`pagerank | louvain | leiden | cheirank | kcore | betweenness`) routes to the
      correct handler (real adapter vs. `runSkippedAnalysis` stub with the expected
      `skippedReason`), and that `pagerank`/`louvain` results conform to
      `GraphAnalysisRunSchema` (from `graph-analysis-types.ts`).
- [x] 1.2 **DONE, built in `parent-atlas-graph-analysis-contract` instead of
      here** — `sveltekit-frontend/scripts/atlas/verify-graph-analysis-gates.mts`
      (2026-08-09). Generalized beyond "Louvain persistence verifier" to
      cover every algorithm proven live by that point (pagerank, louvain,
      leiden, cheirank, kcore) plus the `atlas_packets`
      column-count-unchanged check, since by the time this task was reached
      Patches C–G had all landed and the same manual verification pattern
      had been repeated by hand 5 times — one script covering all of them
      was the right scope, not a Louvain-only one. See that change's
      tasks.md "Gate validation script" section for the live 6/6-PASS result.
- [x] 1.3 Confirmed live: `npx tsx scripts/atlas/verify-graph-analysis-gates.mts`
      → 6/6 gates PASS, exit code 0, run against real Postgres data (not
      unit-test mocks) — 2026-08-09.

## 2. Gate 2 — Finish retrieval identity/fusion

(Coordinate with `parent-atlas-retrieval-fusion-reachability` — this gate closes
that change's remaining scope, it does not restart it.)

- [ ] 2.1 Canonical identity — confirm/fix the single identity join every retrieval
      lane uses (`packet_key`, verified against `source_ref`), per this repo's
      "never join on feature_id alone" rule.
- [ ] 2.2 Same-lane dedup — one candidate per `packet_key` per retrieval lane before
      fusion, not after.
- [ ] 2.3 One logical RRF vote per lane — resolve the "5 competing PageRank
      implementations"-shaped risk for fusion: confirm there is exactly one RRF
      computation per lane feeding the final blend, not several silently competing
      ones (audit first, per `parent-atlas-retrieval-fusion-reachability`'s RF2
      13-owner census — don't assume the count is still accurate).
- [ ] 2.4 Fail-open reranking — reranker failure must degrade gracefully (return
      pre-rerank order), never drop results or throw past the retrieval boundary.
- [ ] 2.5 Orphan owner classification — every retrieval-contributing signal must have
      exactly one identified owner module; classify and flag any signal that
      currently doesn't (mirrors this session's PageRank-path audit method).
- [ ] 2.6 (Design D3, optional outcome) Audit existing lexical-lane implementation in
      `src/lib/server/retrieval/` against Qdrant's `qdrant/bm25` built-in sparse
      inference. Valid outcomes: adopt, or explicitly decide not to and record why —
      either is an acceptable Gate 2 result.

## 3. Gate 3 — Frozen-revision end-to-end proof

- [ ] 3.1 Build or reuse (per task 0.3) a replay fixture: a frozen set of queries with
      expected/labeled results, pinned to one `graphRevision`.
- [ ] 3.2 Run the full chain against the fixture: PageRank run (Patch C) → promoted
      authority (GA9 promotion gate, `parent-atlas-graph-analysis-contract`) →
      canonical retrieval (Gate 2's fusion) → `FeatureRow` → cross-encoder rerank →
      MMR → evidence.
- [ ] 3.3 Verify the chain is deterministic against the frozen revision — same input,
      same output, across at least two independent runs (same discipline as Patch
      C/D's live-verification: two runs, not one).
- [ ] 3.4 Record the E2E proof status (`RUNTIME_SMOKE_PROVEN` or
      `NOT_PROVEN` — this repo's status-language convention, never
      "production-ready" from a single run) in this change's tasks.md.

## 4. GPU substrate — topology programs (after Gates 1–3 are green)

- [ ] 4.1 Add `atlas_test_v1` to `graph-projection-manifest.ts`'s
      `NAMED_PROJECTION_CANDIDATES` (edges: `TEST_COVERS_FILE`, `IMPORTS`, `CALLS`).
- [ ] 4.2 Implement the `ERROR_REPAIR` / `TEST_IMPACT` / `DEPENDENCY_REPAIR` typed
      topology-program contract (Zod schema + dispatcher) per `design.md` D4, routed
      through APOC bounded expansion for small requests.
- [ ] 4.3 Add the cuGraph BFS/SSSP sidecar endpoint(s) to `atlas_rapids_sidecar.py`
      for the large/heavy-request path of the same topology programs, returning the
      same distance/predecessor shape as the APOC path.
- [ ] 4.4 Wire topology-program routing (small → APOC, large → cuGraph sidecar) and
      verify both paths return consistent results for an overlapping test case.

## 5. GPU substrate — cuGraph parity for kcore/betweenness (after Gates 1–3 are green)

- [ ] 5.1 Implement a cuGraph-backed (`core_number`) alternative for
      `graph-analysis-runner.ts`'s `runSkippedAnalysis('kcore', ...)` stub, writing
      through the same `graph_analysis_runs`/`graph_node_metrics` contract with
      `backendActual` reflecting the GPU sidecar.
- [ ] 5.2 Implement a cuGraph-backed (`betweenness_centrality`) alternative for the
      `betweenness` stub, same contract, same backend-recording discipline.
- [ ] 5.3 Live-verify both (row counts, non-finite checks, `atlas_packets` unchanged)
      matching the exact rigor Patch C/D already established — not a lighter bar
      just because it's a second backend for an existing algorithm slot.

## 6. GPU substrate — cuVS CAGRA/KMeans/PCA endpoints (after Gates 1–3 are green)

- [ ] 6.1 Wire a live `POST /v1/knn/cagra` endpoint (capability already discovered,
      no endpoint yet) using `cagra.IndexParams`/`cagra.build()`/`cagra.search()`.
- [ ] 6.2 Wire a `POST /v1/vector/kmeans` endpoint (`kmeans.KMeansParams`/`fit()`/
      `predict()`/`cluster_cost()`) — this is the "RAPIDS/cuVS vector exact/KMeans
      contract" the later infrastructure ordering depends on.
- [ ] 6.3 Wire a `POST /v1/vector/pca` endpoint (`pca.Params`/`fit_transform()`/
      `transform()`) as a candidate substrate for the existing 64-dim autoencoder /
      manifold-coordinate work referenced in root `CLAUDE.md`'s Karpathy GPU
      Authority Blend section — do not migrate that work in this task, only make the
      substrate available to it.

## 7. Later infrastructure (explicitly out of scope until 4–6 are proven)

Rust `AstUnit`/chunk lineage → wide `ExperimentFeatureMatrix` → (this change's) RAPIDS/
cuVS vector exact/KMeans contract → only then F19/F20 reranker evidence, AST-aware
refinement, CodeBERT/GraphCodeBERT, SOM, manifold coordinates, and custom CUDA tiling
as consumers of that substrate. Do not start any of these under this task list —
captured here only so the ordering is on record.
