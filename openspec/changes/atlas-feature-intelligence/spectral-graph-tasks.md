# Spectral graph clustering and subgraph synthesis proof tasks

Status vocabulary:

- `DONE`: existing behavior/ownership already present and inspected.
- `IMPLEMENTED_UNPROVEN`: code/test exists, but no live workstation receipt has been produced.
- `PENDING`: implementation or runtime proof remains.
- `BLOCKED`: an explicit prerequisite prevents promotion.

## Alignment sweep — 2026-08-23

The repository now has a narrow, non-mutating spectral request path in
`python/atlas_rapids_community.py` and `/v1/community/spectral` in the RAPIDS
sidecar. The TypeScript and Python fixture adapters share CandidateOrdinal and
checksum rules. These are implementation and fixture gates only; they do not
prove an activated WSL2 cuGraph run or authorize Qdrant/Valkey/Neo4j writes.

- [x] Validate bounded spectral parameters, including
  `numEigenvectors <= numClusters <= node_count`.
- [x] Expose capability discovery without claiming availability when cuGraph
  is not importable.
- [x] Preserve graph/projection revisions and non-authority flags in the
  fixture receipt.
- [ ] Run the sidecar in the activated `atlas-rapids-cu13` environment and
  capture a real SM86 execution receipt.
- [ ] Compare the same ordinal assignment against the CPU/reference path and
  record checksum, score/partition metrics, runtime versions, and GPU memory.
- [ ] Add Qdrant/Valkey projection readback only after the parity receipt passes.
- [ ] Wire workflow/A2A artifact receipts and grounded repair outcomes; cluster
  membership alone must not authorize mutation.

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

For the live fixture, promotion-grade parity requires an explicit frozen
`--cluster-count K`. Leiden's observed community count is only a
`LEIDEN_CHALLENGER_UNFROZEN` exploratory fallback and is not canonical
cluster-count truth.

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

## Web-verification corrections — 2026-08-23

External-docs verification of the spectral RTX alignment sweep (see
`docs/reports/spectral-rtx-alignment-sweep-20260823.md` and
`docs/reports/spectral-live-fixture-implementation-audit.md`) surfaced four
corrections that change how the live cuGraph proof must be structured. Apply
these before promoting any spectral parity claim — they are stricter than
what was previously assumed, not looser.

1. **CPU/GPU partition parity must NOT require raw cluster-label equality.**
   Cluster labels are arbitrary — `CPU=[0,0,1,1]` and `GPU=[7,7,4,4]` are the
   *same* partition under label permutation. Use Adjusted Rand Index (ARI),
   which is exactly 1.0 for identical partitions regardless of labeling, and
   additionally canonicalize before checksumming: group CandidateOrdinals by
   cluster → sort members within each cluster → sort clusters by their
   minimum CandidateOrdinal → renumber `0..K-1` → `CanonicalSpectralPartitionV1`
   with a `partitionChecksum`. For the small frozen fixture, require an
   *exact* match after canonicalization (`ordinalMapChecksum`, `vertexSet`,
   `clusterCount`, canonical partition, `partitionChecksum` all exact) plus
   `adjustedRandIndex: 1.0`. For larger real-corpus runs, relax to measured
   ARI/NMI plus an objective-score (ratioCut/edgeCut/modularity) tolerance —
   do not require bitwise-exact partitions at scale.
2. **Do not assume the CPU reference's normalized-Laplacian formulation
   matches cuGraph's actual spectral implementation** — this is unconfirmed
   from cuGraph's own docs (cuML has a separate normalized-Laplacian spectral
   path; that is not evidence about cuGraph's). Make the CPU reference
   config explicit and versioned:
   `SpectralReferenceConfigV1 { algorithm, laplacianKind, numClusters,
   numEigenvectors, eigensolverTolerance, eigensolverMaxIterations,
   kmeansTolerance, kmeansMaxIterations, randomSeed }`. Do not promote parity
   until the reference formulation is confirmed to match the invoked cuGraph
   lane.
3. **Version the cuGraph algorithm explicitly — do not let `/v1/community/spectral`
   implicitly mean balanced-cut.** cuGraph exposes both `BALANCED_CUT` and
   `MODULARITY_MAXIMIZATION` spectral clustering; cuGraph 26.08 marks the
   current runtime may emit a deprecation warning for the balanced-cut call,
   while NVIDIA's current documentation still lists both Balanced Cut and
   Modularity Maximization. Freeze `algorithm: 'BALANCED_CUT' |
   'MODULARITY_MAXIMIZATION'` in both the request and the receipt. For the
   26.06 proof, keep whichever implementation the existing fixture contracts
   already target — do not silently migrate algorithms mid-proof; treat any
   later migration as a separate parity tranche. Prefer the documented
   `spectralModularityMaximizationClustering` signature when modularity is the
   selected algorithm and record all effective solver parameters.
