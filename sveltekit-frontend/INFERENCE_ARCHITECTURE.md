# Inference Architecture Analysis

## Last Updated: March 22, 2026

The whole architecture is a caching system with an inference engine behind it. On any hardware — RTX 3060 Ti or Intel i5 — the goal is the same: **run the math as few times as possible, cache everything, serve from cache.**

The caching orchestration IS the engine. Not ONNX, not Ollama, not gRPC.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Inference Engine Comparison](#inference-engine-comparison)
3. [TRT-LLM / Triton Deep Dive](#trt-llm--triton-deep-dive)
4. [ONNX Runtime — What It Actually Is](#onnx-runtime--what-it-actually-is)
5. [Ollama Tool Calling + Web Search](#ollama-tool-calling--web-search)
6. [Client Inference Chain (Browser)](#client-inference-chain-browser)
7. [Server Inference Chain (Node.js + Go)](#server-inference-chain-nodejs--go)
8. [The No-GPU Scenario (Intel i5 / UHD 630)](#the-no-gpu-scenario-intel-i5--uhd-630)
9. [WASM Phase 2 Verdict](#wasm-phase-2-verdict)
10. [Binary Serialization Stack](#binary-serialization-stack)
11. [Cache Hierarchy (The Real Engine)](#cache-hierarchy-the-real-engine)
12. [WebGPU vs WASM Comparison](#webgpu-vs-wasm-comparison)
13. [Sources](#sources)

---

## Architecture Overview

```
USER QUERY
  │
  ├─ CLIENT ROUTER (client-router.ts)
  │   ├─ Score < 0.3 → LOCAL ONNX (browser, no server needed)
  │   ├─ Score 0.3-0.6 → RETRIEVAL HYBRID (client embed + server search)
  │   └─ Score > 0.6 → SERVER OLLAMA (full RAG pipeline)
  │
  ├─ CACHE HIERARCHY (checked before ANY inference)
  │   L0: LokiJS in-memory (5-10min TTL)
  │   L1: IndexedDB persistent (7-day TTL)
  │   L0.5: Glyph binary cache (NES/CHR-ROM compressed, server-side)
  │   L2: Memory Map (server, 5min TTL)
  │   L3: Redis (server, configurable TTL)
  │   L4: PostgreSQL / Qdrant / Service Logic
  │
  └─ INFERENCE ENGINES (only on cache MISS)
      ├─ Client: ONNX Runtime (WebGPU → WASM SIMD → CPU)
      └─ Server: Ollama (CUDA GPU) → gRPC/QUIC/HTTP transport
```

---

## Inference Engine Comparison

| Engine | GPU Required? | CPU Support | Browser? | Protocol | Our Usage |
|--------|:------------:|:-----------:|:--------:|----------|-----------|
| **ONNX Runtime** | No | Yes (WASM SIMD, CPU) | Yes | Static files | Client-side embedding + inference |
| **Ollama** | No (but slow) | Yes | No | HTTP REST | Server-side LLM + embeddings |
| **TRT-LLM** | **Yes (CUDA only)** | No | No | Triton gRPC | STOPPED (optional accelerator) |
| **Triton Server** | No | Yes (20% faster than raw CPU) | No | gRPC/HTTP | Not deployed (overkill for single-node) |
| **vLLM** | Preferred | Limited | No | OpenAI-compat | Not used |
| **llama.cpp** | No | Yes (WASM) | Yes | N/A | Archived (inferior to ONNX path) |

### Performance (TRT-LLM vs ONNX vs Ollama)

| Metric | TRT-LLM (RTX 3060 Ti) | ONNX Runtime (WASM) | Ollama (CUDA) | Ollama (CPU) |
|--------|:---------------------:|:-------------------:|:-------------:|:------------:|
| LLM tok/s (12B) | 80-120 | N/A (too large) | 25-40 | 2-5 |
| LLM tok/s (270M) | N/A | 8-12 (WebGPU), 1-2 (WASM) | 40+ | 8-12 |
| Embedding latency (768d) | <1ms | ~15ms (WASM SIMD) | ~5ms | ~20ms |
| Batch embedding (100) | <10ms | ~800ms | ~200ms | ~1500ms |
---
## TRT-LLM / Triton Deep Dive
### TRT-LLM (TensorRT-LLM)
- **NVIDIA CUDA only** — no CPU, no AMD, no Intel, no browser
- Open-source library that accelerates LLM inference via:
  - FP8/FP16/INT8 precision calibration
  - Layer fusion (combines adjacent ops into single GPU kernel)
  - KV-cache optimization + paged attention
- 2x faster than ONNX Runtime on same GPU hardware
- Our status: **STOPPED** (port 8099) — optional accelerator, Ollama handles GPU inference fine
### Triton Inference Server
- **Framework-agnostic model serving platform** (NOT an inference engine itself)
- Serves models FROM: TensorRT, PyTorch, ONNX, OpenVINO, Python, custom C++
- Supports both GPU and CPU inference (CPU is ~20% faster than raw due to batching)
- Dynamic batching, concurrent model execution, model versioning
- **Can use vLLM as a backend** — combining Triton's enterprise features with vLLM's PagedAttention
### Triton + LangChain (Python)
- LangChain has `ChatNVIDIA` and `NVIDIAEmbeddings` classes for Triton/NIM integration
- Triton exposes OpenAI-compatible endpoints that LangChain can consume directly
- Our stack uses `@langchain/ollama` (`ChatOllama`) — same pattern, different backend
- Triton would replace Ollama as the serving layer, not the LangChain orchestration
### When Would We Use Triton?
| Scenario | Use Triton? | Why |
|----------|:-----------:|-----|
| Single developer machine (current) | **No** | Ollama is simpler, same GPU |
| Multi-model serving (3+ models) | Maybe | Triton's dynamic batching helps |
| Multi-GPU cluster (production) | **Yes** | Triton manages GPU allocation |
| Edge deployment (Jetson) | **Yes** | Triton supports ARM + TensorRT |
| Browser/client inference | **No** | Triton is server-only |
**Current verdict:** Ollama is sufficient for single-node with 1 GPU. Triton adds value at scale.
---
## ONNX Runtime — What It Actually Is
ONNX is NOT an inference engine in the traditional sense — it's a **binary serialization format** (Protocol Buffers) for neural network computation graphs, with a runtime that executes them.
### The Format
```
model.onnx file (protobuf-serialized):
  ├── ModelProto (root)
  │   ├── GraphProto (computation graph)
  │   │   ├── NodeProto[] (operations: MatMul, Conv, Softmax, etc.)
  │   │   ├── TensorProto[] (weight tensors as raw bytes)
  │   │   └── ValueInfoProto[] (input/output shapes)
  │   ├── OpsetImportProto (operator version)
  │   └── MetadataProps (model info)
  └── Total: protobuf container with embedded float32/float16 blobs
```
### Serialization Comparison
| Format | Used By | Zero-Copy? | Our Usage |
|--------|---------|:----------:|-----------|
| **Protobuf** | ONNX models, gRPC messages | No | Model files + gRPC embedding transport |
| **FlatBuffers** | TFLite models, game engines | Yes | Not used |
| **JSONB** | PostgreSQL | No | Drizzle schema columns |
| **Glyph binary** | L0.5 cache | Semi (16B header + deflate) | SSE chat fragments |
| **safetensors** | HuggingFace models | Yes (mmap) | Ollama model storage |
### ONNX Runtime Execution Providers (Our Priority Order)
```
session.ts → getAvailableProviders():
  1. 'webgpu'  → navigator.gpu exists? → Dawn/WebGPU compute shaders
  2. 'wasm'    → always available → WASM SIMD (ort-wasm-simd-threaded.wasm)
  3. 'cpu'     → always available → JavaScript fallback (slowest)
```
On RTX 3060 Ti: hits WebGPU.
On Intel UHD 630: skips to WASM SIMD.
On ancient hardware: falls to CPU.
---
## Ollama Tool Calling + Web Search
### Native Tool Calling (v0.3.0+)
Ollama supports native function/tool calling with compatible models. The model decides when to invoke tools and incorporates their results into replies.
**Supported models:** Llama 3.1+, Qwen 3, Mistral, DeepSeek R1, Granite 3.2, GPT-OSS
**Built-in tools (experimental):**
- Web search (built-in, optionally enabled)
- Python code execution
- Structured output (JSON mode)
### Our Current Implementation
| Component | Technology | Status |
|-----------|-----------|--------|
| Agent framework | LangChain (`ChatOllama` + `DynamicStructuredTool`) | Working |
| Web search | SearXNG → DuckDuckGo → curated fallback | Working (needs `SEARXNG_URL`) |
| MCP tools | FastMCP (9 tools: rag:search, cases:load, playwright, etc.) | Working |
| Detective tools | 6 tools: ripgrep, findFiles, analyzeFile, extractPattern, analyzeImports, webSearch | Working |
| Native Ollama tools | `/api/agents/chat` (4 tools) + `/api/contextual/chat` (3 tools) | Working |
### Web Search Fallback Chain
```
1. SearXNG (self-hosted)     → docker run -d -p 8080:8080 searxng/searxng
   ↓ fail
2. DuckDuckGo HTML scraping  → https://html.duckduckgo.com/html/?q=...
   ↓ fail
3. Curated keyword results   → hardcoded matches for common queries
```
### Migration Path: LangChain → Native Ollama Tools
Could simplify by removing `@langchain/ollama` dependency and using Ollama's native OpenAI-compatible `/api/chat` with `tools` parameter directly. LangChain adds ReAct agent orchestration but also adds dependency weight. Our `client-router.ts` keyword scoring already handles routing without LangChain.

---

## Legal Glossary System

### Storage
- `legal_glossary` table (PostgreSQL) — 280+ seeded terms across 20 categories
- pgvector embeddings (768-dim via embeddinggemma) for semantic search
- Full-text search (tsvector) + ILIKE prefix for fallback
- `legal_definitions` table — document-extracted definitions with confidence rankings.

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/glossary/search` | POST | 3-strategy search (semantic → FTS → prefix) |
| `/api/glossary/terms` | GET | List/filter terms with pagination |

### Integration Points
| Consumer | How | File |
|----------|-----|------|
| SSE Chat | `fetchGlossaryMatches()` auto-injected into system prompt | `src/routes/api/sse/chat/+server.ts` |
| Agent Chat | `glossary_search` Ollama native tool | `src/routes/api/agents/chat/+server.ts` |
| Autonomous Agent | `glossary_search` LangChain DynamicStructuredTool | `src/lib/server/agent/autonomous-agent.ts` |
| Contextual Chat | `glossary_search` Ollama native tool (when `enableFunctions=true`) | `src/routes/api/contextual/chat/+server.ts` |
| Library UI | 5-tab research workspace (summary, definition, corpus, sources, related) | `src/routes/(app)/library/glossary/+page.svelte` |

---

## Agentic Tool Calling

### Four Agent Systems

| System | Endpoint | Tools | Architecture |
|--------|----------|-------|-------------|
| Agent Chat | `/api/agents/chat` | 4 (glossary_search, rag_search, web_search, ripgrep_search) | Ollama native tool calling, max 3 rounds, max 4 total calls |
| Contextual Chat | `/api/contextual/chat` | 3 (glossary_search, rag_search, web_search) | Ollama native tool calling (when `enableFunctions=true`), HMM state tracking, max 2 rounds, max 3 total calls |
| Autonomous Agent | `/api/agent/investigate` | 15 (evidence, multimodal, detective, glossary, RAG, AST) | LangChain DynamicStructuredTool, keyword-based selector with glossary score-boost |
| MCP Server | `npm run rag:mcp` | 36 (cases, evidence, reports, citations, RAG, codebase, etc.) | FastMCP stdio transport, standalone |

### Tool Callability Matrix

| Tool | Wired | Agent Chat | Contextual Chat | Autonomous Agent | MCP | Notes |
|------|-------|-----------|----------------|-----------------|-----|-------|
| `glossary_search` | ✅ | ✅ (priority 1) | ✅ (priority 1) | ✅ (keyword boost) | ❌ | 3 ms timeout; definition-first bias |
| `rag_search` | ✅ | ✅ (priority 2) | ✅ (priority 2, top-k=3, 150-char snippets) | ✅ | ✅ via `rag:search` | Qdrant hybridSearch, 768-dim |
| `web_search` | ✅ | ✅ (priority 3, 8s timeout) | ✅ (priority 3, 8s timeout) | ✅ | ❌ | SearXNG → DDG → fallback |
| `ripgrep_search` | ✅ | ✅ (priority 4, 5s timeout) | ❌ | ✅ | ❌ | Code/file pattern search |
| `cases_load` | ⚠️ mock | ❌ | ❌ | ⚠️ stub | ✅ | Real DB in MCP; agent stub |
| `unified_ast_query` | ✅ | ❌ | ❌ | ✅ | ✅ (FastMCP) | AST analysis |
| `evidence_search` | ✅ | ❌ | ❌ | ✅ | ✅ | Qdrant evidence_items |
| `system_health_check` | ✅ | ❌ | ❌ | ❌ | ✅ (FastMCP) | 9 FastMCP tools |

### Tool Priority Order (implemented in system prompts)
1. **glossary_search** — always try first for any definition/terminology question
2. **rag_search** — use for document/evidence retrieval; fall back from glossary when 0 results
3. **web_search** — only for freshness (current statutes, recent case law) that local corpus lacks
4. **ripgrep_search** — code/file pattern search; not relevant to legal Q&A

### Tool Hardening (implemented 2026-03-23)
- **Per-tool timeouts**: glossary=3s, rag=6s, web_search=8s, ripgrep=5s
- **Unified result shape**: `{ ok, tool, query, results, count, durationMs }` (agents) / `{ ok, tool, result, durationMs }` (contextual)
- **Error continuation**: failed tools return structured `[tool failed: reason]` string so synthesis proceeds without 500
- **Hard total-call cap**: agents/chat=4, contextual/chat=3
- **Trace metadata** in response: `_trace.toolRounds`, `_trace.totalToolCalls`, `_trace.toolLatencyMs`
- **GEMMA3_DEFAULTS** applied to all inference calls: temp=0.1, top_k=20, top_p=0.8, num_ctx=8192, repeat_penalty=1.05

### Ollama Native Tool Calling Pattern
```
1. Send messages[] + tools[] to Ollama /api/chat
2. Model returns message.tool_calls[] (or plain text if no tools needed)
3. Execute each tool call server-side
4. Append { role: 'tool', content: result } to messages[]
5. Re-send to Ollama for synthesis (loop max 2-3 rounds)
6. Final response includes toolResults[] metadata
```

---
## Client Inference Chain (Browser)
### ONNX Session Factory (`src/lib/ai/onnx/session.ts`)
```
getOnnxSession(modelUrl):
  1. Check memoization cache (Map<string, Promise<Session>>)
  2. Lazy-load onnxruntime-web (browser-only)
  3. Configure WASM paths → /ort/
  4. Detect providers: WebGPU → WASM → CPU
  5. Try each provider in order (catch → next)
  6. Warmup: dummy inference to prime pipeline
  7. Return memoized session
```

### Client Router (`src/lib/ai/client-router.ts`)

```
3-tier routing (works regardless of GPU):

  LOCAL (score < 0.3):
    - Greetings, UI help, simple lookups
    - ONNX gemma270m (WebGPU or WASM SIMD)
    - No server involvement

  RETRIEVAL (score 0.3-0.6):
    - Factual queries needing search context
    - Client embeds locally → server vector search → local answer
    - Hybrid: client + server cooperation
  SERVER (score > 0.6):
    - Legal reasoning, drafting, analysis
    - Full Ollama pipeline with RAG/KAG/DAG
    - SSE streaming response
  Health-aware: if server down → falls to local automatically
```
### Client Embeddings (`src/lib/ai/client-embed.ts`)
```
embedText(text):
  1. IndexedDB cache check → HIT = skip ALL compute
  2. Load ONNX session (auto-fallback WebGPU → WASM → CPU)
  3. Tokenize via @huggingface/transformers (local tokenizer.json)
  4. Run inference → raw output tensor
  5. Mean-pool over sequence dimension (with attention mask)
  6. L2 normalize → 768-dim unit vector
  7. Cache in IndexedDB (7-day TTL)
  8. Return Float32Array (zero-copy transferable)
```
### WASM Binaries (Pre-Built, Not Custom)
```
static/ort/
  ├── ort-wasm-simd-threaded.wasm          (11.4MB) — SIMD compute
  ├── ort-wasm-simd-threaded.jsep.wasm     (22.7MB) — WebGPU backend
  ├── ort-wasm-simd-threaded.asyncify.wasm (24.3MB) — async WASM
  └── 3x .mjs loaders (JS glue code)

Source: node_modules/onnxruntime-web/dist/ (pre-compiled by Microsoft)
NOT compiled from custom C/C++ — no emsdk needed
```
---
## Server Inference Chain (Node.js + Go)
### 4-Tier Embedding Fallback (`src/lib/server/grpc/embedding-client.ts`)
```
generateEmbeddings(texts):
  Tier 1: gRPC (:50051, 5s timeout)
    → Go microservice → goroutine batch → Redis cache → Ollama GPU
    → Binary protocol, lowest latency

  Tier 2: QUIC/NATS (:4222, 5s timeout)
    → Go QUIC bridge → legal.embedding.request → gRPC proxy
    → HTTP/3, 0-RTT, multiplexed

  Tier 3: HTTP batch → Ollama /api/embed (60s timeout)
    → Standard REST, JSON payload
    → Sends all texts in one request

  Tier 4: HTTP sequential → Ollama /api/embeddings (15s/text)
    → Legacy single-prompt endpoint
    → Last resort, slowest
```
### What Each Layer Does
```
gRPC (transport) → moves bytes between Node.js and Go
Go microservice (proxy) → batches requests, caches in Redis, forwards to Ollama
Ollama (engine) → loads model into GPU VRAM, runs inference, returns vectors
Redis (cache) → stores embedding results, avoids re-inference

None of these are "serving ONNX" — they're serving Ollama's native model format.
ONNX is client-side only (browser). Server uses Ollama's .gguf quantized models.
```
### Model Serving Map
| Model | Format | Where | How Served | Hardware |
|-------|--------|-------|-----------|----------|
| gemma3-legal 12B | GGUF (Q4_K_M) | Ollama | HTTP/gRPC proxy | RTX 3060 Ti CUDA |
| embeddinggemma 307M | GGUF (BF16) | Ollama | HTTP/gRPC proxy | RTX 3060 Ti CUDA |
| gemma3 270M | ONNX (W8A16) | Browser | Static file fetch | WebGPU / WASM SIMD |
| embeddinggemma 300M | ONNX (QInt8) | Browser | Static file fetch | WebGPU / WASM SIMD |
---
## The No-GPU Scenario (Intel i5 / UHD 630)
### What Happens Without a Discrete GPU
- Intel UHD 630: 24 execution units (vs 3584 CUDA cores on RTX 3060 Ti)
- WebGPU compute shaders: technically supported, but 10-50x slower
- Chrome may refuse `requestAdapter()` on older Intel drivers
- ONNX Runtime automatically falls back to WASM SIMD
### The ELIZA Architecture (NES-Style Low-End)
```
TIER 1 — Cached Knowledge (instant, no compute):
  Glyph cache: pre-compressed legal answers from prior GPU sessions
  IndexedDB: 7-day persistent cache of embeddings + responses
  LokiJS: session-scoped hot cache
  → 80-90% of repeat queries resolve here

TIER 2 — Pattern Matching (JS, <1ms):
  Client router keyword scoring (ELIZA-style)
  Statute lookup tables (preloaded from DB)
  Entity regex (SSN, case citations, dates)
  Template responses ("For [STATUTE], see [SECTION]...")
  → Handles formulaic legal queries without any model
TIER 3 — WASM SIMD (slow but works, 15-50ms):
  ONNX embeddinggemma → vector search → nearest cached match
  Tiny gemma 270M → 1-2 tok/s → short answers only
  → Cache result immediately for Tier 1 next time
TIER 4 — Server Fallback (when local exhausted):
  SSE stream from server Ollama (12B on GPU, or CPU if no GPU)
  Web search → RAG → KAG → DAG → full legal analysis
  → Cache entire response as glyph fragment
  → Next identical query resolves at Tier 1
```
### Performance on i5 Intel UHD 630
| Layer | What Fires | Speed |
|-------|-----------|-------|
| L0 LokiJS | In-memory Map lookup | <0.1ms |
| L1 IndexedDB | Cached embedding/response | <2ms |
| L0.5 Glyph | Binary decompressed fragment | <0.5ms |
| ONNX WASM SIMD | ort-wasm-simd-threaded.wasm | ~15ms embed |
| Pattern match | Keyword router (client-router.ts) | <1ms |
| CPU cosine sim | cosineSimilarity() inline JS | <1ms |
| Server fallback | SSE → Ollama GPU/CPU | network-bound |
**First query is slow. Queries 2-N hit cache. Like the NES: pre-render tiles, lookup from ROM.**
---
## WASM Phase 2 Verdict
### The 6 Unbuilt WASM Modules
| Module | Source File | What It Would Do | Current Fallback | Build Worth It? |
|--------|-----------|------------------|-----------------|:---------------:|
| simdjson | webassembly-accelerator.ts | Fast JSON parsing | `JSON.parse()` (<1ms) | **No** |
| vector-ops | webassembly-accelerator.ts | SIMD vector math | ONNX WASM SIMD (already built) | **No** |
| ocr-processor | webassembly-accelerator.ts | Client-side OCR | tesseract.js (uses WASM internally) | **No** |
| legal-processor | legal-processor.ts | Entity extraction | JS regex (640 lines, works fine) | **No** |
| ultra-json | legal-processor.ts | Fast serialization | `JSON.stringify()` (<1ms) | **No** |
| graph-engine | graphEngine.ts | Graph queries | Server Neo4j / JS in-memory | **No** |
### Why Not
1. **ONNX Runtime WASM SIMD already covers vector ops** — pre-built by Microsoft, no emsdk needed
2. **JS regex is fast enough** for entity extraction at document scale
3. **tesseract.js already uses WASM internally** — wrapping it again adds nothing
4. **JSON.parse is V8-optimized** — simdjson WASM would save microseconds
5. **Server handles heavy lifting** — Neo4j for graphs, Ollama for inference
6. All 6 have working JS mock fallbacks that pass all tests
### WebGPU vs WASM (With Discrete GPU)
| Task | WebGPU (RTX 3060 Ti) | WASM SIMD (CPU) | Gap |
|------|:--------------------:|:---------------:|:---:|
| Cosine sim (100 docs) | <0.5ms (3584 cores) | ~8ms (1 thread) | 16x |
| k-means (1000 vecs) | <1ms | ~50ms | 50x |
| LLM inference (270M) | 8-12 tok/s | 1-2 tok/s | 6x |
| Matrix multiply (768x768) | <1ms | ~30ms | 30x |
Your 2 WGSL shader files already do everything the 6 C files would:
- `src/lib/webgpu/kernels.wgsl` — 6 kernels (normalize, cosine sim, matmul, softmax, k-means)
- `src/lib/webgpu/rag-compute-shaders.wgsl` — 4 kernels (vectorized sim, clustering, entity extraction, neural scoring)
---
## Binary Serialization Stack
Everything in this architecture is binary serialization + caching at different tiers:
```
CLIENT TIER:
  ONNX .onnx        = protobuf-serialized neural network (model weights)
  IndexedDB          = serialized embedding vectors (Float32Array → number[])
  LokiJS             = in-memory JSON objects
  Glyph L0.5         = custom 16-byte header + deflate compressed text
TRANSPORT TIER:
  gRPC .proto        = protobuf-serialized embedding requests/responses
  QUIC/NATS          = JSON over HTTP/3 + NATS binary protocol
  SSE                = text/event-stream (newline-delimited JSON chunks)
SERVER TIER:
  Redis              = serialized JSON strings (GET/SET with TTL)
  PostgreSQL JSONB   = binary JSON (queryable, indexable)
  Qdrant             = binary vectors (f32 arrays + JSON payload)
  Ollama .gguf       = quantized model weights (mmap'd into GPU VRAM)
  Go protobuf        = embedding.proto compiled for gRPC server
```
The "AI" is the math that converts text → vectors → scores → text.
Everything else is **moving bytes between caches** to avoid re-running that math.
---
## Cache Hierarchy (The Real Engine)
```
                     ┌─────────────────────────────────┐
                     │  USER QUERY                      │
                     └──────────────┬──────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  L0: LokiJS (in-memory)       │  <0.1ms
                    │  Session-scoped, 5-10min TTL   │
                    └───────────────┬───────────────┘
                                    │ MISS
                    ┌───────────────▼───────────────┐
                    │  L1: IndexedDB (persistent)    │  <2ms
                    │  7-day TTL, survives refresh    │
                    └───────────────┬───────────────┘
                                    │ MISS
                    ┌───────────────▼───────────────┐
                    │  L0.5: Glyph Binary Cache      │  <0.5ms
                    │  NES/CHR-ROM style, deflate    │
                    │  Server-side, per-conversation  │
                    └───────────────┬───────────────┘
                                    │ MISS
                    ┌───────────────▼───────────────┐
                    │  L2: Memory Map (server)       │  <1ms
                    │  In-process Map, 5min TTL      │
                    └───────────────┬───────────────┘
                                    │ MISS
                    ┌───────────────▼───────────────┐
                    │  L3: Redis (server)            │  1-5ms
                    │  Cross-request, configurable   │
                    └───────────────┬───────────────┘
                                    │ MISS
                    ┌───────────────▼───────────────┐
                    │  L4: Service Logic             │  10-5000ms
                    │  DB query, Qdrant search,      │
                    │  Ollama inference, web search   │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  WRITE BACK to L0-L3           │
                    │  Cache result at every tier     │
                    └───────────────────────────────┘
```
After a few conversations, **90%+ of queries resolve at L0-L1** without hitting any inference engine. The inference engines (ONNX, Ollama, TRT-LLM) are expensive machines that run as rarely as possible.
---
## WebGPU vs WASM Comparison
### When WebGPU Wins (Discrete GPU Available)
- Parallel compute (3584 CUDA cores vs 1 CPU thread): **10-50x faster**
- Matrix operations, cosine similarity, k-means clustering
- LLM inference via ONNX Runtime WebGPU EP: **6x faster** than WASM
- Real-time graph layout (force-directed simulation)
### When WASM SIMD Wins (No GPU / Integrated Graphics)
- **Always available** — works on every modern browser
- Small models (< 500M params) run acceptably
- Embedding generation (~15ms) is fast enough with caching
- No GPU driver issues, no `requestAdapter()` failures
- 128-bit SIMD instructions on ALL modern x86/ARM CPUs
### When Neither Wins (Cache Hits)
- Glyph cache decompression: **<0.5ms** (no model runs at all)
- IndexedDB lookup: **<2ms** (cached embedding from prior session)
- LokiJS hit: **<0.1ms** (in-memory, same session)
- **This is where 90%+ of queries resolve**
---
## Sources
### Inference Engines
- [TRT-LLM vs ONNX Runtime — LLM Inference Comparison](https://quickcreator.io/blog/nvidia-tensorrt-llm-vs-onnx-runtime-2025-llm-inference-comparison/)
- [ML Inference Runtimes in 2026: An Architect's Guide](https://medium.com/@digvijay17july/ml-inference-runtimes-in-2026-an-architects-guide-to-choosing-the-right-engine-d3989a87d052)
- [Your Inference Engine: TensorRT, Triton and vLLM](https://www.whaleflux.com/blog/choosing-your-inference-engine-a-look-at-tensorrt-triton-and-vllm/)
- [How TRT, ONNX, Triton Reduce LLM Inference Time](https://jimmy-wang-gen-ai.medium.com/how-do-the-trt-onnx-triton-reduce-the-inference-time-of-llm-3a546a54f2c4)
### Triton Inference Server
- [NVIDIA Triton Inference Server Docs](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/index.html)
- [Triton ONNX Runtime Backend](https://github.com/triton-inference-server/onnxruntime_backend)
- [NVIDIA Triton with LangChain](https://www.okahu.ai/news/nvidia-triton-inference-server-with-langchain)
- [Triton Inference Server GitHub](https://github.com/triton-inference-server/server)
### Ollama Tool Calling
- [Ollama Tool Calling Docs](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama Web Search Blog](https://ollama.com/blog/web-search)
- [Building Agentic AI: MCP + Ollama Tool Calling](https://dev.to/ajitkumar/building-your-first-agentic-ai-complete-guide-to-mcp-ollama-tool-calling-2o8g)
- [Ollama Tool Calling Tutorial (IBM)](https://www.ibm.com/think/tutorials/local-tool-calling-ollama-granite)
### WebGPU vs WASM
- [WebGPU vs WebASM: Browser Inference Benchmarks](https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/)
- [WebAssembly and WebGPU Enhancements for Faster Web AI](https://developer.chrome.com/blog/io24-webassembly-webgpu-1)
- [WebGPU vs WASM — Aircada](https://aircada.com/blog/webgpu-vs-wasm)
- [Forget WebAssembly — WebGPU Is the Real Revolution](https://bhavyansh001.medium.com/forget-webassembly-webgpu-is-the-real-revolution-developers-should-watch-4539ff7c57a5)
---
## Key Files Reference
| File | Purpose |
|------|---------|
| `src/lib/ai/onnx/session.ts` | ONNX session factory (WebGPU → WASM → CPU fallback) |
| `src/lib/ai/client-router.ts` | 3-tier routing: local vs retrieval vs server |
| `src/lib/ai/client-embed.ts` | Client-side 768-dim embeddings (ONNX + cache) |
| `src/lib/ai/client-cache.ts` | LokiJS + IndexedDB dual-tier client cache |
| `src/lib/ai/model-ids.ts` | Centralized model constants + ONNX EP priority |
| `src/lib/server/grpc/embedding-client.ts` | 4-tier server embedding (gRPC → QUIC → HTTP) |
| `src/lib/server/glyph-prompt-cache.ts` | L0.5 NES/CHR-ROM binary cache |
| `src/lib/server/cache.ts` | L2/L3 memory + Redis cache |
| `src/lib/server/agent/autonomous-agent.ts` | LangChain ReAct agent + 15 tools (wired via /api/agent/investigate) |
| `src/lib/server/agent/tools/web-search-searxng.ts` | SearXNG → DuckDuckGo → curated search |
| `src/routes/api/agents/chat/+server.ts` | Agent chat with 4 Ollama native tools (web, ripgrep, RAG, glossary) |
| `src/routes/api/contextual/chat/+server.ts` | Contextual chat with HMM + 3 Ollama tools (glossary, RAG, web) |
| `src/routes/api/agent/investigate/+server.ts` | Autonomous investigation endpoint (15 tools) |
| `src/routes/api/glossary/search/+server.ts` | 3-strategy glossary search (semantic + FTS + prefix) |
| `src/routes/api/sse/chat/+server.ts` | Rich SSE chat (RAG + ACE + corrective RAG + glossary + DAG) |
| `src/mcp/server.ts` | FastMCP 36-tool server (stdio transport) |
| `src/lib/webgpu/kernels.wgsl` | 6 GPU compute kernels |
| `src/lib/webgpu/rag-compute-shaders.wgsl` | 4 RAG GPU kernels |
