# Gemma 4 E4B — VLM / Multimodal / TRT-LLM Training & Deployment Plan

**Created:** 2026-04-05
**Status:** Active
**Depends on:** `GEMMA4_INTEGRATION_PLAN_2026-04-03.md`, `2026-03-15_TRTLLM_EXECUTION_PIPELINE.md`

---

## Background: What We Have Today

### Current gemma4-legal:latest (TEXT-ONLY)

| Property | Value |
|----------|-------|
| Base model | `google/gemma-4-E4B-it` (4B effective params) |
| Training | GRPO (1,000 prompts, 250 steps, 7 reward signals) |
| Adapter | 588 language_model tensors (140 MB LoRA) |
| Merged GGUF | Q4_K_M, 5.0 GB, **text-only** |
| Ollama tag | `gemma4-legal:latest` |
| VRAM | ~5.3 GB loaded |
| Context | 8192 (Modelfile) / 131K max (architecture) |

### Why It's Text-Only

During GRPO training on Colab (Unsloth + TRL):

1. **Target modules were generic**: `q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj`
2. These exist in ALL sub-models (language + vision + audio)
3. Training produced **884 tensors**: 588 language + 224 vision + 72 audio
4. Vision/audio layers use **`Gemma4ClippableLinear`** — a custom wrapper that PEFT cannot `merge_and_unload()`
5. Error: `RuntimeError: The size of tensor a (294912) must match the size of tensor b (768)` — ClippableLinear stores weights in a nested `.linear` attribute, and 4-bit compressed shapes don't match LoRA delta shapes
6. **Fix**: Surgical removal of 296 vision/audio tensors → 588 language-only adapter
7. Manual LoRA merge (bypass `merge_and_unload()`) → BF16 safetensors → GGUF Q4_K_M

**Result**: Text model works great. Vision/audio towers pass through from base model **unmodified** — they were never fine-tuned, and the GGUF format (llama.cpp) only exports the text decoder anyway.

### Upstream Issues

