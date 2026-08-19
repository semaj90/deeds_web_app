# Spectral graph clustering and subgraph synthesis proof tasks

Status vocabulary:

- `DONE`: existing behavior/ownership already present and inspected.
- `IMPLEMENTED_UNPROVEN`: code/test exists, but no live workstation receipt has been produced.
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
SGC-5  live cuGraph balanced-cut executor                 PENDING
SGC-6  live cuGraph modularity executor                   PENDING
SGC-7  analyzer receipts: modularity/edge-cut/ratio-cut   PENDING
SGC-8  spectral vs Leiden/KMeans/SOM evaluation           PENDING
SGC-9  Qdrant/Valkey routing projection                   PENDING
SGC-10 workflow/A2A artifact receipt wiring               PENDING
SGC-11 agentic file-repair subgraph fixture               PENDING
```

## Edge authority

Every edge recipe is exactly one of:

```text
canonical_fact = true
```

or:

```text
derived_similarity = true
```

Never both.

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

Semantic-KNN proximity must never mint canonical relationships.

## Spectral execution parameters

Every run records:

```text
workflow_id
workflow_revision
source_snapshot_revision
graph_revision
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

The initial executor owner is:

```text
CUGRAPH_SINGLE_GPU
```

Methods:

```text
BALANCED_CUT
MODULARITY_MAXIMIZATION
```

Cluster count remains an explicit policy input. Future eigengap/Leiden estimation is a challenger and must produce its own receipt.

## Evaluation

A verified receipt should record as applicable:

```text
vertex_count
edge_count
cluster_count
assignments_checksum
modularity_score
edge_cut_score
ratio_cut_score
runtime_ms
peak_gpu_bytes
```

Evaluation must compare spectral assignments against existing derived views rather than declare one algorithm universally superior:

```text
spectral balanced cut
spectral modularity
Leiden
KMeans semantic clusters
SOM topology
```

Useful downstream metrics:

```text
retrieval Recall@K
MRR
subgraph source coverage
canonical-evidence promotion rate
validator success rate
repair success rate
tokens/context bytes
GPU/host bytes
latency
cluster stability across revisions
```

## Retrieval executor relationship

Spectral clusters are routing hints, not separate evidence votes.

```text
BM25_QDRANT_IDF    lexical evidence lane

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

For CPU/GPU portability, FAISS+cuVS is a challenger. Direct cuVS CAGRA→HNSW serialization must remain version-qualified because its save/load format is experimental.

## Agentic workflow integration

Reference repair workflow:

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
```

Live cuGraph proof must additionally record the RAPIDS/cuGraph/CUDA versions, graph input checksum, random seed, GPU-resource receipt, output assignment checksum, and analyzer scores before SGC-5/6/7 can be marked `PROVEN`.
