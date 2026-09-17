# Design — Parent Atlas Prefill Routing Residency Convergence

## Status and blocker chain

Planning/read-only only. No live datastore, projection, cache, graph, model, or GPU-state mutation is authorized.

Current dependency chain:

1. Workspace authority — admitted/proven.
2. Execution/source producer authority — unresolved.
3. Current packet materialization — unresolved. The bounded workspace=`sha256:e24bb971…`, execution=`74d50c86-8194-45ea-8c3d-61aab737ef83`, limit=128 audit timed out. The older 10-row report is stale evidence. Missing packets and missing packet digests must be measured separately.
4. `PacketRevisionOwnerV1` — unresolved.
5. Packet→chunk and packet→AST current closure — unresolved.
6. RPC registry — complete downstream consumer, correctly fail-closed.

A query timeout is `NOT_PROVEN`, not an empty result and not authorization for DDL, larger mutation scope, or fabricated lineage.

## Existing-owner matrix

This change coordinates rather than replaces:

- lineage: `parent-atlas-retrieval-lineage-dag-convergence`;
- logical-needs routing: `parent-atlas-query-routing-classifier`;
- neural prefill: `parent-atlas-neural-prefill-encoder`;
- candidate features: `parent-atlas-candidate-feature-execution-fabric`;
- tensor/VRAM residency: `parent-atlas-tensor-residency-integration`;
- ACE/BitFrost: `parent-atlas-ace-bitfrost-cache-correctness`;
- memory taxonomy: `parent-atlas-memory-architecture-freeze`;
- dense semantic oracle: `parent-atlas-semantic-768-canonical-contract`;
- ONNX/WebGPU challenger: `parent-atlas-onnx-webgpu-embedding-promotion`;
- existing PacketControlWord, Hilbert, Hamming, Qdrant, cuVS, CAGRA, Graphify, CandidateOrdinal, ContextManifest, PromptPlan and execution-receipt owners.

PostgreSQL/packet lineage owns canonical identity. Qdrant is a projection. ACE/BitFrost/Valkey are control-memory/cache layers. Model KV/recurrent state is ephemeral model memory. `LANE != EXECUTOR`.

## Frozen logical flow

```text
UserQuery
→ EmbeddingGemma classification_768
→ classification_mrl_128 + 26 deterministic query features
→ QueryRouterTensorV1[154]
→ PyTorch/XGBoost SHADOW logical-needs classifier
→ DeterministicExecutorCapabilityPolicyV1
→ lexical / semantic / AST / graph lanes
→ CandidateOrdinalMapV1
→ CandidateFeatureMatrix
→ optional PCA/SVD, latent_128/64, KMeans, SOM20x20, Topology4, Hamming, Hilbert
→ bounded exact promotion/rerank
→ ContextManifestV1
→ PromptPlanV1
→ ACE packet
→ BitFrost / Valkey residency metadata
→ model-native prefill
→ Ornith attention-KV + recurrent state
→ decode
→ ExecutionReceipt
→ VerifiedTrainingTupleEligibilityV1
```

This is a target DAG, not a claim that every edge is currently wired.

## Representation versus executor

- `semantic_768`: canonical dense semantic representation once qualified by its existing owner; one logical semantic vote.
- `classification_768` / `classification_mrl_128`: routing representations only.
- `hidden_256`: internal neural state, not a registered representation.
- `latent_128` / `latent_64`, PCA/SVD, KMeans, SOM20x20, Topology4: derived challengers/features.
- Hamming: candidate prefilter only.
- Hilbert: physical/locality ordering key only.
- PyTorch CPU: numerical reference executor.
- PyTorch CUDA, LibTorch/Node-API, ONNX Runtime, DirectML/WebGPU, TensorRT-RTX: executors requiring independent receipts.
- cuVS brute force: GPU exact oracle for a frozen matrix; CAGRA: ANN challenger.

Executors never mint packet identity, representation identity, or extra RRF votes.

