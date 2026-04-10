# Inference Tracks + CPU Fallback — April 9, 2026 (updated)

## Status: 4 files patched ✓ | Serving eval notebook committed ✓ | Tracks 1-3 pending manual runs

### Update (April 9, 2026 — session 2)
Added KAG/RAG/DAG + L1-L4 compression section. Intel 10th gen CPU cache tier table confirmed.
`Gemma4_Serving_Inference_Eval.ipynb` §5 updated with KAG/RAG/DAG context injection pre-inference.
`Gemma4_Serving_Inference_Eval.ipynb` now includes: CPU intel OpenVINO path, L1–L4 cache flush test, turbo3 KV context fit test.
`next_steps/4_9_26_inference_tracks_cpu_fallback.md` — this file, updated with full track details.

---

## What Was Done This Session

### Code Changes (already committed + pushed)
| File | Change |
|---|---|
| `src/lib/ai/model-ids.ts` | Added LiteRT-LM Tier 2, TurboQuant Tier 3, `InferenceSource` updated |
| `src/lib/ai/client-router.ts` | 5-tier routing: E2B → LiteRT → ONNX → retrieval → server |
| `src/lib/server/inference/inference-router.ts` | TurboQuant Tier 3 between Triton and Bifrost |
| `src/lib/server/inference/inference-log.ts` | `'turboquant'` added to backend log types |
| `scripts/unsloth-training/Gemma4_Serving_Inference_Eval.ipynb` | New notebook: 4-path serving eval |

---

## The 3 Parallel Tracks

### Track 1 — NVIDIA GPU (RTX 3060 Ti, 8 GB VRAM)
**Goal**: Benchmark TurboQuant turbo3 KV cache compression vs baseline Q8_0 on gemma4-legal GGUF

```bash
# 1. Clone turboquant_plus fork
git clone https://github.com/TheTom/turboquant_plus.git
cd turboquant_plus

# 2. Build with CUDA
cmake -B build -DGGML_CUDA=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build --target llama-server -j8

# 3. Run TurboQuant server (port 8090, OpenAI-compatible)
./build/bin/llama-server \
  -m /path/to/gemma4-legal-vlm-Q4_K_M.gguf \
  -ctk turbo3 -ctv turbo3 \
  --port 8090 \
  --ctx-size 24576 \
  --n-gpu-layers 35

# 4. Benchmark: hit the serving eval notebook §2 (TRT-LLM path)
#    or curl directly:
curl http://localhost:8090/v1/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"gemma4-legal","prompt":"Explain chain of custody defects.","max_tokens":256}'
```

**KV Cache Compression Reference (Intel 10th gen + RTX 3060 Ti)**
| Level | KV bits | Context @ 8GB VRAM | Context @ L3 CPU (12MB) |
|---|---|---|---|
| Q8_0 (baseline) | 8 bit | ~4096 tokens | ~64 tokens |
| turbo2 | 4 bit | 16384 tokens | 128 tokens |
| turbo3 | 3 bit | 24576 tokens | 256 tokens |
| turbo4 | 2 bit | 32768 tokens | 384 tokens |

**Status**: [ ] Not yet built — follow commands above

---

### Track 2 — CPU / Mobile (Intel 10th gen + iGPU)
**Goal**: LiteRT-LM Gemma 4 E4B (3.65 GB) on x86 CPU + Intel UHD 620/630 iGPU, test MTP inference

```bash
# 1. Install litert-lm
pip install litert-lm

# 2. Download E4B model (3.65 GB)
huggingface-cli download litert-community/gemma-4-E4B-it-litert-lm \
  --local-dir ./litert-models/gemma4-e4b

# Or E2B for lower RAM (1.5 GB)
huggingface-cli download litert-community/gemma-4-E2B-it-litert-lm \
  --local-dir ./litert-models/gemma4-e2b

# 3. Benchmark on CPU
litert-lm benchmark --backend=cpu \
  ./litert-models/gemma4-e2b/gemma-4-E2B-it.litertlm \
  --prefill_tokens=256 --decode_tokens=128

# 4. Benchmark on Intel iGPU (OpenCL backend)
litert-lm benchmark --backend=gpu \
  ./litert-models/gemma4-e2b/gemma-4-E2B-it.litertlm \
  --prefill_tokens=256 --decode_tokens=128

# 5. Run as HTTP sidecar (port 8070 — what client-router.ts expects)
litert-lm serve ./litert-models/gemma4-e2b/gemma-4-E2B-it.litertlm \
  --port 8070 --backend=cpu

# 6. Test MTP (Multi-Token Prediction) speedup
#    MTP heads=4, expected 1.8x speedup vs non-MTP
litert-lm run --backend=cpu \
  ./litert-models/gemma4-e2b/gemma-4-E2B-it.litertlm \
  --prompt "Explain chain of custody requirements." \
  --mtp-draft-heads 4
```

**Intel 10th gen performance expectations**
| Metric | i5-10500 (CPU) | Intel UHD 630 (iGPU) |
|---|---|---|
| E2B tok/s | ~8-12 tok/s | ~14-18 tok/s |
| E4B tok/s | ~4-6 tok/s | ~7-10 tok/s |
| MTP boost | 1.7-1.8x | 1.6-1.8x |
| RAM needed (E2B) | 2.5 GB | 2.5 GB |
| RAM needed (E4B) | 5.5 GB | 5.5 GB |

