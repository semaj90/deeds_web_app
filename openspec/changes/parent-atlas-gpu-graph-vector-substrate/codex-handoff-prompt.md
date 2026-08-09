# Codex hand-off prompt — GPU graph/vector substrate + 3-gate execution

Paste everything below this line into a fresh Claude Codex session with no prior
context on this repository. It is self-contained.

---

You're working in `C:\Users\james\Videos\deeds-web-app`, a large SvelteKit + Postgres +
Neo4j + Qdrant + RAPIDS-GPU legal-AI codebase ("Parent Atlas"). This repo tracks large
plans as OpenSpec changes under `openspec/changes/<slug>/` (README.md/proposal.md for
narrative + why, design.md for how, tasks.md for a checkbox task list) and enforces a
**gate-by-gate discipline**: never bulk-implement a large plan; audit before coding;
write findings into tasks.md/README.md as you go, using this repo's status-language
convention (`CREATED | WIRED | DRY_RUN_PROVEN | RUNTIME_SMOKE_PROVEN | APPLY_PROVEN |
NOT_PROVEN` — never claim "production-ready" from a single run).

**Your task**: execute
`openspec/changes/parent-atlas-gpu-graph-vector-substrate/tasks.md`, starting at
Gate 1, Task 1.1. Read that change's `proposal.md` and `design.md` first — they
contain the full architecture decision and the API research below, embedded so you
don't need to re-fetch it.

## What's already live — do not duplicate

- **`sveltekit-frontend/src/lib/server/graph/pagerank-analysis-adapter.ts`** — a
  PageRank adapter wrapping `neo4j-gds-client.ts::runPageRankClient`.
  `RUNTIME_SMOKE_PROVEN`: run `npx tsx scripts/atlas/run-pagerank-analysis.mts` from
  `sveltekit-frontend/` to see it execute live (58,546 resolved packets, zero
  duplicates, zero non-finite values, reproducible).
- **`sveltekit-frontend/src/lib/server/graph/graph-analysis-runner.ts`** — a
  dispatcher (`runGraphAnalysis()`) covering `pagerank | louvain | leiden | cheirank |
  kcore | betweenness`. `pagerank` and `louvain` are real, live-verified
  implementations (`npx tsx scripts/atlas/run-louvain-analysis.mts`). `leiden`,
  `cheirank`, `kcore`, `betweenness` are honest `runSkippedAnalysis(...)` stubs with
  specific reasons — not silently absent, not falsely done.
