# Startup Scripts Audit

Generated: 2026-06-09  
Scope: `C:\Users\james\Videos\deeds-web-app`

---

## TL;DR

| Category | Count | Status |
|----------|-------|--------|
| PowerShell (.ps1) | 54 | Many duplicates / stale |
| Bash (.sh) | 20 | Mixed relevance |
| Docker Compose (.yml) | 6 root + 7 sub | Several obsolete |
| Node.js startup (.mjs) | 7 dedicated + atlas/ | Consolidated in scripts/startup/ |
| npm scripts (infra-related) | ~35 | Scattered naming |

**Canonical replacement**: `scripts/dev/start-parent-atlas.ps1` (new)

---

## Section 1 — Docker Compose Files

| File | Profiles | Services | Use |
|------|----------|----------|-----|
| `docker-compose.yml` | default / full / gpu | postgres:5434, redis:6379, qdrant:6333, rabbitmq:5672, neo4j:7474, couchdb:5984, nats:4222, minio:9000, bifrost, searxng, langfuse, go-retrieval, go-embed | **CANONICAL — use this** |
| `docker-compose.dev.yml` | default | postgres:5433 (pg17), redis:6379, legal-gateway, enhanced-rag | Superseded by main compose |
| `docker-compose.test.yml` | default | test postgres+redis | CI only |
| `docker-compose.vector.yml` | — | Qdrant specialist | Superseded |
| `docker-compose.redis8-eval.yml` | — | Redis 8 eval | Evaluation only |
| `docker-compose.production.yml` | — | Production deploy | Ops only |
| `sveltekit-frontend/docker-compose.dev.yml` | — | sveltekit dev | Superseded by root |
| `sveltekit-frontend/docker-compose.light.yml` | — | Minimal stack | Superseded |
| `sveltekit-frontend/docker-compose.full.yml` | — | Full stack | Superseded |
| `sveltekit-frontend/docker-compose.phase89.yml` | — | Phase 89 snapshot | **OBSOLETE** |
| `infra/caddy/docker-compose.caddy.yml` | — | Caddy :8443 QUIC | Optional reverse proxy |
| `claude-mem/docker-compose.yml` | — | claude-mem plugin | Dev tool only |
| `docker/docker-compose.gpu.yml` | — | GPU inference | Superseded by --profile gpu |

**Recommendation**: Use only `docker-compose.yml`. The `--profile full` flag adds neo4j, couchdb, nats, go-services. The `--profile gpu` adds tensorrt-llm.

---

## Section 2 — PowerShell Scripts

### Canonical / Active

| Script | Purpose | Ports | Required Env | Status |
|--------|---------|-------|--------------|--------|
| `scripts/start-all.ps1` | Master startup (Docker + Ollama + health) | All services | POSTGRES_PASSWORD, REDIS_PASSWORD | **Active — verbose, best for first run** |
| `scripts/launch-turboquant.ps1` | llama-server with TurboQuant KV cache | 8090 | LLAMA_SERVER_PATH, TURBO_PROFILE, TURBO_CTX | **Active — use for GPU inference** |
| `scripts/launch-embed-server.ps1` | Embedding server | 8097 | None | Active |
| `scripts/startup-health-and-trace.ps1` | Health gate with JSON output | — | DATABASE_URL, REDIS_URL | **Active — pre-flight check** |
| `scripts/ace-startup-with-cooldown.ps1` | ACE incremental startup (1h cooldown) | — | DATABASE_URL, REDIS_URL | Active |
| `scripts/production-gate.ps1` | Production readiness check | — | All service URLs | Active |
| `scripts/setup-ace-rabbitmq.ps1` | RabbitMQ queues/exchanges setup | 5672 | RABBITMQ_USER/PASS | One-time setup |
| `scripts/setup-ace-minio.ps1` | MinIO/SeaweedFS bucket setup | 8333/9000 | MINIO_* | One-time setup |
| `scripts/start-whisper-server.ps1` | Whisper STT server | varies | — | Optional |
| `scripts/start-rtx8gb-service.ps1` | RTX 8GB GPU service | — | CUDA_VISIBLE_DEVICES | Optional GPU |
| `scripts/dev-agentic.ps1` | Agentic dev environment | — | — | Dev tool |

### Deprecated / Stale

| Script | Reason Deprecated | Canonical Replacement |
|--------|-------------------|----------------------|
| `scripts/start-dev-environment.ps1` | Uses phase66-* container names (old naming) | `docker compose up -d` with `docker-compose.yml` |
| Any script starting phase66-* containers | Phase 66 naming obsolete | `docker compose up -d` |

---

## Section 3 — Bash Scripts

| Script | Purpose | Status |
|--------|---------|--------|
| `scripts/start_infrastructure.sh` | Start/stop/status individual containers (postgres-pgvector, legal-ai-redis, etc.) | Superseded by compose |
| `scripts/start_services.sh` | `docker run` individual services | **OBSOLETE** — replaced by compose |
| `scripts/start-triton.sh` | TensorRT Triton inference server | Optional GPU |
| `scripts/bootstrap_rabbitmq.sh` | RabbitMQ init | One-time setup |
| `scripts/setup-ace-minio.sh` | MinIO/S3 bucket setup | One-time setup |
| `scripts/setup-ace-rabbitmq.sh` | RabbitMQ queues setup | One-time setup |
| `scripts/setup_rabbitmq_dlq.sh` | DLQ configuration | One-time setup |
| `scripts/startup/health-check.sh` | Generic health probe | Superseded by startup-health-and-trace.ps1 |
| `scripts/startup/init-workspace.sh` | Workspace init | Used by CI |

