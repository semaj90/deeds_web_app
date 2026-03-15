# Phase 0: Config Audit — Ports, Env Vars, Compose Names

**Date:** 2026-03-15
**Status:** Complete
**Purpose:** Identify all port collisions, env var inconsistencies, duplicate fallbacks, and service name mismatches before Phases 1-4.

---

## 1. PORT MAP (Active Source Files Only)

### Port 8095 — **3-WAY COLLISION**
| Consumer | File | Type |
|----------|------|------|
| LangExtract (phase66-langextract) | `docker-compose.dev.yml:122`, `docker-compose.yml:499` (quic-server) | Docker container |
| GPU orchestrator | `docker-compose.dev.yml:122` (gpu-orchestrator service) | Docker container |
| MINIO_SIMD_URL (env default) | `env.server.ts:50` → `'http://127.0.0.1:8095'` | SvelteKit ENV |
| LANGEXTRACT_URL (env default) | `env.server.ts:52` → `'http://127.0.0.1:8095'` | SvelteKit ENV |
| Vite WS proxy `/ws/canvas` | `vite.config.ts:239` → `ws://localhost:8095` | Dev proxy |
| SIMD JSON accelerator | `src/lib/simd/simd-json-integration.js:8` → `localhost:8095` | Hardcoded |
| MCP Context7 registration | `src/lib/config/mcp-context7-registration.json:3` → `localhost:8095` | Hardcoded |

**Severity: CRITICAL.** Three different services (LangExtract, MINIO SIMD, QUIC server) all default to 8095. Only one can bind at a time.

### Port 8096 — **2-WAY COLLISION**
| Consumer | File | Type |
|----------|------|------|
| TensorRT-LLM HTTP | `docker-compose.yml:422` → `${TENSORRT_HTTP_PORT:-8096}:8096` | Docker container |
| Vite WS proxy `/ws/chat` | `vite.config.ts:244` → `ws://localhost:8096` | Dev proxy |
| SIMD JSON Parser (Context7 docs) | `CONTEXT7_COMPREHENSIVE_GUIDE.md` (many refs) | Documentation only |

**Severity: HIGH.** TensorRT HTTP and AI chat WebSocket both claim 8096. In dev, the Vite proxy would route `/ws/chat` to TensorRT, not a chat service.

### Port 8097 — **2-WAY COLLISION**
| Consumer | File | Type |
|----------|------|------|
| TensorRT-LLM WebSocket | `docker-compose.yml:423` → `${TENSORRT_WS_PORT:-8097}:8097` | Docker container |
| Vite proxy `/api/cuda` | `vite.config.ts:197` → `http://localhost:8097` | Dev proxy |
| Triton METRICS_PORT | `scripts/start-triton.sh:26` → `8097` | Script |

**Severity: MEDIUM.** Vite proxies `/api/cuda` to TensorRT WS port, not HTTP. Likely wrong target.

### Port 8098 — **2-WAY COLLISION**
| Consumer | File | Type |
|----------|------|------|
| TensorRT-LLM Health | `docker-compose.yml:424` → `${TENSORRT_HEALTH_PORT:-8098}:8098` | Docker container |
| MCP server LANGEXTRACT_URL fallback | `src/mcp/server.ts:666` → `'http://localhost:8098'` | Hardcoded |
| Triton GRPC_PORT | `scripts/start-triton.sh:25` → `8098` | Script |

**Severity: HIGH.** MCP server defaults LangExtract to 8098 (TensorRT health port), while env.server.ts defaults it to 8095. These disagree.

### Port 50051 — Clean (single owner)
| Consumer | File | Type |
|----------|------|------|
| gRPC embedding server | `env.server.ts:41`, `embedding-client.ts:5`, `docker-compose.yml:58`, `docker-compose.yaml:62` | Canonical |

**Severity: OK.** One owner. Both compose files reference it. env.server.ts declares `ENV.EMBEDDING_GRPC_URL`.

### Port 50052 — Minor (unused in active code)
| Consumer | File | Type |
|----------|------|------|
| Legal CUDA gRPC service | `src/lib/wasm/build-legal-grpc-wasm.sh:247` | Build script only |
| Timeline service | `GO_GRPC_IMPLEMENTATION_GUIDE.md` | Documentation only |

**Severity: LOW.** Not referenced by any active runtime code.

### Port 50053 — Clean (env only)
| Consumer | File | Type |
|----------|------|------|
| Retrieval gRPC server | `env.server.ts:43` → `ENV.RETRIEVAL_GRPC_URL` | Declared but disabled |

---

## 2. ENV VAR INCONSISTENCIES

### LangExtract URL — **3 different defaults**
| Source | Default | File |
|--------|---------|------|
| `ENV.LANGEXTRACT_URL` | `http://127.0.0.1:8095` | `env.server.ts:52` |
| `ENV.MINIO_SIMD_URL` | `http://127.0.0.1:8095` | `env.server.ts:50` |
| MCP server fallback | `http://localhost:8098` | `src/mcp/server.ts:666,689,712,734` |

