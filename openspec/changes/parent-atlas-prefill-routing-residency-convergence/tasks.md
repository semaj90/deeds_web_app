# Tasks: parent-atlas-prefill-routing-residency-convergence

## Status

Planning/convergence change. No canonical writes are authorized until upstream lineage prerequisites are independently proven.

## 0 — Upstream authority and owner inventory

- [x] CONV-00A Confirm `parent-atlas-rpc-packet-registry-fabric` remains complete/downstream and is not reopened. Evidence: OpenSpec status reports the change complete; RPC remains fail-closed on upstream lineage.
- [x] CONV-00B Read lineage receipts and record `PacketRevisionOwnerV1` status. Evidence: `docs/reports/atlas-rpc-packet-registry-schema-v1.json` reports `BLOCKED_CANONICAL_REVISION_OWNER`; `docs/reports/packet-write-revision-contract-v1.json` reports `source_revision` exists but is non-null on `0/61,718` packets and packet-key semantics remain `UNPROVEN`; `docs/reports/packet-writer-lineage-v1.json` finds only `1/5` revision-bound writers; `docs/reports/atlas-rpc-packet-registry-migration-plan-v1.json` remains `PLAN_ONLY_NOT_APPLIED`.
- [x] CONV-00C Record the admitted workspace revision and selected/current execution owner from authoritative receipts. Evidence: admitted workspace revision `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`; execution `74d50c86-8194-45ea-8c3d-61aab737ef83` is flagged canonical among equivalent candidates, but the explicit owner receipt remains `OWNER_SELECTION_VALIDATED_NOT_APPLIED` and `safeToApply: false`.
- [x] CONV-00D Require current workspace→packet→chunk qualification before canonical packet-derived feature consumption. Evidence: convergence design and RPC schema audit preserve the historical bridge as non-current until qualification.
- [x] CONV-00E Require revision-qualified packet→AST/span ownership before AST features become authoritative. Evidence: RPC schema audit reports no packet→AST closure; source hydration reports zero authoritative namespaces/span owners.
- [x] CONV-00F Build the owner matrix for routing, prefill, candidate features, residency, ACE, BitFrost, Valkey, Qdrant, cuVS, graph, and decoder state. Evidence: owner matrix recorded in `design.md`.
- [x] CONV-00G Reject duplicate runtime owners with `DUPLICATE_CAPABILITY_OWNER`. Evidence: packet writer ownership audit finds four candidates and no single canonical runtime writer; promotion remains blocked.

## 1 — RTX/API documentation and local capability freeze

- [x] RTX-DOC-01 Pin official TensorRT-RTX version documentation. Evidence: `evidence-manifest.json` and the official prerequisites, support matrix, release notes, and quick-start documentation.
- [x] RTX-DOC-02 Record Windows/GPU/CUDA support requirements. Evidence: TensorRT-RTX supports Ampere SM 8.6; current packages target CUDA 12.9 Update 1 or 13.4, so local CUDA variants remain compatibility-unresolved.
- [x] RTX-DOC-03 Record AOT/JIT/runtime-cache architecture. Evidence: official TensorRT-RTX architecture and quick-start flow separate portable AOT engine build, device JIT, and runtime-cache reuse.
- [x] RTX-DOC-04 Record Native Runtime C++ object lifetime and thread-safety requirements. Evidence: official Native Runtime API is pinned for the later embedding boundary; no native integration is claimed here.
- [x] RTX-DOC-05 Record dynamic-shape and optimization-profile requirements. Evidence: official dynamic-shape documentation is pinned; variable shapes require explicit bounded profile proof before execution claims.
- [x] RTX-DOC-06 Record FP16/BF16/INT8/INT4 operator and quantization support. Evidence: official quantized-types and support-matrix documentation is pinned; precision claims remain operator/Q-DQ-specific.
- [x] RTX-DOC-07 Record CUDA Graph support as optional optimization. Evidence: official CUDA Graph documentation is pinned; graph capture is deferred until ordinary execution parity is proven.
- [x] RTX-DOC-08 Pin CUDA Runtime API documentation for streams, events, graphs, async allocation, and memory pools. Evidence: official CUDA Programming Guide is pinned for runtime and synchronization semantics.
- [x] RTX-DOC-09 Pin PyTorch C++/LibTorch, ATen CUDA, activation-checkpoint, and custom-operator documentation. Evidence: official PyTorch C++/ATen, checkpointing, and custom-operator documentation is verified in `evidence-manifest.json`.
- [x] RTX-DOC-10 Pin Node-API/node-addon-api ABI requirements. Evidence: official Node-API documentation states ABI stability and independence from V8; `node-addon-api` remains the future C++ binding.
- [x] RTX-DOC-11 Pin cuVS brute-force/CAGRA API documentation. Evidence: official cuVS documentation is verified; brute force remains exact reference and CAGRA remains an ANN challenger.
- [x] RTX-DOC-12 Pin ORT DirectML/WebGPU provider documentation. Evidence: official ONNX Runtime provider, DirectML, and WebGPU documentation is verified; providers remain independent executor receipts.
- [x] RTX-CAP-01 Emit a read-only `TensorRtRtxCapabilityReceiptV1`. Evidence: `docs/reports/tensorrt-rtx-capability-v1.json`; the receipt records TensorRT-RTX as not installed/proven and does not build an engine.
- [x] RTX-CAP-02 Fail closed on incompatible TensorRT-RTX/CUDA/driver versions. Evidence: `docs/reports/tensorrt-rtx-capability-v1.json`; compatibility remains `UNRESOLVED` because observed TensorRT is not evidence of TensorRT-RTX support-matrix compatibility.
- [x] RTX-CAP-03 Do not mutate the active RAPIDS/CUDA toolchain. Evidence: `docs/reports/gpu-executor-capability-v1.json`; `mutationPolicy.cudaRapidsUpgrade=false` and `engineBuild=false`.

Capability inventory evidence (read-only, 2026-09-17): `scripts/atlas/audit-gpu-executor-capability-v1.mjs` composes existing WSL2/RAPIDS, residency, Windows CUDA, ONNX/WebGPU, and TensorRT metadata into `GpuExecutorCapabilityV1`. WSL2/RAPIDS execution is proven as a projection executor; candidate-feature residency reuse is bounded/proven; WebGPU parity is observed but unadmitted; DirectML has metadata only; TensorRT-RTX is not installed/proven. The pure shared budget decision owner is now proven, while cross-executor runtime registration/enforcement remains open; the active CUDA/RAPIDS stack is unchanged.

2026-09-18 refresh: `node scripts/atlas/audit-gpu-executor-capability-v1.mjs` emitted
`docs/reports/gpu-executor-capability-v1.json` with `writesPerformed=false` and
`canonicalAuthority=false`. The WSL2 PyTorch/cuVS/cuGraph capability remains
proven, while Windows PyTorch parity, DirectML, and TensorRT-RTX remain open.
The isolated cuTile proof is recorded separately in
`docs/reports/atlas-cuda132-cutile-simt-gemm-probe-v2-live.json`; it does not
upgrade the TensorRT-RTX or Atlas ranker parity gates.

## 2 — Query routing contract convergence

- [x] ROUTE-01 Reuse the current V2 control-plane tensor through a pure
  manifest-defined projection to `QueryRouterTensorV1[154]`: 128
  `classification_mrl_128` values plus 26 `query_shape_v1` values. Evidence:
  `docs/reports/compact-query-router-tensor-projection-v1.json` reports
  `ROUTER_TENSOR_PROJECTION_PARITY_PROVEN`; the 234-wide V2 owner and legacy
  V1 consumers remain unchanged. The projection is noncanonical and performs
  no writes.
