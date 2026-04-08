# Codebase Consolidation Audit Report

## Date: March 9, 2026 (Updated April 8, 2026 — Gemini 10-Layer Audit + API Consumer Analysis)
## Scope: Full server-side deduplication audit across 6 domains

---

## Executive Summary

The codebase has **significant duplication** across server-side infrastructure. This audit identified:

| Domain | Files Affected | Duplicate Implementations | Est. Lines Removable |
|--------|---------------|--------------------------|---------------------|
| **Cache Infrastructure** | 25+ | 7 Redis clients, 4 memory caches, 6 cache-aside patterns | ~1,200 |
| **ML/AI Services** | 16+ | 5 Ollama wrappers, 2 LLM routers, 2 summarizers | ~1,100 |
| **Embedding Pipeline** | 20+ | 12+ `generateEmbedding()` functions, 7 `embedText()` variants | ~1,500 |
| **Clustering/Similarity** | 8+ | 5 cosine similarity impls, 3 k-means impls, 2 silhouette impls | ~600 |
| **GPU Bridge** | 3 | 1 canonical (libtorch-bridge) + 1 re-export (cuda-bridge) | ~50 |
| **API Route Consumer** | 414 | 8 internal API-to-API chains, 4 @vite-ignore files | ~200 |
| **Total** | **486+** | **~35 duplicate function groups + 8 API chains** | **~4,650** |

---

## Domain 1: Embedding Pipeline (HIGHEST DUPLICATION)

### 12+ `generateEmbedding()` Functions

| File | Function | Return Type | Backend |
|------|----------|-------------|---------|
| `ai/embeddings.ts:59` | `generateEmbedding()` | `number[]` | Ollama + Redis cache + mock fallback |
| `ai/embeddings-simple.ts:41` | `generateEmbedding()` | `number[] \| null` | Ollama + dimension quantize |
| `ai/ollama-client.ts:89` | `generateEmbedding()` | `number[]` | Raw Ollama /api/embeddings |
| `config/ollama.ts:54` | `generateEmbedding()` | `number[]` | Raw Ollama /api/embeddings |
| `embedding-service.ts:16` | `generateEmbedding()` | `number[]` | Re-export of embedText() |
| `services/embedding-service.ts:18` | `generateEmbedding()` | `number[]` | Ollama + in-memory Map cache |
| `services/embeddingService.ts:5` | `getEmbedding()` | `number[]` | Raw Ollama /api/embeddings |
| `services/vectorDBService.ts:41` | `generateEmbedding()` | `Float32Array \| null` | Ollama + cache |
| `services/ollama-api.ts:10` | `getEmbeddingFromOllama()` | `number[] \| null` | Raw Ollama /api/embeddings |
| `services/unified-vector-service.ts:299` | `getEmbedding()` | `EmbeddingResponse` | Unified wrapper |
| `grpc/embedding-client.ts:272` | `generateSingleEmbedding()` | `number[]` | gRPC → Ollama fallback |
| `batch-embedder.ts:177` | `embedText()` | `Float32Array` | Ollama /api/embeddings |
| `ingest/embed.ts:79` | `embedText()` | `EmbeddingResult` | Multi-modal (text/image/audio) |
| `evidence/services/embedding.ts:3` | `embedText()` | `number[]` | Stub |
| `embeddings/ollama.ts:20` | `tryEmbedOllama()` | `number[] \| null` | Raw Ollama with error handling |

### Consolidation Recommendation

**Keep 3 canonical implementations:**

1. **`grpc/embedding-client.ts`** — Production path (gRPC → Ollama fallback → nomic fallback)
2. **`ingest/embed.ts`** — Multi-modal path (text + image + audio)
3. **`gpu/libtorch-bridge.ts`** — GPU compute path (weighted embeddings)