- **`sveltekit-frontend/src/lib/server/graph/graph-packet-key-resolver.ts`** — the
  ONLY correct way to resolve a Neo4j `CodebaseFile.path` to a Postgres
  `atlas_packets.packet_key` (exact match or `sveltekit-frontend/`-prefixed match on
  `source_ref`, ~94% resolution rate on this repo's graph). **Never** use Neo4j's
  coalesced `stableKey`/`filePath`/`relativePath`/`name` property as an identity value
  directly — root `CLAUDE.md`'s "Forbidden Identity Sources" section bans
  `stable_key`-style pseudo-refs, and this was a real bug found and fixed this
  session (Louvain's adapter originally did exactly this).
- **`python/atlas_rapids_sidecar.py`** (port 8098) — a live GPU sidecar.
  `GET /health`, `GET /v1/capabilities` (reports `knn.exact` and `knn.cagra`
  capabilities separately), `POST /v1/knn/exact` (cuVS `brute_force.search()`,
  fail-closed with typed error codes: `DIMENSION_MISMATCH`, `MISSING_PACKET_IDENTITY`,
  `MISSING_REVISION_IDENTITY`, `DUPLICATE_CORPUS_IDENTITY`, `INVALID_TOPK`,
  `CORPUS_TOO_LARGE`, `EMPTY_CORPUS`, `INSUFFICIENT_GPU_MEMORY`, `DEADLINE_EXPIRED`,
  `CUVS_UNAVAILABLE`). `RUNTIME_SMOKE_PROVEN`. TypeScript client:
  `gpu-sidecar-client.ts`. Owned by
  `openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/` — coordinate with
  that change's tasks.md, don't fork a second sidecar.
- **`sveltekit-frontend/src/lib/server/db/schema/graph-analysis-runs.ts`** — live
  Postgres tables `graph_analysis_runs`, `graph_node_metrics`,
  `graph_community_assignments`, `graph_communities`, extended with a shared
  `AnalysisRunEnvelopeSchema` (`backendPreference`/`backendActual`:
  `native-ts | rust | python-sidecar | gpu-sidecar | offline`, `gpuAccelerated`,
  `sidecarUrl`, `inputHash`, `outputHash`). Every analysis result — Neo4j-GDS-backed
  or cuGraph/cuVS-sidecar-backed — writes through this one contract.

**Known real bug pattern from this session, watch for it repeating**: this repo had
**5 independent, competing PageRank implementations** before Patch C — most dead code
or fixture-only, only one (`neo4j-gds-client.ts::runPageRankClient`) actually
runtime-proven. Before implementing anything that sounds like it might already exist
(a traversal helper, a vector-search wrapper, an identity resolver), grep for it
first. This repo's own audit discipline exists because this exact mistake already
happened once.

## Researched API surface (fetched live 2026-08-09 — use this, don't re-fetch unless it's stale)

**cuGraph** (`docs.rapids.ai/api/cugraph/stable/api_docs/`):
- Graph construction: `cugraph.Graph.from_cudf_edgelist()` (primary),
  `from_pandas_edgelist()`, `from_numpy_array()`; directed/undirected at construction.
- BFS: `cugraph.bfs()`, `cugraph.bfs_edges()`, `cugraph.dask.traversal.bfs.bfs()`
  (multi-GPU).
- SSSP: `cugraph.sssp()`, `cugraph.dask.traversal.sssp.sssp()`,
  `cugraph.shortest_path()`, `cugraph.shortest_path_length()`.
- Returns GPU-resident `device_uvector` distances + predecessors directly — real
  values, no external service round-trip needed if colocated with the sidecar.
- Also has `core_number` (k-core) and `betweenness_centrality` — directly usable for
  this repo's `kcore`/`betweenness` stubs (Gate 5, offline-GPU-parity alternative to
  a future Neo4j-GDS implementation of the same algorithms — not a replacement for
  Neo4j GDS's query-time role).

**cuVS** (`docs.rapids.ai/api/cuvs/stable/python_api/`):
- Exact KNN: `brute_force.build()`/`brute_force.search()`/`brute_force.Index` —
  already what the live `/v1/knn/exact` endpoint uses.
- CAGRA (approximate ANN): `cagra.IndexParams`/`cagra.SearchParams`/`cagra.build()`/
  `cagra.search()`/`cagra.Index` (`save`/`load`/`extend`) — capability discovered,
  no live endpoint yet (Gate 6).
- KMeans: `kmeans.KMeansParams` (`n_clusters`)/`kmeans.fit()`/`kmeans.predict()`/
  `kmeans.cluster_cost()`.
- PCA: `pca.Params` (`n_components`)/`pca.fit()`/`pca.fit_transform()`/
  `pca.transform()`/`pca.inverse_transform()`.
- All operate directly on GPU-resident CuPy/cuDF arrays.

**Qdrant built-in BM25** (`qdrant.tech/documentation/inference/inference-bm25/`):
model id `"qdrant/bm25"`; index with
`{"vector": {"<field>": {"text": "...", "model": "qdrant/bm25"}}}`; query with
`{"query": {"text": "...", "model": "qdrant/bm25"}, "using": "<field>"}`. A
**complement** to dense search (hybrid), not a replacement. Flagged as a Gate 2
candidate only — audit `src/lib/server/retrieval/` for an existing lexical lane
before adopting; not adopting is a valid outcome.

## The 3 execution gates (this change's tasks.md has full detail — this is the summary)

1. **Gate 1 — Lock graph ownership**: a dispatcher/registry test for
   `runGraphAnalysis()` + a live Louvain persistence verifier (formalize the
   ad-hoc verification queries into a repeatable script, matching
   `scripts/atlas/run-pagerank-analysis.mts`'s pattern).
2. **Gate 2 — Finish retrieval identity/fusion**: canonical identity, same-lane
   dedup, one logical RRF vote per lane, fail-open reranking, orphan owner
   classification. **Read `openspec/changes/parent-atlas-retrieval-fusion-reachability/`
   in full first** — it owns the RRF/fusion census (RF2/RF6), this gate closes its
   remaining scope, it doesn't restart it.
3. **Gate 3 — Frozen-revision E2E**: PageRank run → promoted authority → canonical
   retrieval → `FeatureRow` → cross-encoder rerank → MMR → evidence, with a replay
   fixture pinned to one `graphRevision`, run twice independently to prove
   determinism. **Check `openspec/changes/phase-2f1-real-evaluation-corpus/` first**
   for an existing labeled query corpus before building a new one.

Only after all three are green does the GPU-substrate expansion work (topology
programs, cuGraph kcore/betweenness parity, cuVS CAGRA/KMeans/PCA endpoints) start —
see tasks.md sections 4–6. After those, the later infrastructure ordering is: Rust
`AstUnit`/chunk lineage → wide `ExperimentFeatureMatrix` → this change's RAPIDS/cuVS
vector exact/KMeans contract → **only then** F19/F20 reranker evidence, AST-aware
refinement, CodeBERT/GraphCodeBERT, SOM, manifold coordinates, and custom CUDA tiling,
as consumers of the substrate, not independent builds. Do not start section 7 under
this task list.

## Typed topology programs (for later, Gate 4 — included here so the shape is clear from the start)

Agentic error-fixing gets bounded, typed queries instead of raw graph access:

```
ERROR_REPAIR:       seed=failing symbol,  projection=atlas_execution_v1,  edges=CALLS|REFERENCES|RETURNS,        depth<=3
TEST_IMPACT:        seed=changed symbol,  projection=atlas_test_v1 (NEW), edges=TEST_COVERS_FILE|IMPORTS|CALLS,  depth<=3
DEPENDENCY_REPAIR:  seed=missing/broken,  projection=atlas_dependency_v1, edges=IMPORTS|REQUIRES|IMPLEMENTS|EXTENDS, depth<=3
```

`atlas_dependency_v1`/`atlas_execution_v1` already exist in
`sveltekit-frontend/src/lib/server/graph/graph-projection-manifest.ts`'s
`NAMED_PROJECTION_CANDIDATES`. `atlas_test_v1` must be added. Small requests route
through Neo4j APOC bounded expansion (`apoc.path.expandConfig`); larger ones route
through the cuGraph BFS/SSSP sidecar — same response shape (real distances +
predecessors) either way.

## Your first action

Start with **Gate 1, Task 1.1**: write the dispatcher/registry test for
`graph-analysis-runner.ts::runGraphAnalysis()`. Before writing it, run
`npx tsgo --noEmit` from `sveltekit-frontend/` to get today's baseline error count —
your changes must not increase it. Read `tasks.md`'s "0. Pre-flight" section and
complete task 0.1 (verify the sidecar is still live) before anything else, since Gate
1's work assumes it.
