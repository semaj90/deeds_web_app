# Bifrost Deployment Options — Inference Backend Compatibility

## Current Issue: Docker → Windows Native Ollama

**Problem**: Bifrost (Docker) → Ollama (Windows native) = unreliable networking
- `host.docker.internal` works but has latency/timeout issues
- Model listing fails with "gateway timeout"
- Semantic cache has proof-of-concept success (7 cached points) but unstable

---

## Solution: Docker → Docker Networking

**Key Insight**: Bifrost works best with **Docker-based inference backends** because both containers are on the same Docker network.

```
Container-to-Container (FAST ✅)
┌──────────────┐     Docker Network      ┌──────────────┐
│   Bifrost    │────────────────────────→│   TRT-LLM    │
│   :3040      │  http://trt-llm:8099    │   :8099      │
└──────────────┘                          └──────────────┘

Container-to-Host (SLOW ⚠️)
┌──────────────┐     host.docker.internal  ┌──────────────┐
│   Bifrost    │──────────────────────────→│   Ollama     │
│   :3040      │  :11434 (Windows native)  │  (Windows)   │
└──────────────┘                            └──────────────┘
```

---

## Deployment Option 1: TensorRT-LLM (TRT-LLM) ✅ RECOMMENDED

### Architecture
```yaml
services:
  bifrost:
    image: maximhq/bifrost:latest
    networks: [legal-ai-network]
    environment:
      - TRITON_URL=http://triton-tensorrt:8099

  triton-tensorrt:
    image: nvcr.io/nvidia/tritonserver:24.01-py3
    networks: [legal-ai-network]
    ports: [8099:8000]
    volumes:
      - ./trt-models:/models
```

### Bifrost Config
```json
{
  "providers": {
    "tensorrt": {
      "keys": [{
        "name": "trt-key",
        "value": "dummy",
        "base_url": "http://triton-tensorrt:8099"
      }],
      "custom_provider_config": {
        "base_provider_type": "openai",
        "allowed_requests": {
          "chat_completion": true,
          "chat_completion_stream": true
        }
      }
    }
  }
}
```

### Performance Expectations
- **Latency**: 2-5s (INT4 quantization)
- **Throughput**: 50-100 QPM (depends on GPU)
- **Model Size**: gemma4:7.5B → ~4.8GB INT4 engine
- **Cache Hit**: L1 (3ms) + L2 Bifrost semantic (2-5s) + L3 TRT (2-5s)

### Advantages
- ✅ Docker-to-Docker networking (fast, reliable)
- ✅ GPU acceleration (2-3× faster than Ollama)
- ✅ INT4 quantization (4GB VRAM for 7.5B model)
- ✅ Triton batching (higher throughput)

### Disadvantages
- ❌ Complex setup (TensorRT engine conversion)
- ❌ Requires NVIDIA GPU with Ampere+ (RTX 3060 Ti ✅)
- ❌ Model updates require re-conversion

---

## Deployment Option 2: LiteRT (Gemma 4 Client-Side) 🔄 HYBRID

### Architecture
LiteRT is a **client-side** runtime (browser WebGPU), not a Docker service. Use it as **L0 cache** before server cache.

```
User Query
    ↓
┌─────────────────┐
│  L0: LiteRT     │  → 500ms-2s (WebGPU in browser)
│  Gemma 4 E2B    │     2.3B Q4F16 model
│  Client-Side    │     For simple queries only
└─────────────────┘
    ↓ (escalate complex queries)
┌─────────────────┐
│  L1: Redis      │  → 3ms (SvelteKit server)
│  Exact-Match    │
└─────────────────┘
    ↓
┌─────────────────┐
│  L2: Bifrost    │  → 2-5s (Bifrost semantic cache)
│  Semantic       │     Connected to TRT-LLM (Docker)
└─────────────────┘
    ↓
┌─────────────────┐
│  L3: TRT-LLM    │  → 2-5s (cold inference)
│  GPU Inference  │
└─────────────────┘
```

### Config
LiteRT doesn't connect to Bifrost directly. It's a **fallback tier** managed by `client-router.ts`.

