# Parent Atlas live graph + GPU execution proof

Date frozen: 2026-08-20

## Purpose

Execute the bounded proof requested by the spectral-routing tranche on the **current persisted semantic representation**, rather than introducing another schema or silently restoring older 768-dimensional assumptions.

This proof consumes the reviewed `semantic_512` reconciliation contract frozen by `parent-atlas-semantic-512-canonicalization`. EmbeddingGemma native width 768 remains model lineage; `semantic_512` is the current persisted exact semantic representation. `source_revision` is not fabricated; source freshness remains owned by `SourceVersionReceiptV1` / mutation-awareness receipts.

## Frozen path

```text
semantic_512 reconciliation manifest + receipt
        |
        | only ADMITTED identities
        | exact Qdrant point re-read
        | vector digest verification
        v
500..5000 packet_key/source_ref candidates
        |
        +--> PostgreSQL canonical relationships
        |      atlas_relationships
        |      atlas_relationship_members
        |      relationship_id retained
        |      pairwise compute view only
        |
        +--> cuVS exact all-neighbors
               semantic_512 cosine top-K
               SEMANTIC_KNN derived only
        |
        v
frozen weighted graph fixture
        |
        +--> PageRank
        +--> spectral balanced cut
        +--> spectral modularity maximization
        +--> Leiden
        +--> existing KMeans/SOM baselines when present
        |
        v
LiveGraphFixtureReceiptV1
        |
        +--> stability ARI
        +--> modularity / edge-cut / ratio-cut when exposed
        +--> Recall@K / source coverage / historical repair coverage when eval cases exist
        +--> runtime / GPU-memory receipt
        |
        v
NVTX parent-atlas@atlas.graph_fixture
        |
        +--> Nsight Systems
        |      CUDA + NVTX + cuBLAS + cuBLAS verbose
        |      `.nsys-rep` = canonical trace artifact
        |      JSONLines / SQLite = derived exports
        |
        +--> Nsight Compute
               same NVTX push/pop range
               `.ncu-rep` + raw CSV metrics
               Tensor Core / precision evidence
```

## Authority rules

- PostgreSQL remains canonical relationship/participant authority.
- The relationship pairwise view is derived computation and retains `relationship_id` / `relationship_revision`.
- `SEMANTIC_KNN` edges are derived similarity and cannot mint a relationship.
- `semantic_512` exact retrieval is one semantic evidence family; cuVS/Qdrant/HNSW/FAISS are executors, not extra votes.
- Spectral cluster IDs, Leiden communities, PageRank/PPR, KMeans and SOM are derived routing signals.
- `tensor_core_used=true` is forbidden unless Nsight Compute reports non-zero Tensor/HMMA/IMMA/MMA metric evidence.
- A cuBLAS/cuBLASLt API observation alone proves the API path, not Tensor Core use.
- The `.nsys-rep` checksum is the durable execution-trace identity; exported JSONLines/SQLite are derived inspection surfaces.
- No graph/clustering/profiler receipt authorizes source mutation.

## Implementation status

```text
LVG-0 semantic_512 reconciliation prerequisite              EXISTING_UNEXECUTED
LVG-1 semantic_512 exact fixture builder                    IMPLEMENTED_UNPROVEN
LVG-2 canonical N-ary relationship compute projection      IMPLEMENTED_UNPROVEN
LVG-3 exact cuVS semantic top-K graph                       IMPLEMENTED_UNPROVEN
LVG-4 live cuGraph PageRank                                 IMPLEMENTED_UNPROVEN
LVG-5 spectral balanced-cut                                 IMPLEMENTED_UNPROVEN
LVG-6 spectral modularity                                   IMPLEMENTED_UNPROVEN
LVG-7 Leiden comparison                                     IMPLEMENTED_UNPROVEN
LVG-8 stability/analyzer/repair metrics                     IMPLEMENTED_UNPROVEN
LVG-9 GPU memory telemetry                                  IMPLEMENTED_UNPROVEN
LVG-10 Nsight Systems immutable trace                       IMPLEMENTED_UNPROVEN
LVG-11 Nsight Compute Tensor Core/precision evidence        IMPLEMENTED_UNPROVEN
LVG-12 Graphify daily adoption                              PENDING
LVG-13 workflow/A2A artifact streaming                      PENDING
LVG-14 agentic repair validator fixture                     PENDING
```

