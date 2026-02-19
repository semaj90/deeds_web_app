# TensorRT-LLM ONNX Export Pipeline

This directory contains scripts for converting Gemma3 and EmbeddingGemma models to ONNX format and building optimized TensorRT engines for GPU inference.

## Overview

The pipeline consists of three main steps:
1. **Setup**: Create Python venv with ONNX tools in TensorRT-LLM container
2. **Export**: Convert HuggingFace models to ONNX format
3. **Build**: Create TensorRT engines from ONNX models

## Prerequisites

- NVIDIA TensorRT-LLM container (nvcr.io/nvidia/tensorrt-llm)
- CUDA-compatible GPU
- HuggingFace account with access to Gemma3 models

## Scripts

### 1. `create_trtllm_venv.sh`
Creates a Python 3.12 venv inside the TensorRT-LLM container with all required dependencies.

**Usage:**
```bash
# Inside TensorRT-LLM container
./create_trtllm_venv.sh
source venv/bin/activate
```

**Dependencies installed:**
- transformers
- optimum
- onnx
- onnxruntime-gpu
- huggingface_hub
- sentencepiece

### 2. `export_gemma3_270m_to_onnx.py`
Exports Google Gemma3 270M model to ONNX format.

**Usage:**
```bash
# With venv activated
python export_gemma3_270m_to_onnx.py
```

**Output:**
- `./models/onnx/gemma3_270m.onnx` - ONNX model
- `./models/onnx/tokenizer.json` - Tokenizer config
- `./models/onnx/tokenizer_config.json` - Tokenizer settings

### 3. `export_embeddinggemma_to_onnx.py`
Exports Google EmbeddingGemma 270M model to ONNX format.

**Usage:**
```bash
# With venv activated
python export_embeddinggemma_to_onnx.py
```

**Output:**
- `./models/onnx/embeddinggemma_270m.onnx` - ONNX model
- `./models/onnx/tokenizer.json` - Tokenizer config
- `./models/onnx/tokenizer_config.json` - Tokenizer settings

### 4. `build_tensorrt_engine.py`
Builds TensorRT engines from ONNX models with optimized configurations.

**Usage:**
```bash
# Build Gemma3 engine
python build_tensorrt_engine.py --model gemma3

# Build EmbeddingGemma engine
python build_tensorrt_engine.py --model embeddinggemma
```

**Output:**
- `./models/trt_engines/gemma3_engine/` - Gemma3 TensorRT engine
- `./models/trt_engines/embeddinggemma_engine/` - EmbeddingGemma TensorRT engine

## Complete Pipeline

```bash
# 1. Setup environment
./create_trtllm_venv.sh
source venv/bin/activate

# 2. Export models to ONNX
python export_gemma3_270m_to_onnx.py
python export_embeddinggemma_to_onnx.py

# 3. Build TensorRT engines
python build_tensorrt_engine.py --model gemma3
python build_tensorrt_engine.py --model embeddinggemma
```

## Model Configurations

### Gemma3 270M (Text Generation)
- **Precision**: INT4 AWQ quantization
- **Max Batch Size**: 1
- **Max Input Length**: 1024 tokens
- **Max Sequence Length**: 2048 tokens
- **Plugins**: GEMM, GPT Attention, Paged KV Cache
- **Features**: INT8 KV Cache

### EmbeddingGemma 270M (Text Embeddings)
- **Precision**: INT8 quantization
- **Max Batch Size**: 32
- **Max Input Length**: 512 tokens
- **Max Sequence Length**: 512 tokens
- **Use Case**: Vector embeddings for RAG/semantic search

## Directory Structure

```
models/
├── onnx/                          # ONNX model exports
│   ├── gemma3_270m.onnx
│   ├── embeddinggemma_270m.onnx
│   ├── tokenizer.json
│   └── tokenizer_config.json
└── trt_engines/                   # TensorRT engines
    ├── gemma3_engine/
    │   ├── config.json
    │   └── engine/
    └── embeddinggemma_engine/
        ├── config.json
        └── engine/
```

## Performance Optimizations

- **Quantization**: INT4/INT8 weight-only quantization for reduced memory usage
- **Plugins**: Custom TensorRT plugins for attention and GEMM operations
- **KV Cache**: Paged KV cache with INT8 quantization
- **Precision**: FP16 computation with quantized weights

## Integration with YoRHa

These TensorRT engines are designed for integration with the YoRHa WebGPU inference system:

1. **Gemma3 Engine**: Powers conversational AI features
2. **EmbeddingGemma Engine**: Enables semantic search and RAG
3. **WebGPU Bridge**: Engines can be loaded and executed via WebGPU compute shaders

## Troubleshooting

### Common Issues

1. **HuggingFace Access**: Ensure you have access to Gemma3 models
   ```bash
   huggingface-cli login
   ```

2. **CUDA Memory**: Models require ~4GB VRAM for export
   - Use smaller batch sizes if memory constrained

3. **ONNX Validation**: If ONNX validation fails, check model compatibility
   - Optimum library handles most conversion issues automatically

### Memory Requirements

- **Export**: ~8GB system RAM + 4GB VRAM
- **Engine Build**: ~16GB system RAM + 8GB VRAM
- **Inference**: ~2GB VRAM per engine (quantized)

## Next Steps

After building engines:
1. Test inference performance with `test_tensorrt_inference.py`
2. Integrate with YoRHa WebGPU pipeline
3. Deploy to production with monitoring

## References

- [TensorRT-LLM Documentation](https://github.com/NVIDIA/TensorRT-LLM)
- [Optimum ONNX Export](https://huggingface.co/docs/optimum/onnxruntime/usage_guides/convert_transformers_to_onnx)
- [Gemma3 Models](https://huggingface.co/google/gemma-3-270m)