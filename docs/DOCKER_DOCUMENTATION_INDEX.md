# Docker Documentation Index
**Last Updated**: June 28, 2026

This directory contains comprehensive documentation for the Docker container stack used in the Legal AI Deeds Web App.

---

## 📖 Quick Reference Guides

### 1. **DOCKER_STARTUP_GUIDE.md** — How to Start Services
**When to read**: First time setup, troubleshooting startup

**Contains**:
- TL;DR startup commands
- Profile explanations (seaweedfs, full, gpu)
- Service inventory by profile
- Recommended startup commands by environment (dev, staging, production)
- Troubleshooting (port conflicts, container exits, GPU issues)

**Key Takeaway**:
```bash
docker-compose --profile full --profile seaweedfs up -d  # Full stack
```

---

### 2. **ENVIRONMENT_CONNECTION_REFERENCE.md** — Credentials & Connection Strings
**When to read**: Connecting to services from scripts or apps

**Contains**:
- Environment variable precedence (which .env file wins)
- Connection defaults for each service
- How to connect from Node.js, CLI, Docker, Python
- `.env` template with all required variables
- Verification script to test all connections

**Key Takeaway**:
```javascript
const postgres = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
```

---

### 3. **DOCKER_CONTAINER_STACK_2026-06-28.md** — Detailed Service Docs
**When to read**: Understanding service roles and health checks

**Contains**:
- Detailed docs for each of 5 core services (postgres, valkey, qdrant, rabbitmq, caddy)
- Port mappings and connection strings
- Health check commands for each service
- Data flow diagram
- Recovery procedures

**Services Documented**:
- ✅ PostgreSQL 18 + pgvector
- ✅ Valkey (Redis-compatible cache)
- ✅ Qdrant (vector database)
- ✅ RabbitMQ (message broker)
- ✅ Caddy (reverse proxy)

---

## 🛡️ Production Hardening

See: **memory/docker-production-hardening.md**

**Contains**:
- Audit trail setup (docker events, shell history)
- Prevention strategies (health checks, git hooks, backups)
- Monitoring & alerting
- Windows WSL2 specific hardening

---

## 📋 Incident Audit

See: **memory/docker-incident-audit-june-27.md**

**What happened**: 21 of 24 Docker services were not running on June 27, 2026

**Root Cause**: Most likely Docker Desktop auto-restart (no command history found)

**Recovery**: `docker-compose --profile full --profile seaweedfs up -d`

**Prevention**: Implemented git hooks, docker events logging, backup procedures

---

## 🚀 Startup Profiles Explained

The root `docker-compose.yml` uses **3 independent profiles**:

### Default (No Profile Needed)
- postgres (5434)
- valkey (6379)
- qdrant (6333-6334)
- rabbitmq (5672, 15672)
- caddy (5178)

**Start with**:
```bash
docker-compose up -d
```

### Full Profile (`--profile full`)
Adds 14 services:
- couchdb, searxng, nats, bifrost, docling-vlm, image-synthesis
- langfuse (clickhouse, worker, web)
- go-services (search, embedding, retrieval)

**Start with**:
```bash
docker-compose --profile full up -d
```

### SeaweedFS Profile (`--profile seaweedfs`)
Adds 4 services:
- seaweedfs-master, seaweedfs-volume, seaweedfs-filer, seaweedfs-s3

**Start with**:
```bash
docker-compose --profile seaweedfs up -d
```

### GPU Profile (`--profile gpu`)
Adds 2 services:
- tensorrt-llm (8099)
- langgraph-synthesis

**Start with**:
```bash
docker-compose --profile gpu up -d
```

### Combined
```bash
docker-compose --profile full --profile seaweedfs --profile gpu up -d  # Everything
```

---

## 🔌 Connection Precedence

**Environment Loading** (highest to lowest priority):
1. System environment variables (`process.env`)
2. `.env.local` in sveltekit-frontend (gitignored)
3. `.env` in sveltekit-frontend
4. `.env.local` in repo root (gitignored)
5. `.env` in repo root
6. Built-in defaults (in connection-config.mjs)

**Loader Function**: `loadRepoEnv()` from `scripts/atlas/connection-config.mjs`

