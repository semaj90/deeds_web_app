# Production Deployment Guide — Pointer Compression Optimized

**Last Updated:** February 28, 2026
**Node.js Memory Optimization:** 50% reduction via pointer compression

---

## Quick Start

```bash
# Build and deploy entire stack
docker-compose -f docker-compose.sveltekit-prod.yml up -d --build

# View logs
docker-compose -f docker-compose.sveltekit-prod.yml logs -f sveltekit

# Check memory usage
docker stats deeds-sveltekit-prod

# Stop all services
docker-compose -f docker-compose.sveltekit-prod.yml down
```

---

## What's New: Pointer Compression

### The Game-Changer

**Node.js with pointer compression** (via `node-caged` base image):
- ✅ **50% memory reduction** (4GB → 2GB per instance)
- ✅ **Zero code changes** required
- ✅ **Same performance** (or better due to less GC pressure)
- ✅ **Production-ready** (Cloudflare + Platformatic tested)

### How It Works

```
Standard Node.js:
┌──────────────┐
│ Pointer: 8B  │ ← 64-bit memory address
└──────────────┘
Heap: ~70% pointers = massive memory usage

node-caged (pointer compression):
┌─────┐
│ 4B  │ ← 32-bit offset from base address
└─────┘
Heap: Halved! Same data, half the space.
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  SvelteKit (node-caged:22) — Port 3000         │
│  Memory: 2GB max (down from 4GB)               │
│  Pointer Compression: ENABLED                   │
└─────────────────────────────────────────────────┘
         │
         ├─→ PostgreSQL 16 + pgvector (1GB)
         ├─→ Redis 7 (512MB, LRU eviction)
         ├─→ Qdrant (2GB, vector search)
          ├─→ SeaweedFS (512MB, object storage)
         ├─→ RabbitMQ (512MB, message queue)
         ├─→ Neo4j (1GB, graph DB) [optional]
         └─→ CouchDB (512MB, document store) [optional]

Total Memory: ~7.5GB (all services)
Without pointer compression: ~9.5GB
Savings: 2GB (21% reduction)
```

---

## Docker Build Context

**Current configuration**: ONNX models (~718MB) are **INCLUDED** in Docker build for full client-side inference support.

| Component | Size | Included? | Reason |
|-----------|------|-----------|--------|
| ONNX WASM Runtime | ~60MB | ✅ Yes | Required for browser inference |
| gemma3_270m model | ~418MB | ✅ Yes | Client-side LLM inference |
| embeddinggemma_300m | ~300MB | ✅ Yes | Client-side embeddings |
| Screenshots/tests | ~50MB | ❌ No | Not needed in production |

**Build context size**: ~1.2GB (including models)
**Alternative**: Serve models from CDN (reduces Docker image by ~778MB)

## Files Overview

| File | Purpose |
|------|---------|
| `Dockerfile.production` | Multi-stage build with pointer compression |
| `docker-compose.sveltekit-prod.yml` | Full stack deployment |
| `PRODUCTION_DEPLOYMENT.md` | This guide |

---

## Performance Comparison

| Metric | Standard Node.js | node-caged (Pointer Compression) |
|--------|------------------|----------------------------------|
| **Memory/instance** | 4GB | 2GB (-50%) |
| **Startup time** | 3.2s | 3.0s (slightly faster) |
| **Request latency** | 45ms | 42ms (less GC) |
| **Throughput** | 2,500 req/s | 2,800 req/s (+12%) |
| **Cost (AWS t3.large)** | $0.0832/hr | $0.0416/hr (-50%) |

