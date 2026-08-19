# Parent Atlas Learning Feedback Loop — Tasks

## LFL-0 — Freeze ownership and proof rules

- [ ] LFL-0.1 Record existing owners for execution receipts, Kanban, QAS/Tang, QLoRA/KV-cache research, MCP/gRPC, llama-server, Kafka initiative, and tensor-head routing.
- [ ] LFL-0.2 Add a static audit proving no new training writer bypasses `ExecutionReceipt`/validation evidence.
- [ ] LFL-0.3 Deprecate fail-open P7 readiness claims; audits must not use `|| true` or assume success when Postgres/Redis/model checks fail.
- [ ] LFL-0.4 Require every learned artifact to carry base-model, tokenizer, prompt-template, dataset-snapshot, and producer revisions.

Gate: no training/evaluation path may claim `PROVEN` when a required dependency is missing or unqueryable.

---

## LFL-1 — Canonical execution receipt bridge

- [ ] LFL-1.1 Define `ExecutionLearningRecordV1` derived from the existing agent/workflow `ExecutionReceipt`.
- [ ] LFL-1.2 Carry `runId`, `taskId`, `attempt`, `workspaceRevision`, selected packet/source refs, tool calls, mutation refs, validation refs, model/adapter route, latency/token/GPU costs.
- [ ] LFL-1.3 Distinguish `SUCCESS`, `FAILED`, `BLOCKED`, `PARTIAL`, and `REJECTED` trajectories.
- [ ] LFL-1.4 Require executable validation for positive SFT eligibility.
- [ ] LFL-1.5 Preserve failed/rejected records for preference/reward/RL datasets with explicit labels.
- [ ] LFL-1.6 Redact secrets/private runtime material before dataset eligibility.

Gate: a checked Kanban task or model-generated answer without a successful validation receipt MUST NOT become a positive SFT example.

---

## LFL-2 — Revisioned train/eval dataset snapshots

- [ ] LFL-2.1 Define `TrainingDatasetSnapshotV1` with immutable record refs and checksum.
- [ ] LFL-2.2 Split by repository/workspace revision and task family to prevent near-duplicate leakage.
- [ ] LFL-2.3 Produce explicit `train`, `validation`, `heldout` manifests.
- [ ] LFL-2.4 Add dataset statistics by error class, domain, tool family, mutation kind, success/failure label.
- [ ] LFL-2.5 Add source provenance and license/privacy eligibility flags.
- [ ] LFL-2.6 Preserve retrieval/ranking features used during the originating execution as optional training features, never as canonical labels.

Gate: the same record identity cannot occur in both train and held-out partitions.

---

## LFL-3 — Ornith 9B trainable-base gate

- [ ] LFL-3.1 Preserve the served GGUF identity as inference evidence only.
- [ ] LFL-3.2 Locate/prove a compatible non-GGUF trainable checkpoint for Ornith 9B or explicitly mark `TRAINABLE_BASE_UNAVAILABLE`.
- [ ] LFL-3.3 Freeze architecture/tokenizer/chat-template/context/license digests for the trainable base.
- [ ] LFL-3.4 Prove adapter target modules against the actual architecture; do not copy Gemma module names onto Qwen/Qwen3.5-derived checkpoints.
- [ ] LFL-3.5 Record whether gradient checkpointing, flash/SDPA attention, BF16/FP16, and 4-bit training are supported on the workstation path.

Gate: no QLoRA run starts from the served GGUF artifact.

---

## LFL-4 — QLoRA / PEFT adapter creation

- [ ] LFL-4.1 Define `AdapterTrainingPlanV1` from a frozen dataset snapshot and base-model revision.
- [ ] LFL-4.2 Use PEFT/LoRA over a supported quantized training base; base weights remain frozen.
- [ ] LFL-4.3 Select target modules/ranks from measured parameter/VRAM budgets, not hard-coded architecture assumptions.
- [ ] LFL-4.4 Enable non-reentrant gradient checkpointing when required by the 8-GB envelope and record it.
- [ ] LFL-4.5 Add deterministic seed/config capture.
- [ ] LFL-4.6 Emit `AdapterTrainingReceiptV1` with adapter checksum, selected modules/ranks, trainable parameter count, peak VRAM/host memory, quantization/checkpointing mode, training/validation metrics.
- [ ] LFL-4.7 Store adapter artifact separately from GGUF/model-cache artifacts.

