# GPU Upgrade Comparison for LLM Inference

## Date: March 15, 2026
## Context: Gemma3 12B Legal AI on RTX 3060 Ti (8GB) — evaluating upgrade paths

---

## Current GPU: RTX 3060 Ti

| Spec | Value |
|------|-------|
| Architecture | Ampere (GA104) |
| SM Version | 8.6 |
| VRAM | 8 GB GDDR6X |
| Memory Bandwidth | 608 GB/s |
| FP8 | NO |
| FP4 | NO |
| INT4 AWQ (weight-only) | YES |
| Price (used) | ~$200 |

**Current limitation**: Gemma3 12B Q4_K_M uses 7.3GB — leaves only ~900MB for KV cache, no room for TRT-LLM runtime overhead or VLM vision encoder.

---

## SM Compatibility Matrix

| SM Version | Architecture | GPUs | Key Unlocks |
|------------|-------------|------|-------------|
| 8.6 | Ampere | RTX 3060 Ti, 3070, 3080, 3090 | INT4 weight-only, Flash Attention |
| 8.9 | Ada Lovelace | RTX 4060 Ti, 4070, 4080, 4090 | **FP8** + INT4 AWQ with FP8 activations |
| 12.0 | Blackwell | RTX 5050, 5060, 5060 Ti, 5070 Ti | **FP4** + FP8 + INT4, 5th-gen Tensor Cores |

**FP8** (Ada+): Halves model size vs FP16 with minimal quality loss. Gemma3 12B: ~12GB → fits in 16GB with room for KV cache.
**FP4** (Blackwell only): Quarters model size. Gemma3 12B: ~6GB → fits in 8GB with plenty of headroom.

---

## Full GPU Comparison

| Spec | RTX 3060 Ti | RTX 4060 Ti 16GB | RTX 5050 | RTX 5060 | RTX 5060 Ti 16GB | RTX 5070 Ti 16GB |
|------|-------------|------------------|----------|----------|-------------------|-------------------|
| **Architecture** | Ampere | Ada Lovelace | Blackwell | Blackwell | Blackwell | Blackwell |
| **SM Version** | 8.6 | 8.9 | 12.0 | 12.0 | 12.0 | 12.0 |
| **VRAM** | 8 GB | **16 GB** | 8 GB | 8 GB | **16 GB** | **16 GB** |
| **Memory Bus** | 256-bit | 128-bit | 128-bit | 128-bit | 128-bit | 256-bit |
| **Bandwidth** | 608 GB/s | 288 GB/s | ~288 GB/s | ~288 GB/s | ~288 GB/s | **512 GB/s** |
| **CUDA Cores** | 4864 | 4352 | ~3072 | ~4608 | ~4608 | 8960 |
| **TDP** | 200W | 165W | 150W | 150W | 180W | 285W |
| **FP8** | NO | **YES** | **YES** | **YES** | **YES** | **YES** |
| **FP4** | NO | NO | **YES** | **YES** | **YES** | **YES** |
| **INT4 AWQ** | Weight-only | + FP8 activations | + FP4/FP8 | + FP4/FP8 | + FP4/FP8 | + FP4/FP8 |
| **Price** | ~$200 used | ~$300 used | ~$300 new | ~$379 new | **$429 new** | ~$750 new |

---

## LLM Inference Analysis

### Key Principle: VRAM > Bandwidth for LLM Inference

For single-user local inference, **VRAM capacity** is the primary bottleneck — not memory bandwidth. A model that fits entirely in VRAM will run. A model that doesn't fit won't run at all (or will offload to CPU RAM at 10-50x penalty).

Bandwidth matters more for:
- Multi-user concurrent inference (batched requests)
- Very long context windows (large KV cache)
- Streaming token generation speed

### Gemma3 12B Fit Analysis

