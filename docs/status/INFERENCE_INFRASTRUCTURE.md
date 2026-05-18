# Inference Infrastructure — April 11, 2026

**Status**: TurboQuant VLM unified backend operational

---

## Architecture Overview

The platform uses a 7-tier inference cascade with separate text-only and vision paths. **TurboQuant llama-server with `--mmproj`** is now the primary VLM backend, eliminating the need for VRAM swapping between text and vision tasks.

### Text-Only Cascade (Priority Order)

```
User Query (text)
  ↓
1. TensorRT-LLM (:8099)          — INT4 AWQ, ~120 tok/s, 7.4GB VRAM
   ├─ Health: GET /v2/health/ready
   ├─ GPU lease required (gpu-arbiter.ts)
   └─ Fallback: VRAM < 4GB or lease unavailable
  ↓
2. Triton (:8000)                — Production TRT backend
   ├─ Health: GET /v2/health/ready
   └─ Fallback: Triton offline
  ↓
3. TurboQuant (:8090)            — q8_0 KV cache (stable default), ~80 tok/s, 3.4GB VRAM
   ├─ Health: GET /health
   ├─ Vision: GET /props → modalities.vision
   └─ Fallback: llama-server not running
  ↓
4. Bifrost (:3040 proxy)         — LiteLLM semantic cache (if enabled)
   ├─ 28x speedup on repeated queries
   └─ Fallback: cache miss or disabled
  ↓
5. HF VLM (:8085)                — Text fallback, NF4 quantized
   ├─ Health: GET /health
   └─ Fallback: Python server offline
  ↓
6. LiteRT-LM (:8070)             — CPU sidecar, Gemma 4 E2B, ~15 tok/s
   ├─ Health: GET /health
   ├─ XNNPACK CPU backend, no VRAM
   └─ Fallback: FastAPI server not running
  ↓
7. Ollama (:11434)               — Final fallback, gemma4-legal Q4_K_M
   ├─ Always available (dev + prod)
   └─ 7.3GB VRAM, ~50 tok/s
```

### Vision (Image + Text) Cascade

```
User Query (image + text)
  ↓
1. TurboQuant with --mmproj (:8090)  — PRIMARY VLM, ~80 tok/s
   ├─ Unified text+vision inference (no VRAM swap)
   ├─ SigLIP vision encoder via --mmproj siglip.gguf
   ├─ OpenAI-compatible /v1/chat/completions with image_url
   ├─ 5GB VRAM total (3.4GB text + 1.6GB vision encoder)
   └─ Fallback: llama-server started without --mmproj
  ↓
2. HF VLM Server (:8085)             — Legal fine-tuned Gemma 4 E4B
   ├─ Health: GET /health
   ├─ NF4 quantization, ~40 tok/s
   ├─ 9.2GB VRAM (full model + vision tower)
   └─ Fallback: Python FastAPI server offline
  ↓
3. Ollama VLM (:11434)               — Stock Gemma 4 E4B multimodal
   ├─ Model: gemma4:e4b-it-q4_K_M
   ├─ Stock SigLIP tower (frozen during legal GRPO training)
   ├─ 9.6GB VRAM, ~30 tok/s
   ├─ VRAM swap: stops TurboQuant (text) → runs VLM → restarts TurboQuant
   └─ Final fallback: returns error if all vision backends offline
```

---

## Key Innovation: Unified TurboQuant VLM

### Before (March 2026)
- **Problem**: llama-server (text-only) and Ollama VLM (vision) couldn't coexist on 8GB VRAM
- **Solution**: VRAM swap — stop llama-server, run VLM, restart llama-server
- **Cost**: ~8s overhead per VLM query (process stop/start + 3s VRAM release delay)

### After (April 2026)
- **Solution**: llama-server with `--mmproj` flag handles both text AND vision
- **Performance**: Same ~80 tok/s for vision as text-only
- **VRAM**: 5GB total (3.4GB text decoder + 1.6GB SigLIP encoder, loaded on-demand)
- **Latency**: **Zero VRAM swap overhead** — vision encoder loads in ~200ms on first image

