# Production Readiness Audit — Deeds Legal AI Platform

## Date: March 9, 2026
## Grade: B+ (79/100)
## Scope: Server consolidation + Infrastructure wiring + SvelteKit 2 production patterns

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Server Consolidation Gaps](#part-1-server-consolidation-gaps)
3. [Infrastructure Wiring Audit](#part-2-infrastructure-wiring-audit)
4. [SvelteKit 2 + Caddy + QUIC Production Patterns](#part-3-production-patterns)
5. [Task Pipeline](#task-pipeline)

---

## Executive Summary

Three parallel audits were performed across the entire codebase:

| Audit Domain | Files Scanned | Issues Found | Critical (P0) |
|-------------|--------------|-------------|----------------|
| Server Consolidation | 551 TS files | 47+ issues | 4 (syntax error, broken imports) |
| Infrastructure Wiring | All infra files | 22 issues | 7 (shutdown, CORS, TLS, timeouts) |
| Production Patterns | Web research | 15 recommendations | 5 (ORIGIN, adapter-node, SSE) |

**Key findings:**
- 1 syntax error in active file (`clients/ollama.ts`)
- 6+ broken imports after consolidation archive
- 7 duplicate function groups still remaining (post-Ollama consolidation)
- 215+ `as any` type casts across server code
- No graceful shutdown handler (Node.js connections leak on restart)
- No CORS enforcement on API routes
- Hardcoded secrets (VAPID keys, DB passwords) in source
- Dev fallbacks (`DEV_BYPASS_AUTH`) reachable in production

---

## Part 1: Server Consolidation Gaps

### 1.1 Critical: Syntax Error

| File | Issue |
|------|-------|
| `src/lib/server/clients/ollama.ts` | Malformed/truncated — syntax error prevents import |

**Action:** Delete or fix. If no real importers outside `services/`, archive to `deeds_labs/`.

### 1.2 Broken Imports (Post-Archive)

These files import from paths that were archived in this session or earlier sessions:

| Importer | Broken Import | Fix |
|----------|--------------|-----|
| `llm-router.ts` | `'./services/embedding-service.js'` | Redirect to canonical embedding chain |
| `adaptive-index-orchestrator.ts` | `'../services/embedding-service.js'` | Redirect to canonical |
| `vector.service.ts` | `'../services/qdrant-service.js'` | Redirect to `vector/qdrant-manager.js` |
| Files importing `redis-adapter.ts` | `'./adapters/redis-adapter.js'` | Deleted — use `redis.ts` directly |
| Files importing `embedding-gateway.ts` | `'./embedding-gateway.js'` | Deleted — use `grpc/embedding-client.js` |
| Files importing `services/index.ts` | `'./services/index.js'` | Deleted barrel — import canonicals directly |

### 1.3 Remaining Duplicate Function Groups

After Ollama consolidation (4 files → 1 canonical), these duplicates remain:

| Function | Copies | Canonical | Duplicates |
|----------|--------|-----------|------------|
| `generateEmbedding()` | 5+ | `ai/embeddings.ts` | `embeddings-simple.ts`, `embedding/pgvector-*`, `grpc/embedding-client.ts` |
| `cosineSimilarity()` | 3 | `ml/multi-modal-ranker.ts` | `ai/multimodal-fusion.ts`, `services/similar-cases.service.ts` |
| `getOllamaEndpoint()` | 2 | `ollama.ts` | `ai/ollama-config.ts` (used by embeddings.ts) |
| `chunkText()` | 2 | `indexer/legal-chunker.ts` | `streaming/chunked-response.ts` (different purpose — OK) |
| `extractEntities()` | 2 | `analysis/entity-extraction.ts` | `contradictionEngine/extractors/mdExtractor.ts` |
| Redis client creation | 3 | `redis.ts` | `cache.ts` (memory tier), `middleware/rate-limiter.ts` |
| Health check endpoints | 4 | Various `/api/health/*` routes | Scattered pattern, no central health registry |

### 1.4 Type Safety Issues

- **215+ `as any` casts** across server code — many mask real type errors
- **12+ orphaned exports** — functions exported but never imported anywhere
- **11+ inconsistent patterns**: mixed `async/await` + `.then()`, inconsistent error handling

### 1.5 Consolidation Roadmap (5 Phases)

**Phase A — Immediate (< 1 hour):** Delete/fix `clients/ollama.ts`, create redirect stubs for 3 broken imports, verify with `svelte-check`

**Phase B — Embedding Chain (2-3 hours):** Consolidate 5+ `generateEmbedding()` into canonical `ai/embeddings.ts` with gRPC→Ollama→mock fallback chain. Archive duplicates.

**Phase C — Math/ML Utils (1-2 hours):** Extract `cosineSimilarity`, `dotProduct`, `l2Normalize` into `ml/math-utils.ts`. Update 6+ importers.

**Phase D — Redis/Cache (2-3 hours):** Ensure single Redis client (`redis.ts`), single cache-aside pattern (`cache.ts`), remove 3+ duplicate Redis client creations.

**Phase E — Type Safety (3-4 hours):** Audit 215+ `as any` casts. Replace with proper generics or `unknown` + type guards. Remove orphaned exports.

---

## Part 2: Infrastructure Wiring Audit

### 2.1 P0 — Critical (Must Fix Before Production)

| # | Issue | Current State | Required Fix |
|---|-------|--------------|-------------|
| P0-1 | **No graceful shutdown** | Node.js exits immediately on SIGTERM | Add `process.on('SIGTERM')` handler: drain HTTP connections, close Redis/PG/RabbitMQ pools, flush audit logs, then `process.exit(0)` |
| P0-2 | **No CORS enforcement** | API routes accept any origin | Add `handle` hook or Caddy `header` directive for `Access-Control-Allow-Origin` |
| P0-3 | **Self-signed TLS** | `tls internal` in Caddyfile | Use Let's Encrypt or bring real certs for production |
| P0-4 | **No request timeout** | Server-side requests can hang forever | Add `AbortSignal.timeout()` to all fetch calls, 30s default |
| P0-5 | **Hardcoded VAPID keys** | In `web-push-service.ts` source code | Move to `.env` / secret manager |
| P0-6 | **Hardcoded DB passwords** | In `docker-compose.yml` and config files | Use Docker secrets or env file not checked into git |
| P0-7 | **Dev fallbacks in prod** | `DEV_BYPASS_AUTH=true` pattern | Guard with `NODE_ENV !== 'production'` check that cannot be overridden by env var alone |

### 2.2 P1 — Important (Fix Before Beta)

| # | Issue | Fix |
|---|-------|-----|
| P1-1 | No health check aggregator | Create `/api/health` that checks PG, Redis, Qdrant, RabbitMQ, Ollama |
| P1-2 | No structured logging | Replace `console.log/error` with pino or winston (JSON format for log aggregation) |
| P1-3 | No rate limiting on SSE | SSE endpoints (`/api/sse/*`) bypass rate limiter — add connection limit |
| P1-4 | Missing `Content-Security-Policy` | Add CSP headers via Caddy or SvelteKit hooks |
| P1-5 | No circuit breaker for Ollama | If Ollama is down, all requests fail slowly — add circuit breaker pattern |
| P1-6 | RabbitMQ no DLQ | Failed messages silently dropped — add dead-letter exchange |
| P1-7 | Qdrant no backup strategy | Vector data not backed up — add snapshot schedule |
| P1-8 | No DB connection pooling limits | PG pool defaults may exhaust connections under load |
| P1-9 | MinIO bucket policy too permissive | Review bucket policies for least-privilege |
| P1-10 | No request ID tracing | Add `X-Request-ID` header propagation for distributed tracing |

### 2.3 P2 — Nice to Have (Post-Launch)

| # | Issue | Fix |
|---|-------|-----|
| P2-1 | No metrics endpoint | Add Prometheus `/metrics` for monitoring |
| P2-2 | No log rotation | File-based audit logs grow unbounded — add logrotate |
| P2-3 | Docker images not multi-stage | Reduce image size with multi-stage builds |
| P2-4 | No blue-green deployment | Add deployment strategy for zero-downtime updates |
| P2-5 | No load testing | Add k6 or artillery scripts for capacity planning |
| P2-6 | WebSocket/SSE reconnection | Client-side SSE reconnection is basic — add exponential backoff |

---

## Part 3: SvelteKit 2 + Caddy + QUIC Production Patterns

### 3.1 SvelteKit 2 adapter-node

**Critical env vars for production:**
```bash
ORIGIN=https://yourdomain.com        # CSRF protection — MUST match actual domain
PROTOCOL_HEADER=X-Forwarded-Proto     # Behind reverse proxy
HOST_HEADER=X-Forwarded-Host          # Behind reverse proxy
ADDRESS_HEADER=X-Forwarded-For        # Client IP for rate limiting
PORT=3000                              # Node.js listen port
BODY_SIZE_LIMIT=52428800              # 50MB for evidence uploads (default 512KB!)
```

**Key gotchas:**
- `ORIGIN` mismatch → all form POSTs fail with CSRF 403
- `BODY_SIZE_LIMIT` default (512KB) blocks file uploads — must increase
- `adapter-node` does NOT set security headers — rely on Caddy or hooks

### 3.2 Caddy Reverse Proxy Configuration

**Recommended Caddyfile:**
```caddyfile
yourdomain.com {
    # Automatic HTTPS + HTTP/3 (QUIC) — enabled by default

    reverse_proxy localhost:3000 {
        # SSE support — critical for streaming responses
        flush_interval -1

        # Timeouts
        transport http {
            dial_timeout 5s
            response_header_timeout 300s   # Long for LLM generation
            read_timeout 300s
        }

        # Health checking
        health_uri /api/health
        health_interval 30s
        health_timeout 5s
    }

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -Server
    }

    # Compression (skip SSE)
    encode {
        gzip
        zstd
        match {
            header !Content-Type text/event-stream
        }
    }

    # Rate limiting (requires custom build: mholt/caddy-ratelimit)
    # rate_limit {remote.host} 100r/m
}
```

**Key patterns:**
- `flush_interval -1` — REQUIRED for SSE streaming (otherwise Caddy buffers and breaks SSE)
- HTTP/3 (QUIC) — enabled automatically by Caddy with TLS
- Response timeout 300s — long enough for LLM generation + RAG pipeline
- Custom build needed for rate limiting plugin
- Compress everything EXCEPT `text/event-stream`

### 3.3 QUIC Assessment

**Recommendation: Let Caddy handle QUIC at the edge. No Node.js QUIC needed.**

- Caddy automatically negotiates HTTP/3 (QUIC) with supporting browsers
- Internal Node.js ↔ Caddy traffic stays HTTP/1.1 or HTTP/2 (localhost, no benefit from QUIC)
- QUIC benefits: 0-RTT connection setup, multiplexed streams, connection migration (mobile)
- The existing QUIC/NATS bridge in `go-microservice/` handles inter-service transport separately

### 3.4 Docker Compose Production Pattern

```yaml
services:
  app:
    build: ./sveltekit-frontend
    restart: unless-stopped
    environment:
      - ORIGIN=https://yourdomain.com
      - PROTOCOL_HEADER=X-Forwarded-Proto
      - HOST_HEADER=X-Forwarded-Host
      - BODY_SIZE_LIMIT=52428800
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      qdrant:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 2G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**Key patterns:**
- `condition: service_healthy` — app waits for DB/Redis/Qdrant before starting
- `restart: unless-stopped` — auto-restart on crash
- Memory limits — prevent OOM from LLM inference memory leaks
- Health checks on ALL services

### 3.5 Middleware Chain (SvelteKit hooks)

**Recommended `hooks.server.ts` structure:**
```
sequence(
  requestIdHook,        // Add X-Request-ID for tracing
  corsHook,             // CORS enforcement
  rateLimitHook,        // Rate limiting (existing)
  authHook,             // Authentication (existing)
  compressionHook       // Response compression
)
```

Current hooks have auth + rate limiting. Missing: request ID, CORS, compression.

---

## Task Pipeline

See `deeds_labs/TASK_PIPELINE_2026-03-09.md` for the prioritized task list.

---

## Appendix A: Unsloth/TRT-LLM References (Preserved)

Active files containing unsloth/TRT-LLM training references (DO NOT archive these):

| File | Reference |
|------|-----------|
| `src/routes/(app)/admin/qlora-training/+page.svelte` | QLoRA fine-tuning UI |
| `@3_3_26Gemma3_12B_Legal_Production.ipynb` | Full training notebook |
| `docker-compose.triton.yml` | Triton Inference Server deployment |
| `src/lib/ai/model-ids.ts` | Model ID constants |
| `src/lib/server/inference/inference-router.ts` | TRT-LLM inference routing |
| `src/routes/api/ai/tensorrt/+server.ts` | TensorRT API endpoint |
| `src/routes/api/ai/tensorrt/stream/+server.ts` | TensorRT SSE streaming |

---

## Appendix B: Files Archived This Session

| Source | Archive Location | Reason |
|--------|-----------------|--------|
| `ai/ollama-client.ts` | `ollama-duplicates-2026-03-09/` | Consolidated into `ollama.ts` |
| `ollama-service.ts` | `ollama-duplicates-2026-03-09/` | 3-line barrel, redirected |
| `config/ollama.ts` | `ollama-duplicates-2026-03-09/` | 0 real importers |
| `embeddings/ollama.ts` | `ollama-duplicates-2026-03-09/` | Consolidated into `ollama.ts` |
| `db/pgvector-utils.temp.ts` | `server-orphans-2026-03-09/` | Temp file, recovered + archived |
| `redis-adapter.ts` | Deleted (git tracked) | Superseded by `redis.ts` |
| `embedding-gateway.ts` | Deleted (git tracked) | Superseded by `grpc/embedding-client.ts` |
| `embedding-service.ts` | Deleted (git tracked) | Superseded by `ai/embeddings.ts` |
| `embeddings.ts` (root) | Deleted (git tracked) | Superseded by `ai/embeddings.ts` |
| 20+ service files | Deleted (git tracked) | In blanket-excluded `services/` dir |

---

*Generated by 3 parallel audit agents — March 9, 2026*
