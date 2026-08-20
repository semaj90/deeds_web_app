# Parent Atlas — Event / Merkle / Graph Identity Implementation Pack

This is a scaffold/contract pack, not a claim that these exact files are absent.

## Recommended language split

- **TypeScript** — identity contracts, MCP, event envelopes, outbox adapters, policy receipts, Merkle orchestration.
- **PostgreSQL SQL** — durable uniqueness, atomic evidence+outbox transaction, checkpoint rows.
- **Python + RAPIDS** — daily GPU analytics, cuDF/cuGraph/cuML/CuPy, KMeans/PageRank/Louvain, batch feature compilation.
- **Java/Kotlin Kafka Streams (optional)** — only if stateful stream processing needs exceed TS consumers + Postgres.
- **Rust (optional)** — only if a measured hashing throughput bottleneck justifies a dedicated Merkle worker.

Default: **TypeScript + Node SHA-256 for Merkle checkpoints**. Merkle correctness/reproducibility matters more than GPU acceleration at current scale.

## Semantic envelope classes

1. `WorkCommand` — perform work.
2. `IntegrationEvent` — canonical/derived materialization changed; projections may react.
3. `AnalyticsEvent` — behavior was observed; learn from it.
4. `FailureObservation` — classify failure; do not recursively self-retry.
5. `RecommendationSignal` — disposable derived prefetch/prefill/boost hint.
6. `PolicyDecisionReceipt` — accepted/rejected/applied policy decision.
7. `CheckpointCommit` — exact ordered event population frozen under a Merkle root.

## Graph identity

- `parse_node_id` — parser-backed structural occurrence.
- `symbol_id` — stable logical symbol across revisions.
- `symbol_version_id` — revision-bound symbol occurrence.
- `chunk_id` — chunk/materialization identity.
- `packet_key` — evidence entity.
- `concept_id` — ontology concept.
- `tree_node_id` — tree projection-row identity, NOT stable symbol identity.
- `graph_node_key` — typed graph projection key.

`page_index_path` is navigation/presentation, not canonical identity.

## Immediate order

1. Prove code-evidence integration-event delivery.
2. Inventory graph identity fields/writers/readers.
3. Fix lossy `page_index_path` generation using canonical `source_ref` hashing.
4. Prove stable `symbol_id`.
5. Prove `symbol_version_id`.
6. Keep canonical graph snapshot blocked until identity gates pass.
7. Prove semantic_768 coverage → KNN → KMeans → SOM → PageRank.
8. Add Kafka analytics.
9. Build Merkle checkpoints.
10. Run daily RAPIDS feature compiler.
11. Generate recommendation/prefetch/prefill signals.
12. Generate evidence-backed daily Kanban.
