# Tasks — Parent Atlas Autoresearch Fabric

Status convention:

- `[x]` implemented in this change and structurally covered by source/tests.
- `[ ]` not yet proven or not yet implemented.
- No item below implies canonical promotion until its explicit proof gate passes.

## Foundation

- [x] **AUTORESEARCH-00** — Freeze ownership boundaries: autoresearch is a research protocol, not a new agent/control/data authority.
- [x] **AUTORESEARCH-01** — Add `ExperimentHypothesisV1` with one independent variable, frozen parent/workload identity, admitted providers, improvement floor, and isolated-worktree-only mutation scope.
- [x] **AUTORESEARCH-02** — Add `HardwareProfileV1` with exact GPU/driver/CUDA/toolchain evidence and deterministic checksum support.
- [x] **AUTORESEARCH-03** — Add `ExperimentWorktreeV1` with parent/worktree revision, mutation allowlist/denylist, and `canonicalStateWritable=false`.
- [x] **AUTORESEARCH-04** — Add `GpuExperimentLeaseV1` that binds an existing `GpuAdmissionReceiptV1` to one experiment/device/expiry without replacing GPU admission ownership.
- [x] **AUTORESEARCH-05** — Add explicit provider vocabulary for `PYTORCH_ATEN`, `TORCH_COMPILE_INDUCTOR`, `TRITON`, `CUTEDSL`, `CUTILE`, `CUDA_SIMT`, `CUBLASLT`, `CUTLASS`, `CUVS`, `CUGRAPH`, `NETWORKX`, and `CPU_REFERENCE`.

## Receipt and promotion

- [x] **AUTORESEARCH-06** — Add `ExperimentRunReceiptV1` binding hypothesis/hardware/worktree/workload/provider/algorithm-manifest evidence, correctness, benchmark distribution, diagnostics and mutation boundaries.
- [x] **AUTORESEARCH-07** — Add `ExperimentPromotionDecisionV1` with `PROMOTE | REJECT | BLOCKED` semantics.
- [x] **AUTORESEARCH-08** — Promotion independently recomputes relative improvement from raw baseline/candidate measurements and optimization direction; receipt-supplied improvement is never trusted alone.
- [x] **AUTORESEARCH-09** — Correct-but-slower candidates reject cleanly; identity/provider/mutation/metric-consistency defects block.
- [x] **AUTORESEARCH-10** — Add focused Vitest coverage for single-change admission, deterministic checksums, successful promotion, slower-candidate rejection, fabricated-improvement blocking, escaped-write blocking and GPU lease admission.
- [ ] **AUTORESEARCH-11** — Run package TypeScript compile and focused `autoresearch-fabric-v1.spec.ts` on the workstation; record exact test/compile receipt.

## Existing-contract integration

- [x] **AUTORESEARCH-12** — Add adapter from `GpuResourceEnvelopeV1` + `GpuAdmissionRequestV1` + `GpuAdmissionReceiptV1` to `GpuExperimentLeaseV1`; test both admitted and insufficient-VRAM paths.
- [ ] **AUTORESEARCH-13** — `executionManifestPairChecksumsV1()` is implemented; add a focused test proving baseline/candidate `AlgorithmExecutionManifestV1` values are parsed and checksum-bound without duplicating the execution-manifest schema.
- [ ] **AUTORESEARCH-14** — Add `AcePacketV2` evidence binding for experiment kickoff; ACE must contain only bounded evidence/skills, never raw matrices or GPU buffers.
- [ ] **AUTORESEARCH-15** — Bind OaK `kernelRevision` and allowed function/operator set to experiment planning; undeclared OaK functions/providers fail closed before worker execution.
- [ ] **AUTORESEARCH-16** — Lower admitted experiment plan to the existing bounded DAG executor / Mastra adapter; autoresearch does not become a scheduler owner.
- [ ] **AUTORESEARCH-17** — Add Prime/ACP/OpenCode-style worker adapter that writes only inside `ExperimentWorktreeV1.allowedMutationPaths`.
- [ ] **AUTORESEARCH-18** — Add Paperclip/watchdog adapter for worker lifecycle only; no receipt/promotion authority.

## Durable experiment ledger

- [ ] **AUTORESEARCH-19** — Define append-only `ExperimentLedgerEntryV1` referencing hypothesis/run/promotion checksums and parent revision.
- [ ] **AUTORESEARCH-20** — Persist experiment ledger to PostgreSQL 18 using an append-only table; no update-in-place promotion history.
- [ ] **AUTORESEARCH-21** — Add deterministic `do-not-repeat` lookup from prior experiment identity/hypothesis/provider/hardware/workload evidence.
- [ ] **AUTORESEARCH-22** — Add Trackio/Atlas Studio reporter projection as observability only; dashboard state cannot affect promotion.

## Hypergraph / ontology research memory

- [ ] **AUTORESEARCH-23** — Define `ExperimentHyperedgeV1` projection joining experiment, hardware, provider, kernel/function revision, workload shape/dtype, result and outcome.
- [ ] **AUTORESEARCH-24** — Project completed receipts into HyperGraphRAG/ontology-linked-tuple research memory with `canonicalAuthority=false` for derived analytics.
- [ ] **AUTORESEARCH-25** — Add centroid/KMeans/SOM research clustering over experiment features for recommendation and duplicate detection only; clusters never become ontology concepts automatically.
- [ ] **AUTORESEARCH-26** — Add NetworkX CPU experiment-graph analysis and optional cuGraph parity for research navigation (`improves_on`, `derived_from`, `same_hardware`, `same_failure`, `contradicts`).