- [x] ROUTE-02 Prove the `classification_mrl_128` checksum and L2 normalization. Evidence: `docs/reports/query-router-154-live-embedding-v1.json` records a real `embeddinggemma:latest` 768-dimensional Ollama inference, deterministic MRL-128 checksum `2fdb95b3abc2fd948220fa31e72e5c7239384e69c5de52ca57548a55679d45c5`, L2 normalization, deterministic-26 composition, and the resulting 154-wide tensor checksum. The proof uses direct Ollama HTTP to avoid the Go wrapper's Valkey cache write path; it remains noncanonical and non-promotional.
- [x] ROUTE-03 Freeze query feature ordering and missingness behavior. Evidence:
  `docs/reports/query-router-feature-missingness-v1.json` proves the existing
  26-feature order is the V2 manifest order, measured absence is a finite zero,
  and missing feature fields are rejected rather than converted to `NaN`.
- [ ] ROUTE-04 Train/evaluate PyTorch MLP only on revision-qualified non-toy data.
- [ ] ROUTE-05 Compare PyTorch MLP and XGBoost on the identical frozen split/tensor.

Router evidence (read-only, 2026-09-17): `sveltekit-frontend/scripts/atlas/prove-query-router-154-fixture.mts` and `docs/reports/query-router-154-fixture-v1.json` prove fixture plumbing only: 128-value classification-MRL-shaped input plus the existing 26-value deterministic projection yields width 154, finite values, and L2-normalized fixture input. A real EmbeddingGemma execution/checksum is not proven by that older fixture. The repository also contains `retrieval-router-tensor-manifest-v2.ts` at width 234; ROUTE-01 is now resolved by the explicit projection receipt below, with no second live tensor owner introduced.

Router projection evidence (read-only, 2026-09-18):
`project-compact-query-router-tensor-v1.ts` extracts the manifest-owned V2
sections at offsets `0..128` and `160..186` into a deterministic 154-wide
view. Tests and the proof receipt establish exact section parity, stable
checksums when ontology/operation/runtime/graph sections change, checksum
sensitivity to owned sections, and fail-closed revision/width/nonfinite/
checksum validation. `canonicalAuthority=false` and `writesPerformed=false`.

Revision-qualified exporter hardening (read-only, 2026-09-18):
`assertUniformQueryRouterDatasetRevisionsV1()` now runs before the V2 dataset
builder emits a training artifact. It preserves query/label revision sets for
diagnostics but rejects mixed dataset, tensor, split, embedding-model,
embedding-prompt, or representation revisions. The focused V2 integration
suite passes `5/5`; this remains an exporter guard only and does not authorize
MLP training or canonical writes.

Router readiness refresh (read-only, 2026-09-18):
`audit-query-router-v2-readiness.mts` reports
`READY_FOR_FROZEN_CORPUS_EVAL` with contracts, Python dependencies, and all
trainer/comparator entrypoints available. It explicitly records
`trainingExecuted=false`, `canonicalWritesAllowed=false`, and the next
requirement `REVISION_QUALIFIED_LABELED_QUERY_CORPUS`. ROUTE-04 therefore
remains open; runtime readiness is not training or promotion evidence.

Receipt: `docs/reports/query-router-v2-readiness-audit.json`.

Real-corpus materialization gate (read-only, 2026-09-18): the existing
`materialize-query-router-source-v2.mts` correctly requires a labeled input
corpus, a live 768-dimensional embedding response, and explicit revision
metadata. The expected `query-router-labels-v2.jsonl` and source artifact are
not present in the current worktree, so no materialization was attempted.
Synthetic plumbing remains diagnostic only and cannot satisfy ROUTE-04.

Repository-wide corpus census (read-only, 2026-09-18): no
`query-router-labels-v2.jsonl`, query-router source JSONL, or equivalent
revision-qualified router training corpus was found outside the expected
frontend data path. Existing `data/atlas-ml` artifacts are unrelated semantic
or packet-linkage artifacts and are not admissible substitutes.

Capability-policy evidence (read-only, 2026-09-17): `sveltekit-frontend/scripts/atlas/prove-deterministic-capability-policy-v1.mts` and `docs/reports/deterministic-capability-policy-v1.json` prove the existing deterministic policy maps logical retrieval needs to only `PROVEN_AVAILABLE` executors, preserves one vote per logical lane, and keeps canonical writes/evidence authority false. The classification input is fixture-only and the plan does not promote configured-but-unproven Qdrant/cuVS executors.

Routing-tile evidence (read-only, 2026-09-17): `sveltekit-frontend/scripts/atlas/prove-routing-feature-tile-v1.mts` and `docs/reports/routing-feature-tile-4x6-v1.json` provide the requested derived QUERY/TOKEN_OR_SPAN/CANDIDATE_OR_PACKET/EXECUTION_OR_CACHE × LEXICAL/SEMANTIC/AST/GRAPH/DOMAIN/RUNTIME shape. Each cell carries a feature revision and explicit missingness; unavailable canonical packet/span/executor data is `null`, never silently zero-filled. This does not replace the primary router tensor or establish canonical authority.

Prefill-DAG evidence (read-only, 2026-09-17): `sveltekit-frontend/scripts/atlas/prove-prefill-dag-fixture-v1.mts` and `docs/reports/prefill-dag-fixture-v1.json` compose the existing ContextManifestV2 and PromptPlanV1 owners over a bounded fixture. Two independent replays produce identical manifest and prompt checksums with contiguous segment ordering. Live retrieval, model prefill, canonical authority, and writes remain false.

Executable-DAG guard: `assertAtlasExecutionPipelineIdentityReadyV1` now separates planning DAGs (nullable checksums allowed while blocked) from executable DAGs (every output and dependent input checksum required and exactly chained). This is a narrow guard over the existing pipeline owner; it does not create a second DAG identity or authorize writes.

Residency-policy evidence (read-only, 2026-09-18): `sveltekit-frontend/scripts/atlas/prove-gpu-residency-budget-v1.mts` and `docs/reports/gpu-residency-budget-v1.json` exercise the existing `GpuResidencyBudgetV1` owner across admission, down-bucketing, lease-floor fallback, missing-telemetry fallback, and active-reservation overflow. The pure shared decision boundary is proven; cross-executor lease accounting remains explicitly `NOT_YET_WIRED`; MEM-04 and MEM-05 remain open.

Documentation evidence (read-only, 2026-09-17): `evidence-manifest.json` pins the official TensorRT-RTX, CUDA, PyTorch, Node-API, cuVS/CAGRA, and ONNX Runtime provider families. The verified TensorRT-RTX prerequisite/support pages require CUDA 12.9 Update 1 or CUDA 13.4 for packages; the local CUDA variants therefore remain compatibility-unresolved. No SDK installation or active CUDA/RAPIDS upgrade is authorized.
- [x] ROUTE-06 Emit domain, operation, retrieval-needs, and bounded-budget predictions separately. Evidence: `QueryClassificationV2Schema` keeps `domain`, `operation`, `retrievalNeed`, and bounded `expectedDepth` fields separate; `query-classification-v2.spec.ts` proves the contract compiles a bounded multi-lane plan without merging prediction families. This is contract/fixture evidence only; ROUTE-04/05 training remains blocked by the missing revision-qualified corpus.
- [x] ROUTE-07 Keep learned predictions `evidenceAuthority=false`. Evidence: `QueryClassificationV2Schema` now requires/defaults `evidenceAuthority=false`, while `RetrievalPlanV1` preserves `canonicalWritesAllowed=false` and `retrievalVoteAdded=false`; focused classification tests prove the invariant. No learned output becomes source authority or an additional retrieval vote.
- [x] ROUTE-08 Enforce deterministic capability policy after learned inference. Evidence: `sveltekit-frontend/scripts/atlas/prove-deterministic-capability-policy-v1.mts` emits `DETERMINISTIC_POLICY_PLUMBING_PROVEN`; `retrieval-executor-policy-v2.ts` admits only `PROVEN_AVAILABLE` capabilities after classification and keeps `canonicalWritesAllowed=false`, `evidenceAuthority=false`, and one vote per logical lane. Focused query-router integration tests pass. This is fixture/contract evidence only; live capability receipts remain required.
- [x] ROUTE-09 Reject infrastructure-product prediction as routing authority. Evidence: the deterministic policy receipt records `logicalNeedsOnly=true`, `implementationNamesPredictedByClassifier=false`, excludes unproven Qdrant/cuVS executors, and retains `canonicalAuthority=false`/`writesPerformed=false`; focused query-router integration tests prove configured-but-unproven executors are not selected. This does not promote any executor or learned model.