| GPU | Quantization | Model Size | KV Cache (4K ctx) | Headroom | Fits? |
|-----|-------------|------------|-------------------|----------|-------|
| RTX 3060 Ti (8GB) | Q4_K_M (INT4) | 7.3 GB | 0.5 GB | -0.1 GB | BARELY (no VLM) |
| RTX 4060 Ti 16GB | FP8 | ~12 GB | 0.5 GB | 3.5 GB | YES + VLM |
| RTX 5050 (8GB) | FP4 | ~6 GB | 0.5 GB | 1.5 GB | YES (tight) |
| RTX 5060 (8GB) | FP4 | ~6 GB | 0.5 GB | 1.5 GB | YES (tight) |
| RTX 5060 Ti 16GB | FP4 | ~6 GB | 0.5 GB | 9.5 GB | YES + VLM + KV |
| RTX 5070 Ti 16GB | FP4 | ~6 GB | 0.5 GB | 9.5 GB | YES + VLM + KV |

### Context Window Capacity (Gemma3 12B)

| GPU | Max Context (estimated) | Notes |
|-----|------------------------|-------|
| RTX 3060 Ti | ~4K tokens | Barely fits model, minimal KV cache |
| RTX 4060 Ti 16GB | ~16K tokens | FP8 model + generous KV cache |
| RTX 5050/5060 (8GB) | ~8K tokens | FP4 model + moderate KV cache |
| RTX 5060 Ti 16GB | ~32K+ tokens | FP4 model + massive KV headroom |
| RTX 5070 Ti 16GB | ~32K+ tokens | FP4 + faster bandwidth for long contexts |

---

## VLM (Vision-Language Model) Capacity

SigLIP vision encoder needs ~1.5GB loaded temporarily for image processing.

| GPU | Can time-share VLM? | Notes |
|-----|---------------------|-------|
| RTX 3060 Ti (8GB) | NO | Model already uses 7.3/8GB — no room for SigLIP |
| RTX 4060 Ti 16GB | YES | ~3.5GB free after FP8 model |
| RTX 5050/5060 (8GB) | MAYBE | ~1.5GB free — exactly SigLIP size, very tight |
| RTX 5060 Ti 16GB | YES | ~9.5GB free — can load SigLIP + projector simultaneously |
| RTX 5070 Ti 16GB | YES | Same headroom + faster processing |

---

## TRT-LLM Engine Compatibility

TRT engines are compiled for a specific SM version and are **NOT portable** across architectures.

| Training/Export Location | Output | Portable? |
|-------------------------|--------|-----------|
| Colab A100 (SM 8.0) | HuggingFace checkpoints (.safetensors) | YES — weights are hardware-agnostic |
| Colab A100 (SM 8.0) | ONNX models (.onnx) | YES — standard format |
| Colab A100 (SM 8.0) | TRT engines (.engine, .plan) | **NO** — must rebuild on target GPU |
| Local RTX 3060 Ti (SM 8.6) | TRT engines | Only runs on SM 8.6 |
| Local RTX 5060 Ti (SM 12.0) | TRT engines | Only runs on SM 12.0 |

**Workflow**: Train/quantize on Colab A100 → download weights/ONNX → build TRT engines locally on target GPU.

If you upgrade GPU, you need to rebuild TRT engines but NOT retrain or re-export.

---

## SLI / NVLink (Multi-GPU)

**Dead for consumer GPUs.** Cannot combine two consumer GPUs for shared VRAM.

| Generation | NVLink Support |
|-----------|---------------|
| RTX 3090 | Last consumer card with NVLink (2-way) |
| RTX 3060 Ti | NO NVLink connector |
| RTX 40-series | NVLink dropped entirely |
| RTX 50-series | NVLink dropped entirely |
| RTX PRO 6000 (Blackwell) | YES — but $6,800+ workstation card |

**Alternative**: Tensor parallelism across PCIe (supported by TRT-LLM, vLLM) — but PCIe 4.0 bandwidth (32 GB/s) is 19x slower than NVLink, making it impractical for interactive inference.

---

## Tokens/Second Estimates (Gemma3 12B, Single User)

| GPU | Quantization | Est. tok/s | Notes |
|-----|-------------|-----------|-------|
| RTX 3060 Ti | Q4_K_M | ~15-25 | Memory-bound, barely fits |
| RTX 4060 Ti 16GB | FP8 | ~20-30 | More headroom but lower bandwidth |
| RTX 5050 (8GB) | FP4 | ~25-35 | FP4 Tensor Cores, low bandwidth |
| RTX 5060 (8GB) | FP4 | ~30-40 | More CUDA cores than 5050 |
| RTX 5060 Ti 16GB | FP4 | ~30-40 | Same cores as 5060, more VRAM for KV |
| RTX 5070 Ti 16GB | FP4 | ~50-70 | 2x bandwidth + more cores |

