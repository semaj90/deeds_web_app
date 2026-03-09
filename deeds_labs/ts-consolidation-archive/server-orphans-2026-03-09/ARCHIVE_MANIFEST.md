# Server Orphan Archive — March 9, 2026

## Context

These 17 files were identified during the Codebase Consolidation Audit as orphans, stubs, corrupted, or duplicates with zero active imports. Useful functionality was merged into canonical locations before archival. Files verified via `grep -r` for actual import paths — only files with 0 active importers were archived.

---

## Batch 1: Utils & Stubs (8 files)

| File | Lines | Original Path | Reason | Salvaged To |
|------|-------|---------------|--------|-------------|
| `json-fast.ts` | 62 | `src/lib/server/utils/` | SIMD JSON — `simdjson` not installed, env vars never set, 0 imports | — |
| `ollama-client.ts` | 7 | `src/lib/server/utils/` | Corrupted — broken import (`$env /dynamic/private` with space) | — |
| `ollama-endpoint.ts` | 34 | `src/lib/server/utils/` | Redundant `getOllamaEndpoint()` duplicated in 4+ files, noisy logging | — |
| `rate-limit.ts` | 87 | `src/lib/server/utils/` | Solid `InMemoryRateLimiter`. **Types merged** into `middleware/rate-limiter.ts` | `middleware/rate-limiter.ts` |
| `http-error-mapper.ts` | 21 | `src/lib/server/utils/` | Clean mapper. **Merged** into `utils/service-error.ts` | `utils/service-error.ts` |
| `embeddings.ts` | 12 | `src/lib/server/` | Dead stub — imports nonexistent `OllamaService` | — |
| `redis-adapter.ts` | 5 | `src/lib/server/adapters/` | Corrupted stub — `@ts-nocheck`, undefined export | — |
| `embedding-gateway.ts` | 57 | `src/lib/server/` | Superseded by `grpc/embedding-client.ts` | — |

## Batch 2: AI, Config, Integrations, LLM (9 files)

| File | Lines | Original Path | Reason | Salvaged To |
|------|-------|---------------|--------|-------------|
| `embeddinggemma-service.ts` | 102 | `src/lib/server/ai/` | Broken import — `from './cache.js'` doesn't exist. 0 importers | — |
| `embedding.ts` | 28 | `src/lib/server/evidence/services/` | Hash-mock stub — SHA-256 pseudo-embedding, not real ML. 0 importers | — |
| `dynamic-ports.ts` | 91 | `src/lib/server/config/` | Unused service discovery — Docker env vars cover this. 0 importers | — |
| `endpoints.ts` | 10 | `src/lib/server/config/` | **Corrupted** — malformed URL with space (`localhost: 11434`). 0 importers | — |
| `index.ts` | 4 | `src/lib/server/integrations/` | **Corrupted** — malformed type aliases (colon instead of comma). 0 importers | — |
| `qdrant.ts` | 246 | `src/lib/server/integrations/` | Superseded by `vector/qdrant-manager.ts`. 0 importers | — |
| `gemma.ts` | 18 | `src/lib/server/integrations/` | Thin wrapper for Gemma endpoint getter. 0 importers | — |
| `ollamaClient.ts` | 211 | `src/lib/server/llm/` | Duplicate of `llm/ollama-client.ts`. 0 importers (only a test file) | — |
| `gemmaReports.ts` | 97 | `src/lib/server/llm/` | Orphaned HTML report generator. 0 importers | — |

---

## Files NOT Archived (Have Active Importers)

These were audited but kept because active code depends on them. They should be redirected/consolidated in a future session:

| File | Active Importers | Canonical Replacement | Action Needed |
|------|-----------------|----------------------|---------------|
| `ai/ollama-client.ts` | 2 (legal-reasoning-chain, case-theory API) | `ollama.ts` or `llm/ollama-client.ts` | Redirect imports, then archive |
| `ollama-service.ts` | 5 (evidence-handlers, keyword-extractor, etc.) | `ollama.ts` | Redirect 5 imports, then archive |
| `config/ollama.ts` | 3 (summarizer, suggestion-engine, search-service) | `ai/ollama-config.ts` | Redirect 3 imports, then archive |
| `llm/contextual-chat.ts` | 1 (api/ai/contextual-chat route) | Keep or inline into route | Wire or archive with route |
| `embeddings/ollama.ts` | 1 (knowledge-search page) | `grpc/embedding-client.ts` | Redirect 1 import, then archive |
| `db/embedding-cache-service.ts` | 1 (pgvector-embedding-repository.ts) | `embedding-cache.ts` | Redirect 1 import, then archive |
| `integrations/minio.ts` | Referenced by ingest/embed.ts | Keep or redirect to MinIO client | Check dependency |
| `integrations/redis.ts` | Referenced by knowledge-cache.ts | `redis.ts` | Redirect 1 import |
| `phase72/*` | 9 API routes | — | Keep for now (too many routes) |

---

## What Was Salvaged (Merged Before Archive)

