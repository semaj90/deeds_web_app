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

## STALE PREMISE CORRECTION (2026-08-09) — Gates 4–6 are further along than this file claims

Found while answering an unrelated question about "what happened to the GPU smoke tests" —
**this file's "Gate 4-6 not started, capability already discovered, no endpoint yet" framing
(task 6.1) is factually out of date.** `parent-atlas-graph-retrieval-proof/tasks.md`'s GS1.24
through GS1.49+ sequence (dated 2026-08-02 through 2026-08-04, i.e. *before* this file's own
"not started" tasks were written) already did substantial work on exactly this substrate:

- **The WSL2 RAPIDS environment is real, live-verified, not hypothetical.** `atlas-rapids-cu13`
  is a genuine miniforge conda environment inside WSL2 Ubuntu (frozen at GS1.37 to
  `scripts/atlas/environments/atlas-rapids-cu13.yml`). Live-checked 2026-08-09 (WSL2 was
  `Stopped`, started for this check, found intact and current — `envs/` last modified
  2026-08-08, one day before this check): `cuvs 26.06.00`, `cugraph 26.06.00`,
  `torch 2.13.0+cu130` with `torch.cuda.is_available() == True`. GS1.37 also found
  `langextract==1.6.0` already installed in this same environment — it was originally
  provisioned for combined LangExtract+RAPIDS work, not RAPIDS alone.
