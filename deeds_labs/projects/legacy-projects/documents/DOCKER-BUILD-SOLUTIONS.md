# TensorRT-LLM Build Issues - Solutions Guide

## 🚨 Issue Identified
The Docker build is failing because of PyTorch version conflicts. The error shows `torch==2.8.0+cu128` which doesn't exist in PyPI.

## 🎯 Solutions (Try in Order)

### Solution 1: Clear Docker Cache & Rebuild
```powershell
# This clears all cached layers and rebuilds fresh
.\rebuild-tensorrt-fresh.ps1
```

### Solution 2: Use Python-Only Approach (Recommended)
```powershell
# Bypasses Docker entirely, uses your Python 3.12
.\start-python-server.ps1
```

### Solution 3: Manual Docker Build with Fixed Versions
```powershell
# Build using the fixed Dockerfile
docker build --no-cache -f Dockerfile.tensorrt-fixed -t tensorrt-legal:latest .
```

### Solution 4: Check Specific Requirements
The issue is likely one of these:
- **Docker cache**: Old cached layers with wrong torch version
- **Python version**: Container uses 3.10, you have 3.12
- **CUDA version**: Container expects CUDA 12.1, you might have different version
- **Platform**: The NVIDIA container might need Linux subsystem

## 🔧 Diagnostic Commands

### Check your environment:
```powershell
# Check Python version
python --version

# Check CUDA version
nvcc --version

# Check GPU
nvidia-smi

# Check Docker
docker --version
```

### Test PyTorch installation:
```python
import torch
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"CUDA version: {torch.version.cuda}")
```

## 🚀 Immediate Workaround

Since you need this working now, I recommend **Solution 2** (Python-only):

1. Run: `.\start-python-server.ps1`
2. This will install compatible dependencies for Python 3.12
3. Start the server directly without Docker
4. Once working, we can containerize it later

## 📊 Why This Happens

The error occurs because:
- PyTorch CUDA versions need specific indexes
- `torch==2.8.0+cu128` doesn't exist (should be `torch==2.4.1` with CUDA index)
- Docker cache might contain old dependency specifications
- NVIDIA containers have specific Python/CUDA combinations

## ✅ Expected Result

After using Solution 2, you should see:
```
🚀 Server should be running at http://localhost:8100
✅ Legal AI server ready with gemma3-legal:latest simulation
```

Then you can test with:
```bash
curl http://localhost:8100/health
```