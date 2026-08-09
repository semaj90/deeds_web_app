## Context

This session (2026-08-09) proved live, in `parent-atlas-graph-analysis-contract`:
- **Patch C** — a PageRank adapter wrapping `neo4j-gds-client.ts::runPageRankClient`,
  the only one of 5 competing PageRank implementations in this repo with a runtime
  proof against the live graph. `RUNTIME_SMOKE_PROVEN`: 58,546 resolved
  `graph_node_metrics` rows, zero duplicates, zero non-finite values, reproducible
  across two independent runs.
- **Patch D (Louvain half)** — `graph-analysis-runner.ts::runGraphAnalysis()`, a
  dispatcher covering `pagerank | louvain | leiden | cheirank | kcore | betweenness`,
  found already substantially built via a concurrent edit and hardened (fixed a raw
  `stable_key`-as-identity bug — forbidden per root `CLAUDE.md` — by extracting a
  shared `graph-packet-key-resolver.ts`; fixed a `gds.louvain.mutate` idempotency bug
  on projection re-use). Live result: 58,546 packets across 36,563 communities, 88.6%
  singletons — evidence the current single "codeTopology" projection produces
  degenerate communities, reinforcing that README point 10 (compare community quality
  across relationship-typed projections before tuning) is a real, not theoretical,
  problem.
- `leiden`, `cheirank`, `kcore`, `betweenness` remain honest `runSkippedAnalysis(...)`
  stubs with specific reasons, not silently absent.

Separately, `parent-atlas-gpu-sidecar-patch-tournament` already runtime-proved a real
GPU sidecar: `python/atlas_rapids_sidecar.py` (port 8098) — `GET /health`,
`GET /v1/capabilities` (reports `knn.exact` and `knn.cagra` capabilities separately),
`POST /v1/knn/exact` using cuVS `brute_force.search()`, with fail-closed guards
(`DIMENSION_MISMATCH`, `MISSING_PACKET_IDENTITY`, `MISSING_REVISION_IDENTITY`,
`DUPLICATE_CORPUS_IDENTITY`, `INVALID_TOPK`, `CORPUS_TOO_LARGE`, `EMPTY_CORPUS`,
`INSUFFICIENT_GPU_MEMORY`, `DEADLINE_EXPIRED`, `CUVS_UNAVAILABLE`) and a TypeScript
client (`gpu-sidecar-client.ts`). CAGRA is capability-discovered but has no live
endpoint yet.

`parent-atlas-graph-runtime-enhancement` already established the intended 3-layer
split this design extends, not replaces:

| Layer | Owns | Failure domain |
|---|---|---|
| APOC Core (query-time) | Bounded, filtered neighborhood expansion (`apoc.path.expandConfig`) | Neo4j |
| Neo4j GDS (analytics) | BFS, Dijkstra, PageRank, PPR, Louvain, Leiden, similarity | Neo4j |
| RAPIDS/cuGraph sidecar (offline, GPU) | High-volume algorithm parity/acceleration | **Separate from Neo4j** — GPU crashes/memory pressure must never take Neo4j down |

The explicit non-goal already on record: "don't embed CUDA/cuVS/cuGraph inside a
Neo4j Java plugin." This design's job is filling in the third layer's actual API
surface, which was previously named but not specified.

## Goals / Non-Goals

**Goals:**
- Establish cuGraph (traversal + centrality) and cuVS (ANN + KMeans + PCA) as the
  one GPU substrate other features build on, closing the "5 competing PageRank
  implementations" failure mode before it repeats for k-core/betweenness/clustering.
- Give agentic error-fixing a typed, bounded query surface (topology programs)
  instead of raw graph access, using cuGraph BFS/SSSP to return real
  distances/predecessors for larger requests.
- Sequence remaining GPU/vector work (Rust AstUnit/chunk lineage, wide
  `ExperimentFeatureMatrix`, RAPIDS/cuVS "vector exact/KMeans" contract) ahead of
  F19/F20 reranker evidence, AST-aware refinement, CodeBERT/GraphCodeBERT,
  SOM/manifold/custom-CUDA-tiling, so the latter are built as substrate consumers.

**Non-Goals:**
- No new standalone GPU service. Every new endpoint is added to the existing
  `atlas_rapids_sidecar.py` (port 8098) — coordinate with
  `parent-atlas-gpu-sidecar-patch-tournament`, don't fork it.
- No custom CUDA kernels for BFS/SSSP/k-core/betweenness/KMeans/PCA — cuGraph and
  cuVS already implement all of these; building bespoke CUDA for any of them before
  exhausting the library API repeats this session's 5-PageRank-implementations
  mistake.
- No replacement of the Neo4j GDS query-time path (Patch C/D). The cuGraph sidecar
  is an **offline GPU-parity alternative**, not a migration — Neo4j GDS stays the
  default for interactive/bounded requests; cuGraph is for high-volume/large-depth
  requests where GDS's single-process model is the bottleneck.
