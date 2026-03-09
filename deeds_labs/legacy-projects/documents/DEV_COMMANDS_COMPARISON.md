# Dev Commands Comparison 📊

## Quick Answer: Which Command Has Everything You Need?

**`npm run dev:quic`** ✅ **RECOMMENDED - Complete Setup**

This starts:
1. ✅ Docker containers (redis, minio, postgres, rabbitmq, qdrant)
2. ✅ MCP Context7 Server (port 3002)
3. ✅ SvelteKit frontend (port 5173)
4. ✅ Service discovery (auto-discovers all containers)
5. ✅ Environment variables pre-configured

---

## Detailed Comparison

### Command 1: `npm run dev:quic` ✅ FULL STACK

```bash
npm run dev:quic
```

**What it does (via scripts/start-quic-docker.mjs):**
1. Checks Docker status
2. Spins up: `docker compose up -d redis minio postgres rabbitmq qdrant`
3. Probes all services for readiness (non-fatal):
   - Redis: TCP 127.0.0.1:6379
   - MinIO: http://localhost:9000/minio/health/live
   - PostgreSQL: TCP 127.0.0.1:5434
   - RabbitMQ: http://localhost:15672
   - Qdrant: http://localhost:6333/health
   - Ollama: http://localhost:11434 (optional)
4. Starts MCP Context7 Server (port 3002)
5. Launches SvelteKit dev server on port 5173

**Environment variables set automatically:**
```
REDIS_PASSWORD=redis
REDIS_HOST=localhost
REDIS_PORT=6379
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio123
MINIO_BUCKET_NAME=legal-documents
MINIO_USE_SSL=false
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_db
NODE_ENV=development
VITE_NODE_ENV=development
```

**Listening on:**
- Frontend: http://127.0.0.1:5173
- MCP Server: http://localhost:3002
- All Docker services auto-started

---

### Command 2: `npm run dev:quic:full` ⚠️ FRONTEND ONLY

```bash
npm run dev:quic:full
```

**What it does:**
1. Starts only the SvelteKit frontend dev server
2. Assumes Docker containers already running
3. Uses service discovery to find running containers
4. Falls back to hardcoded URLs if containers not found

**Environment variables:**
- Uses whatever's in your shell/`.env.local`
- Must have Docker containers running separately
- Must have MCP server running separately

**Listening on:**
- Frontend: http://127.0.0.1:5173
- Services: Must be running in Docker already

**When to use:**
- You already have containers running in another terminal
- You want just the frontend for faster iteration
- You're debugging frontend code without restarting everything

---

### Command 3: `npm run dev:full` (Alternative)

```bash
npm run dev:full
```

**What it does:**
1. Runs with `REDIS_PASSWORD=redis`
2. Starts SvelteKit frontend only
3. Assumes services exist elsewhere
4. No Docker startup, no MCP server

**When to use:** Minimal setup, just frontend dev

---

## Recommended Setup

### For Complete Development (Everything Wired)

```bash
npm run dev:quic
```

This gives you:
- ✅ All Docker containers (redis, minio, postgres, rabbitmq, qdrant)
- ✅ MCP Context7 Server
- ✅ SvelteKit frontend with service discovery
- ✅ All environment variables pre-configured
- ✅ Health probes for all services

### For Frontend-Only Development (Containers Already Running)

```bash
# Terminal 1: Start everything
npm run dev:quic

# Terminal 2: Just restart frontend (fast iteration)
npm run dev:quic:full
```

---

## What's Wired in Each?

### `npm run dev:quic` - Complete

| Component | Status |
|-----------|--------|
| Docker containers | ✅ Started by script |
| Service discovery | ✅ Auto-discovers |
| MCP Server | ✅ Started (port 3002) |
| Frontend | ✅ Started (port 5173) |
| Environment vars | ✅ Pre-configured |
| Health probes | ✅ Verifies readiness |

### `npm run dev:quic:full` - Frontend Only

| Component | Status |
|-----------|--------|
| Docker containers | ⚠️ Must be running |
| Service discovery | ✅ Finds existing |
| MCP Server | ⚠️ Must run separately |
| Frontend | ✅ Started (port 5173) |
| Environment vars | ⚠️ Uses shell/env |
| Health probes | ❌ No verification |

---

## Services Configuration

### Docker Compose (started by `npm run dev:quic`)

```yaml
redis:      # Port 6379
minio:      # Ports 9000-9001
postgres:   # Port 5434
rabbitmq:   # Ports 5672, 15672
qdrant:     # Ports 6333-6334
```

### Connection Strings

**Hardcoded in start-quic-docker.mjs:**

```
REDIS_PASSWORD=redis
REDIS_HOST=localhost
REDIS_PORT=6379
MINIO_ENDPOINT=localhost:9000
DATABASE_URL=postgresql://legal_admin:123456@localhost:5434/legal_ai_db
```

**Via Service Discovery:**

Auto-discovers and creates URLs:
- Redis: `redis://0.0.0.0:6379` → `localhost:6379`
- MinIO: `http://0.0.0.0:9000` → `localhost:9000`
- Postgres: `postgresql://0.0.0.0:5432` → `localhost:5432`

---

## Quick Commands

### Start Everything (Recommended)
```bash
npm run dev:quic
```

### Just Frontend (Services Already Running)
```bash
npm run dev:quic:full
```

### Verify Services
```bash
node scripts/discover-services.mjs
```

### Stop Everything
```bash
npm run stack:down
```

---

## Startup Times

| Command | Total Time |
|---------|-----------|
| `npm run dev:quic` | 15-20 seconds |
| `npm run dev:quic:full` | 6-11 seconds |
| `npm run dev:full` | 5-10 seconds |

---

## Summary

| Aspect | `dev:quic` | `dev:quic:full` | `dev:full` |
|--------|-----------|-----------------|-----------|
| Docker | ✅ Starts | ⚠️ Requires | ⚠️ Requires |
| Service Discovery | ✅ Auto | ✅ Auto | ❌ Hardcoded |
| MCP Server | ✅ Starts | ❌ Missing | ❌ Missing |
| Frontend | ✅ Starts | ✅ Starts | ✅ Starts |
| Health Checks | ✅ Yes | ❌ No | ❌ No |
| Best For | Full dev | Fast iteration | Minimal |

---

## Bottom Line

**Use `npm run dev:quic` for complete setup with everything wired!** 🚀

One command starts:
- All Docker containers
- MCP server
- Frontend dev server
- Service discovery
- Environment variables

Everything you need to develop the full stack.
