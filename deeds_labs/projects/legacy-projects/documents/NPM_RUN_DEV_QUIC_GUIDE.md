# 🚀 npm run dev:quic Setup & Status

## Current System Status

```
✅ Frontend:         Running on http://localhost:5173 (Vite 6.4.0)
✅ PostgreSQL:       Running in Docker (pgvector/pgvector:pg17)
   - Container: legal_ai_test_db (7f42a7a862ee)
   - Port: 5434:5432 (Docker mapping)
   - DB: legal_ai_db
   - User: legal_admin
   - Password: 123456

✅ Redis:            Running (from docker-compose logs)
   - Port: 6379
   - Password: redis

✅ Ollama:           Online
   - Embeddings: http://localhost:11434/api/embeddings
   - Models: nomic-embed-text

❌ RabbitMQ:         NOT RUNNING (needed for Test 3)
⏳ npm run dev:quic:  Ready to start (runs scripts/start-full-stack.js)
```

---

## What `npm run dev:quic` Does

**File**: `sveltekit-frontend/scripts/start-full-stack.js`

This script automatically starts:

1. **PostgreSQL** (checks Docker first, then Windows service)
   - Looks for existing container: `legal-ai-postgres`
   - Falls back to Windows service: `postgresql-x64-17`
   - Port: 5432 (default)

2. **Redis** (checks Docker first, then Windows service)
   - Looks for existing container: `legal-ai-redis`
   - Falls back to Windows service
   - Port: 6379

3. **MinIO** (S3-compatible object storage)
   - Docker container
   - Port: 9000 (API), 9001 (Console)

4. **Ollama** (LLM inference)
   - Starts via native Windows process
   - GPU layers: 30 (default)
   - Port: 11434

5. **RabbitMQ** (optional message broker)
   - Docker container
   - Ports: 5672 (AMQP), 15672 (Management)

6. **Worker Services** (optional)
   - OCR Worker (GPU-accelerated Tesseract)
   - Embedding Worker (Ollama + pgvector)
   - Autotag Worker (keyword extraction)

7. **SvelteKit Dev Server**
   - Vite dev on configured port
   - Hot reload enabled
   - GPU environment variables set

---

## ⚠️ PostgreSQL Port Configuration Issue

**Current Docker Setup**:
- PostgreSQL is running on **port 5434** (mapped from internal 5432)
- `npm run dev:quic` expects PostgreSQL on **port 5432**

**Solution Options**:

### Option A: Update Docker Compose (Recommended)
```yaml
# In docker-compose.redis-postgres.yml
postgres:
  ports:
    - "5432:5432"  # Change from 5434:5432
```

Then restart:
```bash
docker-compose -f docker-compose.redis-postgres.yml restart postgres
```

### Option B: Update Environment Variables
Create/update `.env.development`:
```
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_db
POSTGRES_PORT=5434
```

### Option C: Use Connection String Directly
Check `src/lib/server/db/index.ts` for database connection setup.

---

## 🎯 Ready to Run dev:quic

**Prerequisites Check**:
- ✅ PostgreSQL running (verify port)
- ✅ Redis running on 6379
- ✅ Ollama running on 11434
- ✅ Docker Desktop running
- ✅ npm packages installed in sveltekit-frontend

**Start Command**:
```bash
cd c:\Users\james\Videos\deeds-web-app\sveltekit-frontend
npm run dev:quic
```

**Expected Output**:
```
🚀 Starting Complete Legal AI Full-Stack Development Environment...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🐘 Setting up PostgreSQL...
   ✅ PostgreSQL already running on port 5432

🔴 Setting up Redis...
   ✅ Redis already running on port 6379

💾 Setting up MinIO...
   ✅ MinIO running at http://localhost:9000

🤖 Setting up Ollama...
   ✅ Ollama running at http://localhost:11434

📨 Setting up RabbitMQ...
   ✅ RabbitMQ running at http://localhost:15672

🧵 Starting Worker Services...
   ✅ OCR Worker ready
   ✅ Embedding Worker ready

🌐 Starting SvelteKit Dev Server...
   ✅ Frontend ready at http://localhost:5173

✨ All services ready!
```

---

## 🧪 After Starting dev:quic

### Test Sequence:
1. **Browser**: Open http://localhost:5173
2. **Console Check**: Look for WebTransport/WebSocket connection logs
3. **XState**: Verify 4 state machines initialized
4. **Database**: Query legal_ai_db to confirm connection
5. **Messaging**: Send test message to RabbitMQ queues

---

## 📊 Service Port Reference

| Service | Port | Purpose |
|---------|------|---------|
| SvelteKit Frontend | 5173 | Development server |
| PostgreSQL | 5432 | Primary database |
| PostgreSQL (Docker) | 5434 | Our current mapping |
| Redis | 6379 | Caching & sessions |
| MinIO API | 9000 | Object storage API |
| MinIO Console | 9001 | Storage management |
| Ollama | 11434 | LLM embeddings |
| RabbitMQ AMQP | 5672 | Message broker |
| RabbitMQ Management | 15672 | RabbitMQ console |

---

## 🔧 Troubleshooting

### PostgreSQL connection refused
- **Check**: Is port 5432 available? (currently using 5434)
- **Fix**: Either change docker-compose to use 5432, or update env vars

### Redis connection failed
- **Check**: `redis-cli ping` should return "PONG"
- **Fix**: Verify Redis container is running: `docker ps | grep redis`

### Ollama not found
- **Check**: `curl http://localhost:11434/api/tags`
- **Fix**: Start Ollama manually if script fails

### RabbitMQ failed to start
- **Note**: RabbitMQ is optional; script continues without it
- **Fix**: Start manually with: `docker run -d --name legal-ai-rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management-alpine`

---

## 📝 Next Steps

1. **Fix PostgreSQL port** (5434 → 5432)
2. **Run**: `npm run dev:quic`
3. **Wait**: ~30-60 seconds for all services to start
4. **Verify**: Open http://localhost:5173 in browser
5. **Test**: Run Test 1 (WebTransport connection)

---

**Status**: Ready to execute `npm run dev:quic` once PostgreSQL port is corrected
