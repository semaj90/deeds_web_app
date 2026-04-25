# Task Pipeline — Production Wiring & Consolidation

## Date: March 9, 2026
## Source: PRODUCTION_AUDIT_2026-03-09.md (3 parallel audits)

---

## Priority Legend

- **P0** — Blocks production deployment / security vulnerability
- **P1** — Should fix before beta / reliability issue
- **P2** — Nice to have / quality of life
- **EST** — Estimated effort per task

---

## Sprint 1: Critical Fixes (P0, ~4 hours)

### 1.1 Fix Broken Imports (EST: 30 min)
- [ ] Delete or fix `clients/ollama.ts` (syntax error)
- [ ] Redirect `llm-router.ts` → canonical embedding
- [ ] Redirect `adaptive-index-orchestrator.ts` → canonical embedding
- [ ] Redirect `vector.service.ts` → `vector/qdrant-manager.js`
- [ ] Verify: `svelte-check` still 0 errors

### 1.2 Graceful Shutdown Handler (EST: 45 min)
- [ ] Add `process.on('SIGTERM')` / `process.on('SIGINT')` in `hooks.server.ts`
- [ ] Close PG pool, Redis, RabbitMQ, Qdrant connections
- [ ] Flush audit log buffer
- [ ] Set drain timeout (30s max)
- [ ] Test: `kill -TERM <pid>` → clean exit

### 1.3 Secrets Externalization (EST: 1 hour)
- [ ] Move VAPID keys from `web-push-service.ts` to `.env`
- [ ] Move DB passwords from `docker-compose.yml` to `.env` or Docker secrets
- [ ] Add `.env.example` with placeholder values
- [ ] Ensure `.env` is in `.gitignore` (verify)
- [ ] Guard `DEV_BYPASS_AUTH` with `NODE_ENV !== 'production'` hard check

### 1.4 CORS Enforcement (EST: 30 min)
- [ ] Add CORS hook to `hooks.server.ts` `sequence()`
- [ ] Whitelist specific origins (localhost:5173 for dev, production domain)
- [ ] Block cross-origin API calls from unknown origins

### 1.5 Request Timeouts (EST: 30 min)
- [ ] Audit all `fetch()` calls in server code for missing `AbortSignal.timeout()`
- [ ] Add 30s default timeout wrapper
- [ ] LLM inference routes get 300s timeout
- [ ] Evidence upload routes get 120s timeout

### 1.6 TLS Configuration (EST: 30 min)
- [ ] Replace `tls internal` in Caddyfile with Let's Encrypt or real certs
- [ ] Configure HSTS header (already in recommended Caddyfile)
- [ ] Test HTTP→HTTPS redirect

---

## Sprint 2: Embedding Consolidation (P1, ~3 hours)

### 2.1 Canonical `generateEmbedding()` (EST: 2 hours)
- [ ] Audit all 5+ `generateEmbedding()` implementations
- [ ] Determine canonical: `ai/embeddings.ts` (gRPC→Ollama→mock chain)
- [ ] Add missing features from duplicates (dimension quantize, batch support)
- [ ] Redirect all importers to canonical
- [ ] Archive duplicates to `deeds_labs/embedding-duplicates-2026-03-09/`
- [ ] Verify: `svelte-check` 0 errors

### 2.2 `cosineSimilarity()` → `ml/math-utils.ts` (EST: 45 min)
- [ ] Create `src/lib/server/ml/math-utils.ts` with `cosineSimilarity`, `dotProduct`, `l2Normalize`
- [ ] Redirect 3 importers
- [ ] Remove inline implementations

### 2.3 `getOllamaEndpoint()` Dedup (EST: 15 min)
- [ ] Check if `ai/ollama-config.ts` still has separate `getOllamaEndpoint()`
- [ ] If so, redirect to `ollama.ts` canonical
- [ ] Archive if no unique logic

---

## Sprint 3: Infrastructure Hardening (P1, ~4 hours)

### 3.1 Health Check Aggregator (EST: 1 hour)
- [ ] Create `/api/health` endpoint (or consolidate existing health routes)
- [ ] Check: PostgreSQL (`SELECT 1`), Redis (`PING`), Qdrant (`/healthz`), RabbitMQ (channel check), Ollama (`/api/tags`)
- [ ] Return JSON: `{ status: 'ok'|'degraded'|'down', services: {...}, uptime: ... }`
- [ ] Wire into Caddy `health_uri`

### 3.2 Structured Logging (EST: 2 hours)
- [ ] Install `pino` (lightweight JSON logger)
- [ ] Replace `console.log/error/warn` in server code with pino
- [ ] Add request ID to all log entries
- [ ] Configure log levels per environment (debug=dev, info=prod)

### 3.3 Circuit Breaker for Ollama (EST: 1 hour)
- [ ] Add circuit breaker in `ollama.ts` canonical
- [ ] States: CLOSED (normal) → OPEN (after 3 failures in 60s) → HALF_OPEN (probe after 30s)
- [ ] When OPEN: return cached/fallback responses, don't hit Ollama
- [ ] Log state transitions

