# CUDA Smoketest

**Purpose**: Validate CUDA toolkit + runtime installation on Windows

---

## 🚀 Quick Start

```powershell
cd cuda-smoketest

# Configure (Visual Studio 2022)
cmake -S . -B build -G "Visual Studio 17 2022" -A x64

# Build
cmake --build build --config Release

# Run
.\build\Release\cuda_smoketest.exe
```

---

## ✅ Expected Output

```
=== CUDA Smoketest ===

✅ CUDA Runtime Version: 12.6
✅ CUDA Driver Version: 12.6
✅ CUDA Devices Found: 1

Device 0: NVIDIA GeForce RTX 3060 Ti
  Compute Capability: 8.6
  Total Global Memory: 8.00 GB
  SM Count: 38
  Max Threads per Block: 1024
  Warp Size: 32

✅ Set active device: 0
✅ Launching empty kernel...
✅ Empty kernel executed successfully
✅ Allocated 12288 bytes on device (3 arrays)
✅ Copied data to device
✅ Launching vector_add kernel (4 blocks, 256 threads/block)...
✅ Vector add kernel executed
✅ Copied result back to host
✅ Vector addition results verified (all 1024 elements correct)

=== 🎉 All CUDA tests passed! ===
Your CUDA installation is working correctly.
```

---

## 🔧 What This Tests

1. **CUDA Runtime**: Verifies CUDA runtime library is installed
2. **CUDA Driver**: Checks GPU driver compatibility
3. **Device Enumeration**: Detects available NVIDIA GPUs
4. **Device Properties**: Queries compute capability, memory, SMs
5. **Kernel Launch**: Launches minimal empty kernel
6. **Memory Operations**: cudaMalloc, cudaMemcpy (H->D, D->H)
7. **Compute Verification**: Vector addition with result validation

---

## 🚨 Troubleshooting

### Error: "CUDA runtime not found"

**Cause**: CUDA toolkit not installed or not in PATH

**Fix**:
1. Download CUDA Toolkit: https://developer.nvidia.com/cuda-downloads
2. Install (ensure "Add to PATH" is checked)
3. Verify: `nvcc --version`

---

### Error: "No CUDA devices found"

**Cause**: Incompatible or missing NVIDIA driver

**Fix**:
1. Update GPU driver: https://www.nvidia.com/Download/index.aspx
2. Verify: `nvidia-smi`
3. Check compute capability: Your GPU must support CUDA

---

### Error: "CMAKE_CUDA_COMPILER not found"

**Cause**: CMake can't find `nvcc`

**Fix**:
1. Add CUDA bin to PATH: `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin`
2. Restart terminal
3. Verify: `nvcc --version`

---

### Error: "Unsupported GPU architecture"

**Cause**: `CMAKE_CUDA_ARCHITECTURES` doesn't match your GPU

**Fix**:
```powershell
# For RTX 4090 (Ada Lovelace):
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DCMAKE_CUDA_ARCHITECTURES=89

# For RTX 3060 Ti (Ampere):
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DCMAKE_CUDA_ARCHITECTURES=86

# For Tesla V100 (Volta):
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 -DCMAKE_CUDA_ARCHITECTURES=70
```

---

## 📊 Compute Capability Reference

| GPU | Architecture | Compute Capability | CMake Flag |
|-----|--------------|-------------------|------------|
| RTX 4090 | Ada Lovelace | 8.9 | `-DCMAKE_CUDA_ARCHITECTURES=89` |
| RTX 3090 | Ampere | 8.6 | `-DCMAKE_CUDA_ARCHITECTURES=86` |
| RTX 3060 Ti | Ampere | 8.6 | `-DCMAKE_CUDA_ARCHITECTURES=86` |
| RTX 2080 Ti | Turing | 7.5 | `-DCMAKE_CUDA_ARCHITECTURES=75` |
| Tesla V100 | Volta | 7.0 | `-DCMAKE_CUDA_ARCHITECTURES=70` |
| GTX 1080 | Pascal | 6.1 | `-DCMAKE_CUDA_ARCHITECTURES=61` |

---

## 🎯 Next Steps After Success

### Option 1: PyTorch with CUDA (Recommended for Phase 89)

```powershell
# Install PyTorch with CUDA 12.6
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126
```

**Why**:
- Easier to use than CuPy on Windows
- Better documentation
- Phase 89 can use for reranking/clustering

**Test**:
```python
import torch
print(torch.cuda.is_available())  # Should print True
print(torch.cuda.get_device_name(0))  # Should print your GPU name
```

---

### Option 2: CuPy (NumPy-like GPU arrays)

```powershell
# Install CuPy for CUDA 12.x
pip install cupy-cuda12x
```

**Why**:
- Drop-in replacement for NumPy
- Good for scientific computing

**Test**:
```python
import cupy as cp
print(cp.__version__)
arr = cp.array([1, 2, 3])
print(arr.device)  # Should show GPU device
```

---

### Option 3: Use CUDA for Phase 89 Reranking

**Current**: CPU-based cosine similarity in Node.js
**Upgrade**: CUDA-accelerated matrix operations

**Pattern**:
```python
# scripts/phase89-cuda-rerank.py
import torch

def rerank_cuda(query_vec, candidate_vecs):
    """GPU-accelerated cosine similarity reranking"""
    query = torch.tensor(query_vec, device='cuda')
    candidates = torch.tensor(candidate_vecs, device='cuda')

    # Cosine similarity on GPU
    query_norm = query / query.norm()
    candidates_norm = candidates / candidates.norm(dim=1, keepdim=True)
    similarities = torch.mm(candidates_norm, query_norm.unsqueeze(1))

    # Return top-K indices
    top_k = torch.topk(similarities.squeeze(), k=20)
    return top_k.indices.cpu().numpy()
```

---

## 📚 References

- **CUDA Toolkit**: https://developer.nvidia.com/cuda-toolkit
- **Compute Capabilities**: https://developer.nvidia.com/cuda-gpus
- **CMake CUDA Support**: https://cmake.org/cmake/help/latest/module/FindCUDAToolkit.html
- **PyTorch CUDA**: https://pytorch.org/get-started/locally/
- **CuPy**: https://docs.cupy.dev/en/stable/install.html

---

## ✅ Success Criteria

- [ ] All 7 CUDA tests pass
- [ ] Vector addition verification succeeds
- [ ] No memory leaks reported
- [ ] Kernel execution time < 1ms

If all pass: **Your CUDA setup is production-ready!**
