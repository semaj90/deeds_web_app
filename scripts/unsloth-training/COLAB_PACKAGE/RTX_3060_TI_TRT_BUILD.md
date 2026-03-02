# RTX 3060 Ti TensorRT-LLM Build Guide — Gemma 3 12B

**Target Model**: Gemma 3 12B Legal (trained with Unsloth)
**GPU Specs**:
- Architecture: **Ampere**
- Compute Capability: **8.6 (SM_86)**
- CUDA Cores: 4864
- VRAM: **8GB GDDR6** (tight fit for 12B!)
- Memory Bandwidth: 448 GB/s

---

## ⚠️ IMPORTANT: 12B Model on 8GB VRAM

**Reality check**:
- 12B model = ~24GB in FP16 (too large)
- INT4 quantization = ~7.2GB (fits with tight headroom)
- Q4_K_M (GGUF) = simpler alternative to TensorRT
- **Recommendation**: Try Ollama Q4_K_M first, then TensorRT if you need extra speed

---

## Decision Tree: Which Deployment Path?

### Option 1: Ollama Q4_K_M (RECOMMENDED for 12B)
✅ **Easiest**: 5-minute setup
✅ **Fast enough**: 60-70 tokens/sec on RTX 3060 Ti
✅ **Reliable**: No custom TensorRT builds
✅ **7.2GB**: Fits comfortably in 8GB VRAM
❌ **Slower than TRT**: ~2x slower than TensorRT INT4

**When to use**: Default choice for 12B on RTX 3060 Ti

### Option 2: TensorRT-LLM INT4 (ADVANCED)
✅ **Fastest**: 120-150 tokens/sec (2x faster than Ollama)
✅ **Lower VRAM**: ~6.5GB (more headroom than Q4_K_M)
✅ **Predictable latency**: Optimized kernel fusion
❌ **Complex setup**: ~2-4 hours to build + debug
❌ **Tight VRAM**: Batch size 1-2 max on 8GB

**When to use**: You need maximum speed and can invest setup time

---

## Path A: Ollama Q4_K_M Deployment (RECOMMENDED)

### Step 1: Convert to GGUF

```bash
# Install llama.cpp
cd ~/Downloads
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
make LLAMA_CUDA=1

# Convert HuggingFace model to GGUF
python convert-hf-to-gguf.py ~/Downloads/gemma3_12b_legal_merged

# Expected output: gemma3_12b_legal_merged.gguf (~24GB FP16)
```

### Step 2: Quantize to Q4_K_M

```bash
# Quantize to 4-bit (24GB → 7.2GB)
./llama-quantize \
  gemma3_12b_legal_merged.gguf \
  gemma3_12b_legal_Q4_K_M.gguf \
  Q4_K_M

# Verify size
ls -lh gemma3_12b_legal_Q4_K_M.gguf
# Expected: ~7.2GB
```

### Step 3: Import to Ollama

```bash
# Create Modelfile
cat > Modelfile <<EOF
FROM ./gemma3_12b_legal_Q4_K_M.gguf

SYSTEM """You are a legal AI assistant trained on Svelte 5, SvelteKit 2, and legal domain knowledge. You understand evidence analysis, legal reasoning, and modern web development."""

PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 4096
PARAMETER num_gpu 999
EOF

# Import to Ollama
ollama create gemma3-12b-legal:latest -f Modelfile

# Test inference
ollama run gemma3-12b-legal:latest "Explain legal evidence types"
```

### Step 4: Verify Performance

```bash
# Check VRAM usage
nvidia-smi

# Expected:
# gemma3-12b-legal: 7.2GB VRAM
# GPU Utilization: 90-95% during inference
# Speed: 60-70 tokens/sec
```

### Step 5: Wire into SvelteKit

```typescript
// src/lib/server/llm/router.ts
import { Ollama } from 'ollama';

const ollama = new Ollama({ host: 'http://localhost:11434' });

export async function generateWithGemma12B(prompt: string) {
  const response = await ollama.generate({
    model: 'gemma3-12b-legal:latest',
    prompt,
    stream: false,
    options: {
      temperature: 0.7,
      num_ctx: 4096,
      num_gpu: 999  // Use all GPU layers
    }
  });

  return response.response;
}
```

