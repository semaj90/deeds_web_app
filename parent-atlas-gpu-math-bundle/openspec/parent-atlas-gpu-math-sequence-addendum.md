# Parent Atlas GPU Math + Sequence Addendum

## Scope

No new top-level ownership change is required. Treat these files as implementation
material for existing GPU/native acceleration, retrieval/LOD, router/HMM, and
Graphify recovery OpenSpecs.

## Gates

### G1 — direct GEMM contract
- host FP32 ABI frozen
- row-major A[m,k], B[k,n], C[m,n]
- CPU reference passes
- direct FP32 cuBLAS parity against CPU/LibTorch
- cuBLASLt FP16-input/FP32-accumulate parity within explicit tolerance
- existing `torch::mm()` remains fallback

### G2 — AE FP32 ranges
- reject NaN/Inf
- require 768 input dimension
- L2-normalize semantic vectors
- record input/latent/reconstruction percentile ranges
- interpolation remains evaluation-only
- SLERP for unit-sphere semantic path diagnostics
- LERP permitted for latent/affine diagnostics

### G3 — Hilbert
- use only as locality ordering after an explicit low-dimensional projection
- do not claim Hilbert ordering proves non-Euclidean geometry/manifold structure
- reuse existing Hilbert owner

### G4 — Viterbi
- generic log-space helper only
- reuse existing router/HMM owner
- deterministic tie handling
- no Baum-Welch scope creep in this bundle

### G5 — Graphify G13
- remove `files x allExportNames` substring scan
- capture imported binding names during parsing
- exact-name Set/Map pass
- stage timing receipt
- do not confuse module paths with imported identifiers

## Deferred

- CUTLASS kernel tuning
- persistent device buffers / CUDA Graph GEMM replay
- interpolation-based AE augmentation
- learned 4-D geometry / JVP / VJP
- KMeans/SOM coupling to token boundaries
- Baum-Welch router training
