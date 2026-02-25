# Pipeline Status — Cache Components + Endpoints + Agent Architecture

**Last Updated:** February 24, 2026 (Session 93r17)

---

## Frontend Cache Components — Full Audit

### Cache Tier Architecture
```
L0: LokiJS         (client, 5-10min TTL, session-scoped)
L1: IndexedDB       (client, 7-day TTL, persistent, CHR-ROM97 cartridges)
L2: Memory Cache    (server, 5min TTL, in-process Map)
L3: Redis           (server, configurable TTL, cross-request, pub/sub sync)
L4: Service Logic   (DB/Qdrant/Ollama) → write back L0-L3
```

### Core Cache Pipeline (ACTIVE — wired into production)
| File | Lines | Tier | Importers | Purpose |
|------|-------|------|-----------|---------|
| `lib/ai/client-cache.ts` | 354 | L0+L1 | 3 | **PRIMARY** — LokiJS + IndexedDB for AI replies/embeddings/chat/cartridges |
| `lib/cache/cache-service.svelte.ts` | 280 | L0+L1 | 3 | Unified cache service coordinating Loki + IDB. Svelte 5 runes |
| `lib/cache/loki-cache.svelte.ts` | 357 | L0 | 1 | LokiJS session cache, 5min TTL, MongoDB-like queries. Svelte 5 |
| `lib/cache/indexdb-cache.svelte.ts` | 195 | L1 | 1 | IndexedDB persistent, 7-day TTL, idb-keyval wrapper. Svelte 5 |
| `lib/cache/cache-invalidation.ts` | 188 | Utility | 2 | Cache key patterns + invalidation for cases/users/search |
| `lib/cache/chr-rom-pattern-cache.ts` | 574 | L1+L3 | 1 | CHR-ROM 8-bank NES pattern cache with Redis L2 |
| `lib/cache/offline-fetch.ts` | 184 | Offline | 1 | Offline-first fetch wrapper with pending mutation queue |
| `lib/cache/headless-ui-cache.ts` | 427 | L0-L3 | 2 | Semantic cache with server sync, LRU eviction |
| `lib/cache/nes-cache-orchestrator.ts` | 39 | L0 | 1 | Minimal TTL Map cache |
| `lib/api/services/cache-service.ts` | 242 | L2+L3 | varies | **SERVER** Redis cache with gzip compression |

### Cache Orchestration (ACTIVE — wired but complex)
| File | Lines | Tier | Importers | Purpose |
|------|-------|------|-----------|---------|
| `lib/cache/parallel-cache-orchestrator.ts` | 713 | All | 2 | Parallel L1-L4 + GPU/XState/CHR-ROM/RAG. Circuit breaker |
| `lib/cache/xstate-cache-integration.ts` | 478 | XState | 2 | XState v5 cache actor with guards/actions for FSM |
| `lib/cache/loki-redis-integration.ts` | 886 | L0+L3 | 1 | Server-only Loki+Redis hybrid with pub/sub sync |
| `lib/cache/glyph-shader-cache-bridge.ts` | 405 | GPU | 1 | WebGPU glyph shader cache with CHR-ROM patterns |
| `lib/ai/unified-cache-enhanced-orchestrator.ts` | 177 | L0 | 1 | AI inference orchestrator with 5min TTL Map |

### Cache Files — ORPHANED (0 importers)
| File | Lines | Tier | Notes |
|------|-------|------|-------|
| `lib/cache/MultiLayerCacheSystem.ts` | 475 | All | Complex LRU/LFU/FIFO eviction. Superseded by parallel-cache-orchestrator |
| `lib/cache/multi-layer-cache.ts` | 283 | Themed | Console-themed (NES/SNES/N64) memory tiers. Design experiment |
| `lib/cache/semantic-cache.ts` | 245 | Semantic | Cosine similarity 0.8 threshold. Has syntax errors |
| `lib/cache/stack-cache.ts` | 73 | L2+L3 | Simple Redis+memory dual. Legacy |

### Cache Files — CORRUPTED
| File | Lines | Issue |
|------|-------|-------|
| `lib/cache/ssr-legal-api-cache.ts` | 145 | Truncated mid-function (file ends abruptly) |
| `lib/cache/semantic-cache.ts` | 245 | Syntax errors at line 187 (`$1?.$2`) |

