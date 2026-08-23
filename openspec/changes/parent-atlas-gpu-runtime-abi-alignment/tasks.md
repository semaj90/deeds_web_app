# Parent Atlas GPU runtime / ABI alignment tasks — 2026-08-22

Status vocabulary: `PROVEN`, `IMPLEMENTED_UNPROVEN`, `PENDING`, `BLOCKED`, `CHALLENGER_ONLY`.

## 0. Frozen ownership rules

- [x] 0.1 Keep the existing Windows PyTorch `2.8.0+cu128` RTX 3060 Ti GEMM parity receipt exactly as proven. Do **not** relabel it CUDA 13 merely because a system CUDA 13 toolkit is installed.
- [x] 0.2 Treat these as independent receipt fields: driver version, system toolkit (`nvcc`) version, framework-bundled CUDA runtime, compiler toolkit used for native extensions, and library versions.
- [x] 0.3 Keep RAPIDS/cuVS/cuGraph in the activated WSL2 `atlas-rapids-cu13` environment. Plain non-login `wsl python` is not evidence for that environment.
- [x] 0.4 Keep CUTLASS independent from cuTile. CUTLASS SM86 real-target kernels do not require migrating every other GPU lane to CUDA 13.
- [x] 0.5 Shared memory is a kernel resource/launch property, **not** an ABI compatibility mechanism.
- [x] 0.6 Checkpointing/recomputation is a runtime/memory policy, **not** an ABI compatibility mechanism.

## 1. Correct cuTile target gate

- [ ] 1.1 Create or activate a dedicated cuTile proof environment. For RTX 3060 Ti / SM86, require the Ampere-capable cuTile release path (`cuTile >= 1.2.0`) and CTK target support appropriate to that release (CTK 13.2+ for the documented Ampere/Ada feature introduction).
- [ ] 1.2 Record the actual `cuda-tile`, `tileiras`, compiler toolkit, driver, GPU, and compute capability versions in a `GpuRuntimeAbiV1` receipt.
- [ ] 1.3 Compile and execute one bounded SM86 tile kernel on the real RTX 3060 Ti. Compile-only success is insufficient.
- [ ] 1.4 Compare output against the same CPU/PyTorch numerical reference used by the hardware-specialization lane and emit `KernelPerfReceiptV1` with `measurement_kind=real_target`, `estimator=NONE`.
- [ ] 1.5 Record requested/shared-memory bytes and measured VRAM/workspace. Do not infer support from architecture tables alone.
- [ ] 1.6 Keep FP8 disabled/unsupported for this SM86 cuTile proof unless a later NVIDIA release explicitly changes the target support.

## 2. RAPIDS / CUDA version reconciliation

- [ ] 2.1 Re-run the activated WSL runtime census using `source ~/miniforge3/etc/profile.d/conda.sh && conda activate atlas-rapids-cu13` and record: `torch`, framework CUDA runtime, `nvcc`, cuVS, cuGraph, cuDF, CuPy, cuBLAS, cuDNN, GPU, and driver.
- [ ] 2.2 Distinguish the framework/runtime actually used by RAPIDS from a separately installed `nvcc`. A Conda environment that imports cuVS/cuGraph successfully is not automatically proven against every visible compiler toolkit version.
- [ ] 2.3 Check the installed RAPIDS 26.06 package build metadata against NVIDIA's supported CUDA range before calling a CUDA 13.3 pairing supported. If the environment uses runtime packages compatible with 13.0–13.2 while `nvcc` reports 13.3, record those as separate facts rather than collapsing them to `RAPIDS 26.06 CUDA 13.3`.
- [ ] 2.4 Re-run bounded cuVS exact and CAGRA same-corpus receipts after the runtime census. CAGRA remains available through cuVS, not a separate package owner.

## 3. Node-API / LibTorch ABI bridge

- [x] 3.1 Record the architectural rule: Node-API provides an ABI-stable **Node-facing C API**; it does not make external libraries such as LibTorch transitively ABI-stable.
- [ ] 3.2 If implementing a Node native bridge, use Node-API (`node_api.h` / `node-addon-api`) rather than direct V8/Node C++ APIs for the JavaScript-facing boundary.
- [ ] 3.3 Freeze the Node-API version used by the addon and prove load/call behavior on the supported Node runtime(s).
- [ ] 3.4 Choose one LibTorch ABI strategy explicitly:
  - `VERSION_PINNED`: build and ship against an exact LibTorch/PyTorch version and rebuild when that ABI changes; or
  - `LIMITED_STABLE_ABI`: require a PyTorch release that exposes the limited stable LibTorch ABI and restrict the extension to that supported stable API subset.
