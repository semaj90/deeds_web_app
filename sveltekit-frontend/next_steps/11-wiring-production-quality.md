# Production Readiness: VLM/Triton Deployment Pipeline

## Created: March 12, 2026
## Goal: Align all remaining work toward VLM TRT-LLM Triton deployment

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND (SvelteKit SSR + Client)                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Analytics │  │ Embedding│  │ Recommend │  │ Context  │           │
│  │ Worker   │  │ Worker   │  │ Worker   │  │ Chat Wkr │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │              │              │              │                │
│       ▼              ▼              ▼              ▼                │
│  /api/analytics  /api/embed   /api/recommend  /api/ai/contextual   │
├─────────────────────────────────────────────────────────────────────┤
│  SERVER (SvelteKit + Docker Services)                              │
│  ┌────────┐ ┌──────┐ ┌──────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │
│  │Postgres│ │Redis │ │Qdrant│ │RabbitMQ│ │CouchDB │ │Langfuse  │ │
│  │(Drizzle)│ │(cache)│ │(INT8)│ │(7 q's) │ │(docs)  │ │(LLM obs)│ │
│  └────────┘ └──────┘ └──────┘ └────────┘ └────┬───┘ └─────┬────┘ │
│                                                │           │       │
│  ┌─────────────────────────────────────────────┼───────────┼──┐    │
│  │  TRITON INFERENCE SERVER (:8099)            │           │  │    │
│  │  ┌────────────┐  ┌──────────┐  ┌─────────┐ │  ┌────────┴┐│    │
│  │  │Gemma3 12B  │  │ SigLIP   │  │Projector│ │  │ClickHouse││    │
│  │  │INT4 TRT    │  │ FP16 ONNX│  │ ONNX    │ │  │(traces) ││    │
│  │  │(persistent)│  │(on-demand)│  │(50MB)   │ │  └─────────┘│    │
│  │  └────────────┘  └──────────┘  └─────────┘ │             │    │
│  └─────────────────────────────────────────────┘             │    │
└──────────────────────────────────────────────────────────────┘    │
```

---

## Phase A: App Consolidation (Prerequisites)

Everything below must be solid BEFORE Triton goes live — inference routes
need validation, auth, and correct service URLs to work in production.

### A1. Zod Validation (118/258 → 258/258)

**Current**: 46% coverage. **140 routes remaining.**

| Batch | Routes | Category |
|-------|--------|----------|
| 11 | ~15 | AI/LLM routes (chat, ask, summarize, judge, cross-exam) |
| 12 | ~12 | Case management (update, notes, similar, connections) |
| 13 | ~8 | Evidence routes (search, analysis, chain-of-custody) |
| 14 | ~8 | Codebase-index routes (reindex, graph, clusters, stats) |
| 15 | ~10 | Phase89/error-brain (analyze, fix, pipeline) |
| 16 | ~10 | Health/metrics/system/admin GET routes |
| 17 | ~8 | Remaining (tags, glossary, pipeline, worker triggers) |

**Pattern** (same as Batches 1-10):
```typescript
const schema = z.object({ query: z.string().min(1).max(10000), ... });
const parsed = schema.safeParse(await request.json());
if (!parsed.success) return json({ error: parsed.error.issues[0]?.message }, { status: 400 });
```

### A2. Auth Guards (~228 unguarded routes)

Centralize in `hooks.server.ts` with route prefix matching:
```typescript
const AUTH_REQUIRED = ['/api/cases', '/api/evidence', '/api/citations',
  '/api/chat', '/api/ai', '/api/reports', '/api/persons', '/api/recommendations'];
const ADMIN_ONLY = ['/api/admin', '/api/codebase-index', '/api/phase89', '/api/error-brain'];
const PUBLIC = ['/api/health', '/api/auth', '/api/metrics', '/api/system'];
```

### A3. Hardcoded localhost → ENV (29 routes)

| Service | Hardcoded | ENV var | Files |
|---------|-----------|---------|-------|
| Ollama | `localhost:11434` | `ENV.OLLAMA_BASE_URL` | ~12 |
| Qdrant | `localhost:6333` | `ENV.QDRANT_URL` | ~4 |
| Triton | `localhost:8099` | `ENV.TRITON_URL` | ~3 |
| Go gRPC | `localhost:50051` | `ENV.GRPC_URL` | ~3 |
| MinIO | `localhost:9000` | `ENV.MINIO_ENDPOINT` | ~2 |
| CouchDB | `localhost:5984` | `ENV.COUCHDB_URL` | ~2 |
| SIMD | `localhost:8095` | `ENV.SIMD_URL` | ~2 |
| Redis | `localhost:6379` | `ENV.REDIS_URL` | ~1 |

**Critical for Triton**: When Triton runs in Docker, `localhost:8099` won't resolve
from inside the SvelteKit container. Must use `ENV.TRITON_URL` everywhere.

---

## Phase B: 4 Web Workers → Analytics → Recommendations → AI Chat

### Current Worker State

| Worker | Status | Purpose |
|--------|--------|---------|
| `embedding-worker-enhanced.ts` | ACTIVE | ONNX 768-dim embeddings (client-side) |
| `queue-worker.ts` | ACTIVE | RabbitMQ queue registry init |
| `gpu-tensor-worker.ts` | TYPE-ONLY | Multi-dimensional array types |
| `ai-service-worker.ts` | ORPHAN | Candidate for contextual chat |
| `aiProcessingWorker.js` | ORPHAN | Candidate for analytics batching |
| `error-analysis-worker.ts` | ORPHAN | Candidate for error-brain pipeline |
| `graph-worker.js` | ORPHAN | Candidate for Neo4j graph ops |
| `kmeans-worker.js` | ORPHAN | Candidate for topic clustering |
| `rabbitmq-service-worker.ts` | ORPHAN | RabbitMQ client (browser) |
| `transformersEmbeddingWorker.ts` | ORPHAN | HF Transformers.js (unused) |

### Target: 4 Active Web Workers

```
Worker 1: Analytics Worker (repurpose aiProcessingWorker.js)
  ├─ Tracks page views via $page.url changes
  ├─ Tracks feature clicks (evidence upload, search, chat, report gen)
  ├─ Batches events → POST /api/analytics/events every 30s
  ├─ Fires on beforeunload for session-end flush
  └─ Stores: PostgreSQL user_analytics_events + RabbitMQ analytics.track

Worker 2: Embedding Worker (ALREADY ACTIVE — embedding-worker-enhanced.ts)
  ├─ ONNX Runtime (WebGPU → WASM SIMD → CPU)
  ├─ 768-dim embeddings for client-side similarity
  ├─ Used by client-router.ts for local inference
  └─ Model: static/embeddinggemma_300m_onnx/

Worker 3: Recommendation Worker (repurpose graph-worker.js)
  ├─ Listens for user interactions (view, click, save, share, dismiss)
  ├─ Calls /api/recommendations/track (fire-and-forget)
  ├─ Pre-fetches /api/recommendations for current case context
  ├─ Caches recommendations in IndexedDB (L1 client cache)
  └─ Feeds: UserHistoryTracker → 5-signal multi-modal ranking

Worker 4: Contextual Chat Worker (repurpose ai-service-worker.ts)
  ├─ Manages SSE connection to /api/sse/chat
  ├─ Maintains chat context window (last N messages)
  ├─ Calls /api/ai/contextual-chat for RAG-augmented responses
  ├─ Handles Triton VLM requests when images attached
  └─ Status: contextual-chat.ts is STUB — needs RAG + Ollama wiring
```

### Wiring the Contextual Chat Pipeline

`lib/server/llm/contextual-chat.ts` is currently a **stub** (mock RAG, mock Ollama, no DB persistence).

To wire it:
1. Replace `getContextFromRag()` stub → call `rag-pipeline.ts` `ragSearch()`
2. Replace `callOllamaChat()` stub → call real Ollama via `ENV.OLLAMA_BASE_URL`
3. Wire citations from Qdrant search results (currently hardcoded `[]`)
4. Add chat turn persistence to `ragMessages` table
5. Add Triton VLM path for image+text queries (post Phase E)

### Analytics → Recommendations Feedback Loop

```
User Action → Analytics Worker → /api/analytics/events → PostgreSQL
                                                            ↓
                                              RabbitMQ analytics.track
                                                            ↓
UserHistoryTracker.recordView()  ←── queue consumer ←──────┘
         ↓
getUserTopicPreferences() (7-day decay)
         ↓
Recommendation Worker → /api/recommendations → 5-signal ranker
         ↓
Pre-fetched suggestions in UI (cases, evidence, citations)
```

---

## Phase C: Retrieval Minification & Indexing Consolidation

### C1. Qdrant Collection Consolidation

**Current**: 72 collections, 41 populated, 31 empty.
**INT8 Quantization**: DONE (all 72 collections, ~490MB savings).

**Consolidation targets** (reduce collection sprawl):

| Current Collections | Merge Into | Points |
|--------------------|-----------:|-------:|
| `phase72_error_patterns` + `phase90_error_cards` + `phase94_unified_errors` + `phase96_error_patterns` | `error_embeddings` | ~92K |
| `phase89_code_chunks` + `phase89_code_units` + `codebase_chunks` | `codebase_embeddings` | ~7.4K |
| `phase89_error_chunks` + `phase89_redis_cache_index` + `phase89_cache_index` | `cache_index` | ~32K |
| `knowledge_base` + `phase76_knowledge_base` + `phase79_knowledge_base` | `knowledge_base_unified` | ~2.3K |
| All empty collections (31) | DELETE | 0 |

**Savings**: 72 → ~15 active collections. Simpler search routing, fewer Qdrant segments.

### C2. Web Worker Cleanup

Archive 3 truly unused workers to `deeds_labs/`:
- `transformersEmbeddingWorker.ts` (superseded by ONNX embedding worker)
- `rabbitmq-service-worker.ts` (RabbitMQ is server-side only)
- `error-analysis-worker.ts` (if not repurposed)

Keep `kmeans-worker.js` and `graph-worker.js` for repurposing in Phase B.

### C3. Indexing Pipeline Dedup

Multiple overlapping indexing endpoints exist:
- `/api/indexing` — general document indexing
- `/api/codebase-index` — codebase-specific indexing (5 sub-routes)
- `/api/codebase/index` — duplicate codebase indexer
- `/api/embed` — raw embedding generation

**Consolidate to**:
- `/api/indexing` — unified entry point (routes to appropriate pipeline)
- `/api/embed` — keep as standalone utility

---

## Phase D: LLM Observability (ClickHouse + Langfuse)

### Why Wire Before Triton

Langfuse provides **LLM observability** — essential when running Triton inference:
- Track inference latency per model (text-only vs VLM ensemble)
- Monitor token usage and cost per query
- Compare Ollama vs Triton response quality
- A/B test inference backends with metrics
- Detect model degradation over time

### Current State
- ClickHouse: Running on port 8123, **17.5GB overhead, 50KB actual data**
- Langfuse: Running on port 3100, **never wired**
- Both already in `docker-compose.yml`

### Wiring Steps

1. **Environment vars** in `.env`:
```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=http://localhost:3100
```

2. **Instrument Ollama calls** — wrap `fetch(OLLAMA_BASE_URL)` in a Langfuse trace:
```typescript
import { Langfuse } from 'langfuse';
const langfuse = new Langfuse({ publicKey, secretKey, baseUrl });

const trace = langfuse.trace({ name: 'legal-query', metadata: { caseId } });
const generation = trace.generation({
  name: 'ollama-gemma3',
  model: 'gemma3-legal:latest',
  input: prompt,
  output: response,
  usage: { promptTokens, completionTokens }
});
```

3. **Instrument Triton calls** — same pattern for `/api/ai/tensorrt` and `/api/ai/tensorrt/vlm`

4. **Dashboard**: Langfuse UI at `http://localhost:3100` — latency charts, cost tracking, quality scores

### CouchDB Document Sync

CouchDB is running but only partially wired (attachment storage, no query routes).

**Wire**: Create `/api/documents/sync` route:
- CouchDB → PostgreSQL: Sync document metadata + attachments
- Useful for offline-capable document editing (CouchDB's change feed)
- Low priority — only needed if multi-device sync becomes a requirement

---

## Phase E: VLM TRT-LLM Triton Deployment

**Depends on**: Phase A (localhost→ENV), Phase D (Langfuse observability)

See `next_steps/10-trtllm-triton-deployment.md` and `next_steps/TRT_ENGINE_BUILD_STEPS.md` for full details.

### Pipeline Summary

```
Step 1: Run Colab notebook (Gemma3_12B_INT4_Quantize_and_Export.ipynb)
        → Extracts text-only safetensors + SigLIP ONNX + projector ONNX
        → Saves to Google Drive

Step 2: Download from Drive → tensorrt_build/input/

Step 3: Docker engine build (trtllm-build inside container)
        → INT4 AWQ engine for RTX 3060 Ti (sm_86)

Step 4: Triton deployment (docker-compose.triton.yml)
        → 3-model ensemble: Gemma3 text + SigLIP vision + projector

Step 5: Wire SvelteKit routes
        → /api/ai/tensorrt (text-only, reuse trt-llm.ts client)
        → /api/ai/tensorrt/vlm (image+text, ensemble endpoint)
        → gpu-arbiter.ts manages VRAM (SigLIP on-demand load/unload)

Step 6: Langfuse instrumentation (Phase D)
        → Track Triton latency, token usage, quality metrics
```

### VRAM Budget (RTX 3060 Ti = 8GB)

| Mode | Components | VRAM |
|------|-----------|------|
| Text-only | Gemma3 INT4 + KV cache | ~7.4 GB |
| VLM (time-shared) | SigLIP loads → process → unloads | ~1.5 GB burst |
| Ollama fallback | gemma3-legal Q4_K_M | ~7.3 GB |

---

## Phase F: Production Hardening

### Rate Limiting (Redis-based)
```typescript
const RATE_LIMITS = {
  '/api/ai/tensorrt': { window: 60, max: 10 },  // TRT: 10/min (GPU-bound)
  '/api/ai/': { window: 60, max: 20 },           // AI routes: 20/min
  '/api/chat/': { window: 60, max: 30 },          // Chat: 30/min
  '/api/auth/login': { window: 300, max: 5 },     // Login: 5/5min
  '/api/': { window: 60, max: 100 },              // Default: 100/min
};
```

### Production Checklist

| Item | Status | Action |
|------|--------|--------|
| `DEV_BYPASS_AUTH` | ON in dev | OFF in production `.env` |
| HTTPS | Not configured | Caddy reverse proxy (auto-TLS) |
| CORS | Not configured | Allowed origins in hooks |
| CSP headers | Not set | Content-Security-Policy |
| Error exposure | Dev stack traces | `NODE_ENV=production` |
| Logging | console.log | Pino structured logging → Langfuse |
| Backups | None | pg_dump cron + MinIO versioning |
| Monitoring | Prometheus in docker-compose | Wire SvelteKit + Triton metrics |

---

## Implementation Order

```
Phase A ──────────────────────────────────────────► (2-3 sessions)
  A1. Zod validation (Batches 11-17, ~140 routes)
  A2. Auth guards (hooks.server.ts centralization)
  A3. Hardcoded localhost → ENV (29 files)

Phase B ──────────────────────────────────────────► (2 sessions)
  B1. Analytics Worker (repurpose aiProcessingWorker.js)
  B2. Recommendation Worker (repurpose graph-worker.js)
  B3. Contextual Chat Worker (wire contextual-chat.ts stubs)
  B4. Analytics → Recommendations feedback loop

Phase C ──────────────────────────────────────────► (1 session)
  C1. Qdrant collection consolidation (72 → ~15)
  C2. Worker cleanup (archive 3 orphans)
  C3. Indexing endpoint dedup

Phase D ──────────────────────────────────────────► (1 session)
  D1. Langfuse env vars + SDK install
  D2. Instrument Ollama inference calls
  D3. CouchDB sync route (optional)

Phase E ──────────────────────────────────────────► (2-3 sessions)
  E1. Colab notebook execution (text extraction + ONNX export)
  E2. Download + Docker TRT engine build
  E3. Triton ensemble deployment
  E4. SvelteKit API route wiring
  E5. Langfuse instrumentation for Triton

Phase F ──────────────────────────────────────────► (1 session)
  F1. Rate limiting (Redis)
  F2. Production hardening (HTTPS, CORS, CSP, logging)
  F3. Monitoring dashboard (Prometheus + Grafana)
```

**Total estimated: 9-11 sessions to production-ready VLM deployment**

---

## Quick Reference: What Exists vs What's Needed

| Component | Exists | Needs |
|-----------|--------|-------|
| `/api/analytics/events` | YES (Zod + 14 event types) | Frontend analytics worker to POST events |
| `/api/recommendations` | YES (5-signal ranker, metrics) | Client worker for pre-fetch + tracking |
| `UserHistoryTracker` | YES (7-day decay, 6 interaction types) | Wire to analytics worker events |
| `contextual-chat.ts` | STUB (mock RAG, mock Ollama) | Wire real RAG + Ollama + citations |
| `embedding-worker-enhanced.ts` | ACTIVE (ONNX 768-dim) | None — working |
| `trt-llm.ts` client | YES (OpenAI-compat) | Wire to Triton when deployed |
| `gpu-arbiter.ts` | YES (Redis VRAM lease) | Add SigLIP load/unload |
| Langfuse | RUNNING (port 3100) | Wire SDK + instrument calls |
| ClickHouse | RUNNING (port 8123) | Langfuse backend (already configured) |
| Qdrant INT8 | DONE (all 72 collections) | Collection consolidation (72→15) |
| Zod validation | 118/258 (46%) | 140 more routes |
| Auth guards | ~30/258 routes | Centralize in hooks |
| Rate limiting | None | Redis INCR/EXPIRE |
