# TensorRT-RTX — Windows Installation (SDK zip method)

Source: https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/installing-tensorrt-rtx/installing.html
Fetched: 2026-09-27 (via WebFetch, small-model extraction — see README.md caveat)

## Download

Download the Windows zip package that matches your CUDA Toolkit version and CPU architecture
from https://developer.nvidia.com/tensorrt-rtx — for this repo's challenger lane, the
**CUDA 13.4, x64** package.

## Extract

Decompress the zip. Contains: core libraries, headers, samples, documentation, Python bindings,
and the `tensorrt_rtx` executable.

## Environment configuration

Add the extracted package's `lib` and `bin` directories to `PATH` (order matters — as given by
NVIDIA's own example):

```powershell
$trtRoot = "C:\path\to\TensorRT-RTX-1.6.0.0"
$env:PATH = "$trtRoot\lib;$trtRoot\bin;$env:PATH"
```

## Verification

```powershell
tensorrt_rtx.exe --help
```

Should resolve and print help output — confirms the CLI/DLLs are on `PATH`.

## CUDA relationship

The docs only say to download the package matching your CUDA Toolkit version — no explicit
`CUDA_PATH` interaction is documented. For this repo's side-by-side plan, `CUDA_PATH` should be
set to the CUDA 13.4 toolkit **only within the TensorRT-RTX challenger build's own shell/preset
scope**, never globally — the existing `windows-x64-cuda-libtorch` CMake preset must keep
resolving CUDA 13.0 unchanged (see root CLAUDE.md's TensorRT-RTX direction-only section).

## CMake integration

**Not documented by NVIDIA for this SDK-zip path.** No `find_package(TensorRTRTX)` module or
CMake config file is mentioned. A future challenger-lane CMake preset will need to resolve
TensorRT-RTX's include/lib directories manually — following the same env-var-first,
glob-fallback pattern `simd-bridge/cpp/CMakeLists.txt` already uses for `LIBTORCH_ROOT`/
`CUVS_ROOT`/`CUTLASS_ROOT` (see that file's "Dynamic path resolution" section), e.g. a new
`TENSORRT_RTX_ROOT` variable. Not implemented in this pass — documentation only.

## Optional Python bindings

Wheel files are included in the extracted package under a predictable per-Python-version path
(not itemized in this fetch). Not relevant to this repo's native N-API addon integration path.