*Benchmarks from [Platformatic blog](https://blog.platformatic.dev/we-cut-nodejs-memory-in-half)*

---

## Environment Variables

### Required

```bash
# Database
DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db

# Redis
REDIS_URL=redis://redis:6379

# Vector DB
QDRANT_URL=http://qdrant:6333

# Object Storage (SeaweedFS; MinIO is legacy S3-compatible alias)
SEAWEED_ENDPOINT=seaweedfs:8888
MINIO_ENDPOINT=minio  # legacy S3-compatible alias
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=password

# Message Queue
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
```

### Optional

```bash
# Neo4j (graph relationships)
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# CouchDB (ACE context engine)
COUCHDB_URL=http://admin:password@couchdb:5984

# Ollama (LLM inference — host fallback)
OLLAMA_URL=http://host.docker.internal:11434
```

---

## Health Checks

All services have health checks configured:

```bash
# Check all services
docker-compose -f docker-compose.sveltekit-prod.yml ps

# Individual service health
curl http://localhost:3000/api/health  # SvelteKit
curl http://localhost:6333/healthz     # Qdrant
curl http://localhost:9000/minio/health/live  # SeaweedFS / MinIO-compatible object storage health
redis-cli -h localhost -p 6379 ping    # Redis
```

---

## Scaling

### Horizontal Scaling (Multiple Instances)

```yaml
services:
  sveltekit:
    deploy:
      replicas: 3  # Run 3 instances
```

**With pointer compression:**
- 3 instances × 2GB = 6GB total
- Standard: 3 instances × 4GB = 12GB total
- **Savings: 6GB** (50%)

### Load Balancer (nginx)

```nginx
upstream sveltekit_backend {
  server sveltekit-1:3000;
  server sveltekit-2:3000;
  server sveltekit-3:3000;
}

server {
  listen 80;
  location / {
    proxy_pass http://sveltekit_backend;
  }
}
```

---

## Monitoring

### Memory Usage

```bash
# Real-time stats
docker stats deeds-sveltekit-prod

# Expected output:
CONTAINER                CPU %    MEM USAGE / LIMIT    MEM %
deeds-sveltekit-prod     2.5%     1.2GiB / 2GiB        60%
```

### Application Metrics

```javascript
// Available at /api/health
{
  "status": "ok",
  "memory": {
    "heapUsed": "850MB",
    "heapTotal": "1200MB",
    "external": "120MB",
    "rss": "1400MB"
  },
  "uptime": 3600,
  "version": "1.0.0"
}
```

---

## Troubleshooting

### Out of Memory (OOM)

**Symptom:** Container restarts with exit code 137

**Fix:**
```yaml
deploy:
  resources:
    limits:
      memory: 3G  # Increase from 2G
```

### Slow Performance

**Symptom:** High latency, timeouts

**Check:**
1. Database connection pool exhaustion
2. Redis cache hit rate
3. Qdrant vector search performance

**Fix:**
```bash
# Increase connection pools
DATABASE_POOL_SIZE=20  # Up from 10
REDIS_MAX_CLIENTS=50   # Up from 25
```

### Cannot Connect to Services

**Symptom:** `ECONNREFUSED` errors

**Check:**
```bash
# Ensure all services are healthy
docker-compose -f docker-compose.sveltekit-prod.yml ps

# Check networks
docker network inspect deeds-network
```

---

## Rollback

If pointer compression causes issues (unlikely):

```dockerfile
# Dockerfile.production
# Change FROM line
FROM ghcr.io/platformatic/node-caged:22  # Pointer compression
# To:
FROM node:22-alpine  # Standard Node.js
```

Rebuild:
```bash
docker-compose -f docker-compose.sveltekit-prod.yml up -d --build sveltekit
```

---

## Cost Savings Calculator

### Before (Standard Node.js)

```
Instance: AWS t3.xlarge (4 vCPU, 16GB RAM)
SvelteKit: 4GB × 2 instances = 8GB
Other services: 6GB
Total: 14GB / 16GB = 87.5% utilization
Cost: $0.1664/hr × 730hr/mo = $121.47/mo
```

### After (Pointer Compression)

```
Instance: AWS t3.large (2 vCPU, 8GB RAM)
SvelteKit: 2GB × 2 instances = 4GB
Other services: 4GB (optimized)
Total: 8GB / 8GB = 100% utilization
Cost: $0.0832/hr × 730hr/mo = $60.74/mo

SAVINGS: $60.73/mo ($728.76/year)
```

---

## Security Checklist

- [ ] Change default passwords in `.env`
- [ ] Enable HTTPS (nginx + Let's Encrypt)
- [ ] Configure firewall rules
- [ ] Set up backup strategy (PostgreSQL, object storage)
- [ ] Enable Docker secrets for sensitive data
- [ ] Run containers as non-root user (already configured)
- [ ] Set up log rotation
- [ ] Configure rate limiting (nginx)

---

## Backup Strategy

```bash
# PostgreSQL backup
docker exec deeds-postgres-prod pg_dump -U legal_admin legal_ai_db > backup.sql

# Object storage backup
mc mirror minio/legal-evidence ./backups/object-storage/  # MinIO-compatible client alias

# Automated daily backups
crontab -e
0 2 * * * /path/to/backup-script.sh
```

---

## Next Steps

1. **Test locally:**
   ```bash
   docker-compose -f docker-compose.sveltekit-prod.yml up
   ```

2. **Monitor memory:**
   ```bash
   watch -n 1 docker stats
   ```

3. **Deploy to production:**
   - Cloud provider (AWS, DigitalOcean, Hetzner)
   - Or bare metal server

4. **Set up monitoring:**
   - Prometheus + Grafana (optional)
   - Sentry for error tracking
   - Uptime monitoring (UptimeRobot, Pingdom)

---

## References

- [Platformatic: Halving Node.js Memory](https://blog.platformatic.dev/we-cut-nodejs-memory-in-half)
- [V8 Pointer Compression](https://v8.dev/blog/pointer-compression)
- [node-caged GitHub](https://github.com/platformatic/node-caged)
- [SvelteKit adapter-node docs](https://kit.svelte.dev/docs/adapter-node)

---

**Questions?** Check existing [GitHub Issues](https://github.com/semaj90/mau5law/issues)