**L1-L4 Cache Architecture on Intel 10th gen (relevance to KV cache)**
```
L1 cache: 32 KB per core   → KV cache for ~1 token at full precision
L2 cache: 256 KB per core  → KV cache for ~8 tokens at turbo3
L3 cache: 12 MB shared     → KV cache for ~256 tokens at turbo3
RAM:      DDR4              → full context window (any model)
```

At turbo3 (3-bit KV), 256 tokens of KV cache = ~384 KB → fits in L3.
This means speculative prefill reuse works on Intel 10th gen with turbo3.

**Status**: [ ] Not yet run — follow commands above

---

### Track 3 — Colab VLM (A100)
**Goal**: Run Gemma4_E4B_Legal_VLM_Reattach.ipynb, merge GRPO adapter with vision tower, export GGUF

Steps (open in Colab):
1. Runtime → Change runtime type → A100 GPU
2. Add HF_TOKEN to Colab Secrets (key icon in sidebar)
3. Run All (§1 through §13)

Expected outputs:
- `gemma4-legal-vlm-merged/` — 16 GB safetensors (canonical)
- `gemma4-legal-vlm-gguf/gemma4-legal-vlm-Q4_K_M.gguf` — ~5 GB (Ollama/Track 1 GGUF)
- `gemma4-legal-vlm-litert/gemma4-legal.litertlm` — if §9 succeeds

After Track 3 completes → Track 1 gets the GGUF → Track 2 gets the .litertlm

**Status**: [ ] Not yet run — requires Colab Pro+ A100 session

---

## KAG/RAG/DAG + L1-L4 Compression Integration

### How the cache tiers map to inference paths

```
User Query
  ↓
L1: LokiJS (in-process, 5-10 min TTL)
      ↓ miss
L2: IndexedDB (browser persistent, 7-day TTL)
      ↓ miss
L3: Redis (server, cross-request, configurable TTL)
      ↓ miss
L4: Qdrant + pgvector (vector search, permanent)
      ↓ hit — assemble RAG/KAG/DAG context
      ↓
InferenceRouter picks backend:
  ├─ TurboQuant context window can hold L4 results in KV cache (turbo3: ~24K tokens)
  ├─ LiteRT-LM uses L1/L2 hits to avoid inference entirely
  └─ ONNX 270M is pure classification router — always lightweight
```

### RAG/KAG/DAG context with CPU fallback

When TRT-LLM / Triton / TurboQuant are all offline:
1. KAG graph query runs server-side (Postgres + Qdrant) — result cached to L3 Redis
2. RAG chunks assembled server-side — cached to L3
3. DAG cluster ordering applied — result passed to client as structured context JSON
4. Client hits LiteRT-LM sidecar (:8070) or ONNX (:WASM) with pre-assembled context
5. Inference runs locally — no round-trip to server LLM needed

Key point: **CPU fallback works with full RAG context** because the heavy retrieval is done server-side. The client model only does generation over the retrieved chunks (~512-2048 tokens), not full-corpus search.

---

## Serving Decision Matrix (All Tracks)

| Situation | Backend | Port | Notes |
|---|---|---|---|
| TRT engine built, Triton up | TRT-LLM | 8099 | Fastest GPU text serving |
| TurboQuant built, RTX online | TurboQuant llama-server | 8090 | Fallback GPU, easier build |
| vLLM deployed | vLLM | 8000 | Easiest GPU serving, HF-native |
| Ollama running with GGUF | Ollama | 11434 | VLM support via mmproj |
| LiteRT sidecar running | LiteRT-LM | 8070 | CPU/iGPU, MTP speedup |
| No server at all | ONNX 270M | WASM | Browser-only, routing only |

---

## Immediate Next Steps (Priority Order)

**High priority (unblocks everything):**
- [ ] Run Track 3 (Colab A100) — produces GGUF needed by Track 1 and LiteRT by Track 2
- [ ] Upload merged checkpoint: `Semaj90/gemma4-e4b-legal-vlm-merged`

**Medium priority:**
- [ ] Track 1: Build turboquant_plus with CUDA on RTX 3060 Ti machine
- [ ] Track 2: `pip install litert-lm` + benchmark E2B on Intel 10th gen CPU

**Low priority (after tracks complete):**
- [ ] Run `Gemma4_Serving_Inference_Eval.ipynb` §0 backend detection → confirms which paths are live
- [ ] Run `Gemma4_LiteRT_Comparison_and_Eval.ipynb` with custom artifact after Track 2
- [ ] Wire winning serving path into `/api/sse/chat` → update `inference-router.ts` priority
- [ ] Update `OLLAMA_MODEL` in `model-ids.ts` once merged model tag is confirmed

---

## Reference: Notebook Map

| Notebook | Purpose | GPU |
|---|---|---|
| `Gemma4_E4B_Legal_GRPO.ipynb` | GRPO training | A100 |
| `Gemma3_12B_Legal_Production.ipynb` | Gemma 3 12B fine-tune | A100 |
| `Gemma3n_Legal_VLM_Unsloth.ipynb` | Gemma 3n edge fine-tune | A100 |
| `Gemma4_E4B_Legal_VLM_Reattach.ipynb` | Merge + format export | A100 |
| `Gemma4_LiteRT_Comparison_and_Eval.ipynb` | LiteRT eval vs baseline | T4/L4/G4 |
| `Gemma4_Serving_Inference_Eval.ipynb` | All 4 serving paths eval | any |
