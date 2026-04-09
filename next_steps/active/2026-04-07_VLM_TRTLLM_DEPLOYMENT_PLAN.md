# Gemma 4 E4B Legal — VLM Re-Attachment + TRT-LLM Deployment Plan

**Created**: 2026-04-07
**GPU**: RTX 3060 Ti (Ampere, SM 8.6, 8GB VRAM)
**Status**: Planning

---

## Overview

Dual deployment pipeline for the GRPO fine-tuned Gemma 4 E4B legal model:
1. **Ollama GGUF** — immediate testing (VLM with vision tower re-attached)
2. **TRT-LLM Triton** — production inference (W4A16 AWQ + TurboQuant KV cache)

### Key Files in Downloads (DO NOT DELETE)

| File | Size | Purpose |
|------|------|---------|
| `gemma4-legal-text-only-adapter/adapter_model.safetensors` | 146 MB | Text-only LoRA adapter (588 language tensors, vision/audio stripped) |
| `gemma4-e4b-legal-final-gguf (1)/model.safetensors` | 9.62 GB | Full merged model — input for TRT-LLM engine build |
| `gemma4-e4b-legal-final-gguf (1)/config.json` | — | Gemma4ForConditionalGeneration architecture config |

### Files SAFE TO DELETE After VLM Deploy

| File | Size | Why Safe |
|------|------|----------|
| `gemma4-e4b-legal-ollama/gemma4-e4b-legal.Q4_K_M.gguf` | 4.97 GB | Duplicate GGUF (text-only, superseded by VLM) |
| `gemma4-legal-ollama/gemma4-e4b-legal.Q4_K_M.gguf` | 4.97 GB | Older duplicate |
| `gemma4-e4b-legal-ollama.zip` | 5.0 GB | Unpacked above |
| `gemma4-legal-adapters/` (1), (2) copies | ~0.04 GB | Duplicate adapter dirs |

---

## Pipeline 1: Ollama GGUF (Testing — Now)

### How It Works

```
146 MB LoRA adapter (Downloads)
  → Upload to Colab G4 (Blackwell 96GB)
  → Load FULL base model from HF (has vision + audio towers intact)
  → Apply language-only LoRA
  → merge_and_unload() — vision/audio towers inherited from base
  → Export two-file multimodal GGUF:
      gemma4-legal-vlm-Q4_K_M.gguf (~5 GB, language)
      gemma4-legal-vlm-mmproj-BF16.gguf (~1.5 GB, vision projector)
  → Download from Google Drive
  → ollama create gemma4-legal-vlm:latest -f Modelfile
```

### Architecture Preservation

```
google/gemma-4-e4b-it (full base, loaded on Colab):
  ├── language_model (3.9B params) ← GRPO LoRA merged in
  ├── vision_tower (~150M params)  ← KEPT from base (never trained)
  ├── audio_tower (~300M params)   ← KEPT from base (never trained)
  └── multi_modal_projector        ← KEPT from base
```

The 9.62GB model.safetensors in Downloads is text-only merged (no vision tower).
The notebook re-applies the 146MB LoRA to the FULL base model instead, preserving towers.

### Notebook

`scripts/unsloth-training/Gemma4_E4B_Legal_VLM_Reattach.ipynb`

**Cell 3**: Set `USE_LOCAL_ADAPTER = True`, upload `gemma4-legal-text-only-adapter/` (146MB)
**Cell 8**: Load full multimodal base + apply language LoRA
**Cell 10**: Pre-merge vision inference test
**Cell 12**: Dequantize NF4 → BF16, merge, save all tensors
**Cell 14**: Export multimodal GGUF (language + mmproj)
**Cell 16**: Generate Ollama Modelfile

### Local Deployment

```bash
cd trt_artifacts/gemma4-legal-vlm/
ollama create gemma4-legal-vlm:latest -f Modelfile
ollama run gemma4-legal-vlm:latest
```

Update `sveltekit-frontend/.env`:
```
OLLAMA_VLM_MODEL=gemma4-legal-vlm:latest
```

---

## Pipeline 2: TRT-LLM Triton (Production — After Disk Cleanup)

### Quantization Compatibility (RTX 3060 Ti, Ampere SM 8.6)

| Quantization | Weights | Activations | RTX 3060 Ti | Min SM |
|-------------|---------|-------------|-------------|--------|
| **W4A16 AWQ** | INT4 | FP16 | **YES** | > 8.0 |
| W4A8 AWQ | INT4 | FP8 | NO | >= 9.0 (Hopper) |
| INT8 SmoothQuant | INT8 | INT8 | **YES** | > 8.0 |
| FP8 | FP8 | FP8 | NO | >= 8.9 (Ada) |
| Weight-only INT4 | INT4 | FP16 | **YES** | > 8.0 |

