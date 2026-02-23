# GPU Infrastructure Roadmap — Deeds Web App

## Last Updated: February 23, 2026 (Session 93r8)

---

## Current State

| Layer | What Exists | Status | Key Files |
|-------|------------|--------|-----------|
| **CUDA/RTX** | 18 custom kernels, 7 CMake configs, RTX 3060 Ti SM 8.6 | ACTIVE (Ollama GPU) / containers STOPPED | `go-microservice/cuda-server/*.cu` |
| **WebGPU** | 4 WGSL shaders, ONNX Runtime (WebGPU→WASM→CPU), 3 ONNX models | ACTIVE | `src/lib/gpu/gpu-compute-pipeline.ts` (708L) |
| **gRPC** | 3 client impls, 4 active .proto files, HTTP/Ollama fallback active | DISABLED (`EMBEDDING_GRPC_ENABLED=false`) | `src/lib/server/grpc/embedding-client.ts` |
| **N-API** | onnxruntime-node, sharp, bcrypt/argon2 (transitive); simd-bridge stub | ACTIVE (transitive) / STUB (custom) | `simd-bridge/binding.gyp` |
| **RabbitMQ** | 7 queues, 5 exchanges, auto-init commented out | PRODUCER-ONLY (no consumers) | `src/lib/server/queue/rabbitmq-manager-fixed.ts` |
| **XState v5** | 10 machines (9 client + 1 server queue) | ACTIVE | `src/lib/machines/*.ts` |
| **RabbitMQ+XState** | rabbitmq-xstate-integration.ts | STUB (95L skeleton) | `src/lib/messaging/rabbitmq-xstate-integration.ts` |
| **TensorRT** | Client + server stubs, CUDA kernels, Docker containers | STOPPED 2 months | `src/lib/trt-llm/client.ts` |
| **Matrix math** | Hand-implemented L2 norm, cosine sim, mean pooling, KNN | ACTIVE (primary path) | `src/lib/ai/client-embed.ts`, `src/lib/server/embedding/knn-helper.ts` |
| **Worker threads** | 8 workers, pool (default 4), p-limit gates (1-4) | ACTIVE (some stubs) | `src/lib/server/analysis/concurrency-gate.ts` |
| **GPU compute pipeline** | W3C WebGPU compliant, 3 WGSL shaders, fallback chain | ACTIVE (708L real impl) | `src/lib/gpu/gpu-compute-pipeline.ts` |
| **GPU embedding bridge** | Server-side gRPC+Ollama→similarity→QLoRA compress | ACTIVE (185L) | `src/lib/gpu/gpu-embedding-bridge.ts` |

---

## Key Files (Already in src/)

| File | Lines | Quality | Purpose |
|------|-------|---------|---------|
| `src/lib/gpu/gpu-compute-pipeline.ts` | 708 | Production | W3C WebGPU compute — cosine sim (256 threads), L2 norm, matmul (16x16) |
| `src/lib/gpu/gpu-embedding-bridge.ts` | 185 | Production | Server embedding → similarity → QLoRA compress pipeline |
| `src/lib/gpu/nes-gpu-memory-bridge.ts` | 144 | Stub | FlatBuffer fallback (currently JSON shim) |
| `src/lib/gpu/webgpu-cuda-bridge.ts` | 180 | Skeleton | WebGPU↔CUDA error analysis (50% placeholder) |
| `src/lib/messaging/rabbitmq-xstate-integration.ts` | 95 | Stub | XState v5 skeleton (was corrupted, needs rewrite) |

---

## Phase 1 — Revive Existing Infrastructure

