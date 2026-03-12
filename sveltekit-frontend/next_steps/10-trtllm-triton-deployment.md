# TRT-LLM Triton Inference — Deployment Checklist

## Status: READY TO EXECUTE
## Last Updated: March 11, 2026

---

## Existing Infrastructure (Already Built)

| Component | File | Status |
|-----------|------|--------|
| Dockerfile | `Dockerfile.trtllm` (v0.21.0) | READY |
| Docker Compose | `docker-compose.triton.yml` (Triton+PG+Redis+Prometheus+Grafana) | READY |
| HF→TRT converter | `hf_to_trt_gemma3_rank0.py` | READY |
| Build orchestrator | `scripts/build-trt-engine-in-container.sh` (222 lines) | READY |
| SigLIP ONNX export | `scripts/export-siglip-onnx.py` | READY |
| Projector ONNX export | `scripts/export-projector.py` | READY |
| INT4 quantization notebook | `scripts/unsloth-training/Gemma3_12B_INT4_Quantize_and_Export.ipynb` | READY |
| Triton model configs | `deeds_labs/legacy-projects/triton_models/` (4 configs) | ARCHIVED |
| TRT-LLM client | `src/lib/server/trt-llm.ts` | WIRED |
| API: text inference | `src/routes/api/ai/tensorrt/+server.ts` | WIRED |
| API: SSE streaming | `src/routes/api/ai/tensorrt/stream/+server.ts` | WIRED |
| API: VLM inference | `src/routes/api/ai/tensorrt/vlm/+server.ts` | WIRED |
| GPU arbiter | `src/lib/server/inference/gpu-arbiter.ts` | WIRED |
| Health endpoint | `src/routes/api/health/+server.ts` (TRT+Triton probes) | WIRED |
| Build steps doc | `next_steps/TRT_ENGINE_BUILD_STEPS.md` (245 lines) | DONE |
| Directory audit | `next_steps/TRT_DIRECTORY_CONSOLIDATION.md` | DONE |

---

## Deployment Checklist

### Phase 1: Colab Quantization (~20-30 min)
- [ ] Open `scripts/unsloth-training/Gemma3_12B_INT4_Quantize_and_Export.ipynb` in Colab
- [ ] Connect to A100 GPU runtime (INT4 AWQ calibration needs ~24GB VRAM)
- [ ] Mount Google Drive (merged model at `/content/drive/MyDrive/gemma3-12b-legal-merged-16bit`)
- [ ] Run all 9 cells
- [ ] Verify outputs on Drive:
  - [ ] `gemma3-12b-legal-trt-artifacts/int4_checkpoint/rank0.safetensors` (~6.5GB)
  - [ ] `gemma3-12b-legal-trt-artifacts/siglip_vision.onnx` (~1.5GB)
  - [ ] `gemma3-12b-legal-trt-artifacts/gemma_projector.onnx` (~50MB)
  - [ ] `gemma3-12b-legal-trt-artifacts/export_manifest.json`