**File**: `src/lib/ai/client-router.ts`
```typescript
// L0: Try LiteRT (client-side) for simple queries
if (isSimpleQuery(query)) {
  const liteRTResponse = await tryLiteRT(query);
  if (liteRTResponse) return liteRTResponse;
}

// L1-L3: Server cache (Redis → Bifrost → TRT-LLM)
return await fetch('/api/ai/chat', { ... });
```

### Advantages
- ✅ 500ms-2s client-side inference (no server round-trip)
- ✅ Reduces server load by 30-50% (handles simple queries)
- ✅ Works offline (model cached in IndexedDB)

### Disadvantages
- ❌ Limited to 2.3B model (quality vs server 7.5B)
- ❌ Requires WebGPU (not available in all browsers)
- ❌ 400MB download on first load

---

## Deployment Option 3: vLLM (OpenAI-Compatible) ✅ ALTERNATIVE

### Architecture
vLLM is a **high-throughput inference server** with PagedAttention for efficient batching.

```yaml
services:
  bifrost:
    image: maximhq/bifrost:latest
    networks: [legal-ai-network]

  vllm:
    image: vllm/vllm-openai:latest
    networks: [legal-ai-network]
    ports: [8000:8000]
    command: >
      --model /models/gemma4-legal
      --tensor-parallel-size 1
      --dtype float16
      --max-model-len 8192
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

### Bifrost Config
```json
{
  "providers": {
    "vllm-local": {
      "keys": [{
        "name": "vllm-key",
        "value": "dummy",
        "base_url": "http://vllm:8000"
      }],
      "custom_provider_config": {
        "base_provider_type": "openai",
        "allowed_requests": {
          "chat_completion": true,
          "chat_completion_stream": true
        }
      }
    }
  }
}
```

### Performance Expectations
- **Latency**: 2-4s (FP16, continuous batching)
- **Throughput**: 100-200 QPM (PagedAttention batching)
- **Model Size**: 15GB FP16 (gemma4:7.5B)
- **VRAM Usage**: ~10GB (with KV cache)

### Advantages
- ✅ Docker-to-Docker networking (reliable)
- ✅ OpenAI-compatible API (drop-in replacement)
- ✅ High throughput (PagedAttention)
- ✅ Easy setup (Docker image available)

### Disadvantages
- ❌ Higher VRAM usage than TRT (10GB vs 4GB)
- ❌ Slower than TRT INT4 (2-4s vs 2-3s)

---

## Deployment Option 4: LiteLLM Proxy ✅ SEMANTIC CACHE ALTERNATIVE

### Architecture
LiteLLM is an **alternative to Bifrost** with built-in Redis semantic cache.

```yaml
services:
  litellm:
    image: ghcr.io/berriai/litellm:latest
    ports: [4000:4000]
    networks: [legal-ai-network]
    environment:
      - REDIS_HOST=deeds-redis-prod
      - REDIS_PORT=6379
      - LITELLM_CACHE_TYPE=redis-semantic
      - LITELLM_CACHE_TTL=3600
    volumes:
      - ./litellm-config.yaml:/app/config.yaml
```

### LiteLLM Config
```yaml
model_list:
  - model_name: gemma4-legal
    litellm_params:
      model: openai/gemma4-legal
      api_base: http://triton-tensorrt:8099/v1
      api_key: dummy

litellm_settings:
  cache: true
  cache_params:
    type: redis-semantic
    host: deeds-redis-prod
    port: 6379
    ttl: 3600
    similarity_threshold: 0.8