**Archive/redirect the other 12:**
- `ai/embeddings.ts` → redirect to grpc/embedding-client
- `ai/embeddings-simple.ts` → redirect to grpc/embedding-client
- `ai/ollama-client.ts` generateEmbedding → redirect to grpc/embedding-client
- `config/ollama.ts` generateEmbedding → redirect to grpc/embedding-client
- `embedding-service.ts` → redirect to grpc/embedding-client
- `services/embedding-service.ts` → redirect to grpc/embedding-client
- `services/embeddingService.ts` → archive (redundant)
- `services/vectorDBService.ts` generateEmbedding → redirect to grpc/embedding-client
- `services/ollama-api.ts` → archive (redundant)
- `batch-embedder.ts` → redirect to grpc/embedding-client (batch variant)
- `evidence/services/embedding.ts` → stub, redirect
- `embeddings/ollama.ts` → archive (raw, no cache)

**Note:** Many of these are in `src/lib/services/` (blanket-excluded from tsconfig). Corrupted files in that directory should be archived to `deeds_labs/`, not fixed.

---

## Domain 2: Cache Infrastructure

### 2a. Redis Client Fragmentation (5-7 competing clients)

| File | Package | Pattern | Connection Strategy |
|------|---------|---------|-------------------|
| `redis.ts` | `redis` (npm) | `createClient()` singleton | Pool, round-robin |
| `redis-client.ts` | `ioredis` | `RedisConnectionPool` class | Lazy init, custom config |
| `redis-service.ts` | imports from `./redis` | Wrapped service | Assumes pre-connected |
| `cache/redis.ts` | `redis` (npm) | `getRedisClient()` | Creates new client each call |
| `cache/redis-r3.ts` | `redis` (npm) | `RedisR3Cache` class | Constructor creates client |
| `knowledge-cache.ts` | `ioredis` | `new Redis()` standalone | Direct instantiation |

**Recommendation:** Consolidate to `redis.ts` singleton pool. All other files import from it.

### 2b. Memory Cache Fragmentation (4 competing Map caches)

| File | Type | TTL | Purpose |
|------|------|-----|---------|
| `cache.ts` | `Map<string, {value, expiresAt}>` | 5 min | General memory cache |
| `vector-cache.ts` | 3x `Map<string, Entry>` | 30min/1hr/1hr | Vector/embedding/VLM |
| `utils/server-cache.ts` | `Map<string, {data, expires}>` | 24hr | Fallback (orphan?) |
| `embedding-cache-service.ts` | 3x `Map` + Redis | 7 days | Embeddings + hot-cache |

**Recommendation:** Unify into single `MemoryCache<T>` class with configurable TTL tiers.

### 2c. Embedding Cache Fragmentation (3 separate systems)

| File | Storage | Format | TTL |
|------|---------|--------|-----|
| `embedding-cache.ts` | Redis binary | Float32Array buffers | 1 hour |
| `embedding-cache-service.ts` | Map + Redis | JSON | 7 days |
| `vector-cache.ts` | Map + Redis | JSON + validation | 1 hour |
| `knowledge-cache.ts` | Redis (ioredis) | JSON | 1 hour |

**TTL Mismatch Problem:** Same embedding data gets 1 hour, 7 days, or 5 minutes depending on which cache handles it.

**Recommendation:** Single `EmbeddingCache` class with binary storage (most efficient) and unified TTL.

### 2d. Stubs/Orphans to Delete

| File | Status | Action |
|------|--------|--------|
| `services/redis-cache.ts` | Stub with commented-out impl | Delete |
| `utils/server-cache.ts` | Orphan, 24hr hardcoded TTL | Delete |
| `db/embedding-cache-service.ts` | Incorrect import, overlaps embedding-cache.ts | Fix or delete |

---

## Domain 3: ML/AI Services

### 3a. Ollama Wrapper Proliferation (5 files, ~838 lines)