**That's it!** You now have Gemma 3 12B running on RTX 3060 Ti.

---

## Path B: TensorRT-LLM INT4 (ADVANCED)

⚠️ **Only proceed if**:
- You need 2x faster inference (120-150 tok/s vs 60-70)
- You're comfortable with TensorRT debugging
- You have 2-4 hours for setup

---

### 1. Install TensorRT-LLM

```bash
# Clone TensorRT-LLM repo
cd ~/Downloads
git clone https://github.com/NVIDIA/TensorRT-LLM.git
cd TensorRT-LLM

# Install dependencies
pip install -r requirements.txt
pip install tensorrt_llm

# Verify installation
python -c "import tensorrt_llm; print(tensorrt_llm.__version__)"
```

### 2. Set Environment Variables

```bash
# Set CUDA architecture for RTX 3060 Ti (Ampere SM 8.6)
export CUDA_VISIBLE_DEVICES=0
export TORCH_CUDA_ARCH_LIST="8.6"
export CUDA_LAUNCH_BLOCKING=0

# Verify GPU detection
nvidia-smi

# Expected output:
# GPU 0: NVIDIA GeForce RTX 3060 Ti
# Compute Capability: 8.6
```

### 3. Convert to TensorRT-LLM Checkpoint

```bash
cd /path/to/TensorRT-LLM

python examples/gemma/convert_checkpoint.py \
  --model_dir ~/Downloads/gemma3_12b_legal_merged \
  --output_dir ./trt_checkpoints/gemma3-12b-legal \
  --dtype float16 \
  --tp_size 1 \
  --pp_size 1
```

**Output**: TensorRT-LLM checkpoint in `trt_checkpoints/gemma3-12b-legal/`

### 4. Build TensorRT Engine (INT4 for 8GB VRAM)

⚠️ **CRITICAL**: INT4 quantization is REQUIRED to fit 12B in 8GB VRAM

```bash
trtllm-build \
  --checkpoint_dir ./trt_checkpoints/gemma3-12b-legal \
  --output_dir ./trt_engines/gemma3-12b-legal-int4 \
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
  --enable_context_fmha_fp32_acc
```

**Key flags for 12B on 8GB VRAM**:
- `--weight_only_precision int4` - INT4 weights (7-8GB VRAM)
- `--max_batch_size 2` - Conservative (12B is VRAM-hungry)
- `--paged_kv_cache enable` - Essential for 8GB VRAM
- `--context_fmha enable` - Fused attention saves VRAM

**Expected output**:
```
[TensorRT-LLM] Building engine for rank 0...
[TensorRT-LLM] Engine built successfully
[TensorRT-LLM] Serializing engine to trt_engines/gemma3-12b-legal-int4/rank0.engine
```

**Engine size**: ~6.5-7 GB (INT4 quantized)

**Build time**: 20-40 minutes on RTX 3060 Ti

### 5. Verify Engine

```bash
# Check engine file
ls -lh ./trt_engines/gemma3-12b-legal-int4/rank0.engine

# Expected: ~6.5-7 GB

# Test with trtllm-runner
python examples/run.py \
  --engine_dir ./trt_engines/gemma3-12b-legal-int4 \
  --max_output_len 256 \
  --input_text "Explain legal evidence types"
```

**Expected performance**:
```
Input: Explain legal evidence types
Output: Legal evidence falls into several categories...
Tokens/sec: ~120-150
First token latency: ~80-120ms
VRAM usage: ~6.5-7 GB
```

---

## 6. Deploy with Triton Inference Server

### Model Repository Structure

```bash
mkdir -p models/gemma3_12b_legal/1

# Copy or symlink engine
ln -s $(pwd)/trt_engines/gemma3-12b-legal-int4/rank0.engine \
      models/gemma3_12b_legal/1/model.plan
```

### Triton Config (config.pbtxt)

