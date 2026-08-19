---
name: atlas-gemm
description: Run Parent Atlas NumPy/CUDA GEMM parity probes from Prime Agent IPython, optionally spawn focused RLM reviewers, and preserve backend-attestation limits. Use for RTX/Ampere GEMM, cuBLAS/cuBLASLt, TF32/FP16/BF16, SVD/ModFKV preflight, or GPU numerical receipts.
---

# Atlas GEMM

Use this skill from Prime Agent's persistent IPython kernel when Parent Atlas needs a bounded RTX/CUDA GEMM probe or numerical preflight.

## Invariants

- NumPy float64 matmul is the numerical oracle for this probe.
- A requested PyTorch BLAS preference is **not** independent proof of the dispatched kernel/library.
- The CUDA benchmark emits NVTX ranges when available so Nsight/CUPTI can provide later dispatch proof.
- GPU evidence does not create an independent retrieval vote.
- Receipts and child-agent reviews never authorize source mutation.
- An RLM child spawn handle confirms admission only; it is not the child's answer or a validation receipt.

## Direct call

```python
import atlas_gemm
receipt = await atlas_gemm(
    m=1024,
    n=1024,
    k=1024,
    seed=0xA71A5,
    repeats=7,
    require_cuda=True,
)
receipt["gemmReceipt"]["summary"]
```

By default this writes `.atlas/receipts/rtx-gemm.json` and spawns two focused RLM reviewer children. Disable child review when only the local benchmark is wanted:

```python
receipt = await atlas_gemm(spawn_reviewers=False, require_cuda=True)
```

## IPython magic

The project package also exposes an IPython line magic:

```python
%load_ext parent_atlas_tensor.ipython_gemm
r = %atlas_gemm --m 1024 --n 1024 --k 1024 --repeats 7 --require-cuda --output .atlas/receipts/rtx-gemm.json
```

## Profiling for actual backend proof

The benchmark records `preferredBlasRequested` and emits an NVTX range named `parent-atlas::<lane-id>`. Treat `backendDispatchIndependentlyVerified=false` as authoritative until an external profiler trace proves the launched kernel/library.

## Downstream use

Use the GEMM receipt as preflight evidence for:

1. direct-SVD parity (`svd_parity.py`),
2. bounded ModFKV (`modfkv_bounded.py`),
3. future CUTLASS/Triton/cuTile challengers.

Do not feed benchmark results directly into mutation authorization.
