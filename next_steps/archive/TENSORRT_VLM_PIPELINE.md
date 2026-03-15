# TensorRT VLM Pipeline — Status & Next Steps

## Session Summary (March 9, 2026)

### What Was Done

**Research & Root Cause Analysis:**
- Traced why TRT engine build failed in Nov 2025: ran `convert_checkpoint.py` on Windows Python (`C:\Python313`) instead of inside Linux container
- Identified `hidden_size: 3840` IS the correct Gemma3 12B text decoder dimension (not vision encoder)
- Confirmed via NVIDIA GitHub (#4815, #5286): TRT engine build only supports `Gemma3ForCausalLM` (text-only), NOT `Gemma3ForConditionalGeneration` (VLM)
- Designed Triton ensemble architecture to work around 8GB VRAM limit

**Files Created:**

| File | Purpose |
|------|---------|
| `scripts/build-trt-engine-in-container.sh` | Full orchestration: docker build → copy safetensors → convert HF→TRT-LLM → build INT4 engine |
| `scripts/export-siglip-onnx.py` | SigLIP-SO400M vision encoder → ONNX → optional TRT engine |
| `scripts/export-projector.py` | Extract VLM projection layers (1152-dim → 3840-dim) to ONNX |
| `triton_models/siglip_vision/config.pbtxt` | Triton config: FP16 vision encoder, on-demand GPU loading |
| `triton_models/gemma_projector/config.pbtxt` | Triton config: linear projection bridge |
| `triton_models/gemma_vlm_ensemble/config.pbtxt` | Triton ensemble: SigLIP → Projector → Gemma3 text |
| `sveltekit-frontend/src/routes/api/ai/tensorrt/vlm/+server.ts` | VLM API route with on-demand vision model load/unload |

**Files Modified:**

| File | Change |
|------|--------|
| `Dockerfile.trtllm` | Pinned to `nvcr.io/nvidia/tensorrt-llm/release:v0.21.0`, stripped bloat, added converter scripts |
| `docker-compose.triton.yml` | Updated mounts (triton_models/ + engine volume), added `--model-control-mode=explicit` |
| `triton_models/gemma_legal/config.pbtxt` | Switched from `onnxruntime_onnx` to `tensorrtllm` backend, correct vocab 262208 |
| `src/lib/components/ui/AIDropdown.svelte` | Fixed bits-ui v2 `DropdownMenu.Label` → `<div>` (Label not exported in v2.16.2) |
| `src/lib/stores/index.ts` | Added `userStore` re-export to barrel |

**Verification:** svelte-check 0/0, vite build exit 0

---

## Architecture: VRAM Time-Sharing

```
RTX 3060 Ti (8GB VRAM)

95% of queries — text-only legal Q&A:
┌─────────────────────────────┐
│ Gemma3 12B INT4 (~6.6GB)    │  ← always loaded
│ TRT engine via Triton       │
└─────────────────────────────┘

5% of queries — evidence photos, POI images:
┌─────────────────────────────┐
│ 1. Load SigLIP (~1.5GB)     │  ← on-demand via model control API
│ 2. Process image → tokens   │
│ 3. Unload SigLIP            │
│ 4. Feed tokens to Gemma3    │
└─────────────────────────────┘
```

Monolithic VLM won't fit (6.6GB text + 1.5GB vision + KV cache > 8GB).
Ensemble approach time-shares the GPU.

---

## What's Needed to Go Live

### Step 1: Build the TRT Engine (manual, ~30 min)

The safetensors exist (`tensorrt_build/input/`, 922 tensors, 18.1GB).
The converter exists (`hf_to_trt_gemma3_rank0.py`).
Just needs to run inside the container:

```bash
# From repo root
./scripts/build-trt-engine-in-container.sh
```

This will:
1. `docker build -f Dockerfile.trtllm` → image
2. Start container with `--gpus all`
3. Run `hf_to_trt_gemma3_rank0.py` (HF → TRT-LLM tensor remapping + QKV fusion)
4. Run `trtllm-build` with INT4 AWQ config
5. Output engine to `engines/gemma3_12b_int4/`

**Prerequisite:** NVIDIA Container Toolkit installed. Verify with `docker run --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi`.

### Step 2: Export Vision Models (manual, ~15 min)

```bash
# Needs: pip install transformers torch onnx safetensors
python scripts/export-siglip-onnx.py --output-dir triton_models/siglip_vision/1
python scripts/export-projector.py --output-dir triton_models/gemma_projector/1
```

### Step 3: Start Triton

```bash
docker compose -f docker-compose.triton.yml up triton-legal-ai
```

Verify:
```bash
curl http://localhost:8099/v2/health/ready
curl http://localhost:8099/v2/models/gemma_legal/ready
```

### Step 4: Test Inference

```bash
# Text-only (existing route, already wired)
curl -X POST http://localhost:5173/api/ai/tensorrt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Analyze breach of contract liability"}'

# VLM (new route)
curl -X POST http://localhost:5173/api/ai/tensorrt/vlm \
  -F "image=@evidence_photo.jpg" \
  -F "prompt=Describe this evidence document"
```

---

## Known Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|------------|
| **8GB VRAM** | Can't load text + vision simultaneously | Time-sharing via Triton model control API |
| **No TRT engine for VLM** | NVIDIA only supports PyTorch backend for Gemma3 VLM | Split into 3 models (SigLIP + Projector + Text decoder) |
| **INT4 AWQ calibration** | Needs full BF16 model loaded (~24GB) | Calibrate on cloud GPU or CPU offload, deploy quantized engine locally |
| **Triton v24.10** | May not have latest TRT-LLM backend | Update to `tritonserver:25.05-trtllm-python-py3` if needed |

---

## Existing Infrastructure (Already Wired)

These components are DONE and ready:

| Component | File | Status |
|-----------|------|--------|
| TRT-LLM client (OpenAI-compat) | `src/lib/server/trt-llm.ts` | `inferLLM()` + `streamLLM()` |
| GPU arbiter (Redis lease) | `src/lib/server/inference/gpu-arbiter.ts` | Handles TRT ↔ Ollama mutual exclusion |
| Text-only TRT route | `src/routes/api/ai/tensorrt/+server.ts` | Lease → infer → release |
| SSE streaming TRT route | `src/routes/api/ai/tensorrt/stream/+server.ts` | Lease → stream → release |
| VLM TRT route | `src/routes/api/ai/tensorrt/vlm/+server.ts` | Load vision → ensemble → unload vision |
| Triton compose stack | `docker-compose.triton.yml` | Triton + Postgres + Redis + Prometheus + Grafana |
| HF→TRT tensor converter | `hf_to_trt_gemma3_rank0.py` | QKV fusion, 48-layer remapping |
| Safetensor validator | `validate_safetensors.py` | Checks embeddings, layers, hidden_size |
| INT4 AWQ config | `tensorrt_build/input/build_config_int4.json` | 4-bit AWQ, 4096 max tokens |

---

## Python Venvs (Cleanup Opportunity)

| Venv | Size | Status | Action |
|------|------|--------|--------|
| `.venv` | large | ACTIVE (Python 3.13, 645 packages) | KEEP |
| `.python311` | ~2GB | Stale WSL experiment | Safe to delete |
| `tensorrt_py310_env` | small | Only numpy + safetensors | Safe to delete (converter runs in container now) |