## 3 — Derived 4×6 routing tile

- [x] TILE-01 Define `RoutingFeatureTile4x6V1`. Evidence: `docs/reports/routing-feature-tile-4x6-v1.json` records `DERIVED_TILE_PLUMBING_PROVEN` with `FIXTURE_ONLY` evidence.
- [x] TILE-02 Freeze rows QUERY, TOKEN_OR_SPAN, CANDIDATE_OR_PACKET, EXECUTION_OR_CACHE. Evidence: the receipt contains exactly these four rows.
- [x] TILE-03 Freeze columns LEXICAL, SEMANTIC, AST, GRAPH, DOMAIN, RUNTIME. Evidence: the receipt contains exactly these six columns.
- [x] TILE-04 Bind every populated cell to `featureRevision` and source evidence. Evidence: every cell carries a feature revision; unavailable cells identify the unavailable authority.
- [x] TILE-05 Represent missing values explicitly; prohibit silent zero-fill. Evidence: `noSilentZeroFill=true`; unavailable fixture values are `null` with explicit missingness.
- [x] TILE-06 Prove deterministic 24-value serialization/checksum. Evidence: the receipt includes a SHA-256 `tileChecksum` over the ordered rows, columns, and tile cells.
- [x] TILE-07 Mark the tile derived/noncanonical and never replace QueryRouterTensor/CandidateFeatureMatrix. Evidence: `canonicalAuthority=false`, `canonicalWritesAllowed=false`, `writesPerformed=false`, and `replacesPrimaryRouterTensor=false`.

## 4 — Candidate feature and transform convergence

- [x] FEAT-01 Reuse the existing `CandidateOrdinalMapV1` owner. Evidence: `sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts` is the sole `CandidateOrdinalMapV1` schema/checksum/materializer/integrity owner; `prove-prefill-dag-fixture-v1.mts` imports `materializeCandidateOrdinalMap` directly and no second ordinal owner is introduced.
- [x] FEAT-02 Reuse the existing CandidateFeatureMatrix owner/schema. Evidence: `sveltekit-frontend/src/lib/server/atlas/ranking/packet-feature-matrix.ts` is the existing `PacketFeatureMatrix` owner with stable feature ordering, row-major materialization, sanitization, and row access; `packet-feature-matrix.test.ts` proves deterministic rows and matrix shape. No second CandidateFeatureMatrix owner was introduced.
- [x] FEAT-03 Preserve `semantic_768` as the dense exact oracle. Evidence: `sveltekit-frontend/src/lib/server/embedding/embedding-contract-768.ts` is the single 768-dimensional EmbeddingGemma contract, rejects other semantic lanes, and keeps MRL prefixes derived/noncanonical; `atlas-rapids-semantic768-client.ts` is the cuVS brute-force exact lane and validates 768 dimensions/L2 normalization before execution. The embedding contract and cuVS client tests preserve this boundary; current-corpus promotion remains separately blocked by lineage.
- [x] FEAT-04 Keep `hidden_256` internal to neural execution. Evidence: `sveltekit-frontend/src/lib/server/atlas/prefill/hidden-neural-state-v1.ts` defines a checksum-only ephemeral receipt with `registeredRepresentation=false`, `durableArtifact=false`, `canonicalAuthority=false`, and `writesPerformed=false`; focused tests reject registration/persistence attempts. The contract carries no hidden tensor or KV payload and does not create a representation owner.
- [x] FEAT-05 Require independent artifact/revision receipts for `latent_128` and `latent_64`. Evidence: `sveltekit-frontend/scripts/atlas/prove-latent-representation-receipts-v1.mts` validates separate `RepresentationArtifactV1` receipts through the existing representation owner and proves shared model/parameter/transform revision binding. The receipt records `VIRTUAL_DERIVED_VIEW` for `latent_128`, `PERSISTED_DERIVED_VIEW` for `latent_64`, `canonicalAuthority=false`, `writesPerformed=false`, and `promotionAuthorized=false`; current-lineage readback remains required.
- [x] FEAT-06 Add/reconcile PCA projection receipt. Evidence: `sveltekit-frontend/scripts/atlas/prove-prefill-reduction-receipts-v1.mts` uses the existing `PrefillDerivedFeatureReceiptV1` owner to emit a revision/checksum-bound PCA receipt with explicit dimensions, `canonicalAuthority=false`, and `writesPerformed=false`. Fixture proof only; no live projection is promoted.
- [x] FEAT-07 Add/reconcile truncated-SVD projection receipt. Evidence: the same proof emits an independent SVD receipt through `PrefillDerivedFeatureReceiptV1`, binds it to the same input representation revision, and keeps it noncanonical/nonwriting. Actual recall and current-corpus execution remain a separate FEAT-08 gate.
- [x] FEAT-08 Benchmark recall/overlap after each reduction challenger. Evidence: `python/pca_svd_representation_baseline_v1.py --limit 20 --k 5 --seed 42` completed read-only and emitted `docs/vector-governance/pca-svd-representation-comparison-v1.json`, comparing PCA/SVD, MRL, and latent challengers with deterministic neighborhood overlap/correlation metrics. This is a bounded diagnostic benchmark; it does not prove current-corpus lineage, candidate freeze, or promotion.

## 5 — Locality and topology

- [x] TOPO-01 Reuse the existing Hilbert implementation; no second encoder. Evidence: `sveltekit-frontend/src/lib/server/atlas/locality-key-v1.ts` delegates `computeAtlasHilbertKeyV1` directly to `hilbertIndexND`; `locality-key-v1.spec.ts` proves exact equality with the existing implementation.
- [x] TOPO-02 Reuse the existing Hamming implementation; no second popcount owner. Evidence: `locality-key-v1.ts` delegates distance/similarity to `hammingDistance1Bit`/`hammingSimilarity1Bit`; focused tests prove exact delegation and byte round-trip behavior.
- [x] TOPO-03 Freeze Hilbert as locality/physical ordering only. Evidence: the locality-key contract documents Hilbert as a physical storage/batch locality key and the runtime algorithm manifest rejects Hilbert semantic-geometry claims. No identity or semantic vote is produced.
- [x] TOPO-04 Freeze Hamming as cheap candidate prefilter only. Evidence: `hammingPrefilterCandidatesV1` performs only a radius cut, preserves input order, and the focused test proves it does not rerank candidates; the contract requires later dense/graph/lexical retrieval.
- [x] TOPO-05 Ensure neither contributes an RRF vote. Evidence: the locality-key contract explicitly prohibits Hamming fusion as an independent RRF lane, while Hilbert is only an ordering key; existing SearchRuntime lane policy keeps logical vote ownership separate. No RRF caller or retrieval lane was changed.
- [x] TOPO-06 Keep KMeans 64/128/256 families separate from SOM. Evidence: `SemanticCentroidRoutingManifest` constrains KMeans routing to `k=64|128|256`, while the separate runtime policy requires SOM dimensions `20×20`; these are distinct manifests and algorithms.
- [x] TOPO-07 Keep SOM20x20 as an independent 400-cell topology/cache experiment. Evidence: `runtime-policy-manifest.ts` rejects any SOM shape other than `20×20`; SOM state remains a derived routing/cache output and is not a candidate identity.
- [x] TOPO-08 Keep `Topology4` as routing/cache/visualization coordinate. Evidence: existing topology-coordinate and feature-row contracts mark topology/manifold values as derived features; they do not replace `semantic_768` or add a retrieval vote.
- [x] TOPO-09 Define bounded JVP/VJP manifold diagnostics without implementing promotion. Evidence: `known-execution-manifests.ts` now exposes separate `jacobianJvpExecution` and `jacobianVjpExecution` manifests; focused tests prove both are diagnostic-only, noncanonical, and nonwriting.
- [x] TOPO-10 Prohibit manifold promotion without decoder-induced metric evidence. Evidence: the execution manifest classifies Jacobian probes as `DIAGNOSTIC_ONLY`, `canonicalWrites=false`, and `exactPromotionRequired=false`; no decoder-induced metric or promotion path is defined.