`IMPLEMENTED_UNPROVEN` means runnable code exists; no live workstation PASS is implied.

## Operator sequence

First complete the existing read-only semantic reconciliation:

```bash
python python/atlas_semantic512_reconcile.py \
  --manifest-out data/atlas-ml/semantic512-reconciliation.ndjson \
  --receipt-out data/atlas-ml/semantic512-reconciliation-receipt.json
```

Review all `REVIEW` / `REJECTED` classes and the manifest checksum. The live graph builder consumes only `ADMITTED` rows and re-verifies exact Qdrant vector digests.

Build a 1000-candidate graph:

```bash
PYTHONPATH=python python python/build_live_graph_fixture_semantic512.py \
  --reconciliation-manifest data/atlas-ml/semantic512-reconciliation.ndjson \
  --reconciliation-receipt data/atlas-ml/semantic512-reconciliation-receipt.json \
  --workflow-id=<workflow-id> \
  --workflow-revision=<workflow-revision> \
  --source-snapshot-revision=<source-snapshot-revision> \
  --graph-revision=<graph-revision> \
  --feature-revision=<feature-revision> \
  --limit=1000 \
  --clusters=20 \
  --semantic-top-k=16 \
  --output=.tmp/atlas/live-graph/live-graph.json
```

Execute cuGraph:

```bash
PYTHONPATH=python python python/prove_live_graph_fixture.py \
  --fixture=.tmp/atlas/live-graph/live-graph.json \
  --output=.tmp/atlas/live-graph/live-graph-fixture-receipt.json
```

Profile the exact frozen fixture:

```bash
bash scripts/atlas/profile-live-graph-fixture.sh \
  .tmp/atlas/live-graph/live-graph.json \
  .tmp/atlas/live-graph/profile
```

Expected profiler outputs include:

```text
live-graph.nsys-rep                 canonical trace artifact
live-graph*.json/jsonlines          derived Nsight Systems export when supported
live-graph*.sqlite                  derived Nsight Systems export when supported
live-graph-ncu.ncu-rep              Nsight Compute report
live-graph-ncu.csv                  derived raw metric export
gpu-execution-evidence-receipt.json
```

## Proof criteria

Do not add this to `graphify:daily` until all of the following are observed on one frozen revision-qualified fixture:

1. at least 500 admitted semantic_512 rows with valid packet_key/source_ref and vector digest lineage;
2. non-zero canonical relationship coverage after the proven `entity_id -> packet_key` join; if this join is wrong, fail and repair identity resolution rather than invent edges;
3. exact cuVS semantic top-K receipt uses `semantic_512`, dimension 512, cosine, brute-force all-neighbors;
4. PageRank, balanced cut, spectral modularity and Leiden all return complete dense-ordinal outputs;
5. spectral/Leiden stability and available modularity/edge-cut/ratio-cut metrics are recorded;
6. quality is compared against existing KMeans/SOM signals and, once historical repair cases are attached, validator/repair success is measured;
7. GPU memory stays inside the admitted resource envelope;
8. Nsight Systems produces a checksum-addressed `.nsys-rep` for `atlas.graph_fixture@parent-atlas`;
9. any cuBLAS/cuBLASLt claims come from observed trace records;
10. any Tensor Core claim is supported by non-zero Nsight Compute metrics, not names/heuristics;
11. no code path fabricates `source_revision` or treats vector dimension as mutation freshness.

## Tests

```bash
npm --prefix packages/parent-atlas run build
node --test packages/parent-atlas/test/spectral-graph-clustering.test.mjs
node --test packages/parent-atlas/test/gpu-trace-evidence.test.mjs
PYTHONPATH=python python python/test_live_graph_fixture.py
```

The pure tests prove validation/checksum rules only. RAPIDS, Qdrant, PostgreSQL and Nsight gates remain unproven until the operator sequence produces receipts.
