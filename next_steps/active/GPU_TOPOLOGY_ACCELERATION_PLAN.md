# GPU Topology Acceleration Plan

**Status**: ACTIVE  
**Updated**: July 10, 2026  
**Scope**: PyTorch / LibTorch topology work for packet embeddings, SOM, KMeans, and graph classification

---

## Correction

`LibTorch` and `TensorRT` are not the same lane.

- `LibTorch` is the C++ / N-API / PyTorch runtime lane already used for local CUDA-backed tensor work.
- `TensorRT` is an inference optimization lane that can come later if the model and deployment contract justify it.

Keep them separated in the board and in the code.

---

## Goal

Use GPU acceleration for topology and representation work, not for canonical identity or cache storage.

Primary targets:

- embedding compression
- latent-space interpolation
- KMeans clustering
- SOM 20x20 population
- Neo4j domain classification support
- reranker feature preparation

---

## Current Input Surfaces

- packet embeddings
- LangExtract concepts
- ast-grep structural facts
- lexical noun/verb/ngram features
- graph topology / community signals

These are the inputs to the GPU topology lane. They should not be recomputed in the GPU lane if the canonical data already exists in Postgres.

---

## Implementation Targets

### 1. PyTorch training lane

Files:

- `scripts/atlas/train-packet-jepa.py`
- `scripts/atlas/export-packet-jepa-training-pairs.mjs`
- `scripts/atlas/score-packet-jepa-similarity.mjs`

Tasks:

- [ ] Keep Packet-JEPA training bounded to offline evaluation
- [ ] Keep training data derived from canonical packet rows
- [ ] Keep model versioning explicit in `atlas_packet_metrics`

### 2. Topology compression lane

Files:

- `scripts/atlas/`
- `sveltekit-frontend/src/lib/server/gpu/`
- `sveltekit-frontend/src/lib/server/retrieval/`

Tasks:

- [ ] Build or validate the 768 -> 64 compression path
- [ ] Keep PCA as the baseline
- [ ] Keep autoencoder / learned compression as the later upgrade

### 3. SOM / KMeans lane

Files:

- `scripts/atlas/run-som-on-chunks.mjs`
- `scripts/atlas/gpu-kmeans-clustering.mts`
- `scripts/atlas/kmeans-summary-enrichment.mts`

Tasks:

- [ ] Keep SOM 20x20 population deterministic
- [ ] Keep KMeans on latent vectors, not raw identity columns
- [ ] Keep topology output stored as derived metrics

### 4. Neo4j domain classification support

Files:

- `scripts/atlas/`
- `sveltekit-frontend/src/lib/server/retrieval/`
- `sveltekit-frontend/src/lib/server/analysis/`

Tasks:

- [ ] Keep Neo4j as the graph/authority layer
- [ ] Use GPU outputs as supporting signals, not canonical labels
- [ ] Keep classification separate from the packet registry

---

## Package / Environment Gaps

### Already present

- PyTorch is available in the local Python environment from earlier experiment work
- ONNX and LangGraph tooling are already installed in the frontend workspace
- LibTorch/CUDA code paths already exist in the app

### Still to verify or install if needed

- Python-side torch stack for repeatable topology training
- any additional scientific packages required for the exact KMeans/SOM pipeline
- explicit GPU smoke coverage in the board

Do not add packages without tying them to a concrete script or test.

---

## Smoke Test Targets

- Packet-JEPA training can run in a bounded sample
- PCA / compression output is produced from canonical embeddings
- SOM 20x20 output is populated and valid
- KMeans labels are written back as derived metrics
- Neo4j-related classification reads derived topology, not raw identity

---

## Recommended Order

1. Lock canonical embedding coverage.
2. Run the offline PyTorch topology lane.
3. Validate SOM 20x20 population.
4. Write derived topology metrics back to Postgres.
5. Re-evaluate JEPA and reranking after the topology lane is stable.

---

## Notes

This lane is only for representation and topology work.

It should not be used to store packet identity, cache keys, or hot runtime state.