*Estimates based on memory bandwidth and quantization. Actual performance depends on TRT-LLM vs Ollama, batching, and context length.*

---

## Ranked Recommendations

### Best Value: RTX 5060 Ti 16GB — $429 new

| Pro | Con |
|-----|-----|
| 16GB VRAM (2x current) | 128-bit bus (lower bandwidth than 3060 Ti) |
| FP4 Tensor Cores (Blackwell) | New release — may have driver quirks |
| Gemma3 12B in FP4 (~6GB) + 10GB headroom | |
| Full VLM pipeline fits in VRAM | |
| ~$230 more than current GPU | |
| Future-proof for larger models | |

### Best Performance: RTX 5070 Ti 16GB — ~$750 new

| Pro | Con |
|-----|-----|
| 16GB VRAM + 512 GB/s bandwidth | $750 — 3.5x cost of current GPU |
| FP4 + 8960 CUDA cores | 285W TDP (need adequate PSU) |
| Fastest single-GPU option in range | Overkill for single-user inference |
| ~50-70 tok/s estimated | |

### Best Budget: RTX 4060 Ti 16GB — ~$300 used

| Pro | Con |
|-----|-----|
| 16GB VRAM | No FP4 (Ada, not Blackwell) |
| FP8 support | 128-bit bus, 288 GB/s |
| Cheapest 16GB option | Used market only |
| Proven stable drivers | Slower than Blackwell at same price |

### Not Recommended for LLM

| GPU | Why Not |
|-----|---------|
| RTX 5050 (8GB) | Same VRAM as 3060 Ti — only gains FP4 |
| RTX 5060 (8GB) | Same VRAM limitation — marginal upgrade |
| RTX 3060 Ti (keep) | Works today, but no growth path |

---

## Decision Matrix

| Priority | Best Choice | Price |
|----------|------------|-------|
| **Maximum value per dollar** | RTX 5060 Ti 16GB | $429 |
| **Maximum performance** | RTX 5070 Ti 16GB | $750 |
| **Minimum spend for 16GB** | RTX 4060 Ti 16GB (used) | $300 |
| **No upgrade needed** | Keep RTX 3060 Ti | $0 |
| **Wait for price drops** | RTX 5060 Ti 16GB in 6mo | ~$350? |

---

## Upgrade Impact on Current Stack

| Component | RTX 3060 Ti (now) | RTX 5060 Ti 16GB (upgrade) |
|-----------|-------------------|---------------------------|
| Ollama gemma3-legal | Q4_K_M, 7.3GB, ~20 tok/s | FP4/Q4_K_M, headroom for Q5/Q6 |
| TRT-LLM INT4 engine | Barely fits (~7.4GB) | Comfortable fit + KV cache |
| SigLIP VLM | Can't load (no VRAM) | Load/unload freely |
| Concurrent models | 1 at a time | 2 small models possible |
| KV cache (context) | ~4K tokens max | ~32K+ tokens |
| TRT engine rebuild | Required (SM 8.6 → 12.0) | One-time rebuild |
| Colab notebooks | No changes needed | No changes needed |
| Docker/Triton | No changes needed | Update SM target in build scripts |

---

## Sources

- [NVIDIA RTX 50-Series Specs](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/)
- [TRT-LLM Support Matrix](https://nvidia.github.io/TensorRT-LLM/reference/support-matrix.html)
- [TRT-LLM Quantization Blog](https://nvidia.github.io/TensorRT-LLM/blogs/quantization-in-TRT-LLM.html)
- [Blackwell Architecture Whitepaper](https://www.nvidia.com/en-us/data-center/technologies/blackwell-architecture/)
- [pgvector halfvec docs](https://github.com/pgvector/pgvector#half-precision-vectors)
- [Ollama Flash Attention](https://github.com/ollama/ollama/blob/main/docs/faq.md)