## 6 — Prefill DAG

- [x] DAG-01 Define/reconcile `PrefillRoutingDecisionV1`. Evidence: `sveltekit-frontend/src/lib/server/atlas/prefill/prefill-routing-decision-v1.ts` binds the current `atlas.retrieval-router-tensor.v2` revision, compact-tensor/classifier/executor-plan/CandidateOrdinal checksums, and explicit workspace/packet revision-set inputs. The contract is deterministic and fail-closed for legacy tensor revisions; `canonicalAuthority=false`, `writesPerformed=false`, and `status=BLOCKED_LINEAGE` remain required for the current unqualified cohort. Focused contract tests pass 3/3. This defines the pure decision envelope only; it does not create a duplicate RetrievalPlan owner or authorize live execution.
- [x] DAG-02 Define typed DAG node identity and input/output checksum contract. Evidence: `sveltekit-frontend/src/lib/server/atlas/orchestration/atlas-execution-pipeline-v1.ts` defines typed stage identity/checksum fields and `atlas-execution-pipeline-v1.spec.ts` proves deterministic pipeline identity.
- [x] DAG-03 Require workspace/packet/representation revisions on every node. Evidence: `atlas-execution-pipeline-v1.ts` now carries stage-level workspace, packet, and representation revisions; planning DAGs may remain nullable while lineage is blocked, while `assertAtlasExecutionPipelineIdentityReadyV1` requires every executable stage to be non-null and exactly equal to the pipeline identity. `atlas-execution-pipeline-v1.spec.ts` proves missing-stage rejection, cross-stage equality, and divergence rejection (`11/11` focused tests pass).
- [x] DAG-04 Require deterministic dependency ordering. Evidence: existing `validateStageDag` cycle/dependency checks and the 9 passing execution-pipeline contract tests.
- [x] DAG-05 Fail closed on stale/missing upstream identity. Evidence: `assertAtlasExecutionPipelineIdentityReadyV1` rejects missing stage outputs, missing dependent inputs, mismatched upstream checksums, authority, or write-enabled pipelines; covered by `atlas-execution-pipeline-v1.spec.ts`.
- [x] DAG-06 Define `PrefillDerivedFeatureReceiptV1`. Evidence: `sveltekit-frontend/src/lib/server/atlas/prefill/prefill-contracts-v1.ts` defines the revision/checksum-bound derived-feature receipt with explicit noncanonical/nonwriting invariants; focused contract tests pass.
- [x] DAG-07 Define `PrefillDagExecutionReceiptV1`. Evidence: `sveltekit-frontend/src/lib/server/atlas/prefill/prefill-contracts-v1.ts` defines deterministic pipeline/node receipt checksums and rejects duplicate DAG nodes; focused contract tests pass.
- [x] DAG-08 Join evidence through `CandidateOrdinalMapV1`, never array position. Evidence: `sveltekit-frontend/scripts/atlas/prove-prefill-dag-fixture-v1.mts` now uses the existing `materializeCandidateOrdinalMap` owner and derives selected packet/evidence rows by explicit ordinals; report records `derivedByOrdinal: true`.
- [x] DAG-09 Produce `ContextManifestV1`. Evidence: the existing ACE owner `sveltekit-frontend/src/lib/server/ace/ace-context-manifest.ts` is covered by 9 focused tests for V1 generation, lane mapping, deterministic identity, explicit unavailable features, process selection, and input immutability; `ContextManifestV2` carries that V1 unchanged. This change does not create a second manifest owner.
- [x] DAG-10 Produce `PromptPlanV1`. Evidence: existing `buildPromptPlanV1` owner is exercised by `prove-prefill-dag-fixture-v1.mts` and focused contract tests cover deterministic ordering and context-budget rejection.
- [x] DAG-11 Bind model/adapter/template/evidence revisions into prefill identity. Evidence: `buildPrefillContentIdentityV1` and `buildPrefillReceiptV1` are covered by `prefill-contracts-v1.spec.ts`, including model, nullable adapter, tokenizer, prompt-template, instruction, evidence, ACE policy, BitFrost, residency, and GPU execution revisions.
- [x] DAG-12 Prove deterministic replay on a frozen candidate fixture. Evidence: `docs/reports/prefill-dag-fixture-v1.json` reports `PREFILL_DAG_REPLAY_PROVEN` with matching manifest and prompt checksums; fixture remains noncanonical and nonwriting.

Executable-DAG guard evidence (read-only, 2026-09-17): 9/9 execution-pipeline tests pass. Planning DAGs may remain nullable while lineage is blocked; executable DAGs now require complete, matching stage checksum chains and remain noncanonical/non-writing.

Receipt contract evidence (read-only, 2026-09-17): `prefill-contracts-v1.ts` now owns `PrefillDerivedFeatureReceiptV1` and `PrefillDagExecutionReceiptV1`, including revision/checksum binding, duplicate-node rejection, deterministic receipt checksums, and noncanonical/nonwriting invariants. Focused tests cover both builders; these receipts do not imply live lineage or model execution.

Routing-plan owner evidence (read-only, 2026-09-17): `scripts/atlas/audit-prefill-routing-plan-owners-v1.mjs` proves `query-router-control-plane-v2.ts` imports and calls the `query-classification-v2.ts` `RetrievalPlanV1` compiler. It also identifies separate same-named contracts in `neural-routing/retrieval-executor-policy-v1.ts`, `agentic-file-compiler/retrieval-plan.ts`, and the semantic-signal transport layer. The tensor census records widths 154 (`neural-routing/encoder-manifest.ts`), 224 (`classification/retrieval-router-tensor-manifest-v1.ts`), and 234 (`classification/retrieval-router-tensor-manifest-v2.ts`), producing the explicit status `CURRENT_CONTROL_PLANE_OWNER_IDENTIFIED_TENSOR_WIDTH_CONFLICT`. `PrefillRoutingDecisionV1` remains `NOT_DEFINED` until these owners are reconciled; no duplicate routing owner or live mutation was introduced.

Routing owner verification (read-only, 2026-09-17): the current classification and neural-routing focused suites pass 10/10. They prove deterministic classification/plan behavior, 26-feature ordering, normalized classifier-vector validation, and executor-policy selection, but did not then resolve the repository's 154/224/234 tensor-width conflict. The later direct-Ollama live probe closes ROUTE-02; the explicit projection receipt below closes ROUTE-01, and `query-router-feature-missingness-v1.json` closes ROUTE-03 with the manifest-owned missingness policy.

Prefill decision reconciliation (read-only, 2026-09-18):
`prefill-routing-decision-v1.ts` now provides the single pure decision envelope
for the current V2 control-plane revision and records the legacy 154/224
contracts only as compatibility inputs outside that envelope. It binds the
V2 tensor, compact projection, classifier output, executor capability plan,
packet revision set, and CandidateOrdinal checksums. The decision remains
`BLOCKED_LINEAGE`, noncanonical, and nonwriting until upstream source/packet
authority is proven.

The frozen fixture now composes that envelope before ContextManifest/PromptPlan;
`docs/reports/prefill-dag-fixture-v1.json` records the V2 tensor revision,
CandidateOrdinal checksum, deterministic decision checksum, and
`BLOCKED_LINEAGE` status while preserving `canonicalAuthority=false` and
`writesPerformed=false`. Fixture replay remains proven; live canonical prefill
remains blocked upstream.

Live classification probe evidence (read-only, 2026-09-17): the initial configured endpoint attempt failed closed with `fetch failed` and no fabricated vector or tensor. The probe was then bound to the reachable direct Ollama `/api/embed` endpoint, avoiding the Go wrapper's Valkey cache-writing route. It now produces `LIVE_CLASSIFICATION_MRL_128_TENSOR_PROVEN` with `canonicalAuthority=false`, `writesPerformed=false`, and `fallbackUsed=false`; ROUTE-02 is closed by the resulting receipt, ROUTE-01 is closed by the explicit projection receipt, and ROUTE-03 is closed by the manifest-owned feature-order/missingness receipt.

