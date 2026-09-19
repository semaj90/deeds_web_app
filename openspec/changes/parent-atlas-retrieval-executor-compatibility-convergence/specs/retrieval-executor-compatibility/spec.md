## ADDED Requirements

### Requirement: Compatibility receipts preserve canonical identity
Every executor receipt SHALL carry the qualified workspace, source, packet, representation, model, executor, and input/output checksum identity available for the operation. A receipt without required identity SHALL be `UNAVAILABLE` or `UNQUALIFIED`, never canonical.

#### Scenario: Unqualified packet is rejected
- **WHEN** an executor receives a packet without an admitted source revision or packet digest
- **THEN** it emits an unavailable receipt and performs no canonical write or promotion

#### Scenario: Qualified readback preserves identity
- **WHEN** Go Retrieval returns a revision-qualified PostgreSQL row
- **THEN** every downstream derived receipt repeats the same source and packet identity

### Requirement: Retrieval lanes remain distinct
Lexical, semantic, AST/CST, and graph retrieval SHALL remain logical lanes. Multiple executors for one lane SHALL contribute at most one normalized fusion vote.

#### Scenario: Duplicate semantic executors are deduplicated
- **WHEN** pgvector, Qdrant, and cuVS return evidence for the same logical semantic lane
- **THEN** SearchRuntime emits one semantic contribution with executor provenance

#### Scenario: AST evidence is bounded
- **WHEN** Tree-sitter or ast-grep produces a structural match
- **THEN** the result includes source revision, parser/producer revision, byte span, and evidence checksum

### Requirement: TensorRT-RTX CUDA 13.4 remains isolated
The TensorRT-RTX proof lane SHALL use a package matching CUDA 13.4 and SHALL record GPU capability, driver, toolkit, TensorRT-RTX, engine, model, and runtime-cache identity. It SHALL NOT modify the existing WSL2/RAPIDS environment.

#### Scenario: Prerequisite mismatch fails closed
- **WHEN** GPU, driver, CUDA, or TensorRT-RTX package versions do not match the support matrix
- **THEN** the proof emits `CAPABILITY_UNAVAILABLE` and does not build or promote an engine

#### Scenario: AOT/JIT/cache parity is proven
- **WHEN** a supported ONNX model builds an AOT engine, runs device JIT, and reuses a matching runtime cache
- **THEN** the receipt records separate build, warmup, steady-state, peak-memory, cache, and parity evidence

### Requirement: Reference parity precedes promotion
PyTorch CPU SHALL be the numerical reference. CUDA, ONNX, TensorRT-RTX, cuTile, cuGraph, and XGBoost outputs SHALL remain challengers until bounded replay and parity evidence pass.

#### Scenario: Challenger drift is visible
- **WHEN** a challenger output differs from the CPU reference beyond the declared tolerance
- **THEN** promotion remains false and the receipt records the mismatch and executor identity

### Requirement: Residency swaps are descriptor-only
BitFrost/Valkey cache swaps SHALL use revision- and checksum-addressed descriptors for manifests, candidates, and plans. They SHALL NOT persist hidden reasoning, tensors, or model KV/recurrent state.

#### Scenario: Incompatible cache is rejected
- **WHEN** a cached descriptor has a different GPU, model, representation, graph, feature, or prompt revision
- **THEN** the cache is treated as a miss and no incompatible state is loaded

### Requirement: Llama-server compatibility is verified before upgrade
The `:8090` llama-server lane SHALL be verified through health, model identity, runtime properties, request replay, and checksum evidence before any binary/model/runtime upgrade.

#### Scenario: Port responds with wrong model
- **WHEN** `/health` succeeds but `/v1/models` or `/props` reports an unexpected model or context contract
- **THEN** the lane is marked incompatible and no upgrade or promotion occurs

### Requirement: Workboard completion is evidence-based
This change SHALL distinguish `WRITTEN`, `WIRED`, `PROVEN`, and `PROMOTED`, and SHALL link each gate to its owning OpenSpec change. It SHALL NOT mark unrelated OpenSpec tasks complete merely because a compatibility receipt exists.

#### Scenario: Receipt cannot close an upstream task
- **WHEN** a GPU or classifier receipt exists while packet/source lineage is unresolved
- **THEN** downstream tasks remain blocked and the workboard identifies the upstream owner and first failure boundary

### Requirement: Worktree analysis is diagnostic-only
The `analyze this` coordinator SHALL preserve source paths, revisions when available, content checksums, parser revisions, and byte spans. Dirty-worktree results SHALL be labeled `WORKTREE_DIAGNOSTIC`, SHALL carry `canonicalAuthority=false`, and SHALL NOT authorize database, vector-store, cache, graph, or source writes.

#### Scenario: Dirty worktree result is returned
- **WHEN** a query matches files in the current worktree without an admitted workspace/source revision
- **THEN** the coordinator returns bounded top-K evidence with diagnostic provenance and does not promote the result as canonical

### Requirement: ACE cache does not persist model state
BitFrost/Valkey cache entries SHALL be revision- and checksum-addressed manifests, ACE packets, candidate snapshots, centroids, topology metadata, or residency descriptors. They SHALL reject or omit hidden reasoning, raw tensors, model KV state, and recurrent state.

#### Scenario: Cache identity changes with source or model revision
- **WHEN** any model, adapter, candidate, representation, graph, feature, workspace, source, packet, or checksum input changes
- **THEN** the cache key changes and the prior entry cannot be reused as an authoritative result

### Requirement: Synthesis and embedding providers remain separate
The production synthesis owner SHALL be llama-server `:8090`; Ollama `:11434` SHALL be EmbeddingGemma-only. Any service that still attempts Ollama chat SHALL fail closed or use the `:8090` OpenAI-compatible endpoint.

#### Scenario: Ollama chat fallback is disabled
- **WHEN** the synthesis service cannot reach llama-server `:8090`
- **THEN** it returns an unavailable receipt instead of routing chat to Ollama

### Requirement: Python and TurboVec runtime status is explicit
Runtime receipts SHALL record Python version, free-threaded/GIL state, worker strategy, TurboVec installation/importability, endpoint, and executor revision. Missing installation or unsupported runtime status SHALL remain unproven.

#### Scenario: TurboVec is documented but not installed
- **WHEN** no importable wheel or sidecar is found
- **THEN** the receipt reports `NOT_INSTALLED_OR_PROVEN` and TurboVec remains a challenger-only lane