```protobuf
name: "gemma3_12b_legal"
backend: "tensorrtllm"
max_batch_size: 2  # 12B on 8GB = batch 1-2 max

model_transaction_policy {
  decoupled: True
}

dynamic_batching {
  preferred_batch_size: [1, 2]
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
  value: { string_value: "/models/gemma3_12b_legal/1" }
}

parameters: {
  key: "max_tokens_in_paged_kv_cache"
  value: { string_value: "4096" }
}
```

### Deploy with Docker

```bash
# Pull Triton image with TensorRT-LLM backend
docker pull nvcr.io/nvidia/tritonserver:24.01-trtllm-python-py3

# Run Triton on port 8099
docker run -d --gpus all --rm \
  --name triton-gemma3-12b \
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

### Python Client (Simplified)

```python
import requests
import json

url = "http://localhost:8099/v2/models/gemma3_12b_legal/generate"

payload = {
    "text_input": "Explain legal evidence types",
    "max_tokens": 256,
    "temperature": 0.7,
    "top_p": 0.9,
    "stream": False
}

response = requests.post(url, json=payload)
result = response.json()

print(f"Generated text: {result['text_output']}")
print(f"Tokens/sec: {result.get('tokens_per_second', 'N/A')}")
```

---

## 8. Wire into SvelteKit

### Update src/lib/server/trt-llm.ts

```typescript
// src/lib/server/trt-llm.ts
import { TENSORRT_SERVICE_URL } from './env.server';

const TRITON_URL = TENSORRT_SERVICE_URL || 'http://localhost:8099';
const MODEL_NAME = 'gemma3_12b_legal';