### Cache Svelte Components
| Component | Lines | Route | Status |
|-----------|-------|-------|--------|
| `components/ai/CachePerformanceDashboard.svelte` | 870 | /admin/dev-tools | WIRED (Cache tab) |
| `components/cache/CacheDemo.svelte` | 602 | /demos/cache, /admin/dev-tools | WIRED |
| `components/cache/CacheMonitor.svelte` | 335 | /cache-demo, /admin/dev-tools | WIRED |
| `components/cache/OfflineIndicator.svelte` | 66 | **(app) layout** | **WIRED (Session 93r17)** |
| `components/dashboard/CachePerformanceMonitor.svelte` | 70 | — | ORPHANED (stub, TODO) |
| `components/ui/gaming/demo/GPUCacheIntegrationDemo.svelte` | 150 | /demos/gpu-cache | WIRED (mock data) |
| `components/ui/gaming/n64/N64TextureFilteringCache.svelte` | 72 | — | ORPHANED |
| `components/ai/webgpu/CacheOptimizerDemo.svelte` | 17 | — | DEAD (placeholder) |

### Cache Component Consumers (use cache but aren't cache-focused)
| Consumer | Cache File Used | Purpose |
|----------|----------------|---------|
| `ChatSession.svelte.ts` | client-cache.ts | AI reply + embedding caching |
| `Gemma270MWebAssembly.svelte` | client-cache.ts | ONNX embedding caching |
| `RichTextEditor.svelte` | loki-redis-integration.ts | Draft auto-save |
| `CacheMonitor.svelte` | cache-service + cache-invalidation | Health monitoring |
| `CacheDemo.svelte` | /api/cache endpoint | Interactive testing |

---

## API Endpoint Status

### Working Endpoints (13 — created this session + prior)
| Endpoint | Method | Callers | Status |
|----------|--------|---------|--------|
| `/api/ai/stats` | GET | ai-dashboard | WORKING |
| `/api/ai/models` | GET | ai-dashboard | WORKING (proxies Ollama /api/tags) |
| `/api/ai/yorha/context-chat` | POST | terminal | WORKING |
| `/api/ai/chat` | POST | 6 components | CREATED — Ollama gemma3-legal JSON |
| `/api/chat` | POST | dev-tools, SimpleWorkingChat | CREATED |
| `/api/v1/evidence/analyze` | POST | evidence, EvidenceCanvas | CREATED |
| `/api/agents/chat` | POST | AgentChat | CREATED |
| `/api/ai/feedback` | POST | AIChatWidget | CREATED |
| `/api/ai/case-prediction` | POST | CaseOutcomePrediction | CREATED |
| `/api/ai/case-scoring` | POST | CaseScoringDashboard | CREATED |
| `/api/tags` | GET | TagSelector | CREATED |
| `/api/internal/error-brain/status` | GET | error-brain | CREATED |
| `/api/internal/error-brain/runs` | GET/POST | error-brain | CREATED |

---

## Inference Pipeline Architecture

```
                    PRIMARY                 FALLBACK
                    ───────                 ────────
Client (Browser):   ONNX gemma-270m        —
                    WebGPU → WASM → CPU

Server (SvelteKit): TRT-LLM :8099          Ollama :11434
                    gemma3-legal INT4        gemma3-legal Q4_K_M
                    Dynamic batching         Single request
                    2-4x faster              Reliable fallback

Embeddings:         embeddinggemma:latest (768-dim, Ollama primary)
                    ONNX embeddinggemma_300m (client fallback)

Document Parse:     langextract :8095 (running)
                    docling-258m (planned, CrewAI sidecar)

Vision:             YOLO object detection → Ollama VLM
```

### RAG + KAG + DAG Pipeline
```
User Query
  │
  ├─ Client Router (client-router.ts)
  │   ├─ Simple → LOCAL ONNX (gemma270m via WebGPU/WASM)
  │   └─ Complex → SERVER Ollama (gemma3-legal via SSE)
  │
  ├─ Embedding (768-dim)
  │   ├─ Client: ONNX embeddinggemma_300m (cached in IndexedDB)
  │   └─ Server: embeddinggemma:latest via Ollama
  │
  ├─ RAG Search (Qdrant + pgvector)
  │   ├─ /api/rag/search (simple, 2 routes)
  │   └─ /api/evidence/search (full RAG+KAG+DAG)
  │
  ├─ KAG Graph (1-hop traversal)
  │   └─ graph-context.ts → yorha_evidence_connections table
  │
  ├─ GPU Reranking (optional, /global-search)
  │   └─ gpu-search-reranker.ts → WebGPU cosine similarity
  │
  ├─ Multi-turn Memory (last 10 messages)
  │   └─ chatMessages PostgreSQL table
  │
  ├─ Citation Extraction
  │   └─ [Source N] regex → mapped to RAG source documents
  │
  └─ ACE Context Bubble (per-response metadata)
      └─ ACEContextBubble.svelte → shows confidence/source/RAG/KAG/citations
```

