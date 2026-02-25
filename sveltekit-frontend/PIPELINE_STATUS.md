# Pipeline Status — Broken Endpoints + Cache Components + Agent Architecture

**Last Updated:** February 24, 2026 (Session 93r15)

---

## Broken API Endpoint Audit (27 references, 13 unique endpoints)

### Already Working (3)
| Endpoint | Callers | Status |
|----------|---------|--------|
| `/api/ai/stats` | ai-dashboard/+page.svelte:106 | WORKING |
| `/api/ai/models` | ai-dashboard/+page.svelte:107 | WORKING (proxies Ollama /api/tags) |
| `/api/ai/yorha/context-chat` | terminal/+page.svelte:53 | WORKING |

### Clear Rewire Targets (4 endpoints, 12 references)
| Broken Endpoint | Rewire To | Callers | Status |
|-----------------|-----------|---------|--------|
| `/api/ai/chat` | `/api/sse/chat` | AIChatWidget:21, AIToolbar:92, Enhanced3DLegalAIInterface:342, EnhancedAIChat:46, GamingAIInterface:13, IntegratedAIChat:19+37 | TODO |
| `/api/chat` | `/api/chat/stream` | dev-tools/+page.svelte:53, SimpleWorkingChat:29+57 | TODO |
| `/api/v1/evidence/analyze` | `/api/evidence/analysis` | evidence/analyze/+page.svelte:106, EnhancedEvidenceBoard:40+113, EvidenceCanvas:58 | TODO |
| `/api/agents/chat` | `/api/sse/chat` | AgentChat.svelte:29 | TODO |

### Missing Endpoints — Need Creation (6 endpoints, 9 references)
| Missing Endpoint | Callers | Plan |
|------------------|---------|------|
| `/api/ai/feedback` | AIChatWidget:37 | CREATE: Store feedback in chatMessages table |
| `/api/ai/case-prediction` | CaseOutcomePrediction:114 | CREATE: Ollama gemma3-legal prediction prompt |
| `/api/ai/case-scoring` | CaseScoringDashboard:124 | CREATE: Evidence-weighted case scoring |
| `/api/internal/error-brain/status` | error-brain/+page.svelte:28 | CREATE: Aggregate error stats from phase72_error |
| `/api/internal/error-brain/runs` | error-brain/+page.svelte:41+52, runs/+page.svelte:15+28 | CREATE: Error analysis run history |
| `/api/tags` | TagSelector:60 | CREATE: CRUD for evidence/case tags |

---

## Frontend Cache Components (21 files, 6,346L + 5 Svelte components, 1,942L)

### Core Cache Pipeline (ACTIVE)
| File | Lines | Purpose | Wired? |
|------|-------|---------|--------|
| `lib/ai/client-cache.ts` | 354 | LokiJS + IndexedDB dual-tier | YES — ChatSession.svelte.ts |
| `lib/cache/loki-cache.svelte.ts` | 356 | LokiJS with Svelte 5 runes | YES — client-cache.ts |
| `lib/cache/indexdb-cache.svelte.ts` | 194 | IndexedDB with Svelte 5 runes | YES — client-cache.ts |
| `lib/cache/semantic-cache.ts` | 244 | Embedding-based cache (cosine) | PARTIAL — imported but not called |
| `lib/cache/cache-invalidation.ts` | 187 | TTL + pattern invalidation | YES — RabbitMQ consumer |
| `lib/cache/offline-fetch.ts` | 183 | Offline-first fetch wrapper | NOT WIRED |
| `lib/cache/ssr-legal-api-cache.ts` | 144 | SSR response cache | NOT WIRED |

### Cache Infrastructure (REFERENCE)
| File | Lines | Purpose | Wired? |
|------|-------|---------|--------|
| `lib/cache/multi-layer-cache.ts` | 282 | L0-L3 cache chain | NOT WIRED |
| `lib/cache/MultiLayerCacheSystem.ts` | 474 | L0-L4 with Redis | NOT WIRED |
| `lib/cache/parallel-cache-orchestrator.ts` | 712 | Parallel multi-layer | NOT WIRED |
| `lib/cache/loki-redis-integration.ts` | 885 | LokiJS ↔ Redis sync | NOT WIRED |
| `lib/cache/xstate-cache-integration.ts` | 477 | XState cache FSM | NOT WIRED |
| `lib/cache/chr-rom-pattern-cache.ts` | 573 | CH-ROM97 pattern cache | YES — memory-palace |
| `lib/cache/headless-ui-cache.ts` | 426 | UI component cache | NOT WIRED |
| `lib/cache/glyph-shader-cache-bridge.ts` | 404 | Glyph/shader bridge | NOT WIRED |
| `lib/ai/unified-cache-enhanced-orchestrator.ts` | 177 | Unified orchestrator | NOT WIRED |

### Cache Svelte Components (ALL UNWIRED)
| Component | Lines | Best Route Target |
|-----------|-------|-------------------|
| `CachePerformanceDashboard.svelte` | 870 | /admin/dev-tools |
| `CacheDemo.svelte` | 602 | /admin/dev-tools |
| `CacheMonitor.svelte` | 335 | /admin/dev-tools |
| `CachePerformanceMonitor.svelte` | 70 | /dashboard |
| `OfflineIndicator.svelte` | 65 | Root layout |

---

## Inference Pipeline Architecture (Target)

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

### Cache Hierarchy
```
L0: LokiJS         (client, 5-10min TTL, session-scoped)
L1: IndexedDB       (client, 7-day TTL, persistent, CHR-ROM97)
L2: Memory Cache    (server, 5min TTL, in-process Map)
L3: Redis           (server, configurable TTL, cross-request)
L4: Service Logic   (DB/Qdrant/Ollama) → write back L0-L3
```

### Vector + Knowledge Base
```
embeddinggemma:latest (768-dim)
  → Qdrant (6 collections, ANN, auto-tags, cosine ranked)
  → pgvector (mirror, cross-validation)
  → Redis (embedding cache, 24h TTL)
  → CouchDB (future: document versioning, audit trail)
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

- [x] Audit broken endpoints (27 refs, 13 unique)
- [ ] Rewire /api/ai/chat → /api/sse/chat (7 components)
- [ ] Rewire /api/chat → /api/chat/stream (3 refs)
- [ ] Rewire /api/v1/evidence/analyze → /api/evidence/analysis (4 refs)
- [ ] Rewire /api/agents/chat → /api/sse/chat (1 ref)
- [ ] Create /api/ai/feedback endpoint
- [ ] Create /api/ai/case-prediction endpoint
- [ ] Create /api/ai/case-scoring endpoint
- [ ] Create /api/internal/error-brain/status endpoint
- [ ] Create /api/internal/error-brain/runs endpoint
- [ ] Create /api/tags endpoint
- [ ] Wire CacheMonitor → /admin/dev-tools
- [ ] Wire CachePerformanceDashboard → /admin/dev-tools
- [ ] Wire OfflineIndicator → root layout
- [ ] Wire semantic-cache.ts into RAG search pipeline
- [ ] Wire offline-fetch.ts into client-router.ts
- [ ] Restart TRT-LLM containers
- [ ] Scaffold CrewAI Python sidecar
- [ ] Add docling-258m to sidecar
- [ ] Qdrant auto-tagging pipeline