export async function generateWithTRT(
  prompt: string,
  maxTokens = 256,
  stream = false
): Promise<string> {
  const payload = {
    text_input: prompt,
    max_tokens: maxTokens,
    temperature: 0.7,
    top_p: 0.9,
    stream
  };

  const response = await fetch(
    `${TRITON_URL}/v2/models/${MODEL_NAME}/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    throw new Error(`TRT-LLM error: ${response.statusText}`);
  }

  const result = await response.json();
  return result.text_output;
}

// Health check
export async function checkTRTHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${TRITON_URL}/v2/health/ready`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    const health = await response.json();
    return health.ready === true;
  } catch {
    return false;
  }
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
// Add TRT-LLM lease management for 12B model
export async function acquireTRTLease(): Promise<boolean> {
  const lockKey = 'gpu:tensorrt:lease';

  // Check available VRAM
  const vramAvailable = await checkVRAMAvailable();
  if (vramAvailable < 7000) {  // Need 7GB for 12B INT4
    console.warn('Insufficient VRAM for TRT-LLM 12B (need 7GB)');
    return false;
  }

  const lease = await redis.set(lockKey, 'active', {
    NX: true,
    EX: 300  // 5 min lease
  });

  if (lease) {
    // Release Ollama lease if held (can't run both 12B models simultaneously)
    await redis.del('gpu:ollama:lease');
  }

  return !!lease;
}
```

---

## 10. Performance Metrics (RTX 3060 Ti)

### Expected Performance: Gemma 3 12B INT4

| Metric | Ollama Q4_K_M | TensorRT INT4 | Speedup |
|--------|---------------|---------------|---------|
| **VRAM usage** | 7.2 GB | 6.5 GB | 10% less |
| **Throughput** | 60-70 tok/s | 120-150 tok/s | **2x faster** |
| **First token latency** | 150-200 ms | 80-120 ms | 40% faster |
| **Batch 2 latency** | N/A (batch 1) | 100-140 ms | — |
| **Max context** | 4096 tokens | 2048 tokens | TRT limited |
| **Setup time** | 5 minutes | 2-4 hours | — |

### GPU Utilization

```bash
# Monitor GPU during inference
nvidia-smi dmon -s u

# Expected:
# Idle: 1-2% utilization, ~500 MB VRAM
# Inference (batch 1): 80-95% utilization, 6.5-7 GB VRAM
# Inference (batch 2): 90-100% utilization, 7.5-7.8 GB VRAM (may OOM!)
```

### Triton Metrics

```bash
curl http://localhost:8101/metrics | grep nv_inference
```

---

## Troubleshooting

### Issue: "CUDA out of memory" during build

**Cause**: TensorRT builder needs ~12GB VRAM temporarily

**Solutions**:
1. Close all other GPU processes (Ollama, browsers, etc.)
2. Use `--builder_opt 3` instead of 4 (less aggressive)
3. Reduce `--max_input_len` to 1024

```bash
# Check what's using VRAM
nvidia-smi

# Kill Ollama if running
pkill ollama

# Retry build with lower optimization
trtllm-build ... --builder_opt 3 --max_input_len 1024
```

### Issue: "CUDA out of memory" during inference

**Cause**: 8GB VRAM is tight for 12B, especially batch size > 1

**Solutions**:
1. Reduce batch size to 1 in config.pbtxt
2. Reduce max_output_len to 256
3. Use Ollama Q4_K_M instead (simpler)

```protobuf
# config.pbtxt
max_batch_size: 1  # Reduce from 2
```

### Issue: Slow inference (<60 tok/s)

**Causes**:
1. Not using GPU (check nvidia-smi during inference)
2. Batch size too high (causing swapping)
3. Wrong precision (FP16 instead of INT4)

**Verify INT4 quantization**:
```bash
ls -lh ./trt_engines/gemma3-12b-legal-int4/rank0.engine
# Should be ~6.5-7 GB, NOT ~12-14 GB
```

### Issue: "Invalid compute capability"

**Solution**: Verify TORCH_CUDA_ARCH_LIST

```bash
export TORCH_CUDA_ARCH_LIST="8.6"
python -c "import torch; print(torch.cuda.get_arch_list())"
# Expected: ['sm_86']
```

---

## Summary

### Path A: Ollama Q4_K_M (RECOMMENDED)
✅ **5-minute setup**
✅ **60-70 tokens/sec**
✅ **7.2GB VRAM (safe margin)**
✅ **4096 token context**
✅ **Reliable, production-ready**

**Steps**:
1. Convert HF → GGUF (llama.cpp)
2. Quantize to Q4_K_M (7.2GB)
3. Import to Ollama
4. Wire into SvelteKit `/api/chat/stream`

---

### Path B: TensorRT INT4 (ADVANCED)
✅ **2x faster (120-150 tok/s)**
✅ **6.5GB VRAM (tighter fit)**
✅ **Lower latency (80-120ms first token)**
❌ **2-4 hour setup**
❌ **Complex debugging**
❌ **2048 token context max**

**Steps**:
1. Install TensorRT-LLM
2. Convert checkpoint
3. Build INT4 engine (20-40 min)
4. Deploy Triton on port 8099
5. Wire into existing TRT-LLM client

---

## Recommended Workflow

1. **Week 1**: Deploy with Ollama Q4_K_M
   - Fast setup, proven stable
   - Validate model quality on real legal tasks
   - Measure if 60-70 tok/s is sufficient

2. **Week 2**: Evaluate need for TensorRT
   - If speed is sufficient → STOP, keep Ollama
   - If you need 2x speedup → invest in TRT setup
   - TRT is optimization, not requirement

3. **Week 3+**: Production tuning
   - Monitor VRAM usage patterns
   - Tune batch sizes based on real traffic
   - Consider 24GB GPU (RTX 4090) if scaling issues

---

## Next Steps After Training Completes

1. ✅ **Download model from Colab** (24GB merged or 10GB shards)
2. ✅ **Choose deployment path** (Ollama Q4_K_M recommended)
3. ✅ **Test on real legal queries**
4. ✅ **Wire into `/api/chat/stream`** (replace gemma3-legal:latest)
5. ✅ **Monitor VRAM/speed** for 1 week
6. 🔄 **Upgrade to TensorRT** only if speed bottleneck confirmed

**TL;DR**: Start with Ollama Q4_K_M (5 minutes), upgrade to TensorRT later if needed (2-4 hours). Don't over-optimize prematurely!
