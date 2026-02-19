# 🚀 TensorRT-LLM + Triton Inference Server - Gemma-3 VLM Integration
**Created:** January 2, 2026
**Target GPU:** NVIDIA RTX 3060 Ti (8GB VRAM, Compute 8.6)
**Current Stack:** Ollama (gemma3:270m) + FastMCP (14 tools) + ACE Timeline

---

## 📋 Executive Summary

**Goal:** Replace Ollama LLM generation with TensorRT-LLM + Triton for **3-5x performance improvement** while maintaining backward compatibility with existing FastMCP middleware.

**Why TensorRT-LLM?**
- ⚡ **Native CUDA optimization** - PTX compilation for exact GPU architecture
- 🎯 **Kernel fusion** - Eliminates intermediate memory copies
- 📦 **FP16/INT8 quantization** - 2-4x memory reduction without quality loss
- 🔄 **KV cache optimization** - Faster autoregressive generation
- 🌐 **Production-grade serving** - Triton handles batching, queueing, metrics

**Current Performance (Ollama gemma3:270m):**
- First token latency: ~500-800ms
- Throughput: ~15-20 tokens/sec
- Memory: 291 MB model + overhead

**Target Performance (TensorRT-LLM gemma3:270m):**
- First token latency: **<100ms** (5-8x faster)
- Throughput: **>50 tokens/sec** (3x faster)
- Memory: ~150 MB (FP16 quantized engine)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     FastMCP Agentic Middleware                  │
│  (15 tools: 14 existing + triton_vlm_generate)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ├─── Ollama (fallback/embeddings)
                              │    └── embeddinggemma:latest
                              │
                              └─── Triton Inference Server ───────┐
                                   (Python Backend)               │
                                   http://localhost:8000          │
                                                                   │
┌──────────────────────────────────────────────────────────────────┘
│  TensorRT-LLM Engine Runtime
│  ┌───────────────────────────────────────────────────────┐
│  │  gemma3_vlm.plan (FP16 optimized)                      │
│  │  - Max batch size: 8                                   │
│  │  - Max input len: 2048                                 │
│  │  - Max output len: 512                                 │
│  │  - KV cache: PagedAttention                            │
│  │  - CUDA graphs: Enabled                                │
│  └───────────────────────────────────────────────────────┘
│
└─── RTX 3060 Ti (8GB VRAM, Compute 8.6)
     ├── TensorRT Engine: ~150 MB
     ├── KV Cache: ~500 MB (dynamic)
     ├── IBM Docling: ~6.5 GB (90% allocation)
     └── Headroom: ~850 MB
```

---

## 🔧 Implementation Steps

### **Phase 1: TensorRT-LLM Installation** (Est. 30 min)

```powershell
# Activate Python environment
& C:\Users\james\Videos\deeds-web-app\.venv\Scripts\Activate.ps1

# Install TensorRT-LLM (CUDA 12.6 compatible)
pip install tensorrt-llm==0.15.0
pip install nvidia-tensorrt

# Verify installation
python -c "import tensorrt_llm; print(tensorrt_llm.__version__)"
```

**Dependencies:**
- CUDA Toolkit 12.6+ ✅ (already installed)
- cuDNN 9.x ✅ (installed)
- NCCL 2.x (single GPU, not critical)
- TensorRT 10.x (bundled with tensorrt-llm)

---

### **Phase 2: Convert Gemma-3 to TensorRT Engine** (Est. 1-2 hours)

```bash
# Download Gemma-3 270M weights from Hugging Face
python -c "
from transformers import AutoModelForCausalLM, AutoTokenizer
model = AutoModelForCausalLM.from_pretrained('google/gemma-3-270m')
tokenizer = AutoTokenizer.from_pretrained('google/gemma-3-270m')
model.save_pretrained('./models/gemma3-270m-hf')
tokenizer.save_pretrained('./models/gemma3-270m-hf')
"

# Build TensorRT-LLM checkpoint
python TensorRT-LLM/examples/gemma/convert_checkpoint.py \
    --model_dir ./models/gemma3-270m-hf \
    --output_dir ./trt_engines/gemma3-270m-ckpt \
    --dtype float16

# Build optimized engine (.plan file)
trtllm-build \
    --checkpoint_dir ./trt_engines/gemma3-270m-ckpt \
    --output_dir ./trt_engines/gemma3-270m-engine \
    --gemm_plugin float16 \
    --max_batch_size 8 \
    --max_input_len 2048 \
    --max_output_len 512 \
    --use_paged_context_fmha enable \
    --use_cuda_graph \
    --strongly_typed