### 1.1 Complete nes-gpu-memory-bridge.ts (FlatBuffer serialization)
- [ ] Replace JSON fallback with real FlatBuffer binary codec
- [ ] Wire to `ultra-json-parser.ts` (already imports it)
- [ ] Benchmark: JSON (current) vs FlatBuffer for LegalDocument transport
- **File:** `src/lib/gpu/nes-gpu-memory-bridge.ts` (144L stub)
- **Reference:** [FlatBuffers JS Guide](https://flatbuffers.dev/flatbuffers_guide_use_javascript.html)

### 1.2 Complete webgpu-cuda-bridge.ts (error analysis GPU dispatch)
- [ ] Implement `clusterErrorsCPU()` (currently returns `[]`)
- [ ] Implement `generateClusterSummary()` (currently returns `''`)
- [ ] Wire WGSL shaders from `gpu-compute-pipeline.ts` for GPU dispatch
- [ ] Test with `UnifiedAIAssistant.svelte` Worker (already imports it)
- **File:** `src/lib/gpu/webgpu-cuda-bridge.ts` (180L skeleton)

### 1.3 Start TRT-LLM Docker containers
- [ ] Fix `src/lib/server/trt-llm.ts` line 11: undefined `prompt` → use `input` parameter
- [ ] Align port: client (8099) vs Docker (8000) — standardize to 8099
- [ ] `docker start legal-ai-tensorrt` (containers already built)
- [ ] Verify `/api/trt-llm/health` returns 200
- **Files:** `src/lib/trt-llm/client.ts`, `src/lib/server/trt-llm.ts`, `docker-compose.full.yml`

---

## Phase 2 — Add Missing Concurrency Layer

### 2.1 worker_threads for embedding-client.ts
- [ ] Move protobuf deserialization off event loop into worker thread
- [ ] Use existing `src/lib/server/ingest/worker-pool.ts` (configurable pool, auto-cleanup)
- [ ] Or evaluate [Piscina](https://github.com/piscinajs/piscina) for more mature lifecycle
- **Current bottleneck:** `@grpc/grpc-js` blocks event loop during protobuf deser
- **Reference:** [NaaE pattern — 400% gRPC boost](https://blog.triton.one/grpc-js-alternative-napi-rust/)

### 2.2 Rewrite rabbitmq-xstate-integration.ts
- [ ] Connect XState machine states to RabbitMQ queue events:
  - `CONNECT` → amqplib connect
  - `CONNECTED` → start consuming
  - `MESSAGE_RECEIVED` → dispatch to appropriate pipeline
  - `ERROR` → retry with backoff
- [ ] Wire to `case-workflow-machine.ts` for evidence processing orchestration
- [ ] Add RabbitMQ connection health to `/api/health/capabilities`
- **File:** `src/lib/messaging/rabbitmq-xstate-integration.ts` (95L stub)
- **Depends on:** `src/lib/server/queue/rabbitmq-manager-fixed.ts`

### 2.3 Persistent RabbitMQ consumers
- [ ] Uncomment auto-init in `rabbitmq-manager-fixed.ts` (line 362-365)
- [ ] Implement handlers for 5 unhandled queues:
  - `evidence.process` → evidence pipeline stages
  - `vector.index` → Qdrant upsert
  - `chat.context` → context caching
  - `analytics.track` → event logging
  - `document.embed` → embedding generation
- [ ] Add job timeout mechanism (fail stuck `running` jobs after 1 hour)
- [ ] Run via PM2 or systemd for persistence
- **Reference:** [RabbitMQ inference architecture](https://medium.com/@anderson-3395/running-pytorch-inference-at-scale-with-fastapi-rabbitmq)

---

## Phase 3 — Performance Optimization

### 3.1 N-API Rust gRPC client (NaaE pattern)
- [ ] Replace `@grpc/grpc-js` in `embedding-client.ts` with Rust N-API addon
- [ ] Rust handles: gRPC connection management + protobuf deserialization
- [ ] JavaScript receives parsed JSON via `stream.Duplex()` — same `emitter.on()` API
- [ ] Target: 400% throughput improvement (proven by Triton.one)
- **Current:** `simd-bridge/binding.gyp` (stub, never compiled)
- **Reference:** [Boosting Node.js gRPC throughput by 400% with NaaE](https://blog.triton.one/grpc-js-alternative-napi-rust/)
- **Reference:** [Boosting Node.js gRPC performance with NAPI and Rust](https://blog.triton.one/supercharging-the-javascript-sdk-with-napi/)

### 3.2 WebGPU compute shaders for client-side preprocessing
- [ ] Wire `gpu-compute-pipeline.ts` cosine similarity shader to RAG search results reranking
- [ ] Add batch embedding normalization before server dispatch
- [ ] Enable WebGPU path in `client-embed.ts` (currently CPU-only L2 norm)
- [ ] Benchmark: GPU shader vs JavaScript cosine similarity for 100+ documents
- **Existing shaders:** `kernels.wgsl`, `rag-compute-shaders.wgsl`, `embedding_processor.wgsl`
- **Reference:** [W3C WebGPU Spec](https://www.w3.org/TR/webgpu/)
- **Reference:** [WGSL Spec](https://www.w3.org/TR/WGSL/)

### 3.3 Type-safe streaming RPC
- [ ] Evaluate [Connect-ES 2.0](https://connectrpc.com/) (GA, lists SvelteKit support)
- [ ] Or evaluate tRPC / svelte-rpc for type-safe streaming
- [ ] Replace manual proto-loader with generated TypeScript stubs
- [ ] Target: Type-safe end-to-end embedding + retrieval pipeline
- **Current:** `@grpc/grpc-js` + `@grpc/proto-loader` (manual, untyped)

---

## Phase 4 — Future (When Specs Mature)

### 4.1 gRPC over QUIC/HTTP3
- [ ] Monitor [gRPC HTTP/3 standardization](https://github.com/grpc/grpc/issues/19126)
- [ ] Benefits: 0-RTT connection resumption, no head-of-line blocking
- [ ] Existing stubs: `deeds_labs/development-tools/cuda-grpc-stubs/quic/`
- **Status:** Not standardized — Node.js gRPC lacks mature HTTP/3 support
- **Reference:** [gRPC HTTP/3 Key Benefits](https://www.catchpoint.com/http2-vs-http3/grpc-http3)
- **Reference:** [gRPC over HTTP/3 in Production](https://thinhdanggroup.github.io/grpc-over-http3/)

### 4.2 SharedArrayBuffer + Atomics for zero-copy worker transfer
- [ ] Requires COOP/COEP headers (already in `hooks.server.ts`)
- [ ] Enable zero-copy embedding vector sharing between workers
- [ ] Replace `postMessage()` with shared memory for 768-dim Float32Array
- [ ] Benchmark: SharedArrayBuffer vs structured clone for embedding batches
- **Reference:** [WebGPU Explainer — Multithreading](https://gpuweb.github.io/gpuweb/explainer/)

### 4.3 Server-side WebGPU via @kmamal/gpu (Dawn)
- [ ] Evaluate [@kmamal/gpu](https://github.com/kmamal/gpu) (WebGPU for Node.js via Google Dawn)
- [ ] Enables shared WGSL shaders between client and server
- [ ] Replace `cpuBatchCosineSimilarity()` in `gpu-embedding-bridge.ts` with GPU dispatch
- [ ] Target: Eliminate Python subprocess for simple tensor operations
- **Reference:** [Native GPU for Node.js](https://dev.to/toviszsolt/native-gpu-for-nodejs-4pc1)
- **Reference:** [GPU Native for Node.js (2025.09.15)](https://github.com/toviszsolt/nodejs-native-gpu)

---

## Architecture Target

```
Browser (Client Tier)
├── WebGPU Compute Shaders (WGSL)
│   ├── Cosine similarity (256 threads, 4-wide unroll)
│   ├── L2 normalization
│   └── Matrix multiply (16x16 workgroups)
├── ONNX Runtime (WebGPU → WASM SIMD → CPU)
│   └── gemma3-270m (418MB, local-only)
├── XState v5 machines (9) → client orchestration
└── Client Router → health-aware (capabilities 30s cache)
    ├── Simple → local ONNX (WebGPU)
    └── Complex → server Ollama (SSE stream)
         ↕ HTTP/SSE + gRPC (when enabled)
SvelteKit Server
├── worker_threads pool → protobuf deser off event loop
├── p-limit gates (1-4 concurrent) → GPU resource protection
├── DB job queue (FOR UPDATE SKIP LOCKED) → atomic claiming
├── gRPC clients → embedding, retrieval, vector-cache
├── RabbitMQ consumers → 7 queues, XState orchestrated
└── GPU embedding bridge → gRPC→similarity→QLoRA compress
         ↕ HTTP/gRPC
GPU + Services
├── Ollama RTX 3060 Ti → gemma3-legal 11.8B Q4_K_M
├── TensorRT (optional) → FlashAttention-2 + Q4 matmul
├── Qdrant → 6 collections, 768-dim
├── Redis → L3 cache (SSR + sessions + embeddings)
├── PostgreSQL → Drizzle ORM + pgvector
└── RabbitMQ → 7 queues, 5 exchanges
```

---

## Hardware Constraints (RTX 3060 Ti)

| Resource | Budget | Notes |
|----------|--------|-------|
| **VRAM** | 8192 MB total | gemma3-legal alone = 7.3GB |
| **Model memory** | 7,300 MB | Q4_K_M (4-bit weights) |
| **KV cache** | 256 MB | Depends on sequence length |
| **Batch buffer** | 512 MB | batch_size=16, seq_len=2048 |
| **Workspace** | 192 MB | cuBLAS scratch |
| **Headroom** | ~350 MB | Tight — can't run TRT + Ollama simultaneously |
| **CUDA cores** | 4,608 | SM 8.6 Ampere |
| **Tensor cores** | Yes | FP16/BF16/INT8/INT4 |
| **Registers** | 64 per thread max | `-maxrregcount=64` |
| **Shared memory** | 48 KB per SM | Lower than RTX 3090 |

---

## Sources

- [NaaE: 400% gRPC boost via N-API+Rust](https://blog.triton.one/grpc-js-alternative-napi-rust/)
- [N-API Rust gRPC performance](https://blog.triton.one/supercharging-the-javascript-sdk-with-napi/)
- [@kmamal/gpu: WebGPU for Node.js via Dawn](https://github.com/kmamal/gpu)
- [GPU Native for Node.js](https://github.com/toviszsolt/nodejs-native-gpu)
- [W3C WebGPU Spec](https://www.w3.org/TR/webgpu/)
- [W3C WGSL Spec](https://www.w3.org/TR/WGSL/)
- [WebGPU API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [WebGPU Explainer](https://gpuweb.github.io/gpuweb/explainer/)
- [gRPC HTTP/3 Benefits](https://www.catchpoint.com/http2-vs-http3/grpc-http3)
- [gRPC over HTTP/3 Production Guide](https://thinhdanggroup.github.io/grpc-over-http3/)
- [gRPC HTTP/3 Support Issue #19126](https://github.com/grpc/grpc/issues/19126)
- [Connect-ES (gRPC-compatible RPC)](https://connectrpc.com/)
- [Piscina Worker Pool](https://github.com/piscinajs/piscina)
- [RabbitMQ Inference Architecture](https://medium.com/@anderson-3395/running-pytorch-inference-at-scale-with-fastapi-rabbitmq)
- [FlatBuffers JS Guide](https://flatbuffers.dev/flatbuffers_guide_use_javascript.html)
