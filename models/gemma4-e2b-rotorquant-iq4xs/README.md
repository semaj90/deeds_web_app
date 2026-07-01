---
license: apache-2.0
base_model: google/gemma-4-E2B-it
tags:
  - gguf
  - rotorquant
  - kv-cache-quantization
  - gemma
  - gemma4
  - edge
  - instruct
  - llama-cpp
  - quantized
library_name: gguf
pipeline_tag: image-text-to-text
---

# gemma-4-E2B-it-RotorQuant-GGUF-IQ4_XS

GGUF IQ4_XS weight-quantized variant of [google/gemma-4-E2B-it](https://huggingface.co/google/gemma-4-E2B-it) optimised for use with **RotorQuant** KV cache compression via a dedicated llama.cpp fork.

> **Important:** RotorQuant KV cache types (`planar3`, `iso3`) are **not** available in upstream llama.cpp, standard Ollama, or LM Studio.
> They require a [specific llama.cpp fork](https://github.com/johndpope/llama-cpp-turboquant/tree/feature/planarquant-kv-cache).
> The GGUF file itself is a standard GGUF and works with any llama.cpp-compatible runtime using normal KV cache types (f16, q8_0, q4_0, etc.).

## Hardware compatibility

| Device | VRAM / RAM | Recommendation |
| --- | --- | --- |
| CPU host with ≥8 GB RAM | ~1.1 GB | works via llama.cpp; slower than GPU but no accelerator required |
| Apple Silicon (Metal) | ~1.2 GB | llama.cpp Metal backend; fast on M-series unified memory |
| NVIDIA GPU (partial offload) | split between GPU + RAM | offload as many layers as VRAM allows; rest on CPU |

## Overview

This model combines two independent compression techniques:

| Technique | What it does | Requirement |
|-----------|-------------|-------------|
| **GGUF IQ4_XS weight quantization** | Reduces model size from ~4 GB (BF16) to ~1.0 GB | Any llama.cpp-compatible runtime |
| **RotorQuant KV cache compression** — block-diagonal Clifford-algebra rotors for 3-bit KV cache (`--cache-type-k iso3 --cache-type-v iso3`) | Block-diagonal rotations / random rotation for compressed KV cache | [llama-cpp-turboquant fork](https://github.com/johndpope/llama-cpp-turboquant/tree/feature/planarquant-kv-cache) only |

## Quickstart

### Option A — With RotorQuant KV cache (fork required)

You must build from the RotorQuant-enabled llama.cpp fork:

```bash
# Clone and build the fork
git clone https://github.com/johndpope/llama-cpp-turboquant.git
cd llama-cpp-turboquant && git checkout feature/planarquant-kv-cache

# CUDA (Windows/Linux)
cmake -B build -DGGML_CUDA=ON -DCMAKE_BUILD_TYPE=Release && cmake --build build -j

# Metal (Apple Silicon)
cmake -B build -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DCMAKE_BUILD_TYPE=Release && cmake --build build -j

# Run with RotorQuant KV cache
./build/bin/llama-cli -m gemma-4-E2B-it-RotorQuant-GGUF-IQ4_XS.gguf \
  --cache-type-k iso3 --cache-type-v iso3 \
  -ngl 99 -fa \
  -p "Explain quantum computing"

# Or run as a server
./build/bin/llama-server -m gemma-4-E2B-it-RotorQuant-GGUF-IQ4_XS.gguf \
  --cache-type-k iso3 --cache-type-v iso3 \
  -ngl 99 -fa --jinja
```

### Option B — With standard llama.cpp / LM Studio / Ollama

The GGUF works as a normal quantised model. You won't get RotorQuant-specific KV cache benefits, but standard KV cache quantization (q8_0, q4_0) still reduces VRAM significantly.

**llama.cpp (upstream)**
```bash
llama-cli -m gemma-4-E2B-it-RotorQuant-GGUF-IQ4_XS.gguf \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  -ngl 99 -fa \
  -p "Explain quantum computing"
```

**LM Studio**
1. Download the GGUF file and load in LM Studio.
2. Enable **Developer Mode** (Settings → Developer).
3. In the model loader's advanced settings, set **Flash Attention** to ON.
4. Set **K Cache Quantization** and **V Cache Quantization** to `q8_0` (or `q4_0` for more aggressive VRAM savings).
5. Note: LM Studio does not currently support RotorQuant's `iso3` cache types. Track [this feature request](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1719) for updates.

**Ollama**
```bash
# Standard Ollama does not support RotorQuant cache types.
# Use with default or q8_0 KV cache via OLLAMA_KV_CACHE_TYPE=q8_0
OLLAMA_KV_CACHE_TYPE=q8_0 OLLAMA_FLASH_ATTENTION=1 ollama run majentik/gemma-4-E2B-it-RotorQuant-GGUF-IQ4_XS
```

## Specifications

| Property | Value |
|----------|-------|
| Base Model | [google/gemma-4-E2B-it](https://huggingface.co/google/gemma-4-E2B-it) |
| Architecture | Dense transformer (Edge optimised), instruct-tuned |
| Parameters | ~2B |
| Context Length | 128K |
| Weight Quantization | GGUF IQ4_XS (importance-weighted 4-bit, smallest 4-bit) |
| Original Size (BF16) | ~4 GB |
| Quantized File Size | ~1.0 GB |
| KV Cache (RotorQuant) | 3-bit via `--cache-type-k iso3 --cache-type-v iso3` (fork only) |
| KV Cache (standard) | q8_0, q4_0, f16, etc. (any llama.cpp runtime) |
| License | apache-2.0 |
| Modalities | Text + Image (image-text-to-text) |
| Compatible Runtimes | llama.cpp, LM Studio, Ollama, koboldcpp |

## What is RotorQuant?

[RotorQuant](https://github.com/scrya-com/rotorquant) is a KV cache compression method based on Clifford algebra (Cl(3,0)) rotors. It was developed as a faster, more parameter-efficient alternative to Google's [TurboQuant](https://arxiv.org/abs/2504.19874) (ICLR 2026).

Instead of applying a dense d×d random orthogonal rotation matrix (as TurboQuant does), RotorQuant uses lightweight block-diagonal rotations — independent 2D/4D rotations per pair/quartet — achieving O(d) complexity instead of O(d log d), fully parallelisable with no inter-element dependencies.

**Benchmarks from the RotorQuant repository** (Llama 3.1 8B, RTX 5090 — results will vary by model and hardware):

| Metric | RotorQuant (iso3) | TurboQuant | Standard q4_0 |
|--------|-------------------|------------|---------------|
| Prefill Speed | 3,822 tok/s | 722 tok/s | — |
| Decode Speed | 119 tok/s | 93 tok/s | — |
| Perplexity (PPL) | 6.91 | 7.07 | — |
| KV Compression | ~5× vs FP16 | ~5× vs FP16 | ~4× vs FP16 |
| Rotation Parameters | 4 per rotor | 16,384 per matrix | N/A |

> **Note:** These benchmarks are from the RotorQuant repository using Llama 3.1 8B on an RTX 5090. Performance on gemma-4-E2B-it will differ. Independent benchmarks for this specific model are welcome — please open a discussion if you have results to share.

## Current Status of RotorQuant in the Ecosystem

| Runtime | RotorQuant Support | Standard KV Quant |
|---------|---------------------|-------------------|
| llama.cpp (upstream) | ❌ Not merged | ✅ q8_0, q4_0, q4_1, iq4_nl, q5_0, q5_1 |
| llama-cpp-turboquant fork | ✅ planar3, iso3 | ✅ All standard types |
| LM Studio | ❌ [Requested](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1719) | ✅ Via advanced settings |
| Ollama | ❌ Not supported | ✅ Via OLLAMA_KV_CACHE_TYPE |
| koboldcpp | ❌ Not supported | ✅ Standard types |

## Recommended Settings

For VRAM-constrained setups, standard q8_0 KV cache quantization already halves KV cache memory with negligible quality impact. Flash Attention should always be enabled — it is required for V cache quantization and improves memory efficiency regardless.

| VRAM | Suggested Configuration |
|------|------------------------|
| 24 GB (RTX 4090) | IQ4_XS + q8_0 KV cache + Flash Attention, 8K–16K context |
| 16 GB | IQ4_XS + q4_0 KV cache + Flash Attention, 4K–8K context |
| 48+ GB | IQ4_XS + f16 KV cache, full 32K+ context |

## See Also

- [RotorQuant GitHub](https://github.com/scrya-com/rotorquant)
- [llama-cpp-turboquant fork](https://github.com/johndpope/llama-cpp-turboquant/tree/feature/planarquant-kv-cache)
- [TurboQuant llama.cpp discussion](https://github.com/ggml-org/llama.cpp/discussions/20969)
- [TurboQuant paper (arXiv: 2504.19874)](https://arxiv.org/abs/2504.19874)
- [Base model: google/gemma-4-E2B-it](https://huggingface.co/google/gemma-4-E2B-it)
- [gemma-4-E2B-it announcement](https://blog.google/technology/developers/gemma-4/)

## Quant trade-off (GGUF lane)

| Quant | Approx size | Use case | Recommendation |
|---|---|---|---|
| Q2_K | ~1.1 GB | Lossy, low-RAM CPU/edge | Resource-constrained inference |
| Q3_K_M | ~1.2 GB | Smaller-than-Q4, modest quality drop | Edge devices with ~16 GB RAM |
| **IQ4_XS** | ~1.0 GB | Importance-quant 4-bit, smaller than Q4_K_M | **Best size/quality at 4-bit** |
| Q4_K_M | ~1.5 GB | Balanced default | Recommended for most users |
| Q5_K_M | ~1.6 GB | Higher fidelity than Q4 | Quality-sensitive applications |
| Q6_K | ~1.8 GB | Approaching FP16 quality | High-fidelity CPU/edge |
| Q8_0 | ~2.0 GB | Near-lossless reference | Fidelity-critical work |
| MXFP4_MOE | ~1.1 GB | Microscaling FP4 (MoE-aware) | vLLM / transformers users |

(Current variant — **IQ4_XS** — is bolded.)

## Variants in this family

(Showing 18 sibling variants under `majentik/gemma4-e2b-it-*`. The current variant — `RotorQuant-GGUF-IQ4_XS` — is **bolded**.)

| Variant | Runtime | Approx size | Use case |
|---|---|---|---|
| [RotorQuant](https://huggingface.co/majentik/gemma4-e2b-it-rotorquant) | runtime modifier | n/a | KV-cache root (weight-agnostic) |
| [RotorQuant-AWQ-4bit](https://huggingface.co/majentik/gemma4-e2b-it-rotorquant-awq-4bit) | transformers | ~1.2 GB | GPU 4-bit (AutoAWQ) |
| [RotorQuant-AWQ-8bit](https://huggingface.co/majentik/gemma4-e2b-it-rotorquant-awq-8bit) | transformers | ~2.2 GB | GPU 8-bit (AutoAWQ) |
| **RotorQuant-GGUF-IQ4_XS** | llama.cpp | ~1.7 GB | Lossy 4-bit, low-RAM CPU/edge |
| [RotorQuant-GGUF-Q2_K](https://huggingface.co/majentik/gemma4-e2b-it-rotorquant-gguf-Q2_K) | llama.cpp | ~1.2 GB | Lossy, low-RAM CPU/edge |
| [RotorQuant-GGUF-Q3_K_M](https://huggingface.co/majentik/gemma4-e2b-it-rotorquant-gguf-Q3_K_M) | llama.cpp | ~1.6 GB | Smaller 3-bit, CPU-friendly |
| [RotorQuant-GGUF-Q4_K_M](https://huggingface.co/majentik/gemma4-e2b-it-rotorquant-gguf-Q4_K_M) | llama.cpp | ~2.2 GB | Balanced default |
| [RotorQuant-GGUF-Q5_K_M](https://huggingface.co/majentik/gemma4-e2b-it-rotorquant-gguf-Q5_K_M) | llama.cpp | ~2.6 GB | Higher fidelity, more RAM |
| [RotorQuant-GGUF-Q8_0](https://huggingface.co/majentik/gemma4-e2b-it-rotorquant-gguf-Q8_0) | llama.cpp | ~4.2 GB | Near-lossless reference |
| [RotorQuant-MLX-2bit](https://huggingface.co/majentik/gemma4-e2b-it-rotorquant-mlx-2bit) | mlx-lm | ~655 MB | Apple Silicon, smallest |
| [RotorQuant-MLX-4bit](https://huggingface.co/majentik/gemma4-e2b-it-rotorquant-mlx-4bit) | mlx-lm | ~1.2 GB | Apple Silicon balanced |
| [RotorQuant-MLX-8bit](https://huggingface.co/majentik/gemma4-e2b-it-rotorquant-mlx-8bit) | mlx-lm | ~2.4 GB | Apple Silicon reference |
| [TurboQuant](https://huggingface.co/majentik/gemma4-e2b-it-turboquant) | runtime modifier | n/a | KV-cache root (weight-agnostic) |
| [TurboQuant-AWQ-4bit](https://huggingface.co/majentik/gemma4-e2b-it-turboquant-awq-4bit) | transformers | ~1.2 GB | GPU 4-bit (AutoAWQ) |
| [TurboQuant-AWQ-8bit](https://huggingface.co/majentik/gemma4-e2b-it-turboquant-awq-8bit) | transformers | ~2.2 GB | GPU 8-bit (AutoAWQ) |
| [TurboQuant-MLX-2bit](https://huggingface.co/majentik/gemma4-e2b-it-turboquant-mlx-2bit) | mlx-lm | ~655 MB | Apple Silicon, smallest |
| [TurboQuant-MLX-4bit](https://huggingface.co/majentik/gemma4-e2b-it-turboquant-mlx-4bit) | mlx-lm | ~1.2 GB | Apple Silicon balanced |
| [TurboQuant-MLX-8bit](https://huggingface.co/majentik/gemma4-e2b-it-turboquant-mlx-8bit) | mlx-lm | ~2.4 GB | Apple Silicon reference |