### 3.4 RabbitMQ Dead-Letter Exchange (EST: 30 min)
- [ ] Configure DLX on all 7 queues in `rabbitmq-manager-fixed.ts`
- [ ] Add `dead-letter` queue for failed message inspection
- [ ] Set max retry count (3)

---

## Sprint 4: SvelteKit 2 Production Wiring (P1, ~3 hours)

### 4.1 Middleware Chain (EST: 1 hour)
- [ ] Add `requestIdHook` to `hooks.server.ts` — generate UUID, set `X-Request-ID` header
- [ ] Add `compressionHook` — `@polka/compression` for non-SSE responses
- [ ] Ensure `sequence()` order: requestId → cors → rateLimit → auth → compression
- [ ] Test all hooks with `npm run dev`

### 4.2 adapter-node Configuration (EST: 30 min)
- [ ] Verify `svelte.config.js` has correct `adapter-node` settings
- [ ] Set `BODY_SIZE_LIMIT=52428800` in production env
- [ ] Set `ORIGIN`, `PROTOCOL_HEADER`, `HOST_HEADER` for proxy setup
- [ ] Test CSRF protection with correct ORIGIN

### 4.3 Caddyfile Setup (EST: 1 hour)
- [ ] Create production `Caddyfile` (from audit recommendations)
- [ ] `flush_interval -1` for SSE endpoints
- [ ] Security headers (HSTS, X-Frame-Options, CSP)
- [ ] Compression with SSE exclusion
- [ ] Health check configuration
- [ ] Test with `caddy run --config Caddyfile`

### 4.4 Docker Compose Production (EST: 30 min)
- [ ] Update `docker-compose.yml` with `condition: service_healthy` on all `depends_on`
- [ ] Add memory limits (`deploy.resources.limits.memory`)
- [ ] Add health checks for app container
- [ ] Add `restart: unless-stopped` on all services
- [ ] Separate `.env` file for secrets

---

## Sprint 5: Type Safety & Cleanup (P2, ~4 hours)

### 5.1 `as any` Cast Audit (EST: 3 hours)
- [ ] Grep for `as any` across server code
- [ ] Categorize: necessary (FFI/external) vs fixable (missing types)
- [ ] Replace fixable casts with proper generics or `unknown` + type guards
- [ ] Target: reduce from 215+ to <50

### 5.2 Dead Export Cleanup (EST: 30 min)
- [ ] Find exports with 0 importers using `grep -r` for each export name
- [ ] Remove orphaned exports (keep functions that are genuinely public API)
- [ ] Verify: `svelte-check` still clean

### 5.3 Error Handling Consistency (EST: 30 min)
- [ ] Standardize on `async/await` + try/catch (remove `.then()` chains in server code)
- [ ] Ensure all API routes use consistent error response format
- [ ] Add missing error logging in catch blocks

---

## Sprint 6: Monitoring & Observability (P2, ~3 hours)

### 6.1 Prometheus Metrics (EST: 1.5 hours)
- [ ] Add `prom-client` or lightweight metrics
- [ ] Expose `/metrics` endpoint
- [ ] Track: request count, latency histogram, error rate, active SSE connections, Ollama response time, queue depth

### 6.2 Log Rotation (EST: 30 min)
- [ ] Configure pino log rotation or logrotate for file-based audit logs
- [ ] Set max file size (100MB) and retention (30 days)

### 6.3 SSE Reconnection (EST: 1 hour)
- [ ] Add exponential backoff to client-side SSE EventSource
- [ ] Add `Last-Event-ID` support for resuming interrupted streams
- [ ] Test: kill server mid-stream → client reconnects + resumes

---

## Evidence Type Unification (Separate Plan)

A detailed plan exists for evidence type unification + metadata-aware analysis pipeline.
See plan file: `silly-squishing-barto.md`

Phases: Enum unification → MIME detection → ACE context → Docling PDF → MCP audio → VLM + LangExtract

---

## Completion Tracking

| Sprint | Tasks | Estimated Hours | Status |
|--------|-------|----------------|--------|
| Sprint 1: Critical Fixes | 6 groups | ~4h | NOT STARTED |
| Sprint 2: Embedding Consolidation | 3 groups | ~3h | NOT STARTED |
| Sprint 3: Infra Hardening | 4 groups | ~4h | NOT STARTED |
| Sprint 4: SvelteKit 2 Production | 4 groups | ~3h | NOT STARTED |
| Sprint 5: Type Safety | 3 groups | ~4h | NOT STARTED |
| Sprint 6: Monitoring | 3 groups | ~3h | NOT STARTED |
| **Total** | **23 groups** | **~21h** | |

---

*Generated from PRODUCTION_AUDIT_2026-03-09.md — March 9, 2026*