Tensor import census (read-only, 2026-09-17): non-test references show the 234-wide v2 manifest is consumed by `query-router-dataset-v2.ts` and `xgboost-query-router-v2-contract.ts`; no non-test consumer was found for the 224-wide v1 manifest, while the 154-wide `encoder-manifest.ts` remains a legacy/challenger training contract. This narrows the issue to an explicit version/owner migration decision; it does not authorize changing the existing v2 contract to the requested 154-wide shape.

Training/lineage recheck (read-only, 2026-09-19): `scripts/atlas/audit-domain-classifier-lineage-v1.mjs` reports `3,352` classifier rows, `148` revision-qualified joins, `0` authoritative source namespaces, and `3,204` missing Graphify joins, so the current classifier corpus remains `CLASSIFIER_LINEAGE_BLOCKED`. `scripts/atlas/prove-domain-classifier-parity-v1.mts` reports `0` exact matches, `6` disagreements, and `6` missing labels with `DOMAIN_CLASSIFIER_TRAINING_READY_FALSE`; ROUTE-04/05 remain open and no writes were performed.

## 7 — Checkpoint taxonomy

- [x] CKPT-01 Document ML activation checkpointing as PyTorch training-memory policy only. Evidence: `sveltekit-frontend/src/lib/server/atlas/pass-checkpoint-v1.ts` explicitly keeps PyTorch activation checkpointing outside `AtlasPassCheckpointV1`.
- [x] CKPT-02 Reuse/finish `AtlasPassCheckpointV1` for PCA/SVD/KMeans/SOM/DAG resumability. Evidence: the existing shared contract binds pass identity, algorithm revision, input snapshot, derived artifact, ordinal map, convergence, and resumability without introducing an algorithm-specific owner.
- [x] CKPT-03 Keep residency checkpoint state separate from pass checkpoints. Evidence: the checkpoint taxonomy delegates residency state to the existing ACE/BitFrost residency contract and does not serialize residency payloads in `AtlasPassCheckpointV1`.
- [x] CKPT-04 Exclude LLM KV/recurrent state from durable pass checkpoints. Evidence: the checkpoint taxonomy explicitly marks KV/recurrent state ephemeral and the pass schema has no tensor, KV, or recurrent-state field.
- [x] CKPT-05 Prove one kill/resume deterministic pass fixture. Evidence: `pass-checkpoint-v1.spec.ts` interrupts a bounded K-means fixture, serializes only the checkpointed centroid state, resumes, and matches the uninterrupted derived-artifact checksum.
- [x] CKPT-06 Checkpoint meaningful pass boundaries, not every floating-point iteration. Evidence: `AtlasPassCheckpointV1` now requires `boundary` from `PASS_START`, `SAFE_RESUME`, `PHASE_COMPLETE`, or `PASS_COMPLETE`; focused tests reject an unclassified iteration boundary.

## 8 — ACE / BitFrost / Valkey residency

- [x] MEM-01 Define/reconcile `GpuResidencyBudgetV1`. Evidence: `sveltekit-frontend/src/lib/server/atlas/gpu/gpu-residency-budget.ts` owns the bounded policy and `docs/reports/gpu-residency-budget-v1.json` proves admission, down-bucketing, lease-floor fallback, and unavailable-telemetry behavior read-only.
- [x] MEM-02 Define/reconcile the GPU execution lease owner. Evidence: `sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-gpu-residency-v1.ts` owns revisioned candidate-feature GPU leases, checksummed resident artifacts, expiry, and release receipts; its focused lifecycle and batch tests pass 10/10. This is a reconciled lane owner, not proof of cross-executor accounting.
- [x] MEM-03 Establish one GPU residency/budget decision owner at the pure contract boundary. Evidence: `admitGpuExecutionLeaseV1` in `sveltekit-frontend/src/lib/server/atlas/gpu/gpu-residency-budget.ts` accounts for active reservations inside the existing budget owner; focused budget tests prove allow and over-budget decisions. Live consumer enforcement remains open.
- [ ] MEM-04 Prevent independent VRAM claims by WebGPU, DirectML, CUDA/PyTorch, TensorRT-RTX, cuVS, and the LLM runtime.
- [ ] MEM-05 Fail with `GPU_RESIDENCY_BUDGET_EXCEEDED` before expected OOM.
- [x] MEM-06 Keep BitFrost exact/revision-qualified control memory. Evidence: `ace-bitfrost-cache-identity-v1.ts` requires representation, candidate, ordinal, graph, feature, producer, artifact, and optional source/packet/model revisions in the cache identity; focused identity tests prove revision-sensitive keys and no authority/write claim.
- [x] MEM-07 Keep Valkey hot manifests/routing/residency state only. Evidence: `bitfrost-residency-warming-v1.ts` provides bounded cache-aside/warm-plan behavior, uses existing shared key builders, never fabricates a miss, and reports `writesPerformed=false`; focused warming tests cover bounded plans and failures.
- [x] MEM-08 Keep Qdrant as a persistent vector projection only. Evidence: `qdrant-collection-contracts.ts`
  defines compact validated projection payloads while PostgreSQL owns canonical records;
  classification, Graphify fanout, and semantic executor parity tests pass 17/17 and reject
  canonical identity/write claims from Qdrant. Live current-corpus promotion remains separately
  gated by lineage and candidate-freeze receipts; no projection mutation occurred.
- [x] MEM-09 Prove deterministic MISS→HIT for a revision-qualified prefill artifact. Evidence: `bitfrost-residency-warming-v1.test.ts` proves reconstruction on a miss followed by a cache hit without reconstruction, while `ace-bitfrost-cache-identity-v1.ts` binds the artifact to revisioned identity and keeps the proof noncanonical.
- [x] MEM-10 Invalidate cache entries on representation/evidence revision mismatch. Evidence: `ace-bitfrost-cache-identity-v1.test.ts` proves cache identity changes for candidate/model/source/packet revisions and representation-family changes; `computation-cache-key.test.ts` proves only exact relevant revisions reuse a proven receipt.

Residency decision seam recheck (read-only, 2026-09-18):
`admitGpuExecutionLeaseV1` and `assertGpuExecutionWithinBudgetV1` now live in
the existing GPU budget owner, and `unified-residency-adapter-v1.ts` delegates
its byte admission check to that predicate. Focused budget and unified-adapter
tests pass 12/12. This proves shared contract behavior only; live consumer
registration and cross-executor accounting remain required by MEM-04/MEM-05.

Cross-executor matrix recheck (read-only, 2026-09-19): `gpu-residency-budget.test.ts` now
exercises `pytorch_cuda`, `cuvs`, `tensorrt_rtx`, `directml`, `webgpu`, and `llm_runtime`
through the same pre-allocation budget owner; budget rejection and noncanonical/nonwriting
invariants pass 7/7, and the residency integration suite passes 4/4. This strengthens the
contract proof but does not claim live registration or runtime OOM prevention, so MEM-04/MEM-05
remain open.

## 9 — PyTorch RTX reference ladder