- [x] 3.5 Do **not** treat `PyTorch >= 2.6` as sufficient evidence for the limited stable LibTorch ABI. PyTorch 2.8 introduced the limited stable LibTorch ABI surface for third-party C++/CUDA extensions; later releases expand it.
- [ ] 3.6 Add a native bridge receipt that records Node-API version, LibTorch version, LibTorch ABI mode, compiler ABI/runtime, CUDA runtime, and real call parity.

## 4. C / C++ / CUDA boundary

- [ ] 4.1 Keep the external ABI surface minimal and C-shaped where practical: opaque handles + POD descriptors + explicit status codes. Do not expose `torch::Tensor` C++ object layout across a Node-API ABI boundary unless using the limited stable LibTorch ABI deliberately.
- [ ] 4.2 Pass artifact descriptors (`dtype`, `shape`, `offset`, `checksum`, `revision`) or bounded host buffers across the Node boundary. Do not make raw CUDA pointers canonical identity.
- [ ] 4.3 For same-process kernels, benchmark pinned host memory + bounded H2D first. Treat CUDA IPC as a later, separately governed transport because pointer/allocation lifetime is a distinct ownership problem.
- [ ] 4.4 If a C API shim is added around LibTorch/CUDA, add ABI smoke tests that load the binary, inspect exported symbols/version receipt, execute one bounded GEMM, and compare against the CPU/PyTorch reference.

## 5. Shared-memory / kernel specialization proof

- [ ] 5.1 Extend real-target receipts with shared-memory bytes, registers/thread when available, workspace bytes, and launch shape for cuTile/CUTLASS/custom CUDA kernels.
- [ ] 5.2 Benchmark at least one representative CandidateFeature GEMM `[B,F] x [F,H]` on SM86 through the already-governed candidates: PyTorch/cuBLASLt baseline, CUTLASS, cuTile, and LibTorch/native bridge only if actually wired.
- [ ] 5.3 CUTLASS analytical heuristics remain disallowed for SM86 promotion; only real-target receipts or separately validated learned/static estimates may advise selection.
- [ ] 5.4 Do not train/promote the SM86 cost model until at least two real-target receipts per candidate backend/problem family exist.

## 6. Checkpointing placement

- [ ] 6.1 Keep PyTorch activation checkpointing only in training/large intermediate workflows where recomputation trades compute for memory. It is not needed for the normal bounded retrieval GEMM just because a native addon exists.
- [ ] 6.2 If checkpointing is tested, record it as execution policy in receipts and compare latency/peak-memory deltas. It must not change canonical candidate identity, feature values, or ABI claims.

## 7. Artifact producers remain higher-priority for SampleQuery evaluation

- [ ] 7.1 Build the three already-mapped real-corpus producers before adding another ANN or kernel backend: `CandidateOrdinalMapV1`, `CandidateFeatureColumnarV1`, and exact `CandidateOrdinalSetV1`.
- [ ] 7.2 Join `docs/reports/xgboost-features.csv` to the semantic parquet by `packet_key`, never row position, using a bounded explicit corpus slice first and failing closed on asymmetric membership.
- [ ] 7.3 Run the existing sample-query readiness audit, then the full evaluation runner only after all three artifacts exist.

## 8. Promotion rule

No new runtime becomes an execution owner merely because it imports, compiles, or exposes a symbol. Promotion requires:

`runtime identity + target support + real SM86 execution + numerical parity + measured receipt + revision-qualified artifact lineage`.

Until then:

- PyTorch `2.8.0+cu128` GEMM = existing proven baseline.
- WSL RAPIDS/cuVS/cuGraph = activated-environment proof lane; re-census before version-label changes.
- CAGRA = cuVS ANN executor/challenger.
- cuTile = `PENDING_REAL_SM86_PROOF`.
- CUTLASS = source/build challenger, `REAL_SM86_RECEIPT_PENDING`.
- LibTorch/Node-API = `ABI_AND_PARITY_PROOF_PENDING`.
