# Spectral graph clustering and subgraph synthesis proof tasks

Status vocabulary:

- `DONE`: existing behavior/ownership already present and inspected.
- `IMPLEMENTED_UNPROVEN`: code/test exists, but no live workstation receipt has been produced.
- `PENDING`: implementation or runtime proof remains.
- `BLOCKED`: an explicit prerequisite prevents promotion.

## Alignment sweep — 2026-08-23

The spectral challenger now has a bounded request contract and a non-mutating
RAPIDS sidecar route. TypeScript and Python fixtures share CandidateOrdinal and
checksum rules. These are fixture gates only; they do not prove activated WSL2
cuGraph execution or authorize Qdrant, Valkey, or Neo4j writes.

- [x] Validate `numEigenvectors <= numClusters <= node_count`.
- [x] Expose spectral capability dynamically without false availability claims.
- [x] Preserve graph/projection revisions and non-authority flags.
- [ ] Run the sidecar in activated `atlas-rapids-cu13` and capture a real SM86 receipt.
- [ ] Compare live cuGraph assignments with the CPU/reference ordinal checksum.
- [ ] Add projection readback only after parity passes.
- [ ] Wire workflow/A2A receipts and grounded repair outcomes.

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
                   COO -> cuGraph
                          |
              +-----------+-------------+
              |           |             |
              v           v             v
           PageRank     Leiden    spectral clustering
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
```

`SGC-5..8` are code-complete only. They remain unproven until the new live fixture produces a workstation receipt.

## One live fixture — no new schema

The next proof is intentionally one bounded experiment at two scales:

```text
frozen graph snapshot
nodes.parquet + edges.parquet
          |
          +--------------------------+
          |                          |
          v                          v
project endpoint packet_key    frozen semantic_768 5k
AST / N-ary / ontology /       atlas_packets.embedding
workflow edge types                   |
          |                           v
          |                 exact cuVS all-neighbors
          |                       Top-K cosine
          |                           |
          +-------------+-------------+
                        v
             packet-level typed graph
                        |
                 SEMANTIC_KNN
                  derived only
                        |
             5,000 dense ordinals
                        |
              +---------+---------+
              |                   |
              v                   v
          first 500            all 5,000
              |                   |
              +---------+---------+
                        v
                   same worker
                        |
       +----------------+-------------------+
       |                |                   |
       v                v                   v
   PageRank           Leiden             spectral
                                      +-- balanced cut
                                      +-- modularity
```

The 500 fixture is a deterministic prefix of the same 5,000-packet artifact; it is not independently sampled. That makes scale effects observable without changing candidate identity.

### Current implementation

```text
scripts/atlas/build_spectral_live_fixture.py
```

- consumes the existing frozen graph Parquet tables;
- consumes `.tmp/atlas-vector-snapshots/vector-snapshot-5k-768.parquet`;
- maps structural graph endpoints through their real `packet_key` onto packet candidates;
- preserves the source `edge_type` while marking this packet-level graph as a benchmark projection, not canonical graph truth;
- generates exact `SEMANTIC_KNN` with cuVS `all_neighbors` / brute-force cosine;
- records Top-K, semantic weight, input file SHA-256 values and runtime versions;
- emits packet-level `nodes.parquet`, typed `edges.parquet`, and `fixture-manifest.json`.

```text
scripts/atlas/export-spectral-fixture-routing-labels.mjs
```

- joins the built fixture's packet keys to `atlas_observation_feature_rows`;
- selects exactly one `feature_revision` (explicit when supplied, otherwise maximum fixture coverage then newest);
- exports KMeans, SOM, community, PageRank and PPR observations as ZSTD Parquet keyed by `gpu_node_id`;
- does not manufacture validator or repair outcomes.

```text
scripts/atlas/run_fabric_benchmark.py --mode spectral_live_fixture
```

- remains the single graph/GPU benchmark execution owner;
- runs PageRank, Leiden, balanced-cut spectral clustering and spectral modularity clustering;
- repeats Leiden/spectral partitions and reports mean pairwise ARI stability;
- reports cuGraph modularity, edge-cut and ratio-cut analyzers;
- evaluates PageRank-only, semantic-KNN, Leiden, spectral balanced-cut, spectral modularity and available KMeans/SOM/community routing views;
- uses factual/non-similarity graph neighbours as the retrieval oracle;
- reports Recall@10/50/100, first-factual-neighbour MRR, source coverage, latency and GPU-memory checkpoints;
- accepts validator/repair outcome columns only when a separately grounded label artifact supplies them;
- emits `atlas.spectral-live-fixture-receipt.v1` with `EXECUTED_UNPROVEN` status.

### Live command sequence

From the repository root:

```bash
# 1. Freeze/verify the existing semantic_768 reference artifact.
npx tsx scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts --verify --apply