**Used By**:
- All scripts in `scripts/atlas/`
- SvelteKit app (via vite.config.ts)
- Daily startup wrapper (`run-graphify-daily-startup.mjs`)

---

## 📊 Service Roles (Data Flow)

```
┌───────────────────────────────────┐
│ Application (SvelteKit 5173)      │
└────────────────┬──────────────────┘
                 │
                 ↓
        ┌─────────────────┐
        │ Caddy (5178)    │ ← Reverse proxy
        └────────┬────────┘
                 │
        ┌────────┴────────────────────┐
        │   Core Data Services        │
        │ (All running by default)    │
        │                             │
        ├─ Postgres (5434) ← Truth   │
        ├─ Valkey (6379) ← Cache     │
        ├─ Qdrant (6333) ← Vectors   │
        ├─ RabbitMQ (5672) ← Queue   │
        └────────────────────────────┘
                 │
        ┌────────┴────────────────────┐
        │ Enhanced Services (full)    │
        │                             │
        ├─ Neo4j (7687) ← Graph      │
        ├─ NATS (4222) ← Events      │
        ├─ Bifrost (3040) ← Cache    │
        ├─ Go Services (8096+)       │
        └────────────────────────────┘
```

---

## 🔧 Troubleshooting Flowchart

**Q: Only 5 containers started?**
A: Run `docker-compose --profile full --profile seaweedfs up -d`

**Q: Port already allocated error?**
A: Another service using the port. Kill the process or check `lsof -i :PORT`

**Q: Container exits immediately?**
A: Check logs: `docker logs legal-ai-postgres`

**Q: Can't connect to Postgres?**
A: Verify: `docker exec legal-ai-postgres pg_isready`

**Q: Redis connection refused?**
A: Check password: `docker exec legal-ai-valkey valkey-cli ping`

**Q: GPU container won't start?**
A: Check NVIDIA runtime: `docker run --rm --gpus all nvidia/cuda:12.1.1-runtime-ubuntu22.04 nvidia-smi`

---

## ✅ Verification Checklist

```bash
# 1. All containers running
docker ps | wc -l  # Should be 5+

# 2. Postgres
psql $DATABASE_URL -c "SELECT 1;"

# 3. Redis
redis-cli -u $REDIS_URL ping  # PONG

# 4. Qdrant
curl http://localhost:6333/health  # {"ok": true}

# 5. RabbitMQ
curl http://localhost:15672/api/overview -u legal_admin:secret123

# 6. Run smoke test
npm run smoke:graphify
```

---

## 📦 Directory Structure

```
docs/
├── DOCKER_DOCUMENTATION_INDEX.md     ← You are here
├── DOCKER_STARTUP_GUIDE.md           ← How to start services
├── ENVIRONMENT_CONNECTION_REFERENCE.md ← Credentials & connection strings
└── DOCKER_CONTAINER_STACK_2026-06-28.md ← Detailed service docs

memory/
├── docker-production-hardening.md    ← Prevention strategies
└── docker-incident-audit-june-27.md  ← Root cause analysis
```

---

## 🚀 Quick Start (Copy-Paste)

### First Time
```bash
cd c:\Users\james\Videos\deeds-web-app

# Start essential 5 services
docker-compose up -d

# Verify
docker ps
```

### For Full Stack
```bash
docker-compose --profile full --profile seaweedfs up -d

# Wait 30 seconds for all services to start
sleep 30

# Verify
docker ps | grep legal-ai | wc -l  # Should be 20+
```

### Connection Test
```bash
psql postgresql://legal_admin:123456@localhost:5434/legal_ai_db -c "SELECT 1;"
```

---

## 📚 External References

- Root compose file: `docker-compose.yml` (source of truth)
- Config loader: `scripts/atlas/connection-config.mjs`
- Startup wrapper: `sveltekit-frontend/scripts/startup/run-graphify-daily-startup.mjs`
- Hardening guide: `memory/docker-production-hardening.md`
- Incident audit: `memory/docker-incident-audit-june-27.md`

---

**Last Updated**: June 28, 2026 @ 06:43 UTC  
**Status**: All 5 core containers running ✅  
**Full Stack**: Ready to start with `docker-compose --profile full --profile seaweedfs up -d`