Gate: adapter artifact checksum + training receipt + dataset snapshot must all exist before evaluation.

---

## LFL-5 — Supervised/held-out evaluation

- [ ] LFL-5.1 Define `AdapterEvaluationReceiptV1`.
- [ ] LFL-5.2 Evaluate baseline model and candidate adapter on the exact same held-out snapshot.
- [ ] LFL-5.3 Measure tool-call JSON validity, exact-promotion grounded accuracy, bounded repair success, compile/test success, hallucination/unsupported-claim rate, regression rate, latency/tokens/VRAM.
- [ ] LFL-5.4 Include retrieval/reranking ablations: deterministic baseline vs candidate learned route.
- [ ] LFL-5.5 Require statistically/operationally meaningful held-out improvement before promotion.
- [ ] LFL-5.6 Emit explicit `PROMOTE`, `REJECT`, or `MORE_EVIDENCE_REQUIRED` decision.

Gate: train-set loss improvement alone is never sufficient for promotion.

---

## LFL-6 — Gymnasium / TorchRL policy environment

- [ ] LFL-6.1 Wrap the existing finite `ppo_policy_env.py` action/reward boundary in a Gymnasium-compatible environment.
- [ ] LFL-6.2 Observation includes revision-qualified query/candidate/resource/execution features only.
- [ ] LFL-6.3 Action space remains finite: lexical/semantic/graph expansion/rerank/source inspection/patch/compile/test/recover/terminate.
- [ ] LFL-6.4 Offline/replay mode resolves tool outcomes from immutable execution receipts; it must not mutate the live repository.
- [ ] LFL-6.5 Add TorchRL Collector + complete-trajectory replay-buffer fixture.
- [ ] LFL-6.6 Add PPO shadow training/evaluation; policy writes remain disabled.
- [ ] LFL-6.7 Compare deterministic/Tang policy vs PPO policy using identical held-out episodes.

Gate: PPO remains `SHADOW_ONLY` until it beats deterministic policy on success/cost without increasing invalid actions.

---

## LFL-7 — Tang/QAS and tensor-head feedback

- [ ] LFL-7.1 Persist which Tang lifecycle policy/QAS sample revision was used per run.
- [ ] LFL-7.2 Persist selected deterministic/tensor-head route plus shadow MoE heads.
- [ ] LFL-7.3 Preserve signed-S3/quaternion/Jacobian/Hilbert features as optional derived inputs; never turn geometry into identity.
- [ ] LFL-7.4 Train XGBoost/logistic/PyTorch routing challengers from the same immutable feature snapshots.
- [ ] LFL-7.5 Emit one learned routing feature/decision, not one vote per executor.

Gate: CPU/CUDA implementations of one classifier/head remain one logical signal.

---

## LFL-8 — llama-server MTP/drafter evaluation

- [ ] LFL-8.1 Record llama-server version, target model revision, draft/MTP type, draft length, probability thresholds, draft KV types and CPU/GPU offload settings.
- [ ] LFL-8.2 Prove Ornith architecture actually exposes compatible NextN/MTP tensors before selecting `draft-mtp`.
- [ ] LFL-8.3 Test baseline `none`, draftless n-gram, draft-simple where compatible, and `draft-mtp` only where the model supports it.
- [ ] LFL-8.4 Measure accepted/drafted tokens, acceptance rate, p50/p95 token latency, tokens/sec, peak VRAM, correctness equality after target verification.
- [ ] LFL-8.5 Feed MTP acceptance into `MtpStatePolicyV1`; target verification remains authoritative.

Gate: unsupported MTP architecture must fall back without changing canonical generated-token semantics.

---

## LFL-9 — DeepSpeed / training runtime challenger

