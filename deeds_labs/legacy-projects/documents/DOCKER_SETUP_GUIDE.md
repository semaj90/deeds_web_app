# Docker Desktop Setup Guide - PostgreSQL & Redis

## Current Status

```
❌ Docker Desktop:    NOT RUNNING
❌ PostgreSQL:        OFFLINE (connection refused on 5432)
✅ Redis:             ONLINE (port 6379, 1.27MB used - Docker Compose running)
⚠️  RabbitMQ:         NOT FOUND IN DOCKER
```

---

## 🚀 Quick Start: PostgreSQL + Redis Stack

### Option 1: Start Docker Desktop (Recommended)

**Windows 11/10**:
1. Open **Start Menu**
2. Search for **"Docker Desktop"**
3. Click to launch
4. Wait ~30-60 seconds for daemon to start
5. Check status: Docker icon appears in system tray (whale icon)

**Verify Docker is running**:
```powershell
docker ps
# Should show existing containers (if any)

docker-compose --version
# Should show version info
```

---

### Option 2: Start PostgreSQL + Redis via Docker Compose

Once Docker Desktop is running:

```bash
cd c:\Users\james\Videos\deeds-web-app

# Start PostgreSQL + Redis stack
docker-compose -f docker-compose.redis-postgres.yml up -d

# Verify services started
docker-compose -f docker-compose.redis-postgres.yml ps

# Should show:
# legal-ai-postgres     postgres       Running
# legal-ai-redis        redis          Running
# legal-ai-redis-insight redis-insight Running
```

**Check PostgreSQL connection**:
```bash
docker-compose -f docker-compose.redis-postgres.yml logs postgres

# Should show:
# "database system is ready to accept connections"
```

---

### Option 3: Start RabbitMQ (For Message Testing)

RabbitMQ is needed for Test 3 (Queue → UI message flow).

**Quick RabbitMQ container**:
```bash
docker run -d \
  --name legal-ai-rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=guest \
  -e RABBITMQ_DEFAULT_PASS=guest \
  rabbitmq:3-management-alpine

# Verify
docker ps | findstr rabbitmq

# Access Management UI
# http://localhost:15672
# Username: guest
# Password: guest
```

---

## 🧪 Recommended Test Sequence

### Now (Without Docker):
- ✅ **Test 1**: WebTransport connection (no DB needed)
- ✅ **Test 2**: XState actors initialization (no DB needed)

### After Starting Docker:
- ✅ **Test 3**: Queue → UI message flow (needs RabbitMQ)
- ✅ **Test 4**: NATS QUIC failover (needs NATS bridge)
- ✅ **Test 5**: Latency measurement (depends on Test 3)

### Then:
- ✅ **Task 5**: Store consolidation (no DB needed)

---

## 📊 Complete Stack Services

Once all running:

```
Frontend:              http://localhost:5173  ✅
MCP Server:            http://localhost:3002  ✅
PostgreSQL:            postgresql://localhost:5432
  - DB: legal_ai_db
  - User: legal_admin
  - Pass: 123456
Redis:                 redis://localhost:6379
  - Password: redis
RabbitMQ:              amqp://guest:guest@localhost:5672
  - Management: http://localhost:15672
Redis Insight:         http://localhost:8001
Ollama Embeddings:     http://localhost:11434 ✅
```

---

## ❓ Troubleshooting

### Docker Desktop won't start
```bash
# Try restarting Docker service
# Windows: Services app → Docker Desktop Service → Restart

# Or via PowerShell (Admin)
Restart-Service -Name "Docker Desktop Service" -Force
```

### PostgreSQL connection refused
```bash
# Check if container is running
docker ps | findstr postgres

# View logs
docker logs legal-ai-postgres

# Restart container
docker restart legal-ai-postgres
```

### Redis already in use (port 6379)
```bash
# Find process using port
netstat -ano | findstr :6379

# Kill process (if not Docker)
taskkill /PID <PID> /F

# Or use different port in docker-compose
```

---

## 🎯 Success Checklist

- [ ] Docker Desktop running (check system tray)
- [ ] `docker ps` shows containers running
- [ ] PostgreSQL responds: `docker exec legal-ai-postgres pg_isready -U legal_admin`
- [ ] Redis responds: `docker exec legal-ai-redis redis-cli ping`
- [ ] RabbitMQ available at http://localhost:15672 (optional, for Test 3)
- [ ] Frontend still running at http://localhost:5173

---

## 📝 Commands Quick Reference

```bash
# Start full stack
docker-compose -f docker-compose.redis-postgres.yml up -d

# View running services
docker-compose -f docker-compose.redis-postgres.yml ps

# Stop all services
docker-compose -f docker-compose.redis-postgres.yml down

# View logs
docker-compose -f docker-compose.redis-postgres.yml logs -f

# Connect to PostgreSQL
psql -h localhost -U legal_admin -d legal_ai_db

# Connect to Redis
redis-cli -p 6379 -a redis
```

---

**Next Action**: Start Docker Desktop, then run Test 1 (WebTransport - no DB needed)
