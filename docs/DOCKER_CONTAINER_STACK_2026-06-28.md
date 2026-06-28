# Docker Container Stack Documentation
**Generated**: June 28, 2026 @ 06:43 UTC  
**Status**: ✅ All 5 core containers running and healthy

## Quick Start

```bash
# Start essential 5 containers
docker-compose up -d

# Start all 24 services (full profile)
docker-compose --profile full up -d

# Verify all running
docker ps
```

---

## Core Services (Essential - Running)

### 1. PostgreSQL 18 + pgvector
**Container**: `legal-ai-postgres`  
**Port**: 5434 → 5432 (TCP)  
**Status**: ✅ Up 55 minutes (healthy)

```
Connection String: postgresql://legal_admin:123456@localhost:5434/legal_ai_db
Database: legal_ai_db
User: legal_admin
Password: 123456

Health Check:
  $ pg_isready -h localhost -p 5432 -U legal_admin
  → "accepting connections"

Verify:
  $ docker exec legal-ai-postgres pg_isready
  $ docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1;"
```

**Role**: Canonical truth store for all packet identity, Postgres JSONB metadata, pgvector embeddings

---

### 2. Valkey (Redis-Compatible Cache)
**Container**: `legal-ai-valkey`  
**Port**: 127.0.0.1:6379 (localhost only)  
**Status**: ✅ Up 55 minutes (healthy)

```
Connection String: redis://127.0.0.1:6379
Version: Valkey 8.1.3
Max Memory: 2GB
Eviction Policy: allkeys-lru

Health Check:
  $ valkey-cli ping
  → PONG

Verify:
  $ docker exec legal-ai-valkey valkey-cli ping
  $ docker exec legal-ai-valkey valkey-cli info server
```

**Role**: Hot cache L1/L2 (Bifrost semantic cache layer, session store, pub/sub)

---

### 3. Qdrant (Vector Database)
**Container**: `legal-ai-qdrant`  
**Port**: 6333-6334 (HTTP + gRPC)  
**Status**: ✅ Up 55 minutes (healthy)

```
HTTP Endpoint: http://localhost:6333
gRPC Endpoint: localhost:6334
API Docs: http://localhost:6333/docs
Version: v1.18.2

Health Check:
  $ curl http://localhost:6333/health
  → {"ok": true}

Verify:
  $ docker exec legal-ai-qdrant curl -s http://localhost:6333/collections | jq '.result | length'
  → 58 collections (codebase_chunks_768, evidence_items, legal_documents, etc.)
```

**Role**: Dense vector index mirror, ANN retrieval backend

---

### 4. RabbitMQ (Message Broker)
**Container**: `legal-ai-rabbitmq`  
**Ports**: 5672 (AMQP), 15672 (Management UI)  
**Status**: ✅ Up 55 minutes (healthy)

```
AMQP Connection: amqp://legal_admin:secret123@localhost:5672/
Management UI: http://localhost:15672/
Management API: http://localhost:15672/api/overview

Credentials:
  User: legal_admin
  Password: secret123
  Virtual Host: /

Health Check:
  $ docker exec legal-ai-rabbitmq rabbitmq-diagnostics -q ping
  → "Ping succeeded"

Verify:
  $ curl http://localhost:15672/api/overview -u legal_admin:secret123 | jq '.rabbitmq_version'
  → "3.13.7"
```

**Role**: Async job fabric, event broker (7 queues: cache.invalidate, document.embed, etc.)

---

### 5. Caddy (Reverse Proxy)
**Container**: `legal-ai-caddy`  
**Port**: 5178  
**Status**: ✅ Up 55 minutes (healthy)

```
HTTP/HTTPS: https://localhost:5178
Upstream SvelteKit: host.docker.internal:5173 (localhost:5173 from container perspective)
Upstream Vector Backend: host.docker.internal:8095

Health Check:
  $ curl https://localhost:5178/health
  → OK (HTTPS 200)

Verify:
  $ docker logs legal-ai-caddy | grep -i "loaded"
  → Caddyfile loaded
```

**Role**: HTTP front door, TLS termination, reverse proxy

---

## Additional Services (Full Profile - Pending)

### Full Profile Services (24 total)
Start with: `docker-compose --profile full up -d`

| Service | Port | Role | Profile |
|---------|------|------|---------|
| SeaweedFS Master | 9333 | Object store metadata | essential |
| SeaweedFS Volume | 8380 | Object store blobs | essential |
| SeaweedFS Filer | 8382 | POSIX-style file API | essential |
| SeaweedFS S3 | 8333 | S3-compatible gateway | essential |
| CouchDB | 5984 | Document archive | full |
| Neo4j | 7687 | Graph topology mirror | full |
| SearXNG | 8888 | Web search | full |
| NATS | 4222 | Message transport | full |
| Bifrost | 3040 | Semantic cache gateway | full |
| Docling VLM | 8095 | OCR/document understanding | full |
| Image Synthesis | 8082 | GPU media generation | full |
| Langfuse ClickHouse | (internal) | Observability database | full |
| Langfuse Worker | (internal) | Trace processor | full |
| Langfuse Web | 3030 | Observability UI | full |
| Go Search Service | 8096 | BM25/FTS search | full |
| Go Embedding Service | 8097 | Fast embeddings | full |
| Go Retrieval Service | 8100 | Orchestrated retrieval | full |
| TensorRT-LLM | 8099 | GPU LLM inference | gpu |
| LangGraph Synthesis | (internal) | Agentic synthesis | gpu |

---

## Environment Configuration

