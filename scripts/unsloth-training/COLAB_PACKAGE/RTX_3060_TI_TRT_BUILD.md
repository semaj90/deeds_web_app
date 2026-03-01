# RTX 3060 Ti TensorRT-LLM Build Guide

**GPU Specs**:
- Architecture: **Ampere**
- Compute Capability: **8.6 (SM_86)**
- CUDA Cores: 4864
- VRAM: 8GB GDDR6
- Memory Bandwidth: 448 GB/s

---

## 1. Environment Setup

```bash
# Set CUDA architecture for RTX 3060 Ti (Ampere SM 8.6)
export CUDA_VISIBLE_DEVICES=0
export TORCH_CUDA_ARCH_LIST="8.6"
export CUDA_LAUNCH_BLOCKING=0  # Async kernel launches for performance

# Verify GPU detection
nvidia-smi

# Expected output:
# GPU 0: NVIDIA GeForce RTX 3060 Ti
# Compute Capability: 8.6
```

---

## 2. Convert Gemma 3n to TensorRT-LLM Checkpoint

```bash
cd /path/to/TensorRT-LLM

python examples/gemma/convert_checkpoint.py \
  --model_dir /path/to/gemma3n-legal-merged-16bit \
  --output_dir ./trt_checkpoints/gemma3n-legal \
  --dtype float16 \
  --tp_size 1 \
  --pp_size 1
```

**Output**: TensorRT-LLM checkpoint in `trt_checkpoints/gemma3n-legal/`

---

## 3. Build TensorRT Engine (INT4 Quantization for 8GB VRAM)

### Option A: Optimized for RTX 3060 Ti (Recommended)

```bash
trtllm-build \
  --checkpoint_dir ./trt_checkpoints/gemma3n-legal \
  --output_dir ./trt_engines/gemma3n-legal-rtx3060ti \
  --gemm_plugin float16 \
  --gpt_attention_plugin float16 \
  --use_weight_only \
  --weight_only_precision int4 \
  --max_batch_size 4 \
  --max_input_len 2048 \
  --max_output_len 512 \
  --max_beam_width 1 \
  --builder_opt 4 \
  --strongly_typed \
  --context_fmha enable \
  --remove_input_padding enable \
  --paged_kv_cache enable \
  --enable_context_fmha_fp32_acc
```

**Key flags for RTX 3060 Ti**:
- `--gemm_plugin float16` - FP16 matrix multiplication (Ampere Tensor Cores)
- `--gpt_attention_plugin float16` - FP16 attention (faster on Ampere)
- `--weight_only_precision int4` - INT4 weights (fits 2B model in 8GB VRAM)
- `--max_batch_size 4` - Conservative batch size for 8GB VRAM
- `--context_fmha enable` - Fused multi-head attention (Ampere-optimized)
- `--paged_kv_cache enable` - PagedAttention for memory efficiency
- `--builder_opt 4` - Max optimization level

**Expected output**:
```
[TensorRT-LLM] Building engine for rank 0...
[TensorRT-LLM] Engine built successfully
[TensorRT-LLM] Serializing engine to trt_engines/gemma3n-legal-rtx3060ti/rank0.engine
```

**Engine size**: ~1.2 GB (INT4 quantized)

---

### Option B: Maximum Performance (PTX + Aggressive Optimizations)

```bash
trtllm-build \
  --checkpoint_dir ./trt_checkpoints/gemma3n-legal \
  --output_dir ./trt_engines/gemma3n-legal-ptx \
  --gemm_plugin float16 \
  --gpt_attention_plugin float16 \
  --use_weight_only \
  --weight_only_precision int4 \
  --max_batch_size 2 \
  --max_input_len 2048 \
  --max_output_len 512 \
  --max_beam_width 1 \
  --builder_opt 4 \
  --strongly_typed \
  --context_fmha enable \
  --remove_input_padding enable \
  --paged_kv_cache enable \
  --use_paged_context_fmha enable \
  --enable_context_fmha_fp32_acc \
  --multi_block_mode enable \
  --use_custom_all_reduce disable
```

