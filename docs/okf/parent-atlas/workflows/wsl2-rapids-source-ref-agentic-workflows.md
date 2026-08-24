# WSL2 RAPIDS Source-Reference Agentic Workflows

This is a navigation index for bounded, read-only Parent Atlas compute in the
WSL2 `atlas-rapids-cu13` environment. `source_ref` points to the implementation
or contract that owns the operation. It is not canonical identity. Canonical
identity remains the ordinal map, packet key, source revision, and graph
revision supplied by the workflow input.

## Runtime Entry Points

| Area | source_ref | Executor | Status |
| --- | --- | --- | --- |
| Typed graph runtime | `python/atlas_compute/typed_graph_runtime.py` | NetworkX / cuGraph | PageRank and weighted SSSP proven; BFS/SOM helpers present |
| Live graph fixture | `python/atlas_compute/live_graph_fixture.py` | cuGraph | Bounded fixture path; spectral and community diagnostics |
| Graph parity contract | `python/tests/test_typed_graph_runtime.py` | pytest | Focused tests passing |
| Graph operation vocabulary | `packages/parent-atlas/src/core/atlas-operation-v1.ts` | TypeScript contract | Includes `GRAPH_BFS`, `GRAPH_SSSP`, PageRank, PPR, community |
| Algorithm manifest | `packages/parent-atlas/src/core/algorithm-execution-manifest.ts` | TypeScript/Zod | Logical algorithm and executor metadata |
| WSL2 runtime requirements | `python/requirements-atlas-live-graph.txt` | RAPIDS environment | Dependency source reference |
| RAPIDS runtime probe | `python/probe_live_graph_runtime.py` | WSL2 Python | Capability and version evidence |

## Truth Status Audit

`source_ref` is navigation evidence only. The following status rules are
required before an agent may describe an operation as available:

| Status | Meaning |
| --- | --- |
| `LIVE_PROVEN` | Real executor path, focused test or live smoke, and no fixture-only boundary |
| `EXECUTED_UNPROVEN` | Real executor ran, but parity, determinism, or promotion gate is still failing |
| `FIXTURE_DIAGNOSTIC` | Real algorithm code runs against a bounded/frozen fixture; not a production writer |
| `CONTRACT_ONLY` | Manifest, planner, or operation vocabulary exists without a verified executor path |
| `STUB_OR_MOCK` | Source explicitly returns routing/demo data or labels execution as deferred/stubbed |

Current audit decisions:

| Surface | Truth status | Evidence |
| --- | --- | --- |
| NetworkX PageRank | `LIVE_PROVEN` | `python/atlas_compute/typed_graph_runtime.py`; focused typed-graph tests |
| Weighted SSSP | `LIVE_PROVEN` | NetworkX Dijkstra and `cugraph.sssp`; unreachable/predecessor semantics tested |
| cuGraph PPR | `LIVE_PROVEN` | `python/atlas_compute/cugraph_ppr.py`; bounded executor path |
| Spectral modularity / Leiden | `EXECUTED_UNPROVEN` | `python/atlas_compute/live_graph_fixture.py`; GPU execution passed, CPU/GPU promotion gate remains open |
| Balanced cut | `FIXTURE_DIAGNOSTIC` | Legacy challenger in the bounded spectral fixture |
| HITS, Jaccard, triangles, ForceAtlas2 | `CONTRACT_ONLY` | Listed in `algorithm-execution-manifest.ts`; no verified Atlas executor was found in this audit |
| Viterbi decoder | `IMPLEMENTED_TEST_FAILURE` | `hmm-kanban-diagnoser.ts` and `hmm-error-classifier.ts` are real; `k-best-viterbi.spec.ts` currently fails its global-lineage assertion |
| HMM/Viterbi sidecar | `CONTRACT_ONLY` | `model-analysis-sidecar.ts` calls optional `/hmm/viterbi`; TODO says the contract is not frozen |
| OpenCode MCP dispatch | `STUB_OR_MOCK` | `sveltekit-frontend/src/routes/api/opencode-dispatch/+server.ts` explicitly says tool execution is stubbed |
| `trace-mcp` / `atlas-tools` MCP servers | `UNREACHABLE_IN_SESSION` | No callable tools with those names are exposed to this agent session |