**Use W4A16 AWQ** — 4-bit weights, 16-bit activations. Best quantization on Ampere for TRT-LLM.
FP8 variants (W4A8, FP8) are Hopper/Blackwell only.

### TRT-LLM Build Commands

```bash
# Step 1: Convert safetensors → TRT-LLM checkpoint (W4A16 AWQ)
python TensorRT-LLM/examples/models/core/gemma/convert_checkpoint.py \
  --model_dir ./gemma4-legal-vlm-merged \
  --output_dir ./trt_checkpoint \
  --dtype float16 \
  --use_weight_only \
  --weight_only_precision int4_awq \
  --awq_block_size 128

# Step 2: Build engine — target SM 86 (Ampere)
trtllm-build \
  --checkpoint_dir ./trt_checkpoint \
  --output_dir ./trt_engine \
  --gemm_plugin float16 \
  --max_batch_size 4 \
  --max_input_len 4096 \
  --max_seq_len 8192 \
  --kv_cache_type paged
```

### VRAM Budget (RTX 3060 Ti, 8GB)

| Layer | Technology | VRAM |
|-------|-----------|------|
| Model weights | W4A16 AWQ (INT4) | ~2.5 GB |
| KV cache | TurboQuant 3-bit (vLLM) or INT8 (TRT-LLM native) | ~0.5-1 GB |
| Overhead | CUDA context + buffers | ~1 GB |
| **Total** | | **~4-4.5 GB of 8 GB** |

Leaves ~3.5GB headroom for vision tower + batch processing.

### TurboQuant KV Cache (Runtime Compression)

TurboQuant is **KV cache compression at runtime** — complementary to weight quantization:

| Layer | What | Compression | When |
|-------|------|-------------|------|
| Weight Quant (W4A16 AWQ) | Model weights | 16-bit → 4-bit (4x) | Build time |
| TurboQuant | KV cache | 16-bit → 3-bit keys + 2-bit values (6x) | Inference time |

**Integration status**:

| Framework | Status | How |
|-----------|--------|-----|
| vLLM | **Working** | `pip install turboquant-vllm` → `--kv-cache-dtype turboquant35 --enable-turboquant` |
| llama.cpp | In review | 6-phase PR, GGML type registration |
| TRT-LLM | Not yet | Has INT8 KV cache natively; TurboQuant PR pending |
| SGLang | WIP | 42 unit tests passing |

**Recommended**: Use vLLM + TurboQuant for max KV cache savings on RTX 3060 Ti:
```bash
pip install turboquant-vllm
vllm serve gemma4-legal-vlm --kv-cache-dtype turboquant35 --enable-turboquant
```

---

## Disk Cleanup (Prerequisites)

**Current**: 912 GB used / 18.9 GB free
**TRT-LLM engine build needs**: ~30 GB free

| Action | Savings | Risk |
|--------|---------|------|
| Delete `%LOCALAPPDATA%\Temp\wsl-crashes` | **89.9 GB** | Medium — ACTIVE crash dumps (see WSL section below). Must fix root cause first |
| Clear Claude CLI cache >30 days | **~12 GB** | None — 5,831 .txt files since Aug 2025, auto-rebuilds |
| Delete `%LOCALAPPDATA%\Temp\hmcmulwv` | **5.3 GB** | None — orphan March 2026 temp dir |
| Delete `%LOCALAPPDATA%\Temp\DiagOutputDir` | **1.5 GB** | None — Sept 2025 diagnostics |
| Delete duplicate GGUFs in Downloads | **~10 GB** | None — have originals |
| Disable WSL2 core dumps | **prevents regrowth** | Stops 14 GB dumps per crash |
| **Total recoverable** | **~119 GB** | |
| **Post-cleanup free space** | **~138 GB** | |

### Cleanup Commands

