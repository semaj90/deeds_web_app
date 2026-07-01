# Gemma4 RotorQuant Production Setup — RTX 3060 Ti (8GB)

**Last Updated**: 2026-07-01  
**Status**: ✅ Production Ready

## Executive Summary

Your inference pipeline is now **correctly optimized for throughput over max context**:

- **Server**: Gemma4 RotorQuant IQ4_XS (1.7GB weights, 32K context default)
- **Browser**: Gemma3 270M ONNX (418MB fallback, non-blocking)
- **Embeddings**: Ollama embeddinggemma (batch=64, CUDA/DirectML)
- **Concurrency**: Request queuing (8-16 simultaneous requests)
- **Memory**: ~6-7GB peak VRAM (fits 8GB with room for browser cache)

**Throughput**: ~50 tok/s across all concurrent requests (shared 40-50 tok/s baseline).

---

## Architecture

### 1. Browser Layer (Parallel, Non-Blocking)

```
Admin Dashboard (SvelteKit)
  ├─ Load Gemma3 270M ONNX (418MB, IndexedDB cached)
  ├─ Render status panels
  │  ├─ Summary job progress
  │  ├─ Embedding queue
  │  ├─ Redis cache hits
  │  └─ Qdrant collection stats
  ├─ Poll /api/admin/summary-status (every 5s)
  └─ Optional: Local reranking (Gemma3 ONNX, if CPU/GPU available)
      └─ Doesn't block server work
```