| File | Lines | Style | Key Functions |
|------|-------|-------|--------------|
| `ollama.ts` | 140 | Functions | `generateText()`, `callOllamaChat()`, `checkOllamaHealth()` |
| `services/OllamaService.ts` | 152 | Class | `generate()`, `embeddings()`, `listModels()`, `isHealthy()` |
| `ai/ollama-client.ts` | 112 | Functions | `generateCompletion()`, `generateEmbedding()`, `listOllamaModels()` |
| `llm/ollamaClient.ts` | 210 | Functions | `ollamaChat()`, `generateLegalMemo()`, `generateCaseSummary()` |
| `llm/ollama-client.ts` | 224 | Functions | `generateCompletion()`, `chatCompletion()`, `buildLegalRAGPrompt()` |

**Duplicated across all 5:**
- Health check endpoint (`/api/tags` or `/api/models`) — 3 implementations
- Model listing — 3 implementations
- Base URL resolution — 4 different approaches
- Chat/generate wrapper — 5 implementations

**Recommendation:** Keep `ollama.ts` as canonical (simplest, function-based). Archive others, redirect imports.

### 3b. LLM Router Conflict (2 competing routers)

| File | Purpose | Streaming | Model Selection |
|------|---------|-----------|----------------|
| `llm-router.ts` | Multi-provider (Ollama + Gemini) | AsyncGenerator | Dynamic from ollama-config registry |
| `inference/inference-router.ts` | GPU-aware (TRT → Ollama) | Non-streaming | Hardcoded `gemma3-legal:latest` |

**Recommendation:** Merge into single `llm-router.ts` with GPU arbiter awareness + streaming support.

### 3c. Hardcoded Model Names (41+ files)

`"gemma3-legal:latest"` appears in **41+ files** across the codebase. `"embeddinggemma:latest"` appears in **9+ files**.

**Note:** `src/lib/ai/model-ids.ts` already exists as a client-side model constant file. A server-side equivalent is needed.

**Recommendation:** Create `src/lib/server/ai/model-constants.ts`:
```typescript
export const MODELS = {
  llm: 'gemma3-legal:latest',
  embedding: 'embeddinggemma:latest',
  embeddingFallback: 'nomic-embed-text',
  vision: 'gemma3-vision:latest',
} as const;
```
Then find-replace across 41+ files.

### 3d. Summarization Duplication (2 + 1 cache)

| File | Approach | Caching |
|------|----------|---------|
| `analysis/summarizer.ts` | Ollama /api/generate + truncation fallback | None |
| `services/llm.service.ts` | `generateSummary()` (incomplete) | None |
| `summarizeCache.ts` | LRU + Redis cache layer | Yes (not wired to either summarizer) |

**Recommendation:** Wire `summarizeCache.ts` into `analysis/summarizer.ts`. Delete incomplete `llm.service.ts` summarization.

---

## Domain 4: Clustering & Similarity

### 4a. Cosine Similarity (5 implementations)

| File | Function | Type | Notes |
|------|----------|------|-------|
| `embedding/knn-helper.ts:26` | `cosineSimilarity()` | Export | Includes euclidean, dot, topK |
| `phase72/clusterErrors.ts:108` | `cosineSimilarity()` | Private | Inline duplicate |
| `db/pgvector-utils.ts:340` | (unnamed inline) | Private | dotProduct / magnitude |
| `db/pgvector-utils.temp.ts:340` | (unnamed inline) | Private | Exact duplicate of above |
| `gpu/libtorch-bridge.ts:97` | `cpuCosineSimilarity()` | Private | NxN matrix variant |

**Additional imports (no local impl):**
- `ml/multi-modal-ranker.ts:18` — imports from `$lib/ai/client-embed.js` (client-side!)
- `ml/topic-cluster.ts:17` — imports from `$lib/ai/client-embed.js` (client-side!)
- `services/rag-retrieval-service.ts:19` — imports from `./embedding-service.js`
- `services/statute-ingestion-service.ts:204` — `require('./embedding-service')`

