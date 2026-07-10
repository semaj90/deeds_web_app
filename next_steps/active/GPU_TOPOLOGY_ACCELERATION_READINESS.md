# GPU Topology Acceleration Readiness

**Status**: READY_WITH_CORRECTIONS
**Scope**: CUDA 13 / PyTorch / NetworkX backend / cuGraph / cuVS / topology training lane

## Current state

- `.venv` exists and is usable.
- `.venv` currently reports `torch 2.13.0+cpu`.
- `.venv` currently reports `numpy` and `networkx` installed.
- `.venv` does not currently have `cugraph`, `cuvs`, `rapids`, or `cupy`.
- NetworkX backend dispatch is available, but no GPU backend is installed yet.

## Readiness verdict

**Not ready for CUDA topology work yet.**

The missing pieces are package installation and CUDA-enabled torch alignment, not repository structure.

## Smoke gates

1. `npm run atlas:gpu:topology:readiness`
2. `npm run atlas:gpu:networkx-backend:smoke`
3. `scripts/gpu/gpu-stack-alignment-audit.mjs`

## Acceptance criteria

- PyTorch in `.venv` is CUDA-enabled.
- `torch.cuda.is_available()` is true.
- `networkx` can see an installed GPU backend.
- Either `cugraph` or `nx-cugraph` is importable.
- `cuvs` is importable if ANN acceleration is part of the lane.
- The audit writes a report that distinguishes installation gaps from runtime gaps.

## Recommended install order

1. Align CUDA runtime and driver stack.
2. Install a CUDA-enabled PyTorch wheel into `.venv`.
3. Install `cugraph` / `nx-cugraph` for NetworkX backend dispatch.
4. Install `cuvs` only if the ANN lane is being promoted.
5. Re-run the smoke tests before wiring topology clustering.
