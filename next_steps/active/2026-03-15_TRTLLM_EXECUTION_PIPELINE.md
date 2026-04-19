# TRT-LLM Triton Inference — Execution Pipeline

## Date: March 15, 2026
## Status: SUPERSEDED — Docker image deleted, compose archived, engines never built (Apr 7 re-audit). Archive candidate.
## Hardware: RTX 3060 Ti (8GB VRAM, SM 86, Ampere)

---

## Quick Reference

### What's Already Done (re-audit April 7)
| Component | Status | Location |
|-----------|--------|----------|
| Docker image (`legal-ai-tensorrt-llm:latest`) | ❌ DELETED (freed C: space) | Was 83GB local Docker |
| Colab notebook | ✅ Ready (not executed) | `scripts/unsloth-training/Gemma3_12B_INT4_Quantize_and_Export.ipynb` |
| docker-compose.triton.yml | ❌ ARCHIVED | `deeds_labs/snapshots/2026-03-15-root/docker/` (not at root) |
| TRT engines | ❌ NEVER BUILT | No `/engines/` directory, no `.engine` files |
| SvelteKit routes | ✅ Wired (fallback to Ollama) | `/api/ai/tensorrt/*` — TRT path never reached |
| GPU arbiter (VRAM mutex) | ✅ Wired (dead code path) | `lib/server/inference/gpu-arbiter.ts` — lease never acquired |
| Inference router | ✅ Wired (always falls through) | `lib/server/inference/inference-router.ts` — TRT→Triton→Ollama, always lands on Ollama |

---

## Execution Steps

### Step 1: Run Colab Notebook on A100 (~20 min)

**Notebook**: `scripts/unsloth-training/Gemma3_12B_INT4_Quantize_and_Export.ipynb`

**What it does**:
1. Loads merged VLM from Google Drive (22.7GB FP16)
2. Extracts text decoder (`Gemma3ForCausalLM`) via safetensors key remapping
3. Exports SigLIP vision encoder → ONNX (~1.5GB)
4. Exports multi-modal projector → ONNX (~50MB)
5. Saves all to Drive

**Output structure**:
```
gemma3-12b-legal-trt-artifacts/
├── text_only_model/          (~21 GB) — extracted text decoder
├── onnx/
│   ├── siglip_vision.onnx    (~1.5 GB)
│   └── gemma_projector.onnx  (~50 MB)
└── export_manifest.json
```

**Open in Colab**: Upload the notebook and run all cells.

---

### Step 2: Download Artifacts from Google Drive (~10 min)

Download to local machine:
```
From: /content/drive/MyDrive/gemma3-12b-legal-trt-artifacts/
To:   c:\Users\james\Videos\deeds-web-app\trt_artifacts\
```

**Total size**: ~8 GB (INT4 checkpoint is much smaller than full model)

---

### Step 3: Build TRT Engines in Docker (~30 min)

Run the build script:
```bash
./scripts/build-trt-engines.sh
```

Or manually:
```bash
docker run --gpus all -it \
  -v ./trt_artifacts/text_only_model:/models/text_only:ro \
  -v ./trt_artifacts/onnx:/models/onnx:ro \
  -v ./engines:/models/engines \
  legal-ai-tensorrt-llm:latest bash

# Convert to INT4 checkpoint (weight-only, SM 86 compatible)
python3 examples/gemma/convert_checkpoint.py \
  --ckpt-type hf \
  --model-dir /models/text_only \
  --use-weight-only-with-precision int4 \
  --dtype bfloat16 \
  --world-size 1 \
  --output-model-dir /models/int4_checkpoint

# Build engine for RTX 3060 Ti
trtllm-build \
  --checkpoint_dir /models/int4_checkpoint \
  --gemm_plugin auto \
  --gpt_attention_plugin auto \
  --max_batch_size 4 \
  --max_input_len 2048 \
  --max_seq_len 4096 \
  --output_dir /models/engines/gemma3_12b_int4

# Build vision engines
trtexec --onnx=/models/onnx/siglip_vision.onnx \
  --saveEngine=/models/engines/siglip_vision.engine \
  --fp16 \
  --optShapes=pixel_values:1x3x384x384 \
  --maxShapes=pixel_values:4x3x384x384

trtexec --onnx=/models/onnx/gemma_projector.onnx \
  --saveEngine=/models/engines/gemma_projector.engine \
  --fp16
```

---

### Step 4: Start Triton Container (~2 min)

```bash
# Start Triton
docker compose -f docker-compose.triton.yml up triton-legal-ai -d

# Verify health
curl http://localhost:8099/v2/health/ready
```

Or use the startup script:
```bash
./scripts/start-triton.sh
```

---

## VRAM Budget

### Text-only Mode (95% of queries)
| Component | VRAM |
|-----------|------|
| Gemma3 12B INT4 engine | ~3,500 MB |
| KV cache (4096 tokens) | ~500 MB |
| CUDA runtime | ~300 MB |
| **Total** | **~4,300 MB / 8,192 MB** ✅ |

### VLM Mode (5% of queries, time-shared)
| Step | VRAM Delta |
|------|------------|
| 1. Load SigLIP | +1,500 MB |
| 2. Process image → features | (reuses SigLIP) |
| 3. Unload SigLIP | -1,500 MB |
| 4. Project → text tokens | +50 MB |
| 5. Generate with text engine | (existing engine) |

---

## SvelteKit Integration

