# TensorRT Directory Consolidation — Deep Review

## Date: March 9, 2026
## Status: PRE-ARCHIVE ANALYSIS

---

## Summary

**154 git-tracked TRT-related files** scattered across 15+ directories.
This document reviews every directory and file, classifying each as KEEP or ARCHIVE.

---

## 1. Root-Level Shell Scripts (ARCHIVE — 25 files)

These are superseded by `scripts/build-trt-engine-in-container.sh` which handles the full pipeline inside Docker.

| File | Summary | Decision |
|------|---------|----------|
| `build-tensorrt-engine.sh` | Bare trtllm-build wrapper | ARCHIVE |
| `build-tensorrt-engines.sh` | Multi-model engine build | ARCHIVE |
| `build-tensorrt-from-gguf.sh` | GGUF → TRT conversion | ARCHIVE |
| `build-tensorrt-optimized.sh` | Optimized build flags | ARCHIVE |
| `build-trt-engines.sh` | Another multi-model build | ARCHIVE |
| `build_embeddinggemma_fp16_trtexec.sh` | Embedding model TRT build | ARCHIVE |
| `build_embeddinggemma_trt.py` | Python embedding TRT build | ARCHIVE |
| `build_gemma_trt.sh` | Generic gemma build | ARCHIVE |
| `build_gemma3_trt_engine.sh` | Gemma3 specific build | ARCHIVE |
| `build_tensorrt_engine.sh` | Duplicate of above | ARCHIVE |
| `build_tensorrt_engine_int4.bat` | Windows INT4 build | ARCHIVE |
| `build_tensorrt_engine_int4.sh` | Linux INT4 build | ARCHIVE |
| `build_trt_engine.sh` | Yet another build script | ARCHIVE |
| `build_trt_engines.sh` | Duplicate naming | ARCHIVE |
| `build_trt_gemma3.bat` | Windows gemma3 build | ARCHIVE |
| `clean_trt_build.sh` | Cleanup script | ARCHIVE |
| `convert_gguf_to_trt_engine.sh` | GGUF conversion | ARCHIVE |
| `convert_safetensors_manual.sh` | Manual safetensors convert | ARCHIVE |
| `fix_tensorrt_complete.sh` | Fix script | ARCHIVE |
| `fix-tensorrt-cuda.sh` | CUDA fix | ARCHIVE |
| `run_gemma3_trt_pipeline.sh` | Pipeline runner | ARCHIVE |
| `setup_triton_tensorrt_pipeline.sh` | Triton setup | ARCHIVE |
| `setup-tensorrt-gemma3-env.sh` | Env setup | ARCHIVE |
| `start_triton_server.sh` | Triton startup | ARCHIVE |
| `start-triton-legal-ai.sh` | Legal AI Triton startup | ARCHIVE |

---

## 2. Root-Level Python Scripts (ARCHIVE — 6 files)

| File | Summary | Decision |
|------|---------|----------|
| `convert_unsloth_to_trt.py` | Unsloth → TRT conversion | ARCHIVE |
| `convert_unsloth_to_trt.from_container.py` | Container version | ARCHIVE |
| `gemma3_tensorrt_inference.py` | Standalone inference test | ARCHIVE |
| `trt_build_ui.py` | TRT build GUI | ARCHIVE |
| `trt_fast_runner.cpp` | C++ TRT runner (standalone) | ARCHIVE |
| `trtllm_patch_gemma3840.ps1` | PowerShell patch for 3840 dim | ARCHIVE |

---

## 3. Root-Level Text/Notes (ARCHIVE — 7 files)

| File | Summary | Decision |
|------|---------|----------|
| `10_1_25__gemma3_tensorRT-llm.txt` | Session notes Oct 2025 | ARCHIVE |
| `921_tensorRTprogress.txt` | Progress notes Sep 2025 | ARCHIVE |
| `tensorRT_llm916.txt` | Notes Sep 2025 | ARCHIVE |
| `tensorRT-llm_930_25.txt` | Notes Sep 2025 | ARCHIVE |
| `tensortrt_llmarch.txt` | Architecture notes | ARCHIVE |
| `wsl_tensorRT-llm_colab930.txt` | WSL + Colab notes | ARCHIVE |
| `OCR-Tensor-Processing-Implementation-Summary.txt` | OCR tensor notes | ARCHIVE |