---

## Section 4 — Node.js Startup Scripts

| Script | Purpose | Status |
|--------|---------|--------|
| `scripts/startup/start-mcp-server.mjs` | TRACE MCP server :8788 | **Active** |
| `scripts/startup/check-redis-flavor.mjs` | Detects Valkey vs Redis | **Active** |
| `scripts/startup/smoke-valkey-node-client.mjs` | Valkey smoke test | **Active** |
| `scripts/startup/startup-truth.mjs` | Verifies startup state matches expected | **Active** |
| `scripts/startup/build-cuda-libtorch-on-startup.mjs` | CUDA bridge warm-up | **Active — GPU only** |
| `scripts/ace-startup-health.mjs` | ACE pipeline health reporter | **Active** |
| `scripts/atlas/check-infra.mjs` | Infrastructure health check | **Active** |
| `scripts/atlas/validate-dev-services.mjs` | Dev services validation | **Active** |
| `scripts/atlas/atlas-lane-health-loop.mjs` | Continuous health monitoring | Active |

---

## Section 5 — npm Scripts (Startup/Infra Related)

| npm Script | Command | Status |
|------------|---------|--------|
| `dev` | vite dev :5173 with env injection | **Canonical dev entry** |
| `startup:ace` | ace-incremental-startup.mjs | **Active** |
| `startup:health` | startup-health-and-trace.ps1 | **Active pre-flight** |
| `startup:truth` | startup-truth.mjs | Active |
| `startup:redis:flavor` | check-redis-flavor.mjs | Active |
| `turbo:start` | llama-server (text-only) | Active GPU |
| `turbo:start:detached` | detached llama-server | Active GPU |
| `health:api` | ace-startup-health.mjs | Active |
| `start-with-smoke` | smoke gate + dev | Active |
| `start:dev:smoke` | smoke + dev combined | Active |
| `startup:redis8-eval` | docker compose redis8 eval | Evaluation only |
| `smoke:gpu` | GPU bridge probe | Active GPU |
| `karpathy:gpu` | Karpathy authority blend | **Active identity** |
| `karpathy:backfill:qdrant` | Backfill karpathy → Qdrant | **NEW (Phase 7)** |
| `neo4j:align:source-refs` | Set canonicalSourceRef on Neo4j | **NEW (Phase 7)** |
| `identity:warm` | Warm Valkey feature cache | **NEW (Phase 7)** |
| `identity:gate` | Run identity completion gate | **NEW (Phase 7)** |

---

## Section 6 — Duplicate / Conflict Analysis

### Duplicate Docker Compose stacks
The following compose files all define a Postgres + Redis stack:
- `docker-compose.yml` (canonical, :5434)
- `docker-compose.dev.yml` (:5433, pg17 — **OLD**)
- `sveltekit-frontend/docker-compose.dev.yml` (:5433 — **OLD**)
- `sveltekit-frontend/docker-compose.light.yml` (varies — **OLD**)

**Risk**: Running multiple simultaneously creates port conflicts.  
**Fix**: Use only `docker-compose.yml` from repo root.

### Container Name Conflicts
Old scripts use `phase66-*` names; new compose uses `legal-ai-*` names.  
Running both creates orphan containers.  
Check with: `docker ps -a --format '{{.Names}}' | grep -E "phase66|legal-ai"`

### Port 5433 vs 5434
- `docker-compose.dev.yml` → 5433 (PostgreSQL pg17)
- `docker-compose.yml` → 5434 (PostgreSQL pg18)
- `DATABASE_URL` in `.env` must match whichever is running.

---

## Section 7 — Recommended Canonical Commands

```powershell
# Start all services (default profile: postgres, redis, qdrant, rabbitmq)
docker compose up -d

# Start with optional services (neo4j, couchdb, nats, go-services, langfuse)
docker compose --profile full up -d

# Stop all
docker compose down

# Check status
docker compose ps

# Start GPU inference (llama-server with TurboQuant)
$env:TURBO_PROFILE = 'turboquant-safe'
$env:TURBO_CTX = '65536'
./scripts/launch-turboquant.ps1

# Pre-flight health check
npm run startup:health

# Start SvelteKit dev server
cd sveltekit-frontend && npm run dev

# Identity pipeline (after services up)
npm run karpathy:gpu
npm run identity:warm
npm run identity:gate
```

---

## Section 8 — New Canonical Scripts (Phase G)

| Script | Purpose |
|--------|---------|
| `scripts/dev/start-parent-atlas.ps1` | Start postgres+redis+qdrant+neo4j+rabbitmq |
| `scripts/dev/stop-parent-atlas.ps1` | Stop and remove containers |
| `scripts/dev/status-parent-atlas.ps1` | Show service health |

---

## Deprecated Scripts (Do Not Delete — Archive Reference)

The following scripts are superseded but retained for reference:
- `scripts/start_services.sh` — raw `docker run` invocations; use compose
- `scripts/start-dev-environment.ps1` — phase66 naming, old ports
- `sveltekit-frontend/docker-compose.phase89.yml` — snapshot, not for use
- `sveltekit-frontend/docker-compose.light.yml` — superseded by `--profile` flags
- `sveltekit-frontend/docker-compose.full.yml` — superseded by `--profile full`