### API Routes
| Route | Purpose | Status |
|-------|---------|--------|
| `/api/ai/tensorrt` | Text inference (lease → infer → release) | ✅ Wired |
| `/api/ai/tensorrt/stream` | SSE streaming | ✅ Wired |
| `/api/ai/tensorrt/vlm` | VLM (load vision → ensemble → unload) | ✅ Wired |

### Inference Router Priority
```
inference-router.ts: tryTensorRT() → tryLiteLLM() → tryOllama()
gpu-arbiter.ts: VRAM mutex (Ollama ↔ TRT-LLM ↔ LibTorch)
```

### Environment Variables
```env
PUBLIC_TRT_LLM_ENDPOINT=http://localhost:8099
TRT_LLM_GRPC_ENDPOINT=localhost:8098
```

---

## Troubleshooting

### CUDA out of memory
- Stop Ollama before starting Triton: `ollama stop`
- GPU arbiter should handle mutex, but manual stop is safer

### Engine build fails with "unsupported SM"
- RTX 3060 Ti is SM 86 (Ampere)
- Use `--use-weight-only-with-precision int4` NOT `int4_awq`
- INT4 AWQ + FP8 needs SM >= 89 (Ada/Hopper)

### Triton model not loading
- Check model repository structure matches Triton expectations
- Run with `--log-verbose=1` for details
- Verify engine files exist in mounted volumes

---

## Directory Structure

```
deeds-web-app/
├── docker-compose.triton.yml         # Triton container config (ports 8097-8099)
│
├── scripts/
│   ├── build-trt-engines.sh          # ✅ CREATED — Docker-based engine build script
│   ├── start-triton.sh               # ✅ CREATED — Triton orchestrator (start/stop/health)
│   └── unsloth-training/
│       └── Gemma3_12B_INT4_Quantize_and_Export.ipynb  # Colab export notebook
│
├── trt_artifacts/                    # ⬇️ DOWNLOAD from Google Drive after Colab
│   ├── text_only_model/              # (~21 GB) — extracted text decoder
│   │   ├── config.json
│   │   ├── model-00001-of-00005.safetensors
│   │   ├── model-00002-of-00005.safetensors
│   │   ├── model-00003-of-00005.safetensors
│   │   ├── model-00004-of-00005.safetensors
│   │   ├── model-00005-of-00005.safetensors
│   │   ├── model.safetensors.index.json
│   │   └── tokenizer.model
│   └── onnx/
│       ├── siglip_vision.onnx        # (~1.5 GB) — vision encoder
│       └── gemma_projector.onnx      # (~50 MB) — multimodal projector
│
├── engines/                          # 🔨 BUILT by build-trt-engines.sh
│   ├── gemma3_12b_int4/
│   │   ├── rank0.engine              # (~6.5 GB) — main TRT-LLM engine
│   │   └── config.json
│   ├── siglip_vision.engine          # (~1.5 GB) — vision TensorRT plan
│   └── gemma_projector.engine        # (~50 MB) — projector TensorRT plan
│
├── model_repository/                 # 🚀 CREATED by start-triton.sh
│   ├── gemma3_legal/
│   │   ├── config.pbtxt              # Triton model config
│   │   └── 1/                        # Version folder (symlink to engines/)
│   ├── siglip_vision/
│   │   ├── config.pbtxt
│   │   └── 1/model.plan
│   └── gemma_projector/
│       ├── config.pbtxt
│       └── 1/model.plan
│
└── sveltekit-frontend/src/
    ├── routes/api/ai/tensorrt/
    │   ├── +server.ts                # Text inference (lease → infer → release)
    │   ├── stream/+server.ts         # SSE streaming
    │   └── vlm/+server.ts            # VLM endpoint
    │
    └── lib/server/
        ├── inference/
        │   ├── inference-router.ts   # Router: TRT → LiteLLM → Ollama
        │   └── gpu-arbiter.ts        # VRAM mutex (Ollama ↔ TRT ↔ LibTorch)
        │
        └── embedding/
            ├── embed.ts              # Embedding facade (L3 Redis + L4 PostgreSQL)
            └── embedding-persist.ts  # ✅ CREATED — PostgreSQL L4 cache tier
```

---

## Files Reference

| File | Purpose | Status |
|------|---------|--------|
| `docker-compose.triton.yml` | Triton container config | EXISTS |
| `scripts/build-trt-engines.sh` | Automated engine build | ✅ CREATED |
| `scripts/start-triton.sh` | Orchestrated startup + health check | ✅ CREATED |
| `scripts/unsloth-training/Gemma3_12B_INT4_Quantize_and_Export.ipynb` | Colab export notebook | EXISTS |
| `src/routes/api/ai/tensorrt/+server.ts` | Text inference endpoint | EXISTS |
| `src/routes/api/ai/tensorrt/vlm/+server.ts` | VLM endpoint | EXISTS |
| `src/lib/server/inference/gpu-arbiter.ts` | VRAM mutex | EXISTS |
| `src/lib/server/inference/inference-router.ts` | Router priority chain | EXISTS |
| `src/lib/server/embedding/embed.ts` | Embedding with L3+L4 cache | ✅ UPDATED |
| `src/lib/server/embedding/embedding-persist.ts` | PostgreSQL L4 persistence | ✅ CREATED |
| `src/lib/config/env.server.ts` | Environment config |

---

## Next Actions

1. [x] Document pipeline (this file)
2. [ ] Run Colab notebook on A100
3. [ ] Download artifacts (~8GB)
4. [ ] Build engines locally (~30 min)
5. [ ] Start Triton and verify
6. [ ] Test `/api/ai/tensorrt` endpoint
