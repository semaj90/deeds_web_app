# TensorRT-RTX — Overview

Source: https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/index.html
Fetched: 2026-09-27 (via WebFetch, small-model extraction — see README.md caveat)

## What it is

TensorRT-RTX is an inference optimization library that "builds on the proven performance of the
NVIDIA TensorRT inference library and simplifies the deployment of AI models on NVIDIA RTX GPUs."
It uses a two-phase compilation approach (AOT + JIT) that "typically completes in under 30
seconds total." Positioned as a compact (<200MB) **drop-in replacement for NVIDIA TensorRT**
targeting NVIDIA RTX GPUs, with just-in-time optimization at runtime rather than requiring full
ahead-of-time pre-compilation.

## Supported GPU architectures

NVIDIA Turing (compute capability 7.5) through NVIDIA Blackwell (compute capability 12.x). The
RTX 3060 Ti (Ampere, sm_86) falls within this range.

## Supported CUDA versions

| TensorRT-RTX version | CUDA version(s) |
|---|---|
| 1.6 | CUDA 13.4, CUDA 12.9 Update 1 |
| 1.5 | CUDA 13.3 |
| 1.4 | CUDA 13.2 |

Separate TensorRT-RTX packages are published per supported CUDA version — do not mix.

## Supported operating systems

- Windows (including Windows on ARM for RTX Spark)
- Linux (including ARM64 Linux SBSA for DGX Spark)

## Getting-started pages referenced by the overview

- Quick Start Guide — `getting-started/quick-start-guide.html`
- Installation Guide — `installing-tensorrt-rtx/installation-overview.html`
- Build Your First Engine — `getting-started/build-your-first-engine.html`
- Prerequisites — `installing-tensorrt-rtx/prerequisites.html`

Not fetched in this pass: Quick Start Guide, Build Your First Engine (not needed yet for a
documentation-only recording step; fetch these before actually building the challenger lane).

Node.js/native-addon bindings are not mentioned anywhere in this overview page.
