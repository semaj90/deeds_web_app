# Spectral graph clustering and subgraph synthesis proof tasks

Status vocabulary:

- `DONE`: existing behavior/ownership already present and inspected.
- `IMPLEMENTED_UNPROVEN`: code/test/probe exists, but no live workstation receipt has been produced.
- `PENDING`: implementation or runtime proof remains.
- `BLOCKED`: an explicit prerequisite prevents promotion.

## Placement

Spectral clustering is a derived graph stage. It does not replace semantic retrieval, KMeans/SOM routing, PageRank/PPR, or canonical graph facts.

```text
Tree-sitter / ast-grep / LangExtract / ontology observations
                         |
                         v
              ObservationFeatureRowV1
                         |
          +--------------+----------------+
          |                               |
          v                               v
     semantic_768                  canonical graph facts
          |                        AST / N-ary / ontology
          v                               |
   semantic KNN edges                     |
   derived only                           |
          +---------------+---------------+
                          v
                   CSR / COO graph
                          |
              +-----------+-------------+
              |           |             |
              v           v             v
           PageRank      PPR      spectral clustering
                                      |
                                      +--> balanced cut
                                      +--> modularity maximization
                                      |
                                      v
                         GraphClusterRoutingFeatureV1
                                      |
                   +------------------+-------------------+
                   |                  |                   |
                   v                  v                   v
              Qdrant tags        Valkey residency   subgraph synthesis
                   |                                      |
                   +------------------+-------------------+
                                      v
                              ContextManifest / tools
                                      |
                                      v
                                    Ornith
                                      |
                                      v
                              exact source promotion
```

## Proof ladder

```text
SGC-0  graph/feature row identity already revisioned      DONE
SGC-1  spectral graph edge recipe contract                IMPLEMENTED_UNPROVEN
SGC-2  cuGraph spectral clustering plan                   IMPLEMENTED_UNPROVEN
SGC-3  deterministic assignment checksum                  IMPLEMENTED_UNPROVEN
SGC-4  bounded subgraph synthesis request                 IMPLEMENTED_UNPROVEN
SGC-5  live cuGraph balanced-cut executor                 IMPLEMENTED_UNPROVEN
SGC-6  live cuGraph modularity executor                   IMPLEMENTED_UNPROVEN
SGC-7  analyzer receipts: modularity/edge-cut/ratio-cut   IMPLEMENTED_UNPROVEN
SGC-8  spectral vs Leiden/KMeans/SOM evaluation           IMPLEMENTED_UNPROVEN
SGC-9  Qdrant/Valkey routing projection                   PENDING
SGC-10 workflow/A2A artifact receipt wiring               PENDING
SGC-11 agentic file-repair subgraph fixture               PENDING
SGC-12 Nsight Systems CUDA/NVTX/cuBLAS trace              IMPLEMENTED_UNPROVEN
SGC-13 Nsight Compute Tensor Core/precision proof         IMPLEMENTED_UNPROVEN
```

`IMPLEMENTED_UNPROVEN` for SGC-5..8 and SGC-12..13 means the executable runner/wrapper exists, not that RAPIDS/Nsight has run successfully on the workstation.

## Edge authority

Every edge recipe is exactly one of:

```text
canonical_fact = true
```

or:

```text
derived_similarity = true
```

Never both. `SEMANTIC_KNN` is always derived similarity and cannot mint a relationship.

Reference edge families:

```text
AST_CALL              canonical fact
AST_IMPORT            canonical fact
AST_REFERENCE         canonical fact
NARY_INCIDENCE        canonical fact
ONTOLOGY_ROLE         validated/canonical fact when promoted
SEMANTIC_KNN          derived similarity
LEXICAL_COOCCURRENCE  derived similarity
WORKFLOW_DEPENDENCY   workflow-state projection
```

## Live fixture construction

The live fixture is built from revisioned PostgreSQL rows, not a synthetic graph:

```text
atlas_observation_feature_rows
  candidate_id
  source_ref/source_revision
  semantic_768
  KMeans/SOM/community features
        |
        +-- selected deterministic 500..5000 candidates
        |
atlas_relationships + atlas_relationship_members
        |
        +-- loss-preserving relationship IDs retained
        +-- bounded pairwise compute view only
        |
        v
base fixture JSON
        |
        v
cuVS all-neighbors algo=brute_force
semantic_768 top-K
        |
        +-- SEMANTIC_KNN derived edges
        v
augmented frozen fixture
```

The pairwise relationship edges are a compute projection. Canonical N-ary relationship identity remains in PostgreSQL.

Build commands:

```bash
node scripts/atlas/build-live-graph-fixture.mjs \
  --workspace-revision=<workspace-revision> \
  --source-snapshot-revision=<source-snapshot-revision> \
  --graph-revision=<graph-revision> \
  --feature-revision=<feature-revision> \
  --workflow-id=<workflow-id> \
  --workflow-revision=<workflow-revision> \
  --limit=1000 \
  --clusters=20 \
  --semantic-top-k=16 \
  --output=.tmp/atlas/live-graph/live-graph-base.json

python python/augment_live_graph_semantic_knn.py \
  --fixture=.tmp/atlas/live-graph/live-graph-base.json \
  --output=.tmp/atlas/live-graph/live-graph.json
```

The cuVS semantic graph augmentation records the exact source fixture checksum, 768-dimensional input, K, family weight, and executor (`CUVS_ALL_NEIGHBORS_BRUTE_FORCE`).

## Spectral execution parameters

Every run records:

