# TRT-LLM INT4 Engine Build — Step-by-Step Plan

## Date: March 10, 2026
## Status: NOT EXECUTED — engines never built, docker-compose archived (re-audit Apr 7)

---

## Prerequisites

| Requirement | Status |
|-------------|--------|
| Merged model on Google Drive | DONE — `/content/drive/MyDrive/gemma3-12b-legal-merged-16bit` (22.7GB) |
| LoRA adapter merged (3750 steps, r=16) | DONE — via `Gemma3_12B_Merge_and_TRT_Export.ipynb` |
| Architecture: `Gemma3ForConditionalGeneration` | CONFIRMED — VLM (text + vision) |
| RTX 3060 Ti (8GB, sm_86) | ACTIVE |
| Docker + NVIDIA Container Toolkit | INSTALLED |
| `Dockerfile.trtllm` (v0.21.0) | EXISTS |
| `hf_to_trt_gemma3_rank0.py` | EXISTS |

---

## Step 1: Run INT4 Quantization Notebook on Colab (~20-30 min)

**Notebook**: `scripts/unsloth-training/Gemma3_12B_INT4_Quantize_and_Export.ipynb`

**What it does**:
1. Loads merged VLM from Google Drive
2. Extracts text-only decoder (`Gemma3ForCausalLM`) — strips vision_tower + projector
3. Runs TRT-LLM `convert_checkpoint.py --use_weight_only --weight_only_precision int4_awq`
4. Exports SigLIP vision encoder to ONNX (~1.5GB)
5. Exports projection layers to ONNX (~50MB)
6. Saves all artifacts to Drive

**Why Colab**: INT4 AWQ calibration needs the full FP16 model in VRAM (~24GB). A100 has 40GB. RTX 3060 Ti only has 8GB.

**Outputs on Drive**:
```
/content/drive/MyDrive/gemma3-12b-legal-trt-artifacts/
├── int4_checkpoint/          (~6.5 GB) — quantized text decoder
│   ├── rank0.safetensors
│   └── config.json
├── siglip_vision.onnx        (~1.5 GB) — vision encoder
├── gemma_projector.onnx       (~50 MB) — projection layers
└── export_manifest.json       — metadata + checksums
```

---

## Step 2: Download Artifacts to Local (~8 GB total)

After notebook completes, download from Google Drive:

```
From: /content/drive/MyDrive/gemma3-12b-legal-trt-artifacts/
To:   c:\Users\james\Videos\deeds-web-app\trt_artifacts\
```

**Disk space needed**: ~8 GB (vs 22.7 GB for full model)
**Free space available**: ~38 GB after .crdownload cleanup

---

## Step 3: Build TRT Engines Locally in Docker (~30 min)

### 3a: Text Decoder Engine (INT4 AWQ)

```bash
# In WSL2 / Git Bash from repo root
./scripts/build-trt-engine-in-container.sh
```

This runs inside Docker with `--gpus all` on RTX 3060 Ti (sm_86):
1. Builds `legal-ai-trtllm:latest` image from `Dockerfile.trtllm`
2. Mounts INT4 checkpoint from `trt_artifacts/int4_checkpoint/`
3. Runs `trtllm-build` → compiles engine for sm_86
4. Output: `engines/gemma3_12b_int4/rank0.engine` (~6.5 GB)

### 3b: SigLIP Vision Engine

```bash
# Inside the TRT-LLM container
docker exec legal-ai-trtllm-builder \
    trtexec \
        --onnx=/models/siglip_vision.onnx \
        --saveEngine=/models/engines/siglip_vision.engine \
        --fp16 \
        --optShapes=pixel_values:1x3x384x384 \
        --maxShapes=pixel_values:4x3x384x384
```

Output: `engines/siglip_vision.engine` (~1.5 GB)

### 3c: Projector Engine

```bash
docker exec legal-ai-trtllm-builder \
    trtexec \
        --onnx=/models/gemma_projector.onnx \
        --saveEngine=/models/engines/gemma_projector.engine \
        --fp16
```

Output: `engines/gemma_projector.engine` (~50 MB)

### PTX Modularity

Three independent engines — each can be rebuilt without touching the others:

| Module | Engine | Size | Updates When |
|--------|--------|------|-------------|
| Text decoder | `rank0.engine` | ~6.5 GB | Fine-tune text model → re-quantize → rebuild |
| SigLIP vision | `siglip_vision.engine` | ~1.5 GB | Upgrade vision encoder → re-export ONNX → rebuild |
| Projector | `gemma_projector.engine` | ~50 MB | Retrain VLM → re-export projector → rebuild |

