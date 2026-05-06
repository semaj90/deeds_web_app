# Infrastructure Optimization Roadmap

## Date: March 14, 2026
## Context: Ollama + Qdrant + pgvector + RabbitMQ stack on RTX 3060 Ti (8GB VRAM)

---

## Highest Impact (do now — config only)

### 1. Ollama KV Cache Quantization + Flash Attention
Single biggest win — **2x context capacity** on 8GB RTX 3060 Ti with near-zero quality loss:

```bash
OLLAMA_FLASH_ATTENTION=1        # Required for KV quant, already supported on Ampere
OLLAMA_KV_CACHE_TYPE=q8_0       # Halves KV cache VRAM (Q8_0 = minimal quality loss)
OLLAMA_KEEP_ALIVE=24h           # Keep model loaded for prompt prefix caching
OLLAMA_NUM_PARALLEL=2           # 2 concurrent slots (conservative for 8GB)
```

With Q8_0 KV + Flash Attention, gemma3-legal gets ~2x the effective context window in the same VRAM.

### 2. Prompt Prefix Caching (audit needed)
Ollama **automatically reuses** KV cache for identical prompt prefixes. Dynamic content breaks it:

```typescript
// BAD — cache miss every time
`You are a legal AI. Time: ${new Date().toISOString()}`

// GOOD — static prefix, cache hits
`You are a legal AI assistant specialized in evidence analysis.`
```

System prompts in sse/chat and synthesis/generate appear static — good. Worth auditing all LLM call sites.

### 3. Structured Output with Zod
Ollama supports `format: zodSchema` for guaranteed JSON structure via GBNF grammar constraining. ACE eval already does JSON parsing with regex fallback — structured output would eliminate parse failures.

---

## High Impact (medium effort)

### 4. pgvector halfvec + Iterative Scans
pgvector 0.8+ features:
- **halfvec**: 50% storage savings (768-dim: 6KB → 3KB per vector)
- **Iterative scans**: Fixes "overfiltering" when combining WHERE + vector search
- **sparsevec**: Efficient BM25 hybrid search vectors

### 5. Qdrant BM42 Hybrid Search
Qdrant 1.10+ has BM42 (attention-weighted BM25) — better than plain BM25 for short legal texts. Replace current RRF fusion with BM42.

### 6. Corrective RAG Pattern
Add an LLM-as-judge step after retrieval:
- Score > 0.8 → accept retrieved docs
- Score 0.5-0.8 → reformulate query and retry
- Score < 0.5 → fallback to broader search

### 7. HTTP Keep-Alive for Ollama
`fetch()` calls to Ollama create new TCP connections each time. Add persistent HTTP agent with `keepAlive: true, maxSockets: 10`.

---

## Worth Knowing (evaluate later)

| Technique | Status | Why Wait |
|-----------|--------|----------|
| **Speculative decoding** | Not in Ollama yet | Track GitHub #5800 |
| **vLLM migration** | 3.3x throughput | Only if >50 concurrent users |
| **RabbitMQ Streams** | 10x throughput | Requires protocol migration |
| **Binary quantization** (Qdrant) | 40x search speed | Test recall impact first |
| **Matryoshka embeddings** | 5x faster search | Requires model swap (nomic-embed-text-v1.5) |
| **ColBERT reranking** | Higher precision | Storage overhead, Qdrant 1.10+ |

---

## TRT-LLM vs Ollama Comparison

**Verdict: Stick with Ollama** on RTX 3060 Ti (8GB VRAM).

| Feature | TensorRT-LLM | Ollama | Winner |
|---------|-------------|--------|--------|
| KV Cache Quantization | FP8 + INT8 (Hopper/Ada: FP8) | Q8_0 + Q4_0 via env var | TRT-LLM (more formats) |
| Flash Attention | Built-in FA1/FA2/FA3 fused kernels | `OLLAMA_FLASH_ATTENTION=1` | TRT-LLM (deeper) |
| Speculative Decoding | Yes — draft model, ReDrafter, EAGLE, Lookahead (3.6x boost) | **Not supported** | TRT-LLM (clear win) |
| Prefix Caching | Advanced: priority eviction, host offload, 5x TTFT | Basic: byte-for-byte match, 5min eviction | TRT-LLM (sophisticated) |
| Structured Output | XGrammar/LLGuidance JSON/regex/EBNF | GBNF grammar via `format: zodSchema` | Tie |
| Concurrent Requests | In-flight batching (180-220 req/sec) | `NUM_PARALLEL` slots (1-3 req/sec) | TRT-LLM (massive) |
| Setup Time | 30min engine build, 1-2 weeks production tuning | `ollama pull` — seconds | Ollama |
| 8GB VRAM Fit | 11.8B model: likely OOM with runtime overhead | 11.8B Q4_K_M: fits at 7.3GB | Ollama |

