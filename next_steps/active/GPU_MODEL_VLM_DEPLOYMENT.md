# GPU / Model / VLM Deployment — Consolidated Roadmap

**Created**: April 19, 2026 (consolidated from 6 source files)
**Updated**: May 2026 — model stack audited; VLM unified; Hermes lane added; desktop cleanup
**GPU**: RTX 3060 Ti (Ampere, SM 8.6, 8GB VRAM)

---

## Current Model Stack (Audited May 2026)

### Ollama — Keep

| Model tag | Blob SHA | Size | Purpose | Status |
|-----------|----------|------|---------|--------|
| `gemma4-rotorquant:latest` | `a79de882` | ~5.3 GB | Primary chat — text-only, 8K ctx, GRPO legal (10,214 steps). `OLLAMA_CHAT_MODEL` | **ACTIVE** |
| `gemma4-rotorquant:latest` | `d9c7875f` | ~5.3 GB | VLM — legal+vision merged, same weights as hermes-64k. `OLLAMA_VLM_MODEL`. Used by `vlm-lifecycle.ts` for vision tasks. | **ACTIVE** |
| `gemma4-rotorquant:latest` | `d9c7875f` | 0 extra disk (shared blob) | Hermes agent prose model — 64K ctx, same weights as VLM. `HERMES_API_URL` → Ollama `:11434`. Routed through OpenAI facade + ACE pipeline. | **ACTIVE** |
| `embeddinggemma:latest` | — | 621 MB | 768-dim embeddings. `OLLAMA_EMBED_MODEL`. Only embedding source (TurboQuant is chat-only). | **ACTIVE** |
| `gemma3:270m` | `sha256-735af...` | 279 MB | Draft model candidate for speculative decoding (Type 1 GGUF drafter). Hold until test completed. | **HOLD** |
| `ibm/granite-docling:258m` | — | 522 MB | Document structure understanding. `GRANITE_DOCLING_MODEL`. | **ON-DEMAND** |

### Ollama — Delete

| Model tag | Size | Reason |
|-----------|------|--------|
| `gemma4:e4b-it-q4_K_M` | 9.6 GB | Stock community model — CPU-only, no legal fine-tune, no LoRA. Superseded by `gemma4-rotorquant:latest`. |
| `gemma4-rotorquant:latest:final` | ~5 GB | Duplicate tag — same weights as `gemma4-rotorquant:latest`. |
| `ssfdre38/gemma4-turbo:e4b` | ~5 GB | CPU-only community RotorQuant model. No legal fine-tune. |
| `gemma4-rotorquant:latest-fast:latest` | ~5 GB | Superseded by `gemma4-rotorquant:latest-iq4xs-direct.gguf` via llama-server. |

```powershell
ollama rm "gemma4:e4b-it-q4_K_M"
ollama rm "gemma4-rotorquant:latest:final"
ollama rm "ssfdre38/gemma4-turbo:e4b"
ollama rm "gemma4-rotorquant:latest-fast:latest"
```

### GGUFs (llama-server) — Keep

| Path | Size | Env var | Notes |
|------|------|---------|-------|
| `models/gemma4-rotorquant:latest-iq4xs-direct.gguf` | 4.8 GB | `TURBO_MODEL_PATH`, `ROTORQUANT_MODEL_PATH` | **Canonical production GGUF.** 59.8 tok/s, 220ms TTFT. Direct IQ4_XS (not round-trip). |
| `models/mmproj-F16.gguf` | 945 MB | `MMPROJ_PATH` | VLM SigLIP projector sidecar. Required for `--mmproj` vision mode. |

### GGUFs (Desktop) — Delete (~14.6 GB)

These are in `C:\Users\james\Desktop\gemma4-rotorquant:latest-iq4xs\`:

| File | Size | Reason |
|------|------|--------|
| `gemma4-rotorquant:latest-iq4xs-direct.gguf` | 4.8 GB | Exact duplicate of `models/gemma4-rotorquant:latest-iq4xs-direct.gguf` |
| `gemma4-rotorquant:latest-iq4xs.gguf` | 4.8 GB | Slow round-trip version (21.6 tok/s, 1762ms TTFT) — superseded by -direct |
| `gemma4-rotorquant:latest-merged-q4km.gguf` | 5.0 GB | Q4_K_M format — superseded by IQ4_XS direct |

```powershell
Remove-Item "C:\Users\james\Desktop\gemma4-rotorquant:latest-iq4xs" -Recurse -Force
```

### Model Env Pins (`.env` — canonical as of May 2026)

```env
OLLAMA_CHAT_MODEL=gemma4-rotorquant:latest
GEMMA4_MODEL=gemma4-rotorquant:latest
OLLAMA_VLM_MODEL=gemma4-rotorquant:latest
OLLAMA_EMBED_MODEL=embeddinggemma:latest
GRANITE_DOCLING_MODEL=ibm/granite-docling:258m
HERMES_API_URL=http://127.0.0.1:11434
TURBO_MODEL_PATH=C:\Users\james\Videos\deeds-web-app\models\gemma4-rotorquant:latest-iq4xs-direct.gguf
ROTORQUANT_MODEL_PATH=C:\Users\james\Videos\deeds-web-app\models\gemma4-rotorquant:latest-iq4xs-direct.gguf
MMPROJ_PATH=C:\Users\james\Videos\deeds-web-app\models\mmproj-F16.gguf
ENABLE_MTP_DRAFTER=false
```

> `DRAFT_MODEL_PATH` is **deprecated and removed**. Use `ENABLE_MTP_DRAFTER` + `MTP_DRAFT_MODEL` only.

---

## PENDING: VLM Re-Attachment (Priority 1)

**Blocker removed**: Unsloth PR #4807 merged — `merge_and_unload()` now handles `Gemma4ClippableLinear` submodules.

### Steps

1. Open `scripts/unsloth-training/Gemma4_E4B_Legal_VLM_Reattach.ipynb` on Colab G4
2. `pip install --upgrade unsloth` (gets ClippableLinear fix)
3. Upload `gemma4-rotorquant:latest-text-only-adapter/` (146 MB) from Downloads
4. Set `USE_LOCAL_ADAPTER = True` in Cell 3
5. Run all cells → merge adapter onto FULL base model (vision+audio towers preserved)
6. Export: `gemma4-rotorquant:latest-Q4_K_M.gguf` (~5 GB) + `gemma4-rotorquant:latest-mmproj-BF16.gguf` (~1.5 GB)
7. Download from Google Drive → `trt_artifacts/gemma4-rotorquant:latest/`
8. `ollama create gemma4-rotorquant:latest -f Modelfile`
9. Test: `ollama run gemma4-rotorquant:latest "Describe this image" --images test.jpg`
10. Update `.env`: `OLLAMA_VLM_MODEL=gemma4-rotorquant:latest`

**Result**: Single unified model for text+vision, eliminates VRAM swap on 8GB GPU.

### Key Files (DO NOT DELETE from Downloads)

| File | Size | Purpose |
|------|------|---------|
| `gemma4-rotorquant:latest-text-only-adapter/adapter_model.safetensors` | 146 MB | Text-only LoRA adapter (588 language tensors) |
| `gemma4-e4b-legal-final-gguf (1)/model.safetensors` | 9.62 GB | Full merged model (TRT-LLM input) |

### Files SAFE TO DELETE After VLM Deploy

| File | Size |
|------|------|
| `gemma4-e4b-legal-ollama/gemma4-e4b-legal.Q4_K_M.gguf` | 4.97 GB |
| `gemma4-rotorquant:latest-ollama/gemma4-e4b-legal.Q4_K_M.gguf` | 4.97 GB |
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