- [x] GPU-PT-01 Freeze PyTorch CPU FP32 as numerical reference. Evidence: `python/prove-atlas-pytorch-cpu-fp32-reference-v1.py` emits `docs/reports/pytorch-cpu-fp32-reference-v1.json` for the bounded Atlas ranker component with CPU/FP32 executor identity, input/output checksums, finite outputs, exact repeat replay, unchanged source checkpoint checksum, `referenceAuthority=true`, `canonicalAuthority=false`, and `writesPerformed=false`. This is a numerical reference receipt only; CUDA, LibTorch/Node-API, TensorRT-RTX, ranking quality, and production promotion remain separate gates.
- [x] GPU-PT-02 Run the same component on CUDA sm_86. Evidence: `docs/reports/atlas-gemma-rank-cuda132-real-batch-v3-live.json` runs the selected Atlas ranker component on NVIDIA RTX 3060 Ti compute capability `8.6` with PyTorch `2.14.0+cu132`; the checkpoint is unchanged and `canonicalAuthority=false`/`trainingPerformed=false`.
- [x] GPU-PT-03 Record shape, dtype, checksum, error, cosine, argmax, and rank parity as applicable. Evidence: the same receipt records input shape `[3,35]`, output shape `[3,1]`, input/output dtypes and checksums, finite outputs, cosine similarity `0.9985185265541077`, max absolute delta `0.44091796875`, argmax agreement, and ranking-order agreement. This is measurement evidence; `rankingQualityProven=false` remains explicit.
- [x] GPU-PT-04 Record warm and cold latency. Evidence: the same receipt records three CPU/GPU timing samples and separate means (`cpuMeanMs=60.270794999572296`, `gpuMeanMs=33.9801453325587`); first-run and repeated samples remain visible rather than being collapsed into one claim.
- [x] GPU-PT-05 Record peak allocated/reserved VRAM. Evidence: the same receipt records `cudaPeakMiB=158.791`; no residency or canonical cache write was performed.
- [x] GPU-PT-06 Keep activation checkpointing disabled for the tiny router absent measured training-memory pressure; distinguish this training concern from TensorRT-RTX benchmark selection. Evidence: `sveltekit-frontend/src/lib/server/atlas/contracts/gpu-runtime-abi-v1.spec.ts` fixes `checkpointing.enabled=false` and `policy=OFF`, while `pass-checkpoint-v1.ts` explicitly keeps ML activation checkpoints outside `AtlasPassCheckpointV1`; the focused contract matrix includes both boundaries.
- [x] GPU-PT-07 Evaluate `torch.compile` only after eager correctness. Evidence: `docs/reports/torch-compile-inductor-probe-wsl2-v1.json` records a bounded WSL2 CUDA replay on RTX 3060 Ti/sm_86 with PyTorch `2.14.0+cu132`, CUDA `13.2`, and Inductor parity/index parity true (`maxAbsError=2.9802322387695312e-08`). Triton `weighted_row_dot_v1` parity also passed. This is challenger/reference evidence only; grouped-MoE execution, canonical promotion, model mutation, and writes remain false.
- Historical Windows probe: eager FP32 cosine/top-k executed successfully for 256×768, but `torch.compile(backend="inductor")` failed closed because that environment lacks the required `clang-cl` toolchain. Receipt: `docs/reports/torch-compile-inductor-probe-v1.json`. The WSL2 CUDA replay above is the qualifying GPU-PT-07 result; no CUDA installation or model changes were made.
- [x] GPU-PT-08 Keep custom CUDA/Triton operators deferred unless built-ins are insufficient. Evidence: the current bounded PyTorch reference and executor lanes use built-in operators, and the existing GPU primitive policy defers custom CUDA/cuTile work until a measured built-in insufficiency is recorded. No such insufficiency is present in the current receipts; no custom operator was added, compiled, or promoted.

2026-09-19 environment reconciliation: the isolated WSL2 environment
`/home/james/.venvs/atlas-cutile-cu132` is the only current cuTile+PyTorch
lane. It runs Python 3.14.6, PyTorch `2.14.0+cu132`, CUDA `13.2`, and the
RTX 3060 Ti (`sm_86`). The bounded cuTile-versus-PyTorch SIMT FP16 GEMM
replay passed with zero maximum absolute and relative delta; receipt:
`docs/reports/atlas-cuda132-cutile-simt-gemm-probe-v2-live.json`. This is
challenger-kernel parity only and does not close GPU-PT-02..05, because the
selected Atlas ranker checkpoint is not available in that environment.
The Miniforge `atlas-rapids-cu13` environment remains the RAPIDS/cuVS/cuGraph
lane and has no `cuda.tile`; `atlas-gpu-8098` remains RAPIDS-only, while
`atlas-neural-decoder` remains the separate PyTorch service. No environment,
container, model, or canonical state was changed.

## 10 — LibTorch / Node-API boundary

- [x] NAPI-01 Define `NativeInferenceReceiptV1`. Evidence: `sveltekit-frontend/src/lib/server/atlas/execution/native-inference-receipt-v1.ts` defines the typed LibTorch/Node-API receipt with representation/model/executor/runtime identity, input/output checksums, shape/dtype, parity status, and an explicit event-loop-safety invariant. Focused tests prove the receipt remains noncanonical/nonwriting; no native addon or runtime capability is claimed.
- [x] NAPI-02 Use Node-API/node-addon-api as the ABI-stable boundary across supported Node versions; do not couple the addon to direct V8 internals. Evidence: `native-inference-boundary-v1.ts` structurally fixes `NODE_API`, `node-addon-api`, and `directV8Internals=false`; focused tests cover the boundary.
- [x] NAPI-03 Keep tensor computation in LibTorch/ATen; transport typed buffers/receipts only. Evidence: the boundary contract fixes `tensorComputationOwner=LIBTORCH_ATEN` and `transport=TYPED_BUFFERS_AND_RECEIPTS`; it creates no tensor or model owner.
- [x] NAPI-04 Avoid blocking Node's event loop. Evidence: the boundary contract requires `WORKER_THREAD` or `ASYNC_NATIVE_CALLBACK`; blocking-main-thread policy is rejected by focused tests.
- [ ] NAPI-05 Prove CPU LibTorch parity first.
- [ ] NAPI-06 Prove LibTorch CUDA parity against PyTorch CUDA.
- [x] NAPI-07 Record ABI/runtime/CUDA/PyTorch metadata. Evidence: the boundary and `NativeInferenceReceiptV1` require Node-API, node-addon-api, LibTorch, PyTorch-reference, and optional CUDA runtime revisions; no native capability is claimed.
- [x] NAPI-08 Do not create a second canonical model owner in the addon. Evidence: both boundary and inference receipt require `canonicalModelOwner=false`, `canonicalAuthority=false`, and `writesPerformed=false`.

NAPI parity support tranche (read-only, 2026-09-19): `scripts/gpu/proof-batch-cosine-rerank.mjs` now uses the query-vs-corpus `batchCosineSimilarity` ABI and emits deterministic CPU/native fixture metrics; `scripts/gpu/probe-native-concurrency-v1.mjs` exercises two concurrent `gpu-worker.mjs` jobs with independent input/output checksums. Receipt: `docs/reports/native-concurrency-proof-v1.json` records `NAPI_WORKER_CONCURRENCY_FIXTURE_PROVEN`, both jobs complete, maximum CPU/native delta below `2.3e-8`, `canonicalAuthority=false`, `writesPerformed=false`, and `tensorsPersisted=false`. This supports the worker/transport boundary only; it does not close NAPI-05 or NAPI-06 because the reference is not yet a PyTorch/LibTorch CPU-versus-CUDA parity proof.

## 11 — TensorRT-RTX isolated challenger

- [x] TRT-00 Selection decision recorded: use the heavier reranker/prefill-auxiliary challenger and
  exclude the tiny 154-feature router from performance claims. The remaining revision and bounded
  export-shape binding is tracked by the detailed TRT-00 entry immediately below.
