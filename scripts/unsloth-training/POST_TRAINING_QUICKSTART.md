# Post-Training Quick Start Guide
**After Colab A100 training completes - Total time: 4-6 hours**

---

## ✅ Prerequisites

- [ ] Downloaded `gemma3-12b-legal-merged-16bit.zip` (~24 GB) from Colab
- [ ] Extracted to `c:/workspace/gemma3-12b-legal/gemma3-12b-legal-merged-16bit/`
- [ ] Docker running with `legal-ai-tensorrt-llm` container
- [ ] WSL2 Ubuntu or Windows native with TensorRT 10.x + CUDA 12/13

---

## 🚀 Step-by-Step Integration (4-6 hours)

### STEP 1: Convert to Q4_K_M Checkpoint (30 min)

```bash
# Update conversion script paths
cd c:/Users/james/Videos/deeds-web-app/scripts
sed -i 's|/workspace/models/gemma3-safetensors|/workspace/gemma3-12b-legal/gemma3-12b-legal-merged-16bit|g' convert-gemma3-legal-to-trtllm.py

# Run conversion
docker exec legal-ai-tensorrt-llm python3 /workspace/scripts/convert-gemma3-legal-to-trtllm.py

# Expected output: /workspace/gemma3-12b-legal/trt_checkpoints/gemma3-12b-legal-q4km/
```

**Checkpoint size**: ~6 GB (down from 24 GB FP16)

---

### STEP 2: Build TensorRT Engine with INT4 AWQ (1-2 hours)

```bash
# Update build script paths
cd c:/Users/james/Videos/deeds-web-app/scripts
nano docker_build_tensorrt_engine_int4.sh

# Edit these 3 lines:
MODEL_DIR="/workspace/gemma3-12b-legal/gemma3-12b-legal-merged-16bit"
OUTPUT_DIR="/workspace/gemma3-12b-legal/trt_checkpoints/gemma3-12b-legal-q4km"
ENGINE_DIR="/workspace/gemma3-12b-legal/trt_engines/gemma3-12b-legal-q4km"

# Run INT4 AWQ build
bash docker_build_tensorrt_engine_int4.sh
```

**What this does**:
- ✅ Step 1: Verify custom shapes (3840 hidden, 30 Q heads, 17 KV heads)
- ✅ Step 2: Convert checkpoint with INT4 AWQ quantization
- ✅ Step 3: Calibrate using 512 legal examples (from COLAB_PACKAGE training data)
- ✅ Step 4: Build engine with FlashAttention + Paged KV Cache

**Engine output**: `rank0.engine` (~6 GB)

---

### STEP 3: Build Go Microservice (30 min)

```bash
# Navigate to TensorRT inference directory
cd c:/Users/james/Videos/deeds-web-app/deeds_labs/cuda-binaries/tensorrt-infer

# Build C++ TensorRT wrapper
cmake -B build -S . -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release

# Copy DLL to Go directory
cp build/cpp/Release/trt_wrapper.dll go/

# Build Go HTTP server
cd go
go build -o trt-server.exe server.go

# Verify build
ls -lh trt-server.exe
# Expected: ~8-10 MB executable
```

**New features added**:
- ✅ Pinned memory allocator (`buffers.go`)
- ✅ CUDA Graph support (`trt_wrapper.cpp`)
- ✅ HTTP API server (`server.go`) - ports 8099
- ✅ OpenAI-compatible `/v1/completions` endpoint
- ✅ `/v1/embeddings` endpoint (3840-dim)
- ✅ `/health` endpoint

---

### STEP 4: Start TensorRT Service (2 min)

```bash
# Start Go microservice
cd c:/Users/james/Videos/deeds-web-app/deeds_labs/cuda-binaries/tensorrt-infer/go

./trt-server.exe \
  --engine /workspace/gemma3-12b-legal/trt_engines/gemma3-12b-legal-q4km/rank0.engine \
  --port 8099

# Expected output:
# Loading TensorRT engine from /workspace/gemma3-12b-legal/...
# ✅ Engine loaded successfully
# 🚀 TensorRT-LLM server starting on http://localhost:8099
#    Health: http://localhost:8099/health
#    Completions: POST http://localhost:8099/v1/completions
#    Embeddings: POST http://localhost:8099/v1/embeddings
```

---

### STEP 5: Test Endpoints (5 min)

#### Test Health Check
```bash
curl http://localhost:8099/health

# Expected:
# {"status":"healthy","model":"gemma3-12b-legal-q4km"}
```

