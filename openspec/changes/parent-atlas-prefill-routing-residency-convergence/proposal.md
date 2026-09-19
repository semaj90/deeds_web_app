## Why

Parent Atlas has separate contracts for query routing, candidate features, prefill, topology, GPU execution, and ACE/BitFrost residency, but no planning-level change currently proves how they converge into one revision-qualified execution DAG. This change creates that coordination layer while the upstream packet/source lineage gates remain unresolved, so future integrations do not invent a second identity, executor, cache, or checkpoint owner.

## What Changes

- Define a planning-only convergence contract from `UserQuery` through routing, bounded retrieval, `ContextManifestV1`, `PromptPlanV1`, model-native prefill, and verified offline-learning eligibility.
- Inventory and cross-reference existing owners for lineage, query classification, neural prefill, candidate features, tensor residency, ACE/BitFrost, semantic embeddings, Graphify, CandidateOrdinal, Qdrant, cuVS, CAGRA, and topology.
- Reconcile typed contracts for routing tiles, prefill decisions, executor capability, GPU residency budgets/leases, native inference, TensorRT-RTX proof receipts, derived features, prefill DAG receipts, model-prefill identity, and verified training-tuple eligibility.
- Freeze representation-versus-executor boundaries, checkpoint taxonomy, deterministic executor policy, and fail-closed receipt requirements.
- Add read-only proof plans and an evidence manifest for the isolated TensorRT-RTX compatibility lane, CUDA 13.4/runtime rules, Node-API/LibTorch boundaries, ORT DirectML/WebGPU challengers, and cuVS/CAGRA executor separation.
- Keep all packet, source, workspace, chunk, AST, vector-store, cache, model, residency, and learning mutations explicitly closed until their owning gates pass.

## Capabilities

### New Capabilities

- `prefill-routing-residency-convergence`: Revision-qualified coordination contracts, ownership matrix, executor/residency policy, proof receipts, and planning-first dependency DAG for Parent Atlas prefill and routing convergence.

### Modified Capabilities

None. Existing capabilities remain the owners of their requirements; this change only defines their convergence boundary and consumes their receipts.

## Impact

- OpenSpec planning artifacts and read-only evidence manifests under `openspec/changes/parent-atlas-prefill-routing-residency-convergence/`.
- Existing retrieval, lineage, feature, prefill, residency, executor, ACE/BitFrost, and model interfaces are cross-referenced but not replaced.
- No PostgreSQL DDL, packet backfill, Qdrant/Valkey/graph mutation, model promotion, CUDA/RAPIDS upgrade, or online learning is authorized.
