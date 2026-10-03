# TensorRT-RTX — Windows Prerequisites

Source: https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/installing-tensorrt-rtx/prerequisites.html
Fetched: 2026-09-27 (via WebFetch, small-model extraction — see README.md caveat)

## CUDA Toolkit

- CUDA 12.9 Update 1 **or** CUDA 13.4 installed.
- Separate packages per CUDA major version — do not mix.
- For this repo's challenger lane: **CUDA 13.4** (matches the "TensorRT-RTX 1.6 for July 2026"
  direction recorded in root CLAUDE.md).

## GPU driver

Must meet the minimum driver requirement for the chosen CUDA Toolkit release (see NVIDIA's
official driver requirements page — not re-fetched here).

## Supported hardware

NVIDIA RTX GPU, Turing (compute capability 7.5) or later. RTX 2000/3000/4000/5000-series are
given as examples — the RTX 3060 Ti (Ampere, sm_86) qualifies.

## Python (optional — only needed if using the Python bindings)

- 3.10-3.14 recommended for prebuilt wheels.
- 3.8-3.9 also supported.
- Windows on ARM: 3.11-3.14 only (not relevant to this x64 host).

## Not found in this fetch

MSVC version, CMake version, and C++ standard requirements for Windows compilation were not
present in the extracted content — check the live page directly, or infer from a real build
attempt, before scaffolding a CMake preset.

## Installation method (summary — full detail in `installation-windows.md`)

Two options on Windows:
1. **SDK zip** — manual `PATH` configuration (headers/libs extracted locally).
2. **PyPI** — `pip install tensorrt-rtx` for the Python bindings only.

This repo's native N-API addon (`simd-bridge/cpp/`) would use option 1 (SDK zip), matching how
it already resolves LibTorch/CUDA/cuVS/CUTLASS via `CMakeLists.txt`'s env-var-first,
glob-fallback pattern.