### Phase 2: Download Artifacts (~10-20 min)
- [ ] Download from Google Drive to `c:\Users\james\Videos\deeds-web-app\trt_artifacts\`
- [ ] Verify disk space: ~8GB needed (~38GB free after .crdownload cleanup)
- [ ] Verify checksums match `export_manifest.json`

### Phase 3: Build TRT Engines (~30-45 min)
- [ ] Ensure Docker Desktop is running with WSL2 GPU passthrough
- [ ] Verify NVIDIA Container Toolkit: `docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi`
- [ ] Build text decoder engine (INT4 AWQ, sm_86):
  ```bash
  ./scripts/build-trt-engine-in-container.sh
  ```
- [ ] Verify output: `engines/gemma3_12b_int4/rank0.engine` (~6.5GB)
- [ ] Build SigLIP vision engine:
  ```bash
  docker exec legal-ai-trtllm-builder trtexec \
    --onnx=/models/siglip_vision.onnx \
    --saveEngine=/models/engines/siglip_vision.engine \
    --fp16 --optShapes=pixel_values:1x3x384x384 --maxShapes=pixel_values:4x3x384x384
  ```
- [ ] Build projector engine:
  ```bash
  docker exec legal-ai-trtllm-builder trtexec \
    --onnx=/models/gemma_projector.onnx \
    --saveEngine=/models/engines/gemma_projector.engine --fp16
  ```

### Phase 4: Restore Triton Configs (~2 min)
- [ ] Copy archived configs:
  ```bash
  cp -r deeds_labs/legacy-projects/triton_models/ triton_models/
  ```
- [ ] Verify structure:
  ```
  triton_models/
  ├── gemma_legal/config.pbtxt          (TRT-LLM backend, INT4)
  ├── siglip_vision/config.pbtxt        (TensorRT backend, FP16)
  ├── gemma_projector/config.pbtxt      (TensorRT backend, FP16)
  └── gemma_vlm_ensemble/config.pbtxt   (Ensemble wiring)
  ```
- [ ] Symlink or copy engine files into model version dirs (`1/`)

### Phase 5: Start Triton (~2-5 min)
- [ ] Start Triton container:
  ```bash
  docker compose -f docker-compose.triton.yml up triton-legal-ai -d
  ```
- [ ] Wait for healthcheck (start_period: 120s)
- [ ] Verify readiness:
  ```bash
  curl http://localhost:8099/v2/health/ready
  curl http://localhost:8099/v2/models/gemma_legal/ready
  ```

### Phase 6: End-to-End Test (~5 min)
- [ ] Test text inference:
  ```bash
  curl -X POST http://localhost:5173/api/ai/tensorrt \
    -H "Content-Type: application/json" \
    -d '{"prompt": "Analyze breach of contract liability under UCC Article 2"}'
  ```
- [ ] Test SSE streaming:
  ```bash
  curl -N http://localhost:5173/api/ai/tensorrt/stream \
    -H "Content-Type: application/json" \
    -d '{"prompt": "Summarize negligence elements"}'
  ```
- [ ] Test VLM (image + text):
  ```bash
  curl -X POST http://localhost:5173/api/ai/tensorrt/vlm \
    -F "image=@test_evidence.jpg" \
    -F "prompt=Describe this evidence document"
  ```
- [ ] Verify Ollama fallback works when Triton is unavailable
- [ ] Check health endpoint: `curl http://localhost:5173/api/health` (trtllm + triton checks)

---

## VRAM Budget (RTX 3060 Ti = 8192 MB)

### Text-Only Mode (95% of queries)
| Component | VRAM |
|-----------|------|
| Gemma3 12B INT4 engine | ~6,600 MB |
| KV cache (4096 tokens) | ~500 MB |
| CUDA runtime | ~300 MB |
| **Total** | **~7,400 MB** |

### VLM Mode (5% — time-shared via gpu-arbiter)
1. Unload text KV cache (-500 MB)
2. Load SigLIP (+1,500 MB)
3. Process image → embeddings
4. Unload SigLIP (-1,500 MB)
5. Feed projected tokens to text engine

---

## Architecture

```
Client Request
     |
SvelteKit API (/api/ai/tensorrt)
     |
     +-- gpu-arbiter.ts (lease GPU, mutual exclusion with Ollama)
     |
     +-- trt-llm.ts (OpenAI-compatible /v1/completions)
     |
     +-- Triton HTTP :8099
          |
          +-- text-only --> gemma_legal (TRT-LLM INT4, always loaded)
          |
          +-- VLM --> gemma_vlm_ensemble
               |-- siglip_vision (on-demand load/unload)
               |-- gemma_projector (on-demand)
               +-- gemma_legal (generate with projected tokens)
```

---

## Monitoring (Optional)

| Service | Port | Purpose |
|---------|------|---------|
| Prometheus | :9090 | Triton metrics scraping |
| Grafana | :3001 | Dashboards (GPU utilization, latency, throughput) |

Start full stack: `docker compose -f docker-compose.triton.yml up -d`

---

## Known Issues / Notes

- **Ollama conflict**: GPU arbiter ensures mutual exclusion — Triton and Ollama cannot use GPU simultaneously
- **Cold start**: First inference after Triton boot takes ~30s (engine loading + warmup)
- **Memory pressure**: If VRAM exceeds 7,400 MB, reduce `max_batch_size` in `gemma_legal/config.pbtxt`
- **Windows WSL2**: Docker GPU passthrough requires WSL2 backend + NVIDIA Container Toolkit
- **Triton image**: `nvcr.io/nvidia/tritonserver:24.10-trtllm-python-py3` (~15GB pull)

---

## Estimated Total Time: 60-100 minutes