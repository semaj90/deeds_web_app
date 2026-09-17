# Tasks — Parent Atlas Prefill Routing Residency Convergence

Status discipline: `WRITTEN != WIRED != FIXTURE_PROVEN != LIVE_READBACK_PROVEN != PROMOTED`.

Initial tranche is planning/read-only only. No canonical datastore, vector-store, cache, graph, model, source, or GPU-state mutation is authorized.

## 0. Current blocker ledger

- [x] 0.1 Record workspace authority as admitted/proven from the existing owner.
- [ ] 0.2 Prove execution/source producer authority for the selected Graphify execution.
- [ ] 0.3 Re-run current packet materialization with fresh bounded evidence. The prior 128-row audit timed out; the older 10-row report is stale and MUST NOT be treated as current proof.
- [ ] 0.4 Split packet-materialization failure counts into at least `PACKET_MISSING` and `PACKET_DIGEST_MISSING`.
- [ ] 0.5 Resolve canonical `PacketRevisionOwnerV1`.
- [ ] 0.6 Prove current packet→chunk closure.
- [ ] 0.7 Prove current packet→AST closure.
- [x] 0.8 Preserve RPC registry as downstream/fail-closed consumer only; do not move authority into RPC.

### 0A. Packet-materialization timeout next steps

- [ ] 0A.1 Freeze the proof tuple: admitted workspace revision, selected execution ID, `limit=128`.
- [ ] 0A.2 Run read-only writer/registry census: `node scripts/atlas/audit-packet-registry-writer-ownership-v1.mjs`.
- [ ] 0A.3 Capture `EXPLAIN` without `ANALYZE` for the current workspace→execution→packet join.
- [ ] 0A.4 Drive from the smallest execution/source key relation available and project only identity/revision columns first.
- [ ] 0A.5 Apply the 128-row bound before packet→chunk/AST fanout where the existing semantics permit.
- [ ] 0A.6 Report packet existence separately from packet digest existence.
- [ ] 0A.7 Compare existing indexes to the actual join predicates. **No DDL is authorized.**
- [ ] 0A.8 Emit a fresh bounded 128-row receipt or remain `NOT_PROVEN`.
- [ ] 0A.9 Update `parent-atlas-retrieval-lineage-dag-convergence` blocker ledger with the fresh result; do not reuse the stale 10-row report.

## 1. Existing-owner census

Before creating any implementation, find the current owner or prove absence/incompatibility.

- [ ] 1.1 Inventory `parent-atlas-retrieval-lineage-dag-convergence` owners for workspace/source/execution/packet/chunk/AST lineage.
- [ ] 1.2 Inventory `parent-atlas-query-routing-classifier` and freeze the logical-needs-only learned-routing boundary.
- [ ] 1.3 Inventory `parent-atlas-neural-prefill-encoder` and classify hidden/internal states separately from registered representations.
- [ ] 1.4 Inventory `parent-atlas-candidate-feature-execution-fabric` and its missingness/feature-revision contracts.
- [ ] 1.5 Inventory `parent-atlas-tensor-residency-integration` and reuse its identity/residency invariants.
- [ ] 1.6 Inventory `parent-atlas-ace-bitfrost-cache-correctness` and `parent-atlas-memory-architecture-freeze`.
- [ ] 1.7 Inventory `parent-atlas-semantic-768-canonical-contract` and confirm one logical semantic lane.
- [ ] 1.8 Inventory `parent-atlas-onnx-webgpu-embedding-promotion` provider/parity contracts.
- [ ] 1.9 Inventory existing PacketControlWord, Hilbert, Hamming, Qdrant, cuVS/CAGRA, Graphify, CandidateOrdinal, ContextManifest, PromptPlan, and execution-receipt contracts.
- [ ] 1.10 Emit an owner matrix with `REUSE`, `EXTEND`, `SUPERSEDED`, or `ABSENT` classifications. No duplicate owner may be created while classification is unresolved.

## 2. Contract reconciliation

Do not create these contracts until task group 1 proves whether an existing owner already supplies them.

- [ ] 2.1 Reconcile/define `RoutingFeatureTile4x6V1` as a derived debugging/routing view only.
- [ ] 2.2 Reconcile/define `PrefillRoutingDecisionV1`.
- [ ] 2.3 Reconcile/define `DeterministicExecutorCapabilityPolicyV1`.
- [ ] 2.4 Reconcile/define `GpuExecutorCapabilityV1`.
- [ ] 2.5 Reconcile/define `GpuResidencyBudgetV1`.
- [ ] 2.6 Reconcile/define `GpuExecutionLeaseV1`.
- [ ] 2.7 Reconcile/define `TensorRtRtxCapabilityReceiptV1`.
- [ ] 2.8 Reconcile/define `TensorRtRtxExecutionReceiptV1`.
- [ ] 2.9 Reconcile/define `NativeInferenceReceiptV1`.
- [ ] 2.10 Reconcile/define `PrefillDerivedFeatureReceiptV1`.
- [ ] 2.11 Reconcile/define `PrefillDagExecutionReceiptV1`.
- [ ] 2.12 Reconcile/define `ModelPrefillIdentityV1`.
- [ ] 2.13 Reconcile/define `VerifiedTrainingTupleEligibilityV1`.

