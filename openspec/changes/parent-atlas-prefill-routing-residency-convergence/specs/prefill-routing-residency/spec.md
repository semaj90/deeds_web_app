# Prefill Routing Residency Convergence Specification

## ADDED Requirements

### Requirement: PRRC-1 Existing owner coordination
The convergence change SHALL inventory and reuse existing owners before creating any new routing, lineage, semantic, residency, executor, cache, graph, ContextManifest, PromptPlan, or receipt contract.

#### Scenario: A requested contract already exists
- **WHEN** an existing owner provides a semantically compatible contract or runtime boundary
- **THEN** this change reuses or extends that owner
- **AND** SHALL NOT create a parallel implementation merely to satisfy this change.

### Requirement: PRRC-2 Canonical lineage prerequisite
No prefill routing/residency promotion SHALL proceed unless workspace, execution/source producer, packet materialization, `PacketRevisionOwnerV1`, packet→chunk, and packet→AST authority are current and revision-qualified.

#### Scenario: Packet materialization is unresolved
- **WHEN** current packet materialization is missing, timed out, stale, or based on an older bounded sample
- **THEN** downstream CandidateOrdinal, semantic promotion, ACE residency, GPU promotion, ContextManifest/PromptPlan execution, and training eligibility remain blocked
- **AND** no missing revision is fabricated.

### Requirement: PRRC-3 Packet absence and digest absence are distinct
The bounded packet-materialization proof SHALL distinguish a missing packet row from a present packet whose required digest/revision evidence is missing.

#### Scenario: Packet row exists but digest is unavailable
- **WHEN** a current packet row exists and packet digest evidence does not
- **THEN** the result is classified `PACKET_DIGEST_MISSING`
- **AND** SHALL NOT be reported as `PACKET_MISSING`.

### Requirement: PRRC-4 Bounded timeout proof discipline
A timed-out bounded lineage query SHALL be `NOT_PROVEN` and SHALL NOT be interpreted as an empty result or as permission to mutate indexes/schema.

#### Scenario: Current 128-row join times out
- **WHEN** the read-only current workspace/execution packet join exceeds its tracked query timeout
- **THEN** the stale smaller receipt is not reused as fresh evidence
- **AND** the next proof captures a bounded `EXPLAIN` plan, narrows projected columns/driving relations, and remains read-only unless a separate owner authorizes mutation.

### Requirement: PRRC-5 Lane is not executor
Logical retrieval lanes and physical executors SHALL remain distinct.

#### Scenario: Multiple semantic executors are available
- **WHEN** Qdrant, cuVS brute force, CAGRA, or another executor can serve the same semantic representation
- **THEN** they remain executors/challengers under one logical semantic lane
- **AND** SHALL NOT create additional RRF votes.

### Requirement: PRRC-6 Semantic representation ownership
`semantic_768` SHALL remain the canonical dense semantic representation under its existing owner. Derived routing/latent/topology representations SHALL remain non-authoritative.

#### Scenario: A latent or routing representation is produced
- **WHEN** `classification_mrl_128`, `latent_128`, `latent_64`, PCA/SVD, KMeans, SOM20x20, Topology4, Hamming, or Hilbert output is produced
- **THEN** it is revision-qualified derived evidence
- **AND** SHALL NOT replace `semantic_768` or packet identity.

### Requirement: PRRC-7 Missingness is explicit
Routing and candidate-feature values SHALL distinguish observed zero from missing/unavailable/stale/revision-mismatched evidence.

#### Scenario: A canonical feature is unavailable
- **WHEN** a feature value cannot be established for the required revision
- **THEN** its state records `MISSING`, `UNAVAILABLE`, `STALE`, or `REVISION_MISMATCH`
- **AND** the system SHALL NOT silently zero-fill it as an observed value.

### Requirement: PRRC-8 Learned routing predicts logical needs only
Learned routing SHALL predict stable logical retrieval needs and SHALL NOT predict implementation/product names.

#### Scenario: Router emits a prediction
- **WHEN** the learned router evaluates `QueryRouterTensorV1[154]`
- **THEN** its outputs describe logical needs such as lexical/semantic/AST/graph requirements
- **AND** deterministic capability policy selects Qdrant, cuVS, CAGRA, TensorRT, DirectML, WebGPU, or other executors separately.

### Requirement: PRRC-9 Routing feature tile is derived only
If `RoutingFeatureTile4x6V1` is adopted, it SHALL be a derived routing/debug view and SHALL NOT replace `QueryRouterTensorV1[154]` or `CandidateFeatureMatrix`.

#### Scenario: The 4×6 tile is built
- **WHEN** its 24 cells are materialized
- **THEN** each cell records source feature revision and missingness state
- **AND** the frozen row/column vocabulary defined in design.md is preserved.

### Requirement: PRRC-10 Topology and locality boundaries
Hamming SHALL be a candidate prefilter only, Hilbert SHALL be a physical/locality ordering key only, KMeans and SOM20x20 SHALL remain distinct, and Topology4 SHALL remain a routing/cache/visualization coordinate.