**Server files importing client-side cosineSimilarity:** `multi-modal-ranker.ts` and `topic-cluster.ts` both import from `$lib/ai/client-embed.js` — a client-side file. This works but is architecturally wrong.

*eans++ init, silhouette, convergence | Yes (via libtorch-bridge) |
| `services/clustering/kmeans-service.ts` | `runKMeans()` | k-means++ init, silhouette, cluster stats | Yes (via libtorch-bridge) |
| `phase72/clusterErrors.ts` | `kmeansCluster()` | Basic k-means, local cosine sim | No |
| `gpu/libtorch-bridge.ts` | `cpuKMeans()` | Basic k-means (CPU fallback) | N/A (is the fallback) |

**Overlap:** `topic-cluster.ts` and `kmeans-service.ts` are 80% identical:
- Both implement k-means++ initialization
- Both compute silhouette scores
- Both have GPU-first with CPU fallback
- `topic-cluster.ts` returns `{clusters, centroids, silhouetteScore, iterations, inertia}`
- `kmeans-service.ts` returns *Recommendation:**
1. Make `embedding/knn-helper.ts` the canonical server-side similarity library
2. Replace `phase72/clusterErrors.ts` inline impl with import from knn-helper
3. Replace client-embed.js imports in server files with knn-helper import
4. Delete `pgvector-utils.temp.ts` (exact copy of pgvector-utils.ts)

### 4b. K-Means Clustering (3 implementations)

| File | Function | Features | GPU |
|------|----------|----------|-----|
| `ml/topic-cluster.ts` | `KMeansClusterer.fit()` | k-m`KMeansCluster[]` with members

**Recommendation:** Consolidate `topic-cluster.ts` and `kmeans-service.ts` into a single k-means module. `topic-cluster.ts` has the more complete implementation (inertia tracking, convergence detection). `kmeans-service.ts` adds cluster member tracking and stats functions. Merge into `topic-cluster.ts` and have `kmeans-service.ts` re-export with member tracking wrapper.

### 4c. Silhouette Score (2 implementations)

| File | Function | Lines |
|------|----------|-------|
| `ml/topic-cluster.ts:202` | `computeSilhouette()` | Full per-point silhouette with metrics |
| `services/clustering/kmeans-service.ts:326` | `calculateSilhouetteScore()` | Cluster-based silhouette |

**Recommendation:** Keep `topic-cluster.ts` version (more complete), import in kmeans-service.

### 4d. Temp File Duplicate

`db/pgvector-utils.temp.ts` is an **exact copy** of `db/pgvector-utils.ts` (both ~400 lines).

**Recommendation:** Delete `pgvector-utils.temp.ts` immediately.

---

## Domain 5: GPU Bridge

### Current State (Clean) — Verified 2026-04-08 (10-layer audit)

| File | Purpose | Status |
|------|---------|--------|
| `gpu/libtorch-bridge.ts` | Canonical GPU bridge (graphSimilarity, clusterEmbeddings, computeCaseEmbedding, isCudaAvailable) | PRIMARY |
| `gpu/cuda-bridge.ts` | Re-export wrapper + getCudaDeviceInfo | THIN WRAPPER |
| `gpu/background-analyzer.ts` | Fire-and-forget CUDA analysis (warmupGpuCache, triggerEvidenceGpuAnalysis, triggerPoiGpuAnalysis, analyzePoiPhotoGpu) | ACTIVE |
| `gpu/gpu-monitor.ts` | VRAM/temp/utilization stats (getGpuStats, getRouterStatus) | ACTIVE |

**Static Consumers (L1 — 8 files):**
- `gpu/cuda-bridge.ts` — re-exports graphSimilarity, clusterEmbeddings, computeCaseEmbedding, isCudaAvailable
- `gpu/background-analyzer.ts` — imports all 3 core functions + isCudaAvailable
- `api/gpu/compute/+server.ts` — graphSimilarity, clusterEmbeddings, computeCaseEmbedding, isCudaAvailable
- `api/health/gpu/+server.ts` — isCudaAvailable, graphSimilarity, getCudaDeviceInfo, getGpuStats
- `api/infrastructure/status/+server.ts` — isCudaAvailable