### Startup Command

```bash
# Text + Vision (unified)
llama-server \
  -m gemma4-legal.gguf \
  --mmproj siglip.gguf \
  -ctk q8_0 \
  -ctv q8_0 \
  --port 8090 \
  -ngl 99 \
  --flash-attn on \
  -c 4096

# Text-only (fallback if mmproj unavailable)
llama-server \
  -m gemma4-legal.gguf \
  -ctk q8_0 \
  -ctv q8_0 \
  --port 8090 \
  -ngl 99 \
  --flash-attn on \
  -c 4096
```

### Vision Capability Detection

The inference router checks `/props` endpoint:

```bash
curl http://localhost:8090/props
```

Response with vision enabled:
```json
{
  "default_generation_settings": { ... },
  "modalities": {
    "text": true,
    "vision": true  ← Indicates --mmproj loaded
  }
}
```

Router extracts `modalities.vision` and uses it to determine VLM routing priority.

---

## VRAM Budget (RTX 3060 Ti = 8192 MB)

| Backend | Mode | VRAM | Speed | Notes |
|---------|------|------|-------|-------|
| **TensorRT-LLM** | Text | 7.4 GB | ~120 tok/s | INT4 AWQ, requires GPU lease |
| **Triton** | Text | 7.4 GB | ~110 tok/s | Production TRT backend |
| **TurboQuant** | Text | 3.4 GB | ~80 tok/s | stable q8_0 KV cache (turbo3 benchmark-only) |
| **TurboQuant** | Vision | 5.0 GB | ~80 tok/s | +1.6GB for SigLIP (on-demand) |
| **HF VLM** | Vision | 9.2 GB | ~40 tok/s | Needs offload or swap |
| **Ollama VLM** | Vision | 9.6 GB | ~30 tok/s | Requires VRAM swap from TurboQuant |
| **LiteRT** | Text | 0 MB | ~15 tok/s | CPU-only, XNNPACK backend |
| **Ollama** | Text | 7.3 GB | ~50 tok/s | Q4_K_M quantization |

### VRAM Swap Conditions (Deprecated with TurboQuant VLM)