The Python NLP sidecar currently emits HMM observations and labels its pass as
`hmmlearn` or `heuristic`, but this is observation generation, not proof of a
Python Viterbi or Baum-Welch implementation. The TypeScript decoders are the
proper local API today. Do not claim MCP tool execution from route/dispatcher
telemetry alone.

## Graph Algorithms

### Traversal And Paths

| Logical operation | source_ref | WSL2 executor | Workflow use |
| --- | --- | --- | --- |
| BFS | `python/atlas_compute/graph_programs.py` | NetworkX reference / cuGraph BFS | Unweighted hop expansion and bounded fanout |
| Weighted SSSP | `python/atlas_compute/typed_graph_runtime.py` | NetworkX Dijkstra / `cugraph.sssp` | Distances and predecessors from one ordinal source |
| Shortest path policy | `sveltekit-frontend/src/lib/server/atlas/graph/s-graph-search.ts` | TypeScript policy layer | Selects path semantics and rejects invalid claims |
| BFS/SSSP planner | `sveltekit-frontend/src/lib/server/atlas/graph/alt-cugraph-precompute-plan.ts` | TypeScript planner | Chooses BFS for unweighted and SSSP for weighted landmarks |
| Connected components | `python/atlas_compute/typed_graph_runtime.py` | NetworkX / cuGraph candidate | Isolate graph health before community detection |
| SCC / condensation DAG | `packages/parent-atlas/src/core/algorithm-execution-manifest.ts` | Graph projection lane | Directed dependency-cycle and DAG reduction |

### Authority And Community

| Logical operation | source_ref | WSL2 executor | Workflow use |
| --- | --- | --- | --- |
| PageRank | `python/atlas_compute/typed_graph_runtime.py` | NetworkX / cuGraph | Global structural authority prior |
| Personalized PageRank | `python/atlas_compute/cugraph_ppr.py` | cuGraph | Query-seeded structural affinity |
| PageRank parity | `sveltekit-frontend/src/lib/server/atlas/graph/pagerank-parity.spec.ts` | NetworkX / Neo4j | Reference and projection comparison |
| Leiden | `python/atlas_compute/live_graph_fixture.py` | cuGraph | Preferred persistent community feature |
| Louvain | `python/atlas_community_parity.py` | NetworkX / cuGraph | Community challenger and parity diagnostic |
| Spectral modularity | `python/atlas_compute/live_graph_fixture.py` | cuGraph | Bounded spectral diagnostic; explicit seed required |
| Balanced cut | `python/atlas_compute/live_graph_fixture.py` | cuGraph legacy | Historical challenger only; do not promote automatically |
| HITS | `packages/parent-atlas/src/core/algorithm-execution-manifest.ts` | NetworkX / cuGraph candidate | Hub/authority diagnostic |

### Structural Similarity And Layout

| Logical operation | source_ref | Executor | Workflow use |
| --- | --- | --- | --- |
| Jaccard coefficient | `packages/parent-atlas/src/core/algorithm-execution-manifest.ts` | NetworkX / nx-cugraph candidate | Local link similarity |
| Triangle counting | `packages/parent-atlas/src/core/algorithm-execution-manifest.ts` | cuGraph candidate | Local structural density |
| ForceAtlas2 | `packages/parent-atlas/src/core/algorithm-execution-manifest.ts` | cuGraph visualization lane | Layout only, never canonical identity |
| SOM neighborhood | `python/atlas_compute/typed_graph_runtime.py` | Python ordinal lattice | Routing admission around a 20x20 BMU |

## Vector And Feature Algorithms

| Logical operation | source_ref | Executor | Workflow use |
| --- | --- | --- | --- |
| Exact KNN | `python/atlas_compute/qdrant_exact_alignment.py` | cuVS / exact reference | Bounded semantic parity |
| CAGRA | `python/atlas_cuvs_resident_registry.py` | cuVS GPU | Approximate semantic executor behind `SearchBackend` |
| All-neighbors | `python/atlas_compute/cuvs_analytics.py` | cuVS | Candidate graph and neighborhood construction |
| Pairwise distance | `python/atlas_compute/cuvs_analytics.py` | cuVS | Feature-space comparison and diagnostics |
| Sparse SpMM | `python/atlas_compute/hypergraph_tensor.py` | PyTorch sparse / CUDA | Hyperedge incidence expansion |
| Low-rank reduction | `python/atlas_compute/low_rank.py` | NumPy / PyTorch | Bounded candidate feature reduction |
| KMeans | `sveltekit-frontend/scripts/ae-train.mjs` | Native/RTX training lane | Centroid and routing feature preparation |
| SOM 20x20 | `scripts/atlas/validate-som-20x20-topology.mjs` | Python/Node validation | Four-dimensional topology routing |
| Autoencoder | `sveltekit-frontend/scripts/ae-train.mjs` | PyTorch/RTX candidate | Experimental latent routing; not canonical embedding |

