# Enhanced RAG Multi-Agent AI System — Architecture & Best Practices

## Last Updated: March 10, 2026
## Status: Production (0 errors, 0 warnings, 20/20 routes green)

---

## Working Stack (Verified)

| Component | Version | Status |
|-----------|---------|--------|
| SvelteKit | 2.x | Production |
| Svelte | 5 (runes mode) | Full `$state`/`$derived`/`$effect`/`$props` |
| Bits UI | v2.16.2 | Fully compatible with Svelte 5 runes |
| UnoCSS | v66.5 (svelte-scoped) | Primary styling framework |
| TypeScript | 5.x | 0 errors via svelte-check |
| Vite | 6.x | Build passes (exit 0) |
| Drizzle ORM | 0.44 | 70+ tables, pgvector |

---

## GPU Compute Pipeline (RTX 3060 Ti — CUDA Verified)

### Server-Side: LibTorch N-API (CUDA + CPU Fallback)

The LibTorch addon (`tensorrt_bridge.node`) is compiled and loaded at runtime. Three GPU-accelerated functions are **verified working** on the RTX 3060 Ti (8GB VRAM, Ampere 8.6):

```
graphSimilarity(embeddings)     → cosine similarity matrix (768-dim, N vectors)
clusterEmbeddings(embeddings, k) → k-means cluster assignments
computeCaseEmbedding(weights, embeddings) → weighted aggregate case vector
```

**File:** `src/lib/server/gpu/libtorch-bridge.ts`
**API:** POST `/api/gpu/compute` with operations: `similarity`, `cluster`, `weighted_embedding`, `device_info`

CUDA libraries bundled: cuBLAS (matrix ops), cuDNN (conv), CUDA runtime 13.x, LibTorch 2.9.0+cu130.

### Client-Side: WebGPU (W3C Spec-Compliant)

**File:** `src/lib/gpu/gpu-compute-pipeline.ts`
- Buffer pool with power-of-2 bucketed reuse
- Pipeline cache (LRU per shader)
- Fallback: WebGPU → WASM SIMD → CPU
- 14 WGSL compute kernels across 3 shader files:
  - `kernels.wgsl`: normalize, cosine sim, matmul, softmax, k-means assign/update
  - `rag-compute-shaders.wgsl`: vectorized cosine, entity extraction, neural scoring
  - `webgpu-kernels.wgsl`: force layout, similarity, reduction, highlighting

### GPU Background Evidence Analysis

**File:** `src/lib/server/gpu/background-analyzer.ts`
- Triggered after evidence upload (fire-and-forget, non-blocking)
- A. `graphSimilarity()` → find related evidence within same case
- B. `clusterEmbeddings()` → auto-group evidence into topic clusters
- C. `computeCaseEmbedding()` → update aggregate case fingerprint vector
- Results stored in `evidence.metadata.gpuAnalysis` JSONB

---

## Cache Hierarchy (4-Tier, Clean)

```
L0:  LokiJS (client, in-memory, 5-10min TTL, session-scoped)
L1:  IndexedDB (client, persistent, 7-day TTL, survives refresh)
L2:  Server Dual-Tier:
     ├── Memory Map (in-process, 5min TTL)
     └── Redis (distributed, configurable TTL)
L3:  Qdrant llm_response_cache (semantic dedup, 0.85 cosine threshold)
```

**Specialized caches:**
- Embedding cache (Redis, avoid re-embedding same text)
- Vision analysis cache (Redis, 24h TTL per SHA-256 hash)
- ACE evaluation cache (Redis, 1h TTL)
- Client GPU result cache (IndexedDB, 1h TTL)

---

## RAG / KAG / DAG Architecture (All TypeScript)

**File:** `src/lib/sdk/index.ts` — Unified SDK

```typescript
UnifiedAIClient.hybridAugment(query, caseId)
  ├── RAG → Qdrant vector search (evidence_items, legal_documents, legal_cases)
  │     └── Hybrid: dense 768-dim cosine + sparse BM25
  ├── KAG → Neo4j graph traversal (entity → statute → precedent paths)
  └── DAG → PostgreSQL/Drizzle dependency ordering (fix priority scheduling)
```

### Qdrant Collections (768-dim, INT8 quantized)

| Collection | Purpose |
|------------|---------|
| `evidence_items` | Evidence chunks + metadata |
| `legal_documents` | Legal document embeddings |
| `legal_cases` | Case embeddings + GPU aggregate vectors |
| `chat_messages` | Chat context search |
| `embedding_cache` | Embedding lookup cache |
| `llm_response_cache` | Semantic response dedup |

