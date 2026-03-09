# TensorRT-LLM Install Strategy (Stable Python 3.11 / WSL2 Preferred)

Goal: Deterministic, reproducible installation & build pathway for Gemma3-Legal engines targeting sub-ms inference on RTX 3060 Ti (8–12GB class) using Q4_K_M + CUDA Graphs + FlashAttention.

## 1. Selection Rationale
| Path | Pros | Cons | When to Use |
|------|------|------|-------------|
| pip wheel (WSL2) | Fast, minimal friction, NVIDIA hosted | Less control over build flags | Default for experimentation & light customization |
| Source build (WSL2) | Patch capability, custom arch flags, plugin tweaks | Longer build, toolchain required | Need to modify kernels, enable experimental flags |
| Container (Docker WSL2) | Isolation, prod parity, no host pollution | Slight I/O overhead, volume mapping | CI/CD reproducibility, multi-dev consistency |
| Windows Native | Convenient to test API clients | Fragile GPU stack, build issues | Only for client testing, never for engine build |

Decision: Build engines INSIDE WSL2 (pip or source) → Serve via WSL2 → Bridge to Windows frontend.

## 2. Prerequisites (WSL2 Ubuntu 22.04/24.04)
```bash
nvidia-smi          # Driver + CUDA runtime visible
python3 --version   # 3.11.x
which python        # /usr/bin/python or venv python
```
Install build essentials (for source path & some plugin compilations):
```bash
sudo apt-get update
sudo apt-get install -y build-essential git cmake ninja-build python3-dev pkg-config libpthread-stubs0-dev
```

## 3. Virtual Environment
```bash
pyenv local 3.11.8   # if using pyenv
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip wheel setuptools
```

## 4. Torch Stack (Before TRT-LLM)
Follow `PYTORCH_CUDA_INSTALL_MATRIX.md` to pick correct CUDA wheel. Example (CUDA 12.6):
```bash
pip install --index-url https://download.pytorch.org/whl/cu126 \
  torch==2.4.1 torchvision==0.19.1 torchaudio==2.4.1
```
Verify:
```bash
python -c "import torch; print(torch.__version__, torch.cuda.get_device_name(0))"
```

## 5. Install TensorRT-LLM (Wheel Path)
```bash
pip install --extra-index-url https://pypi.nvidia.com tensorrt-llm==0.11.0
# Optional extras for conversions
pip install transformers accelerate huggingface-hub sentencepiece safetensors
```
Validate:
```bash
python - <<'PY'
import tensorrt_llm as t; print('TensorRT-LLM', t.__version__)
PY
```

## 6. Source Build (Only if Needed)
Reasons: patch kernels, enable debug instrumentation, custom plugin experiments.
```bash
git clone https://github.com/NVIDIA/TensorRT-LLM.git -b release/0.11 tensorrt-llm-src
cd tensorrt-llm-src
pip install -r requirements.txt
# Optional: export TORCH_CUDA_ARCH_LIST="8.6"  # Restrict build to 3060 Ti
python scripts/build_wheels.py --python-version 3.11 --cuda-default
pip install dist/tensorrt_llm*whl
```
If build fails due to CUDA path: ensure `/usr/local/cuda` symlink exists or export `CUDA_HOME`.

## 7. Container Path (Deterministic CI)
Example Dockerfile snippet (multi-stage):
```Dockerfile
FROM nvcr.io/nvidia/pytorch:24.07-py3  # Contains CUDA + Torch
ARG TRT_LLM_VER=0.11.0
RUN pip install --extra-index-url https://pypi.nvidia.com tensorrt-llm==${TRT_LLM_VER} \
    && pip cache purge
```
Run (WSL2 Docker backend):
```bash
docker run --gpus all -it --rm -v $(pwd):/workspace app/trt-llm bash
```

## 8. Environment Variables (Recommended)
| Variable | Purpose |
|----------|---------|
| `PYTHONWARNINGS=ignore:Deprecated` | Reduce noise |
| `TLLM_LOG_LEVEL=INFO` | Adjust logging (DEBUG for troubleshooting) |
| `CUDA_VISIBLE_DEVICES=0` | Pin single GPU |
| `NVIDIA_TF32_OVERRIDE=0` | Ensure deterministic FP16/BF16 |
| `OMP_NUM_THREADS=1` | Avoid CPU oversubscription |

## 9. Conversion Workflow (Gemma HF → TRT-LLM)
```bash
# 1. Download / place HF model shards in ./models/gemma3_hf
# 2. Convert
python -m tensorrt_llm.models.gemma.convert \
  --model_dir ./models/gemma3_hf \
  --output_dir ./models/gemma3_trt \
  --dtype float16 --tp_size 1 --pp_size 1
# 3. Build engine (Q4_K_M)
trtllm-build \
  --checkpoint_dir ./models/gemma3_trt \
  --output_dir ./engines/gemma3_q4km \
  --gemma_version 3 --quantization q4_k_m \
  --max_batch_size 4 --max_input_len 2048 --max_output_len 512 \
  --use_paged_kv_cache --gpt_attention_plugin float16 --gemm_plugin float16 \
  --strongly_typed --use_fp8_context_fallback  # (conditional future flag)
```

## 10. Serving
Simple HLAPI server:
```bash
python -m tensorrt_llm.hlapi.llm_server --engine_dir ./engines/gemma3_q4km --port 8100
```
Client test:
```bash
curl -s -X POST localhost:8100/generate -H 'Content-Type: application/json' \
  -d '{"text":"Legal analysis: Provide risk summary.","max_new_tokens":64}'
```

## 11. Rebuild Procedure
1. Backup old engines: `mv engines/gemma3_q4km engines/gemma3_q4km_$(date +%Y%m%d%H%M)`
2. Update torch/TRT-LLM only after reading release notes
3. Re-run conversion (clean output dirs) to avoid stale kv-cache plugin mismatch
4. Benchmark latency & token throughput; diff vs previous version

## 12. Validation Script Snippet
```bash
python - <<'PY'
import torch, tensorrt_llm
print('GPU:', torch.cuda.get_device_name(0))
print('Torch:', torch.__version__)
print('TRT-LLM:', tensorrt_llm.__version__)
print('BF16 supported:', torch.cuda.is_bf16_supported())
PY
```

## 13. Troubleshooting Matrix
| Issue | Cause | Mitigation |
|-------|-------|-----------|
| `libnvinfer.so not found` | Missing TensorRT runtime (older workflow) | Use pip `tensorrt-llm` wheel which bundles dependencies |
| Segfault during build | Mixed torch/TRT CUDA versions | Reinstall matching versions, clear `~/.cache/torch_extensions` |
| OOM building engine | Workspace too large | Lower `--max_batch_size` / reduce seq lens / increase swap |
| Slow first token | Missing CUDA Graph capture | Add `--use_cuda_graph` when supported (or upgrade TRT-LLM) |
| Poor throughput | Input padding not removed | Ensure `--enable_remove_input_padding` (future flag name) |

## 14. Security & Integrity
- NEVER fabricate random weight shards (guard present in pipeline script)
- Verify safetensors integrity: `sha256sum *.safetensors`
- Pin requirements; commit `requirements-freeze.txt` for reproducibility.

## 15. Upgrade Decision Checklist
| Question | Proceed if Yes |
|----------|---------------|
| Driver updated & stable? | ✓ |
| Benchmark regression <2%? | ✓ |
| Engine size change expected? | Documented |
| Release notes reviewed? | ✓ |

---
Stable, auditable pathway ensures legal AI inference reproducibility and latency targets.