- [x] TRT-00 Select a heavier bounded neural benchmark component—reranker, prefill encoder, or decoder-side auxiliary network—and record its model/component revision, checksum, bounded shapes, workload rationale, and expected AOT/JIT/runtime-cache amortization. Evidence: `scripts/atlas/plan-tensorrt-rtx-benchmark-component-v1.mjs` binds the local Gemma4 assistant safetensors artifact and config checksums into a deterministic component revision, records a batch-1/512-token/bfloat16 bounded export contract, and separates portable-AOT/device-JIT cost from steady-state measurement. No export, engine build, runtime-cache write, or canonical promotion is claimed; TRT-01 onward remain open.
- [x] TRT-00A Record that the `QueryRouterTensorV1[154]` → hidden → heads router is correctness/reference plumbing only and is excluded as the TensorRT-RTX performance or success criterion. Evidence: `openspec/changes/parent-atlas-prefill-routing-residency-convergence/design.md` and `docs/reports/tensorrt-rtx-benchmark-component-v1.json`.
- [ ] TRT-01 Prove installation/capability without changing active RAPIDS.
- [x] TRT-02 Record SDK, CUDA, driver, compute capability, and OS. Evidence: `docs/reports/atlas-gpu-inference-stack-readiness-v1.json` records the Windows CUDA/toolkit and observed TensorRT metadata plus RTX 3060 Ti/SM86/driver; `docs/reports/wsl2-rapids-sidecar-readiness-2026-08-28.json` records the WSL2 Ubuntu runtime, GPU, driver, compute capability, and CUDA-side packages. `docs/reports/tensorrt-rtx-capability-v1.json` remains `NOT_INSTALLED_OR_PROVEN`, so this closes environment inventory only and does not claim TensorRT-RTX compatibility or engine execution.
- [ ] TRT-03 Export/freeze one bounded ONNX model from the proven PyTorch component.
- [ ] TRT-04 Bind ONNX checksum to engine-build receipt.
- [ ] TRT-05 Build a portable AOT engine.
- [ ] TRT-06 Record engine checksum and SDK version.
- [ ] TRT-07 Load/run on RTX 3060 Ti.
- [ ] TRT-08 Persist and identify runtime JIT cache.
- [ ] TRT-09 Separate first-run JIT from steady-state latency.
- [ ] TRT-10 Prove FP32/reference parity.
- [ ] TRT-11 Prove permitted shape range and fail-closed out-of-range behavior.
- [ ] TRT-12 Measure peak VRAM.
- [ ] TRT-13 Benchmark against PyTorch CUDA and LibTorch CUDA.
- [ ] TRT-14 Reject promotion when speedup is immaterial for the selected heavier bounded component; never use the tiny 154-feature router as the TensorRT-RTX performance criterion.
- [ ] TRT-15 Evaluate reduced precision only after reference parity.
- [ ] TRT-16 Record quality/rank/calibration changes for reduced precision.
- [ ] TRT-17 Evaluate RTX CUDA Graphs only after runtime correctness.
- [ ] TRT-18 Keep Torch-TensorRT-RTX experimental and noncanonical.
- [x] TRT-19 Never treat TensorRT engine identity as representation identity. Evidence: `sveltekit-frontend/src/lib/server/atlas/runtime/algorithm-execution-manifest.ts` models representation, algorithm, executor, transport, and geometry independently; `algorithm-execution-manifest.spec.ts` verifies the independent representation/execution fields.

## 12 — cuVS / ANN integration boundary

- [x] ANN-01 Keep cuVS brute-force as GPU exact semantic oracle. Evidence: `scripts/atlas/audit-semantic768-cuvs-exact-oracle-v1.mjs` reconciles the bounded live receipt `docs/reports/gpu-knn-exact-runtime-proof.json` with `atlas-rapids-semantic768-client.ts`; cuVS brute-force on the RTX 3060 Ti is proven for `semantic_768`/768 dimensions across three deterministic runs with `packetKey+sourceRevision` identity preserved and no mutations. Current-corpus eligibility remains separate and blocked by candidate freeze; CAGRA remains challenger-only.
- [x] ANN-02 Keep CAGRA approximate and separately benchmarked. Evidence: `docs/reports/gpu-knn-cagra-runtime-proof.json` runs cuVS CAGRA separately from the exact oracle on a bounded 3-row `semantic_768` fixture, records exact-vs-CAGRA ordering, Recall@3 `1.0`, latency, `packetKey+sourceRevision` identity parity, unchanged one-semantic-lane voting, and `PRODUCTION_PROMOTION=BLOCKED_PENDING_LARGER_CORPUS_AND_OPERATOR_APPROVAL` with all mutation flags false.
- [ ] ANN-03 Require the same semantic_768 matrix and identity manifest across Qdrant/cuVS.
- [ ] ANN-04 Record Recall@K, overlap, latency, build/load cost, and VRAM.
- [x] ANN-05 Preserve one semantic logical vote regardless of executor count. Evidence: `dense-executor-candidate-ordinal-v1.ts` deduplicates executor hits by `CandidateOrdinal`, while `search-runtime-policy.ts` assigns the shared `semantic` vote key; focused executor and policy tests cover CAGRA/Qdrant/cuVS separation without vote inflation.

ANN-03 proof note (read-only, 2026-09-18): `semantic768-identity-manifest-v1.ts` defines the shared deterministic identity/matrix manifest contract; `atlas-rapids-semantic768-client.ts` binds checksums to the exact cuVS corpus request/receipt; and `qdrant-semantic-scorer.ts` now emits the same manifest fields only for a qualified returned projection, otherwise reporting `BLOCKED_SOURCE_REVISION_AUTHORITY` or mixed revisions. The fixture proof reports `SEMANTIC768_IDENTITY_FIXTURE_PARITY_PROVEN` with `canonicalAuthority=false` and `writesPerformed=false`; the task remains open because live Qdrant parity is still blocked by current-corpus source authority.
ANN-03 gate binding recheck (read-only, 2026-09-18): `scripts/atlas/prove-semantic768-qdrant-cuvs-identity-v2.mts` consumes `docs/reports/candidate-population-freeze-v1.json` and reports the fixture result separately from live eligibility. Current result remains `SEMANTIC768_IDENTITY_FIXTURE_PARITY_PROVEN`, while `liveStatus=BLOCKED_CANDIDATE_POPULATION_FREEZE`, `downstreamAllowed=false`, and all mutation flags remain false. The fixture cannot authorize Qdrant/cuVS parity or production execution. Report: `docs/reports/semantic768-qdrant-cuvs-identity-v2.json`.

ANN-03 snapshot contract tranche (read-only, 2026-09-18): `semantic-candidate-snapshot-v1.ts` now builds `SemanticCandidateSnapshotV1` only from an existing `CandidateOrdinalMapV1` plus explicit packet/source/chunk/digest/vector rows. It enforces ordinal-map identity parity, contiguous ordinals, 768 finite vectors, duplicate rejection, deterministic row-identity/tensor checksums, and `canonicalAuthority=false`, `lineageQualified=false`, `writesPerformed=false`. Focused replay tests pass `4/4`. This proves the shared artifact contract, not a current-corpus export or Qdrant/cuVS live parity; no ANN-03 promotion is authorized.

ANN-03 executor-parity guard (read-only, 2026-09-18): `semantic768-executor-parity-v1.ts` now provides one fail-closed assertion for Qdrant/cuVS receipt envelopes. It requires matching `semantic_768`, representation revision, 768 dimensions, row count, identity-manifest checksum, and matrix checksum, and rejects mutation-enabled envelopes. Focused parity tests pass `3/3`; this strengthens the fixture gate but does not authorize live current-corpus parity.

ANN-03 current export gate (read-only, 2026-09-18): `scripts/atlas/export-current-semantic-candidate-snapshot-v1.mts` now refuses the historical `4,951`-row map unless the current lineage funnel reports eligible rows and the map workspace revision matches the admitted workspace. Current receipt: `BLOCKED_CURRENT_LINEAGE`, `firstFailureBoundary=EXECUTION_SOURCE_AUTHORITY`, `candidateOrdinalEligibleRows=0`, snapshot not written, and all write flags false. Report: `docs/reports/current-semantic-candidate-snapshot-v1.json`.

ANN-03 current join recheck (read-only, 2026-09-18): with admitted workspace `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc` and selected execution `74d50c86-8194-45ea-8c3d-61aab737ef83`, the bounded 128-row join found `4` proven source/packet-chunk rows, `0` packet revision matches, and `0` full packet identity matches. The guarded semantic export remains `BLOCKED_CURRENT_LINEAGE`; no snapshot or downstream execution was authorized. Report: `docs/reports/current-workspace-packet-chunk-join-v1.json`.

Candidate population freeze contract tranche (read-only, 2026-09-18):
`candidate-population-freeze-v1.ts` now defines the pure `CandidatePopulationFreezeV1`
receipt without creating another ordinal or semantic-matrix owner. It requires the
existing `CandidateOrdinalMapV1`, the shared `semantic_768` snapshot, explicit source-
authority receipt checksum, matching workspace/map checksums, complete 768-D rows, and
separate `lineageQualified`/`semanticComplete` admission flags. Focused contract replay
passes `3/3`; the current live cohort still cannot produce this receipt because lineage
qualification is false and `candidateOrdinalEligibleRows=0`. No downstream execution or
canonical promotion is authorized.

