# TensorRT-LLM Engine Build Guide

## Quick Start

```bash
# 1. Install dependencies
pip install tensorrt-llm safetensors

# 2. Build engine from your Unsloth model
python scripts/build-tensorrt-engine.py \
  --model-path ./models/gemma3-unsloth \
  --output-dir ./tensorrt_engine \
  --max-batch-size 4 \
  --max-input-len 2048 \
  --max-seq-len 4096

# 3. Test engine
python scripts/test-tensorrt-inference.py ./tensorrt_engine/engine

# 4. Deploy
npm run deploy:tensorrt
```

## Performance Targets (RTX 3060 Ti)

| Metric | Target | Best Case | Acceptable |
|--------|--------|-----------|------------|
| **Latency** | 40-60ms | 30-40ms | <100ms |
| **Throughput** | 25-35 tok/s | 35-45 tok/s | >20 tok/s |
| **Batch Size** | 4 | 8 | 2 |
| **VRAM Usage** | 6-7GB | 5-6GB | <7.5GB |

## Optimizations Applied

✅ **INT4 Weight Quantization** - 4x memory reduction
✅ **FP16 Activations** - Optimal latency/quality tradeoff
✅ **Flash Attention 2** - 2-4x attention speedup
✅ **Paged KV Cache** - Variable-length efficiency
✅ **CUDA Graphs** - 20-30% overall speedup
✅ **Input Padding Removal** - Reduce computation waste

## Next Steps

1. Provide your Unsloth model path
2. Run the build script
3. Test with legal queries
4. Integrate with SvelteKit API
