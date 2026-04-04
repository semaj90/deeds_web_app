# Gemma 4 Integration Plan — 2026-04-03
https://agentnativedev.medium.com/turboquant-local-agent-swarms-with-4m-token-context-on-5k-desktop-cc6627666e4a
## Release Summary

Google released **Gemma 4** on April 2, 2026 — a major leap from Gemma 3.

| Model | Params | Active/Token | VRAM (Q4) | Vision | Audio | Context | License |
|-------|--------|-------------|-----------|--------|-------|---------|---------|
| **E2B** | ~2.3B | 2.3B | ~1.5GB | Yes | Yes | 256K | Apache 2.0 |
| **E4B** | ~4B | 4B | **~6GB** | Yes | Yes | 256K | Apache 2.0 |
| **26B MoE** | 26B | 4B | ~18GB | Yes | No | 256K | Apache 2.0 |
| **31B Dense** | 31B | 31B | ~20GB | Yes | No | 256K | Apache 2.0 |

### Key Upgrades vs Gemma 3

| Feature | Gemma 3 (27B) | Gemma 4 (31B) | Gemma 4 (E4B) |
|---------|--------------|--------------|---------------|
| MMLU Pro | 67.5% | **85.2%** | ~72% |
| MATH-Vision | — | **85.6%** | — |
| LMArena (text) | ~1350 | **1452 (#3 globally)** | ~1380 |
| License | Restricted (custom) | **Apache 2.0** | **Apache 2.0** |
| Context window | 128K | **256K** | **256K** |
| Vision | 12B+ only | All sizes | **Yes** |
| Audio | No | E2B/E4B only | **Yes** |
| Visual tokens | Fixed | **70-1120 configurable** | **70-1120** |
| OCR/Document | Weak | **Dramatically improved** | **Improved** |

**Apache 2.0 license** is the biggest change for us — Gemma 3 had restrictions on commercial fine-tuning and redistribution. Gemma 4 is fully open.

---

## Our Hardware: RTX 3060 Ti (8GB VRAM)

### What Fits

| Model | VRAM (Q4_K_M) | Room for KV + Embedding | Verdict |
|-------|--------------|------------------------|---------|
| gemma4 (E4B) | ~6GB | ~2GB | **Fits — recommended for VLM** |
| gemma4:e2b | ~1.5GB | ~6.5GB | Fits — lightweight, vision + audio |
| gemma3-legal (11.8B) | ~7.3GB | ~0.7GB | Currently loaded — tight |
| gemma4:26b | ~18GB | None | **Does NOT fit** (needs 16GB+) |
| gemma4:31b | ~20GB | None | **Does NOT fit** (needs 24GB+) |

### Recommended Configuration

**Dual-model strategy** (hot-swap via Ollama `keep_alive`):

1. **`gemma3-legal:latest`** — Text-only LLM (fine-tuned for legal domain)
   - Used by: SSE chat, synthesis, summarization, entity extraction
   - VRAM: ~7.3GB (loaded when doing text tasks)

2. **`gemma4:e4b`** — VLM + document understanding
   - Used by: Evidence image analysis, OCR fallback, document parsing
   - VRAM: ~6GB (loaded when doing vision tasks)
   - Advantage: Better OCR, variable visual token budget, audio support

Ollama handles model swap automatically — when `gemma4` is requested, it unloads `gemma3-legal` (or vice versa). The `keep_alive` setting controls how long a model stays loaded.

---

## TurboQuant — KV Cache Compression (March 25, 2026)

### What It Is

Google's **TurboQuant** compresses KV cache to **3 bits** (from 8-16 bits). This is NOT model weight quantization — it compresses the runtime memory used during inference for attention.

| Metric | Current (Q8_0 KV) | TurboQuant (3-bit) | Improvement |
|--------|-------------------|-------------------|-------------|
| KV cache size per 8K context | ~512MB | ~85MB | **6x smaller** |
| Attention compute speed | Baseline | Up to 8x faster | On H100; ~2-3x on consumer GPU |
| Accuracy loss | None | **None** (mathematically proven) | — |
| Max context (8GB VRAM, Q4 model) | ~16K tokens | **~64K+ tokens** | 4x more context |

### Integration Status

| Framework | Status | Timeline |
|-----------|--------|----------|
| llama.cpp | Community fork working (`--cache-type-k turbo3`) | Available now (fork) |
| Ollama | Not yet merged | **Q3 2026 (~2-3 months)** |
| TRT-LLM | No official support yet | Unknown |
| vLLM | Not yet | Unknown |

### Impact for Us

Once TurboQuant lands in Ollama:
- `gemma4:e4b` with TurboQuant → 6GB model + ~85MB KV for 8K context = **fits easily with embeddings**
- Could potentially run `gemma4:e4b` + `embeddinggemma` simultaneously
- 256K context becomes feasible on 8GB VRAM

**Action**: Monitor [llama.cpp #20969](https://github.com/ggml-org/llama.cpp/discussions/20969) and [Ollama #15189](https://github.com/ollama/ollama/issues/15189) for merge status.

---

## Google RAG (Gemini File Search) vs Our Stack

### Pricing

| Component | Google Gemini File Search | Our Stack |
|-----------|--------------------------|-----------|
| Indexing | $0.15 / 1M tokens | **$0** (local Ollama) |
| Queries | Free | **$0** (local Qdrant) |
| Storage | Free | **$0** (local MinIO + PostgreSQL) |
| Embedding | Free at query time | **$0** (embeddinggemma, local) |
| Monthly cost (1M docs) | ~$15-50 | **$0** (electricity only) |

### Capability Comparison

| Capability | Google RAG | Our Stack | Winner |
|------------|-----------|-----------|--------|
| **Data privacy** | Data sent to Google Cloud | 100% local, never leaves machine | **Ours** |
| **Retrieval depth** | Basic vector similarity | RAG + KAG (graph) + DAG (citation order) + corrective + authority chain | **Ours** |
| **Chunking** | Automatic (generic) | Legal-aware (ARTICLE/SECTION/§) | **Ours** |
| **Graph expansion** | None | Neo4j pre-retrieval + multi-hop authority drill-down | **Ours** |
| **Hybrid search** | Unknown | BM42 sparse + dense RRF fusion | **Ours** |
| **Cache layers** | Google CDN | 5-tier (LokiJS → IndexedDB → Memory → Redis → Service) | **Ours** |
| **Fine-tuning** | Limited (Gemini only) | Full (Unsloth QLoRA, Modelfile, Apache 2.0) | **Ours** |
| **Context window** | 1M tokens (Gemini 2.5 Pro) | 128K (Gemma 3) / 256K (Gemma 4) | **Google** |
| **Setup effort** | API key + 5 lines of code | Full infrastructure (Docker, Qdrant, Redis, PostgreSQL, Ollama) | **Google** |
| **Latency** | Network round-trip (~200-500ms) | Local inference (~50ms embedding, ~2s LLM) | **Ours** (embedding), **Tie** (LLM) |
| **Scalability** | Auto-scales | Single machine (cluster mode available) | **Google** |
| **Cost at scale** | Grows with usage | Fixed (hardware cost) | **Ours** |

### Verdict

Google RAG is **easier to start** but our stack is:
- **Free forever** (no per-token costs)
- **Private** (legal data never leaves the machine)
- **Deeper retrieval** (KAG + DAG + authority chain + corrective RAG)
- **Domain-optimized** (legal-aware chunking, fine-tuned model, forensic analysis)

Google RAG cannot do graph-informed retrieval, multi-hop authority expansion, or legal-domain-specific chunking. For a legal AI platform handling sensitive evidence, self-hosted is the right choice.

---

## Gemma 4 + TensorRT-LLM / Triton

### Current Support

| Component | Gemma 3 | Gemma 4 | Notes |
|-----------|---------|---------|-------|
| TRT-LLM model support | Yes | **Day-0 (architecture compatible)** | NVIDIA confirmed |
| Triton backend | Yes | Yes | `tensorrtllm_backend` |
| LoRA adapters in TRT | Yes | Expected yes | Same architecture family |
| GKE deployment tutorial | Yes | In progress | Google Cloud docs |
| RTX consumer GPU | Works (12B Q4) | E4B only on 8GB | 26B/31B need 16GB+ |

### Our Existing TRT Infrastructure

Already built and wired:
- `/api/ai/tensorrt` — text inference endpoint
- `/api/ai/tensorrt/vlm` — VLM inference endpoint
- `/api/ai/tensorrt/stream` — streaming text endpoint
- `inference-router.ts` — TRT → Ollama fallback with VRAM check
- `gpu-arbiter.ts` — Redis-based GPU lease management
- `gpu-monitor.ts` — nvidia-smi VRAM/temp/utilization monitoring
- `adapter-manifest.ts` — tracks merged LoRA adapter artifacts

### TRT Build Path for Gemma 4

When GPU is upgraded (16GB+):
1. Download Gemma 4 26B MoE safetensors from HuggingFace
2. Convert to TRT-LLM format: `python convert_checkpoint.py --model_dir gemma4-26b --output_dir ./trt_ckpt`
3. Build engine: `trtllm-build --checkpoint_dir ./trt_ckpt --output_dir ./trt_engine --gemm_plugin float16`
4. Deploy to Triton: copy engine to model repository
5. Our existing `/api/ai/tensorrt/*` routes work unchanged (same API contract)

---

## Gemma 4 + Unsloth Fine-Tuning

### What Changed

| Factor | Gemma 3 | Gemma 4 |
|--------|---------|---------|
| License for fine-tuning | Restricted (custom Google license) | **Apache 2.0 (fully open)** |
| Unsloth support | Yes | **Day-0** |
| QLoRA support | Yes | Yes |
| Base model for legal fine-tune | gemma3-legal (11.8B) | gemma4:e4b (4B) or gemma4:26b (26B) |

### Recommended Fine-Tuning Target

**`gemma4:e4b`** — fine-tune for legal domain → `gemma4-legal:e4b`

Why E4B over 26B:
- Fits on RTX 3060 Ti for both training (with QLoRA) and inference
- Has native vision → can fine-tune with image+text training pairs
- Apache 2.0 → can redistribute the fine-tuned model
- 4B params → faster training, more epochs in same time

### Training Pipeline (Updated)

```
1. Export legal training data (PostgreSQL + Qdrant chunks)
     └── scripts/unsloth-training/COLAB_PACKAGE/training-datasets/*.jsonl

2. Fine-tune on Colab A100 (gemma4:e4b base)
     └── scripts/unsloth-training/Gemma4_E4B_Legal_QLoRA.ipynb (TO CREATE)
     └── Config: QLoRA r=8, alpha=16, BF16, 3 epochs

3. Merge LoRA adapters
     └── scripts/merge_lora_adapter.py (already built)

4. Convert to GGUF Q4_K_M
     └── scripts/unsloth-training/merge-and-export.sh (already built)

5. Create Ollama model
     └── ollama create gemma4-legal -f Modelfile

6. Update adapter-manifest.ts
     └── Automatic via merge_lora_adapter.py
```

Existing training datasets (created this session):
- `legal-analysis-expanded.jsonl` — 14 examples (chain of custody, statutes, case law)
- `rag-retrieval-patterns.jsonl` — 5 examples (timeline reconstruction, issue spotting)
- Plus ~6,200 existing code/legal examples

---

## Implementation Roadmap

### Phase 1: Immediate (No Hardware Change) — 1 Session

| Step | Action | Files |
|------|--------|-------|
| 1 | `ollama pull gemma4` (E4B, ~6GB) | Terminal |
| 2 | Add `GEMMA4_VLM_MODEL` to env.server.ts | `env.server.ts` |
| 3 | Update `vlm-evidence-analyzer.ts` to prefer gemma4 for vision | `vlm-evidence-analyzer.ts` |
| 4 | Update `vision/analyze` endpoint model selection | `api/vision/analyze/+server.ts` |
| 5 | Keep gemma3-legal for text-only tasks | No change |
| 6 | Verify: upload image evidence → VLM analysis uses gemma4 | Manual test |

### Phase 2: TurboQuant Integration — When Available (~Q3 2026)

| Step | Action | Impact |
|------|--------|--------|
| 1 | Update Ollama when TurboQuant merges | 6x KV cache compression |
| 2 | Add `OLLAMA_KV_CACHE_TYPE=turbo3` to env | 3-bit KV cache |
| 3 | Test 256K context on 8GB VRAM | Full Gemma 4 context window |
| 4 | Consider gemma4:e4b as unified text+vision model | Simplify dual-model setup |

### Phase 3: Unsloth Fine-Tune — 1-2 Sessions

| Step | Action | Output |
|------|--------|--------|
| 1 | Create `Gemma4_E4B_Legal_QLoRA.ipynb` notebook | Colab notebook |
| 2 | Run fine-tuning on Colab A100 (~2-4 hours) | LoRA adapter weights |
| 3 | Merge + export via existing pipeline | `gemma4-legal` GGUF |
| 4 | Deploy to Ollama, update model config | Production model |

### Phase 4: GPU Upgrade + TRT-LLM — When Hardware Available

| Step | Action | Enables |
|------|--------|---------|
| 1 | Upgrade to RTX 5060 Ti 16GB ($429) | 26B MoE fits in VRAM |
| 2 | Build TRT-LLM engine for Gemma 4 26B MoE | 3-5x inference speedup |
| 3 | Deploy to Triton (existing Docker infra) | Production TRT serving |
| 4 | Existing inference-router.ts handles fallback | Zero code changes |

---

## Architecture After Gemma 4 Integration

```
User Query
    │
    ├─ Text-only query → gemma3-legal (fine-tuned, 11.8B Q4_K_M)
    │   └─ SSE chat, synthesis, summarization, entities
    │
    ├─ Vision query → gemma4:e4b (native multimodal, 4B Q4)
    │   └─ Evidence images, OCR fallback, document parsing
    │   └─ Variable visual tokens: 70 (captions) → 1120 (OCR/docs)
    │
    ├─ Audio evidence → gemma4:e4b (native audio input)
    │   └─ Transcription, speaker identification
    │   └─ Replaces Docling ASR fallback for simple audio
    │
    ├─ Embeddings → embeddinggemma:latest (768-dim, always loaded)
    │
    └─ Future: gemma4-legal:e4b (unified fine-tuned text+vision+audio)
        └─ Replaces both gemma3-legal AND gemma4:e4b
        └─ Single model for all inference tasks
```

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| E4B vision quality worse than Gemma 3 12B | Low (benchmarks show improvement) | Keep gemma3-legal as fallback, A/B test |
| Ollama gemma4 tag changes/breaks | Low | Pin specific version in Modelfile |
| TurboQuant delayed past Q3 | Medium | Current Q8_0 KV works fine, no urgency |
| VRAM contention (gemma4 + embeddings) | Medium | Ollama auto-swap; set `keep_alive: '5m'` on VLM |
| Apache 2.0 license reverted | Very low | Google has committed publicly |

---

## References

- [Gemma 4 Announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)
- [Gemma 4 on HuggingFace](https://huggingface.co/blog/gemma4)
- [Gemma 4 DeepMind Page](https://deepmind.google/models/gemma/gemma-4/)
- [TurboQuant Research Blog](https://research.google/blog/turboquant-redefining-ai-efficiency-with-extreme-compression/)
- [TurboQuant llama.cpp Discussion](https://github.com/ggml-org/llama.cpp/discussions/20969)
- [TurboQuant Ollama Issue](https://github.com/ollama/ollama/issues/15189)
- [NVIDIA RTX AI Garage + Gemma 4](https://blogs.nvidia.com/blog/rtx-ai-garage-open-models-google-gemma-4/)
- [NVIDIA Gemma 4 Edge/Device](https://developer.nvidia.com/blog/bringing-ai-closer-to-the-edge-and-on-device-with-gemma-4/)
- [Gemini File Search Tool (RAG)](https://blog.google/innovation-and-ai/technology/developers-tools/file-search-gemini-api/)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Unsloth Gemma 4 Docs](https://unsloth.ai/docs/models/gemma-4)
- [Run Gemma 4 Locally](https://leetllm.com/blog/run-gemma4-local-ollama)
- [Gemma 4 Hardware Requirements](https://www.oflight.co.jp/en/columns/gemma4-hardware-requirements-local-ai-spec-2026)
- [Gemma 4 VRAM Calculator](https://docs.bswen.com/blog/2026-04-03-gemma-4-12gb-vram-recommendations/)