**Dynamic Consumers (L2 — 10 files, invisible to simple grep):**
- `hooks.server.ts:188` — `warmupGpuCache(5)` at boot (pre-populate GPU cache for 5 recent cases)
- `mcp/server.ts:1190` — `graphSimilarity` via `gpu:similarity` MCP tool (CPU fallback)
- `workers/compute-pool.ts:188` — `clusterEmbeddings`, `isCudaAvailable` (worker thread K-means routing)
- `api/evidence/[id]/gpu-analysis/+server.ts:63` — `triggerEvidenceGpuAnalysis` (on-demand evidence GPU)
- `api/evidence/upload/+server.ts:22` — `triggerEvidenceGpuAnalysis` (fire-and-forget post-upload)
- `api/persons-of-interest/[id]/gpu-analyze/+server.ts:23` — `analyzePoiPhotoGpu` (on-demand POI GPU)
- `api/persons-of-interest/[id]/photos/+server.ts:470` — `triggerPoiGpuAnalysis` (fire-and-forget post-VLM)

**Fetch Consumers (L6 — 2 client files):**
- `stores/analysis-panel.svelte.ts` — `fetch('/api/gpu/compute')` (similarity + cluster operations)
- `components/yorha/dashboard/GPUMetrics.svelte` — dynamic import of `gpu-compute-pipeline.js`

**Total: 21 files consume GPU Bridge modules**

**Previously listed consumers (DELETED — archived to deeds_labs/):**
- ~~`ml/topic-cluster.ts`~~, ~~`services/clustering/kmeans-service.ts`~~, ~~`ai/multimodal-fusion.ts`~~
- ~~`ml/multi-modal-ranker.ts`~~, ~~`services/similar-cases.service.ts`~~, ~~`graph/evidence-graph-service.ts`~~
- `vector/qdrant-manager.ts` — uses `simdjson-bridge`, NOT libtorch directly

**Status:** Clean — all 3 core functions actively wired. cuda-bridge.ts is harmless thin wrapper.

---

## Domain 6: API Route Consumer Analysis (Gemini Audit — April 7, 2026)

### Overview
| Metric | Count |
|--------|-------|
| Total `+server.ts` files | **414** |
| Total lines of API code | **58,531** |
| `.svelte` files with `fetch('/api/...')` | **193** |
| Total `/api/` references (all file types) | **4,865** |
| `.svelte.ts` store files | **37** |
| Internal API-to-API fetch chains | **8** |

### 10-Layer Import Coverage
| Layer | Pattern | Count | Risk |
|-------|---------|-------|------|
| L1 | Static ESM (`from '...'`) | All files | Baseline |
| L2 | Dynamic ESM (`await import()`) | **115 files** | HIGH — invisible to `from` grep |
| L3 | CJS require | ~5 files | LOW |
| L4 | Variable dynamic (`@vite-ignore`) | **4 files** | CRITICAL — invisible to all grep |
| L5 | SvelteKit auto-discovery | 692 route files | LOW |
| L8 | Barrel re-exports | **24 index.ts** | MODERATE |
| L9 | Event coupling | **88 files (192 events)** | HIGH |
| L10 | Store subscriptions | 37 .svelte.ts files | LOW |

### L4 — Variable Dynamic Imports (Invisible to Grep)
| File | What It Imports |
|------|-----------------|
| `lib/server/db/drizzle.ts` | `const cachePath = '$lib/server/cache/redis'; await import(cachePath)` |
| `lib/server/analysis/granite-docling.ts` | PDF rendering via variable path |
| `lib/server/json/fastjson.ts` | JSON parser via variable path |
| `lib/components/yorha/_simulations/CanvasBoard.svelte` | Simulation engine via variable path |