---

## Evidence Processing Pipeline (8 Stages + GPU)

```
Upload → Stage 1: MinIO + SHA-256 + PostgreSQL
       → Stage 2: Text extraction (Docling → pdf-parse → OCR)
       → Stage 3: Legal-aware chunking (ARTICLE/SECTION/§)
       → Stage 4: Batch embedding (gRPC → embeddinggemma, 768-dim)
       → Stage 5: Dual storage (pgvector + Qdrant)
       → Stage 6: Analysis (entities + forensics + YOLO/VLM + LangExtract)
       → Stage 7: Summarization + auto-tagging (ACE)
       → Stage 8: Persist to evidence.metadata JSONB
       → Stage 9: GPU background analysis (similarity + clustering + case vector)
```

**File:** `src/routes/api/evidence/upload/+server.ts` (800+ lines)

---

## Agent Orchestration

### ACE Self-Prompting (Agentic Contextual Engineering)

**File:** `src/lib/server/ace/self-prompt.ts`

```
Query → ACE Context Assembly (9 sources, 1900 token budget)
      → LLM Generation (Ollama gemma3-legal)
      → Self-Evaluation (quality, completeness, accuracy)
      → if quality < 0.6 → Correction Prompt → Retry (max 1)
      → Auto-Tag (LangExtract + LLM + forensic flags)
```

ACE context sources: user profile, case context, RAG chunks, KAG graph, chat history, entities, evidence metadata, emotion context, codebase context.

### MCP Server (9 Tools)

**File:** `src/mcp/server.ts`

Tools: `unified_ast_query`, `cross_language_similarity`, `cuda_fix_priority`, `glyph_metadata`, `neo4j_dependency_graph`, `agentic_recommendation`, `batch_error_analysis`, `redis_cache_stats`, `system_health_check`

### Ollama Tool Calling

Ollama v0.3.0+ supports native function/tool calling. The LLM can invoke tools + built-in web search directly.

---

## Inference Fallback Chain

```
Client Router (src/lib/ai/client-router.ts)
  ├── Simple query → LOCAL ONNX (gemma270m via WebGPU/WASM)
  └── Complex query → SERVER
      ├── Inference Router tries TensorRT-LLM (:8099)
      │     └── GPU Arbiter (Redis lease) manages VRAM contention
      └── Fallback → Ollama gemma3-legal (:11434, GPU)
```

**TensorRT endpoints with Ollama fallback:**
- `/api/ai/tensorrt` — text inference (TRT → Ollama)
- `/api/ai/tensorrt/stream` — SSE streaming (TRT → Ollama SSE)
- `/api/ai/tensorrt/vlm` — vision-language (Triton → Ollama multimodal)

---

## Svelte 5 Runes Patterns

```typescript
// State
let count = $state(0);

// Derived (simple)
let doubled = $derived(count * 2);

// Derived (complex — use $derived.by for blocks)
let filtered = $derived.by(() => { /* logic */ return result; });

// Props
let { value, onChange }: Props = $props();

// Shared stores: class-based $state in .svelte.ts files
class UserStore {
  user = $state<User | null>(null);
  isAuthenticated = $derived(this.user !== null);
}
export const userStore = new UserStore();
```

### Bits UI v2.16.2 (Fully Compatible)

```svelte
<Dialog.Root bind:open={isOpen}>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

Key v2 patterns: `child` snippet (not `asChild`), `ref` (not `el`), `forceMount` + snippet for transitions, `type="multiple"` (not `multiple={true}`).

---

## Key Metrics

| Metric | Value |
|--------|-------|
| svelte-check errors | **0** |
| svelte-check warnings | **0** |
| Playwright routes | **20/20** |
| API endpoints | **248** |
| App pages | **80** |
| Qdrant collections | **9** |
| RabbitMQ queues | **7** (all with consumers) |
| CUDA verified | **RTX 3060 Ti, 3 functions working** |
| WebGPU kernels | **14 WGSL shaders** |

---

## References

- [YOLO_EVIDENCE_PIPELINE.md](../../YOLO_EVIDENCE_PIPELINE.md) — Full 8-stage evidence pipeline wiring map
- [INFERENCE_ARCHITECTURE.md](../../INFERENCE_ARCHITECTURE.md) — Comprehensive inference analysis
- [CLAUDE.md](../../CLAUDE.md) — Project conventions and patterns
