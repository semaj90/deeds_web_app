# CUDA / RTX / cuTile Index

> Navigation only. Owners and status come from `docs/architecture/runtime-ownership-registry.json`.

## Environments

| Lane | Location | Contents | Status |
|---|---|---|---|
| cuTile / TileIR (WSL2) | `/home/james/.venvs/atlas-cutile-cu132` | `cuda-tile 1.5.0`, `cupy-cuda13x 14.2.0`, `nvidia-cuda-tileiras 13.2.78` | IMPORT_PROVEN |
| RAPIDS / cuVS (WSL2) | `/home/james/miniforge3/envs/atlas-rapids-cu13` | cuVS KMeans executor | Free `:8090` first |
| Host driver | Windows | NVIDIA 580.88, RTX 3060 Ti, SM 8.6 | Meets R580+ |

## Probes and owners

| File | Role | Owner class | Status |
|---|---|---|---|
| `python/atlas_cuda_cutile_simt_gemm_probe_v1.py` | cuTile vs PyTorch SIMT FP16 GEMM: parity and timing | Owner for GEMM parity (needs `torch`) | Not run in cutile venv (no torch) |
| `python/atlas_cuda_cutile_simt_probe_v1.py` | cuTile toolchain smoke: `vector_add_kernel` plus a tiny GEMM pair | Owner for toolchain smoke | Receipt below was produced by identical kernel code before consolidation; rerun this owner to re-attribute |
| `python/atlas_gemma_rank_cuda_forward_probe_v1.py` | CUDA forward probe for AtlasGemmaRankV1 | Experiment | Not promoted |
| `python/atlas_compute/rff_transform.py` | RFF challenger transform (Gaussian RBF approximation, receipt type, exact reference) | EXPERIMENT owner; untracked WIP | `python/tests/test_rff_transform.py` 5/5 OK in rapids env |
| `scripts/atlas/streaming-graph-indexer.mjs` | Bounded NDJSON streaming for large graph files | Existing owner; untracked | Referenced by two OpenSpec tasks; no fixture test found |

## Receipts

| Receipt | Proves | Git status |
|---|---|---|
| `.tmp/atlas/cutile-owner-probe-receipt-v1.json` | Owner probe rerun 2026-10-13: cuTile vector add finite and correct, FP16 SIMT GEMM finite, tileiras 13.2.78, torch 2.14.0+cu132 | Ignored (local evidence) |
| `.tmp/atlas/cutile-gpu-smoke-v1.json` | SUPERSEDED: vector add from archived duplicate (same pattern, not the owner) | Ignored |
| `docs/reports/atlas-gemma-rank-cuda132-real-batch-probe-v1.json` | CUDA 13.2 real-batch probe | Tracked |

## Rules

- GEMM performance comparisons use `atlas_cuda_cutile_simt_gemm_probe_v1.py`; do not add a second GEMM owner.
- Do not run any cuTile or CUDA job while `:8090` (Ornith) is loaded; free it through the documented task first.
- cuTile is a challenger lane. It does not replace cuBLASLt, cuVS, or LibTorch ownership.
- GPU admission (VRAM budget, CPU parity, receipt) is required before any deployment.
