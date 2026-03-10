# TensorRT-LLM Custom Build for Gemma3 12B INT4 AWQ

This directory contains the complete pipeline for building a custom TensorRT engine for the Gemma3 12B model with INT4 AWQ quantization, optimized for RTX 3060 Ti (8GB VRAM).

## Overview

- **Model**: Gemma3 12B (4096 hidden size, 48 layers, 32 attention heads, 8 KV heads)
- **Quantization**: INT4 AWQ (per-group, group size 128)
- **Target Hardware**: RTX 3060 Ti (8GB VRAM)
- **Framework**: TensorRT-LLM 0.20.0 with custom model support

## Directory Structure

```
tensorrt_build/
├── input/
│   ├── gemma3-12b-checkpoint/     # Original Gemma3 checkpoint
│   │   ├── rank0.safetensors     # Model weights
│   │   ├── config.json          # Model configuration
│   │   └── tokenizer.json       # Tokenizer config
│   └── custom_build.json        # TRT-LLM build configuration
├── output/
│   ├── converted_checkpoint/     # Converted PyTorch checkpoint
│   └── engine/                   # Built TensorRT engine
└── scripts/
    ├── convert_checkpoint.py     # Checkpoint conversion script
    ├── verify_custom_shapes.py   # Tensor shape verification
    ├── build_tensorrt_engine_int4.sh    # Main build script
    └── docker_build_tensorrt_engine.sh  # Docker wrapper
```

## Quick Start

### Prerequisites

1. **NVIDIA GPU**: RTX 3060 Ti or better with CUDA 12.2+
2. **Docker**: With NVIDIA Container Toolkit
3. **Gemma3 Checkpoint**: Place `rank0.safetensors` in `input/` directory
4. **Disk Space**: ~50GB free space (for engine build process)

### Build Process

1. **Place your checkpoint**:
   ```bash
   # Copy your Gemma3 12B checkpoint to:
   cp rank0.safetensors tensorrt_build/input/
   cp config.json tensorrt_build/input/  # optional
   ```

2. **Run the Docker build**:
   ```bash
   cd tensorrt_build
   bash scripts/docker_build_tensorrt_engine.sh
   ```

## Build Process Details

### Direct Checkpoint Usage

Due to disk space constraints, this pipeline works directly with the original Gemma3 safetensors checkpoint using custom weight mappings instead of converting the entire checkpoint upfront.

### Step 1: Checkpoint Verification

- Verifies `rank0.safetensors` exists
- Checks basic file integrity

### Step 2: TensorRT Engine Build

The build uses custom weight mappings to read tensors directly from the original checkpoint:

```json
{
  "embed_tokens": "transformer.vocab_embedding.weight",
  "layers.*.self_attn.qkv_proj": "transformer.layers.*.attention.qkv.weight",
  "layers.*.mlp.gate_proj": "transformer.layers.*.mlp.gate.weight",
  // ... etc
}
```

- **Precision**: INT4 AWQ quantization
- **Batch Size**: 1 (memory optimized)
- **Sequence Length**: 4096 tokens
- **KV Cache**: Paged (memory efficient)
- **Plugins**: GPT Attention (FP16), GEMM (FP16)

## Configuration Details

### Model Architecture
```json
{
  "num_layers": 48,
  "num_heads": 30,
  "num_kv_heads": 17,
  "hidden_size": 3840,
  "head_dim": 128,
  "intermediate_size": 15360,
  "vocab_size": 262208
}
```

### Weight Mappings
- `transformer.vocab_embedding.weight` → `embed_tokens` / `lm_head`
- `transformer.layers.X.attention.qkv.weight` → `layers.X.self_attn.qkv_proj`
- `transformer.layers.X.mlp.*.weight` → `layers.X.mlp.*_proj`
- Layer norms follow standard transformer naming

## VRAM Usage Estimation

- **Model Weights**: ~3.2GB (INT4 quantized)
- **KV Cache**: ~0.5GB (4096 tokens max)
- **Working Memory**: ~0.8GB
- **Total**: ~4.5GB (comfortable fit in 8GB VRAM)

## Troubleshooting

### Build Failures

1. **"sliding_window_pattern is None"**:
   - Ensure `sliding_window_pattern` is set to 6 in `custom_build.json`

2. **Missing required fields**:
   - Check `max_input_len` and `max_seq_len` are both set

3. **Tensor shape mismatches**:
   - Run `verify_custom_shapes.py` to check tensor dimensions
   - Ensure checkpoint is Gemma3 12B (not 4B)

### Memory Issues

1. **Out of VRAM during build**:
   - Reduce `max_batch_size` to 1
   - Use `--use_paged_kv_cache` for memory efficiency

2. **Inference memory issues**:
   - Keep batch size = 1
   - Limit sequence length to 4096

## Performance Expectations

- **Build Time**: 15-25 minutes on RTX 3060 Ti
- **Engine Size**: ~3.5GB
- **Inference Speed**: ~50-80 tokens/sec (batch=1, 4096 context)
- **Memory Usage**: ~4.5GB peak during inference

## Integration

After successful build, the engine can be used with:

```python
from tensorrt_llm import LLM

llm = LLM(
    model="output/engine",
    tokenizer="input/gemma3-12b-checkpoint/tokenizer.json"
)

response = llm.generate("Your prompt here")
```

## Files Generated

- `output/converted_checkpoint/converted_checkpoint.pt`: Converted PyTorch weights
- `output/converted_checkpoint/tensor_info.json`: Tensor shape information
- `output/engine/`: TensorRT engine files (rank0.engine, config.json, etc.)

## Support

This build pipeline is specifically tuned for:
- Gemma3 12B architecture
- RTX 3060 Ti (8GB VRAM)
- INT4 AWQ quantization
- Single-GPU inference

For other configurations, modify the parameters in `custom_build.json` and rebuild.