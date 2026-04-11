# Inference Infrastructure — 7-Tier Cascade

**Last verified**: 2026-04-10 22:00 PDT
**svelte-check**: 0 errors, 0 warnings
**vite build**: PASSES (exit 0)

---

## Architecture

```
User Query → routeInference() (inference-router.ts)
  │
  ├─ [image?] → VLM server (:8085) → vision + text analysis
  │
  ├─ Tier 1: TensorRT-LLM (:8099)   — INT4 AWQ, GPU lease required
  ├─ Tier 2: Triton (:8000)          — production GPU fallback
  ├─ Tier 3: llama-server (:8090)    — q4_0 KV cache, flash attention, CUDA
  ├─ Tier 4: Bifrost/LiteLLM (:3030) — semantic cache proxy
  ├─ Tier 5: VLM HF (:8085)          — Gemma 4 E4B NF4, text fallback
  ├─ Tier 6: LiteRT-LM (:8070)       — CPU sidecar, Gemma 4 E2B, 0 VRAM
  └─ Tier 7: Ollama (:11434)         — gemma4-legal Q4_K_M, default fallback
```

All tiers are OpenAI-compatible (`/v1/chat/completions`). The router health-checks each tier with a 1s timeout and falls through to the next on failure.

---

## Current Status (2026-04-10)

| Tier | Port | Status | Model | Speed | VRAM |
|------|------|--------|-------|-------|------|
| TensorRT-LLM | :8099 | OFFLINE | — | — | — |
| Triton | :8000 | OFFLINE | — | — | — |
| **llama-server** | **:8090** | **RUNNING** | gemma4-legal 7.5B Q4_K_M | **75.4 tok/s gen, 59 tok/s prompt** | ~5 GB + q4_0 KV |
| Bifrost/LiteLLM | :3030 | OFFLINE | — (proxy) | — | 0 |
| VLM HF | :8085 | READY (not started) | google/gemma-4-E4B-it NF4 | ~5-10 tok/s (est) | ~4 GB |
| **LiteRT-LM** | **:8070** | **RUNNING** | Gemma 4 E2B 2.4B | **~11 tok/s** | **0 MB** |
| **Ollama** | **:11434** | **RUNNING** | gemma4-legal 7.5B Q4_K_M | **22 tok/s gen, 83 tok/s prompt** | ~5 GB |

### Benchmark (same query: "List the four elements of negligence")

| Backend | Completion Tokens | Generation Speed | Thinking | Quality |
|---------|:-:|:-:|:-:|:-:|
| llama-server q4_0 KV | 600 (incl. thinking) | **75.4 tok/s** | Yes (separate `reasoning_content`) | Detailed + examples |
| Ollama | 200 (hit limit) | 22 tok/s | Yes (inline, strips with `think:false`) | Bluebook-aware |
| LiteRT CPU | 158 | ~11 tok/s | No | Concise, correct |

**Key insight**: llama-server is **3.4x faster** than Ollama on the same GGUF model. The q4_0 KV cache + flash attention make a huge difference.

---

## Startup Commands

### llama-server (Tier 3) — Windows native, CUDA
```bash
# Pre-built binary: C:\Users\james\Desktop\llama-server-cuda\llama-server.exe
# GGUF blob: C:\Users\james\.ollama\blobs\sha256-a79de882a921b9c3781a95a8ef555ea51e7c4dd685a8b2854e9bbe73ab081b43

C:\Users\james\Desktop\llama-server-cuda\llama-server.exe \
  -m "C:\Users\james\.ollama\blobs\sha256-a79de882a921b9c3781a95a8ef555ea51e7c4dd685a8b2854e9bbe73ab081b43" \
  --port 8090 -ngl 99 --flash-attn on -ctk q4_0 -ctv q4_0 -c 4096
```

### LiteRT-LM (Tier 6) — WSL, CPU
```bash
# Requires WSL with litert-lm + fastapi + uvicorn installed
# Model: ~/.litert-lm/models/gemma-4-E2B-it.litertlm/model.litertlm (2.4 GB)

wsl bash -lc "cd /mnt/c/Users/james/Videos/deeds-web-app/scripts && python3 litert-serve.py --port 8070"
```

### VLM Server (Tier 5) — WSL, CUDA + bitsandbytes NF4
```bash
# Requires: transformers, bitsandbytes, torch, peft, fastapi, uvicorn
# Downloads ~8 GB model on first run (google/gemma-4-E4B-it)
# WARNING: Needs ~4 GB VRAM — cannot run alongside llama-server

wsl bash -lc "cd /mnt/c/Users/james/Videos/deeds-web-app/scripts/vlm-server && python3 app.py --port 8085"

# With local adapter from GRPO training:
# python3 app.py --model google/gemma-4-E4B-it --adapter ./gemma4-legal-lora --port 8085
```