## Routing feature tile and missingness

If `RoutingFeatureTile4x6V1` is needed, it is a derived debug/routing view and MUST NOT replace `QueryRouterTensorV1[154]` or `CandidateFeatureMatrix`.

Rows: `QUERY`, `TOKEN_OR_SPAN`, `CANDIDATE_OR_PACKET`, `EXECUTION_OR_CACHE`.
Columns: `LEXICAL`, `SEMANTIC`, `AST`, `GRAPH`, `DOMAIN`, `RUNTIME`.

Every cell carries feature revision plus explicit state. `OBSERVED(value=0)` is distinct from `MISSING`, `UNAVAILABLE`, `STALE`, and `REVISION_MISMATCH`.

## Topology/locality

```text
CandidateFeatureMatrix
→ optional PCA/SVD
→ latent space
   ├─ KMeans centroid + distance
   ├─ SOM20x20 cell
   ├─ Hamming signature
   ├─ Hilbert locality key
   └─ Topology4
```

Reuse existing Hamming/Hilbert implementations. KMeans and SOM remain distinct. Topology4 is routing/cache/visualization state; do not call it a Riemannian manifold until a decoder-induced metric or equivalent bounded JVP/VJP proof exists.

## Checkpoint taxonomy

- ML activation checkpoint: PyTorch training recompute/memory policy.
- `AtlasPassCheckpointV1`: resumable PCA/SVD/KMeans/SOM/Graphify/DAG algorithm state.
- Residency checkpoint: RAM/VRAM/BitFrost/Valkey placement metadata.
- LLM KV/recurrent state: ephemeral model execution state.

These are never interchangeable.

## GPU residency

One logical budget/lease owner must govern the RTX 3060 Ti 8 GB device across PyTorch CUDA, cuVS/CAGRA, TensorRT-RTX, DirectML/WebGPU and the local LLM runtime. Reconcile/reuse `GpuExecutorCapabilityV1`, `GpuResidencyBudgetV1`, and `GpuExecutionLeaseV1` if they already exist.

Benchmark isolated executor residency before concurrent experiments. Deny admission with `GPU_RESIDENCY_BUDGET_EXCEEDED` rather than relying on implicit OOM/fallback.

## TensorRT-RTX isolated lane

TensorRT-RTX 1.6 supports RTX 3000/Ampere compute capability 8.6, but official 1.6 packages are for CUDA 12.9 Update 1 or CUDA 13.4. Therefore the workstation CUDA 13.0 environment is not assumed compatible. Do not upgrade/replace the working RAPIDS/CUDA stack for this experiment.

Proof order:

```text
TensorRtRtxCapabilityReceiptV1
→ ONNX/model checksum freeze
→ portable AOT engine
→ engine validity/compatibility
→ device JIT
→ runtime-cache identity
→ FP32/reference parity
→ warmup measurement
→ steady-state latency + peak VRAM
→ optional reduced precision
→ optional RTX CUDA Graphs
```

Rules: prove static/dynamic shape contracts; bind engine/model/cache checksums; treat Q/DQ/operator support as a requirement for quantization; record warmup separately; use Node-API instead of direct V8 ownership for a future native boundary; treat Torch-TensorRT-RTX as experimental.

## Executor proof ladder

```text
PyTorch CPU FP32
→ PyTorch CUDA / sm_86 parity
→ LibTorch CUDA / Node-API parity
→ ONNX Runtime GPU parity
→ TensorRT-RTX parity
```

No executor skips the previous numerical oracle solely for speed.

## Learned routing

`QueryRouterTensorV1[154] → learned logical-needs predictions → deterministic constraints/capability policy → RetrievalPlanV1`.

The learned model predicts logical needs, never implementation names such as qdrant/cagra/cuvs/tensorrt/directml.

## Receipt identity

`ModelPrefillIdentityV1` should bind ContextManifest checksum, model/adapter revision, prompt-policy/template revision, evidence revisions, and relevant executor receipts. Generated prose is not prefill identity.