## Source-Reference Agentic Workflow

Each workflow action should carry `workflow_id`, `workflow_revision`,
`source_ref`, `graph_revision`, `source_revision`, and an algorithm execution
receipt. The agent may select an executor, but it may not promote a derived
result or mutate canonical data directly.

1. **Discover**
   - `rg --files --hidden --no-ignore`
   - Resolve the requested `source_ref` and language.
   - Record `workflow_id` and `source_revision`.

2. **Freeze input**
   - Load a bounded graph or vector fixture.
   - Validate ordinal-map checksum and graph revision.
   - Reject missing source references and mixed revisions.

3. **Select operation**
   - Choose the logical operation: BFS, SSSP, PageRank, PPR, community,
     semantic KNN, SOM, or feature reduction.
   - Keep executor selection separate: NetworkX, cuGraph, cuVS, PyTorch, or
     TypeScript policy.

4. **Run in WSL2**
   - Activate `atlas-rapids-cu13`.
   - Use explicit seeds and bounded node, edge, candidate, and VRAM budgets.
   - Do not start duplicate workers when host memory or VRAM headroom is below
     the runtime floor.

5. **Validate**
   - Compare result shape, ordinal coverage, unreachable semantics, and input
     checksum.
   - For parity work, retain the existing `0.99` promotion gate.
   - Keep `DEGRADED` or `EXECUTED_UNPROVEN` when GPU/CPU parity is not proven.

6. **Assemble context**
   - Attach result rows to `source_ref` and packet identity.
   - Pass only validated, canonicalized evidence to ACE/context assembly.
   - Never pass raw graph or search output directly to an LLM.

7. **Persist receipt**
   - Write a report or promotion proposal through the bounded workflow path.
   - Canonical Postgres writes, Qdrant projections, and Valkey cache changes
     require their own explicit apply gate.

## WSL2 Command Index

```text
wsl -d Ubuntu -- /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python -c "import cugraph; print(cugraph.__version__)"
wsl -d Ubuntu -- /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python -c "import cudf, cugraph; print(hasattr(cugraph, 'sssp')); print(hasattr(cugraph, 'leiden'))"
python -m pytest -q python/tests/test_typed_graph_runtime.py
```

## Current Boundaries

- `source_ref` identifies implementation evidence; it does not replace
  `canonical_id`, `packet_key`, or `CandidateOrdinal`.
- NetworkX is the CPU semantic reference. nx-cugraph/cuGraph are executors.
- SSSP requires weighted edges. Use BFS for unweighted graphs.
- SOM coordinates, community IDs, ontology IDs, and GPU vertex IDs are derived
  routing or feature state, not canonical identity.
- This index documents available surfaces; it does not claim every listed
  algorithm is currently live, parity-proven, or production-promoted.
- See `docs/reports/wsl2-algorithm-source-ref-audit-v1.json` for the detailed
  implementation-versus-contract audit.

likely_cause: Algorithm implementations and workflow contracts were distributed across Python, TypeScript, cuGraph, cuVS, and agentic workflow modules without one WSL2 source-reference index.
evidence: python/atlas_compute/typed_graph_runtime.py; python/atlas_compute/live_graph_fixture.py; packages/parent-atlas/src/core/algorithm-execution-manifest.ts; sveltekit-frontend/src/lib/server/atlas/graph/alt-cugraph-precompute-plan.ts
patch_targets: docs/okf/parent-atlas/workflows/wsl2-rapids-source-ref-agentic-workflows.md
safe_next_command: python -m pytest -q python/tests/test_typed_graph_runtime.py
smoke_command: wsl -d Ubuntu -- /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python -c "import cudf, cugraph; print(cugraph.__version__)"
report_path: docs/reports/wsl2-algorithm-source-ref-audit-v1.json