### Internal API-to-API Calls (Server→Server)
8 API routes call other `/api/` routes via fetch(), creating invisible dependency chains:

| Source Route | Target Route | Method | Purpose |
|-------------|-------------|--------|---------|
| `cases/[id]/similar` | `/api/graph/sync` | POST | Neo4j graph sync after similarity calc |
| `error-brain/diagnose` | `/api/codebase-index/graph` | GET | Fetch dependency graph for error diagnosis |
| `evidence/analyze` | `/api/evidence/analysis` | GET+POST | Proxy to analysis handler |
| `gpu-wasm-integration` | `/api/gpu/queue` | GET | GPU queue status check |
| `knowledge/search` | `/api/glossary/search` | POST | Fan-out to glossary adapter |
| `knowledge/search` | `/api/statutes/search` | POST | Fan-out to statutes adapter |
| `knowledge/search` | `/api/precedents/search` | POST | Fan-out to precedents adapter |

### Dynamic Import Hotspots
| File | `await import()` Count | Purpose |
|------|----------------------|---------|
| `mcp/server.ts` | **12** | All MCP tool handlers lazy-loaded |
| `(app)/+layout.svelte` | ~5 | AnalysisPanel, KeyboardShortcuts, lazy UI |
| `hooks.server.ts` | 3 | Boot tasks (GPU warmup, queue consumers, graph sync) |
| API routes | **80+** | Service imports on first request |

### L8 — Barrel Re-Export Dead Chains
24 barrel `index.ts` files found. Key finding:
- `shells/index.ts` re-exports 3 components but the barrel itself has **0 consumers** — entire re-export chain is dead
- Rule: When auditing, check if the **barrel** is imported, not just its contents

### L9 — Event Coupling
- **88 files** dispatch or listen for CustomEvents
- **192+ unique event types** across the codebase
- **27 files** use `window.addEventListener` for global channels
- `yorha:` event namespace is primary coupling mechanism
- Example: `AnalysisPanel.svelte` has 0 static imports but is triggered via `yorha:open-analysis` from root layout

### Consolidation Recommendation
- API-to-API internal calls should be refactored to direct function imports where possible (eliminates HTTP overhead + auth re-checking)
- `knowledge/search` → `glossary/statutes/precedents` fan-out is acceptable (adapter pattern) but could use shared internal function instead of HTTP round-trips
- `evidence/analyze` → `evidence/analysis` proxy is pure redirect — merge into single route

---

## Prioritized Action Plan

### Phase 1: Quick Wins (1-2 hours)

| # | Action | Files | Impact |
|---|--------|-------|--------|
| 1 | Delete `pgvector-utils.temp.ts` | 1 | -400 lines (exact duplicate) |
| 2 | Delete `services/redis-cache.ts` (stub) | 1 | -30 lines |
| 3 | Delete `utils/server-cache.ts` (orphan) | 1 | -34 lines |
| 4 | Create `src/lib/server/ai/model-constants.ts` | 1 new | Centralized model names |

### Phase 2: Similarity Consolidation (2-3 hours)

| # | Action | Files | Impact |
|---|--------|-------|--------|
| 5 | Make `knn-helper.ts` the canonical server-side similarity lib | 1 | Central authority |
| 6 | Replace `phase72/clusterErrors.ts` inline cosine sim with import | 1 | -20 lines |
| 7 | Replace `client-embed.js` imports in `multi-modal-ranker.ts` and `topic-cluster.ts` with `knn-helper.ts` | 2 | Architecture fix |

### Phase 3: K-Means Consolidation (3-4 hours)

| # | Action | Files | Impact |
|---|--------|-------|--------|
| 8 | Merge `kmeans-service.ts` cluster-member logic into `topic-cluster.ts` | 2 | -150 lines |
| 9 | Have `kmeans-service.ts` re-export from consolidated `topic-cluster.ts` | 1 | API compatibility |
| 10 | Use consolidated silhouette from `topic-cluster.ts` in kmeans-service | 1 | -60 lines |