## 3. Representation/executor freeze

- [ ] 3.1 Prove `semantic_768` remains the canonical dense semantic representation under its existing owner.
- [ ] 3.2 Prove `hidden_256` is internal neural state, not a registered representation.
- [ ] 3.3 Keep `latent_128` and `latent_64` revisioned, non-authoritative derived challengers.
- [ ] 3.4 Keep Hamming as a candidate prefilter only and Hilbert as locality ordering only.
- [ ] 3.5 Keep KMeans and SOM20x20 distinct algorithms.
- [ ] 3.6 Keep Topology4 as routing/cache/visualization state; manifold/Riemannian claims remain research-only.
- [ ] 3.7 Prove `LANE != EXECUTOR` for Qdrant, cuVS brute force, CAGRA, PyTorch CUDA, LibTorch, ONNX Runtime, DirectML/WebGPU, and TensorRT-RTX.
- [ ] 3.8 Prove no executor produces an additional semantic RRF vote.

## 4. Query routing and missingness

- [ ] 4.1 Freeze `classification_768 → classification_mrl_128` ownership and revisions.
- [ ] 4.2 Freeze the 26 deterministic query features and source revisions.
- [ ] 4.3 Prove `QueryRouterTensorV1[154]` shape/checksum determinism.
- [ ] 4.4 Learned router predicts logical needs only; implementation/product names are forbidden labels.
- [ ] 4.5 Deterministic capability policy maps logical needs to currently eligible executors.
- [ ] 4.6 `RoutingFeatureTile4x6V1`, if adopted, uses frozen 4×6 row/column vocabulary and never replaces the 154-vector or CandidateFeatureMatrix.
- [ ] 4.7 Every routing/candidate feature distinguishes `OBSERVED(0)` from `MISSING`, `UNAVAILABLE`, `STALE`, and `REVISION_MISMATCH`.
- [ ] 4.8 Audit for semantic fallback-zero patterns; no unavailable canonical feature may be silently zero-filled.

## 5. Candidate ordinal / derived-feature DAG

Blocked until task group 0 lineage authority passes.

- [ ] 5.1 Build/reuse a revision-qualified `CandidateOrdinalMapV1` from current admitted packet/chunk identities.
- [ ] 5.2 Freeze `CandidateFeatureMatrix` checksum and missingness mask.
- [ ] 5.3 Reuse existing PCA/SVD, latent, KMeans, SOM20x20, Hamming, Hilbert, and Topology4 implementations rather than creating duplicates.
- [ ] 5.4 Emit `PrefillDerivedFeatureReceiptV1` with parent representation revision/checksum for every transform.
- [ ] 5.5 Compare approximate/challenger paths against an exact frozen oracle before promotion.

## 6. ContextManifest / PromptPlan / model-prefill identity

- [ ] 6.1 Reuse the existing ContextManifest owner; do not create a second manifest type unless incompatibility is proven.
- [ ] 6.2 Reuse the existing PromptPlan owner and bind it to the ContextManifest checksum.
- [ ] 6.3 Define/reconcile `ModelPrefillIdentityV1` over ContextManifest, model, adapter, prompt-policy/template, evidence revisions, and executor receipts.
- [ ] 6.4 Generated prose MUST NOT be treated as deterministic prefill identity.
- [ ] 6.5 Model attention KV and recurrent/SSM state remain ephemeral model-owned state.

## 7. GPU capability and residency budget

- [ ] 7.1 Inventory existing GPU capability/residency owners before adding new contracts.
- [ ] 7.2 Establish one logical VRAM budget owner for the RTX 3060 Ti 8 GB device.
- [ ] 7.3 Require bounded executor lease before promoted GPU residency.
- [ ] 7.4 Benchmark PyTorch CUDA, cuVS/CAGRA, DirectML/WebGPU, TensorRT-RTX, and local LLM runtime residency in isolation before concurrent-residency tests.
- [ ] 7.5 Emit `GPU_RESIDENCY_BUDGET_EXCEEDED` rather than relying on implicit OOM/fallback.
- [ ] 7.6 No executor may independently claim all observed free VRAM.

## 8. TensorRT-RTX isolated capability lane

No install/build/promotion is authorized in this initial tranche.

