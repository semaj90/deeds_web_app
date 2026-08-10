# Parent Atlas GPU Math + Sequence Utilities Bundle

This bundle is designed to be copied into the existing `deeds_web_app` repository.
It does **not** replace the current semantic-768 representation contract, existing
Hilbert owner, existing Viterbi router, or existing PyTorch/LibTorch lane.

## What is included

### 1. Native GEMM lane

`simd-bridge/cpp/gemm/`

- `gemm_contract.h` — stable host-FP32 ABI for FP32 and FP16-accumulate-FP32 GEMM.
- `gemm_dispatch.cpp` — AUTO/CPU/cuBLAS/cuBLASLt/CUTLASS dispatch.
- `gemm_cpu_fallback.cpp` — deterministic reference implementation.
- `cublas_gemm.cu` — direct row-major FP32 SGEMM through cuBLAS.
- `cublaslt_gemm.cu` — FP32 host input -> FP16 device input -> FP32 accumulate/output through cuBLASLt.
- `cutlass_gemm.cu` — explicit optional placeholder; returns BACKEND_UNAVAILABLE until a measured CUTLASS kernel is supplied.
- `gemm_parity_test.cpp` — CPU reference/parity smoke test.
- `CMakeLists.addendum.cmake` — integration fragment for the existing `simd-bridge/cpp/CMakeLists.txt`.

The native ABI intentionally starts with **host FP32 buffers**. That makes parity
simple and safe. It is not the final zero-copy/persistent-device-buffer design.
Benchmark first; only then add resident buffers/streams/graph capture.

### 2. Autoencoder FP32 range + interpolation utilities

`scripts/atlas/ae_fp32_ranges.py`

- finite FP32 validation
- L2 normalization
- per-dimension and global range diagnostics
- robust percentile diagnostics without silently clipping canonical vectors
- LERP
- SLERP for unit-normalized semantic vectors
- interpolation continuity report

`scripts/atlas/train-ae-pytorch-enhanced.py`

A standalone, conservative 768 -> 128 -> 64 -> 128 -> 768 trainer. Default
training remains FP32. Interpolation is **evaluation-only by default**.

Operational contract:

- semantic input: float32, shape `[N, 768]`, finite, L2-normalized
- hidden 128: float32
- latent 64: `tanh`, therefore expected in `[-1, +1]`
- decoder output: `tanh`, therefore expected in `[-1, +1]`
- no clipping to the raw IEEE-754 FP32 numeric extrema
- no synthetic interpolation samples added to the training set unless an explicit
  future ablation proves they help

Use SLERP when evaluating paths between L2-normalized semantic vectors. Use LERP
for latent diagnostics or ordinary affine interpolation.

### 3. Hilbert locality adapter

`scripts/phase85/hilbert-locality-adapter.mjs`

A self-contained 2-D Hilbert index/sort helper. It is an **adapter**, not a new
semantic representation. It should consume an already-justified 2-D projection
or routing coordinate pair. Do not Hilbert-sort raw 768-D semantic vectors and
call the result a manifold.

The repo already has `scripts/phase85/manifold-hilbert-sort.mjs`; wire this helper
into that owner only if it removes duplicated logic or improves testability.

### 4. Viterbi log-space helper

`sveltekit-frontend/src/lib/server/router/viterbi-logspace.ts`

A generic deterministic log-space Viterbi decoder with explicit tie-breaking.
It is intended as a helper for the existing Viterbi/HMM owners, not a competing
router implementation.

### 5. Graphify G13 hang helpers

`sveltekit-frontend/scripts/graphify/`

- `g13-dead-export-index.mjs` — O(import occurrences + export names) set-based
  dead-export helper that requires **actual imported binding names**.
- `stage-profiler.mjs` — emits per-stage timings/counts.

Important: do not reproduce the old `files × everyExportName × substring` scan.
If the indexer only stores module paths in `f.imports`, add imported binding
capture during parsing rather than comparing exported identifiers to path text.

## Recommended integration order

1. Run Python/Node unit tests in this bundle.
2. Integrate `gemm_contract.h` + CPU backend first.
3. Add cuBLAS FP32 and prove parity.
4. Add cuBLASLt FP16 compute and prove parity/error tolerance.
5. Keep existing `torch::mm()` as fallback and benchmark baseline.
6. Integrate AE range diagnostics; do not alter training data distribution.
7. Wire Hilbert adapter only to the existing Hilbert owner.
8. Wire Viterbi helper only to the existing router/HMM owner.
9. Fix Graphify G13 using imported binding names + stage profiling.
10. Defer CUTLASS until a specific shape demonstrates a measurable win.

## Suggested acceptance gates

```text
GEMM_CPU_REFERENCE_PASS
GEMM_F32_CUBLAS_PARITY
GEMM_FP16_CUBLASLT_PARITY_WITH_TOLERANCE
GEMM_BACKEND_FALLBACK_PASS
AE_FP32_FINITE_PASS
AE_768_INPUT_CONTRACT_PASS
AE_INTERPOLATION_EVAL_ONLY_PASS
HILBERT_2D_DETERMINISTIC_PASS
VITERBI_LOGSPACE_DETERMINISTIC_PASS
G13_NO_NxK_EXPORT_SCAN_PASS
GRAPH_STAGE_RECEIPT_PASS
```