4. **Don't collapse RAPIDS/CUDA versions into one ambiguous `cudaVersion`
   field.** RAPIDS 26.06 officially supports CUDA Toolkit 13.0–13.2 (580
   driver family); RAPIDS 26.08 expanded that to 13.0–13.3. The system
   `nvcc` version installed does not necessarily equal the CUDA runtime
   each RAPIDS library actually loads — this must be measured per-library,
   not inferred from `nvcc --version`. See the corresponding correction in
   `openspec/changes/parent-atlas-gpu-runtime-abi-alignment/tasks.md` for the
   full field list this implies for `SpectralGpuExecutionReceiptV1`.

### Corrected honest status (2026-08-23)

`SPECTRAL RTX ALIGNMENT`: contracts `PROVEN`, fixture contracts `PROVEN`,
RAPIDS import runtime `PROVEN`, GPU hardware visibility `PROVEN`,
`semantic_768` frozen corpus `MISSING`, live `/v1/community/spectral`
request `UNPROVEN`, CPU/GPU partition parity `UNPROVEN`,
`SpectralGpuExecutionReceiptV1` `MISSING`. Overall:
**`WIRED / FIXTURE_PROVEN / RUNTIME_UNPROVEN`** (unchanged conclusion from
the 2026-08-23 sweep report, now with corrected reasoning above). Successful
`cuGraph`/`cuVS`/`cuDF` imports and a visible RTX 3060 Ti are **environment
proof, not algorithm execution proof** — do not conflate the two.

Four named blockers, in dependency order:
- **Blocker A**: `semantic_768` frozen corpus absent.
- **Blocker B**: same-ordinal-map CPU spectral execution absent.
- **Blocker C**: real `/v1/community/spectral` RTX execution absent.
- **Blocker D**: canonical partition parity (CPU vs GPU, per corrections
  above) absent.

### Proposed build order (not yet started — SPECTRAL_RT-01..05)

1. **RT-01** — Produce the frozen semantic corpus: `CandidateOrdinalMapV1` +
   `SemanticMatrixV2` (`N×768` FP32) + a manifest carrying
   `workspaceRevision`, `candidateSnapshotRevision`, `ordinalMapChecksum`,
   `rowIdentityChecksum`, `representationId`, `representationRevision`,
   `producerRevision`, `rowCount`, `dimension=768`, `dtype=FP32`,
   `normalization`, `matrixChecksum`. No Postgres/Qdrant/Neo4j/Valkey
   mutation required for this step.
2. **RT-02** — Freeze the graph input GPU and CPU must consume identically:
   edge set, edge weights, symmetrization rule, self-loop policy, duplicate-
   edge policy, isolated-node policy, algorithm parameters, random seed —
   as `SpectralGraphSnapshotV1 { graphChecksum, ordinalMapChecksum }`. Do
   not let cuGraph's internal renumbering become the external identity
   coordinate.
3. **RT-03** — Run the CPU oracle, emitting `SpectralCpuExecutionReceiptV1`
   (`algorithm`, `referenceImplementationRevision`, `laplacianKind`,
   `candidateSnapshotRevision`, `ordinalMapChecksum`, `graphChecksum`,
   `numClusters`, `parameters`, `rawAssignmentChecksum`,
   `canonicalPartitionChecksum`, `ratioCut`, `edgeCut`, `modularity`,
   `elapsedMs`).
4. **RT-04** — Actually invoke `POST /v1/community/spectral` against the
   live WSL2 RAPIDS sidecar, requiring `executionDevice: 'CUDA'`,
   `realTargetExecution: true`, `gpuName: 'RTX 3060 Ti'`,
   `computeCapability: '8.6'` in the response.
5. **RT-05** — Emit `SpectralGpuExecutionReceiptV1` with sections `IDENTITY`
   (`requestId`, `candidateSnapshotRevision`, `ordinalMapChecksum`,
   `graphChecksum`), `ALGORITHM` (`algorithm`, `numClusters`,
   `numEigenvectors`, solver tolerances/iterations, `randomSeed`),
   `RUNTIME` (per-library versions — see the ABI-alignment doc),
   `EXECUTION` (`realTargetExecution`, `executionDevice`, `rowCount`,
   `edgeCount`, `elapsedMs`, `peakDeviceBytes`), `RESULT`
   (`rawAssignmentChecksum`, `canonicalPartitionChecksum`, `clusterCount`,
   `ratioCut`, `edgeCut`, `modularity`), `PARITY` (`cpuReceiptRef`,
   `cpuCanonicalPartitionChecksum`, `adjustedRandIndex`,
   `canonicalPartitionExact`, `objectiveTolerancePass`), `STATUS`
   (`RUNTIME_PROVEN | PARITY_FAILED | ENVIRONMENT_UNSUPPORTED`).