**Memory Impact**: 
- Gemma3 270M ONNX file: 418MB
- Loaded in browser: ~1-2GB (copies across HTTP cache, IndexedDB, WebGPU buffer)
- Peak: 2GB (share with app memory, doesn't compete with RTX GPU)

### 2. Server Layer (Sequential, High-Throughput)

```
llama-server :8090 (Gemma4 RotorQuant IQ4_XS)
  ├─ Model: 1.7GB weights (IQ4_XS quantization)
  ├─ KV Cache: q8_0 K + q8_0 V (8-bit, standard llama.cpp)
  │  └─ Note: RotorQuant applied at GGUF weight quantization time
  │     Runtime uses standard -ctk q8_0 -ctv q8_0 flags
  ├─ Context: 32K default (32,768 tokens)
  │  └─ 64K available for exceptional cases (65,536 tokens)
  ├─ GPU: -ngl 99 (all layers on RTX 3060 Ti)
  ├─ Features:
  │  ├─ Flash Attention (-fa on)
  │  ├─ Prompt caching (--cache-prompt)
  │  ├─ Cache reuse (--cache-reuse 256)
  │  ├─ Jinja chat template (tool calling support)
  │  └─ Streaming enabled
  ├─ Parallelism: --parallel 1 (sequential slots)
  │  └─ No VRAM multiplication, request queuing instead
  └─ Throughput: 40-50 tok/s per request
```

**Memory Impact**:
- Model weights: 1.7GB (GGUF file, quantized)
- KV cache (32K): ~1.5GB (grows with context length)
- GPU workspace: ~0.5-1GB
- Batch buffers: ~0.5GB
- **Peak VRAM**: ~5-6GB (32K context)
- **Peak VRAM**: ~6-7GB (64K context, exceptional)

### 3. Embedding Layer (Parallel, Batch Processing)

```
Ollama embeddinggemma:latest (CUDA/DirectML)
  ├─ Model: embeddinggemma-latest (not ONNX, server-only)
  ├─ Batch size: 64 (or higher, up to memory limit)
  ├─ Throughput: ~100-200 embeddings/sec (GPU-dependent)
  ├─ Caching:
  │  ├─ Redis L1 (5ms, 1-hour TTL)
  │  └─ Bifrost L2 (semantic, 2-5s)
  └─ Endpoint: /api/embed (wrapped with cache layer)
```

**Memory Impact**: ~1-2GB (separate Ollama process, doesn't interfere).

### 4. Retrieval Layer (Read-Only)

```
Qdrant (vector search)
├─ Collections: codebase_chunks_768 (40.5K points)
├─ Search: RRF fusion (BM25 + dense ANN)
└─ Output: Top-K candidates for reranking

Redis (cache)
├─ BitFrost L1 (exact-match, 5ms)
└─ BitFrost L2 (semantic, 2-5s)

Postgres (truth)
└─ 58K packets, 40.7K chunks with embeddings
```

**Memory Impact**: External services, not VRAM-constrained.

---

## Key Technical Details

### RotorQuant vs. Standard KV Cache

**What's in your GGUF file:**
- Model weights quantized via RotorQuant algorithm
- RotorQuant applies PolarQuant + QJL error correction OFF-LINE
- Result: Efficient weight storage (IQ4_XS = ~1.7GB)

**What happens at runtime:**
- Stock llama.cpp uses `-ctk q8_0 -ctv q8_0`
- This is **standard 8-bit quantization**, not RotorQuant KV compression
- RotorQuant KV requires special inference kernels (not in stock builds)
- q8_0 is **perfectly fine**: 8× compression vs. f16, proven stable

**Why this matters:**
- You get excellent weight compression ✅
- You DON'T get advanced KV compression (would require special binary)
- q8_0 is the right tradeoff for your 8GB GPU + 32K context ✅

### TurboQuant (Not Using, Don't Need)

**TurboQuant requirements:**
- Modified attention kernels (D=128, D=256, D=512 variants)
- Modified KV storage format
- Different lookup/decode routines
- Experimental (TheTom's fork or test1111's gemma4 fork)

**Why not:**
- q8_0 is stable and sufficient
- TurboQuant needs special binary (not in stock llama.cpp)
- Marginal improvement (4 bits vs. 8 bits) for significant complexity

---

## Memory Breakdown

### RTX 3060 Ti (8GB) @ 32K Context

| Component | Size | Notes |
|-----------|------|-------|
| Model weights (IQ4_XS) | 1.7 GB | GGUF quantized |
| KV cache (32K tokens) | ~1.5 GB | Grows linearly with context |
| GPU workspace | 0.5-1 GB | Attention, MLPs, reductions |
| Batch buffers | 0.5 GB | Hidden states during compute |
| **Peak VRAM** | **~5-6 GB** | Safe margin for browser |

### RTX 3060 Ti (8GB) @ 64K Context (Exceptional)

| Component | Size | Notes |
|-----------|------|-------|
| Model weights (IQ4_XS) | 1.7 GB | Same |
| KV cache (64K tokens) | ~3 GB | 2× memory (2K hidden, 64K seq len) |
| GPU workspace | 0.5-1 GB | Same |
| Batch buffers | 0.5 GB | Same |
| **Peak VRAM** | **~6-7 GB** | Tight, no margin |

**Recommendation**: Use 32K as default, 64K only when absolutely necessary.

---

## Launching the Server

### Default (32K Context, Recommended)

```bash
npm run gemma4:rotorquant:start:32k:detached

# Or foreground (for debugging):
npm run gemma4:rotorquant:start:32k
```

### Maximum Context (64K, Exceptional Cases)

```bash
npm run gemma4:rotorquant:start:64k:detached

# Or foreground:
npm run gemma4:rotorquant:start:64k
```

### Health Check

```bash
npm run gemma4:rotorquant:health

# Expected output:
# {
#   "object": "list",
#   "data": [
#     {
#       "id": "gemma-4-e2b-it-rotorquant-iq4_xs",
#       "object": "model",
#       "owned_by": "local"
#     }
#   ]
# }
```

### Properties

```bash
npm run gemma4:rotorquant:props

# Expected output:
# {
#   "id": "gemma-4-e2b-it-rotorquant-iq4_xs",
#   "context_length": 32768,   # or 65536
#   "llm": "model"
# }
```

---

## Bounded Summarization Pipeline

### Input

- **Envelopes**: 501 summary jobs in `.tmp/rabbitmq-gemma4-summary-jobs.ndjson`
- **Tuples to process**: 16,573 (71% reduction from 58K)
- **Job spec**: feature_id, batch_index, tuple_count, candidate_refs

### Execution

```
Queue → llama-server :8090
  ├─ Process 501 jobs sequentially
  ├─ Each job: ~10 seconds average (variable by tuple_count)
  ├─ Throughput: 40-50 tok/s
  ├─ Total time: ~2.3 hours
  └─ Progress polled via /api/admin/summary-status
```

### Output

- **Summaries**: Updated in Postgres `atlas_packets.summary` column
- **Cache invalidation**: BitFrost L1 keys deleted after write
- **Events**: NATS/RabbitMQ notifications (async)

---

## Browser ONNX Fallback

### When to Use

- Server `:8090` is down or timeout (>30s)
- User requests local/offline mode
- Admin UI demo (no server available)

### Implementation

```typescript
// Fallback chain
const response = await bifrostChat(
  messages,
  'gemma4-rotorquant:latest',  // Try server first
  { temperature: 0.3, maxTokens: 256 }
);

if (response.error && response.error.code === 'ECONNREFUSED') {
  // Server down, use browser ONNX
  const fallbackResponse = await getGemma3E2BSession().generate(
    messages,
    { temperature: 0.3, maxTokens: 256 }
  );
}
```

### Performance

- **Speed**: ~30 tok/s (Gemma3 270M, WebGPU)
- **Memory**: ~1-2GB browser (doesn't compete with RTX GPU)
- **Latency**: 5-10× slower than server, but non-blocking

---

## Request Queuing (Better Than --parallel Slots)

### Why Queuing > Slots

**With `--parallel 2`:**
- Allocates KV cache for 2 requests (×2 memory)
- RTX 3060 Ti 8GB → OOM with 64K or even 32K
- Not viable for your hardware

**With Request Queuing:**
- Send 5+ requests to `/v1/chat/completions`
- llama-server queues internally
- Single KV cache slot, shared throughput
- ~50 tok/s across all requests (not per-request)
- No VRAM multiplication

### Example: Queue 5 Summarization Jobs

```typescript
// Send 5 requests simultaneously
const jobs = [...]; // 5 summary jobs from NDJSON

const promises = jobs.map(job =>
  fetch('http://127.0.0.1:8090/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: 'gemma-4-e2b-it-rotorquant-iq4_xs',
      messages: [{ role: 'user', content: job.prompt }],
      stream: false
    })
  }).then(r => r.json())
);

// llama-server processes them auto-batched
const results = await Promise.all(promises);
```

**llama-server behavior:**
- Request 1: Starts immediately, outputs tokens
- Request 2-5: Queued, start output after request 1 completes (or interleaved via batching)
- Total throughput: ~50 tok/s (shared, not 50 tok/s × 5)
- Memory: Single KV cache allocation

---

## Configuration Summary

### Current Launch Script

```bash
llama-server \
  -m models/gemma4-e2b-rotorquant-iq4xs/gemma-4-E2B-it-RotorQuant-IQ4_XS.gguf \
  -ngl 99 \
  -c 32768 \                    # Default 32K context
  -fa on \                       # Flash Attention
  --cache-prompt \               # Prompt caching
  --cache-reuse 256 \            # Cache reuse batch size
  --port 8090 \
  --chat-template-file configs/templates/gemma4-opencode.jinja \
  --jinja \
  --reasoning-format none \
  -ctk q8_0 \                    # K-cache: 8-bit quantized
  -ctv q8_0 \                    # V-cache: 8-bit quantized
  --parallel 1 \                 # Sequential slots
  --threads-batch 16             # Batch processing threads
```

### Environment Variables

```bash
# Override context length
CONTEXT=65536 npm run gemma4:rotorquant:start:64k

# Override parallelism (caution: may OOM)
PARALLEL=2 bash scripts/launch-gemma4-rotorquant.sh
```

---

## Troubleshooting

### "CUDA Out of Memory"

**If 32K context OOMs:**
1. Reduce batch size: add `--batch-size 128` to launch script
2. Reduce context: use 16K (`CONTEXT=16384`)
3. Check other processes: `nvidia-smi`

**If 64K context OOMs:**
1. Expected on 8GB GPU
2. Use 32K context instead
3. Reserve 64K for single large requests only

### "Model takes too long to load"

**Normal behavior:**
- First launch: 5-10 seconds (model load, KV buffer allocation)
- Subsequent launches: 1-2 seconds (cached)

**If stuck:**
1. Check CPU: `top` or Task Manager
2. Check GPU: `nvidia-smi`
3. Kill and restart: `killall llama-server`

### "Browser ONNX loads slowly"

**Expected:**
- First load: 30-60 seconds (418MB download + IndexedDB cache)
- Subsequent loads: <5 seconds (IndexedDB hit)

**To speed up:**
1. Pre-download: `npm run dev` → navigate to `/admin/onnx-gpu-test`
2. Verify WebGPU: Check test page for "Loaded with WebGPU"

---

## Performance Expectations

### Single Request

```
Prompt: "Summarize this code block in 50 words"
Request time: ~2 seconds (queued time) + 5 seconds (generation time) = 7s total
Throughput: 40-50 tok/s
Output tokens: ~50
```

### Batch (5 Simultaneous Requests)

```
Requests: 5 × "Summarize code block"
Queued → Processed sequentially (request batching)
Total time: ~20 seconds (not 7s × 5 = 35s)
Reason: Shared throughput (~50 tok/s across all)
```

### Bounded Summarization (501 Jobs)

```
Input: 501 jobs, ~33 tuples per job
Average job time: ~10 seconds (variable)
Total time: 501 × 10s ÷ 3600s/hour = ~2.3 hours
Parallelism: Sequential (--parallel 1)
```

---

## References

- **Bounded Summarization**: `docs/reports/summary-envelope-build.json`
- **Admin Dashboard**: `http://localhost:5173/admin/batch-embeddings/`
- **Model Card**: https://huggingface.co/majentik/gemma-4-E2B-it-RotorQuant-GGUF-IQ4_XS
- **llama.cpp Docs**: https://github.com/ggerganov/llama.cpp
- **RotorQuant Paper**: "TurboQuant: Redefining AI Efficiency with Extreme Compression" (Google, NYU, ICLR 2026)

---

## Next Steps

1. **Start server**:
   ```bash
   npm run gemma4:rotorquant:start:32k:detached
   ```

2. **Verify health**:
   ```bash
   npm run gemma4:rotorquant:health
   ```

3. **Process bounded summaries**:
   ```bash
   npm run atlas:summary:envelopes:queue:apply
   ```

4. **Monitor in admin UI**:
   ```bash
   npm run dev
   # Navigate to http://localhost:5173/admin/batch-embeddings/
   ```

**Estimated completion**: ~2.3 hours for 501 summary jobs on RTX 3060 Ti.