**Old behavior (still active as fallback #3):**
1. Vision request arrives
2. TurboQuant (text-only) fails → try Ollama VLM
3. Ollama VLM OOM (VRAM full) → VRAM swap activates:
   - Stop llama-server (frees 3.4GB)
   - Wait 3s for VRAM release
   - Run Ollama VLM (9.6GB)
   - Unload VLM model (`keep_alive: 0`)
   - Restart llama-server

**New behavior (primary path):**
1. Vision request arrives
2. TurboQuant with --mmproj handles it directly → **no swap needed**
3. If TurboQuant unavailable → try HF VLM → try Ollama VLM with swap

---

## Service Endpoints

| Service | Port | Health Check | Purpose |
|---------|------|--------------|---------|
| TensorRT-LLM | 8099 | `GET /v2/health/ready` | INT4 AWQ inference |
| Triton | 8000 | `GET /v2/health/ready` | Production TRT backend |
| TurboQuant | 8090 | `GET /health` + `GET /props` | Unified text + vision |
| HF VLM Server | 8085 | `GET /health` | Legal fine-tuned VLM |
| LiteRT-LM | 8070 | `GET /health` | CPU sidecar |
| Ollama | 11434 | `GET /api/tags` | Text + VLM fallback |
| Bifrost (LiteLLM) | 3040 | N/A (proxy) | Semantic cache |

---

## API Routes

| Route | Method | Backend | Description |
|-------|--------|---------|-------------|
| `/api/ai/tensorrt` | POST | TensorRT-LLM | Text inference with GPU lease |
| `/api/ai/tensorrt/stream` | POST | TensorRT/Triton | SSE streaming inference |
| `/api/ai/tensorrt/vlm` | POST | Triton VLM | Vision ensemble (SigLIP + Gemma) |
| `/api/inference/route` | POST | Auto-cascade | Auto-selects best backend |
| `/api/inference/status` | GET | — | Router health + VRAM stats |

### Example: Vision Request to Unified Router

```bash
curl -X POST http://localhost:5173/api/inference/route \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Describe this evidence photo",
    "imageBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
    "maxTokens": 512,
    "temperature": 0.3
  }'
```

Response:
```json
{
  "text": "This image shows a signed contract dated March 15, 2024...",
  "model": "gemma4-legal-q8_0",
  "backend": "turboquant",
  "usage": {
    "prompt_tokens": 156,
    "completion_tokens": 89,
    "total_tokens": 245
  },
  "latencyMs": 1847
}
```

---

## Performance Metrics

### Measured April 10, 2026 (RTX 3060 Ti, CUDA 13.0)

| Backend | Text (512 tok) | Vision (512 tok) | Cold Start | Notes |
|---------|----------------|------------------|------------|-------|
| TensorRT-LLM | 4.2s (120 tok/s) | N/A | 800ms | GPU lease overhead |
| Triton | 4.6s (110 tok/s) | 12.8s (40 tok/s) | 1.2s | Ensemble SigLIP load |
| TurboQuant | 6.4s (80 tok/s) | 6.6s (77 tok/s) | 200ms | Unified VLM |
| HF VLM | N/A | 12.8s (40 tok/s) | 3.5s | Python FastAPI |
| Ollama VLM | N/A | 17.1s (30 tok/s) | 11.2s | +8s VRAM swap overhead |
| LiteRT | 34s (15 tok/s) | N/A | 50ms | CPU-only |
| Ollama | 10.2s (50 tok/s) | N/A | 400ms | Q4_K_M |

**Key Insight**: TurboQuant VLM is **2.6x faster** than Ollama VLM and **1.9x faster** than HF VLM for vision tasks, with **zero VRAM swap overhead**.

---

## Monitoring

### Router Status API

```bash
curl http://localhost:5173/api/inference/status
```

Returns:
```json
{
  "tensorrt": { "available": true, "url": "http://localhost:8099", "vramSufficient": false },
  "triton": { "available": false, "url": "http://localhost:8000" },
  "turboquant": { "available": true, "url": "http://localhost:8090", "kvCache": "q8_0", "visionCapable": true },
  "vlm": { "available": false, "url": "http://localhost:8085" },
  "ollamaVlm": { "available": true, "model": "gemma4:e4b-it-q4_K_M" },
  "litert": { "available": true, "url": "http://localhost:8070" },
  "ollama": { "url": "http://localhost:11434" },
  "gpu": {
    "leaseHolder": null,
    "leaseFree": true,
    "vram": { "totalMB": 8192, "usedMB": 5930, "freeMB": 2095 },
    "temperature": 41,
    "utilization": 6
  },
  "visionAvailable": true,
  "preferredBackend": "turboquant"
}
```

### GPU Monitor

```bash
nvidia-smi --query-gpu=memory.used,memory.free,temperature.gpu,utilization.gpu --format=csv,noheader,nounits
```

Output:
```
5930, 2095, 41, 6
```

---

## Observability

### Langfuse Integration

All inference routes are instrumented with Langfuse tracing:

```typescript
import { traceLLM } from '$lib/server/observability/langfuse.js';

const response = await traceLLM('legal-query', { model, prompt }, async (gen) => {
  const result = await ollamaFetch(...);
  gen.end({ output: result.text, usage: result.usage });
  return result;
});
```

**Dashboard**: http://localhost:3030 (Langfuse UI)

### CouchDB Inference Log

Buffered writes to `inference_log` database:

```typescript
import { logLLMInference } from '$lib/server/observability/inference-log.js';

logLLMInference({
  model: 'gemma4-legal-q8_0',
  backend: 'turboquant',
  latencyMs: 1847,
  tokenCount: 245,
  cacheHit: false
});
```

Stats endpoint:
```bash
curl http://localhost:5173/api/infrastructure/status
```

Returns:
```json
{
  "inferenceLog": {
    "buffered": 3,
    "totalLogged": 1247,
    "totalFlushed": 1244,
    "flushErrors": 0,
    "cleanupActive": true
  }
}
```

---

## Migration Guide

### From Ollama VLM to TurboQuant VLM

**Old setup** (separate processes):
```bash
# Terminal 1: Text inference
ollama serve

# Terminal 2: Vision inference (conflicts with text)
# No simultaneous operation possible on 8GB VRAM
```

**New setup** (unified):
```bash
# Single process handles both text + vision
llama-server -m gemma4-legal.gguf --mmproj siglip.gguf \
  -ctk q8_0 -ctv q8_0 --port 8090 -ngl 99 --flash-attn on
```

**Code changes**: NONE — inference-router.ts auto-detects vision capability via `/props`

**Performance gain**:
- Vision latency: 17.1s → 6.6s (2.6x faster)
- Eliminates 8s VRAM swap overhead
- Allows concurrent text + vision queries (vision encoder loads on-demand)

---

## Troubleshooting

### TurboQuant Vision Not Detected

**Check `/props` endpoint**:
```bash
curl http://localhost:8090/props | jq '.modalities'
```

Expected:
```json
{ "text": true, "vision": true }
```

If `vision: false`, restart with `--mmproj`:
```bash
llama-server -m gemma4-legal.gguf --mmproj siglip.gguf ...
```

### VRAM OOM on Vision Requests

**Symptom**: Vision requests return 500, logs show "CUDA out of memory"

**Diagnosis**:
```bash
nvidia-smi
```

If `Memory-Usage` > 6.5 GB, the vision encoder (1.6GB) won't fit.

**Solutions**:
1. Stop Ollama (frees 7.3 GB): `taskkill /F /IM ollama.exe`
2. Use LiteRT CPU fallback (no VRAM)
3. Reduce TurboQuant context: `-c 2048` instead of `-c 4096` (saves ~400 MB)

### Fallback Chain Not Working

**Check router status**:
```bash
curl http://localhost:5173/api/inference/status | jq '.preferredBackend'
```

If stuck on unavailable backend, verify health checks:
```bash
# TurboQuant
curl http://localhost:8090/health

# HF VLM
curl http://localhost:8085/health

# Ollama
curl http://localhost:11434/api/tags
```

Router auto-cascades — if preferred backend is unavailable but health check passes, check GPU lease conflicts.

---

## Future Enhancements

1. **TensorRT VLM Ensemble** (Phase E): SigLIP FP16 → Gemma INT4 AWQ → 120 tok/s vision
2. **Bifrost Vision Cache**: Semantic cache for repeated vision queries (not yet supported by LiteLLM)
3. **Multi-image Requests**: Extend TurboQuant to handle multiple images in single request
4. **LoRA Adapters**: Runtime adapter swapping for domain-specific vision (medical, legal, forensic)

---

## Related Documentation

- [sveltekit-frontend/next_steps/TODO_TRTLLM_TRITON.md](sveltekit-frontend/next_steps/TODO_TRTLLM_TRITON.md) — TRT-LLM deployment checklist
- [sveltekit-frontend/next_steps/11-wiring-production-quality.md](sveltekit-frontend/next_steps/11-wiring-production-quality.md) — Production readiness
- [memory/docker-cuda-setup.md](.claude/memory/docker-cuda-setup.md) — Docker + CUDA configuration
- [scripts/unsloth-training/Gemma4_Serving_Inference_Eval.ipynb](scripts/unsloth-training/Gemma4_Serving_Inference_Eval.ipynb) — VLM serving evaluation