## GPU residency and provider fabric

- [ ] **GPU-AUTORESEARCH-00** — Freeze `GpuArtifactKeyV1` identity over artifact revision/checksum, ordinal map, dtype/shape/layout, device and materialization-policy revision.
- [ ] **GPU-AUTORESEARCH-01** — Freeze `GpuResidencyReceiptV1` and HOT/WARM/COLD semantics; BitFrost policy chooses residency but not identity.
- [ ] **GPU-AUTORESEARCH-02** — Prove one H2D materialization followed by repeated resident reuse with identical input artifact checksum.
- [ ] **GPU-AUTORESEARCH-03** — Prove revision/checksum change makes the old resident artifact ineligible for a new request.
- [ ] **GPU-AUTORESEARCH-04** — Prove VRAM-pressure eviction through existing GPU admission/resource-envelope policy.

## First generative-GPU campaign

- [ ] **CUTILE-01** — Frozen semantic MRL prefix + L2-normalization fixture (`768 -> 512/256/128`) using `PYTORCH_ATEN` as the correctness reference.
- [ ] **SIMT-01** — Implement the same fixture as a CUDA SIMT challenger.
- [ ] **CUTILE-02** — Implement the same fixture as a cuTile challenger on the CUDA 13.2/Ampere-capable kernel environment.
- [ ] **GPU-PARITY-01** — PyTorch ↔ cuTile ↔ SIMT parity with frozen max/mean error thresholds and deterministic replay.
- [ ] **GPU-BENCH-01** — Benchmark warmup + p50/p95/mean + peak VRAM on exact same hardware/workload profile.
- [ ] **GPU-PROMOTE-01** — Run `ExperimentPromotionDecisionV1`; no provider promotion without correctness and measured improvement gates.
- [ ] **CUTILE-03** — Add query × candidate-matrix dot-product campaign against PyTorch/cuBLASLt/cuVS references.
- [ ] **GPU-FEATURE-01** — Add CandidateFeatureMatrix transforms only after CandidateOrdinal-aligned feature identity is frozen.
- [ ] **GPU-GRAPH-01** — Admit GraphProjection/GraphOrdinal artifacts to cuGraph only after graph projection receipts/ordinal bridge are proven.

## Semantic and graph prerequisites — external blockers, do not bypass

- [ ] **PREREQ-SEMANTIC-01** — `QDRANT-PROJECTION-ID-OWNER-02` proves one actual Qdrant point-ID policy before semantic corpus rebuild/cutover.
- [ ] **PREREQ-SEMANTIC-02** — Freeze revision-qualified semantic_768 corpus and exact `CandidateOrdinalMapV1` before production GPU semantic caching.
- [ ] **PREREQ-GRAPH-01** — Complete read-only repeatable-read graph snapshot/replay and `GraphProjectionReceiptV1` before production graph GPU caching.
- [ ] **PREREQ-GRAPH-02** — Keep current PageRank artifact key `projectionOrdinal` until exact `GraphNodeKey <-> GraphOrdinal <-> projectionOrdinal` bridge checksum is proven.

## OaK / DSPy / GEPA integration

- [ ] **OAK-AUTORESEARCH-01** — Feed real `ExperimentRunReceiptV1` failures to OaK judge/diagnosis as evidence; judge cannot directly mutate a frozen kernel.
- [ ] **DSPY-AUTORESEARCH-01** — Use DSPy for experiment classification/hypothesis selection/diagnosis only after the deterministic experiment fabric is working.
- [ ] **GEPA-AUTORESEARCH-01** — Optimize DSPy experiment policy offline against historical receipts/held-out metrics; never run GEPA as live production mutation.

## Promotion readiness

- [ ] **AUTORESEARCH-PROMOTION-01** — At least one full isolated experiment executes through: hypothesis -> review -> worktree -> GPU admission/lease -> correctness -> benchmark -> receipt -> deterministic promotion decision.
- [ ] **AUTORESEARCH-PROMOTION-02** — Replay the same frozen experiment twice and prove identical hypothesis/workload/output decision checksums where deterministic semantics apply.
- [ ] **AUTORESEARCH-PROMOTION-03** — Prove a rejected/failed experiment is queryable through do-not-repeat research memory before allowing parallel autonomous campaigns.
- [ ] **AUTORESEARCH-PROMOTION-04** — Only after the above, admit bounded parallel workers capped by real GPU lease capacity.

## Current next commands

From `packages/parent-atlas` after pulling this branch:

```bash
node ../../node_modules/typescript/bin/tsc -p tsconfig.json
node ../../node_modules/vitest/vitest.mjs run src/core/autoresearch-fabric-v1.spec.ts --root .
```

Expected intent, not yet claimed as executed by this branch authoring session:

- TypeScript compile succeeds.
- Focused autoresearch spec passes all tests.
- No PostgreSQL/Qdrant/Neo4j/Valkey/canonical writes occur.
