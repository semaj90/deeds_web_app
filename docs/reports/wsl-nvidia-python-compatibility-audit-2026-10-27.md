# WSL NVIDIA Python Environment Audit — 2026-10-27

## Verdict

**All inventoried WSL GPU environments use Python 3.14.6.** This confirms interpreter placement and package importability for the selected stacks; it does not establish a clean dependency audit or a fresh CUDA workload receipt.

## Environment inventory

| Environment | Python | NVIDIA/GPU packages | Evidence |
|---|---:|---|---|
| `/home/james/miniforge3/envs/atlas-rapids-cu13` | 3.14.6 | RAPIDS 26.06 (cuDF, cuGraph, cuML, cuVS and native libraries), CuPy 14.1.1, CUDA toolkit/runtime 13.0, PyTorch 2.13.0+cu130, Triton 3.7.1 | Conda package records and installed distribution metadata; imports of `cudf`, `cupy`, `cugraph`, `cuml`, `cuvs`, `torch`, and `triton` succeeded. `cuda-tile` is not installed in this environment. |
| `/home/james/.venvs/atlas-cutile-cu132` | 3.14.6 | `cuda-tile` 1.5.0 (`Requires-Python >=3.10,<3.15`), CUDA toolkit 13.2.1, tileiras/NVCC/NVRTC 13.2.78, CuPy 14.2.0, PyTorch 2.14.0+cu132, Triton 3.8.0 | Installed metadata; existing CUDA 13.2/cuTile smoke and parity receipts are separately recorded in `openspec/changes/parent-atlas-gpu-runtime-abi-alignment/tasks.md`. RAPIDS libraries are intentionally absent from this isolated venv. |
| `/home/james/.venvs/atlas-dspy-exp` | 3.13.13 | No NVIDIA/CUDA/PyTorch/Triton distributions found | Direct installed-distribution inventory. This is not a GPU environment. |
| `/home/james/miniforge3` (base) | 3.13.13 | No NVIDIA/CUDA/RAPIDS/PyTorch/Triton distributions found | Direct installed-distribution inventory. |
| `/usr/bin/python3` | 3.12.3 | No NVIDIA/CUDA/RAPIDS/PyTorch/Triton distributions found | Direct installed-distribution inventory. |

Conda reports only `base` and `atlas-rapids-cu13`; the two other GPU/DSPy environments are venvs. RAPIDS conda builds use `cuda13_cp311_abi3`, and installed metadata for cuDF/cuGraph/cuML/cuVS requires Python `>=3.11`; the cuTile package explicitly supports Python `<3.15`. These installed build tags and metadata are consistent with Python 3.14.6, and the listed RAPIDS/PyTorch/Triton imports succeeded in the RAPIDS environment. This is local compatibility evidence, not a blanket vendor support guarantee for every future release.

## Caveats / unproven

- `pip check` exits nonzero in `atlas-rapids-cu13`. Some reported missing PyPI names have matching conda packages installed (`cupy`, `libcudf`, `libcugraph`, `libcuml`, `libcuvs`, `librmm`, `libraft`, `libucxx`), so pip-only checks misrepresent the mixed conda/pip environment. However, it also reports `pyarrow 24.0.0` outside the PyPI `cudf` metadata range `<24`, `cuda-core 0.7.0` against `cuda-python`'s `~=1.0.0` requirement, and a malformed `transformers` RECORD/unsupported-platform warning. Imports passing does not clear these packaging inconsistencies.
- `nvidia-smi` sees an RTX 3060 Ti, driver 580.88. A fresh `torch.cuda.is_available()` probe did not return in the bounded observation window and was stopped; **this audit does not prove fresh CUDA availability or launch a GPU workload**.
- `nvcc`, `ptxas`, and `tileiras` were absent from the default WSL shell PATH. The cuTile venv has its own CUDA 13.2 toolchain as recorded in the existing environment ledger; the RAPIDS venv is not the cuTile environment.
- No package was installed or upgraded, and no service, database, cache, index, or GPU workload was changed.

## Commands / evidence scope

Read-only checks used `conda env list`, `conda list`, Python interpreter/version and distribution metadata queries, package imports, `pip check`, and `nvidia-smi`. Reported versions are local inventory evidence. The prior GPU smoke receipts remain the authority for their bounded kernel tests; this audit does not extend those results.

`likely_cause`: GPU dependencies are deliberately split across Python 3.14 RAPIDS and cuTile environments, while mixed conda/pip metadata makes a single pip consistency check noisy and partly unresolved.

`evidence`: this report; `docs/architecture/atlas-python-environment-routing.md`; `openspec/changes/parent-atlas-gpu-runtime-abi-alignment/tasks.md`.

`patch_targets`: environment-routing documentation and GPU runtime OpenSpec evidence ledger.

`safe_next_command`: Review the conflicting RAPIDS dependency metadata with conda package records before changing packages; keep RAPIDS and cuTile environments separate.

`smoke_command`: `wsl -d Ubuntu -u james -- /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python -c "import cudf,cupy,cugraph,cuml,cuvs,torch,triton; print(torch.__version__,torch.version.cuda)"`

`report_path`: `docs/reports/wsl-nvidia-python-compatibility-audit-2026-10-27.md`