---

## Step 4: Restore Triton Model Configs

The configs were archived during consolidation. Restore them:

```bash
# From repo root
cp -r deeds_labs/legacy-projects/triton_models/ triton_models/
```

Required structure:
```
triton_models/
├── gemma_legal/
│   ├── config.pbtxt          — TRT-LLM backend, INT4 engine
│   └── 1/                    — engine symlinked or copied here
├── siglip_vision/
│   ├── config.pbtxt          — TensorRT backend, FP16
│   └── 1/model.plan          — SigLIP engine
├── gemma_projector/
│   ├── config.pbtxt          — TensorRT backend, FP16
│   └── 1/model.plan          — Projector engine
└── gemma_vlm_ensemble/
    └── config.pbtxt          — Ensemble wiring (SigLIP→Projector→Gemma)
```

---

## Step 5: Start Triton Inference Server

```bash
docker compose -f docker-compose.triton.yml up triton-legal-ai -d
```

Verify:
```bash
# Health check
curl http://localhost:8099/v2/health/ready

# Model status
curl http://localhost:8099/v2/models/gemma_legal/ready

# Load vision model on-demand
curl -X POST http://localhost:8099/v2/repository/models/siglip_vision/load
curl http://localhost:8099/v2/models/siglip_vision/ready
```

---

## Step 6: Test End-to-End

### Text-only inference (TRT INT4 engine)
```bash
curl -X POST http://localhost:5173/api/ai/tensorrt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Analyze breach of contract liability under UCC Article 2"}'
```

### VLM inference (SigLIP → Projector → Gemma3)
```bash
curl -X POST http://localhost:5173/api/ai/tensorrt/vlm \
  -F "image=@evidence_photo.jpg" \
  -F "prompt=Describe this evidence document"
```

### Existing SvelteKit routes (already wired)
| Route | Purpose |
|-------|---------|
| `src/routes/api/ai/tensorrt/+server.ts` | Text inference (lease → infer → release) |
| `src/routes/api/ai/tensorrt/stream/+server.ts` | SSE streaming |
| `src/routes/api/ai/tensorrt/vlm/+server.ts` | VLM (load vision → ensemble → unload) |

---

## VRAM Budget (RTX 3060 Ti = 8192 MB)

### Text-only mode (95% of queries)
| Component | VRAM |
|-----------|------|
| Gemma3 12B INT4 engine | ~6,600 MB |
| KV cache (4096 tokens) | ~500 MB |
| CUDA runtime | ~300 MB |
| **Total** | **~7,400 MB** |

### VLM mode (5% of queries — time-shared)
| Step | VRAM |
|------|------|
| 1. Unload text engine KV cache | -500 MB |
| 2. Load SigLIP | +1,500 MB |
| 3. Process image → embeddings | (uses SigLIP) |
| 4. Unload SigLIP | -1,500 MB |
| 5. Feed projected tokens to text engine | (uses existing engine) |

---

## Architecture Diagram

```
Client Request
     │
     ▼
SvelteKit API Route
     │
     ├── text-only ──→ Triton HTTP :8099 ──→ gemma_legal (TRT INT4)
     │                                         │
     │                                         └──→ Response (fast, ~100ms/token)
     │
     └── image+text ──→ Triton HTTP :8099 ──→ gemma_vlm_ensemble
                                                │
                                                ├── Step 1: siglip_vision (load, process, unload)
                                                ├── Step 2: gemma_projector (vision→text dims)
                                                └── Step 3: gemma_legal (generate with projected tokens)
```

---

## Estimated Timeline

| Step | Time | Where |
|------|------|-------|
| 1. Run quantization notebook | 20-30 min | Colab A100 |
| 2. Download artifacts | 10-20 min | Google Drive → local |
| 3a. Build text engine | 15-30 min | Local Docker (RTX 3060 Ti) |
| 3b. Build SigLIP engine | 5-10 min | Local Docker |
| 3c. Build projector engine | 2-3 min | Local Docker |
| 4. Restore Triton configs | 2 min | Local |
| 5. Start Triton | 2-5 min | Local Docker |
| 6. Test | 5 min | Local |
| **Total** | **~60-100 min** | |
