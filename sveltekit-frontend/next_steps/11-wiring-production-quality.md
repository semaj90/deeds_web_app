# Production Readiness: VLM/Triton Deployment Pipeline

## Created: March 12, 2026
## Goal: Align all remaining work toward VLM TRT-LLM Triton deployment

---

## March 22, 2026 Follow-Up Audit

- **Type review still worth scheduling**: do a focused Drizzle ORM 0.44 + Svelte 5 runes type review after current wiring cleanup. The main value is catching contract drift between route payloads, `$props()` shapes, and `.$inferSelect`/`.$inferInsert` usage.
- **Validation backlog remains material**: approximately 118 of 258 API routes still lack Zod validation.
- **Services visibility remains incomplete**: `src/lib/services/**` blanket exclusion still hides roughly 312 corrupted files from normal discovery, even though transitively imported clean files are checked.
- **Hardcoded localhost: RESOLVED** — **0 remaining**. All service URLs now go through `env.server.ts` getters (`ENV.OLLAMA_BASE_URL`, `ENV.QDRANT_URL`, `ENV.TRITON_URL`, etc.).
- **Audit standard tightened**: "fully wired" now means import → render → reachable trigger path → API route → props → data flow. Route existence alone is insufficient.
- **Pre-push directory audit should be explicit**: run `/shallow-wiring-analysis`, `/audit-components`, `/prune-codebase`, and `/wire-modules` against the low-reference directories in `src/lib/` plus `src/routes/api/search` before pushing consolidation work.
- **Verified keepers from the low-reference sweep**: `src/lib/shims/*` remains required browser-compatibility surface, and `src/lib/messaging/rabbitmq-xstate-integration.ts` is live via `src/hooks.server.ts`; neither should be treated as archive candidates.
- **Verified relocation candidate**: `src/lib/phase72/routeGraphAdapter.ts` is live from `(app)/admin/all-routes/+page.server.ts`, but it should move to a non-phase diagnostics namespace during directory consolidation.
- **Search wiring still needs a product decision**: the `/api/search/*` routes are now the typed Drizzle-backed search surface, but `(app)/global-search/+page.svelte` still bypasses them with direct fetches to `/api/statutes/search`, `/api/precedents/search`, and `/api/glossary/search` while also carrying an unused `search-client.ts` import path.
- **Agentic tool calling WIRED**: 4 agent systems now operational — Agent Chat (4 Ollama tools), Autonomous Agent (15 LangChain tools), Contextual Chat (3 Ollama tools), MCP Server (36 FastMCP tools).
- **Contextual chat fully wired**: `/api/contextual/chat` now has real Ollama native tool calling (glossary_search, rag_search, web_search) with iterative loop, HMM state tracking, Redis session history.
- **QUIC/gRPC/HTTP3 transport wired**: quic-nats-bridge with legal.embedding.request → gRPC proxy, Go gRPC embedding server (:50051), LibTorch/CUDA N-API addon verified.
- **Inference architecture verified**: client-router.ts, web-search-searxng.ts, autonomous-agent.ts all confirmed WIRED (not orphaned as previously reported).

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

## Phase A: App Consolidation (Prerequisites) — A3 ✅ COMPLETE

Everything below must be solid BEFORE Triton goes live — inference routes
need validation, auth, and correct service URLs to work in production.
**A3 (localhost→ENV) is fully complete** — 0 hardcoded service URLs remaining.

### A1. Zod Validation (208/351 — all request.json() routes validated)

**Current**: 59% coverage (208/351). **All `request.json()` body-parsing routes now have Zod.** ~143 remaining are GET-only with no/trivial params.
**Sprint 5**: `/api/onboarding` PATCH, `/api/search` GET, `/api/library/search` GET.
**Sprint 6**: `/api/ai/stats`, `/api/ai/models` (Ollama response validation), `/api/cases` GET, `/api/evidence` GET, `/api/evidence/entities` GET, `/api/phase89/search` POST, `/api/citations` GET, `/api/persons` GET, `/api/persons-of-interest` GET, `/api/reports` GET (query params).

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

### A2. Auth Guards — ✅ ALREADY COMPLETE