---

## 4. Root-Level Dockerfiles (KEEP 1, ARCHIVE 3)

| File | Summary | Decision |
|------|---------|----------|
| `Dockerfile.trtllm` | **Active** — v0.21.0, Gemma3 INT4 builder | **KEEP** |
| `Dockerfile.trtllm.fixed` | Superseded by Dockerfile.trtllm | ARCHIVE |
| `Dockerfile.tensorrt` | Older TRT image | ARCHIVE |
| `Dockerfile.tensorrt-builder` | Multi-stage builder | ARCHIVE |
| `Dockerfile.triton-ubuntu22` | Ubuntu 22 Triton | ARCHIVE |

---

## 5. Root-Level Docker Compose (KEEP 1, ARCHIVE 3)

| File | Summary | Decision |
|------|---------|----------|
| `docker-compose.triton.yml` | **Active** — Triton VLM ensemble | **KEEP** |
| `docker-compose.tensorrt.yml` | Older TRT compose | ARCHIVE |
| `docker-compose.quic-tensorrt.yml` | QUIC + TRT integration | ARCHIVE |
| `sveltekit-frontend/docker-compose-tensorrt-integration.yml` | SK integration compose | ARCHIVE |

---

## 6. Root-Level Misc (KEEP 2, ARCHIVE 5)

| File | Summary | Decision |
|------|---------|----------|
| `hf_to_trt_gemma3_rank0.py` | **Active** — HF→TRT tensor remapper (used by build script) | **KEEP** |
| `validate_safetensors.py` | **Active** — Safetensors validator (used by build script) | **KEEP** |
| `hf_to_trt_gemma3_rank0.from_container.py` | Container copy of above | ARCHIVE |
| `BUILD-TENSOR-SYSTEM.bat` | Windows batch build | ARCHIVE |
| `integration-test-tensor-system.sh` | Integration test | ARCHIVE |
| `Triton_TensorRT_Integration_Sketch.txt` | Planning sketch | ARCHIVE |
| `triton-model-config.yaml` | Old YAML config (pbtxt is canonical) | ARCHIVE |
| `tritonrt9115.txt` | Notes | ARCHIVE |

---

## 7. Root-Level Docs (KEEP 1, ARCHIVE 4)

| File | Summary | Decision |
|------|---------|----------|
| `next_steps/TENSORRT_VLM_PIPELINE.md` | **Active** — Current VLM pipeline status | **KEEP** |
| `ENGINE_BUILD_PLAN.md` | Step-by-step build (useful reference) | **KEEP** |
| `TENSORRT-LLM-README.md` | Project overview (outdated) | ARCHIVE |
| `GO_TENSORRT_OPTIMIZATION_PLAN.md` | Go optimization plan | ARCHIVE |
| `TensorRT-LLM` | Empty or stale reference | ARCHIVE |

---

## 8. `tensorrt_build/` Directory (KEEP configs, ARCHIVE scripts)

**18 files total.** The `input/` configs are referenced by the build pipeline.

| Path | Summary | Decision |
|------|---------|----------|
| `tensorrt_build/input/config.json` | Base model config (Gemma3 12B, 3840 dim) | **KEEP** |
| `tensorrt_build/input/build_config_int4.json` | INT4 AWQ build params | **KEEP** |
| `tensorrt_build/input/config_correct.json` | Corrected config | **KEEP** |
| `tensorrt_build/input/custom_build.json` | Custom build config | **KEEP** |
| `tensorrt_build/input/1config.json` | Stale duplicate | ARCHIVE |
| `tensorrt_build/input/README.md` | Readme | ARCHIVE |
| `tensorrt_build/README.md` | Top-level readme | ARCHIVE |
| `tensorrt_build/scripts/*.py` (6 files) | Superseded by in-container scripts | ARCHIVE |
| `tensorrt_build/scripts/*.sh` (4 files) | Superseded by build-trt-engine-in-container.sh | ARCHIVE |
| `tensorrt_build/custom_model/builder_custom_model.py` | Custom model builder | ARCHIVE |