### Ollama (Tier 7) — Windows native
```bash
# Auto-starts on system boot. Models:
#   gemma4-legal:latest    — 7.5B Q4_K_M (5.0 GB) — primary LLM
#   embeddinggemma:latest  — 307M BF16 (622 MB) — 768-dim embeddings
#   gemma4:e4b-it-q4_K_M  — 8.0B Q4_K_M (9.6 GB) — VLM + tool calling
#   nomic-embed-text       — 137M F16 (274 MB) — fallback embeddings

ollama serve  # port 11434
```

---

## Key Files

| File | Purpose |
|------|---------|
| `sveltekit-frontend/src/lib/server/inference/inference-router.ts` | 7-tier cascade router (`routeInference`, `routeStreamingInference`, `getRouterStatus`) |
| `sveltekit-frontend/src/lib/server/observability/inference-log.ts` | CouchDB inference logging (`logLLMInference` — all 8 call sites pass full params) |
| `sveltekit-frontend/src/lib/ai/model-ids.ts` | Base URLs: `TURBOQUANT_BASE_URL`, `LITERT_BASE_URL`, `VLM_BASE_URL` |
| `sveltekit-frontend/src/lib/server/inference/gpu-arbiter.ts` | GPU lease system (TRT-LLM vs Ollama VRAM arbitration) |
| `scripts/litert-serve.py` | FastAPI wrapper for litert_lm.Engine (OpenAI-compatible) |
| `scripts/vlm-server/app.py` | FastAPI VLM server (HF Transformers + NF4 + vision) |

---

## Next Steps

### Completed (2026-04-10)
- [x] **Ollama VLM fallback wired** — `tryVlmServer()` cascades: HF server (:8085) → Ollama `gemma4:e4b-it-q4_K_M` via `/api/chat` with `images` field
- [x] **Stock E4B VLM verified** — Ollama reports `capabilities: ['completion', 'vision', 'audio', 'tools', 'thinking']`
- [x] **Disk cleanup** — freed ~17 GB (unsloth cache 11 GB + gemma-2-2b 891 MB + duplicate ollama dir 5 GB). C: 35 GB free.
- [x] **`reasoning_content` handling** — `tryTurboQuant()` now reads `msg.reasoning_content` as fallback when `msg.content` is empty (thinking mode)
- [x] **Model inventory** — all local model files audited, documented below

### Immediate (ready to do now)
- [ ] **Test Ollama VLM** — `curl` image + text to `gemma4:e4b-it-q4_K_M` via Ollama `/api/chat`, verify vision output
- [ ] **Test through SvelteKit dev server** — start `npm run dev`, hit `/api/infrastructure/status` to see full router status
- [ ] **Test dispatch-inline.ts** — upload evidence with RabbitMQ stopped to verify inline fallback chain works

### Short-term — Colab: Legal VLM GGUF with vision tensors
The existing `gemma4-legal-vlm-q4_k_m.gguf` (5 GB) is **text-only** (720 tensors, 0 vision/audio). The Ollama stock `gemma4:e4b-it-q4_K_M` gets vision via Ollama's runtime projector handling — **NOT** from tensors in the GGUF. llama-server/TurboQuant don't have this runtime projector support, so they need vision tensors baked into the GGUF.

**Goal**: Create a legal-fine-tuned GGUF with full VLM (vision + audio towers) for llama-server + turbo3 KV cache → ~75 tok/s with vision.

**Colab notebook steps** (need A100/L4 for RAM):
```python
# 1. Load merged VLM checkpoint (the 9.7 GB safetensors with LoRA baked in)
#    Already on Google Drive: gemma4-e4b-legal-final-gguf (1)/model.safetensors

# 2. Convert to GGUF with multimodal support
#    llama.cpp's convert_hf_to_gguf.py supports gemma4 multimodal since March 2026
!git clone https://github.com/ggml-org/llama.cpp
!pip install -r llama.cpp/requirements/requirements-convert_hf_to_gguf.txt
!python llama.cpp/convert_hf_to_gguf.py \
    /content/gemma4-legal-vlm-merged/ \
    --outfile gemma4-legal-vlm-full.gguf \
    --outtype q4_K_M

# 3. Verify vision tensors exist in output GGUF
from gguf import GGUFReader
reader = GGUFReader("gemma4-legal-vlm-full.gguf")
vision = [t.name for t in reader.tensors if 'vision' in t.name]
print(f"Vision tensors: {len(vision)}")  # Should be > 0

# 4. Upload to Google Drive → download to local
# Then run: llama-server -m gemma4-legal-vlm-full.gguf -ctk turbo3 -ctv turbo3 --port 8090
```

**Expected result**: ~6-7 GB GGUF with legal fine-tuning + vision tower, runnable on llama-server with turbo3 KV cache at ~75 tok/s.

### Other short-term
- [ ] **TurboQuant fork**: Build turboquant_plus with `turbo3` KV cache (needs CUDA toolkit in WSL — `nvidia-cuda-toolkit` install failed, retry with NVIDIA keyring repo)
- [ ] **VRAM time-sharing**: Add GPU arbiter logic so llama-server (:8090) and VLM (:8085) can share the 8 GB RTX 3060 Ti — unload one before loading the other
- [ ] **Streaming for LiteRT**: Current LiteRT streaming is fake (full response as single SSE chunk). Implement true token-by-token if litert_lm adds streaming API