**Status**: Deny-by-default centralized auth in `hooks.server.ts` lines 397-462.
- **319 total routes**: 317 properly protected (99.4%)
- **8 PUBLIC patterns**: `/api/health`, `/api/auth`, `/api/metrics`, `/api/ping`, `/api/infrastructure`, `/api/docs`, `/api/glossary`, `/api/statutes`
- **21 ADMIN_ONLY patterns**: `/api/admin`, `/api/codebase-index`, `/api/phase89`, `/api/error-brain`, `/api/gpu`, `/api/system`, `/api/ollama`, etc.
- **All others**: Deny-by-default → 401 if no `locals.user`
- **Additional**: 107 routes have redundant explicit `requireAuth()` for defense-in-depth

### A3. Hardcoded localhost → ENV ~~(29 routes)~~ ✅ COMPLETE

**Status: 0 remaining** — All service URLs now use `env.server.ts` getters.

| Service | ENV var | Status |
|---------|---------|--------|
| Ollama | `ENV.OLLAMA_BASE_URL` | ✅ All migrated |
| Qdrant | `ENV.QDRANT_URL` | ✅ All migrated |
| Triton | `ENV.TRITON_URL` | ✅ All migrated |
| Go gRPC | `ENV.GRPC_URL` | ✅ All migrated |
| MinIO | `ENV.MINIO_ENDPOINT` | ✅ All migrated |
| CouchDB | `ENV.COUCHDB_URL` | ✅ All migrated |
| SIMD | `ENV.SIMD_URL` | ✅ All migrated |
| Redis | `ENV.REDIS_URL` | ✅ All migrated |

---

## Phase B: 4 Web Workers → Analytics → Recommendations → AI Chat

### Current Worker State

| Worker | Status | Purpose |
|--------|--------|---------|
| `embedding-worker-enhanced.ts` | ✅ ACTIVE | ONNX 768-dim embeddings (client-side) |
| `queue-worker.ts` | ✅ ACTIVE | RabbitMQ queue registry init |
| `gpu-tensor-worker.ts` | TYPE-ONLY | Multi-dimensional array types |
| `ai-service-worker.ts` | ✅ WIRED (server-side) | Contextual chat backend fully wired (Ollama tools + HMM + Redis) |
| `aiProcessingWorker.js` | ORPHAN | Candidate for analytics batching |
| `error-analysis-worker.ts` | ORPHAN | Candidate for error-brain pipeline |
| `graph-worker.js` | ORPHAN | Candidate for Neo4j graph ops |
| `kmeans-worker.js` | ORPHAN | Candidate for topic clustering |
| `rabbitmq-service-worker.ts` | ORPHAN | RabbitMQ client (browser) — server-only, archive candidate |
| `transformersEmbeddingWorker.ts` | ORPHAN | HF Transformers.js — superseded by ONNX worker, archive candidate |

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
  ├─ Calls /api/contextual/chat for tool-augmented responses
  ├─ Handles Triton VLM requests when images attached
  └─ Status: ✅ WIRED — Ollama native tool calling (3 tools) + HMM state tracking + Redis sessions
