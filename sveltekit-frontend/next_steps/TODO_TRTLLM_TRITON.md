# TODO: TRT-LLM Triton Inference Deployment

## Phase 1: Colab INT4 Quantization (~20-30 min)

- [ ] Open notebook in Colab with A100 runtime
  - `scripts/unsloth-training/Gemma3_12B_INT4_Quantize_and_Export.ipynb`
- [ ] Mount Google Drive (merged model lives here)
  - `Google Drive: /content/drive/MyDrive/gemma3-12b-legal-merged-16bit` (22.7GB)
- [ ] Run all 9 cells — produces INT4 checkpoint + ONNX exports
- [ ] Verify outputs on Drive:
  - `gemma3-12b-legal-trt-artifacts/int4_checkpoint/rank0.safetensors` (~6.5GB)
  - `gemma3-12b-legal-trt-artifacts/int4_checkpoint/config.json`
  - `gemma3-12b-legal-trt-artifacts/siglip_vision.onnx` (~1.5GB)
  - `gemma3-12b-legal-trt-artifacts/gemma_projector.onnx` (~50MB)
  - `gemma3-12b-legal-trt-artifacts/export_manifest.json`

---

## Phase 2: Download Artifacts (~10-20 min)

- [ ] Download from Google Drive → local `trt_artifacts/`
  - Target: `c:\Users\james\Videos\deeds-web-app\trt_artifacts\`
  - Size: ~8GB total
- [ ] Verify checksums against `export_manifest.json`

---

## Phase 3: Build TRT Engines Locally (~30-45 min)

### Files involved:
- `Dockerfile.trtllm` — TRT-LLM v0.21.0 builder image
- `hf_to_trt_gemma3_rank0.py` — HF safetensors → TRT-LLM checkpoint converter
- `validate_safetensors.py` — Pre-build safetensors validator
- `scripts/build-trt-engine-in-container.sh` — Full orchestration script (222 lines)
- `scripts/export-siglip-onnx.py` — SigLIP SO400M → ONNX export
- `scripts/export-projector.py` — VLM projector → ONNX export

### Steps:
- [ ] Verify Docker Desktop running with WSL2 GPU passthrough
- [ ] Verify NVIDIA Container Toolkit:
  ```bash
  docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
  ```
- [ ] Build text decoder engine (INT4 AWQ, sm_86 for RTX 3060 Ti):
  ```bash
  ./scripts/build-trt-engine-in-container.sh
  ```
- [ ] Verify: `engines/gemma3_12b_int4/rank0.engine` (~6.5GB)
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

---

## Phase 4: Restore Triton Model Configs (~2 min)

### Files involved (archived):
- `deeds_labs/legacy-projects/triton_models/gemma_legal/config.pbtxt` — TRT-LLM INT4 text decoder
- `deeds_labs/legacy-projects/triton_models/siglip_vision/config.pbtxt` — TensorRT FP16 vision encoder
- `deeds_labs/legacy-projects/triton_models/gemma_projector/config.pbtxt` — TensorRT FP16 projector
- `deeds_labs/legacy-projects/triton_models/gemma_vlm_ensemble/config.pbtxt` — Ensemble wiring

### Steps:
- [ ] Copy configs to active location:
  ```bash
  cp -r deeds_labs/legacy-projects/triton_models/ triton_models/
  ```
- [ ] Symlink engine files into version dirs:
  ```bash
  ln -s ../../engines/gemma3_12b_int4/rank0.engine triton_models/gemma_legal/1/
  ln -s ../../engines/siglip_vision.engine triton_models/siglip_vision/1/model.plan
  ln -s ../../engines/gemma_projector.engine triton_models/gemma_projector/1/model.plan
  ```

---

## Phase 5: Start Triton Server (~2-5 min)

### Files involved:
- `docker-compose.triton.yml` — Full stack (Triton + Postgres + Redis + Prometheus + Grafana)

### Steps:
- [ ] Start Triton only:
  ```bash
  docker compose -f docker-compose.triton.yml up triton-legal-ai -d
  ```
- [ ] Wait for healthcheck (start_period: 120s)
- [ ] Verify:
  ```bash
  curl http://localhost:8099/v2/health/ready
  curl http://localhost:8099/v2/models/gemma_legal/ready
  ```
- [ ] (Optional) Start full monitoring stack:
  ```bash
  docker compose -f docker-compose.triton.yml up -d
  ```
  - Prometheus: http://localhost:9090
  - Grafana: http://localhost:3001

---

## Phase 6: End-to-End Test (~5 min)

### Files involved (SvelteKit routes — already wired):
- `sveltekit-frontend/src/routes/api/ai/tensorrt/+server.ts` — Text inference (GPU lease → infer → release)
- `sveltekit-frontend/src/routes/api/ai/tensorrt/stream/+server.ts` — SSE streaming inference
- `sveltekit-frontend/src/routes/api/ai/tensorrt/vlm/+server.ts` — VLM (load vision → ensemble → unload)
- `sveltekit-frontend/src/lib/server/trt-llm.ts` — TRT-LLM client (OpenAI-compatible /v1/completions)
- `sveltekit-frontend/src/lib/server/inference/gpu-arbiter.ts` — GPU mutual exclusion (TRT vs Ollama)
- `sveltekit-frontend/src/routes/api/health/+server.ts` — Unified health (probes TRT + Triton)

### Steps:
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
- [ ] Test VLM:
  ```bash
  curl -X POST http://localhost:5173/api/ai/tensorrt/vlm \
    -F "image=@test_evidence.jpg" \
    -F "prompt=Describe this evidence document"
  ```
- [ ] Verify Ollama fallback (stop Triton, retry text endpoint)
- [ ] Check unified health: `curl http://localhost:5173/api/health`

