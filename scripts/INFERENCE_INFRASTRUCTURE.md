# Inference Infrastructure — 7-Tier Cascade

**Last verified**: 2026-04-11 (session continued)
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

> [!IMPORTANT]
> **Healthy != GPU Active**: The `/health` endpoint only confirms the server process is alive and responding. It does **not** verify that GPU offload is configured correctly or that VRAM is being used. 
> - **Verify GPU**: Always check `nvidia-smi` during generation. If GPU usage stays at 0% or VRAM doesn't increase, the server is running on CPU.
> - **Speculative Decoding**: Requires a valid draft model. If none is configured, it will be disabled automatically.


---

## Current Status (2026-04-11)

| Tier | Port | Status | Model | Speed | VRAM |
|------|------|--------|-------|-------|------|
| TensorRT-LLM | :8099 | OFFLINE | — | — | — |
| Triton | :8000 | OFFLINE | — | — | — |
| **llama-server** | **:8090** | **RUNNING + VLM** | gemma4-legal Q4_K_M + mmproj-BF16 | **80 tok/s gen, 601 tok/s prompt** | ~5.8 GB (text+vision) |
| Bifrost/LiteLLM | :3030 | OFFLINE | — (proxy) | — | 0 |
| VLM HF | :8085 | READY (not started) | google/gemma-4-E4B-it NF4 | ~5-10 tok/s (est) | ~4 GB |
| LiteRT-LM | :8070 | OFFLINE | Gemma 4 E2B 2.4B | ~11 tok/s | 0 MB |
| **Ollama** | **:11434** | **RUNNING** | gemma4-legal 7.5B Q4_K_M | **22 tok/s gen, 83 tok/s prompt** | ~5 GB |
| Ollama VLM | :11434 | AVAILABLE (fallback) | gemma4:e4b-it-q4_K_M | ~13 tok/s | ~5 GB (VRAM swap) |

### Benchmark (same query: "List the four elements of negligence")

| Backend | Completion Tokens | Generation Speed | Thinking | Quality |
|---------|:-:|:-:|:-:|:-:|
| llama-server q4_0 KV | 600 (incl. thinking) | **75.4 tok/s** | Yes (separate `reasoning_content`) | Detailed + examples |
| Ollama | 200 (hit limit) | 22 tok/s | Yes (inline, strips with `think:false`) | Bluebook-aware |
| LiteRT CPU | 158 | ~11 tok/s | No | Concise, correct |

**Key insight**: llama-server is **3.4x faster** than Ollama on the same GGUF model. The q4_0 KV cache + flash attention make a huge difference.

---

## Startup Commands