**Problem:** The canonical `ENV.LANGEXTRACT_URL` exists but MCP server.ts uses `process.env.LANGEXTRACT_URL` directly (bypasses `ENV` object) and falls back to port **8098** instead of **8095**.

### ENV.MINIO_SIMD_URL used as LANGEXTRACT_URL
| Consumer | File | Line |
|----------|------|------|
| `api/web/crawl/+server.ts` | `const LANGEXTRACT_URL = ENV.MINIO_SIMD_URL` | L11 |
| `tools/handlers/langextractBatch.ts` | `const LANGEXTRACT_URL = ENV.MINIO_SIMD_URL` | L18 |
| `api/persons-of-interest/[id]/photos/+server.ts` | `ENV.MINIO_SIMD_URL` for `/extract` | L290 |

**Problem:** These files use MINIO_SIMD_URL to call LangExtract endpoints. They should use `ENV.LANGEXTRACT_URL`. The SIMD service and LangExtract are conceptually different services that happen to share port 8095.

### process.env.* bypassing ENV object
| File | Var | Note |
|------|-----|------|
| `cache.ts` | `REDIS_PASSWORD`, `CACHE_BACKEND`, `USE_REDIS`, `REDIS_URL`, + 4 more | Should use `ENV.REDIS_URL` |
| `authUtils.ts` | `JWT_SECRET` → `'fallback-secret-key'` | **SECURITY: hardcoded secret** |
| `auth.ts` | `SERVICE_AUTH_TOKEN` (5 references) | Not in ENV object |
| `ollama-client.ts` | `OLLAMA_CHAT_MODEL`, `OLLAMA_EMBED_MODEL`, `OLLAMA_TIMEOUT_MS` | Should use ENV |
| `adapters/service-integrations.ts` | `REDIS_PASSWORD`, `REDIS_HOST`, `REDIS_PORT`, `QDRANT_HOST`, `QDRANT_PORT` | Should use ENV |
| `embedding-service.ts` | `OLLAMA_EMBED_MODEL`, `OLLAMA_EMBED_TIMEOUT_MS`, `EMBEDDING_DIM` | Should use ENV |
| `embeddinggemma-service.ts` | `OLLAMA_EMBED_MODEL`, `OLLAMA_EMBED_DIM`, `EMBEDDING_CACHE_TTL` | Should use ENV |
| `env/endpoints.ts` | `OLLAMA_URL` | Should use ENV |
| `chrrom/patterns.ts` | `ENHANCED_RAG_URL`, `FRONTEND_BASE_URL` | Should use ENV |
| `mcp/server.ts` | `LANGEXTRACT_URL` (4 occurrences) | Should use ENV |

**Total: ~30+ process.env references that bypass the canonical ENV object.**

---

## 3. DOCKER COMPOSE SERVICE NAMES

### Redis container name inconsistencies
| Compose File | Service | container_name | Image |
|-------------|---------|----------------|-------|
| `docker-compose.yml` | `redis` | `legal-ai-redis` | `redis/redis-stack:latest` |
| `docker-compose.dev.yml` | `redis` | `legal-ai-redis` | `redis:7-alpine` |
| `docker-compose.test.yml` | `redis` | `deeds-redis-prod` | `redis:7-alpine` |
| `sveltekit-frontend/docker-compose.dev.yml` | `redis` | `deeds-redis` | `redis:7-alpine` |

**Problem:** 3 different container names across 4 compose files. The test file uses "prod" in its name but is test config. All REDIS_URL env vars use `redis://redis:6379` (service DNS name), so container_name differences don't affect resolution inside Docker networks — but running multiple compose stacks simultaneously will cause container name conflicts.

### Redis config differences
| Compose File | protected-mode | bind | maxmemory | Password |
|-------------|---------------|------|-----------|----------|
| `docker-compose.yml` | **no** | **0.0.0.0** | 2GB | none |
| `docker-compose.test.yml` | — | — | 512MB | none |

**Security risk:** Main compose has `--protected-mode no --bind 0.0.0.0` — Redis is open to all network interfaces with no auth.

### Network name inconsistencies
| Compose File | Network |
|-------------|---------|
| `docker-compose.yml` | `legal-ai-network` |
| `docker-compose.yaml` | `legal-ai-network` |
| `docker-compose.test.yml` | `deeds-network` |

### Duplicate Redis password patterns
| Compose File | Location | Redis URL used |
|-------------|----------|----------------|
| `docker-compose.yml` frontend env | `redis://redis:6379` | No password |
| `docker-compose.yml` tensorrt env | `redis://:redis@redis:6379/0` | Password = "redis" |