- [x] 8.1 Pin current official TensorRT-RTX 1.6/CUDA documentation families in `evidence-manifest.md`.
- [ ] 8.2 Record live GPU, driver, CUDA toolkit, OS, compiler and TensorRT-RTX package capability in `TensorRtRtxCapabilityReceiptV1`.
- [ ] 8.3 Require exact supported CUDA package target; current CUDA 13.0 is not assumed compatible with TensorRT-RTX 1.6's documented CUDA 13.4 package.
- [ ] 8.4 Keep TensorRT-RTX environment isolated from the working RAPIDS/CUDA stack.
- [ ] 8.5 Freeze ONNX/model checksum before engine creation.
- [ ] 8.6 Prove portable AOT engine generation and engine validity/compatibility.
- [ ] 8.7 Prove device JIT and runtime-cache identity/checksum.
- [ ] 8.8 Prove static/dynamic input shape contract.
- [ ] 8.9 Prove PyTorch/ONNX reference parity before reduced precision.
- [ ] 8.10 Record cold build/JIT/warmup separately from steady-state latency and peak VRAM.
- [ ] 8.11 Reduced precision requires supported operator/Q-DQ contract plus parity.
- [ ] 8.12 RTX CUDA Graphs are deferred until normal execution parity is proven.
- [ ] 8.13 Future native integration uses Node-API rather than direct V8 ownership.
- [ ] 8.14 Treat Torch-TensorRT-RTX as experimental/challenger only unless current official docs and local parity prove otherwise.

## 9. Numerical executor ladder

- [ ] 9.1 PyTorch CPU FP32 reference receipt.
- [ ] 9.2 PyTorch CUDA/sm_86 parity receipt.
- [ ] 9.3 LibTorch CUDA/Node-API parity receipt.
- [ ] 9.4 ONNX Runtime GPU parity receipt.
- [ ] 9.5 TensorRT-RTX parity receipt.
- [ ] 9.6 cuVS brute-force exact same-matrix oracle receipt.
- [ ] 9.7 CAGRA Recall@K/MRR/latency comparison against cuVS exact; never an extra semantic vote.

## 10. Checkpoint taxonomy

- [ ] 10.1 Document ML activation checkpoint as PyTorch training recompute/memory policy.
- [ ] 10.2 Reuse/define `AtlasPassCheckpointV1` for resumable algorithm/DAG state.
- [ ] 10.3 Define residency checkpoint as RAM/VRAM/BitFrost/Valkey placement metadata only.
- [ ] 10.4 Preserve LLM KV/recurrent state as ephemeral model runtime state.
- [ ] 10.5 Add tests/docs preventing one checkpoint category from being substituted for another.

## 11. Execution receipts and offline learning

- [ ] 11.1 Reconcile executor receipt fields: request/canonical/workspace/source/packet/representation/model/executor revisions, device/runtime identity, checksums, shape/dtype, latency, peak VRAM, fallback, validation, authority, writes.
- [ ] 11.2 Emit `PrefillDagExecutionReceiptV1` only after current lineage and ContextManifest/PromptPlan proof.
- [ ] 11.3 Define/reuse `VerifiedTrainingTupleEligibilityV1`.
- [ ] 11.4 QLoRA/SFT/DPO consume ExecutionReceipt-validated outcomes only.
- [ ] 11.5 Preserve query/source/packet/workspace/model/adapter revisions in training tuples.
- [ ] 11.6 Split held-out/training data by source revision.
- [ ] 11.7 Never derive ground truth solely from generated model text.
- [ ] 11.8 No online weight updates in this change.

## 12. Mutation/promotion gates — CLOSED

The following are explicitly **not authorized** until their owning prerequisites and operator gates are separately satisfied:

- [ ] 12.1 PostgreSQL DDL/migration/apply.
- [ ] 12.2 Packet or packet-digest writes/backfills.
- [ ] 12.3 Historical packet/chunk/AST identity rewrite.
- [ ] 12.4 Qdrant canonical collection creation/mutation.
- [ ] 12.5 Neo4j canonical graph mutation.
- [ ] 12.6 ACE/BitFrost/Valkey canonical cache warming/mutation.
- [ ] 12.7 Graphify APPLY or unrelated refresh.
- [ ] 12.8 GPU executor promotion/residency promotion.
- [ ] 12.9 WebGPU/DirectML/TensorRT-RTX/cuVS/CAGRA promotion.
- [ ] 12.10 Learned-router production promotion.
- [ ] 12.11 QLoRA/SFT/DPO dataset or weight writes.

Unchecked boxes in this section are deliberately CLOSED gates, not pending instructions to mutate.

## 13. Validation

- [ ] 13.1 Validate proposal/design/spec/tasks ownership references against current repository state.
- [ ] 13.2 Run focused contract/unit tests for any code-only additions.
- [ ] 13.3 Run read-only lineage/packet proofs only with explicit bounded scope.
- [ ] 13.4 Run `npx openspec validate parent-atlas-prefill-routing-residency-convergence --type change --strict --json`.
- [ ] 13.5 Run scoped diff check.
- [ ] 13.6 Record final state using only `CREATED`, `WIRED`, `FIXTURE_PROVEN`, `DRY_RUN_PROVEN`, `LIVE_READBACK_PROVEN`, `PROMOTED`, `BLOCKED`, or `NOT_PROVEN`.

## Resume point

Immediate P0 is **not GPU work**. Resume with:

```text
execution/source producer authority
→ packet registry/writer ownership
→ optimized bounded current packet materialization
→ PacketRevisionOwnerV1
→ packet→chunk / packet→AST closure
```

Safe next command from the current blocker report:

```bash
node scripts/atlas/audit-packet-registry-writer-ownership-v1.mjs
```

Then optimize the read-only 128-row packet join before considering any index or timeout change.