Only after Blocker D (RT-05's `PARITY` section) passes should any GPU
ABI/cuTile/CUTLASS/LibTorch benchmarking work resume — see the priority
freeze recorded in
`openspec/changes/parent-atlas-gpu-runtime-abi-alignment/tasks.md`.

## First live RT-04/RT-05 result: ARI 0.9535, below promotion threshold — diagnostic extension (SPECTRAL_DIAG-01..05)

A live run against the same frozen graph/ordinal map (`K=8`, same spectral
parameters, same frozen seed) produced **CPU-vs-cuGraph ARI = 0.953547** —
below the `>= 0.99` promotion threshold from the corrections above, but not
necessarily evidence of a defective GPU result. The measured value is
consistent with two numerically different but nearly-equivalent spectral
partitions of the same graph, which is a distinct failure mode from "the GPU
result is wrong" and needs to be distinguished before touching the
threshold.

**Do not lower the 0.99 threshold, and do not tune the CPU (NumPy) reference's
tolerances until its ARI crosses 0.99 to match cuGraph's labels.** cuGraph
26.06's spectral clustering is a legacy single-GPU path with independent
eigensolver/k-means controls, already being steered away from in newer APIs
— the actual proof question is *"do both implementations produce a
sufficiently equivalent, stable, quality-preserving partition of the same
frozen graph?"*, not *"can the CPU reference be parameter-tuned until it
emits cuGraph's exact labels?"*.

### Receipt extension (objective-quality diagnostics)

cuGraph separates the clustering operation itself from its analyzers
(`analyzeClustering_modularity`, `analyzeClustering_edge_cut`,
`analyzeClustering_ratio_cut`) — note balanced-cut specifically targets
RatioCut. Extend the parity receipt with independently-computed objective
metrics for both partitions, from both the cuGraph analyzer AND an
independent CPU reference analyzer (kept as `REFERENCE_DIAGNOSTIC`, not a
promotion authority, until its weighted-edge symmetrization semantics are
verified against cuGraph's):

```text
cpu_partition:  { assignment_checksum, canonical_partition_checksum, cluster_sizes,
                   cugraph_analyzer: { modularity, edge_cut, ratio_cut },
                   cpu_reference_analyzer: { modularity, edge_cut, ratio_cut } }
gpu_partition:  { assignment_checksum, canonical_partition_checksum, cluster_sizes,
                   cugraph_analyzer: { modularity, edge_cut, ratio_cut },
                   cpu_reference_analyzer: { modularity, edge_cut, ratio_cut } }
parity:         { adjusted_rand_index, modularity_abs_delta, edge_cut_abs_delta,
                   ratio_cut_abs_delta, disagreement_vertex_count,
                   disagreement_vertex_fraction, disagreement_ordinal_checksum }
```

### SPECTRAL_DIAG-02 — label-aligned disagreement receipt

ARI reports *how much* structural disagreement exists but not *where*.
Canonicalize cluster labels (same rule as the earlier corrections section)
and record `SpectralPartitionDeltaV1`: `vertexCount`, `clusterCount`, `ari`,
`matchedClusterPairs` (`CPU_i -> GPU_j`), `disagreementCount`,
`disagreementFraction`, `disagreementOrdinalChecksum` (bind a checksum from
the receipt rather than retaining the full ordinal list forever — write it
to a separate diagnostic artifact if needed), and `perCluster: { cpuSize,
gpuSize, retainedCount, movedIn, movedOut }`. This answers a materially
different question than the raw ARI number: "12 boundary vertices moved"
and "one entire sub-community got reassigned" are both consistent with
ARI≈0.9535 but imply very different next steps.

### SPECTRAL_DIAG-03 — GPU repeat-determinism proof (run before touching tolerances)

cuGraph exposes explicit `num_eigen_vects`, `evs_tolerance`, `evs_max_iter`,
`kmean_tolerance`, `kmean_max_iter`, `random_state` — and its lower-level
docs note an *omitted* random state defaults to a value derived from
process ID/time/hostname, which is why the explicit frozen seed here is
essential. Run the identical GPU calculation three times with every input
frozen (`graphChecksum`, `ordinalMapChecksum`, `K=8`, `numEigenvectors`,
`evsTolerance`, `evsMaxIterations`, `kmeansTolerance`, `kmeansMaxIterations`,
`randomSeed`) and require `gpuAssignmentChecksum` (post-canonicalization)
identical across all three runs.
- **If checksums match** across runs but CPU-vs-GPU ARI stays ~0.9535 with
  near-identical objective values: deterministic implementation divergence
  — an alternative, near-equivalent partition, not a bug.
- **If checksums differ** despite the frozen seed: a real GPU spectral
  determinism problem — investigate this before pursuing CPU parity
  further.

### SPECTRAL_DIAG-04 — CPU eigengap diagnostic

Have the CPU reference retain a few extra eigenvalues around the selected
embedding boundary (`eigenvalues[m-1], [m], [m+1], [m+2]` where `m` is the
eigenvector cutoff) and record `spectralGapAbs`/`spectralGapRelative`. This
is the highest-value numerical diagnostic here: standard spectral-clustering
literature links a small eigengap around the chosen invariant subspace to
weak eigenspace stability — small numerical perturbations can substantially
rotate that subspace and change the resulting clustering even when cut
quality is almost unchanged. That pattern (CPU embedding at slightly
different coordinates, GPU embedding landing on a non-convex/near-degenerate
k-means boundary, ~5% partition disagreement with near-identical graph
objective) would make k-means label-assignment sensitivity to
initialization — a documented scikit-learn caveat, and something cuGraph
exposes separate `kmean_tolerance`/`kmean_max_iter` controls for — a
credible root cause. Record `clusterCount`, `numEigenvectors`,
`eigensolverTolerance`, `eigensolverMaxIterations`, `kmeansTolerance`,
`kmeansMaxIterations`, `randomSeed` on every receipt going forward, not just
the seed.

### SPECTRAL_DIAG-05 — multi-seed stability matrix (diagnostic only, NOT promotion evidence)

After the frozen single-seed run is preserved, sweep a small seed matrix
(`S0..S3`) across both CPU and cuGraph, recording pairwise CPU-CPU ARI,
GPU-GPU ARI, CPU-GPU ARI, and modularity/edge-cut/ratio-cut for each. Mark
the whole artifact `SPECTRAL_STABILITY_DIAGNOSTIC / NON_PROMOTION` — do not
let it feed a promotion decision directly. Interpretation:
- CPU-CPU ARI wanders 0.95–1.0 → the CPU oracle is not itself a unique-
  partition oracle.
- GPU-GPU ARI wanders → investigate cuGraph determinism (see DIAG-03).
- Each implementation is internally stable but CPU-GPU is consistently
  ~0.9535 → a stable, implementation-specific solution (not noise).
- All solutions have near-indistinguishable objective values → raw ARI
  probably should not remain the *sole* eventual equivalence criterion —
  but this does not license lowering the threshold now, only informs a
  later, deliberate decision about what the promotion contract should be.

### Corrected proof-state receipt (richer than binary EXECUTED_UNPROVEN)

```text
RTX_SPECTRAL_RUNTIME:      PROVEN
FROZEN_INPUT_BINDING:      PROVEN
FROZEN_K:                  PROVEN
FROZEN_SEED:               PROVEN
CPU_REFERENCE_EXECUTION:   PROVEN
CUGRAPH_EXECUTION:         PROVEN
CPU_CUGRAPH_ARI:           0.953547  (BELOW_PROMOTION_THRESHOLD)
OBJECTIVE_PARITY:          DIAGNOSTIC_PRESENT
CROSS_IMPLEMENTATION_REFERENCE: PENDING
GPU_REPEAT_DETERMINISM:    NOT_YET_PROVEN
EIGENSPACE_STABILITY:      NOT_YET_CHARACTERIZED
PROMOTION:                 BLOCKED
```

This is meaningfully stronger evidence than a flat `EXECUTED_UNPROVEN`: real
RTX runtime execution is proven; what remains unproven is specifically
*spectral equivalence suitable for promotion*, not the runtime path itself.

**Next tranche, in order — no FANOUT/Qdrant/Neo4j writes or cuTile/CUTLASS/ABI
work should move ahead of this diagnosis**: `SPECTRAL_DIAG-01` (CPU-native
quality metrics: modularity/edge-cut/ratio-cut) → `SPECTRAL_DIAG-02`
(canonical cluster alignment + disagreement receipt) → `SPECTRAL_DIAG-03`
(3× identical-frozen-seed GPU determinism) → `SPECTRAL_DIAG-04` (CPU
eigenvalue-cutoff/eigengap receipt) → `SPECTRAL_DIAG-05` (non-promotion
multi-seed stability matrix) → **then** decide, with actual evidence in
hand, whether `ARI >= 0.99` remains the correct promotion contract.