**Problem:** Same compose file, two services, different Redis auth expectations.

---

## 4. VITE PROXY vs COMPOSE COLLISION SUMMARY

| Vite Proxy Path | Vite Target | Docker Compose Service (same port) | Collision? |
|----------------|-------------|-------------------------------------|------------|
| `/grpc` | `localhost:50051` | embedding-service / gemma-reranker | OK (intended) |
| `/api/cuda` | `localhost:8097` | tensorrt-llm WS port | **WRONG** (should be 8096 HTTP) |
| `/ws/rag` | `ws://localhost:${wsPort}` | enhanced-rag | OK (variable) |
| `/ws/canvas` | `ws://localhost:8095` | langextract / quic-server / gpu-orch | **AMBIGUOUS** |
| `/ws/chat` | `ws://localhost:8096` | tensorrt-llm HTTP | **COLLISION** |

---

## 5. RECOMMENDED FIXES (Phase 1-2 Inputs)

### Immediate (Phase 0 deliverable)
1. **Assign unique ports** — stop reusing 8095 for 3 services:
   - LangExtract: keep **8095** (already deployed as `phase66-langextract`)
   - MINIO SIMD sidecar: move to **8099** (unused)
   - QUIC server: move to **8085** (unused)
2. **Fix MCP server.ts** — replace `process.env.LANGEXTRACT_URL || 'http://localhost:8098'` with `ENV.LANGEXTRACT_URL` (import from env.server.ts, or pass as argument since MCP runs as separate process — use `process.env.LANGEXTRACT_URL || 'http://localhost:8095'` at minimum)
3. **Fix MINIO_SIMD_URL aliasing** — `api/web/crawl/+server.ts`, `langextractBatch.ts`, and `photos/+server.ts` should use `ENV.LANGEXTRACT_URL` instead of `ENV.MINIO_SIMD_URL`
4. **Fix Vite proxy `/api/cuda`** — change target from 8097 to 8096 (TensorRT HTTP port)
5. **Fix Vite proxy `/ws/chat`** — either: (a) point to a real chat WS service, or (b) remove if unused

### Phase 1 (ENV consolidation)
1. Add missing vars to `ENV` object: `JWT_SECRET`, `SERVICE_AUTH_TOKEN`, `OLLAMA_CHAT_MODEL`, `OLLAMA_EMBED_MODEL`, `REDIS_PASSWORD`, `REDIS_HOST`
2. Migrate all `process.env.*` references in `src/lib/server/` to use `ENV.*`
3. Add feature flags: `LANGEXTRACT_ENABLED`, `SIMD_ENABLED` (already have `EMBEDDING_GRPC_ENABLED`)

### Phase 2 (Docker hardening)
1. Add Redis password to `docker-compose.yml` and remove `--protected-mode no --bind 0.0.0.0`
2. Standardize container names and network names across all compose files
3. Add health checks to frontend service in `docker-compose.yml`

---

## 6. PORT ALLOCATION TABLE (Proposed Canonical)

| Port | Service | Owner | Feature Flag |
|------|---------|-------|-------------|
| 5173-5179 | SvelteKit dev servers | frontend | — |
| 6173-6179 | HMR WebSocket | frontend | — |
| 4222 | NATS | QUIC/NATS transport | `EMBEDDING_QUIC_ENABLED` |
| 4433-4434 | QUIC UDP | quic-server | `EMBEDDING_QUIC_ENABLED` |
| 5432 | PostgreSQL | postgres | — |
| 6333 | Qdrant HTTP | qdrant | — |
| 6334 | Qdrant gRPC | qdrant | — |
| 6379 | Redis | redis | — |
| 8000 | TensorRT primary / Triton HTTP | inference | `TENSORRT_URL` |
| 8001 | Triton gRPC | triton-server | — |
| 8082 | Playwright auditor | dev tool | — |
| **8085** | **QUIC HTTP fallback** (proposed move) | quic-server | — |
| 8094 | Enhanced RAG Go service | enhanced-rag | — |
| **8095** | **LangExtract ONLY** | phase66-langextract | `LANGEXTRACT_ENABLED` |
| **8096** | **TensorRT-LLM HTTP** | tensorrt-llm | `TENSORRT_URL` |
| **8097** | **TensorRT-LLM WS** | tensorrt-llm | — |
| **8098** | **TensorRT-LLM Health** | tensorrt-llm | — |
| **8099** | **MINIO SIMD sidecar** (proposed move) | minio-simd | `MINIO_SIMD_ENABLED` |
| 9000 | MinIO | minio | — |
| 11434 | Ollama | ollama | — |
| 50051 | gRPC embedding | embedding-server | `EMBEDDING_GRPC_ENABLED` |
| 50053 | gRPC retrieval (future) | retrieval-server | `RETRIEVAL_GRPC_ENABLED` |
