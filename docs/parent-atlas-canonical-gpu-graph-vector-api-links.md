# Parent Atlas canonical GPU graph/vector API references

Checked against canonical upstream documentation/source on 2026-08-22. This note is an implementation guardrail, not a promotion receipt.

## cuGraph graph construction and storage orientation

- Graph edge-list construction and `store_transposed`:
  https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.graph.from_cudf_edgelist/
- PageRank Python API:
  https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.pagerank/
- PageRank C-API implementation (canonical source):
  https://github.com/rapidsai/cugraph/blob/main/cpp/src/c_api/pagerank.cpp
- BFS Python API:
  https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.bfs/
- BFS edge compatibility API (`reverse=True` is currently not implemented):
  https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.bfs_edges/
- BFS C-API implementation (canonical source):
  https://github.com/rapidsai/cugraph/blob/main/cpp/src/c_api/bfs.cpp

### Parent Atlas consequence

`store_transposed=True` is not a neutral permanent residency format for the mixed PageRank+BFS runtime.

The current cuGraph C-API implementations have opposite layout requirements:

- PageRank expects `store_transposed == true`; if false, the C API transposes storage before execution.
- BFS expects `store_transposed == false`; if true, the C API transposes storage before execution.

Therefore a sequence such as:

```text
PageRank -> BFS -> PageRank
```

can force at least two storage-orientation flips on the same graph object. The runtime may still be correct, but a PageRank/BFS alternation benchmark must measure this behavior before Parent Atlas calls the shared resident graph layout cost-proven on the RTX 3060 Ti.

The current Python public API does not provide Parent Atlas with a sufficiently strong post-call orientation observation surface, so orientation transitions are treated as **inferred from the canonical cuGraph implementation contract**, while execution/timings/GPU memory are observed separately.

## cuGraph BFS

- Stable traversal API index:
  https://docs.rapids.ai/api/cugraph/stable/api_docs/cugraph/traversal/
- BFS supports a `depth_limit`.
- `bfs_edges(..., reverse=True)` documents reverse traversal as currently not implemented.

Parent Atlas status:

```text
outbound BFS            implementation present / runtime proof pending
inbound BFS             fail closed
both-direction BFS      fail closed
edge-type-filtered BFS  fail closed
```

The generic live Postgres/Neo4j traversal surface therefore remains the fallback where inbound/both traversal or edge-type filtering is required.

## cuGraph PageRank / PPR

Canonical PageRank docs state that the transposed adjacency list is computed if not already present. Parent Atlas should continue treating PageRank/PPR as graph-derived features, not as separate retrieval-lane votes.

Important identity condition: with `renumber=False`, PageRank expects contiguous integer vertex IDs starting at zero. The frozen graph projection already enforces dense GPU ordinals for this reason.

## cuGraph Leiden / Louvain

- Leiden:
  https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.leiden/
- cuGraph supported-algorithm inventory:
  https://docs.rapids.ai/api/cugraph/stable/graph_support/algorithms/
- Directed -> undirected graph conversion:
  https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.graph.to_undirected/

Current Leiden explicitly supports **undirected weighted graphs** and returns:

```text
(vertex, partition) rows
+
global modularity score
```

Its `resolution` parameter controls community granularity.

Parent Atlas must not simply run Leiden over the current directed PageRank/BFS projection. A separate deterministic undirected-community projection contract is required first. `Graph.to_undirected()` exists, but using it is a semantic projection choice, not merely an executor option: reciprocal/directional edge meaning and duplicate-weight behavior must be frozen and parity-tested.

`communityId` remains derived feature evidence and must never become canonical candidate identity.

## cuGraph SSSP

- Traversal inventory and SSSP links:
  https://docs.rapids.ai/api/cugraph/stable/api_docs/cugraph/traversal/

Parent Atlas should enable SSSP only after an edge-cost contract defines what a positive structural cost means. Raw confidence/weight values must not be silently interpreted as path costs.

Until then:

```text
SSSP policy selection exists
SSSP executor promotion remains blocked
```

## cuGraph neighbor sampling

- Supported algorithm/API inventory:
  https://docs.rapids.ai/api/cugraph/stable/api_docs/

Sampling belongs to bounded graph expansion, not to semantic ANN voting. Fanout values must be derived from the Parent Atlas resource envelope and revision-qualified graph projection.

## cuVS CAGRA

- Canonical CAGRA Python API:
  https://docs.rapids.ai/api/cuvs/stable/python_api/neighbors_cagra/