Executor receipts include when applicable: schema, request_id, canonical_id/packet_key, workspace/source/packet/representation/model/executor revisions, device, compute capability, driver/runtime revisions, input/output checksum, shape, dtype, latency, peak VRAM, fallback, validation status, canonical authority, and writes performed.

Missing required lineage fails closed; never synthesize `unknown`, timestamps, or inferred-current revisions.

## Contracts requiring owner census before creation

`RoutingFeatureTile4x6V1`, `PrefillRoutingDecisionV1`, `DeterministicExecutorCapabilityPolicyV1`, `GpuExecutorCapabilityV1`, `GpuResidencyBudgetV1`, `GpuExecutionLeaseV1`, `TensorRtRtxCapabilityReceiptV1`, `TensorRtRtxExecutionReceiptV1`, `NativeInferenceReceiptV1`, `PrefillDerivedFeatureReceiptV1`, `PrefillDagExecutionReceiptV1`, `ModelPrefillIdentityV1`, `VerifiedTrainingTupleEligibilityV1`.

## Packet-materialization timeout plan

1. Freeze explicit workspace revision, execution ID, limit=128.
2. Drive from the smallest current execution/source key set.
3. Measure packet existence separately from packet-digest completeness.
4. Capture `EXPLAIN` without `ANALYZE` first.
5. Project only identity/revision columns before wide joins.
6. Apply the 128 bound before packet→chunk/AST fanout where semantics permit.
7. Compare existing indexes to actual join predicates; no DDL is authorized.
8. Emit a fresh bounded receipt or remain `NOT_PROVEN`.

Never reuse the stale 10-row report as 128-row proof.

## Failure modes

`EXECUTION_SOURCE_AUTHORITY_UNRESOLVED`, `CURRENT_PACKET_MATERIALIZATION_UNPROVEN`, `PACKET_MISSING`, `PACKET_DIGEST_MISSING`, `PACKET_REVISION_OWNER_UNRESOLVED`, `PACKET_CHUNK_CLOSURE_UNPROVEN`, `PACKET_AST_CLOSURE_UNPROVEN`, `REPRESENTATION_REVISION_MISMATCH`, `FEATURE_MISSINGNESS_UNQUALIFIED`, `EXECUTOR_CAPABILITY_UNPROVEN`, `EXECUTOR_PARITY_FAILED`, `GPU_RESIDENCY_BUDGET_EXCEEDED`, `TENSORRT_RTX_CUDA_PACKAGE_MISMATCH`, `TENSORRT_RTX_ENGINE_INVALID`, `TENSORRT_RTX_RUNTIME_CACHE_MISMATCH`, `CONTEXT_MANIFEST_UNQUALIFIED`, `TRAINING_OUTCOME_UNVERIFIED`.

## Dependency DAG / rollback

```text
workspace authority (PROVEN)
→ execution/source producer authority
→ current packet materialization
→ PacketRevisionOwnerV1
→ packet→chunk + packet→AST closure
→ CandidateOrdinalMapV1
→ semantic_768 / candidate features / derived transforms
→ ContextManifestV1 + PromptPlanV1
→ executor capability + GPU residency lease
→ model prefill/decode
→ ExecutionReceipt
→ VerifiedTrainingTupleEligibilityV1
```

The RTX lane may run isolated capability/protocol proofs in parallel but cannot be promoted until lineage and parity gates pass.

Initial rollback is file reversion only because no live mutation is authorized. Later executor experiments must be disable-able without rewriting packet, source, semantic, graph, or cache identity.

Deferred: live TensorRT-RTX installation/engine build, CUDA/RAPIDS upgrades, production native addon, CUDA Graph capture, reduced-precision promotion, concurrent multi-executor residency, manifold claims, online router promotion, online QLoRA/SFT/DPO, canonical backfills/writes, and production Qdrant/Neo4j/Valkey mutations.