```powershell
# Step 1: Disable WSL2 core dumps FIRST (prevents regrowth)
# Add to %USERPROFILE%\.wslconfig:
#   [wsl2]
#   kernelCommandLine = core_pattern=|/bin/true

# Step 2: Delete crash dumps (89.9 GB) — 10 ELF core dumps
Remove-Item "$env:LOCALAPPDATA\Temp\wsl-crashes" -Recurse -Force

# Step 3: Fix ClickHouse memory limit (root cause)
# In docker-compose.yml, add to langfuse-clickhouse service:
#   deploy:
#     resources:
#       limits:
#         memory: 2g

# Claude CLI cache older than 30 days (~12 GB)
Get-ChildItem "$env:LOCALAPPDATA\claude-cli-nodejs\Cache" -Recurse -File |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
  Remove-Item -Force

# Orphan temp dirs (6.8 GB)
Remove-Item "$env:LOCALAPPDATA\Temp\hmcmulwv" -Recurse -Force
Remove-Item "$env:LOCALAPPDATA\Temp\DiagOutputDir" -Recurse -Force

# Duplicate GGUFs in Downloads (~10 GB)
# Review these manually first:
# - gemma4-e4b-legal-ollama.zip (5 GB, unpacked already)
# - gemma4-legal-ollama/ (5 GB, older version)
```

---

## WSL Crash Audit (2026-04-07)

### CRITICAL: Active Crashes — ClickHouse + Node.js

`wsl-crashes/` contains **10 ELF core dumps (89.9 GB)** — NOT old NIC errors:

| Date | Process | Dumps | Size Each | Total |
|------|---------|-------|-----------|-------|
| **2026-04-07 15:07** | `/usr/bin/clickhouse` | 1 | 14.4 GB | **14.4 GB (TODAY)** |
| 2026-04-04 15:44-18:16 | `/usr/bin/clickhouse` | 5 | 11.9-13.3 GB | ~62.4 GB |
| 2026-04-03 23:29 | `/usr/bin/clickhouse` | 1 | 12.4 GB | 12.4 GB |
| 2026-04-03 16:06-07 | `/usr/local/bin/node` | 3 | ~908 MB | 2.7 GB |

**Root causes**:
1. **ClickHouse (Langfuse)**: Segfaulting in Docker/WSL2. 7 crashes since Apr 3, most recent TODAY. Each dump = full process memory (~14 GB). This is the Langfuse analytics ClickHouse container running without memory limits.
2. **Node.js**: 3 OOM crashes on Apr 3 (likely dev server hitting memory limit).

### Why Dumps Are So Large

WSL2 writes ELF core dumps (full process memory snapshots) to `%LOCALAPPDATA%\Temp\wsl-crashes/`. ClickHouse's working set is ~12-14 GB, so each crash writes a ~14 GB `.dmp` file. Without fixing the root cause, deleting dumps just creates space for the next crash.

### Fix Plan (3 Steps)

**Step 1**: Disable WSL2 core dump writes (prevents disk fill)
```ini
# %USERPROFILE%\.wslconfig
[wsl2]
kernelCommandLine = core_pattern=|/bin/true
```
Then restart WSL: `wsl --shutdown && wsl`

**Step 2**: Add ClickHouse memory limit in docker-compose.yml
```yaml
langfuse-clickhouse:
  # ... existing config ...
  deploy:
    resources:
      limits:
        memory: 2g   # Cap at 2GB — prevents 14GB crash dumps
```

**Step 3**: Delete existing dumps (89.9 GB)
```powershell
Remove-Item "$env:LOCALAPPDATA\Temp\wsl-crashes" -Recurse -Force
```

### Docker/WSL2 Infrastructure

| Component | Size | Status |
|-----------|------|--------|
| `docker_data.vhdx` | 116.7 GB | Active — all containers, images, volumes |
| `wsl/ext4.vhdx` | 16.5 GB | Active — Ubuntu WSL distro |
| WSL processes | 18 running | Healthy (6-11 MB WS each) |
| Docker distros | `docker-desktop` + `Ubuntu` | Both running |

### Hyper-V Network Errors (Separate Issue)

Event log shows `Microsoft-Windows-Hyper-V-VmSwitch` "Failed to connect NIC" errors on Apr 4 and Apr 6. These are Docker Desktop WSL2 networking glitches on sleep/wake — cosmetic, not causing the ClickHouse crashes.

---

## Cache Architecture (Current — No Changes Needed)

| Layer | Technology | What It Caches | TTL |
|-------|-----------|----------------|-----|
| L0 | LokiJS (browser) | Client queries | 5-10 min |
| L1 | IndexedDB (browser) | Synthesis results, embeddings | 1hr-7 days |
| L2 | Memory Map (server) | Hot path results | 5 min |
| L3 | Redis (server) | Embeddings, RAG, graph filters | 2-15 min |
| L4 | LiteLLM Redis | Semantic query cache | 28x speedup |
| Go gRPC | Redis SHA-256 hash | Embedding vectors | 24 hr |