### Medium-term
- [ ] **Playwright e2e**: Add inference router tests — mock backends, verify cascade fallthrough order
- [ ] **Auto-start script**: Create a single `scripts/start-inference.sh` that launches all available tiers in order
- [ ] **Monitoring dashboard**: Wire `getRouterStatus()` + `getDispatchStats()` + `getInferenceLogStats()` into the system-configuration admin panel

---

## Local Model Inventory (2026-04-10)

### On-Disk Model Files (C: drive)

| Location | Size | Format | VLM? | Purpose |
|----------|------|--------|------|---------|
| `Downloads/gemma4-e4b-legal-final-gguf (1)/.../model.safetensors` | **9.7 GB** | HF safetensors (single file) | **YES** — 435 vision + 344 audio + 2 embed keys, LoRA baked in | Merged VLM checkpoint for `app.py` (HF Transformers + NF4) |
| `Downloads/gemma4-legal-vlm-q4_k_m.gguf` | **5.0 GB** | GGUF Q4_K_M | **No** — 720 tensors, 0 vision/audio (text-only export) | TurboQuant / llama-server (text-only until Colab reconversion) |
| `Downloads/gemma4-e4b-legal-ollama/` | **5.0 GB** | Ollama Modelfile + GGUF | Text-only | Ollama import dir |
| `Downloads/gemma4-legal-final-adapters/.../gemma4-e4b-legal-grpo-lora/` | **193 MB** | PEFT LoRA (adapter_model.safetensors) | N/A (adapter only) | LoRA adapter for base `google/gemma-4-E4B-it` |
| `Downloads/model-00002-of-00002-003.safetensors` | **5.6 GB** | HF safetensors (shard 2/2) | **YES** — 658 vision keys | Second shard of 2-shard split (shard 1 not downloaded) |
| `.ollama/models/` | **8.6 GB** | Ollama blob storage | **YES** (`gemma4:e4b-it-q4_K_M` has vision+audio via runtime projector) | `gemma4-legal`, `gemma4:e4b-it-q4_K_M` (VLM), `embeddinggemma`, `nomic-embed-text` |

**Model architecture**: `Gemma4ForConditionalGeneration` (model_type: `gemma4`)
- `vision_tower` (SigLIP) — image understanding
- `audio_tower` — audio understanding
- `embed_vision` / `embed_audio` — multimodal projectors (Gemma4MultimodalEmbedder)
- Language model — 26 transformer layers, LoRA on q/k/v/o_proj + gate/up/down_proj (rank 16)

### HF Cache (~2 GB after cleanup)

| Model | Size | Status |
|-------|------|--------|
| `google/gemma-4-E4B-it` | 31 MB | Config/tokenizer only (no weights) |
| `ibm-granite/granite-docling-258m` | 501 MB | ACTIVE — used by docling OCR pipeline |
| `sentence-transformers/all-mpnet-base-v2` | 419 MB | Active — embedding model |
| `sentence-transformers/all-MiniLM-L6-v2` | 88 MB | Active — lightweight embeddings |
| `google/gemma-3-270m-it` | 1 KB | Config only |
| Others (nomic, DialoGPT, paligemma) | ~2 MB | Config/refs only |

**Deleted** (2026-04-10): `unsloth/gemma-4-E4B-it-unsloth-bnb-4bit` (11 GB), `google/gemma-2-2b-it` (891 MB), `gemma4-legal-ollama/` (5 GB duplicate)

### Disk Space Summary

| Consumer | Size | Notes |
|----------|------|-------|
| Docker (AppData/Local/Docker/) | **182 GB** | All containers — `docker system prune` for dangling |
| Ollama models | 8.6 GB | 4 active models |
| HF cache | ~2 GB | After cleanup (was 13 GB) |
| Pip cache | 7 GB | HTTP package cache — safe to purge |
| Model files in Downloads | ~25 GB | See inventory above |
| **C: free space** | **~30 GB** | After 2026-04-10 cleanup (was 2 GB) |

### VLM Startup (using local merged checkpoint)

The merged VLM at `gemma4-e4b-legal-final-gguf (1)/` is a **single 9.7 GB safetensors** file with all multimodal towers + LoRA baked in. No adapter needed — it's already merged.

```bash
# Stop llama-server first (needs ~4 GB VRAM, can't share with 8 GB card)
# Then:
python scripts/vlm-server/app.py \
  --model "C:\Users\james\Downloads\gemma4-e4b-legal-final-gguf (1)\gemma4-e4b-legal-final-gguf" \
  --port 8085

# No --adapter flag needed — LoRA weights already merged into safetensors
# NF4 quantization applied on load → ~4 GB VRAM
# Vision: POST /v1/chat/completions with base64 image_url
# Text:   POST /v1/chat/completions (standard)
# Health: GET /health → vlm_capable: true
```