## 13 — Model prefill and decoder memory boundary

- [x] MODEL-01 Define/reconcile `ModelPrefillIdentityV1`. Evidence: the existing `PrefillContentIdentityV1` owner in `sveltekit-frontend/src/lib/server/atlas/prefill/prefill-contracts-v1.ts` binds model, adapter, tokenizer, prompt-template, instruction, evidence, residency, and GPU execution revisions; `prefill-contracts-v1.spec.ts` proves deterministic identity and physical-artifact binding without creating a duplicate model owner.
- [x] MODEL-02 Bind ContextManifest, model, adapter, and prompt-template revisions. Evidence: `PrefillContentIdentityV1` binds ContextManifest, prompt plan, model, adapter, tokenizer, template, evidence, residency, and GPU revisions; focused prefill tests prove deterministic identity.
- [x] MODEL-03 Keep attention KV model-owned and ephemeral. Evidence: `PrefillArtifactIdentityV1` carries physical artifact checksums and layout metadata without serializing raw KV/tensor state; the prefill contract remains separate from model-owned ephemeral state.
- [x] MODEL-04 Keep Ornith recurrent/SSM state distinct from attention KV. Evidence: `PrefillDecodeAlignmentV1` and `hybrid-sequence-state.ts` separately account full-attention KV and recurrent/convolution state; focused hybrid-state tests cover the distinction.
- [x] MODEL-05 Do not persist KV/recurrent tensors as AtlasPassCheckpoint state. Evidence: `AtlasPassCheckpointV1` contains no tensor/KV/recurrent fields and its taxonomy explicitly delegates model state to ephemeral runtime ownership.
- [x] MODEL-06 Give the decoder selected prompt/context, not implementation metadata. Evidence: the existing prompt-plan block owner binds selected TASK/EVIDENCE blocks and checksums context identity; implementation metadata remains in receipts rather than prompt blocks.
- [x] MODEL-07 Record prefill and decode receipts separately. Evidence: `buildPrefillDecodePhaseReceiptV1` emits distinct `PREFILL` and `DECODE` phase receipts bound to the same content identity, with `MODEL_EPHEMERAL` state ownership and no KV/recurrent payload; focused prefill tests cover the separation.

## 14 — Offline learning / QLoRA boundary

- [x] TRAIN-01 Define `VerifiedTrainingTupleEligibilityV1`. Evidence: `sveltekit-frontend/src/lib/server/atlas/neural/verified-training-tuple-eligibility-v1.ts` defines the revision-bound, offline-only tuple eligibility contract.
- [x] TRAIN-02 Require successful execution/validation evidence before tuple admission. Evidence: the contract requires `executionReceiptChecksum`, `validationReceiptChecksum`, and both statuses to be `PROVEN`; focused tests cover eligible and rejected tuples.
- [x] TRAIN-03 Bind query/source/packet/workspace/representation/model revisions. Evidence: the eligibility schema binds query/label checksums, sourceRef/sourceRevision, packetKey/workspaceRevision, representation, model, and adapter revisions.
- [x] TRAIN-04 Split train/held-out data by source revision. Evidence: `sveltekit-frontend/src/lib/server/atlas/classification/xgboost-ranking-lineage-v1.ts` requires disjoint `trainSourceRevisions` and `heldOutSourceRevisions`; `xgboost-ranking-lineage-v1.spec.ts` proves both admission and overlap rejection.
- [x] TRAIN-05 Reject generated text as sole ground truth. Evidence: `generatedTextOnly` is structurally `false`, `groundTruthVerified` is structurally `true`, and the builder rejects either unsafe condition.
- [x] TRAIN-06 Keep QLoRA/SFT offline and noncanonical. Evidence: the tuple contract requires `offlineOnly=true`, `onlineWeightMutationAllowed=false`, and `canonicalWritesAllowed=false`; existing QLoRA gate remains the downstream sufficiency/evaluation owner.
- [x] TRAIN-07 Keep DPO downstream of proven SFT/evaluation. Evidence:
  `sveltekit-frontend/src/lib/server/atlas/neural/dpo-training-gate-v1.ts` requires proven SFT
  and held-out receipts, disjoint source revisions, and explicit preference-pair sufficiency;
  focused tests keep the result offline, shadow-only, noncanonical, and non-promotional. No DPO
  training or model-state writes were performed.
- [x] TRAIN-08 Prohibit online weight mutation in this change. Evidence: the training eligibility schema makes online mutation and canonical writes literal `false`; no training or weight-writing path is invoked.

## 15 — Promotion and rollback

- [x] PROMOTE-01 `WRITTEN` means artifact/code existence only. Evidence: `scripts/atlas/prove-prefill-promotion-governance-v1.mjs` emits the explicit four-state maturity model and keeps artifact existence separate from runtime proof.
- [ ] PROMOTE-02 `WIRED` requires a real runtime call path.
- [ ] PROMOTE-03 `PROVEN` requires fixture/live replay plus receipt.
- [x] PROMOTE-04 `PROMOTED` requires an explicit promotion decision. Evidence: `prefill-promotion-governance-v1.json` requires an explicit decision and reports `promotionAuthorized=false`.
- [x] PROMOTE-05 Prohibit executor promotion while packet/source lineage is unresolved. Evidence: the governance receipt records `executorPromotionBlockedUntilLineage=true` and `lineageRequiredForPromotion=true`.
- [x] PROMOTE-06 Prohibit canonical vector/cache/database writes in planning/proof tasks. Evidence: the governance receipt records `canonicalVectorCacheDatabaseWritesBlocked=true`, `canonicalAuthority=false`, and `writesPerformed=false`.
- [x] PROMOTE-07 Keep deterministic CPU/reference fallback for learned/GPU decisions. Evidence: the governance receipt requires `deterministicCpuReferenceFallbackRequired=true`; executor policy remains fail-closed for unproven challengers.
- [x] PROMOTE-08 Roll back by disabling challengers without deleting evidence/history. Evidence: the governance receipt fixes rollback to disable the challenger while retaining receipts/history.
- [x] PROMOTE-09 Run focused tests for every new contract. Evidence: the focused lane-contract matrix covers 23 routing, prefill, residency, Node-API, TensorRT-RTX, semantic snapshot/parity, checkpoint, ACE, and training-contract suites and passes `23/23`; `sveltekit-frontend/vitest.lane-contracts.config.ts` includes both Atlas `.test.ts` files and ACE specs so the matrix cannot silently omit them.
- [x] PROMOTE-10 Run strict OpenSpec validation before implementation completion. Evidence: `npx openspec validate parent-atlas-prefill-routing-residency-convergence --strict` and `npx openspec validate parent-atlas-retrieval-lineage-dag-convergence --strict` both report the changes valid on 2026-09-18.

## Initial expected state

```text
PACKET_LINEAGE_AUTHORITY       BLOCKED_UPSTREAM
QUERY_ROUTER_SCHEMA            EXISTING
QUERY_ROUTER_TRAINING          PARTIAL
4X6_TILE                       PLANNED
CANDIDATE_FEATURE_MATRIX       EXISTING/PARTIAL
PCA_SVD                        CHALLENGER
HILBERT_HAMMING                EXISTING_HELPERS
KMEANS_SOM                     EXISTING/PARTIAL
PREFILL_DAG                    PARTIAL
CONTEXT_MANIFEST               EXISTING/PARTIAL
ACE_BITFROST                   EXISTING/PARTIAL
GPU_RESIDENCY_OWNER            RECONCILE
PYTORCH_CPU_REFERENCE          TO_PROVE_PER_COMPONENT
PYTORCH_CUDA_SM86              CHALLENGER
LIBTORCH_NAPI                  NOT_PROMOTED
TENSORRT_RTX                   CAPABILITY_PROOF_REQUIRED
CUVS_EXACT                     EXECUTOR/ORACLE
CAGRA                          CHALLENGER
WEBGPU_QINT8_512               BOUNDED_CHALLENGER
QLORA_SFT                      DOWNSTREAM
CANONICAL_WRITES               NOT_AUTHORIZED
```