- [ ] LFL-9.1 Treat DeepSpeed as an optional training executor, not a model/training-objective owner.
- [ ] LFL-9.2 Benchmark plain Transformers/PEFT single-GPU training first.
- [ ] LFL-9.3 Only enable ZeRO/offload if the measured 8-GB VRAM/host-memory envelope requires it and the trainable checkpoint supports the path.
- [ ] LFL-9.4 Record optimizer/parameter/CPU/NVMe offload settings and throughput/memory effects in `AdapterTrainingReceiptV1`.
- [ ] LFL-9.5 Reject configurations whose offload latency makes workstation training impractical relative to the baseline.

Gate: DeepSpeed is `CHALLENGER` until it improves feasible training capacity or wall-clock efficiency on the actual workstation.

---

## LFL-10 — Kanban + agentic error workflow integration

- [ ] LFL-10.1 Link canonical task/run/attempt IDs from Kanban projection to learning records.
- [ ] LFL-10.2 Surface dataset eligibility and latest validation/training/eval refs on task cards without making Kanban truth owner.
- [ ] LFL-10.3 Feed failed agentic repair attempts into negative/preference/RL datasets.
- [ ] LFL-10.4 Feed successful validated repair trajectories into SFT eligibility.
- [ ] LFL-10.5 Preserve human review/rejection as a separate label.

Gate: Kanban status alone never determines training label.

---

## LFL-11 — MCP / gRPC replay environment

- [ ] LFL-11.1 Reuse existing MCP typed-tool registry and gRPC tool router.
- [ ] LFL-11.2 Store canonical tool name, input checksum/keys, output/evidence refs, latency, status, and side-effect classification in learning records.
- [ ] LFL-11.3 For offline eval/RL, replay tool results from receipts rather than issuing live mutations.
- [ ] LFL-11.4 Reuse gRPC channels/stubs and use streaming only for genuinely long-lived logical flows.
- [ ] LFL-11.5 Preserve cancellation/deadline propagation through agent/workflow/tool boundaries.

Gate: an offline training/eval run must be reproducible without requiring live MCP mutations.

---

## LFL-12 — Kafka / CDC projection

- [ ] LFL-12.1 Keep PostgreSQL + outbox authoritative.
- [ ] LFL-12.2 Define projection events for execution, dataset eligibility, adapter training, adapter evaluation, model-route activation.
- [ ] LFL-12.3 Implement Kafka/Debezium only under `PA-KAFKA-001`; do not duplicate event ownership here.
- [ ] LFL-12.4 Include canonical IDs/revisions/checksums so consumers can reject stale/out-of-order events.
- [ ] LFL-12.5 Add replay/idempotency proof before enabling downstream training consumers.

Gate: loss/reordering of Kafka events cannot corrupt canonical training/evaluation state.

---

## LFL-13 — Promotion and model routing

- [ ] LFL-13.1 Define adapter/model-route activation record with baseline/candidate evaluation receipt refs.
- [ ] LFL-13.2 Extend model routing so a request records the exact base-model + adapter revision actually used.
- [ ] LFL-13.3 Warm/load/unload adapters under the existing GPU lease/residency policy.
- [ ] LFL-13.4 Add rollback to prior adapter/model route.
- [ ] LFL-13.5 Feed subsequent execution outcomes back to the outcome ledger by adapter revision.

Gate: every live adapter decision is reversible and attributable to a promotion receipt.

---

## LFL-14 — Final end-to-end proof

Choose at least five historical Parent Atlas tasks spanning compiler error, unit-test failure, schema/migration error, retrieval/reranker error, and runtime/tool failure.

For every fixture prove:

- [ ] canonical task/evidence identity
- [ ] execution receipt + executable validation
- [ ] training/reward eligibility label
- [ ] immutable train/eval partition
- [ ] baseline evaluation
- [ ] candidate QLoRA or policy training receipt
- [ ] held-out evaluation receipt
- [ ] promotion/rejection decision
- [ ] model/adapter route selection receipt
- [ ] subsequent execution receipt with exact model/adapter revision
- [ ] Kanban projection update
- [ ] optional Kafka projection parity

Final gate: Parent Atlas may declare the learning feedback loop `PROVEN` only after a promoted candidate improves held-out bounded task success without materially increasing invalid mutations, unsupported claims, or resource-policy violations.