---

## 9. `triton-models/` vs `triton_models/` — DUPLICATE DIRS

**Neither directory exists on disk!** Both were tracked in git but appear to have been removed or are gitignored. The Triton configs were created last session at `triton_models/` but the `docker-compose.triton.yml` references `./triton_models:/models/model_repository:ro`.

**Action**: Verify which dir the compose file uses, ensure configs are there.

---

## 10. `engines/` Directory — NOT ON DISK

No engine files found. The `engines/` directory doesn't exist locally (only had a failed conversion log in git history). Engines would be built inside the Docker container.

**Action**: No cleanup needed.

---

## 11. `documents/` TRT Docs (ARCHIVE — 12 files)

| File | Summary | Decision |
|------|---------|----------|
| `TENSORRT-LLM-PRODUCTION-STATUS.md` | Production status doc | ARCHIVE |
| `SVELTEKIT-TENSORRT-INTEGRATION.md` | SK integration guide | ARCHIVE |
| `DIRECT-TENSORRT-ARCHITECTURE.md` | Direct TRT usage | ARCHIVE |
| `SVELTEKIT-TENSORRT-PRODUCTION.md` | Production deploy | ARCHIVE |
| `TENSORRT_LLM_INSTALL_STRATEGY.md` | Install strategy | ARCHIVE |
| `TENSORRT_ENGINE_CONVERSION_GUIDE.md` | Conversion guide | ARCHIVE |
| `VS-CODE-OLLAMA-TENSORRT-GUIDE.md` | IDE guide | ARCHIVE |
| `README-TENSORRT-BUILD.md` | Build readme | ARCHIVE |
| `TENSORRT_DEPLOYMENT.md` | Deployment checklist | ARCHIVE |
| `tensorrt-inference-stack.md` | Inference stack arch | ARCHIVE |
| `tensorrt-llm-errors-guide.md` | Error troubleshooting | ARCHIVE |
| `docs/TENSORRT-GEMMA3-INTEGRATION.md` | Gemma3 integration | ARCHIVE |

---

## 12. `sveltekit-frontend/` TRT Files

### KEEP (Active Production Code)
| File | Summary |
|------|---------|
| `src/lib/server/trt-llm.ts` | Core TRT-LLM client (inferLLM, streamLLM) |
| `src/routes/api/ai/tensorrt/+server.ts` | Text inference API |
| `src/routes/api/ai/tensorrt/stream/+server.ts` | SSE streaming API |
| `src/routes/api/ai/tensorrt/vlm/+server.ts` | VLM inference API |

### ARCHIVE (Legacy/Duplicate)
| File | Summary | Decision |
|------|---------|----------|
| `src/lib/trt-llm/client.ts` | Duplicate TRT client | ARCHIVE |
| `src_fixed/tensorrt-*.ts` (13 files) | Phase 99 corrupted fixes | ARCHIVE |
| `src_fixed/tensor-*.ts` (5 files) | Phase 99 corrupted fixes | ARCHIVE |
| `src_fixed/triton-client.ts` | Phase 99 corrupted fix | ARCHIVE |
| `scripts/convert-gemma3-legal-to-trtllm.py` | Conversion script | ARCHIVE |
| `scripts/phase104-backups/` TRT files | Phase 104 backups | ARCHIVE |
| `scripts/phase89-tensor-analysis.py` | Analysis script | ARCHIVE |
| `scripts/phase91-tensor-clustering.py` | Clustering script | ARCHIVE |
| `scripts/run-tensor-analysis.ps1` | Analysis runner | ARCHIVE |
| `scripts/test-trt-llm.mjs` | Test script | ARCHIVE |
| `docker-compose-tensorrt-integration.yml` | Integration compose | ARCHIVE |
| `docs_readme/organized-markdown-docs/TENSOR-*.md` | Organized docs | ARCHIVE |
| `docs_readme/root-docs/PHASE3-TENSORRT-ARCHITECTURE.md` | Phase 3 arch doc | ARCHIVE |