CAGRA is a GPU graph ANN executor. Current canonical parameters include:

```text
IndexParams:
  metric
  intermediate_graph_degree
  graph_degree

SearchParams:
  max_queries
  itopk_size
  max_iterations
  search_width
  team_size
  thread_block_size
```

Canonical supported build metrics include squared Euclidean, inner product, and cosine. Build input can be CUDA-array-interface compliant and supports float/half/int8/uint8 for supported build paths. The optimized graph and dataset generally need to fit GPU memory (ACE is a documented alternative build path for host-resident datasets).

Parent Atlas consequence:

```text
semantic_768 = one logical semantic lane
Qdrant HNSW  = persistent serving executor/projection
cuVS exact    = GPU exact oracle
CAGRA         = GPU ANN challenger/executor
```

CAGRA graph vertex/index IDs are executor coordinates only. They must normalize to the frozen `CandidateOrdinal` map before leaving the executor boundary.

## Qdrant vectors, named vectors, and payload

- Vectors / named vectors:
  https://qdrant.tech/documentation/manage-data/vectors/
- Collections:
  https://qdrant.tech/documentation/manage-data/collections/
- Points:
  https://qdrant.tech/documentation/manage-data/points/

Qdrant supports multiple named vector spaces per point with independently configured dimensions/metrics. It also supports payload metadata and payload indexes for filtering.

Parent Atlas policy remains conservative:

```text
codebase_chunks_768_v2
  semantic_768 only
```

until latent_128 / latent_64 provenance is independently frozen. Named-vector support existing upstream does not prove that several Parent Atlas representations share the same producer/revision lineage.

AST/domain/community/taxonomy values belong in payload/feature metadata, not appended onto `semantic_768` dimensions.

## Canonical executor-vs-identity rule

The following are **not canonical identity**:

```text
Qdrant point ID
CAGRA neighbor index
cuGraph gpu_node_id
Neo4j internal node ID
GPU row pointer
mmap byte offset
```

The frozen execution-coordinate boundary is:

```text
CandidateOrdinalMapV1
  candidateSnapshotRevision
  ordinalMapChecksum
  canonicalId
  packetKey
  treeNodeId
  symbolVersionId
  workspaceRevision
  sourceRevision
  graphRevision
  semanticRevision
```

Every executor result must normalize through that map before it can become candidate feature evidence.

## Current proof implications

```text
GRAPH-RANK-ORDINAL                 IMPLEMENTED_UNPROVEN
CUGRAPH-PAGERANK -> ORDINAL        IMPLEMENTED_UNPROVEN
CUGRAPH-BFS-RUNTIME                IMPLEMENTED_UNPROVEN
BFS -> CANDIDATE_ORDINAL           IMPLEMENTED_UNPROVEN
BFS -> STRUCTURAL_FEATURE_SNAPSHOT IMPLEMENTED_UNPROVEN

CUGRAPH_SHARED_GRAPH_CORRECTNESS   CODE PATH PRESENT
CUGRAPH_SHARED_LAYOUT_COST         UNPROVEN
PAGE_RANK_BFS_LAYOUT_ALTERNATION   PROOF SCRIPT ADDED / UNRUN

GPU BFS OUTBOUND                   CODE PATH PRESENT / RTX PROOF PENDING
GPU BFS INBOUND                    NOT IMPLEMENTED
GPU BFS BOTH                       NOT IMPLEMENTED
GPU BFS EDGE FILTER                NOT IMPLEMENTED

LEIDEN                             BLOCKED ON UNDIRECTED PROJECTION CONTRACT
LOUVAIN                            PARITY/CHALLENGER
SSSP                               BLOCKED ON POSITIVE EDGE-COST CONTRACT
NEIGHBOR SAMPLING                  POLICY EXISTS / EXECUTOR UNWIRED
```

The next target-GPU proof should therefore run PageRank -> BFS -> PageRank on one frozen revision and record:

- exact graph/projection revisions and hashes;
- PageRank repeat output parity;
- BFS result receipt;
- wall time per phase;
- reported kernel time per phase;
- GPU memory before/after each phase;
- the **inferred** storage-orientation sequence from the canonical cuGraph API contract;
- explicit `TRANSPOSE_TIMING_SEPARATELY_MEASURED=false` until a real lower-level timing surface exists.

Do not promote Leiden or claim a stable shared PageRank/BFS resident layout before that receipt exists.
