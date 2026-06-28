# Docker Startup Guide — Legal AI Deeds Web App

## TL;DR

```bash
# Start essential 5 services (default, no profile needed)
docker-compose up -d

# Start full stack (includes couchdb, neo4j, nats, bifrost, go-services, langfuse, docling)
docker-compose --profile full --profile seaweedfs up -d

# Start everything including GPU services (requires TensorRT-LLM + LangGraph)
docker-compose --profile full --profile seaweedfs --profile gpu up -d
```

---

## Service Profiles Explained

The root `docker-compose.yml` uses **3 independent profiles**:

### Profile 1: `seaweedfs` (Object Storage)
Services:
- seaweedfs-master (metadata server)
- seaweedfs-volume (blob storage)
- seaweedfs-filer (POSIX file API)
- seaweedfs S3 gateway (S3-compatible endpoint)

**When to use**: Always (for document/evidence storage)

```bash
docker-compose --profile seaweedfs up -d
```

### Profile 2: `full` (Enhancement Stack)
Services:
- couchdb (document archive)
- searxng (web search)
- nats (message transport)
- bifrost (semantic cache)
- docling-vlm (OCR/document understanding)
- image-synthesis (GPU media generation)
- langfuse-clickhouse, langfuse-worker, langfuse-web (observability)
- go-search-service (BM25/FTS)
- go-embedding-service (fast embeddings)
- go-retrieval-service (orchestrated retrieval)

**When to use**: Production deployments, full feature set

```bash
docker-compose --profile full up -d
```

### Profile 3: `gpu` (GPU Acceleration)
Services:
- tensorrt-llm (GPU LLM inference, port 8099)
- langgraph-synthesis (agentic synthesis)
- image-synthesis (media generation, requires GPU)

**When to use**: GPU-accelerated inference (requires NVIDIA GPU + CUDA)

```bash
docker-compose --profile gpu up -d
```

---

## Recommended Startup Commands

### Development (Your Laptop)
```bash
# Essential 5 services only
docker-compose up -d

# OR with SeaweedFS for blob storage
docker-compose --profile seaweedfs up -d
```

**Result**: 5-9 containers, ~6-8GB RAM

---

### Staging / Full Test Environment
```bash
# Full stack (everything except GPU)
docker-compose --profile full --profile seaweedfs up -d
```

**Result**: ~20 containers, ~12-14GB RAM

---

### Production (with GPU)
```bash
# Everything: essential + full + seaweedfs + gpu
docker-compose --profile full --profile seaweedfs --profile gpu up -d
```

**Result**: ~24 containers, ~16-20GB RAM (requires GPU)

---

## Service Inventory by Profile

| Service | Profile | Port(s) | Role |
|---------|---------|---------|------|
| postgres | (none) | 5434 | Canonical database |
| valkey | (none) | 6379 | Cache layer |
| qdrant | (none) | 6333-6334 | Vector search |
| rabbitmq | (none) | 5672, 15672 | Message broker |
| caddy | (none) | 5178, 443 | Reverse proxy |
| **seaweedfs-master** | seaweedfs | 9333 | Object store metadata |
| **seaweedfs-volume** | seaweedfs | 8380 | Object store blobs |
| **seaweedfs-filer** | seaweedfs | 8382 | File API |
| **seaweedfs-s3** | seaweedfs | 8333 | S3 gateway |
| **couchdb** | full | 5984 | Document archive |
| **searxng** | full | 8888 | Web search |
| **nats** | full | 4222 | Message transport |
| **bifrost** | full | 3040 | Semantic cache |
| **docling-vlm** | full | 8095 | OCR/document understanding |
| **image-synthesis** | full | 8082 | Media generation |
| **langfuse-clickhouse** | full | (internal) | Observability DB |
| **langfuse-worker** | full | (internal) | Trace processor |
| **langfuse-web** | full | 3030 | Observability UI |
| **go-search-service** | full | 8096 | BM25/FTS search |
| **go-embedding-service** | full | 8097 | Embeddings |
| **go-retrieval-service** | full | 8100 | Retrieval orchestration |
| **tensorrt-llm** | gpu | 8099 | GPU LLM inference |
| **langgraph-synthesis** | gpu | (internal) | Agentic synthesis |
| **image-synthesis** | full, gpu | 8082 | Media generation |

---

## Verification After Startup

