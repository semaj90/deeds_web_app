# PyTorch + CUDA + Triton Install Matrix (RTX 3060 Ti / WSL2 + Windows)

Purpose: Deterministic selection of torch / torchvision / torchaudio / triton builds aligned with NVIDIA driver & CUDA runtime for stable TensorRT-LLM engine builds (Python 3.11.x stable lane).

## 1. Detect Environment
```bash
# Windows PowerShell
nvidia-smi
# WSL2 Ubuntu
nvidia-smi --query-gpu=driver_version,name,memory.total --format=csv
python -c "import sys; print(sys.version)"
```
Record: Driver Version (e.g. 555.85), CUDA Version shown by nvidia-smi (e.g. 12.5, 12.8, 12.6). The CUDA version reported = driver-supported runtime, not necessarily a full toolkit install.

## 2. Supported Driver → CUDA Runtime Bands
| Driver Branch | Reported CUDA | Recommended Torch CUDA | Notes |
|---------------|---------------|------------------------|-------|
| 550.xx – 555.xx | 12.4 – 12.6 | 12.4 / 12.5 wheels | Stable for TRT 9.3+ |
| 556.xx – 560.xx | 12.6 – 12.8 | 12.6 / 12.8 wheels | Prefer 12.8 if TRT ≥ 9.5 |
| 535.xx – 549.xx | 12.2 – 12.4 | 12.1/12.2 wheels     | Legacy, upgrade if possible |
| 531.xx – 534.xx | 12.0 – 12.1 | 12.1 wheels           | Consider driver upgrade |

Rule: Select the highest matching stable torch CUDA minor that is ≤ reported runtime and supported by TensorRT version you will install.

## 3. Torch + TensorRT-LLM Compatibility (Simplified)
| TensorRT-LLM | TensorRT Core | Min CUDA | Preferred Torch CUDA | Triton Bundle |
|--------------|---------------|---------|----------------------|---------------|
| 0.9.x        | 9.3.x         | 12.4    | 12.4 / 12.5          | Triton 2.3.x  |
| 0.10.x       | 9.4.x         | 12.5    | 12.5 / 12.6          | Triton 2.3.x  |
| 0.11.x       | 9.5.x         | 12.6    | 12.6 / 12.8          | Triton 2.4.x  |
| 0.12.x (future) | 9.6.x*     | 12.8    | 12.8                 | Triton 2.4.x+ |
*Projection based on NVIDIA release cadence.

## 4. Version Selection Algorithm
Pseudo:
```
read driver_cuda
if driver_cuda >= 12.8: torch_cuda = 12.8 (else 12.6 if TRT <9.5)
else if driver_cuda >= 12.6: torch_cuda = 12.6
else if driver_cuda >= 12.5: torch_cuda = 12.5
else if driver_cuda >= 12.4: torch_cuda = 12.4
else torch_cuda = 12.1  # warn
```
Ensure chosen torch_cuda satisfies TensorRT-LLM minimum.

## 5. Install Commands
Always activate Python 3.11 venv first.

### 5.1 WSL2 Ubuntu (Recommended)
```bash
# Base tooling (if toolkit needed for nvcc, optional for runtime-only)
sudo apt-get update
sudo apt-get install -y build-essential python3-dev pkg-config

# Optional: install matching CUDA toolkit meta if compiling custom ops
# (example for CUDA 12.6)
# sudo apt-get install -y cuda-toolkit-12-6

# Clean old wheels
pip uninstall -y torch torchvision torchaudio triton

# Select one block ONLY (example assumes torch_cuda=12.6)
# Torch 2.4.* with CUDA 12.6
pip install --index-url https://download.pytorch.org/whl/cu126 torch==2.4.1 torchvision==0.19.1 torchaudio==2.4.1

# If targeting CUDA 12.8 (early channel when available)
# pip install --index-url https://download.pytorch.org/whl/cu128 torch==2.5.0 torchvision==0.20.0 torchaudio==2.5.0

# Verify
python - <<'PY'
import torch, triton
print('Torch:', torch.__version__)
print('CUDA available:', torch.cuda.is_available())
print('CUDA arch list:', torch.cuda.get_arch_list()[:4])
print('Device:', torch.cuda.get_device_name(0))
import tensorrt_llm as tllm; print('TensorRT-LLM (if installed):', getattr(tllm,'__version__','not yet'))
PY
```

### 5.2 Windows Native (Not Recommended for Build)
If you must install (for ancillary testing only):
```powershell
pip uninstall -y torch torchvision torchaudio triton
# Example for CUDA 12.6
pip install torch==2.4.1 torchvision==0.19.1 torchaudio==2.4.1 --index-url https://download.pytorch.org/whl/cu126
```
Do NOT build TensorRT-LLM engines on Windows – perform builds inside WSL2.

### 5.3 Conda Alternate (WSL2)
```bash
conda create -n trt311 python=3.11 -y
conda activate trt311
conda install pytorch torchvision torchaudio pytorch-cuda=12.6 -c pytorch -c nvidia
```
Prefer pip for parity with deployment images unless you need conda-forge system libs.

## 6. Triton Stability Notes
- If triton mismatch occurs: `pip install triton==2.3.1` (for Torch 2.4.x baseline) or 2.4.x for newer.
- Avoid nightly Torch for production engine determinism.
- Confirm BF16 support: `torch.cuda.is_bf16_supported()`.

## 7. Verification Checklist
```bash
python -c "import torch; assert torch.cuda.is_available(); print(torch.__version__)"
python -c "import torch; x=torch.randn(4096,4096,device='cuda'); y=x@x; print(y.shape)"
python -c "import torch; print(torch.cuda.get_device_capability())"  # Expect (8,6) for 3060 Ti
```

## 8. Common Failure Modes
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `CUDA error: invalid device ordinal` | WSL GPU not exposed | Reboot / update driver / `wsl --shutdown` |
| `Torch not compiled with CUDA` | Installed CPU wheel | Reinstall with correct cuXXX index URL |
| `libcuda.so not found` | Missing driver interface in WSL | Update NVIDIA driver, ensure `nvidia-smi` works |
| `Illegal instruction` | Mixed AVX2/AVX512 host flags | Reinstall stable wheel (avoid nightly) |

## 9. Pin File Example (`requirements-trt-llm.txt`)
```
torch==2.4.1+cu126 --index-url https://download.pytorch.org/whl/cu126
torchvision==0.19.1+cu126
triton==2.3.1
tensorrt-llm==0.11.0  # ensure release matches CUDA selection
transformers==4.44.2
accelerate==0.34.2
huggingface-hub==0.24.6
numpy<2  # until upstream full TRT validation
```

## 10. Upgrade Path
1. Upgrade driver -> verify `nvidia-smi` (new CUDA runtime)
2. Install newer Torch matching runtime
3. Reinstall / rebuild TensorRT-LLM (clean engine_dir)
4. Benchmark & diff latency before promoting

---
Use this matrix before every engine build to guarantee reproducibility.