**Additional PTX optimizations**:
- `--use_paged_context_fmha enable` - Paged context attention
- `--multi_block_mode enable` - Multi-block attention (Ampere CUDA cores)
- `--max_batch_size 2` - Reduced for aggressive optimizations

---

## 4. Verify Engine

```bash
# Check engine file
ls -lh ./trt_engines/gemma3n-legal-rtx3060ti/rank0.engine

# Expected: ~1.2 GB

# Test with trtllm-runner
python examples/run.py \
  --engine_dir ./trt_engines/gemma3n-legal-rtx3060ti \
  --max_output_len 256 \
  --input_text "Explain legal evidence types"
```

---

## 5. Triton Inference Server Setup

### Model Repository Structure

```
models/
└── gemma3n_legal/
    ├── config.pbtxt
    └── 1/
        └── model.plan  # Symlink to rank0.engine
```

### Create Model Repository

```bash
mkdir -p models/gemma3n_legal/1

# Copy or symlink engine
cp ./trt_engines/gemma3n-legal-rtx3060ti/rank0.engine \
   models/gemma3n_legal/1/model.plan

# Or symlink (recommended for updates)
ln -s $(pwd)/trt_engines/gemma3n-legal-rtx3060ti/rank0.engine \
      models/gemma3n_legal/1/model.plan
```

### Triton Config (config.pbtxt)

```protobuf
name: "gemma3n_legal"
backend: "tensorrtllm"
max_batch_size: 4

model_transaction_policy {
  decoupled: True
}

dynamic_batching {
  preferred_batch_size: [1, 2, 4]
  max_queue_delay_microseconds: 100
}

instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [0]  # RTX 3060 Ti
  }
]

parameters: {
  key: "max_beam_width"
  value: { string_value: "1" }
}

parameters: {
  key: "gpt_model_type"
  value: { string_value: "gemma" }
}

parameters: {
  key: "gpt_model_path"
  value: { string_value: "/models/gemma3n_legal/1" }
}
```

---

## 6. Deploy with Docker

```bash
# Pull Triton image with TensorRT-LLM backend
docker pull nvcr.io/nvidia/tritonserver:24.01-trtllm-python-py3

# Run Triton on port 8099
docker run -d --gpus all --rm \
  --name triton-gemma3n \
  --shm-size=2g \
  -p 8099:8000 \
  -p 8100:8001 \
  -p 8101:8002 \
  -v $(pwd)/models:/models \
  nvcr.io/nvidia/tritonserver:24.01-trtllm-python-py3 \
  tritonserver \
    --model-repository=/models \
    --backend-config=tensorrtllm,max_beam_width=1 \
    --backend-config=tensorrtllm,batch_scheduler_policy=max_utilization \
    --log-verbose=1

# Check server health
curl http://localhost:8099/v2/health/ready

# Expected: {"ready":true}
```

---

## 7. Test Inference

### cURL Test

```bash
curl -X POST http://localhost:8099/v2/models/gemma3n_legal/infer \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": [
      {
        "name": "input_ids",
        "shape": [1, 10],
        "datatype": "INT32",
        "data": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      }
    ],
    "outputs": [
      {"name": "output_ids"}
    ]
  }'
```

### Python Client

```python
import requests
import json

url = "http://localhost:8099/v2/models/gemma3n_legal/infer"
prompt = "Explain evidence type detection in legal AI"

# Tokenize prompt (simplified - use real tokenizer in production)
input_ids = [1, 2, 3, 4, 5]  # Replace with actual token IDs

payload = {
    "inputs": [
        {
            "name": "input_ids",
            "shape": [1, len(input_ids)],
            "datatype": "INT32",
            "data": input_ids
        },
        {
            "name": "max_output_len",
            "shape": [1],
            "datatype": "INT32",
            "data": [256]
        }
    ],
    "outputs": [{"name": "output_ids"}]
}

response = requests.post(url, json=payload)
print(response.json())
```

---

## 8. Wire into SvelteKit

### Update src/lib/server/trt-llm.ts