---

## All Files Reference

| File | Purpose |
|------|---------|
| `scripts/unsloth-training/Gemma3_12B_INT4_Quantize_and_Export.ipynb` | Colab: INT4 AWQ quantize + ONNX export |
| `Dockerfile.trtllm` | TRT-LLM v0.21.0 builder image |
| `docker-compose.triton.yml` | Triton + PG + Redis + Prometheus + Grafana |
| `hf_to_trt_gemma3_rank0.py` | HF → TRT-LLM checkpoint converter |
| `validate_safetensors.py` | Safetensors pre-build validator |
| `scripts/build-trt-engine-in-container.sh` | Full build orchestration (222 lines) |
| `scripts/export-siglip-onnx.py` | SigLIP SO400M → ONNX |
| `scripts/export-projector.py` | VLM projector → ONNX |
| `deeds_labs/legacy-projects/triton_models/gemma_legal/config.pbtxt` | Triton: TRT-LLM INT4 text |
| `deeds_labs/legacy-projects/triton_models/siglip_vision/config.pbtxt` | Triton: FP16 vision |
| `deeds_labs/legacy-projects/triton_models/gemma_projector/config.pbtxt` | Triton: FP16 projector |
| `deeds_labs/legacy-projects/triton_models/gemma_vlm_ensemble/config.pbtxt` | Triton: VLM ensemble |
| `sveltekit-frontend/src/lib/server/trt-llm.ts` | TRT-LLM client |
| `sveltekit-frontend/src/lib/server/inference/gpu-arbiter.ts` | GPU lease manager |
| `sveltekit-frontend/src/routes/api/ai/tensorrt/+server.ts` | API: text inference |
| `sveltekit-frontend/src/routes/api/ai/tensorrt/stream/+server.ts` | API: SSE streaming |
| `sveltekit-frontend/src/routes/api/ai/tensorrt/vlm/+server.ts` | API: VLM inference |
| `sveltekit-frontend/src/routes/api/health/+server.ts` | API: unified health |
| `next_steps/TRT_ENGINE_BUILD_STEPS.md` | Detailed build plan (245 lines) |
| `next_steps/TRT_DIRECTORY_CONSOLIDATION.md` | File audit (154 files reviewed) |
