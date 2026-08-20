---
name: parent-atlas-gemm
description: Run read-only Parent Atlas RTX CUDA GEMM, SVD-parity, and bounded low-rank probes from Prime Agent's persistent IPython RLM kernel. Use for cuBLAS/cuBLASLt comparisons, TF32/FP16/BF16 numerical parity, CUDA attestation, or GPU evidence receipts. Never treat backend preference as kernel-dispatch proof and never authorize source mutation from these receipts.
---

# Parent Atlas GEMM

This is a Python-backed Prime Agent skill for the Parent Atlas numerical/GPU evidence lane.

## Invariants

- NumPy float64 matmul is the CPU numerical oracle for GEMM parity.
- `cublas` / `cublaslt` are PyTorch backend **preferences**, not independent kernel-dispatch proof.
- TF32, FP16 and BF16 challengers are executor variants, not independent retrieval votes.
- GPU-unavailable results stay `UNAVAILABLE`; never upgrade them to PASS.
- Receipts are evidence only: `canonicalWritesAllowed=false` and they may not authorize mutation.

## Prime/RLM usage

Prime Agent exposes Python-backed skills in the persistent IPython kernel. Call:

```python
await parent_atlas_gemm("attest")
```

Run a bounded GEMM suite:

```python
receipt = await parent_atlas_gemm(
    "gemm",
    m=1024,
    n=1024,
    k=1024,
    seed=0xA71A5,
    repeats=7,
)
```

Require an actual CUDA-visible runtime:

```python
receipt = await parent_atlas_gemm("gemm", require_cuda=True)
```

Run direct-SVD CPU/GPU parity fixtures:

```python
svd = await parent_atlas_gemm("svd", require_cuda=True)
```

The skill deliberately does not expose a mutation operation.

## Environment

For the RTX workstation, prefer starting Prime Agent with a Python environment that already contains the project's CUDA PyTorch build. If `PRIME_AGENT_KERNEL_PYTHON` is used, that interpreter must already provide Prime Agent runtime dependencies plus NumPy/PyTorch.

The skill locates the repository's `sveltekit-frontend/python` package at runtime; it does not vendor or duplicate Parent Atlas numerical code.