---

## 13. `scripts/` TRT Files (KEEP 3, ARCHIVE rest)

| File | Summary | Decision |
|------|---------|----------|
| `scripts/build-trt-engine-in-container.sh` | **Active** — Main build orchestrator | **KEEP** |
| `scripts/export-siglip-onnx.py` | **Active** — SigLIP ONNX export | **KEEP** |
| `scripts/export-projector.py` | **Active** — Projector ONNX export | **KEEP** |
| `scripts/build_config_int4.json` | Duplicate of tensorrt_build/input/ | ARCHIVE |
| `scripts/start_tensorrt_service.py` | Service startup | ARCHIVE |
| `scripts/build-gemma3-trt.ps1` | PowerShell build | ARCHIVE |
| `scripts/build-tensorrt-docker.sh` | Docker build | ARCHIVE |
| `scripts/build-tensorrt-engines-rtx8gb.ps1` | RTX 8GB build | ARCHIVE |

---

## 14. `go-microservice/tensorrt/` (KEEP — separate Go service)

75+ files including Go service, C++/CUDA kernels, plugins. This is the **native GPU inference path** (alternative to Docker Triton). Keep as-is — it's a self-contained Go module.

---

## 15. Unsloth Training Notebooks

### KEEP (Active)
| File | Model | Status |
|------|-------|--------|
| `Gemma3_12B_Legal_Production.ipynb` | **Gemma 3 12B** | Primary text training |
| `Gemma3_Legal_Multimodal_COMPLETE.ipynb` | **Gemma 3 12B** | Option A/B multimodal |
| `Gemma3n_Legal_VLM_Unsloth.ipynb` | Gemma 3n 2B/4B | Experimental VLM |

### LoRA Status
- **Trained model**: Gemma 3 12B (`unsloth/gemma-3-12b-it-unsloth-bnb-4bit`)
- **LoRA adapter**: Saved (cell 13/14) — NOT merged
- **Merged model**: NOT downloaded — cell 14/15 (`save_pretrained_merged`) didn't run
- **Next step**: Go back to Colab, load adapter, run merge, download ~24GB

---

## Archive Totals

| Category | Files to Archive | Files to Keep |
|----------|-----------------|---------------|
| Root shell scripts | 25 | 0 |
| Root Python scripts | 6 | 2 (hf_to_trt, validate) |
| Root text/notes | 7 | 0 |
| Root Dockerfiles | 3 | 1 (Dockerfile.trtllm) |
| Root Docker Compose | 3 | 1 (docker-compose.triton.yml) |
| Root misc | 5 | 2 (ENGINE_BUILD_PLAN.md, next_steps/) |
| tensorrt_build/ scripts | 11 | 4 (input configs) |
| documents/ TRT docs | 12 | 0 |
| sveltekit-frontend/ legacy | ~25 | 4 (trt-llm.ts + 3 API routes) |
| scripts/ | 5 | 3 (build-trt, export-siglip, export-projector) |
| **TOTAL** | **~102** | **~17** |

---

## Archive Destination

All archived files → `deeds_labs/tensorrt-archive/` with subdirectories:
- `deeds_labs/tensorrt-archive/root-scripts/` — Shell/batch/PS1 build scripts
- `deeds_labs/tensorrt-archive/root-python/` — Python converters
- `deeds_labs/tensorrt-archive/root-notes/` — Text notes and session logs
- `deeds_labs/tensorrt-archive/root-dockerfiles/` — Superseded Dockerfiles
- `deeds_labs/tensorrt-archive/root-compose/` — Superseded docker-compose files
- `deeds_labs/tensorrt-archive/root-docs/` — Superseded documentation
- `deeds_labs/tensorrt-archive/tensorrt-build-scripts/` — tensorrt_build/scripts/
- `deeds_labs/tensorrt-archive/sveltekit-legacy/` — src_fixed/, duplicate clients
- `deeds_labs/tensorrt-archive/documents/` — documents/ TRT docs
