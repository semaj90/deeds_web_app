# Parent Atlas Training Configuration Tournament — Task Addendum

This addendum extends LFL-4/LFL-9. It does not replace the main `tasks.md` owner.

## TO-0 — Freeze categorical vs surrogate coordinates

- [x] Define `TrainingExecutionCandidateV1` with categorical ZeRO stage/optimizer/offload/checkpointing/PEFT choices.
- [x] Define `TrainingConfigurationSurfaceV1` for measured proposal-only interpolation.
- [x] Forbid fractional/interpolated ZeRO stages.
- [x] Require stage 3 for parameter offload.
- [x] Record PagedAdamW8bit and DeepSpeedCPUAdam as different optimizer implementations.
- [x] Record LoRA-FA separately from ordinary LoRA/QLoRA.

Gate: categorical runtime decisions are enumerated and executed exactly; only measured numeric coordinates enter the surrogate.

## TO-1 — Coarse exact tournament

- [x] Add `buildTrainingTournament()` reference policy.
- [ ] Prove the actual Ornith trainable checkpoint and architecture-specific target modules.
- [ ] Measure rank grid, learning-rate grid, microbatch and gradient-accumulation grid on a tiny frozen dataset snapshot.
- [ ] Benchmark plain PEFT/QLoRA + PagedAdamW8bit before DeepSpeed.
- [ ] Benchmark DeepSpeedCPUAdam with CPU optimizer offload only if the baseline cannot satisfy VRAM or throughput goals.
- [ ] Benchmark ZeRO-3 CPU parameter offload only after optimizer-only offload.
- [ ] Benchmark NVMe offload last.

Gate: every measured point has `AdapterTrainingReceiptV1` with held-out metrics, peak VRAM/RAM/NVMe, samples/sec and step time.

## TO-2 — Pareto frontier

- [x] Add `paretoTrainingResults()` reference helper.
- [ ] Persist exact measured fronts for each categorical stratum.
- [ ] Reject lowest-VRAM-only selection; retain quality/throughput/memory/time trade-offs.
- [ ] Add explicit workstation deployment objective for interactive vs overnight training.

Gate: the chosen baseline is a Pareto-supported configuration, not merely the smallest VRAM configuration.

## TO-3 — 3D measured surface

- [x] Add `python/parent_atlas_training_surface.py` using SciPy `RegularGridInterpolator`.
- [x] Require a complete rectilinear measured grid before interpolation.
- [x] Require >=4 points on every axis before cubic mode.
- [x] Normalize axes before interpolation.
- [x] Emit only `UNPROVEN_PROPOSAL` points.
- [ ] Choose the third axis for each experiment: effective batch, gradient accumulation, or normalized memory budget.
- [ ] Execute the top proposed points and compare prediction error against actual receipts.
- [ ] Downgrade to linear interpolation when cubic data requirements are not satisfied or ringing/instability is observed.

Gate: surrogate accuracy is itself receipted; no adapter is promoted from predicted metrics.

## TO-4 — Optimizer/offload proof

- [ ] Measure PagedAdamW8bit optimizer-state memory and page-fault/offload behavior.
- [ ] Measure DeepSpeedCPUAdam wall-clock and CPU-memory cost on the actual Intel host.
- [ ] Record optimizer offload CPU vs NVMe separately from parameter offload.
- [ ] Verify DeepSpeed optimizer offload stages 1/2/3 and parameter offload stage 3 against the installed version.
- [ ] Record NVMe path/device, sequential throughput, host-memory cache, pin-memory settings and offloaded byte counts.

Gate: no assumed 5–7x CPUAdam speedup is written into policy; only workstation measurements are used.

## TO-5 — Adapter-structure search

- [ ] Compare architecture-proved targeted modules vs QLoRA `all-linear`.
- [ ] Compare LoRA ranks and Rank-Stabilized LoRA where applicable.
- [ ] Compare LoRA-FA when rank/activation memory becomes limiting.
- [ ] Keep adapter quality evaluation on the same held-out snapshot.

Gate: adapter structure is selected from measured quality/resource trade-offs and not copied from another architecture.

## TO-6 — Final training-plan integration

- [ ] Link selected `TrainingExecutionCandidateV1` to `AdapterTrainingReceiptV1.trainingExecutionCandidateId`.
- [ ] Link surrogate-originated experiments to `trainingConfigurationSurfaceId`.
- [ ] Surface the current Pareto winner in Kanban as recommendation/evidence only.
- [ ] Route training through the existing GPU lease/environment receipt layer.
- [ ] Feed completed measurements to the learning-feedback outbox/Kafka projection only after Postgres commit.

Final gate: Parent Atlas may label a training configuration `PROVEN_WORKSTATION_BASELINE` only when its exact receipt, held-out evaluation, resource envelope and reproducibility checks are all present.
