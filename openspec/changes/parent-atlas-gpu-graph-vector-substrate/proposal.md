## Why

This repo already has independent, working pieces of GPU/graph/vector infrastructure
(Neo4j GDS PageRank/Louvain — just proven live in `parent-atlas-graph-analysis-contract`
Patch C/D; a live cuVS exact-KNN sidecar in `parent-atlas-gpu-sidecar-patch-tournament`;
F19/F20 reranker evidence, AST-aware chunking, CodeBERT/GraphCodeBERT experiments,
SOM/manifold/custom-CUDA-tiling scattered across `src/lib/gpu/` and
`src/lib/server/graph/`) with no shared substrate underneath them. The risk, already
realized once this session (Patch C/D found 5 competing PageRank implementations, only
one runtime-proven), is that every new capability reinvents graph traversal or vector
math instead of sharing one GPU layer. cuGraph already supplies BFS and SSSP with
real distances/predecessors, and cuVS already supplies exact/CAGRA ANN plus KMeans and
PCA — building custom CUDA for any of these before those are exhausted repeats the
same duplication this repo's other changes exist to stop.

## What Changes

- Establish RAPIDS **cuGraph** (traversal: BFS/SSSP; analytics: k-core, betweenness
  centrality) and **cuVS** (exact/CAGRA ANN, KMeans, PCA) as the canonical shared GPU
  substrate, extending the already-live `python/atlas_rapids_sidecar.py` (port 8098,
  `RUNTIME_SMOKE_PROVEN` exact-KNN) rather than standing up a second GPU service.
- Define a typed "topology program" contract (`ERROR_REPAIR`, `TEST_IMPACT`,
  `DEPENDENCY_REPAIR`) so agentic error-fixing gets bounded seed/projection/edges/depth
  queries instead of raw graph access — executable via Neo4j APOC (query-time, small
  requests) or the cuGraph BFS/SSSP sidecar (larger/heavier requests), always returning
  real distances/predecessors.
- Sequence three prioritized execution gates (graph ownership lock-in, retrieval
  identity/fusion completion, frozen-revision end-to-end proof) ahead of any further
  GPU-substrate expansion, so F19/F20 reranker evidence, AST-aware refinement,
  CodeBERT/GraphCodeBERT, SOM/manifold/custom-CUDA-tiling land as consumers of the
  substrate, not independent implementations.
- Produce a standalone, self-contained hand-off prompt (`codex-handoff-prompt.md`) for
  a fresh Claude Codex session to execute this change without needing this
  conversation's history.
- **Not this change**: no code is implemented here. Capture/plan only, matching this
  repo's established gate-by-gate discipline for large external plans (see
  `parent-atlas-agentic-repair-bundle-integration` and
  `parent-atlas-graph-runtime-enhancement`'s own precedent).

## Capabilities

### New Capabilities
- `gpu-graph-vector-substrate`: the shared RAPIDS cuGraph/cuVS GPU layer (traversal,
  centrality, ANN, KMeans, PCA) that other graph/vector features consume instead of
  each building their own CUDA or reinventing an algorithm already proven in Patch C/D.
- `topology-program-contract`: the typed, bounded seed/projection/edges/depth query
  contract (`ERROR_REPAIR`/`TEST_IMPACT`/`DEPENDENCY_REPAIR`) for agentic error fixing.

### Modified Capabilities
(none — no existing `openspec/specs/*` capability has a requirements change; this
extends the live sidecar's implementation surface, not its existing contract)

## Impact

- **Extends** `python/atlas_rapids_sidecar.py` (owned by
  `parent-atlas-gpu-sidecar-patch-tournament`) with new bounded endpoints — coordinate
  with that change rather than forking a second sidecar.
- **Extends** `sveltekit-frontend/src/lib/server/graph/graph-analysis-runner.ts`'s
  `runSkippedAnalysis('kcore', ...)` / `runSkippedAnalysis('betweenness', ...)` stubs
  (built live this session in `parent-atlas-graph-analysis-contract`) with a
  cuGraph-backed offline-GPU-parity implementation option, alongside (not replacing)
  the Neo4j GDS query-time path.
- **Adds** `atlas_test_v1` to `graph-projection-manifest.ts`'s
  `NAMED_PROJECTION_CANDIDATES` (currently only `atlas_dependency_v1` /
  `atlas_execution_v1` / `atlas_feature_v1` / `atlas_combined_v1`) for the
  `TEST_IMPACT` topology program.
- **Cross-references, does not duplicate**: `parent-atlas-retrieval-fusion-reachability`
  (Gate 2 — RRF/dedup/fusion ownership, RF6), `parent-atlas-graph-analysis-contract`
  (Gate 3 — GA9 promotion, PageRank→retrieval E2E), `phase-2f1-real-evaluation-corpus`
  (replay fixture / labeled query corpus for Gate 3).
