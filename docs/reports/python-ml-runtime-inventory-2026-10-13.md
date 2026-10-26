# Python ML Runtime Inventory — 2026-10-13

Read-only package/build inventory from the Windows workspace and configured WSL RAPIDS environment. This records installation and build capability only; it does not claim an XGBoost workload, model training, or production-service integration.

| Runtime | PyTorch | CUDA status | XGBoost | CUDA build |
| --- | --- | --- | --- | --- |
| Windows repo `.venv` (`C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe`) | `2.13.0+cpu` | CPU-only; `torch.cuda.is_available() == false` | `3.2.0` | `USE_CUDA=true`, CUDA `12.9` |
| WSL RAPIDS (`/home/james/miniforge3/envs/atlas-rapids-cu13/bin/python`) | `2.13.0+cu130` | CUDA build `13.0`; `torch.cuda.is_available() == true` | `3.3.0` | `USE_CUDA=true`, CUDA `13.3` |
| Live 8098 graph service | Reported unavailable by `/health` | CUDA available; NVIDIA GeForce RTX 3060 Ti | Not checked in the service process | cuGraph capability `26.08.00`; resident graph `null` |

The Windows C++ LibTorch distribution is separate from Python PyTorch: `C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch`, configured by `simd-bridge/cpp/CMakePresets.json`. The SvelteKit bridge points to `simd-bridge/cpp/build/Release/tensorrt_bridge.node`.

## Verification scope

- Python package paths, versions, and `torch.version.cuda` were queried directly from each interpreter.
- CUDA availability was queried with PyTorch in both Python interpreters; only the WSL RAPIDS environment returned `true`.
- XGBoost `build_info()` reported `USE_CUDA=true` in both interpreters. No XGBoost training, GPU benchmark, or model execution was run.
- The 8098 `/health`, `/v1/graph/capabilities`, and `/v1/graph/resident` endpoints were read only. Service health does not prove an XGBoost/PyTorch workload can be scheduled or that a graph traversal ran.
- No packages were installed or upgraded; no model, database, cache, Qdrant, Neo4j, or GPU workload was changed or launched.