### Vector + Knowledge Base
```
embeddinggemma:latest (768-dim)
  → Qdrant (6 collections, ANN, auto-tags, cosine ranked)
  → pgvector (mirror, cross-validation)
  → Redis (embedding cache, 24h TTL)
```

### Multi-Agent Architecture (Planned)
```
CrewAI Sidecar :8096 (Python)
  ├── Document Analyst    (langextract + docling-258m)
  ├── Legal Researcher    (Qdrant + pgvector + statutes)
  ├── Evidence Evaluator  (connections + NER + scoring)
  ├── Legal Writer        (gemma3-legal via TRT-LLM)
  └── QA Reviewer         (citation verify + hallucination check)
```

---

## Progress Tracker

### Completed
- [x] Audit broken endpoints (27 refs, 13 unique)
- [x] Create /api/ai/chat endpoint (Ollama proxy)
- [x] Create /api/chat endpoint (message + messages[])
- [x] Create /api/v1/evidence/analyze endpoint
- [x] Create /api/agents/chat endpoint
- [x] Create /api/ai/feedback endpoint
- [x] Create /api/ai/case-prediction endpoint
- [x] Create /api/ai/case-scoring endpoint
- [x] Create /api/internal/error-brain/status endpoint
- [x] Create /api/internal/error-brain/runs endpoint
- [x] Create /api/tags endpoint
- [x] Wire OfflineIndicator → root layout
- [x] Audit all frontend cache components (21 files + 8 components)
- [x] Create ACEContextBubble.svelte (pipeline metadata display)
- [x] Wire ACEContextBubble into ai-dashboard
- [x] Archive 42 dead files to deeds_labs/

### Completed (Session 93r17 Continued)
- [x] Archive 7 corrupted/orphaned cache files (semantic-cache, ssr-legal-api-cache, MultiLayerCacheSystem, multi-layer-cache, stack-cache, CachePerformanceMonitor, Enhanced3DEvidenceBoard)
- [x] Archive 9 "page-repair" stubs (WebGPUProcessor, WebGPUWebAssemblyBridge, NeuralPerformanceDashboard, WebGPUVisualization, BriefEditor, CaseAutomation, CaseManager, CaseManagerXState, SimpleCaseManager)
- [x] Remove empty ai/webgpu/ and ai/cognitive/ directories
- [x] Verify all 4 production cache components wired (CachePerformanceDashboard, CacheDemo, CacheMonitor, OfflineIndicator)
- [x] Deep orphan audit: 87 orphaned components (45 wire-ready, 34 need fixes, 8 archived)

### Remaining
- [ ] Wire offline-fetch.ts into client-router.ts
- [ ] Restart TRT-LLM containers
- [ ] Scaffold CrewAI Python sidecar
- [ ] Add docling-258m to sidecar
- [ ] Qdrant auto-tagging pipeline

### GPU Dev Metrics Page (Planned)
- [ ] WebGPU Compute Status: DeedsGPUCompute pipeline (shaders, buffers, dispatches)
- [ ] ONNX Inference Monitor: Model load time, latency, token/s, backend
- [ ] Triton/TRT-LLM Panel: Port 8099 health, batch depth, INT4 throughput
- [ ] LLM Eval Dashboard: Response quality metrics, hallucination rate, citation accuracy
- [ ] Admin Testing: One-click benchmarks, A/B model comparison, GPU memory profiling

---

## File Inventory Summary

| Category | Count | Total Lines |
|----------|-------|-------------|
| Active cache .ts files | 11 | ~4,100 |
| Cache Svelte components (wired) | 4 | ~2,023 |
| Archived cache files | 7 | ~1,466 |
| Archived stub components | 9 | ~145 |
| Archived evidence component | 1 | ~198 |
| **Total active cache system** | **15** | **~6,123** |

## Component Orphan Summary (Session 93r17 Audit)

| Status | Count | Action |
|--------|-------|--------|
| Wire-ready (clean Svelte 5) | 45 | Wire to routes in future sessions |
| Needs corruption fix first | 34 | Restore from backup or rewrite |
| Archived (stubs/dead) | 17 | Moved to deeds_labs/ |
| **Total orphaned** | **87** | 47% of 185 components |
