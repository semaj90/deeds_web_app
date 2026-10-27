## Why

Parent Atlas needs a practical way to analyze a very large repository without embedding every file or creating parallel identity, graph, cache, or event owners. A directory-first pipeline can prioritize bounded structural analysis and only request embeddings for admitted, useful sources, while preserving the existing OpenSpec owners and fail-closed production gates.

## What Changes

- Define a directory-first analysis workflow that reuses the current incremental source inventory, directory feature matrix, AST/symbol, retrieval, graph, and ACE owners.
- Specify deterministic directory features and explainable advisory prioritization, with bounded CPU batches and revision-qualified incremental invalidation.
- Keep embeddings selective and optional; require canonical source/chunk lineage and producer receipts before any vector generation or persistence.
- Define GPU clustering/ranking as an optional projection over frozen inputs, gated by live resource availability and CPU-oracle parity.
- Record Kafka as a future transport adapter for existing WAL/outbox events, not a new event or identity authority. Keep JSON decomposition (including GPJSON evaluation) as a bounded ingestion concern, not a substitute for source verification or semantic analysis.
- Prohibit production database/cache/projection writes, model changes, GPU jobs, and Graphify execution from this planning change.

## Capabilities

### New Capabilities
- `directory-first-analysis`: Bounded, explainable, revision-aware repository analysis composed from existing Parent Atlas owners.

### Modified Capabilities
- None. Existing source inventory, canonical-directory ingestion, GPU substrate, retrieval, event outbox, and ACE requirements remain with their current owners.

## Impact

- Planning artifacts under `openspec/changes/atlas-directory-first-analysis-v1/`.
- Existing owners referenced for implementation: `parent-atlas-canonical-directory-ingestion-fabric`, `parent-atlas-gpu-graph-vector-substrate`, and the existing WAL/outbox change that owns event delivery.
- No new runtime dependency or service is introduced by this proposal. Kafka and GPJSON are evaluation/adapter topics only until separately approved and specified.