Redis is already the Bifrost for server-side caching. Monitor via `GET /api/infrastructure/status`.

---

## TODO

### Phase 1: VLM Re-Attachment (Ollama GGUF)
- [ ] Open `Gemma4_E4B_Legal_VLM_Reattach.ipynb` on Colab (G4 GPU runtime)
- [ ] Upload `gemma4-legal-text-only-adapter/` from Downloads (146 MB)
- [ ] Set `USE_LOCAL_ADAPTER = True` in Cell 3
- [ ] Run all cells (1 → 10)
- [ ] Download GGUF artifacts from Google Drive (~6.5 GB total)
- [ ] Place in `trt_artifacts/gemma4-legal-vlm/`
- [ ] Run `ollama create gemma4-legal-vlm:latest -f Modelfile`
- [ ] Test VLM: `ollama run gemma4-legal-vlm:latest "Describe this image" --images test.jpg`
- [ ] Update `.env`: `OLLAMA_VLM_MODEL=gemma4-legal-vlm:latest`
- [ ] Verify VLM endpoint: `POST /api/ai/tensorrt` with image payload

### Phase 2: Fix ClickHouse Crashes + Disk Cleanup
- [x] Disable WSL2 core dumps: add `kernelCommandLine = core_pattern=|/bin/true` to `%USERPROFILE%\.wslconfig` ✅ (April 2026)
- [x] Restart WSL: `wsl --shutdown && wsl` ✅
- [x] Add ClickHouse memory limit (2GB) in docker-compose.yml for langfuse-clickhouse ✅ (deploy.resources.limits.memory: 2G + CLICKHOUSE_MAX_SERVER_MEMORY_USAGE_RATIO: 0.8)
- [x] Delete `wsl-crashes` (89.9 GB — 10 ELF core dumps, ClickHouse + Node.js) ✅
- [ ] Clear Claude CLI cache >30 days (~12 GB)
- [ ] Delete orphan temp dirs (6.8 GB)
- [ ] Delete duplicate GGUFs in Downloads (~10 GB) — review first
- [ ] Verify free space > 30 GB
- [ ] Monitor: confirm no new crash dumps appear in `%LOCALAPPDATA%\Temp\wsl-crashes`

### Phase 3: TRT-LLM Engine Build (W4A16 AWQ)
- [ ] Install TensorRT-LLM in WSL2 (or Docker)
- [ ] Convert `model.safetensors` (9.62 GB) → TRT-LLM checkpoint (W4A16 AWQ)
- [ ] Build `.engine` file targeting SM 86 (Ampere)
- [ ] Deploy to Triton Inference Server (port 8099)
- [ ] Update `inference-router.ts` to use TRT-LLM engine
- [ ] Benchmark: compare Ollama vs TRT-LLM latency

### Phase 4: TurboQuant KV Cache (Optional — vLLM)
- [ ] Install `turboquant-vllm` package
- [ ] Test with `--kv-cache-dtype turboquant35 --enable-turboquant`
- [ ] Compare KV cache VRAM usage: INT8 vs TurboQuant 3-bit
- [ ] If beneficial, switch inference-router.ts TRT path to vLLM+TurboQuant

---

## References

- [TRT-LLM Numerical Precision](https://nvidia.github.io/TensorRT-LLM/reference/precision.html)
- [TRT-LLM Support Matrix](https://nvidia.github.io/TensorRT-LLM/reference/support-matrix.html)
- [TRT-LLM Gemma Examples](https://github.com/NVIDIA/TensorRT-LLM/tree/main/examples/models/core/gemma)
- [W4A8 AWQ Ampere Issue #1496](https://github.com/NVIDIA/TensorRT-LLM/issues/1496)
- [vLLM W4A16 INT4 Docs](https://docs.vllm.ai/en/latest/features/quantization/int4/)
- [TurboQuant GitHub](https://github.com/0xSero/turboquant)
- [turboquant-vllm PyPI](https://pypi.org/project/turboquant-vllm/)
- [vLLM TurboQuant PR #38280](https://github.com/vllm-project/vllm/pull/38280)
- [llama.cpp TurboQuant Discussion](https://github.com/ggml-org/llama.cpp/discussions/20969)
- [Google TurboQuant Paper (arXiv:2504.19874)](https://arxiv.org/abs/2504.19874)
- [VLM Reattach Notebook](../scripts/unsloth-training/Gemma4_E4B_Legal_VLM_Reattach.ipynb)
- [GRPO Training Notebook](../scripts/unsloth-training/Gemma4_E4B_Legal_GRPO.ipynb)