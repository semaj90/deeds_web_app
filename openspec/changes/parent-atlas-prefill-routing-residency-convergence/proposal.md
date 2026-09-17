# Parent Atlas Prefill Routing Residency Convergence

## Why

Parent Atlas already has separate owners for query classification, retrieval planning, canonical packet/source lineage, semantic_768, candidate features, topology/locality, ACE/BitFrost residency, GPU executors, ContextManifest/PromptPlan, model prefill, and downstream learning. The current risk is not missing subsystems; it is cross-owner convergence without a single revision-qualified execution identity.

The current blocker chain is:

1. Workspace authority — admitted/proven.
2. Execution/source producer authority — unresolved.
3. Current packet materialization — unresolved; missing packets and missing packet digests must be measured separately. The fresh bounded 128-row packet→chunk audit timed out and its older 10-row receipt is not current evidence.
4. `PacketRevisionOwnerV1` — unresolved.
5. Packet→chunk and packet→AST current closure — unresolved.
6. RPC registry — complete downstream consumer and correctly fail-closed.

This change is therefore a **planning-first convergence change**, not a new subsystem and not a promotion request. It coordinates existing owners, defines cross-owner receipt requirements, and permits only read-only/code-only proof work until lineage authority is resolved.

## What Changes

- Inventory and cross-reference existing owners before adding implementation.
- Freeze one revision-qualified prefill execution DAG from query classification through retrieval, candidate features, ContextManifest/PromptPlan, ACE/BitFrost residency, model-native prefill, decode, and execution receipts.
- Reconcile representation identity versus executor identity so `LANE != EXECUTOR` remains enforceable.
- Define or reuse routing, executor capability, GPU budget/lease, native inference, prefill-derived-feature, DAG execution, model-prefill identity, and verified-training-eligibility receipts.
- Add a single GPU residency/budget boundary so PyTorch CUDA, cuVS, CAGRA, ONNX Runtime, DirectML/WebGPU, TensorRT-RTX, and the local LLM runtime cannot independently claim the same 8 GB VRAM budget.
- Keep TensorRT-RTX 1.6 as an isolated compatibility/proof lane. The current workstation CUDA/RAPIDS installation is independent and MUST NOT be upgraded or replaced merely to satisfy TensorRT-RTX.
- Pin official NVIDIA, CUDA, PyTorch, Node-API, cuVS/RAPIDS, and ONNX Runtime documentation in `evidence-manifest.md` before any native/GPU implementation.
- Preserve checkpoint taxonomy: ML activation checkpoints, Atlas pass checkpoints, residency checkpoints, and model KV/recurrent state are separate concepts.
- Keep QLoRA/SFT/DPO offline and downstream of verified execution outcomes only.

## Existing Owner Candidates To Reuse

At minimum, inventory these changes and their current code owners before implementation:

- `parent-atlas-retrieval-lineage-dag-convergence`
- `parent-atlas-query-routing-classifier`
- `parent-atlas-neural-prefill-encoder`
- `parent-atlas-candidate-feature-execution-fabric`
- `parent-atlas-tensor-residency-integration`
- `parent-atlas-ace-bitfrost-cache-correctness`
- `parent-atlas-memory-architecture-freeze`
- `parent-atlas-semantic-768-canonical-contract`
- `parent-atlas-onnx-webgpu-embedding-promotion`
- existing `PacketControlWord`, Hilbert, and Hamming contracts
- existing Qdrant/cuVS/CAGRA executor contracts
- existing Graphify, CandidateOrdinal, ContextManifest, PromptPlan, and execution-receipt contracts

An implementation SHALL be reused or extended when an owner already exists. This change SHALL NOT create a parallel router, cache owner, semantic lane, packet identity owner, graph owner, or GPU residency owner merely because a new coordinating contract is needed.

## External Blockers

The following remain prerequisites owned outside this change:

- canonical `PacketRevisionOwnerV1`;
- current workspace/source/execution/packet/chunk lineage qualification;
- current packet→AST closure;
- canonical `semantic_768` representation/executor identity;
- current WebGPU QInt8-512 challenger classification/parity status.

This change MAY define contracts, tests, documentation, and read-only proof tooling while those gates remain blocked. It MUST NOT fabricate missing lineage to unblock itself.

## Non-Goals / Mutation Freeze

This initial tranche MUST NOT:

- fabricate packet/source/workspace/graph/representation revisions;
- apply PostgreSQL DDL or migrations;
- write/backfill packets or packet digests;
- rewrite historical packet/chunk/AST identity;
- create or mutate canonical Qdrant collections;
- mutate Neo4j canonical graph state;
- mutate BitFrost/Valkey canonical cache state;
- run unrelated Graphify APPLY or refresh Graphify solely for this change;
- promote WebGPU, DirectML, TensorRT-RTX, cuVS, CAGRA, learned routing, topology, or low-rank challengers;
- alter model attention-KV or recurrent/SSM ownership;
- write QLoRA/SFT/DPO datasets from unverified outcomes;
- upgrade or replace the working RAPIDS/CUDA stack to satisfy TensorRT-RTX.

## Capability

### Added capability: `prefill-routing-residency-convergence`

The capability specifies how already-existing routing, retrieval, representation, residency, executor, prefill, receipt, and offline-learning owners converge through revision-qualified artifacts without transferring canonical identity authority to an executor, cache, projection, model score, or physical memory coordinate.

`WRITTEN != WIRED != PROVEN != PROMOTED`. File existence alone is never evidence of runtime adoption or promotion.