- No implementation in this change. Capture/plan only, per this repo's gate-by-gate
  discipline (see `parent-atlas-agentic-repair-bundle-integration`).

## Decisions

### D1 — cuGraph BFS/SSSP over custom CUDA traversal

**Decision**: use cuGraph's `bfs()`/`bfs_edges()`/`sssp()`/`shortest_path()`/
`shortest_path_length()` (plus `dask.traversal.bfs.bfs()` /
`dask.traversal.sssp.sssp()` for multi-GPU) for any GPU-side graph traversal.

**API surface** (fetched live from `docs.rapids.ai/api/cugraph/stable/api_docs/`,
2026-08-09 — embedded here so implementers don't need to re-fetch):
- Graph construction: `cugraph.Graph.from_cudf_edgelist()` (primary, from cuDF
  DataFrames), `from_pandas_edgelist()`, `from_numpy_array()`; directed/undirected
  specified at construction.
- `cugraph.bfs()` — single-GPU BFS. `cugraph.bfs_edges()` — returns traversed edges.
- `cugraph.sssp()` — single-GPU SSSP. `cugraph.shortest_path()` /
  `shortest_path_length()` — higher-level path/distance-only variants.
- Returns: GPU-resident `device_uvector` distances + predecessors — real values, not
  approximations, and usable directly without round-tripping through a separate
  service if colocated with the sidecar process.
- cuGraph also implements `core_number` (k-core) and `betweenness_centrality` —
  directly applicable to this repo's existing `runSkippedAnalysis('kcore', ...)` and
  `runSkippedAnalysis('betweenness', ...)` stubs in `graph-analysis-runner.ts` as an
  **offline GPU-parity implementation**, distinct from (not replacing) a future
  Neo4j-GDS-based implementation of the same two algorithms.

**Alternatives considered**: custom CUDA kernel per algorithm (rejected — this repo's
own architecture notes already forbid this path: "don't embed CUDA/cuVS/cuGraph
inside a Neo4j Java plugin"; a bespoke kernel is strictly more custom code to
maintain than calling a library function). Keeping traversal Neo4j-GDS-only
(rejected — GDS is a single Neo4j process; large/high-fanout traversals for
agentic error-fixing at scale are exactly cuGraph's design target, and GDS/APOC
already own the query-time layer per the existing 3-layer split above).

### D2 — cuVS for exact/CAGRA ANN, KMeans, PCA (extends the live sidecar, doesn't replace it)

**API surface** (fetched live from `docs.rapids.ai/api/cuvs/stable/python_api/`,
2026-08-09):
- Exact KNN: `brute_force.build()` / `brute_force.search()` / `brute_force.Index`
  (`save()`/`load()`) — **already the implementation behind the live
  `POST /v1/knn/exact` endpoint**, no change needed there.
- CAGRA (approximate ANN): `cagra.IndexParams` / `cagra.SearchParams` /
  `cagra.build()` / `cagra.search()` / `cagra.Index` (`save()`/`load()`/`extend()`) —
  capability already discovered (`knn.cagra`) but no live endpoint; this design's
  scope includes wiring one.
- KMeans: `kmeans.KMeansParams` (`n_clusters`) / `kmeans.fit()` / `kmeans.predict()` /
  `kmeans.cluster_cost()` (inertia).
- PCA: `pca.Params` (`n_components`) / `pca.fit()` / `pca.fit_transform()` /
  `pca.transform()` / `pca.inverse_transform()`.
- All operate directly on GPU-resident CuPy/cuDF arrays — no CPU round-trip needed
  inside the sidecar process.

**Why this matters for the later infrastructure ordering**: SOM, manifold
coordinates, and the 64-dim autoencoder currently discussed elsewhere in this repo
(see root `CLAUDE.md`'s Karpathy GPU Authority Blend section) are all candidates to
sit on top of cuVS's KMeans/PCA instead of hand-rolled equivalents, once the vector
exact/KMeans contract (later infrastructure phase, not this change) exists.

### D3 — Qdrant built-in BM25 as a hybrid-lane candidate (flagged, not adopted here)

**API surface** (fetched live from `qdrant.tech/documentation/inference/inference-bm25/`,
2026-08-09): model identifier `"qdrant/bm25"`, configured per sparse vector field.
Indexing: `{"vector": {"<field>": {"text": "...", "model": "qdrant/bm25"}}}`. Query:
`{"query": {"text": "...", "model": "qdrant/bm25"}, "using": "<field>"}`. Generates
sparse embeddings server-side; explicitly a **complement** to dense vector search
(hybrid pattern), not a replacement.

**Decision**: flag as a candidate to simplify/replace any hand-rolled BM25/lexical
scoring already in `sveltekit-frontend/src/lib/server/retrieval/` — do not adopt in
this change. Whoever picks this up in Gate 2 (retrieval identity/fusion) must first
check what lexical-lane implementation already exists (the unified retrieval pipeline
references an "rg lexical" signal in its 6-signal blend) before introducing a second
BM25 implementation — this repo has hit the "N competing implementations of the same
thing" failure mode enough times this session alone (5 PageRank paths) that a
pre-adoption audit is mandatory, not optional.

### D4 — Typed topology programs, not raw graph access, for agentic error fixing

**Decision**: define three named, bounded query shapes instead of giving an LLM
agent direct Cypher/graph access:

```
ERROR_REPAIR
  seed = failing symbol
  projection = atlas_execution_v1
  edges = CALLS | REFERENCES | RETURNS
  depth <= 3

TEST_IMPACT
  seed = changed symbol
  projection = atlas_test_v1   -- NEW, see below
  edges = TEST_COVERS_FILE | IMPORTS | CALLS
  depth <= 3

DEPENDENCY_REPAIR
  seed = missing/broken symbol
  projection = atlas_dependency_v1
  edges = IMPORTS | REQUIRES | IMPLEMENTS | EXTENDS
  depth <= 3
```

`atlas_dependency_v1` and `atlas_execution_v1` already exist in
`graph-projection-manifest.ts`'s `NAMED_PROJECTION_CANDIDATES`. `atlas_test_v1` is
new — must be added (edge set: `TEST_COVERS_FILE`, `IMPORTS`, `CALLS`) alongside the
existing four.

**Execution routing**: small requests (shallow depth, few seeds) go through Neo4j
APOC bounded expansion (`apoc.path.expandConfig`) at query time, per the existing
layer split. Larger/heavier requests route to the cuGraph BFS/SSSP sidecar endpoint
(D1), returning the same real-distance/predecessor shape either way — the caller
(agent) shouldn't need to know which backend served the request, only that the
response is bounded and typed.

**Alternatives considered**: unbounded Cypher access for the agent (rejected —
exactly the "give it the graph" anti-pattern this design exists to avoid; no depth
bound means no cost bound, and no typed edge-set means the agent can wander into
irrelevant relationship types). A single generic "traverse" tool with free-form
parameters (rejected — loses the ability to reason about what each program is *for*;
three named programs each with a fixed edge-set are auditable, a generic traversal
tool is not).

## Risks / Trade-offs

- **[Risk]** cuGraph/cuVS require CUDA + RAPIDS environment parity with the already-
  frozen `atlas-rapids-cu13` environment (`parent-atlas-gpu-sidecar-patch-tournament`
  Part A) — a version mismatch here breaks the existing exact-KNN endpoint too.
  → **Mitigation**: extend the existing sidecar process/environment, never a second
  one; any new endpoint must pass the same live health/capability checks before
  merging.
- **[Risk]** Running cuGraph BFS/SSSP colocated with cuVS KNN in one sidecar process
  risks one algorithm's GPU memory pressure starving the other.
  → **Mitigation**: reuse the existing `ATLAS_RAPIDS_KNN_MIN_FREE_GPU_MB`-style
  fail-closed guard pattern per-endpoint, not globally — each new endpoint gets its
  own memory floor check before executing.
- **[Risk]** Adding a cuGraph-backed k-core/betweenness path alongside a future
  Neo4j-GDS-backed one risks the same "which one is actually live" confusion Patch C
  found with 5 competing PageRank implementations.
  → **Mitigation**: every result, regardless of backend, still writes through the
  same `graph_analysis_runs`/`graph_node_metrics` contract from
  `parent-atlas-graph-analysis-contract`, with `backendPreference`/`backendActual`
  (`native-ts | gpu-sidecar | ...`) recording which one actually ran — this is
  exactly what `AnalysisRunEnvelopeSchema` was built for.
- **[Trade-off]** Sequencing Gates 1–3 before further GPU-substrate expansion delays
  CAGRA/KMeans/PCA endpoint work. Accepted deliberately — Gate 3 (frozen-revision E2E)
  is the proof that the existing PageRank/Louvain work actually reaches retrieval;
  expanding the GPU substrate before that proof exists risks building on an unproven
  foundation, the same mistake this session's pre-flight audits were built to catch.

## Migration Plan

Not applicable — this change adds new endpoints/contracts, it does not migrate or
remove any existing live behavior. Rollback is "don't call the new endpoints";
nothing existing depends on them yet.

## Open Questions

- Does `atlas_rapids_sidecar.py`'s process model support colocating cuGraph
  Graph-object construction with the existing cuVS index build/search without a
  restart between calls? Needs a live check before Gate-adjacent work assumes it.
- Should `TEST_IMPACT`'s `atlas_test_v1` projection be a genuinely separate GDS/cuGraph
  projection, or a filtered view over `atlas_execution_v1` plus `TEST_COVERS_FILE`?
  Affects whether it needs its own `ensureProjectionClient()` call or can reuse an
  existing one with an edge-type filter.
- Gate 2's BM25 audit (D3) may conclude no change is needed at all if an existing
  lexical lane already covers this well — that's a valid Gate 2 outcome, not a
  requirement to adopt Qdrant's `qdrant/bm25`.