- **PEFT ClippableLinear**: [unsloth/unsloth#4807](https://github.com/unslothai/unsloth/pull/4807) — PR to handle Gemma4ClippableLinear in merge
- **llama.cpp Gemma 4 vision**: [ggml-org/llama.cpp#13426](https://github.com/ggml-org/llama.cpp/issues/13426) — multimodal GGUF for Gemma 4 not yet supported
- **Ollama Gemma 4 multimodal**: Ollama's `gemma4:e4b` tag includes vision but via HuggingFace backend, not native GGUF mmproj

---

## Option Analysis: Getting Multimodal Back

### Option A: Wait for llama.cpp Gemma 4 Vision Support

**Timeline**: Likely Q3-Q4 2026
**Effort**: Zero (just rebuild GGUF when support lands)
**How it works**: llama.cpp will add `mmproj` (multimodal projection) support for Gemma 4's SigLIP vision encoder, similar to how LLaVA/Gemma 3 works today. This will produce two GGUF files: text model + vision projector.

**Pros**: Simplest path, native Ollama support
**Cons**: Unknown timeline, may never happen for E4B specifically

### Option B: TRT-LLM + Triton Ensemble (Recommended for Production)

**Timeline**: Ready to build now (infrastructure already wired)
**Effort**: 1-2 sessions on Colab/WSL2
**Architecture** (already partially built):

```
Image Input
    ↓
SigLIP Vision Encoder (ONNX/TRT) → 256-dim visual tokens
    ↓
Multimodal Projector (ONNX/TRT) → project to LLM embedding space
    ↓
Gemma 4 E4B Language Model (TRT-LLM engine) → text generation
    ↓
Output
```

**Existing infrastructure**:
- `/api/ai/tensorrt/vlm` endpoint — already wired
- `inference-router.ts` — TRT → Ollama fallback with VRAM check
- `gpu-arbiter.ts` — Redis GPU lease management
- `gpu-monitor.ts` — nvidia-smi monitoring
- `Gemma3_12B_INT4_Quantize_and_Export.ipynb` — SigLIP ONNX + projector ONNX export (needs update for Gemma 4)
- Triton `docker-compose.yml` — model repository mount

**What's needed**:
1. Export SigLIP vision encoder to ONNX (from Gemma 4 E4B base)
2. Export multimodal projector to ONNX
3. Build TRT-LLM engine from merged safetensors (we have these: 16.1 GB BF16)
4. Configure Triton ensemble (vision → projector → LLM)
5. Update `vlm-evidence-analyzer.ts` to pass images through the pipeline

### Option C: Ollama gemma4:e4b as VLM (Already Available)

**Timeline**: Now
**Effort**: Already done (model pulled, env wired)
**How it works**: Ollama's `gemma4:e4b-it-q4_K_M` (9.6 GB) includes the full multimodal model. Use it for vision tasks, use `gemma4-legal:latest` for text-only legal tasks.

**Current wiring**:
- `env.server.ts` → `GEMMA4_MODEL = 'gemma4:e4b-it-q4_K_M'`
- `vlm-evidence-analyzer.ts` → falls back to `ENV.GEMMA4_MODEL ?? 'gemma4-legal:latest'`
- `persons-of-interest/photos` → uses `ENV.GEMMA4_MODEL` for VLM

**Limitation**: The base `gemma4:e4b` is NOT fine-tuned for legal domain — it's the generic instruction-tuned model. Legal-specific vision tasks (evidence photos, scanned documents) won't have the legal formatting/citation training.

### Option D: Multimodal GRPO Training (Full Vision+Text Fine-Tune)

**Timeline**: When Unsloth/PEFT fix ClippableLinear upstream
**Effort**: 2-3 sessions (dataset prep + training + merge + export)
**How it works**: Re-train with vision+text pairs, include ALL 884 tensors in the adapter, merge with fixed PEFT

**Training data needed**:
- Evidence photos + legal analysis pairs (500+ examples)
- Scanned document images + OCR ground truth (200+ examples)
- Chain of custody photos + classification labels (100+ examples)
- POI photos + identification narratives (100+ examples)

**Blocked by**: Unsloth PR #4807 (ClippableLinear merge fix)

---

## Recommended Phased Approach

### Phase 1: Dual-Model VLM (NOW — Already Working)

**Status**: COMPLETE

```
Text queries → gemma4-legal:latest (5.3 GB, GRPO-trained)
Vision queries → gemma4:e4b-it-q4_K_M (9.6 GB, base multimodal)
Embeddings → embeddinggemma:latest (621 MB, always loaded)
```

Ollama auto-swaps models based on `keep_alive`. RTX 3060 Ti (8 GB) can hold one LLM + embeddings at a time.

### Phase 2: TRT-LLM Engine Build (Next Colab Session)

**Goal**: Build optimized TRT-LLM engine from our merged safetensors for 2-3x inference speedup.

| Step | Action | Output |
|------|--------|--------|
| 2a | Upload merged BF16 safetensors (16.1 GB) to Colab | `/content/gemma4-merged-clean/` |
| 2b | Install TRT-LLM (`pip install tensorrt-llm`) | Build environment |
| 2c | Convert checkpoint: `convert_checkpoint.py --model_dir ./gemma4-merged-clean --tp_size 1 --dtype float16` | TRT checkpoint |
| 2d | Build engine: `trtllm-build --checkpoint_dir ./trt_ckpt --output_dir ./trt_engine --gemm_plugin float16 --max_batch_size 1 --max_input_len 4096 --max_seq_len 8192` | TRT engine files |
| 2e | Test inference with TRT-LLM Python API | Verify correctness |
| 2f | Download engine (zip) → deploy to Triton model repository | Production ready |

**Hardware**: Colab A100 or G4 (Blackwell) for build; RTX 3060 Ti for deployment.

### Phase 3: SigLIP + Projector ONNX Export (Same Session as Phase 2)

**Goal**: Export vision components for the TRT VLM ensemble pipeline.

| Step | Action | Output |
|------|--------|--------|
| 3a | Load base `gemma-4-E4B-it` (full model, not our merged text-only) | Base multimodal model |
| 3b | Extract SigLIP vision encoder | `siglip_vision.onnx` |
| 3c | Extract multimodal projector | `mm_projector.onnx` |
| 3d | Convert to TensorRT (optional, for speed) | `.engine` files |
| 3e | Configure Triton ensemble: vision → projector → text LLM | `config.pbtxt` for each |

**Key**: The vision encoder and projector come from the **base model** (unmodified by our GRPO training). The text LLM comes from our **merged legal model** (Phase 2 engine).

### Phase 4: Multimodal Legal GRPO (When Upstream Fix Lands)

**Goal**: Fine-tune vision+text jointly for legal evidence analysis.

**Blocked by**: Unsloth PR #4807 or manual ClippableLinear unwrap in training script.

**Workaround** (if upstream takes too long): Modify the training script to explicitly set `target_modules` to only language layers:

```python
target_modules = [
    "language_model.model.layers.*.self_attn.q_proj",
    "language_model.model.layers.*.self_attn.k_proj",
    "language_model.model.layers.*.self_attn.v_proj",
    "language_model.model.layers.*.self_attn.o_proj",
    "language_model.model.layers.*.mlp.gate_proj",
    "language_model.model.layers.*.mlp.up_proj",
    "language_model.model.layers.*.mlp.down_proj",
]
```

This produces a clean 588-tensor adapter without needing surgery. Vision/audio towers pass through unmodified. For actual vision fine-tuning, would need:
1. Explicit `finetune_vision_layers=True` in Unsloth config
2. ClippableLinear unwrap before PEFT wrapping
3. Vision-specific training data (image+text pairs)

### Phase 5: Audio Tower (Future — Low Priority)

**Current state**: Gemma 4 E4B has native audio input (72 audio adapter tensors were present in training).

**For our legal app**: Audio is used for:
- Deposition transcription → currently handled by Whisper (Docling service, port 8085)
- 911 call analysis → not yet implemented
- Court hearing recordings → not yet implemented

**When to prioritize**: When we have audio evidence in the pipeline AND the ClippableLinear fix is available. The audio tower fine-tuning follows the same pattern as vision.

**GGUF limitation**: llama.cpp does NOT support audio input in GGUF format. Audio would require TRT-LLM/Triton or direct HuggingFace inference.

---

## Architecture: Full Multimodal Pipeline (Target State)

```
Evidence Input (text / image / audio / video)
    │
    ├─ Text → gemma4-legal:latest (Ollama, GRPO-trained)
    │   └─ SSE chat, synthesis, summarization, entity extraction, ACE
    │
    ├─ Image → Triton Ensemble (TRT-LLM)
    │   ├─ SigLIP vision encoder (ONNX/TRT)
    │   ├─ Multimodal projector (ONNX/TRT)
    │   └─ gemma4-legal text LLM (TRT engine, GRPO-trained)
    │   └─ Fallback: gemma4:e4b (Ollama, base multimodal)
    │
    ├─ Audio → Whisper (Docling service, port 8085)
    │   └─ Future: Gemma 4 E4B native audio (TRT-LLM)
    │
    ├─ Video → Frame extraction → Image pipeline (per-frame)
    │   └─ YOLO object detection (ultralytics, yolov8n)
    │   └─ Key frame selection → VLM analysis
    │
    ├─ Document (PDF/DOCX) → Docling (port 8085) + YOLO layout
    │   ├─ Docling: OCR + layout-aware text extraction
    │   ├─ YOLO: Region detection (text, table, signature, stamp)
    │   └─ LLM escalation if ≥3 objects or special types detected
    │
    └─ Embeddings → embeddinggemma:latest (768-dim, always loaded)
        └─ Used by: Qdrant indexing, RAG retrieval, similarity search
```

---

## File Change Map

| File | Change | Phase |
|------|--------|-------|
| `scripts/unsloth-training/Gemma4_E4B_Legal_GRPO.ipynb` | Add TRT-LLM build cells (Section 18) | 2 |
| `scripts/unsloth-training/Gemma3_12B_INT4_Quantize_and_Export.ipynb` | Update for Gemma 4 SigLIP export | 3 |
| `docker/triton/model_repository/` | Add gemma4-legal TRT engine config | 2 |
| `docker/triton/model_repository/siglip_vision/` | SigLIP ONNX model + config.pbtxt | 3 |
| `docker/triton/model_repository/mm_projector/` | Projector ONNX + config.pbtxt | 3 |
| `src/lib/server/analysis/vlm-evidence-analyzer.ts` | Update Triton model names for Gemma 4 | 3 |
| `src/routes/api/ai/tensorrt/vlm/+server.ts` | Update Triton model names | 3 |
| `src/lib/server/inference/inference-router.ts` | Add TRT engine status check | 2 |
| `scripts/unsloth-training/Gemma4_E4B_Legal_GRPO.ipynb` | Add explicit `target_modules` for language-only | 4 |

---

## Model Inventory

| Model | Size | Purpose | Status | Location |
|-------|------|---------|--------|----------|
| `gemma4-legal:latest` | 5.3 GB | Text LLM (GRPO-trained) | **ACTIVE** | Ollama |
| `gemma4:e4b-it-q4_K_M` | 9.6 GB | Base multimodal VLM | **ACTIVE** | Ollama |
| `embeddinggemma:latest` | 621 MB | 768-dim embeddings | **ACTIVE** | Ollama |
| `gemma3:270m` | 291 MB | Client-side lightweight | **ACTIVE** | Ollama |
| Merged BF16 safetensors | 16.1 GB | TRT-LLM source | On Colab (ephemeral) | Re-export needed |
| LoRA adapter (588 tensors) | 140 MB | HuggingFace upload | `Semaj90/gemma4-e4b-legal-grpo` | HuggingFace |
| Q4_K_M GGUF | 5.0 GB | Ollama source | `Downloads/gemma4-legal-ollama/` | Local |

---

## Monitoring Links

- **ClippableLinear fix**: [unsloth PR #4807](https://github.com/unslothai/unsloth/pull/4807)
- **llama.cpp Gemma 4 vision**: [ggml-org/llama.cpp#13426](https://github.com/ggml-org/llama.cpp/issues/13426)
- **TurboQuant (3-bit KV cache)**: [llama.cpp #20969](https://github.com/ggml-org/llama.cpp/discussions/20969)
- **Ollama TurboQuant**: [ollama #15189](https://github.com/ollama/ollama/issues/15189)
- **TRT-LLM Gemma 4**: [NVIDIA/TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM)