### llama-server (Tier 3) — Windows native, CUDA + Vision
```bash
# Pre-built binary: C:\Users\james\Desktop\llama-server-cuda\llama-server.exe
# Text GGUF: C:\Users\james\Downloads\gemma4-legal-vlm-q4_k_m.gguf (5.0 GB, E4B + legal LoRA)
# Vision mmproj: C:\Users\james\Downloads\gemma4-mmproj/mmproj-BF16.gguf (992 MB, Unsloth stock SigLIP)
# Total VRAM: ~5.8 GB (fits in 8 GB RTX 3060 Ti with room for KV cache)

C:\Users\james\Desktop\llama-server-cuda\llama-server.exe \
  -m "C:\Users\james\Downloads\gemma4-legal-vlm-q4_k_m.gguf" \
  --mmproj "C:\Users\james\Downloads\gemma4-mmproj/mmproj-BF16.gguf" \
  --port 8090 -ngl 99 --flash-attn on -ctk q4_0 -ctv q4_0 -c 4096

# Text-only (without vision): omit --mmproj, or use Ollama blob instead:
# -m "C:\Users\james\.ollama\blobs\sha256-a79de882a921b9c3781a95a8ef555ea51e7c4dd685a8b2854e9bbe73ab081b43"
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

### Completed (2026-04-10 → 2026-04-11)
- [x] **Ollama VLM fallback wired** — `tryVlmServer()` cascades: HF server (:8085) → Ollama `gemma4:e4b-it-q4_K_M` via `/api/chat` with `images` field
- [x] **Stock E4B VLM verified** — Ollama reports `capabilities: ['completion', 'vision', 'audio', 'tools', 'thinking']`
- [x] **Disk cleanup** — freed ~17 GB (unsloth cache 11 GB + gemma-2-2b 891 MB + duplicate ollama dir 5 GB). C: 35 GB free.
- [x] **`reasoning_content` handling** — `tryTurboQuant()` switched from `/v1/completions` to `/v1/chat/completions`, reads `msg.content || msg.reasoning_content`. Streaming reads `delta.content ?? delta.reasoning_content`. **Verified live**: content=202 chars, reasoning=1061 chars, 308 tok @ ~38 tok/s
- [x] **Model inventory** — all local model files audited, documented below
- [x] **VRAM swap** — `tryOllamaVlm()` stops llama-server via `findTurboQuantProcess()` → `taskkill`, runs VLM, then fire-and-forget restarts llama-server via `spawn()`. Ollama VLM model unloaded (`keep_alive: 0`) before restart to free VRAM
- [x] **VLM cascade in VLM endpoint** — `/api/ai/tensorrt/vlm` now tries: Triton ensemble → direct Ollama VLM → inference router (VRAM swap)
- [x] **`getRouterStatus()` expanded** — now includes `ollamaVlm` availability check + `visionAvailable` field
- [x] **`logLLMInference` audit** — all 8 call sites pass `tokenCount`; Triton + Bifrost fixed (were missing)

### Immediate
- [x] **Test Ollama VLM** — 2x2 red PNG → "Red" @ 33 tok/s. VRAM conflict when llama-server loaded (expected); works after VRAM swap
- [x] **Test through SvelteKit dev server** — `/api/infrastructure/status` returns: `preferredBackend: turboquant`, `visionAvailable: true`, `ollamaVlm: available`, 174ms latency
- [x] **Model matrix verified** — `gemma4:e4b-it-q4_K_M` (8.0B, vision+audio+tools+thinking) vs `gemma4-legal` (7.5B, text-only). llama-server runs 7.5B text, Ollama VLM loads 8.0B multimodal on demand
- [x] **Dispatch-inline verified** — `getDispatchStats()` live: 48 queued / 0 inline / 0 skipped / 0 errors. RabbitMQ v4.1.0 healthy (87 queues). Inline fallback not triggered (correct — RabbitMQ is up). Full integration wired to `/api/infrastructure/status`
- [x] **Unified VLM via mmproj** — Downloaded `gemma4-mmproj/mmproj-BF16.gguf` (992 MB) from `unsloth/gemma-4-E4B-it-GGUF`. llama-server with `--mmproj` handles text+vision in a single process. 80.6 tok/s gen, 601 tok/s prompt. 5.8 GB total VRAM (fits in 8 GB). **No VRAM swap needed.**
- [x] **Inference router updated** — Vision cascade: TurboQuant (mmproj) → HF VLM → Ollama VLM. `tryTurboQuant()` now sends OpenAI image_url content parts. `getRouterStatus()` checks `/props` for `modalities.vision`.
- [x] **End-to-end VLM verified** — `/api/ai/tensorrt/vlm` → inference router → TurboQuant → correct document extraction. 6.4s latency for legal document OCR.

### RESOLVED: Colab VLM GGUF reconversion — NOT NEEDED
~~The existing `gemma4-legal-vlm-q4_k_m.gguf` (5 GB) is text-only (720 tensors, 0 vision/audio).~~

**Solution**: llama.cpp supports vision via a **separate mmproj GGUF file** (the SigLIP vision encoder + projector). No need to bake vision tensors into the text GGUF.

- Text GGUF: `gemma4-legal-vlm-q4_k_m.gguf` (5.0 GB) — legal fine-tuned, text-only
- Vision mmproj: `gemma4-mmproj/mmproj-BF16.gguf` (992 MB) — stock Unsloth SigLIP, compatible with legal fine-tune (LoRA trained with vision tower frozen)
- Combined: `llama-server -m text.gguf --mmproj mmproj.gguf` → unified text+vision at 80 tok/s
- VRAM: 5.8 GB total (text + mmproj + q4_0 KV cache) — fits in 8 GB

### Other short-term
- [ ] **TurboQuant fork**: Build turboquant_plus with `turbo3` KV cache (needs CUDA toolkit in WSL — `nvidia-cuda-toolkit` install failed, retry with NVIDIA keyring repo). Current build uses `q4_0` KV cache (still good — ~4x compression).
- [x] **VRAM time-sharing**: ~~Add GPU arbiter logic~~ — DONE via `tryOllamaVlm()` VRAM swap. Now largely obsolete since mmproj eliminates VRAM conflicts, but kept as fallback.
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
| `Downloads/gemma4-legal-vlm-q4_k_m.gguf` | **5.0 GB** | GGUF Q4_K_M | **No** — 720 tensors, text-only. Vision via separate mmproj | TurboQuant / llama-server text model |
| `Downloads/gemma4-mmproj/mmproj-BF16.gguf` | **992 MB** | GGUF BF16 | **YES** — SigLIP vision encoder + projector | `--mmproj` for llama-server VLM (stock, compatible with legal fine-tune) |
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
