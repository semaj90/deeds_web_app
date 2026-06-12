# Atlas Production Roadmap: Corrected Stage Order

This is the current operator-facing roadmap for the parent atlas stack. It replaces the older Phase 3-9 ordering as the working sequence for storage, memory, ranking, and graph enrichment.

## Corrected Stage Order

Decision docs:
- `docs/atlas/parent-atlas-storage-decision.md`
- `docs/atlas/xgboost-reranker-contract.md`
- `docs/atlas/native-gemm-deferral.md`

### 1. BM25 + concept activation
- Postgres stays the source of truth for rows, joins, and task state.
- Redis / Valkey / Bitfrost stays hot-cache only.
- Qdrant stays the semantic ANN layer.
- Neo4j stays the traversal / planning graph.
- DuckDB / MapReduce stays the offline scan and recomputation lane.
- SeaweedFS stays the cold blob store.
- Canonical keys: `source_ref`, `source_ref_key`, `feature_id`, `packet_key`, `qdrant_point_id`, `neo4j_node_id`, `redis_hot_key`, `seaweed_object_key`.

### 2. spectra-g / Engram optional adapter boundary
- spectra-g / Engram is the preferred optional adapter surface for query transitions, hot context, and replay hints.
- Tiny-Engram is not the canonical contract; keep it as an experimental fallback only.
- The adapter must fail open and must not override provenance, source code, or audit data.
- TurboQuant / RotorQuant stay research labels, not correctness dependencies.

### 3. Retrieval telemetry and lineage
- Maintain read-only telemetry for retrieval strategy, packet selection, selected concepts, and reward.
- Preserve sourceRef -> feature_id -> feature_label lineage before adding more graph automation.
- Repair joins before adding more transport or GPU complexity.

### 4. XGBoost formal reranker
- XGBoost is the formal reranker input, not a side-channel scorer.
- The reranker sits after Qdrant ANN + Neo4j expansion and before final context assembly.
- Activation remains gated by the contract in `docs/atlas/xgboost-reranker-contract.md`.
- Cross-encoder ranking remains optional and later.

### 5. Neo4j contextual trees + HyperRAG packet RPC
- Seed `USED_CONCEPT` and `USED_PACKET` edges from agent traces.
- Add reward-bearing trace edges before running broader GDS ranking.
- Build from bounded packet keys and trace IDs, not from supernode-first traversals.

### 6. Autoencoder / SOM latent topology
- Maintain 768d -> latent -> centroid representations.
- Keep this layer offline until coverage is measurable and stable.

### 7. Native GEMM / pybind11 deferred
- Do not promote native GEMM / pybind11 / GPU JSON parsing ahead of the measured pressure gates.
- Keep MessagePack / gRPC / FlatBuffers / Arrow / cuDF as future lanes only if packet volume and parse pressure justify them.
- Phase 17I remains a spec lane until the audit says the existing CPU / DuckDB stack is insufficient.

## Working Priorities

1. Keep the storage tier boundaries stable.
2. Keep spectra-g / Engram optional and fail-open.
3. Keep XGBoost formalized as the reranker contract.
4. Keep graph learning behind trace and edge coverage.
5. Defer native GEMM / pybind11 until the rest of the contract is proven.

## Legacy Notes

The older Phase 3-9 roadmap in prior operator docs is historical context only. Use the corrected stage order above for current work planning.
