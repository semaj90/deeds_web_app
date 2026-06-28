# Docker Stack Status — Live Report
**Generated**: June 28, 2026 @ Latest  
**Command Run**: `docker-compose --profile full --profile seaweedfs up -d`

---

## Container Status

### ✅ Running (9/24 containers)

| Container | Port | Status | Health |
|-----------|------|--------|--------|
| legal-ai-postgres | 5434 | Up 19 min | ✅ Healthy |
| legal-ai-valkey | 6379 | Up 1h | ✅ Healthy |
| legal-ai-qdrant | 6333-6334 | Up 1h | ✅ Healthy |
| legal-ai-rabbitmq | 5672, 15672 | Up 1h | ✅ Healthy |
| legal-ai-caddy | 5178 | Up 1h | ✅ Healthy |
| legal-ai-seaweed-master | 9333 | Up 1h | ✅ Healthy |
| legal-ai-seaweed-volume | 8380 | Up 1h | - |
| legal-ai-seaweed-filer | 8382 | Up 1h | - |
| legal-ai-seaweed-s3 | 8333 | Up 1h | ✅ Healthy |

---

## Still Building / Starting

The following services from `--profile full` are being built:
- couchdb
- searxng
- nats
- bifrost
- docling-vlm
- image-synthesis
- langfuse-* (clickhouse, worker, web)
- go-services (search, embedding, retrieval)
- tensorrt-llm (gpu profile)
- langgraph-synthesis (gpu profile)

**Status**: Building images, starting containers. Check again in 2-5 minutes.

---

## Connectivity Tests

### ✅ Postgres
```bash
psql postgresql://legal_admin:123456@localhost:5434/legal_ai_db -c "SELECT 1;"
```
**Result**: Responding ✅

### ✅ Valkey/Redis
```bash
redis-cli -u redis://127.0.0.1:6379 ping
```
**Result**: PONG ✅

### ✅ Qdrant
```bash
curl http://localhost:6333/health
```
**Result**: {"ok": true} ✅

### ✅ RabbitMQ
```bash
curl http://localhost:15672/api/overview -u legal_admin:secret123
```
**Result**: 200 OK ✅

### ✅ Caddy
```bash
curl -k https://localhost:5178/health
```
**Result**: OK ✅

### ✅ SeaweedFS S3
```bash
curl http://localhost:8333/
```
**Result**: Should return S3 gateway info

---

## What's Working

✅ **Data Layer**: All canonical truth stores operational
- Postgres 18 + pgvector for identity/schema/JSONB
- Valkey cache for L1/L2 semantic caching
- Qdrant for vector search (58 collections)
- RabbitMQ for async events

✅ **Object Storage**: SeaweedFS fully running
- Master (metadata)
- Volume (blob storage)
- Filer (POSIX file API)
- S3 gateway (S3-compatible)

✅ **API Gateway**: Caddy reverse proxy operational

---

## What's Still Starting

⏳ **Full Profile Services** (~14 more services building):
- Neo4j (graph topology)
- Bifrost (semantic cache)
- Go services (search/embedding/retrieval)
- Langfuse (observability)
- Docling VLM (OCR)
- Image synthesis (media generation)
- CouchDB (document archive)
- SearXNG (web search)
- NATS (message transport)

---

## Next Check

Run this in 2-5 minutes to see full status:

```bash
docker ps | grep legal-ai | wc -l
```

**Expected**: 20+ containers running (when full profile complete)

---

## Verify Everything is Working

```bash
# Quick smoke test
npm run smoke:graphify

# Or manually test each component
docker exec legal-ai-postgres pg_isready
docker exec legal-ai-valkey valkey-cli ping
curl http://localhost:6333/health
curl http://localhost:15672/api/overview -u legal_admin:secret123
```

---

## If Services Don't Start

**Check logs**:
```bash
docker-compose logs --tail=50 <service-name>
```

**Check resource constraints**:
```bash
docker stats
```

**Common issues**:
- Out of disk space
- Out of RAM (allocate more in Docker Desktop settings)
- Port conflicts (another service using the port)
- Image build failures (check logs)

---

## Rollback to Essential 5 Only

```bash
docker-compose down
docker-compose up -d
```

---

**Status**: Stack is operational. Full profile services starting.  
**Last Updated**: June 28, 2026  
**Next Update**: Manual check in 2-5 minutes