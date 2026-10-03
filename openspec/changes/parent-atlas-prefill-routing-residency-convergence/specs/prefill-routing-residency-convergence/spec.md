## ADDED Requirements

### Requirement: Revision-qualified convergence DAG

The convergence layer SHALL consume an admitted workspace revision, source/execution receipt, packet revision, and current lineage closure before producing a promotable retrieval, prefill, residency, or learning receipt.

#### Scenario: Upstream lineage is incomplete
- **WHEN** packet revision, current packet/chunk closure, or AST/span authority is absent
- **THEN** the convergence result is fail-closed and records the missing gate without fabricating identity or revision values

#### Scenario: All upstream evidence is qualified
- **WHEN** the required revision-qualified receipts and lane inputs are present
- **THEN** the DAG may construct bounded retrieval, context, prefill, and execution plans while preserving each owner’s receipt

### Requirement: Representation and executor ownership

The system SHALL distinguish canonical representations, derived representations, logical lanes, and execution providers, and SHALL require independent capability/parity receipts for every executor.

#### Scenario: Challenger executor is available
- **WHEN** ONNX WebGPU, DirectML, TensorRT-RTX, cuVS, or CAGRA produces a result
- **THEN** it is labeled with its executor receipt and cannot become canonical or add an additional fusion vote without its promotion gate

#### Scenario: Derived feature is unavailable
- **WHEN** a routing or candidate feature lacks an authoritative source revision
- **THEN** the feature carries explicit missingness and is not silently zero-filled

### Requirement: Deterministic routing policy

The routing layer SHALL preserve `QueryRouterTensorV1[154]` as the primary routing tensor and SHALL map learned logical-needs predictions through deterministic capability policy before selecting retrieval lanes or executors.

#### Scenario: Learned router predicts a logical need
- **WHEN** the shadow model predicts a need such as lexical, semantic, AST, or graph retrieval
- **THEN** deterministic policy resolves eligible lanes and executors without allowing the model to select implementation names

### Requirement: Unified GPU residency budget

All participating GPU executors SHALL use one revisioned residency budget and lease policy covering PyTorch CUDA, cuVS, TensorRT-RTX, DirectML, WebGPU, and model runtime allocations.

#### Scenario: Budget would be exceeded
- **WHEN** a planned lease exceeds the approved GPU budget
- **THEN** the request fails with `GPU_RESIDENCY_BUDGET_EXCEEDED` and does not trigger implicit OOM or fallback

### Requirement: Checkpoint taxonomy separation

The system SHALL keep ML activation checkpoints, `AtlasPassCheckpointV1`, residency checkpoints, and model KV/recurrent state as separate contracts with separate owners and lifecycles.

#### Scenario: A pass resumes
- **WHEN** PCA, SVD, KMeans, SOM, Graphify, or DAG work resumes
- **THEN** it uses `AtlasPassCheckpointV1` and does not restore model KV/recurrent state or claim a training activation checkpoint

### Requirement: TensorRT-RTX compatibility proof lane

The TensorRT-RTX lane SHALL remain isolated and read-only until exact version, CUDA, driver, GPU capability, engine checksum, shape profile, runtime-cache identity, residency, and parity evidence are recorded.

#### Scenario: CUDA compatibility is uncertain
- **WHEN** the installed toolkit is not directly covered by the TensorRT-RTX support matrix
- **THEN** the lane is classified incompatible or unproven and does not upgrade or replace the working CUDA/RAPIDS stack

#### Scenario: Engine parity is not proven
- **WHEN** TensorRT-RTX output differs from the preceding numerical oracle
- **THEN** the engine remains a challenger and cannot be promoted, cached as canonical, or used for online learning

### Requirement: Verified offline-learning eligibility

Offline QLoRA/SFT/DPO tuple eligibility SHALL require a validated execution receipt with source, workspace, packet, model, adapter, and representation revisions, and SHALL remain split by source revision.

#### Scenario: Generated output lacks verified provenance
- **WHEN** an execution result lacks complete lineage or independent validation
- **THEN** it is excluded from training eligibility and no online weight update occurs