```

### Wiring the Contextual Chat Pipeline — ✅ COMPLETE

~~`lib/server/llm/contextual-chat.ts` is currently a **stub**~~ — Contextual chat is now fully wired:

- ✅ `/api/contextual/chat` — Ollama native tool calling (glossary_search, rag_search, web_search)
- ✅ `/api/contextual/state` — GET/DELETE HMM state from Redis
- ✅ `/api/contextual/predictions` — Next-step predictions based on HMM state
- ✅ `/api/contextual/stats` — Session statistics (turns, confidence, transitions)
- ✅ Redis session history (last 20 messages, 1hr TTL)
- ✅ HMM 8-state model (Greeting→Case Inquiry→Document Analysis→Legal Research→Risk Assessment→Recommendation→Follow-up→Conclusion)
- ✅ Entity extraction (CASE_NUMBER, DATE, STATUTE, MONEY patterns)
- Remaining: Triton VLM path for image+text queries (post Phase E)

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

**MANDATORY**: Before archiving ANY worker, run the `/audit-components` G0 gate (transitive dependency chain check). Verify the worker is not imported by any active file. See `.claude/commands/audit-components.md` §1b and `.claude/commands/prune-codebase.md` §5n for the full protocol.

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
- Langfuse: Running on port 3100, **partially wired**
  - ✅ `observability/langfuse.ts` exists with `traceEmbedding()` wrapper
  - ✅ Imported by 5 server files (batch-embedder, ollama-client, multimodal-fusion, embeddings-simple, ollama.ts)
  - Remaining: wire env vars, instrument LLM chat calls (not just embeddings), Triton calls
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

### Rate Limiting — ✅ DONE (In-memory per-route, Sprint 5)

Implemented in `hooks.server.ts` with per-route tier matching:
```typescript
const RATE_TIERS = [
  { prefix: '/api/auth/login', window: 300_000, max: 10 },     // Auth brute-force: 10/5min
  { prefix: '/api/auth/register', window: 300_000, max: 5 },   // Register: 5/5min
  { prefix: '/api/ai/tensorrt', window: 60_000, max: 10 },     // TRT: 10/min (GPU-bound)
  { prefix: '/api/gpu/', window: 60_000, max: 15 },            // GPU: 15/min
  { prefix: '/api/ai/', window: 60_000, max: 30 },             // AI: 30/min
  { prefix: '/api/rag/', window: 60_000, max: 30 },            // RAG: 30/min
  { prefix: '/api/chat/', window: 60_000, max: 40 },           // Chat: 40/min
  { prefix: '/api/', window: 60_000, max: 60, methods: ['POST','PUT','PATCH','DELETE'] }, // Default writes: 60/min
];
```
Returns 429 with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` headers.
**Future**: Upgrade to Redis-backed for multi-instance deployments.

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
  A3. Hardcoded localhost → ENV ✅ COMPLETE (0 remaining)

Phase B ──────────────────────────────────────────► (1-2 sessions)
  B1. Analytics Worker (repurpose aiProcessingWorker.js)
  B2. Recommendation Worker (repurpose graph-worker.js)
  B3. Contextual Chat Worker ✅ COMPLETE (Ollama tool calling + HMM)
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

**Total estimated: 7-9 sessions remaining to production-ready VLM deployment** (A3 + B3 complete)

---

## Quick Reference: What Exists vs What's Needed

| Component | Exists | Needs |
|-----------|--------|-------|
| `/api/analytics/events` | YES (Zod + 14 event types) | Frontend analytics worker to POST events |
| `/api/recommendations` | YES (5-signal ranker, metrics) | Client worker for pre-fetch + tracking |
| `UserHistoryTracker` | YES (7-day decay, 6 interaction types) | Wire to analytics worker events |
| `contextual-chat` endpoints | ✅ **WIRED** (4 endpoints, 3 Ollama tools, HMM state) | Triton VLM path (post Phase E) |
| `/api/agents/chat` | ✅ **WIRED** (4 Ollama tools incl glossary) | None — working |
| `autonomous-agent.ts` | ✅ **WIRED** (15 LangChain tools via /api/agent/investigate) | None — working |
| `embedding-worker-enhanced.ts` | ACTIVE (ONNX 768-dim) | None — working |
| `embedding_cache` table | ✅ **WIRED** (pgvector + gRPC Redis cache) | None — working |
| `trt-llm.ts` client | YES (OpenAI-compat) | Wire to Triton when deployed |
| `gpu-arbiter.ts` | YES (Redis VRAM lease) | Add SigLIP load/unload |
| Langfuse | RUNNING (port 3100) | Wire SDK + instrument calls |
| ClickHouse | RUNNING (port 8123) | Langfuse backend (already configured) |
| Qdrant INT8 | DONE (all 72 collections) | Collection consolidation (72→15) |
| Hardcoded localhost | ✅ **0 remaining** | None — all via env.server.ts |
| LLM response caching | ✅ **DONE** (LiteLLM Redis semantic cache) | None — 28x speedup |
| Cache invalidation | ✅ **DONE** (cache-invalidation.ts + RabbitMQ) | None — working |
| MCP tools | ✅ **36 tools** (expanded from 9) | Report/case/citation tools |
| Zod validation | 118/258 (46%) | 140 more routes |
| Auth guards | ~30/258 routes | Centralize in hooks |
| Rate limiting | None | Redis INCR/EXPIRE |