### 1. Rate Limit Types → `middleware/rate-limiter.ts`
```typescript
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
}
```
Merged from orphan `rate-limit.ts`, replacing `as any` cast and adding `retryAfter`.

### 2. Error Mapper → `utils/service-error.ts`
```typescript
export function mapErrorToHttp(err: unknown): { status: number; body: { error: string; code?: string } }
export function errorResponse(err: unknown): Response
```
Merged from orphan `http-error-mapper.ts`.

### 3. Cosine Similarity Architecture Fix
Server files `topic-cluster.ts` and `multi-modal-ranker.ts` were importing `cosineSimilarity` from client-side `$lib/ai/client-embed.js`. Redirected to server-side `$lib/server/embedding/knn-helper.js`.

---

## Canonical Module Map (Use These, Not Archived)

| Domain | Canonical File | Key Exports |
|--------|---------------|-------------|
| **Embedding** | `grpc/embedding-client.ts` | `generateSingleEmbedding()`, `generateEmbeddings()`, `checkGrpcHealth()` |
| **Embedding (batch)** | `batch-embedder.ts` | `embedTexts()` (50ms window, 32 batch) |
| **Embedding (cache)** | `embedding-cache.ts` | `getCachedEmbedding()`, `cacheEmbedding()` (Redis binary) |
| **Cosine (scalar)** | `embedding/knn-helper.ts` | `cosineSimilarity()`, `euclideanDistance()`, `topKNearest()` |
| **Cosine (batch/GPU)** | `gpu/libtorch-bridge.ts` | `graphSimilarity()`, `cpuCosineSimilarity()` |
| **K-means** | `ml/topic-cluster.ts` | `KMeansClusterer` (k-means++, GPU, silhouette) |
| **Ollama (core)** | `ollama.ts` | `generateText()`, `callOllamaChat()`, `checkOllamaHealth()` |
| **Ollama (RAG)** | `llm/ollama-client.ts` | `generateCompletion()`, `buildLegalRAGPrompt()` |
| **Ollama (config)** | `ai/ollama-config.ts` | Model registry, fallback chains |
| **Redis** | `redis.ts` | `redisPool` (ioredis, 10-conn round-robin) |
| **Cache (dual-tier)** | `cache.ts` | Memory + Redis dual-tier with 5min TTL |
| **Rate limiting** | `middleware/rate-limiter.ts` | `chatRateLimiter`, `embedRateLimiter`, `heavyRateLimiter` |
| **Error handling** | `utils/service-error.ts` | `ServiceError`, `mapErrorToHttp()`, `errorResponse()` |
| **Auth** | `auth.ts` | Lucia v3 production auth |

---

## Production-Ready But UNWIRED (Promote These)

High-quality files identified by audit that should be wired to routes:

| File | Lines | What It Does | Wire To | Effort |
|------|-------|-------------|---------|--------|
| `concurrency/queue-manager.ts` | 423 | Background job queue (7 job types, retry, priority) | `hooks.server.ts` + API routes | Moderate |
| `concurrency/transaction-manager.ts` | 240 | ACID transactions + advisory locks | Evidence/case write endpoints | Complex |
| `embedding-cache.ts` | 105 | Redis binary embedding cache (4x smaller) | Embedding handlers | Trivial |
| `knowledge-cache.ts` | 215 | Tiered Redis cache (embeddings + search) | RAG search endpoints | Moderate |
| `audit-logger.ts` | 135 | Storage operation audit trail | Evidence upload/delete | Trivial |
| `cache/redis-metrics.ts` | 383 | Redis metrics + optimization recommendations | `/api/cache/stats` | Trivial |
| `redis-streams.ts` | 151 | Token stream resume (blocking consumer) | SSE chat endpoints | Complex |

---

## ACE Context Summary

For LLM-based code generation and self-prompting:

1. **Embedding**: `grpc/embedding-client.ts` (4-tier fallback, batch, typed `EmbeddingResult`)
2. **Error handling**: `ServiceError('NOT_FOUND', msg)` + `errorResponse(err)` in catch blocks
3. **Rate limiting**: `chatRateLimiter.check(request)` returns `RateLimitResult` with `retryAfter`
4. **Redis**: Always `$lib/server/redis.ts` (ioredis pool). Never standalone `new Redis()`
5. **Cosine similarity**: Server scalar → `knn-helper.ts`. Batch/GPU → `libtorch-bridge.ts`. Never `$lib/ai/client-embed.js`
6. **K-means**: `KMeansClusterer` from `ml/topic-cluster.ts` (k-means++, GPU, silhouette)
7. **Ollama**: Core → `ollama.ts`. RAG prompts → `llm/ollama-client.ts`. Config → `ai/ollama-config.ts`
8. **Background jobs**: `concurrency/queue-manager.ts` (ready to wire, 7 job types)
9. **Transactions**: `concurrency/transaction-manager.ts` (ACID with advisory locks)

## Audit Sources

- `sveltekit-frontend/docs/CODEBASE_CONSOLIDATION_AUDIT.md` — Full consolidation audit
- `sveltekit-frontend/docs/cuda-audit-recommendations.md` — GPU/CUDA kernel audit