**Source Files** (precedence order):
1. `.env` (git-tracked defaults)
2. `.env.local` (local overrides, gitignored)
3. Loaded by: `scripts/atlas/connection-config.mjs`
4. Used in: `sveltekit-frontend/scripts/startup/run-graphify-daily-startup.mjs`

**Key Variables**:
```bash
# Postgres
DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db
POSTGRES_HOST=localhost
POSTGRES_PORT=5434
POSTGRES_USER=legal_admin
POSTGRES_PASSWORD=123456
POSTGRES_DB=legal_ai_db

# Valkey/Redis
REDIS_URL=redis://:redis@127.0.0.1:6379
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=redis
REDIS_ENABLED=true

# Qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_GRPC_HOST=qdrant
QDRANT_GRPC_PORT=6334

# RabbitMQ
RABBITMQ_URL=amqp://legal_admin:secret123@localhost:5672/
RABBITMQ_HOST=localhost
RABBITMQ_USER=legal_admin
RABBITMQ_PASSWORD=secret123

# Caddy
CADDY_ADMIN=https://localhost:2019
CADDY_AUTO_HTTPS=off (for localhost)

# SeaweedFS
SEAWEED_ENDPOINT=localhost
SEAWEED_S3_PORT=8333
SEAWEED_MASTER_PORT=9333
SEAWEED_FILER_PORT=8382
```

---

## Verification Checklist

Run these commands to verify the full stack:

```bash
# 1. Check all containers running
docker ps | grep legal-ai

# 2. Postgres connectivity
docker exec legal-ai-postgres pg_isready
psql postgresql://legal_admin:123456@localhost:5434/legal_ai_db -c "SELECT 1;"

# 3. Valkey connectivity
docker exec legal-ai-valkey valkey-cli ping
docker exec legal-ai-valkey valkey-cli info server

# 4. Qdrant health
curl http://localhost:6333/health
curl http://localhost:6333/collections | jq '.result | length'

# 5. RabbitMQ health
curl http://localhost:15672/api/overview -u legal_admin:secret123 | jq '.object_totals'

# 6. Caddy health
curl -k https://localhost:5178/health

# 7. Test full data flow
npm run atlas:lineage:verify  # Postgres
npm run smoke:graphify         # Full pipeline (Postgres → Redis → Qdrant)
```

---

## Docker Compose File Structure

**Root file**: `docker-compose.yml` (source of truth)

**Profiles**:
- `default` (no profile): 5 essential services (postgres, valkey, qdrant, rabbitmq, caddy)
- `full`: +14 services (couchdb, neo4j, searxng, nats, bifrost, docling-vlm, image-synthesis, langfuse, go-services)
- `gpu`: +2 services (tensorrt-llm, langgraph-synthesis)

**Combined**:
```bash
docker-compose --profile full --profile gpu up -d  # All 24 services
```

---

## Service Roles (Data Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│ Application Layer                                               │
│  SvelteKit (5173) → Caddy (5178) → External clients             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Data Layer (Essential 5)                                        │
│                                                                  │
│  Postgres 18           ← Canonical Truth (packet identity)      │
│  ├─ Valkey (6379)      ← L1/L2 Cache (Bifrost semantic cache)  │
│  ├─ Qdrant (6333)      ← Vector Mirror (ANN retrieval)         │
│  ├─ RabbitMQ (5672)    ← Async Events (job queue)              │
│  └─ SeaweedFS (8333)   ← Blob Store (documents, evidence)      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Enhancement Layer (Full Profile)                                │
│                                                                  │
│  Neo4j (7687)          ← Graph Topology Mirror (KAG)            │
│  CouchDB (5984)        ← Document Archive (cold storage)        │
│  NATS (4222)           ← Message Transport (events)             │
│  Bifrost (3040)        ← Semantic Cache Gateway                 │
│  Go Services (8096+)   ← Search/Embedding/Retrieval             │
│  Langfuse (3030)       ← Observability (traces)                 │
│  Docling VLM (8095)    ← OCR/Document Understanding             │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ GPU Layer (GPU Profile)                                         │
│                                                                  │
│  TensorRT-LLM (8099)   ← GPU LLM Inference                      │
│  LangGraph (internal)  ← Agentic Synthesis                      │
│  Image Synthesis       ← Media Generation                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Recovery Procedures

### If Containers Stop
```bash
# Restart running containers
docker-compose restart

# Or start from scratch
docker-compose up -d
docker-compose --profile full up -d
```

### If Data is Lost
```bash
# Postgres backup restore
psql postgresql://legal_admin:123456@localhost:5434/legal_ai_db < backup.sql

# Qdrant restore
docker cp backup_qdrant_storage/. legal-ai-qdrant:/qdrant/storage

# Valkey restore
docker exec legal-ai-valkey valkey-cli --rdb dump.rdb
```

### If a Single Container Fails
```bash
# Check logs
docker logs legal-ai-postgres

# Restart single container
docker-compose restart postgres

# Verify health
docker exec legal-ai-postgres pg_isready
```

---

## Next Steps

1. ✅ **Verify**: Run verification checklist above
2. ⏳ **Git Hook**: Implement prevention measures (see docker-production-hardening.md)
3. ⏳ **Backup**: Set up daily backup cron job
4. ⏳ **Monitor**: Enable docker events logging
5. ⏳ **Documentation**: Update team wiki with connection strings

---

**References**:
- Root compose: `docker-compose.yml`
- Config loader: `scripts/atlas/connection-config.mjs`
- Startup wrapper: `sveltekit-frontend/scripts/startup/run-graphify-daily-startup.mjs`
- Hardening guide: `memory/docker-production-hardening.md`
