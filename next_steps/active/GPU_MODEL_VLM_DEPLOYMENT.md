# GPU / Model / VLM Deployment — Consolidated Roadmap

**Created**: April 19, 2026 (consolidated from 6 source files)
**Status**: ACTIVE — VLM re-attachment UNBLOCKED (upstream PEFT fix merged)
**GPU**: RTX 3060 Ti (Ampere, SM 8.6, 8GB VRAM)

---

## Current Model Stack (Working)

| Model | Size | Purpose | Status |
|-------|------|---------|--------|
| `gemma4-legal:latest` | 5.3 GB | Text LLM (GRPO-trained, 10,214 steps) | **ACTIVE** |
| `gemma4:e4b-it-q4_K_M` | 9.6 GB | Base multimodal VLM (stock, no legal fine-tuning) | **ACTIVE** |
| `embeddinggemma:latest` | 621 MB | 768-dim embeddings | **ACTIVE** |
| `gemma3:270m` | 291 MB | Client-side lightweight | **ACTIVE** |
| `ibm/granite-docling:258m` | 522 MB | Document structure understanding | **ON-DEMAND** |

---

## PENDING: VLM Re-Attachment (Priority 1)

**Blocker removed**: Unsloth PR #4807 merged — `merge_and_unload()` now handles `Gemma4ClippableLinear` submodules.

### Steps

1. Open `scripts/unsloth-training/Gemma4_E4B_Legal_VLM_Reattach.ipynb` on Colab G4
2. `pip install --upgrade unsloth` (gets ClippableLinear fix)
3. Upload `gemma4-legal-text-only-adapter/` (146 MB) from Downloads
4. Set `USE_LOCAL_ADAPTER = True` in Cell 3
5. Run all cells → merge adapter onto FULL base model (vision+audio towers preserved)
6. Export: `gemma4-legal-vlm-Q4_K_M.gguf` (~5 GB) + `gemma4-legal-vlm-mmproj-BF16.gguf` (~1.5 GB)
7. Download from Google Drive → `trt_artifacts/gemma4-legal-vlm/`
8. `ollama create gemma4-legal-vlm:latest -f Modelfile`
9. Test: `ollama run gemma4-legal-vlm:latest "Describe this image" --images test.jpg`
10. Update `.env`: `OLLAMA_VLM_MODEL=gemma4-legal-vlm:latest`

**Result**: Single unified model for text+vision, eliminates VRAM swap on 8GB GPU.

### Key Files (DO NOT DELETE from Downloads)

| File | Size | Purpose |
|------|------|---------|
| `gemma4-legal-text-only-adapter/adapter_model.safetensors` | 146 MB | Text-only LoRA adapter (588 language tensors) |
| `gemma4-e4b-legal-final-gguf (1)/model.safetensors` | 9.62 GB | Full merged model (TRT-LLM input) |

### Files SAFE TO DELETE After VLM Deploy

| File | Size |
|------|------|
| `gemma4-e4b-legal-ollama/gemma4-e4b-legal.Q4_K_M.gguf` | 4.97 GB |
| `gemma4-legal-ollama/gemma4-e4b-legal.Q4_K_M.gguf` | 4.97 GB |
| `gemma4-e4b-legal-ollama.zip` | 5.0 GB |

---

## PENDING: Disk Cleanup (Prerequisite for TRT-LLM)

**Current**: 912 GB used / 18.9 GB free
**TRT-LLM build needs**: ~30 GB free

| Action | Savings | Risk |
|--------|---------|------|
| Clear Claude CLI cache >30 days | ~12 GB | None |
| Delete orphan temp dirs | 6.8 GB | None |
| Delete duplicate GGUFs in Downloads | ~10 GB | None — have originals |
| **Total recoverable** | ~29 GB | |

WSL crash dumps (89.9 GB) and core dump disable already done. ClickHouse memory limit added.