```

### Performance Expectations
- **L1 Redis**: 5ms (exact-match)
- **L2 Redis Semantic**: 50-100ms (RediSearch vector similarity)
- **L3 TRT**: 2-5s (cold inference)
- **Speedup**: 50-500× (vs cold)

### Advantages
- ✅ Mature project (25k+ GitHub stars)
- ✅ Redis Stack integration (faster than Qdrant for semantic cache)
- ✅ Built-in cost tracking and rate limiting
- ✅ Multi-provider support (OpenAI, Anthropic, etc.)

### Disadvantages
- ❌ Requires Redis Stack (not vanilla Redis)
- ❌ Less flexible than Bifrost for custom plugins
- ❌ Semantic cache requires RediSearch module

---

## Comparison Matrix

| Backend | Networking | Latency | Throughput | Setup | Cache | VRAM |
|---------|-----------|---------|------------|-------|-------|------|
| **Ollama (Windows)** | Container→Host ⚠️ | 25s | 2-3 QPM | ✅ Easy | ❌ Timeout | 8GB |
| **TRT-LLM** | Container→Container ✅ | 2-5s | 50-100 QPM | ❌ Complex | ✅ Works | 4GB |
| **vLLM** | Container→Container ✅ | 2-4s | 100-200 QPM | ✅ Easy | ✅ Works | 10GB |
| **LiteRT (Client)** | Browser WebGPU ✅ | 0.5-2s | N/A | ✅ Easy | ✅ IndexedDB | 0GB (client) |
| **LiteLLM Proxy** | Container→Container ✅ | 50ms-5s | 100-200 QPM | ✅ Easy | ✅ Redis Stack | Same as backend |

---

## Recommended Deployment Path

### Phase 1: Current (2-Tier) ✅ PRODUCTION
```
Redis L1 (3ms) → Direct Ollama (3.2s)
```
- No changes needed
- Already stable
- Good for 70-90% cache hit rate

### Phase 2: Add TRT-LLM (3-Tier) 🔄 NEXT
```
Redis L1 (3ms) → Bifrost L2 (2-5s) → TRT-LLM L3 (2-5s)
```
- Convert gemma4-legal to TensorRT INT4
- Update Bifrost config to point to TRT-LLM Docker container
- Expect Bifrost semantic cache to work reliably (Docker networking)

### Phase 3: Add LiteRT L0 (4-Tier) 🔮 FUTURE
```
LiteRT L0 (0.5-2s) → Redis L1 (3ms) → Bifrost L2 (2-5s) → TRT-LLM L3 (2-5s)
```
- Deploy Gemma 4 E2B to browser (WebGPU)
- Handle 30-50% of queries client-side
- Reduce server load

---

## Action Items

### Priority 1: TRT-LLM Integration
1. ✅ Verify TensorRT conversion notebook works
2. [ ] Convert gemma4-legal to INT4 TensorRT engine
3. [ ] Start Triton server with TRT engine
4. [ ] Update Bifrost config to use `http://triton-tensorrt:8099`
5. [ ] Test Bifrost semantic cache with TRT backend
6. [ ] Run load tests (expect cache to work reliably)

### Priority 2: Performance Tuning
1. [ ] Benchmark TRT-LLM latency (target: 2-3s)
2. [ ] Measure Bifrost L2 hit rate (target: 70-80%)
3. [ ] Optimize Redis L1 TTL (1hr → 6hrs for stable queries)
4. [ ] Pre-warm Bifrost cache with 100 common legal queries

### Priority 3: Optional Enhancements
1. [ ] Try LiteLLM as Bifrost alternative
2. [ ] Deploy LiteRT client-side L0 cache
3. [ ] Add vLLM as TRT-LLM alternative (easier setup)

---

## Conclusion

**Bifrost WILL work with Docker-based backends** like TRT-LLM and vLLM because it eliminates the container-to-host networking issue.

**Recommended Path**:
1. Keep current 2-tier (Redis + Ollama) for stability
2. Add TRT-LLM when ready for 2-3× speedup
3. Re-enable Bifrost L2 semantic cache (should work reliably with TRT)

**Expected Final Architecture**:
```
LiteRT L0 (browser, 500ms)
  → Redis L1 (server, 3ms)
    → Bifrost L2 (Qdrant semantic, 2-5s)
      → TRT-LLM L3 (GPU, 2-3s)
```

**Combined Performance**:
- 30-50% queries handled by LiteRT (no server)
- 70-90% server queries hit Redis L1 (3ms)
- 10-20% queries hit Bifrost L2 (2-5s)
- 1-5% queries hit TRT-LLM L3 (2-3s)
- **Average latency**: 50-200ms (weighted)
- **Throughput**: 10,000-20,000 QPM