#### Test Completions API
```bash
curl -X POST http://localhost:8099/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain the doctrine of stare decisis:",
    "max_tokens": 200,
    "temperature": 0.7
  }'

# Expected:
# {
#   "choices": [{
#     "text": "Stare decisis is a legal doctrine...",
#     "index": 0,
#     "finish_reason": "stop"
#   }],
#   "usage": {
#     "prompt_tokens": 8,
#     "completion_tokens": 42,
#     "total_tokens": 50
#   }
# }
```

#### Test Embeddings API
```bash
curl -X POST http://localhost:8099/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Contract law principles",
    "model": "gemma3-12b-legal-q4km"
  }'

# Expected:
# {
#   "data": [{
#     "embedding": [0.123, -0.456, 0.789, ...],  // 3840 dimensions
#     "index": 0
#   }],
#   "usage": {
#     "prompt_tokens": 5,
#     "total_tokens": 5
#   }
# }
```

---

### STEP 6: Test from SvelteKit (5 min)

The frontend is already wired! Just verify it works:

```bash
# Start SvelteKit dev server
cd c:/Users/james/Videos/deeds-web-app/sveltekit-frontend
npm run dev
```

**Test in any `+server.ts` file**:
```typescript
import { inferLLM } from '$lib/server/trt-llm.js';

export async function POST({ request }) {
  const { question } = await request.json();

  const result = await inferLLM({
    prompt: `Legal AI Assistant: ${question}`,
    maxTokens: 500,
    temperature: 0.7
  });

  return new Response(JSON.stringify({
    answer: result.text,
    usage: result.usage
  }));
}
```

**Or test streaming**:
```typescript
import { streamLLM } from '$lib/server/trt-llm.js';

export async function GET({ url }) {
  const question = url.searchParams.get('q') ?? '';

  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of streamLLM({ prompt: question })) {
        controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
        if (chunk.done) break;
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

---

## 🎯 Verification Checklist

- [ ] Health endpoint returns `200 OK`
- [ ] Completions API returns legal text
- [ ] Embeddings API returns 3840-dim vectors
- [ ] SvelteKit can call TensorRT service
- [ ] Inference completes in <95ms (target)
- [ ] GPU VRAM usage ~6 GB
- [ ] No memory leaks after 100 requests

---

## 📊 Expected Performance (RTX 3060 Ti)

| Metric | Target | Actual |
|--------|--------|--------|
| Inference latency | <95ms | __ ms |
| Throughput | 500+ req/sec | __ req/sec |
| VRAM usage | ~6 GB | __ GB |
| GPU utilization | 60-80% | __% |
| First token latency | <50ms | __ ms |

---

## 🐛 Troubleshooting

### "Engine not loaded"
```bash
# Check engine file exists
ls -lh /workspace/gemma3-12b-legal/trt_engines/gemma3-12b-legal-q4km/rank0.engine

# Verify file is ~6 GB
# If missing, rebuild engine (Step 2)
```

### "CUDA out of memory"
```bash
# Check GPU memory
nvidia-smi

# If other processes using GPU:
# - Stop Ollama: docker stop ollama-gemma
# - Stop other TRT services
```

### "Connection refused on port 8099"
```bash
# Check if server is running
ps aux | grep trt-server

# Check port is not in use
netstat -an | grep 8099

# Restart server with verbose logging
./trt-server.exe --engine /path/to/engine --port 8099
```

### "Inference too slow (>200ms)"
```bash
# Warm up engine (first inference is always slower)
for i in {1..10}; do
  curl -X POST http://localhost:8099/v1/completions \
    -H "Content-Type: application/json" \
    -d '{"prompt":"test","max_tokens":10}'
done

# Then measure
time curl -X POST http://localhost:8099/v1/completions \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Explain tort law","max_tokens":100}'
```

---

## 🎉 Success Criteria

You're ready for production when:

✅ All endpoints return `200 OK`
✅ Inference latency <95ms (after warmup)
✅ SvelteKit frontend can stream responses
✅ No memory leaks after 1000 requests
✅ GPU VRAM stable at ~6 GB
✅ Legal responses are coherent and domain-specific

---

## 🚀 Next: Production Deployment

Once local testing passes, deploy to production:

1. **Docker Compose**: Multi-container orchestration
2. **QUIC Layer**: Add HTTP/3 for 5-15ms responses
3. **Moogle Integration**: 127:1 compression layer
4. **Load Balancing**: Scale to multiple GPUs
5. **Monitoring**: Add Prometheus + Grafana metrics

See `DEPLOYMENT_ROADMAP.md` for full production architecture.

---

**Total integration time**: 4-6 hours ✅
**Production-ready legal AI**: World's first cognitive-computational platform! 🎉