#### Scenario: Topology4 is consumed
- **WHEN** Topology4 participates in routing, cache, or visualization
- **THEN** it SHALL NOT be described as a Riemannian manifold absent a decoder-induced metric or equivalent bounded JVP/VJP proof.

### Requirement: PRRC-11 Checkpoint taxonomy
ML activation checkpoints, Atlas pass checkpoints, residency checkpoints, and LLM KV/recurrent state SHALL remain distinct checkpoint classes.

#### Scenario: A checkpoint is recorded
- **WHEN** state is persisted or referenced for restart/memory policy
- **THEN** its checkpoint class and owner are explicit
- **AND** one checkpoint category SHALL NOT substitute for another.

### Requirement: PRRC-12 One GPU budget owner
Promoted GPU executors SHALL consume one shared logical residency/budget owner rather than independently claiming available VRAM.

#### Scenario: GPU capacity is insufficient
- **WHEN** a bounded executor lease would exceed the configured residency budget
- **THEN** the admission result is `GPU_RESIDENCY_BUDGET_EXCEEDED`
- **AND** the system SHALL NOT rely on implicit OOM as normal policy.

### Requirement: PRRC-13 TensorRT-RTX isolation
TensorRT-RTX SHALL be an isolated executor capability lane and SHALL NOT require modifying the working RAPIDS/CUDA environment.

#### Scenario: TensorRT-RTX package compatibility is checked
- **WHEN** the workstation toolkit is not an exact documented package target for the selected TensorRT-RTX release
- **THEN** the capability receipt is blocked or uses an isolated matching environment
- **AND** SHALL NOT upgrade/replace the working RAPIDS/CUDA stack solely to satisfy TensorRT-RTX.

### Requirement: PRRC-14 TensorRT-RTX proof order
TensorRT-RTX promotion SHALL require capability, engine/model identity, engine validity, JIT/runtime-cache identity, numerical parity, shape contract, and memory/latency receipts before reduced-precision or CUDA-Graph optimization.

#### Scenario: A TensorRT-RTX engine is evaluated
- **WHEN** an engine is first tested
- **THEN** warmup/JIT is measured separately from steady-state inference
- **AND** FP32/reference parity precedes reduced-precision promotion
- **AND** RTX CUDA Graphs remain an optimization after correctness.

### Requirement: PRRC-15 Numerical executor ladder
GPU/native inference executors SHALL be compared against a prior numerical oracle and SHALL NOT be promoted solely because they are faster.

#### Scenario: TensorRT-RTX is proposed for promotion
- **WHEN** TensorRT-RTX produces output for a frozen input/model revision
- **THEN** output parity is compared against the established PyTorch/ONNX reference
- **AND** the receipt records executor/runtime/device identity, checksums, shape, dtype, latency, peak VRAM, fallback, validation status, authority and writes.

### Requirement: PRRC-16 cuVS exact versus CAGRA approximate
cuVS brute-force search SHALL remain the GPU exact oracle for the same frozen matrix and CAGRA SHALL remain the ANN challenger.

#### Scenario: CAGRA quality is measured
- **WHEN** CAGRA is evaluated
- **THEN** Recall@K/MRR/latency are compared against cuVS brute-force on the same representation revision
- **AND** CAGRA does not create an additional semantic lane vote.

### Requirement: PRRC-17 ContextManifest and PromptPlan identity
Model prefill SHALL be bound to explicit ContextManifest/PromptPlan identity and evidence revisions before synthesis.

#### Scenario: Model prefill begins
- **WHEN** a prompt is sent to the model runtime
- **THEN** `ModelPrefillIdentityV1` binds ContextManifest checksum, model/adapter/prompt-policy/template revisions, evidence revisions, and relevant executor receipts
- **AND** generated prose is not used as deterministic prefill identity.

### Requirement: PRRC-18 Model memory ownership
Attention KV and recurrent/SSM state SHALL remain model-owned ephemeral execution state and SHALL NOT be stored as canonical packet/cache identity.

#### Scenario: Model state exists during decode
- **WHEN** attention KV or recurrent state is allocated
- **THEN** it remains ephemeral model memory
- **AND** ACE/BitFrost/Valkey do not become its canonical owner.

### Requirement: PRRC-19 Offline learning eligibility
QLoRA/SFT/DPO or other downstream learning SHALL consume only revision-qualified, ExecutionReceipt-validated outcomes.

#### Scenario: A training tuple is generated
- **WHEN** an interaction is considered for offline learning
- **THEN** query/source/packet/workspace/model/adapter revisions and verified outcome evidence are retained
- **AND** training/held-out splits are source-revision aware
- **AND** generated model text alone SHALL NOT constitute ground truth.

### Requirement: PRRC-20 Initial mutation freeze
The initial convergence tranche SHALL remain planning/code/read-only proof work.

#### Scenario: A task requests live mutation
- **WHEN** the requested action would apply DDL, backfill packets, mutate Qdrant/Neo4j/Valkey/BitFrost, run unrelated Graphify APPLY, promote a GPU executor/router, write training data/weights, or alter canonical source data
- **THEN** this change SHALL reject the action absent a separate existing owner gate and explicit authorization.