```powershell
# Claude CLI cache
Get-ChildItem "$env:LOCALAPPDATA\claude-cli-nodejs\Cache" -Recurse -File |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
  Remove-Item -Force

# Orphan temp dirs
Remove-Item "$env:LOCALAPPDATA\Temp\hmcmulwv" -Recurse -Force
Remove-Item "$env:LOCALAPPDATA\Temp\DiagOutputDir" -Recurse -Force
```

---

## DEFERRED: TRT-LLM Engine Build (Phase 2 — After Disk Cleanup)

**Goal**: W4A16 AWQ engine for 2-3x inference speedup.

| Step | Action | Output |
|------|--------|--------|
| 1 | Convert merged safetensors → TRT-LLM checkpoint (W4A16 AWQ, INT4 weights, FP16 activations) | TRT checkpoint |
| 2 | Build engine targeting SM 86 (Ampere), max_batch_size=4, max_seq_len=8192 | `.engine` files |
| 3 | Deploy to Triton model repository | Production TRT serving |

**VRAM budget**: ~2.5 GB model + ~1 GB KV cache + ~1 GB overhead = ~4.5 GB of 8 GB

Existing infrastructure already wired:
- `/api/ai/tensorrt`, `/api/ai/tensorrt/vlm`, `/api/ai/tensorrt/stream` endpoints
- `inference-router.ts` with TRT → Ollama fallback + VRAM check
- `gpu-arbiter.ts` Redis GPU lease management

---

## DEFERRED: TurboQuant KV Cache (Phase 3 — When Ollama Merges)

Google TurboQuant compresses KV cache 16-bit → 3-bit (6x smaller). Enables 256K context on 8GB VRAM.

| Framework | Status |
|-----------|--------|
| vLLM | **Working** (`pip install turboquant-vllm`) |
| llama.cpp | In review (6-phase PR) |
| Ollama | Not yet merged — monitor [ollama #15189](https://github.com/ollama/ollama/issues/15189) |

---

## DEFERRED: Multimodal GRPO Training (Phase 4 — Optional)

Fine-tune vision+text jointly for legal evidence analysis. Requires:
- Vision training data: 500+ evidence photo + analysis pairs
- Use explicit `target_modules` for language-only to avoid ClippableLinear:
  ```python
  target_modules = ["language_model.model.layers.*.self_attn.{q,k,v,o}_proj", ...]
  ```

---

## DEFERRED: Triton VLM Ensemble (Phase 5 — After TRT-LLM)

SigLIP Vision Encoder (ONNX/TRT) → Multimodal Projector (ONNX/TRT) → Gemma4 Language (TRT-LLM).
Vision encoder + projector from base model, text LLM from GRPO-trained model.

---

## References

- [Unsloth PR #4807](https://github.com/unslothai/unsloth/pull/4807) — ClippableLinear fix (MERGED)
- [llama.cpp Gemma 4 vision #13426](https://github.com/ggml-org/llama.cpp/issues/13426) — multimodal GGUF
- [TurboQuant llama.cpp #20969](https://github.com/ggml-org/llama.cpp/discussions/20969)
- [TRT-LLM Gemma examples](https://github.com/NVIDIA/TensorRT-LLM/tree/main/examples/models/core/gemma)
- [VLM Reattach Notebook](../scripts/unsloth-training/Gemma4_E4B_Legal_VLM_Reattach.ipynb)
- [GRPO Training Notebook](../scripts/unsloth-training/Gemma4_E4B_Legal_GRPO.ipynb)

---

## Consolidated From

- `2026-04-07_VLM_TRTLLM_DEPLOYMENT_PLAN.md`
- `GEMMA4_INTEGRATION_PLAN_2026-04-03.md`
- `GEMMA4_VLM_MULTIMODAL_TRAINING_PLAN_2026-04-05.md`
- `UNSLOTH_VLM_CHR97_NEXT_STEPS_2026-04-02.md`
- `2026-04-02_EVIDENCE_UPLOAD_VLM_NOTEBOOKS_TODO.md`
- `MULTIMODAL_IMPLEMENTATION_ROADMAP.md`
