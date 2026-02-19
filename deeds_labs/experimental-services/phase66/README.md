# Phase66 TensorRT-LLM Pipeline

Complete solution for deploying EmbeddingGemma and Gemma3 models with TensorRT optimization.

## 🚀 Quick Start

### 1. Rebuild Everything
```bash
cd phase66
chmod +x *.sh
./rebuild_phase66.sh
```

This will:
- ✅ Rebuild Docker container with permanent dependencies
- ✅ Convert EmbeddingGemma to FP16 (avoids quantization issues)
- ✅ Build TensorRT FP16 engine
- ✅ Verify everything works

### 2. Manual Steps (if needed)

#### Build Container
```bash
docker compose build phase66-tensorrt-llm
```

#### Convert Model to FP16
```bash
docker exec phase66-tensorrt-llm python3 /workspace/phase66/export_fp16.py \
  /workspace/models/embeddinggemma_300m_onnx/model.onnx \
  /workspace/models/embeddinggemma_300m_fp16.onnx
```

#### Build TensorRT Engine
```bash
docker exec phase66-tensorrt-llm bash /workspace/phase66/build_trt_fp16.sh \
  /workspace/models/embeddinggemma_300m_fp16.onnx \
  /workspace/models/embeddinggemma_300m_fp16.plan
```

## 📁 File Structure

```
phase66/
├── tensorrt-llm/
│   └── Dockerfile              # Production-ready container
├── export_fp16.py              # FP16 conversion script
├── build_trt_fp16.sh           # TensorRT engine builder
├── rebuild_phase66.sh          # Full automation script
└── README.md                   # This file
```

## 🔧 What's Fixed

### ❌ Previous Issues
- TensorRT libraries not found (LD_LIBRARY_PATH)
- Pip packages disappearing on rebuild
- Asymmetric quantization errors
- Port conflicts (8090 already in use)

### ✅ Solutions
- **Permanent LD_LIBRARY_PATH** in Dockerfile
- **Permanent pip installs** with `--no-cache-dir`
- **FP16 conversion** avoids quantization issues
- **Dynamic port allocation** for services

## 🎯 Usage Examples

### Start Embedding Service
```bash
docker exec phase66-tensorrt-llm python3 /workspace/python-services/embedding_service_cuda.py
```

### Test Health Endpoint
```bash
curl http://localhost:8091/health
```

### Generate Embeddings
```bash
curl -X POST http://localhost:8091/embed \
  -H "Content-Type: application/json" \
  -d '{"text": "Legal contract analysis", "max_length": 512}'
```

## 🔍 Verification Commands

```bash
# Test TensorRT
docker exec phase66-tensorrt-llm python3 -c "import tensorrt as trt; print(trt.__version__)"

# Test TensorRT-LLM
docker exec phase66-tensorrt-llm python3 -c "import tensorrt_llm; print('OK')"

# Test ONNX Runtime GPU
docker exec phase66-tensorrt-llm python3 -c "import onnxruntime as ort; print('GPU' if 'CUDAExecutionProvider' in ort.get_available_providers() else 'CPU')"

# Check engine file
docker exec phase66-tensorrt-llm ls -lh /workspace/models/embeddinggemma_300m_fp16.plan
```

## 🚀 Performance Benefits

- **FP16 Precision**: 2-3x faster than FP32
- **CUDA Acceleration**: GPU-accelerated inference
- **No Quantization Issues**: FP16 avoids asymmetric quantization problems
- **Dynamic Shapes**: Optimized for variable input lengths (1-512 tokens)

## 🛠️ Troubleshooting

### TensorRT Not Found
```bash
# Check LD_LIBRARY_PATH
docker exec phase66-tensorrt-llm echo $LD_LIBRARY_PATH

# Manual test
docker exec phase66-tensorrt-llm bash -c "export LD_LIBRARY_PATH=/usr/local/tensorrt/targets/x86_64-linux-gnu/lib:$LD_LIBRARY_PATH && python3 -c 'import tensorrt as trt; print(trt.__version__)'"
```

### Port Already in Use
The service uses port 8091. If still in use:
```bash
# Find what's using the port
docker exec phase66-tensorrt-llm netstat -tlnp | grep 8091

# Change port in embedding_service_cuda.py
# Line 99: uvicorn.run(app, host="0.0.0.0", port=8092)
```

### Model Not Found
Ensure your ONNX model is at:
```
/workspace/models/embeddinggemma_300m_onnx/model.onnx
```

## 🎉 Success Metrics

After running `./rebuild_phase66.sh`, you should see:
- ✅ Container rebuilt successfully
- ✅ TensorRT 10.10.0.31 loaded
- ✅ FP16 model exported
- ✅ TensorRT engine built (~100MB .plan file)
- ✅ CUDA acceleration available
- ✅ Embedding service starts on port 8091

## 🚀 Next Steps

1. **Test Inference**: Use the embedding service for document similarity
2. **Scale Up**: Deploy multiple containers for load balancing
3. **Add Gemma3**: Extend pipeline for text generation models
4. **QUIC Integration**: Add QUIC protocol for ultra-low latency

---

**Built for YoRHa Legal AI Platform** - High-performance legal document processing with GPU acceleration.