**Why not TRT-LLM here:**
- 11.8B gemma3-legal (7.3GB) leaves no room for TRT-LLM runtime overhead
- No FP8 on Ampere (requires Ada/Hopper)
- Gemma 3 support is still unstable in TRT-LLM
- Speculative decoding not yet available for Gemma 3 in TRT-LLM either
- In-flight batching moot with 1-request capacity at 8GB

**When TRT-LLM makes sense:** RTX 4090 (24GB) or cloud A100/H100 with >50 concurrent users.

Sources: [TRT-LLM Quantization](https://nvidia.github.io/TensorRT-LLM/blogs/quantization-in-TRT-LLM.html) | [Speculative Decoding](https://developer.nvidia.com/blog/tensorrt-llm-speculative-decoding-boosts-inference-throughput-by-up-to-3-6x/) | [KV Cache Reuse](https://nvidia.github.io/TensorRT-LLM/advanced/kv-cache-reuse.html) | [Support Matrix](https://nvidia.github.io/TensorRT-LLM/reference/support-matrix.html)

---

## gRPC Performance Tuning (implemented)

### Key Optimizations
| Technique | Impact | Details |
|-----------|--------|---------|
| **Channel reuse** | Avoid connection overhead | Reuse gRPC channel; don't create per-call |
| **Connection multiplexing** | HTTP/2 streams | Multiple concurrent RPCs on single TCP conn |
| **Stream limits** | Prevent queueing | `EnableMultipleHttp2Connections` when stream limit hit |
| **Connection pooling** | Lower latency | Pool of channels for high-throughput services |
| **L7 load balancing** | Request-level distribution | L4 LBs route all streams to one backend; use Envoy for gRPC-aware L7 |
| **Keepalive pings** | Detect dead connections | `keepalive_time_ms`, `keepalive_timeout_ms` |

### Implemented (this session)
- **Node.js clients**: Added `keepalive_time_ms: 10s`, `keepalive_timeout_ms: 5s`, `max_message_length: 10MB`, `max_connection_idle: 5min`, `max_connection_age: 10min` to both `embedding-client.ts` and `retrieval-client.ts`
- **Go server**: Added `keepalive.ServerParameters` (10s/5s), `EnforcementPolicy` (5s min, permit without stream), `MaxRecvMsgSize/MaxSendMsgSize` (10MB) to `main.go`
- **Retry on failure**: Changed permanent `grpcLoadFailed = true` to 30s backoff retry in both clients

Sources: [Microsoft gRPC Performance](https://learn.microsoft.com/en-us/aspnet/core/grpc/performance) | [gRPC Connection Pooling](https://oneuptime.com/blog/post/2026-01-08-grpc-connection-pooling/view) | [gRPC on HTTP/2](https://grpc.io/blog/grpc-on-http2/) | [ByteSizeGo Guide](https://www.bytesizego.com/blog/grpc-performance)

---

## Already Completed (this session)

| Optimization | Details |
|-------------|---------|
| Redis LFU eviction | `allkeys-lru` → `allkeys-lfu` (docker-compose, redis.conf) |
| RabbitMQ prefetch | `channel.prefetch(10)` in startConsumers() |
| LiteLLM rate limits | Per-model RPM/TPM, `max_parallel_requests: 4`, fixed Redis host |
| SSE reconnection | `retry: 3000` + `X-Accel-Buffering: no` on all 3 SSE endpoints |
| ACE async | Synchronous eval → fire-and-forget via `ace.evaluate` RabbitMQ queue |
| Langfuse tracing | `traceLLM()` wrapper on Ollama calls (knowledge/stream, sse/chat) |
| Semantic cache | LiteLLM Redis-semantic cache with embeddinggemma (similarity 0.85) |
| Ollama env vars | `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`, `OLLAMA_KEEP_ALIVE=24h`, `OLLAMA_NUM_PARALLEL=2` |
| HTTP keep-alive | `undici.Agent` with connection pooling for Ollama + `keep_alive: "24h"` in request bodies |
| `ollamaFetch()` | Shared fetch wrapper in `ollama.ts` — all Ollama calls route through pooled dispatcher |