### Quick Health Check
```bash
# Check all containers running
docker ps | grep legal-ai

# Count containers
docker ps --format "{{.Names}}" | grep legal-ai | wc -l

# Check healthy status
docker ps --format "table {{.Names}}\t{{.Status}}" | grep legal-ai
```

### Detailed Verification
```bash
# Postgres
docker exec legal-ai-postgres pg_isready
psql postgresql://legal_admin:123456@localhost:5434/legal_ai_db -c "SELECT 1;"

# Valkey
docker exec legal-ai-valkey valkey-cli ping

# Qdrant
curl http://localhost:6333/health

# RabbitMQ
curl http://localhost:15672/api/overview -u legal_admin:secret123 | jq '.object_totals'

# Caddy
curl -k https://localhost:5178/health
```

---

## Startup Troubleshooting

### Only 5 containers started (not 20+)
**Problem**: You ran `docker-compose up -d` without specifying profiles

**Solution**:
```bash
docker-compose --profile full --profile seaweedfs up -d
```

---

### "port already allocated" error
**Problem**: Another service is using the port

**Solution**:
```bash
# Find what's using the port (e.g., 5434 for Postgres)
lsof -i :5434

# Kill the process or stop the competing service
taskkill /F /PID <PID>
docker-compose restart postgres
```

---

### Container exits immediately
**Problem**: Check the logs

**Solution**:
```bash
docker logs legal-ai-postgres     # Check specific container
docker logs $(docker ps -q --all) # Show all logs (verbose)
```

---

### GPU container won't start
**Problem**: NVIDIA GPU not available or CUDA not installed

**Solution**:
```bash
# Check if NVIDIA runtime is available
docker run --rm --gpus all nvidia/cuda:12.1.1-runtime-ubuntu22.04 nvidia-smi

# If fails, install NVIDIA Container Runtime
# Or skip GPU profile for CPU-only inference
docker-compose --profile full up -d  # No GPU services
```

---

## Stopping & Cleanup

```bash
# Stop all running containers (keep volumes)
docker-compose --profile full --profile seaweedfs stop

# Restart stopped containers
docker-compose --profile full --profile seaweedfs start

# Remove stopped containers (keep volumes + data)
docker-compose --profile full --profile seaweedfs down

# Full cleanup (DELETES all containers, networks, volumes)
docker-compose --profile full --profile seaweedfs down -v
```

---

## Environment Variables

Source: `.env` + `.env.local` (loaded by `scripts/atlas/connection-config.mjs`)

Key variables:
```bash
# Postgres
DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db
POSTGRES_HOST=localhost
POSTGRES_PORT=5434

# Valkey
REDIS_URL=redis://127.0.0.1:6379
REDIS_PASSWORD=redis

# Qdrant
QDRANT_URL=http://qdrant:6333
QDRANT_GRPC_PORT=6334

# RabbitMQ
RABBITMQ_URL=amqp://legal_admin:secret123@rabbitmq:5672/

# SeaweedFS
SEAWEED_S3_PORT=8333
SEAWEED_MASTER_PORT=9333

# Bifrost (semantic cache)
BIFROST_URL=http://bifrost:3040

# Go services
GO_SEARCH_SERVICE_URL=http://go-search-service:8096
GO_EMBEDDING_SERVICE_URL=http://go-embedding-service:8097
GO_RETRIEVAL_SERVICE_URL=http://go-retrieval-service:8100
```

---

## Docker Compose Command Reference

```bash
# Help
docker-compose --help
docker-compose config --help

# View active profiles
docker-compose config --profile full --profile seaweedfs | grep -A5 "services:"

# Validate without starting
docker-compose --profile full --profile seaweedfs config > /dev/null

# View logs
docker-compose logs -f postgres              # Follow postgres logs
docker-compose logs --tail=50 rabbitmq       # Last 50 lines of rabbitmq

# Resource usage
docker stats

# Backup volumes
docker run --rm -v legal-ai-postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz /data
```

---

## Notes

- **Root compose file**: `docker-compose.yml` (source of truth)
- **Profile discovery**: Run `grep -n "profiles:" docker-compose.yml` to see all profiles
- **Env config**: Shared loader at `scripts/atlas/connection-config.mjs`
- **Legacy file**: `sveltekit-frontend/docker-compose.full.yml` (deprecated, use root compose instead)
- **Data persistence**: All volumes are named and survive `docker-compose down`