- **The sidecar this file's task 0.1 references (`atlas_rapids_sidecar.py`) already has
  `/v1/knn/exact` AND `/v1/knn/cagra` implemented in code** (lines 328 and 373 respectively,
  confirmed by reading the file directly) — not just `/health` + `/v1/capabilities` as GS1.38's
  own description and this file's task 6.1 both claim ("no endpoint yet"). Code comments
  reference `GS1.31-33` fixes to the CAGRA/exact-KNN return-value ordering, meaning further
  work happened past what's recorded in `parent-atlas-graph-retrieval-proof/tasks.md`'s last
  read-through for this pass — that file's own GS1.4x entries may also be incomplete relative
  to the actual code state.
  - **Not currently running** — nothing is bound to port 8098 as of this check. The sidecar
    must be manually launched inside WSL2 (per its own docstring's `wsl -d Ubuntu -e bash -lc
    "source ~/miniforge3/bin/activate atlas-rapids-cu13 && python python/atlas_rapids_sidecar.py"`
    invocation) — it does not auto-start with anything in this repo's `dev:gpu`/startup chain.
  - A known, already-root-caused integration bug exists and was fixed at the import-order level
    (GS1.33): `torch` must be imported before `cudf`/`cugraph` in the same process to avoid a
    `cublasLtZZZMatmulAlgoGetHeuristicForStream` symbol conflict between PyTorch's bundled CUDA
    libs and the conda RAPIDS build. `atlas_rapids_sidecar.py` already applies this ordering.
- **A real recall/latency benchmark already ran and passed** (commit `be3d4e5486`, 2026-07-10,
  `docs/PHASE-4-CUVS-RECALL-VALIDATION.md`): IVF-Flat cuVS vs. Qdrant brute-force ground truth,
  Recall@10=0.9900, Recall@50=0.9850, Recall@100=0.9813, latency 8.91ms — inside this exact
  WSL2/`atlas-rapids-cu13` environment, on the real 40.5K-embedding corpus. This is not a
  synthetic/toy benchmark.
- **This file's own task 0.1** ("verify `atlas_rapids_sidecar.py` is still live") already
  anticipates exactly this gap — the correct next action per that task is to launch it inside
  WSL2 and re-verify `/health`, `/v1/capabilities`, **and now also `/v1/knn/exact` +
  `/v1/knn/cagra`** (both already coded, unlike this file's assumption), not to write new
  endpoint-wiring code assuming a blank slate.

**Required before any Gate 4-6 task in this file is started**: reconcile this file's Gate
4-6 task list against `parent-atlas-graph-retrieval-proof/tasks.md`'s GS1.37-1.4x+ entries in
full (not just the excerpt read for this correction) — there is a real risk of this change
re-building sidecar endpoints, environment provisioning, or benchmark work that already exists
and was already proven, which is exactly the "search before creating a peer owner" failure
mode this repo's own governance rules (`CLAUDE.md` "Duplication Prevention" section) exist to
prevent. Task 6.2 (`/v1/vector/kmeans`) and 6.3 (`/v1/vector/pca`) were not directly checked
against the live file in this pass — only 6.1 (CAGRA) was confirmed already-coded; 6.2/6.3 may
or may not already exist too and need the same live-file check before assuming "not started."

**Not done in this correction pass**: did not launch the sidecar inside WSL2 to re-verify its
endpoints live, did not read `parent-atlas-graph-retrieval-proof/tasks.md` past GS1.49, did not
check whether GS1.4x work continued past what that file records, did not resolve which of the
two OpenSpec changes (this one vs. `parent-atlas-graph-retrieval-proof`) should be the actual
GS1.3x+/Gate 4-6 owner going forward — that's an explicit operator decision, not something to
guess at by unilaterally merging or deprecating either file.

## GPU algorithm availability inventory (2026-08-24) — bounded fixture proof

Requested to confirm which GPU graph/vector algorithms are actually importable in
`atlas-rapids-cu13` before planning further enhancements (PageRank, n-ary hypergraph, RAG).
The original inventory below remains an availability record. The 2026-08-24 bounded
fixture check additionally executed Jaccard, PageRank, Louvain, and Leiden on a four-node
weighted-graph-compatible fixture. This is still not a proof against the canonical Graphify
snapshot or a promotion/parity result.

| Library | Function | Available? | Notes |
|---|---|---|---|
| `cugraph` 26.06.00 | `pagerank` | ✅ | Top-level namespace |
| `cugraph` 26.06.00 | `betweenness_centrality` | ✅ | Top-level namespace — this repo's live TS `betweenness-analysis-adapter.ts` uses Neo4j GDS, not this; a GPU-native cuGraph path is a separate, unbuilt alternative backend (see `parent-atlas-graph-analysis-contract` Gate 5, "cuGraph parity for kcore/betweenness", not started) |
| `cugraph` 26.06.00 | `louvain` | ✅ | Top-level namespace |
| `cugraph` 26.06.00 | `leiden` | ✅ | Top-level namespace |
| `cugraph` 26.06.00 | `jaccard` / `all_pairs_jaccard` | ✅ | Top-level namespace; bounded fixture execution returned a DataFrame |
| `cugraph` 26.06.00 | `spectralModularityMaximizationClustering` | ✅ | Top-level namespace; callable and separately covered by the spectral fixture path; parity remains unpromoted |
| `cugraph` 26.06.00 | `spectralBalancedCutClustering` | ✅ | Top-level namespace; retained as legacy challenger, not deprecated by this task |
| `cugraph` 26.06.00 | `k_core` | ✅ | Top-level namespace |
| `cugraph` 26.06.00 | `hypergraph` | ✅ | Top-level namespace — **exists as an importable symbol; not inspected further this pass** (signature, whether it's a construction helper vs. a full n-ary hypergraph algorithm suite, and whether it maps onto this repo's own 4-lane hypergraph model in `memory/hypergraph-4-lanes-vault.md` are all unchecked). Flagged as the concrete next research step for the "n-ary hypergraph RAG" enhancement named in this request — do not assume it's a drop-in fit without reading its actual API first. |
| `cuvs` 26.06.00 | `cuvs.neighbors.cagra` (`.build()`, `.search()`) | ✅ | **Not** at `cuvs.cagra` top-level — submodule import required. Already used correctly by `python/atlas_rapids_sidecar.py`'s `/v1/knn/cagra` endpoint. |
| `cuvs` 26.06.00 | `cuvs.cluster.kmeans` (`.fit()`) | ✅ | **Not** at `cuvs.kmeans` top-level — same submodule-import correction as CAGRA above. Not yet wired to any sidecar endpoint (`atlas_rapids_sidecar.py` has `/v1/knn/exact` + `/v1/knn/cagra` only — no `/v1/vector/kmeans` yet, matching this file's own Gate 6 task 6.2, still accurate as "not started" for this specific endpoint). |
| `torch` 2.13.0+cu130 | `torch.cuda.is_available()` | ✅ True | Confirmed live 2026-08-09/10 across two separate checks |

**Conclusion**: the underlying GPU library surface for PageRank/betweenness/Louvain/Leiden/
k-core/hypergraph/CAGRA/KMeans is fully present and importable in `atlas-rapids-cu13` today.
The gap is entirely at the **integration layer** — which of these get wired into
`atlas_rapids_sidecar.py`'s HTTP surface (only exact-KNN + CAGRA currently exposed), and
whether any of them should replace or run alongside the existing live TS/Neo4j-GDS
implementations already proven this session (PageRank, Louvain, Leiden, CheiRank, k-core,
betweenness — all `RUNTIME_SMOKE_PROVEN` via `neo4j-gds-client.ts` /
`betweenness-analysis-adapter.ts`, not cuGraph). Per this repo's own "One Canonical Runtime
Owner Per Capability" rule, wiring a cuGraph-backed alternative for an algorithm that already
has a proven Neo4j-GDS owner must be classified as a `BACKEND` behind that owner, not a second
independent implementation — this applies directly to Gate 5's kcore/betweenness cuGraph
parity tasks in this file.

**Not done this pass**: did not inspect `cugraph.hypergraph`'s actual signature/return shape,
did not wire any new sidecar endpoint, did not run any of these algorithms against real repo
data from WSL2 (only import-level presence confirmed), did not cross-reference this table
against this repo's existing hypergraph model (`memory/hypergraph-4-lanes-vault.md`,
`hypergraph-4d.ts`) to check for a canonical-owner conflict before any future wiring.

The bounded fixture execution does not change that conclusion: it proves callable behavior
on a toy graph only. It does not prove Graphify identity alignment, canonical graph ownership,
spectral CPU/GPU parity, or a retrieval-quality benefit.

### Recommendations (2026-08-10) — bounded next steps, not a mandate to build all of this

Ordered smallest/lowest-risk first. None of these are started; each names its own
prerequisite so they can be picked up independently rather than as one large task.

1. **Inspect `cugraph.hypergraph` before anything else touches "n-ary hypergraph."**
   Read-only: `help(cugraph.hypergraph)` / its source, inside `atlas-rapids-cu13`. Determine
   whether it's (a) a general n-ary hypergraph *construction* helper (turns tabular records
   into a bipartite hyperedge graph — this is cuGraph's actual documented purpose for this
   function upstream, distinct from a hypergraph *algorithm* suite) or (b) something else.
   This determines whether it's even the right tool before any design work starts. Do this
   before writing a single line of hypergraph-RAG integration code — a wrong assumption here
   would misdirect everything downstream of it.
2. **Classify, don't replace, before wiring any GPU backend for an already-proven algorithm.**
   For PageRank/Louvain/Leiden/k-core/betweenness specifically: per this repo's "One Canonical
   Runtime Owner" rule, a cuGraph-backed version must be registered as a `BACKEND` entry
   behind the existing Neo4j-GDS `CANONICAL_OWNER` in
   `docs/architecture/runtime-ownership-registry.json` (extend, don't create a peer file) —
   before writing the adapter, not after. This directly closes
   `parent-atlas-graph-analysis-contract`'s Gate 5 (cuGraph parity for kcore/betweenness,
   currently not started) using infrastructure now confirmed to exist.
3. **Wire `/v1/vector/kmeans` next, not `/v1/vector/pca` or a new hypergraph endpoint.**
   This file's own Gate 6.2 already scopes this exact endpoint, `cuvs.cluster.kmeans` is
   confirmed importable and working, and — per this session's earlier finding — the Karpathy
   GPU Authority Blend's 64-dim autoencoder/manifold work (root `CLAUDE.md`) is a concrete,
   already-documented consumer waiting for exactly this substrate. Smallest real increment
   with an identified downstream user, ahead of speculative hypergraph/RAG work.
4. **Do not build hypergraph-RAG GPU integration until 1-3 are done and this repo's existing
   4-lane hypergraph model is read in full** (`memory/hypergraph-4-lanes-vault.md`,
   `hypergraph-4d.ts`, and whatever OpenSpec change currently owns that model — not identified
   in this pass). The risk named explicitly in recommendation 1 (wrong tool assumption)
   compounds here: building GPU-accelerated hypergraph RAG on a misunderstood
   `cugraph.hypergraph` primitive, without first checking whether it's compatible with or
   redundant against the 4-lane model that already exists, is exactly the "second canonical
   owner created because a library happens to expose a convenient API" failure this repo's
   governance rules name explicitly.
5. **Before any of the above, resolve the two live infrastructure blockers already documented
   in `parent-atlas-graph-analysis-contract/tasks.md`'s "Session cross-cutting to-do list"**:
   the WSL2 sidecar (`atlas_rapids_sidecar.py`) isn't currently running (nothing on port
   8098), and the duplicate host/Docker NLP sidecar process conflict on port 8095 is
   unresolved. Building new GPU endpoints on top of a sidecar that isn't even confirmed
   launchable end-to-end right now would be sequencing work in the wrong order.

## GPU tile-cache / LOD memory hierarchy — DESIGN PROPOSAL ONLY (2026-08-10), NOT STARTED

Operator-authored architecture proposal for how 4D topology coordinates (SOM x/y, authority
bucket, entropy bucket) should route to GPU-resident tensor tiles, once recommendations 1-5
above are actually done. Recorded verbatim-in-substance here so it isn't lost to context
limits — **zero code written against this, nothing below is implemented or proven.**

**Lane split / ownership boundary**:
- Token cache: exact model-state reuse only; key on model/tokenizer/prefix/config revisions,
  never on query similarity.
- Inference: embeddings and generation compute only; do not let it decide identity or
  promotion.
- Retrieval: candidate gathering and reranking only; no canonical truth or schema ownership.
- Feature / geometry: numeric evidence, routing scores, and 4D metric-tensor diagnostics only.
- Graph: PageRank / communities / k-core / betweenness / bounded traversal evidence.
- Hypergraph: n-ary relation and event structure lane for joint facts, not a second retrieval
  owner.

**The one rule that governs everything else**: a 4D routing coordinate selects a *logical
region* (a `TileKey`); it never becomes a GPU memory address directly. Coordinates →
`TileKey` → `TileDirectory` lookup → Arrow row/chunk range → mmap/OS page cache → pinned host
staging → GPU tile cache → GEMM/cuVS/cuGraph kernel. This is explicitly the same shape as a
game-engine world-coordinate → asset/page-table → texture/mesh-page pipeline, not a dense
`[20,20,256,256,768]` tensor (which would be almost entirely empty — quantize into sparse
`(somX, somY, authorityBin, entropyBin) → TileKey` buckets instead, resolving to actual
`packet_key`s only for materialized tiles).

**Proposed LOD ladder** (ACE owns movement between LOD0-5; CUDA owns only the last stage):
`LOD0` Postgres metadata (packet_key/SOM cell/centroid ID) → `LOD1` Valkey/BitFrost tile
manifests → `LOD2` Arrow IPC mmap on NVMe/OS page cache → `LOD3` CPU RAM (selected Arrow
batches) → `LOD4` pinned host staging buffers → `LOD5` GPU VRAM (active tile, CAGRA data,
cuGraph projection, reranker tensors) → `LOD6` register/shared-memory kernel tiles (kernel
lifetime only).

The 20×20 SOM stays a routing surface only, and 4D topology / metric-tensor diagnostics stay
experiment-only. They can inform routing, but they do not become canonical ownership layers.

**Proposed `GpuTileManifest` shape** (TileKey ≠ CUDA pointer — pointer is ephemeral execution
state, TileKey is deterministic lineage): `tileKey`, `artifactId`/`artifactRevision`,
`rowStart`/`rowCount`, `representationId`/`representationRevision` (ties directly into this
session's already-resolved representation-lineage work — see
`parent-atlas-semantic-768-canonical-contract`), `dtype`, `hostState` (`COLD`/`MMAPPED`/
`PINNED`), `gpuState` (`ABSENT`/`PREFETCHING`/`RESIDENT`/`IN_USE`), `byteLength`, `utility`,
`lastUsedAt`, `pinCount`.

**Proposed eviction rule**: VRAM-pressure threshold triggers `ACE.evictionNeeded()`; ACE (not
a hardcoded LRU) ranks candidates by a utility function
`U = α·relevance + β·authority + γ·execution-utility + δ·predicted-near-future-use −
λ·VRAM-bytes − μ·transfer-cost`, promoting/demoting by utility-per-byte. Double-buffering
(two pinned host buffers + two GPU buffers, overlapping H2D transfer on one CUDA stream with
compute on another) is the proposed mechanism for hiding transfer latency, analogous to
loading the next game-world area while the current one renders.

**Four distinct "graphs" that must never inherit each other's semantics** — proposed as an
explicit architecture-doc callout, since the naming collision risk is real:
`Neo4j/GDS graph` = program topology (this session's PageRank/Louvain/Leiden/CheiRank/k-core/
betweenness work) · `cuGraph` = GPU graph algorithm library (see the availability inventory
above) · `CUDA Graph` = a captured, repeated GPU execution DAG for orchestration-overhead
reduction (NVIDIA's stream-ordered/graph memory-pool allocator is the proposed mechanism for
avoiding per-query `cudaMalloc`/`cudaFree` churn) · `HNSW graph` = an ANN implementation
detail internal to Qdrant, unrelated to the other three.

**Proposed artifact-type separation** (do not Merkle/hash/cache these as though
interchangeable): `.arrow` = data (uncompressed for HOT/WARM tiles for near-zero-copy mmap
reads; ZSTD for COLD archival only, per Arrow's own documented compression/zero-copy
tradeoff) · `.cubin`/PTX = GPU program (cuTile's compiled output) · `.exe`/`.dll`/`.node` =
host program (`tensorrt_bridge.node` already lives in the last category).

**cuTile and CUDA Graphs — explicitly classified as later, optional layers, not
foundations**: cuTile Python (NVIDIA's tile-oriented GPU kernel programming model) would be a
`GPU KERNEL BACKEND EXPERIMENT` if adopted — it decides how a kernel processes an
already-resident tile, it does not decide tile residency (that stays ACE's job). Its current
BASIC-tier prerequisites reportedly require CUDA Toolkit 13.1+ and an R580+ driver — **not
confirmed against this repo's actual WSL2 toolkit version this pass**; do not adopt until
that's checked. CUDA Graph capture is proposed only after tile shapes/hot-path structure
stabilize — capturing a still-changing search program prematurely would lock in the wrong
DAG.

**IndexedDB explicitly scoped out of server/workstation use**: proposed only as the
browser-client-side analog of the Postgres/Valkey metadata directory (for offline/UI state),
never as a server-side substitute — Postgres+Valkey already fill that role here.

**The concrete, smallest recommended next proof** (deliberately bounded — not the whole
architecture at once): Arrow `semantic_768` artifact → mmap a selected batch (proposed: 4096
rows) → pack into a pinned host buffer → async H2D copy → GPU-resident `[4096,768]` tile →
exact `q·Xᵀ` GEMM (via cuVS exact/PyTorch matmul, explicitly **not** a hand-rolled GEMM
kernel — recommendation 2 above ("don't implement another Atlas GEMM") applies here too) →
top-k → compare against the existing exact-KNN oracle already proven in
`parent-atlas-graph-retrieval-proof`'s GS1.3x work. Measure and record, per-stage:
mmap/page-in time, host-pack time, H2D transfer time, GEMM time, top-k time, total, and VRAM
bytes used. Only after this single-tile proof runs and its numbers are recorded should
double-buffering, then an ACE-driven tile cache, then (optionally, if profiling justifies it)
CUDA Graph capture or cuTile be attempted — in that order, not in parallel.

This full tile-cache / LOD hierarchy is design-only until the simpler vector proof is live.

**Explicitly not started**: no `TopologyTileKey`/`GpuTileManifest`/`TilePlanner` types written,
no centroid-matrix GEMM prefilter built, no Arrow artifact produced or mmap'd, no pinned
buffers allocated, no double-buffering, no CUDA Graph capture, no cuTile evaluation. This
section exists purely so the design survives past this session's context limit.

**Operator-confirmed sequencing (2026-08-10)**: agreed order is (1) fix the 8095 sidecar
process split + confirm 8098's actual running state — a real blocker, not just sequencing
hygiene, (2) wire `/v1/vector/kmeans`, (3) inspect `cugraph.hypergraph`'s API, (4) classify
GPU backends as `BACKEND`s not new owners, (5) hold hypergraph-RAG until 1-4 land.

**Import-order fragility re-flagged**: operator reported `cugraph` failing to import with a
CUDA/cublas ABI mismatch in a live check. Re-verified this pass: standalone
`import cugraph` succeeds cleanly (`26.06.00`) in `atlas-rapids-cu13`, matching this session's
earlier check — not broken in isolation. Most likely explanation, not independently
re-confirmed this pass: the already-documented GS1.33 finding in `atlas_rapids_sidecar.py`'s
own header comment — `torch` must be imported before `cudf`/`cugraph` in the same process, or
a `cublasLtZZZMatmulAlgoGetHeuristicForStream` symbol conflict occurs between PyTorch's
bundled CUDA libs and the conda RAPIDS build. If the operator's failing check combined
imports in a different order than the sidecar's careful sequencing, that would reproduce a
failure a standalone `import cugraph` won't show. **Not resolved as fact — needs the exact
combined-import sequence re-tested before treating either result as final.** This directly
supports recommendation 5 above: infra must be confirmed trustworthy before any new GPU proof
built on top of it is itself trustworthy.

## HANDOFF — deferred topics for next session (2026-08-10), scoped searches only, no reading done

Three topics raised this session, explicitly deferred rather than answered shallow (context
was at ~28% remaining at deferral time). Scoped `rg -l` searches run to locate candidate files
— **files listed below have not been read or verified this pass**, only located by filename
match. Next session should read them before answering, not assume the list is complete or
that every listed file is actually relevant (some `-i` matches below are noisy).

1. **Token caching / inference retrieval** — candidate files, not yet read:
   `src/lib/server/inference/turbo-prefix-cache.ts`, `src/lib/server/ai/bifrost-cache-manager.ts`,
   `src/lib/server/retrieval/centroid-cache.ts`, `src/lib/server/cache-keys.ts`,
   `src/lib/server/cache-config.ts`, `src/lib/server/cache.ts`. Cross-reference against root
   `CLAUDE.md`'s "Redis L1 + Bifrost L2 Cache System" section (already documented, may already
   answer most of this question without new code reading).
2. **NES glyph / CHR97 architecture** — real, concrete, confirmed to exist as a directory:
   `src/lib/server/cartridge/{index.ts, glyph-tile-engine.ts, glyph-record.ts,
   chr97-builder.ts, glyph-mappers.ts}`. Root `CLAUDE.md`'s "Known False Negatives" section
   already flags `chr97-builder.ts`/`cartridge-tensor-bridge.ts` as real-but-easy-to-miss —
   start there. This is the most concrete of the three deferred topics; likely the fastest to
   actually answer next session.
3. **4D vector metric tensor calculations** — **no dedicated implementation found** (empty/
   noisy search results, no clean hits). Consistent with this session's earlier finding (see
   this repo's `parent-atlas-semantic-768-canonical-contract` and the entropy-tokenization
   design review recorded there): a 4D-manifold/Riemannian-metric-tensor design was explicitly
   reviewed and **deferred as research, not built** — "Mahalanobis baseline first, no
   production geodesic routing," per that review. If the operator wants actual metric-tensor
   math, it does not exist in this codebase yet — this would be new work, not a discovery task.
   Keep this lane in the workstation doc as feature / geometry only; it should not become an
   identity or transport owner.

**Not done**: no file in any of the three lists above was opened/read this pass. Next session
should read the cartridge/ directory first (topic 2, most concrete), then decide whether
topics 1 and 3 need code investigation or are already answered by existing documentation.

**Additional deferred brainstorm terms (2026-08-10, same handoff, not investigated)** —
recorded verbatim as a keyword index only, zero searches run against any of these: QLoRA
adapter memory swaps; NES/CHR-texture-shader-style hot/warm/cold LOD (overlaps directly with
this file's own GPU tile-cache LOD0-6 proposal above — read that section first before treating
this as separate); 20×20 KMeans/SOM as a state machine with swap transitions; simdjson-driven
GPU interpolation (note: simdjson is CPU-only per this file's earlier architecture
clarification — "GPU interpolation via simdjson" as literally stated is a likely category
error, needs the operator's actual intent clarified, not guessed at); DLSS-style subsampling;
low-rank projections; Jacobian-space alignment to a canonical payload (overlaps with this
session's already-resolved representation-lineage work in
`parent-atlas-semantic-768-canonical-contract` — read that first); agentic dense search over
indexed floating-point tensors retrieved via Apache Arrow IPC; graph rotations / matrix
transpose under a metric-defined ontology-linked DAG; GPU-accelerated KAG/hypergraph-RAG
n-ary matching (overlaps with the `cugraph.hypergraph` API-inspection recommendation above);
`.okf` schema Zod validation (see `parent-atlas-okf-knowledge-layers` — not cross-checked this
pass). **Next session: do not treat this list as a spec or a plan — it is unread keywords
only, several of which likely collapse into sections already written above once actually
investigated (LOD, representation-lineage, hypergraph API). Cross-reference before designing
anything new from it.**

### Phase 30: Hypergraph / Multi-hop Traversal Experiment

**Purpose**: Keep n-ary evidence and multi-hop traversal separate from the canonical retrieval
lane until the live API shape is inspected and the simpler vector / graph lanes are proven.
- Status: design-only
- Keywords: `hyperedge` → `ontology_tuple` → `multi_hop` → `HNSW` → `TileKey`
  → `IndexDB` → `shader_cache`
- Hypergraph facts: joint events, linked ontology tuples, and repair/evidence bundles only.
- Traversal facts: bounded multi-hop graph programs only; never expose raw endless traversal.
- Memory facts: TileKeys and LOD swaps remain a logical cache model, not a GPU pointer layout.
- 20×20 SOM and 4D manifold diagnostics can feed this lane later, but they are not the owner.
- Do not start hypergraph-RAG until the API inspection, backend classification, kmeans wiring,
  and live sidecar blockers are resolved.
