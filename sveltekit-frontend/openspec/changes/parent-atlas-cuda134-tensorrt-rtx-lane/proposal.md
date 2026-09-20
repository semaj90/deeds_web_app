## Why

Operator direction 2026-09-20 (pasted vendor summary, NOT independently verified in this repo yet): TensorRT-RTX 1.6
reportedly supports CUDA 13.4 and CUDA 12.9 Update 1 and recommends CUDA 13.4 for fresh installs; the RTX 3060 Ti is
Ampere SM 8.6. This change adds a **TensorRT-RTX executor lane** on a CUDA 13.4 host toolchain. It is documentation and
gating only: no toolkit, driver, package, image or Docker change is made by this change.

The lane must NOT destabilize the two admitted environments:

- `atlas-gpu-8098` (RAPIDS cuDF/cuGraph/cuML/cuVS) keeps its admitted CUDA-major environment. RAPIDS is distributed as CUDA-major
  containers; a system CUDA 13.4 toolkit is not assumed ABI-compatible with it.
- `atlas-neural-decoder` (PyTorch 2.13 / cu132) keeps its admitted environment.

TensorRT-RTX is an inference executor (small ONNX classifiers, rerank/inference challengers). It is not a retrieval owner, not an
identity owner, and not a replacement for cuVS/cuGraph/PyTorch.

## What Changes

- Add a gated proof ladder (CUDA134-HOST-01/02, TRTRTX-01..05) ending in `TENSORRT_RTX_CUDA134_PROVEN`.
- Require engines/caches to be rebuilt on any TensorRT-RTX or CUDA change; old receipts are never reused across versions.
- Record split-runtime ownership so no single "everything CUDA" image is created again.

## Non-Goals

- No installs, upgrades or Docker/image removals under this change (those need explicit operator approval per step).
- No promotion of any TensorRT-RTX output to canonical authority; results are challenger evidence only.
- No change to embedding policy: `semantic_768` stays primary; 512/256/128 are derived MRL truncations and `latent_256/128/64` are derived autoencoder lanes.

## Impact

Affected docs/specs only: this change's `tasks.md` and `specs/tensorrt-rtx-executor`. Related: `parent-atlas-gpu-mini-fabric-01`, `docs/reports/runtime-capability-registry-v1.json` (DEPENDENCY-CAPABILITY-GUARD-01 applies).