```text
workflow_id
workflow_revision
source_snapshot_revision
graph_revision
feature_revision
row_identity_checksum

method
num_clusters
num_eigenvectors

eigen_tolerance
eigen_max_iterations

kmeans_tolerance
kmeans_max_iterations

random_seed
executor revision
```

The initial executor owner is `CUGRAPH_SINGLE_GPU` with methods `BALANCED_CUT` and `MODULARITY_MAXIMIZATION`. Cluster count remains an explicit policy input. Eigengap/Leiden estimation remains a challenger.

Execute:

```bash
python python/prove_live_graph_fixture.py \
  --fixture=.tmp/atlas/live-graph/live-graph.json \
  --output=.tmp/atlas/live-graph/live-graph-fixture-receipt.json
```

The Python runner creates an undirected weighted cuGraph projection, then runs the same frozen graph through:

```text
PageRank
spectral balanced cut
spectral modularity maximization
Leiden
optional existing KMeans baseline
optional existing SOM baseline
```

Spectral and Leiden stability is measured with a second seed and reported as adjusted Rand index. When evaluation cases are supplied, cluster-constrained PageRank expansion reports Recall@K, source coverage and historical repair-success coverage.

## Analyzer proof

Where the installed cuGraph Python surface exposes the functions, execute:

```text
analyzeClustering_modularity
analyzeClustering_edge_cut
analyzeClustering_ratio_cut
```

against the exact returned assignment DataFrame and record their values. Missing API support must remain null/blocked; it must not be synthesized.

## GPU execution evidence

GPU execution proof is separate from graph-quality proof.

```text
LiveGraphFixtureReceiptV1
       |
       +--> canonical graph/result checksums
       |
       v
NVTX: parent-atlas@atlas.graph_fixture
       |
       +--> Nsight Systems
       |      CUDA
       |      NVTX
       |      cuBLAS
       |      cuBLAS verbose
       |      .nsys-rep       CANONICAL TRACE ARTIFACT
       |      JSONLines       derived inspection export
       |      SQLite          derived inspection export
       |
       +--> Nsight Compute
              same NVTX range
              .ncu-rep
              raw CSV metrics
              Tensor Core/precision evidence
```

Run:

```bash
bash scripts/atlas/profile-live-graph-fixture.sh \
  .tmp/atlas/live-graph/live-graph.json \
  .tmp/atlas/live-graph/profile
```

The profiling wrapper uses:

```text
nsys --trace=cuda,nvtx,cublas,cublas-verbose
nsys --capture-range=nvtx
nsys --nvtx-capture=atlas.graph_fixture@parent-atlas

ncu --nvtx
ncu --nvtx-include=parent-atlas@atlas.graph_fixture/
```

The `.nsys-rep` checksum is the durable execution-trace identity. JSONLines/SQLite are derived because export schemas/tooling can evolve.

`GpuExecutionEvidenceReceiptV1` must never infer Tensor Core use from a cuBLAS/cuBLASLt API or kernel name alone. `tensor_core_used=true` requires a non-zero Nsight Compute tensor/HMMA/IMMA/MMA metric observation and an NCU artifact.

## Evaluation

A verified graph receipt should record as applicable:

```text
vertex_count
edge_count
cluster_count
assignments_checksum
modularity_score
edge_cut_score
ratio_cut_score
stability_ari
retrieval_recall_at_k
source_coverage_at_k
historical_repair_success_at_k
runtime_ms
peak_gpu_bytes
```

Evaluation compares rather than assumes superiority:

```text
spectral balanced cut
spectral modularity
Leiden
KMeans semantic clusters
SOM topology
```

Useful later workflow metrics include MRR, canonical-evidence promotion, validator success, repair success, context bytes/tokens, host/GPU bytes, latency, and cluster stability across revisions.

## Retrieval executor relationship

Spectral clusters are routing hints, not separate evidence votes.

```text
QDRANT_BM25_IDF    lexical evidence lane

semantic family:
  QDRANT_HNSW
  CUVS_EXACT
  CUVS_CAGRA
  CUVS_HNSW_CPU
  FAISS_CUVS
  PGVECTOR_HNSW
  VALKEY_HNSW_CACHE

semantic_lane_votes = 1
```

For CPU/GPU portability, FAISS+cuVS is a challenger. Direct cuVS CAGRA→HNSW serialization remains version-qualified because its save/load format is experimental.

## Agentic workflow integration

```text
validation failure receipt
        |
        v
seed candidate IDs
        |
        v
spectral/subgraph routing hints
        |
        v
SubgraphSynthesisRequestV1
        |
        v
exact AST/N-ary/source hydration
        |
        v
ContextManifest
        |
        v
Ornith repair proposal
        |
        v
AgenticFileMutationPlanV1
        |
        v
validator
   +----+----+
   |         |
 PASS       FAIL
   |         |
materialize  new failure evidence / retry
```

Spectral cluster IDs cannot authorize mutation.

## Required bounded tests

```bash
npm --prefix packages/parent-atlas run build
node --test packages/parent-atlas/test/spectral-graph-clustering.test.mjs
node --test packages/parent-atlas/test/gpu-trace-evidence.test.mjs
python python/test_live_graph_fixture.py
```

No SGC item moves to `PROVEN` from file/test existence. SGC-5/6/7/8 require a live RAPIDS receipt from the bounded graph; SGC-12 requires the `.nsys-rep`; SGC-13 requires Nsight Compute metric evidence. Daily Graphify adoption remains blocked until the live fixture shows useful quality/repair signal within the GPU resource envelope.