```

**Build Options Explained:**
- `--gemm_plugin float16` - FP16 matrix multiplications (2x memory savings)
- `--max_batch_size 8` - Process up to 8 requests concurrently
- `--use_paged_context_fmha` - PagedAttention for KV cache (vLLM-style)
- `--use_cuda_graph` - Pre-compile execution graphs (eliminates kernel launch overhead)
- `--strongly_typed` - Type safety for CUDA kernels

**Expected Output:**
```
trt_engines/
└── gemma3-270m-engine/
    ├── config.json
    ├── gemma3_float16_tp1_rank0.engine  # Main .plan file (~150 MB)
    └── model.cache
```

---

### **Phase 3: Setup Triton Inference Server** (Est. 45 min)

#### **Option A: Docker (Recommended for isolation)**

```powershell
# Pull Triton with Python backend
docker pull nvcr.io/nvidia/tritonserver:24.12-py3

# Create model repository structure
New-Item -ItemType Directory -Force -Path backend/triton_models/gemma3_vlm/1

# Copy TensorRT engine
Copy-Item ./trt_engines/gemma3-270m-engine/* backend/triton_models/gemma3_vlm/1/

# Create Triton config
@"
name: "gemma3_vlm"
backend: "python"
max_batch_size: 8

input [
  {
    name: "input_ids"
    data_type: TYPE_INT32
    dims: [-1]
  },
  {
    name: "input_lengths"
    data_type: TYPE_INT32
    dims: [1]
  }
]

output [
  {
    name: "output_ids"
    data_type: TYPE_INT32
    dims: [-1]
  }
]

instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [0]
  }
]

dynamic_batching {
  preferred_batch_size: [1, 2, 4, 8]
  max_queue_delay_microseconds: 5000
}
"@ | Out-File -Encoding utf8 backend/triton_models/gemma3_vlm/config.pbtxt

# Start Triton server
docker run --gpus all --rm -p 8000:8000 -p 8001:8001 -p 8002:8002 `
    -v ${PWD}/backend/triton_models:/models `
    nvcr.io/nvidia/tritonserver:24.12-py3 `
    tritonserver --model-repository=/models
```

#### **Option B: Native Installation** (if Docker conflicts with existing services)

```powershell
# Install Triton Python bindings
pip install tritonclient[all]

# Use Triton in standalone mode (see Python backend below)
```

---

### **Phase 4: Create Python Triton Backend** (Est. 1 hour)

**File:** `backend/triton_models/gemma3_vlm/1/model.py`

```python
import json
import numpy as np
import triton_python_backend_utils as pb_utils
import tensorrt_llm
from tensorrt_llm.runtime import ModelRunner

class TritonPythonModel:
    """TensorRT-LLM model for Triton Inference Server"""

    def initialize(self, args):
        """Load TensorRT-LLM engine on GPU"""
        self.model_config = json.loads(args['model_config'])

        # Load TensorRT engine
        engine_dir = "/models/gemma3_vlm/1"
        self.runner = ModelRunner.from_dir(
            engine_dir=engine_dir,
            rank=0,  # Single GPU
            debug_mode=False
        )

        self.tokenizer = self._load_tokenizer()
        self.logger = pb_utils.Logger
        self.logger.log_info("✅ TensorRT-LLM engine loaded successfully")

    def execute(self, requests):
        """Process batch of inference requests"""
        responses = []

        for request in requests:
            # Extract input tensors
            input_ids = pb_utils.get_input_tensor_by_name(request, "input_ids")
            input_ids_np = input_ids.as_numpy()

            # Run TensorRT-LLM inference
            outputs = self.runner.generate(
                input_ids=input_ids_np,
                max_new_tokens=512,
                temperature=0.7,
                top_k=50,
                top_p=0.95,
                end_id=self.tokenizer.eos_token_id,
                pad_id=self.tokenizer.pad_token_id
            )

            # Create output tensor
            output_tensor = pb_utils.Tensor("output_ids", outputs.numpy())
            inference_response = pb_utils.InferenceResponse(
                output_tensors=[output_tensor]
            )
            responses.append(inference_response)

        return responses

    def finalize(self):
        """Cleanup resources"""
        del self.runner
        self.logger.log_info("🛑 TensorRT-LLM engine unloaded")
```

---

### **Phase 5: Create Python Client Service** (Est. 45 min)

**File:** `backend/services/triton_gemma3_client.py`

```python
#!/usr/bin/env python3
"""
Triton Inference Server Client for Gemma-3 VLM
Provides async API for TensorRT-LLM engine access
"""

import asyncio
import numpy as np
from typing import Optional, List, Dict, Any
import tritonclient.http as httpclient
from transformers import AutoTokenizer
import logging

logger = logging.getLogger(__name__)

class TritonGemma3Client:
    """Async client for TensorRT-LLM via Triton"""

    def __init__(
        self,
        triton_url: str = "localhost:8000",
        model_name: str = "gemma3_vlm",
        timeout: int = 60
    ):
        self.triton_url = triton_url
        self.model_name = model_name
        self.timeout = timeout

        # Initialize Triton client
        self.client = httpclient.InferenceServerClient(
            url=triton_url,
            verbose=False
        )

        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained("google/gemma-3-270m")

        logger.info(f"✅ Triton client connected to {triton_url}")

    async def generate(
        self,
        prompt: str,
        max_tokens: int = 512,
        temperature: float = 0.7,
        stream: bool = False
    ) -> str:
        """Generate text completion"""

        # Tokenize input
        input_ids = self.tokenizer.encode(prompt, return_tensors="np")
        input_lengths = np.array([[len(input_ids[0])]], dtype=np.int32)

        # Prepare Triton inputs
        inputs = [
            httpclient.InferInput("input_ids", input_ids.shape, "INT32"),
            httpclient.InferInput("input_lengths", input_lengths.shape, "INT32")
        ]
        inputs[0].set_data_from_numpy(input_ids.astype(np.int32))
        inputs[1].set_data_from_numpy(input_lengths)

        # Prepare outputs
        outputs = [
            httpclient.InferRequestedOutput("output_ids")
        ]

        # Run inference
        response = self.client.infer(
            model_name=self.model_name,
            inputs=inputs,
            outputs=outputs,
            timeout=self.timeout
        )

        # Decode output
        output_ids = response.as_numpy("output_ids")
        generated_text = self.tokenizer.decode(output_ids[0], skip_special_tokens=True)

        return generated_text

    async def health_check(self) -> Dict[str, Any]:
        """Check Triton server and model health"""
        try:
            server_live = self.client.is_server_live()
            server_ready = self.client.is_server_ready()
            model_ready = self.client.is_model_ready(self.model_name)

            return {
                "status": "healthy" if all([server_live, server_ready, model_ready]) else "degraded",
                "server_live": server_live,
                "server_ready": server_ready,
                "model_ready": model_ready,
                "triton_url": self.triton_url,
                "model_name": self.model_name
            }
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {"status": "unhealthy", "error": str(e)}

    async def get_model_stats(self) -> Dict[str, Any]:
        """Get model inference statistics"""
        try:
            stats = self.client.get_inference_statistics(model_name=self.model_name)
            return stats
        except Exception as e:
            logger.error(f"Failed to get stats: {e}")
            return {"error": str(e)}


# Convenience function for FastMCP integration
async def triton_generate(prompt: str, **kwargs) -> str:
    """
    Generate text using TensorRT-LLM via Triton

    Args:
        prompt: Input text
        max_tokens: Maximum tokens to generate
        temperature: Sampling temperature (0.0-1.0)

    Returns:
        Generated text
    """
    client = TritonGemma3Client()
    return await client.generate(prompt, **kwargs)
```

---

### **Phase 6: Integrate with FastMCP Middleware** (Est. 30 min)

**File:** `backend/services/fastmcp_agentic_middleware.py` (update)

```python
# Add to imports
from .triton_gemma3_client import TritonGemma3Client

# Add to __init__
self.triton_client = TritonGemma3Client(
    triton_url=os.getenv("TRITON_URL", "localhost:8000")
)

# Add new tool
@self.mcp.tool()
async def triton_vlm_generate(prompt: str, max_tokens: int = 512) -> dict:
    """
    Generate text using TensorRT-LLM optimized Gemma-3 VLM via Triton

    Args:
        prompt: Input text prompt
        max_tokens: Maximum tokens to generate (default 512)

    Returns:
        dict with 'text', 'latency_ms', 'tokens_per_sec'
    """
    import time
    start = time.time()

    # Use TensorRT-LLM via Triton
    generated_text = await self.triton_client.generate(
        prompt=prompt,
        max_tokens=max_tokens,
        temperature=0.7
    )

    elapsed_ms = (time.time() - start) * 1000
    tokens = len(generated_text.split())
    tokens_per_sec = tokens / (elapsed_ms / 1000) if elapsed_ms > 0 else 0

    return {
        "text": generated_text,
        "latency_ms": round(elapsed_ms, 2),
        "tokens_per_sec": round(tokens_per_sec, 2),
        "backend": "tensorrt-llm",
        "model": "gemma3:270m"
    }
```

**Update `.env`:**
```bash
# Triton Inference Server
TRITON_URL=localhost:8000
TRITON_MODEL_NAME=gemma3_vlm
```

---

### **Phase 7: Testing & Benchmarking** (Est. 1 hour)

**File:** `backend/scripts/test_triton_gemma3.py`

```python
#!/usr/bin/env python3
"""Test TensorRT-LLM + Triton integration"""

import asyncio
import time
from services.triton_gemma3_client import TritonGemma3Client

async def main():
    print("=" * 70)
    print("🚀 TensorRT-LLM + Triton - Gemma-3 VLM Test")
    print("=" * 70)

    client = TritonGemma3Client()

    # 1. Health check
    print("\n1️⃣  Health Check")
    health = await client.health_check()
    print(f"   Status: {health['status']}")
    print(f"   Server: {health['server_live']}")
    print(f"   Model: {health['model_ready']}")

    # 2. Single inference
    print("\n2️⃣  Single Inference Test")
    prompt = "What is a deed in property law?"
    start = time.time()
    response = await client.generate(prompt, max_tokens=100)
    elapsed = (time.time() - start) * 1000

    print(f"   Prompt: {prompt}")
    print(f"   Response: {response[:100]}...")
    print(f"   Latency: {elapsed:.2f}ms")
    print(f"   Tokens/sec: {len(response.split()) / (elapsed/1000):.2f}")

    # 3. Batch test
    print("\n3️⃣  Batch Processing Test (5 requests)")
    prompts = [
        "Define a deed",
        "What is property law?",
        "Explain a mortgage",
        "What is a title search?",
        "Define easement"
    ]

    start = time.time()
    tasks = [client.generate(p, max_tokens=50) for p in prompts]
    results = await asyncio.gather(*tasks)
    total_elapsed = (time.time() - start) * 1000

    print(f"   Total time: {total_elapsed:.2f}ms")
    print(f"   Avg per request: {total_elapsed/len(prompts):.2f}ms")

    # 4. Statistics
    print("\n4️⃣  Model Statistics")
    stats = await client.get_model_stats()
    print(f"   {stats}")

    print("\n" + "=" * 70)
    print("✅ All tests complete!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(main())
```

**Run tests:**
```powershell
python backend/scripts/test_triton_gemma3.py
```

**Expected Performance:**
```
🚀 TensorRT-LLM + Triton - Gemma-3 VLM Test
======================================================================

1️⃣  Health Check
   Status: healthy
   Server: True
   Model: True

2️⃣  Single Inference Test
   Prompt: What is a deed in property law?
   Response: A deed is a legal document that transfers ownership...
   Latency: 87.45ms  ⚡ (vs 500-800ms with Ollama)
   Tokens/sec: 52.3  🚀 (vs 15-20 with Ollama)

3️⃣  Batch Processing Test (5 requests)
   Total time: 215.33ms
   Avg per request: 43.07ms  🔥 (batching efficiency!)

✅ All tests complete!
```

---

## 📊 Performance Comparison

| Metric | Ollama (gemma3:270m) | TensorRT-LLM + Triton | Improvement |
|--------|----------------------|------------------------|-------------|
| **First Token Latency** | 500-800ms | 50-100ms | **5-8x faster** |
| **Throughput** | 15-20 tokens/sec | 50-70 tokens/sec | **3-4x faster** |
| **Batch Processing** | Sequential | Concurrent | **Dynamic batching** |
| **Memory Usage** | 291 MB + overhead | ~150 MB (FP16) | **2x smaller** |
| **CUDA Optimization** | Generic | PTX for Compute 8.6 | **Native** |
| **Production Features** | Basic | Metrics, queueing, HA | **Enterprise-grade** |

---

## 🎯 GPU Memory Allocation Strategy

**Total VRAM:** 8 GB (RTX 3060 Ti)

**Current Allocation:**
- **IBM Docling (Granite 258M):** ~6.5 GB (90% allocation) - Document parsing
- **Available for TensorRT:** ~1.5 GB

**TensorRT-LLM Requirements:**
- **Engine weights:** ~150 MB (FP16 gemma3:270m)
- **KV Cache:** 200-500 MB (dynamic, depends on batch size)
- **Workspace:** 100-200 MB (CUDA graphs, intermediate buffers)
- **Total:** ~450-850 MB

**Strategy:**
1. **Sequential execution:** Process documents with Docling first, then unload model temporarily for TensorRT inference
2. **Separate processes:** Run Docling in one Python process, TensorRT in another (OS handles CUDA context switching)
3. **Dynamic allocation:** Use `torch.cuda.empty_cache()` before TensorRT calls
4. **Batch size tuning:** Reduce max_batch_size from 8 to 4 if OOM occurs

**Recommended Configuration:**
```python
# Reduce Docling allocation when TensorRT is active
import torch
torch.cuda.set_per_process_memory_fraction(0.75)  # 75% for Docling (6 GB)
# Leaves 2 GB for TensorRT
```

---

## 🔒 Backward Compatibility

**Fallback Strategy:**
```python
# In FastMCP middleware
async def generate_text(prompt: str, use_triton: bool = True):
    if use_triton:
        try:
            return await triton_client.generate(prompt)
        except Exception as e:
            logger.warning(f"Triton failed, falling back to Ollama: {e}")
            return await ollama_generate(prompt)  # Existing Ollama path
    else:
        return await ollama_generate(prompt)
```

**Environment Variable:**
```bash
# .env
USE_TRITON_INFERENCE=true  # Set to false to disable TensorRT-LLM
```

---

## 📚 References

- **TensorRT-LLM Docs:** https://github.com/NVIDIA/TensorRT-LLM
- **Triton Inference Server:** https://github.com/triton-inference-server/server
- **Gemma Model Card:** https://huggingface.co/google/gemma-3-270m
- **PTX ISA Guide:** https://docs.nvidia.com/cuda/parallel-thread-execution/

---

## ⚠️ Known Issues & Troubleshooting

### Issue 1: GPU Out of Memory
**Symptom:** `CUDA error: out of memory` during inference

**Solution:**
```python
# Reduce batch size in config.pbtxt
max_batch_size: 4  # Was 8

# Or reduce KV cache in trtllm-build
--max_batch_size 4 \
--max_beam_width 1
```

### Issue 2: Triton Model Load Failure
**Symptom:** `Model gemma3_vlm failed to load`

**Solution:**
```bash
# Check Triton logs
docker logs <triton_container_id>

# Verify engine compatibility
python -c "import tensorrt; print(tensorrt.__version__)"

# Rebuild engine with correct TensorRT version
```

### Issue 3: Slow First Inference
**Symptom:** First request takes 5-10 seconds, subsequent fast

**Solution:**
```python
# Enable CUDA graph warmup in model.py
def initialize(self, args):
    # ... load model ...

    # Warmup CUDA graphs
    dummy_input = np.ones((1, 10), dtype=np.int32)
    self.runner.generate(dummy_input, max_new_tokens=1)
    self.logger.log_info("✅ CUDA graphs warmed up")
```

---

## 🚀 Next Steps

1. **✅ Review this recommendation document**
2. **Install TensorRT-LLM** (`pip install tensorrt-llm`)
3. **Download Gemma-3 weights** (Hugging Face)
4. **Build TensorRT engine** (`trtllm-build`)
5. **Setup Triton server** (Docker or native)
6. **Create Python backend** (`model.py`)
7. **Integrate with FastMCP** (add `triton_vlm_generate` tool)
8. **Run benchmarks** (compare vs Ollama)
9. **Update documentation** (add usage examples)
10. **Deploy to production** (monitor metrics)

---

## 📞 Support & Maintenance

**Performance Monitoring:**
```python
# Add to FastMCP middleware
import prometheus_client

triton_latency = prometheus_client.Histogram(
    'triton_inference_latency_seconds',
    'TensorRT-LLM inference latency'
)

@triton_latency.time()
async def triton_vlm_generate(...):
    # ... existing code ...
```

**Log Rotation:**
```bash
# Triton logs can grow large - rotate daily
docker run ... -v /var/log/triton:/logs \
    --log-opt max-size=100m --log-opt max-file=3
```

---

**Status:** Ready for implementation 🚀
**Estimated Total Time:** 4-6 hours (includes testing)
**Expected Speedup:** 3-5x over Ollama
**Risk Level:** Low (fallback to Ollama available)
