# Docker Quick Start — Legal AI Deeds Web App
**Location**: Repository root  
**Created**: Session 86 (June 28, 2026)

---

## 🚀 Start Services (Copy-Paste)

### Option 1: Essential 5 (6GB RAM)
```bash
docker-compose up -d
```
**Result**: postgres, valkey, qdrant, rabbitmq, caddy running

### Option 2: Full Stack (12GB RAM)
```bash
docker-compose --profile full --profile seaweedfs up -d
```
**Result**: All services except GPU (20+ containers)

### Option 3: Everything Including GPU (16GB RAM)
```bash
docker-compose --profile full --profile seaweedfs --profile gpu up -d
```
**Result**: All 24 containers (requires NVIDIA GPU + CUDA)

---

## ✅ Verify It Works

```bash
# Check containers running
docker ps | grep legal-ai

# Test Postgres
psql postgresql://legal_admin:123456@localhost:5434/legal_ai_db -c "SELECT 1;"

# Test Redis
redis-cli -u redis://127.0.0.1:6379 ping

# Test Qdrant
curl http://localhost:6333/health

# Test RabbitMQ
curl http://localhost:15672/api/overview -u legal_admin:secret123 | jq '.object_totals'
```

---

## 🔌 Connection Strings

```bash
# Postgres
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_db

# Redis/Valkey
REDIS_URL=redis://127.0.0.1:6379

# Qdrant
QDRANT_URL=http://localhost:6333

# RabbitMQ
RABBITMQ_URL=amqp://legal_admin:secret123@localhost:5672/

# Caddy reverse proxy
https://localhost:5178
```

Set these in `.env` or `.env.local` for scripts/apps to use.

---

## 📖 Full Documentation

See `docs/` directory:
- `DOCKER_STARTUP_GUIDE.md` — Detailed startup guide
- `ENVIRONMENT_CONNECTION_REFERENCE.md` — All connection strings
- `DOCKER_CONTAINER_STACK_2026-06-28.md` — Service details
- `DOCKER_DOCUMENTATION_INDEX.md` — Navigation guide

---

## 🛑 Common Issues

**Only 5 containers starting?**
→ Add profiles: `docker-compose --profile full --profile seaweedfs up -d`

**Port already in use?**
→ Kill process: `lsof -i :5434` then `kill -9 <PID>`

**Container exits immediately?**
→ Check logs: `docker logs legal-ai-postgres`

**Can't connect to Postgres?**
→ Verify: `docker exec legal-ai-postgres pg_isready`

**Redis connection refused?**
→ Check if running: `docker exec legal-ai-valkey valkey-cli ping`

---

## 🛠️ Common Commands

```bash
# Restart all services
docker-compose --profile full --profile seaweedfs restart

# Stop all services (keep data)
docker-compose --profile full --profile seaweedfs stop

# View logs
docker-compose logs -f postgres

# Remove containers (keep data volumes)
docker-compose --profile full --profile seaweedfs down

# Full cleanup (DELETE everything)
docker-compose --profile full --profile seaweedfs down -v
```

---

## 💾 Backup & Recovery

### Backup
```bash
# Postgres
docker exec legal-ai-postgres pg_dump -U legal_admin -d legal_ai_db > backup_$(date +%s).sql

# Redis
docker exec legal-ai-valkey valkey-cli --rdb dump.rdb

# Qdrant
docker cp legal-ai-qdrant:/qdrant/storage ./qdrant_backup/
```

### Restore
```bash
# Postgres
psql postgresql://legal_admin:123456@localhost:5434/legal_ai_db < backup.sql

# Redis
docker exec legal-ai-valkey valkey-cli < dump.rdb

# Qdrant
docker cp ./qdrant_backup/ legal-ai-qdrant:/qdrant/storage
```

---

## 📋 Service Ports

| Service | Port | URL |
|---------|------|-----|
| PostgreSQL | 5434 | `postgresql://...@localhost:5434` |
| Redis/Valkey | 6379 | `redis://127.0.0.1:6379` |
| Qdrant REST | 6333 | `http://localhost:6333` |
| Qdrant gRPC | 6334 | `grpc://localhost:6334` |
| RabbitMQ AMQP | 5672 | `amqp://...@localhost:5672` |
| RabbitMQ UI | 15672 | `http://localhost:15672` |
| Caddy | 5178 | `https://localhost:5178` |
| SeaweedFS S3 | 8333 | `http://localhost:8333` |
| SeaweedFS Filer | 8382 | `http://localhost:8382` |

---

## 🎯 Next Steps

1. **Start services**: Run one of the commands above
2. **Verify**: Run the verification commands
3. **Set .env**: Copy connection strings to `.env` or `.env.local`
4. **Run app**: `npm run dev`
5. **Check logs**: `docker-compose logs -f`

---

**Status**: ✅ All systems operational  
**Last Updated**: June 28, 2026  
**Root Compose**: `docker-compose.yml` (source of truth)