# 2. Build one packet-level graph with exact semantic Top-K edges.
~/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/build_spectral_live_fixture.py \
  --graph-nodes sveltekit-frontend/docs/reports/graph-snapshot-parity/nodes.parquet \
  --graph-edges sveltekit-frontend/docs/reports/graph-snapshot-parity/edges.parquet \
  --semantic-vectors .tmp/atlas-vector-snapshots/vector-snapshot-5k-768.parquet \
  --semantic-top-k 10 \
  --semantic-weight 1.0 \
  --out-dir .tmp/atlas-spectral-live-fixture

# 3. Export one revision-pure ORF label projection when the ORF table is populated.
node scripts/atlas/export-spectral-fixture-routing-labels.mjs \
  --nodes .tmp/atlas-spectral-live-fixture/nodes.parquet \
  --out .tmp/atlas-spectral-live-fixture/routing-labels.parquet

# 4. Run 500 + 5,000 candidates through the same GPU benchmark worker.
~/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/run_fabric_benchmark.py \
  --mode spectral_live_fixture \
  --nodes .tmp/atlas-spectral-live-fixture/nodes.parquet \
  --edges .tmp/atlas-spectral-live-fixture/edges.parquet \
  --labels .tmp/atlas-spectral-live-fixture/routing-labels.parquet \
  --candidate-size 500 \
  --candidate-size 5000 \
  --recall-k 10 --recall-k 50 --recall-k 100 \
  --repeats 3 \
  --random-seed 684453
```

If ORF labels are not yet populated, omit `--labels`; spectral/Leiden/PageRank/semantic metrics must still run, while KMeans/SOM/community comparisons remain explicitly unavailable.

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
AST_CALL              canonical fact at source graph level
AST_IMPORT            canonical fact at source graph level
AST_REFERENCE         canonical fact at source graph level
NARY_INCIDENCE        canonical fact at source graph level
ONTOLOGY_ROLE         validated/canonical fact when promoted
SEMANTIC_KNN          derived similarity
LEXICAL_COOCCURRENCE  derived similarity
WORKFLOW_DEPENDENCY   workflow-state projection
```

The packet-level fixture projection itself is non-canonical. Semantic-KNN proximity never mints canonical relationships.

## Spectral execution parameters

Every production-facing spectral receipt eventually records:

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

For the live fixture, Leiden's observed community count is only a `LEIDEN_CHALLENGER` value for spectral `k`; it is not canonical cluster-count truth.

## Evaluation / promotion rule

A live fixture receipt must expose, at minimum:

```text
500 candidates
5,000 candidates

edge-family counts
factual-edge count
semantic Top-K edge count

PageRank latency/convergence
Leiden modularity + stability
balanced-cut modularity/edge-cut/ratio-cut + stability
spectral-modularity modularity/edge-cut/ratio-cut + stability

spectral ↔ Leiden ARI
spectral ↔ KMeans ARI       when labels exist
spectral ↔ SOM ARI          when labels exist

Recall@10/50/100
first-factual-neighbour MRR
source coverage @ K
validator success           only from external grounded outcome evidence
repair success              only from external grounded outcome evidence

host/GPU preparation latency
algorithm latency
total fixture latency
GPU used-byte checkpoints
```

The CUDA memory number in this first fixture is explicitly a `memGetInfo()` checkpoint high-watermark observation, not an Nsight kernel-peak claim. Nsight profiling remains the stronger later proof for BLAS/Tensor-Core/kernel-level telemetry.

Spectral may enter daily Graphify only after it demonstrates useful downstream delta beyond the existing routing views. A successful CUDA call or higher modularity alone is insufficient.

Useful downstream decision criteria remain:

```text
retrieval Recall@K / MRR
subgraph source coverage
canonical-evidence promotion rate
validator success rate
repair success rate
tokens/context bytes
GPU/host bytes
latency
cluster stability across seeds/revisions
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

For CPU/GPU portability, FAISS+cuVS remains a challenger. Direct cuVS CAGRA→HNSW serialization stays version-qualified because its save/load format is experimental.

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

Spectral cluster IDs cannot authorize mutation. `SGC-11` remains pending until real validator/repair outcome evidence is joined to the fixture rather than synthesized from cluster membership.

## Required bounded tests

```bash
npm --prefix packages/parent-atlas run build
node --test packages/parent-atlas/test/spectral-graph-clustering.test.mjs
```

Live cuGraph proof must additionally record the RAPIDS/cuGraph/cuVS/CUDA versions, graph/vector input checksums, random seed, GPU-resource observations, output/fixture checksums and analyzer scores before `SGC-5/6/7/8` can be promoted from `IMPLEMENTED_UNPROVEN` to proven.