```typescript
// src/lib/server/trt-llm.ts
import { TENSORRT_SERVICE_URL } from './env.server';

const TRITON_URL = TENSORRT_SERVICE_URL || 'http://localhost:8099';
const MODEL_NAME = 'gemma3n_legal';

export async function generateWithTRT(
  prompt: string,
  maxTokens = 256
): Promise<string> {
  // Tokenize prompt (use real tokenizer)
  const inputIds = tokenizePrompt(prompt);

  const payload = {
    inputs: [
      {
        name: 'input_ids',
        shape: [1, inputIds.length],
        datatype: 'INT32',
        data: inputIds
      },
      {
        name: 'max_output_len',
        shape: [1],
        datatype: 'INT32',
        data: [maxTokens]
      }
    ],
    outputs: [{ name: 'output_ids' }]
  };

  const response = await fetch(
    `${TRITON_URL}/v2/models/${MODEL_NAME}/infer`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  const result = await response.json();
  const outputIds = result.outputs[0].data;

  // Detokenize (use real tokenizer)
  return detokenizeOutput(outputIds);
}
```

### Update .env

```bash
# .env
TENSORRT_SERVICE_URL=http://localhost:8099
```

---

## 9. GPU Arbiter Integration

Your existing GPU arbiter manages VRAM between Ollama (port 11434) and TRT-LLM (port 8099).

### Update src/lib/server/llm/gpu-arbiter.ts

```typescript
// Add TRT-LLM lease management
export async function acquireTRTLease(): Promise<boolean> {
  const lockKey = 'gpu:tensorrt:lease';
  const lease = await redis.set(lockKey, 'active', {
    NX: true,
    EX: 300  // 5 min lease
  });

  if (lease) {
    // Release Ollama lease if held
    await redis.del('gpu:ollama:lease');
  }

  return !!lease;
}
```

---

## 10. Performance Metrics (RTX 3060 Ti)

**Expected performance with Gemma 3n 2B INT4**:

| Metric | Value |
|--------|-------|
| VRAM usage | ~4-5 GB |
| Throughput | ~40-60 tokens/sec |
| Latency (first token) | ~50-100 ms |
| Latency (subsequent) | ~15-25 ms |
| Max batch size | 4 |
| Max context | 2048 tokens |

**Comparison vs Ollama**:
- TRT-LLM: ~2-3x faster throughput
- TRT-LLM: ~50% less VRAM
- TRT-LLM: More predictable latency

---

## 11. Monitoring

### Check GPU utilization

```bash
nvidia-smi dmon -s u
```

### Triton metrics

```bash
curl http://localhost:8101/metrics
```

### Expected GPU usage:
- Idle: ~1-2% utilization, ~500 MB VRAM
- Inference (batch 1): ~40-60% utilization, ~4-5 GB VRAM
- Inference (batch 4): ~70-90% utilization, ~6-7 GB VRAM

---

## Troubleshooting

### Issue: "CUDA out of memory"
**Solution**: Reduce batch size or max_input_len
```bash
# Rebuild with smaller batch
trtllm-build ... --max_batch_size 2 --max_input_len 1024
```

### Issue: "Invalid compute capability"
**Solution**: Verify TORCH_CUDA_ARCH_LIST
```bash
export TORCH_CUDA_ARCH_LIST="8.6"
python -c "import torch; print(torch.cuda.get_arch_list())"
```

### Issue: "Engine not found"
**Solution**: Check model.plan symlink
```bash
ls -la models/gemma3n_legal/1/model.plan
```

---

## Summary

✅ **RTX 3060 Ti (Ampere SM 8.6) optimized**
✅ **INT4 quantization (~1.2 GB engine)**
✅ **Fits in 8GB VRAM with headroom**
✅ **2-3x faster than Ollama**
✅ **Triton deployment on port 8099**
✅ **GPU arbiter managed**

**Next steps**:
1. Train Gemma 3n with Unsloth notebook
2. Download merged model
3. Run this TRT build script
4. Deploy via Triton
5. Wire into `/api/vision/analyze`