### Phase 4: Redis Client Consolidation (3-4 hours)

| # | Action | Files | Impact |
|---|--------|-------|--------|
| 11 | Consolidate all Redis clients to `redis.ts` singleton | 5 | -200 lines, 1 connection pool |
| 12 | Delete `cache/redis.ts`, `cache/redis-r3.ts` | 2 | -100 lines |
| 13 | Update `knowledge-cache.ts` to use `redis.ts` | 1 | Consistent client |

### Phase 5: Ollama Wrapper Consolidation (4-6 hours)

| # | Action | Files | Impact |
|---|--------|-------|--------|
| 14 | Keep `ollama.ts` as canonical, add missing functions | 1 | Central authority |
| 15 | Archive `OllamaService.ts`, `ai/ollama-client.ts` | 2 | -264 lines |
| 16 | Merge legal-specific functions from `llm/ollamaClient.ts` into `ollama.ts` | 2 | -200 lines |
| 17 | Redirect `llm/ollama-client.ts` RAG functions to `ollama.ts` | 1 | -224 lines |

### Phase 6: Embedding Pipeline Consolidation (6-8 hours)

| # | Action | Files | Impact |
|---|--------|-------|--------|
| 18 | Designate `grpc/embedding-client.ts` as canonical text embedding | 1 | Central authority |
| 19 | Redirect active `generateEmbedding()` callers to canonical | 5-8 | Unified pipeline |
| 20 | Archive corrupted/redundant embedding files in services/ | 4-5 | -500 lines |
| 21 | Unify embedding cache (binary format, unified TTL) | 3 | -300 lines |

### Phase 7: LLM Router Merge (2-3 hours)

| # | Action | Files | Impact |
|---|--------|-------|--------|
| 22 | Merge `inference-router.ts` GPU awareness into `llm-router.ts` | 2 | -150 lines, unified routing |
| 23 | Wire `summarizeCache.ts` into `summarizer.ts` | 2 | Integrated caching |

### Phase 8: Model Name Replacement (2-3 hours)

| # | Action | Files | Impact |
|---|--------|-------|--------|
| 24 | Replace hardcoded "gemma3-legal:latest" with `MODELS.llm` constant | 41 | Single source of truth |
| 25 | Replace hardcoded "embeddinggemma:latest" with `MODELS.embedding` constant | 9 | Single source of truth |

---

## Risk Assessment

### High Risk (test thoroughly)
- **Embedding consolidation** — Many active callers, different return types (`number[]` vs `Float32Array` vs `null`)
- **Redis client consolidation** — Connection pooling behavior changes could affect latency
- **Ollama wrapper consolidation** — Legal-specific prompt builders must be preserved

### Medium Risk
- **K-means consolidation** — Both impls have GPU wiring that must be preserved
- **LLM router merge** — Streaming vs non-streaming behavior differences
- **Model name replacement** — Mechanical but touches 41+ files

### Low Risk
- **Quick wins** (delete temp/stub files) — No active consumers
- **Similarity consolidation** — Pure function replacement, same math
- **Summarize cache wiring** — Additive, no breaking change

---

## Metrics Summary

| Category | Current | After Consolidation |
|----------|---------|-------------------|
| `generateEmbedding()` functions | **15** | **3** |
| Cosine similarity implementations | **5** | **1** (+ 1 GPU NxN) |
| K-means implementations | **3** | **1** (+ 1 GPU) |
| Ollama HTTP wrappers | **5** | **1** |
| Redis client instantiations | **5-7** | **1** |
| Memory cache implementations | **4** | **1** |
| Embedding cache systems | **3** | **1** |
| LLM routers | **2** | **1** |
| Hardcoded model name files | **41+** | **1** (constant) |
| Estimated lines removable | — | **~4,450** |
| Estimated effort (all phases) | — | **25-35 hours** |
