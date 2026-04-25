# Redis Persistence Fix for Development

## Problem
Redis server started by `npm run dev:full:concurrent` is killed when the dev script exits, causing `[ioredis] Unhandled error event: Error: connect ECONNREFUSED 127.0.0.1:6379`

## Solution

### Option A: Use Docker Redis (Recommended)
Redis runs in Docker container and persists independently of the dev script.

```bash
# 1. Start Redis once (in a separate terminal or as background service)
docker run -d --name redis-dev -p 6379:6379 redis:latest

# 2. Set environment variable
export REDIS_PASSWORD=""  # Docker Redis no password by default
export REDIS_URL="redis://localhost:6379"

# 3. Run dev server normally
npm run dev

# 4. To stop Redis later
docker stop redis-dev
docker rm redis-dev
```

### Option B: Run Redis Separately (for Manual Control)
Start Redis independently so it doesn't get killed by dev script.

**Windows (Command Prompt):**
```cmd
# Start Redis in separate command window
redis-server --port 6379

# Then in another window
set REDIS_PASSWORD=
set REDIS_URL=redis://localhost:6379
npm run dev
```

**Linux/Mac:**
```bash
# Start Redis in background
redis-server --port 6379 &

# Then run dev
export REDIS_PASSWORD=""
export REDIS_URL="redis://localhost:6379"
npm run dev
```

### Option C: Modify Dev Script (For Automation)
Edit scripts to NOT kill Redis on shutdown (more invasive).

Pros: Fully automated
Cons: Changes dev script behavior

## Current Status
- Service discovery initialized successfully
- Redis errors are non-blocking (graceful fallback works)
- All services fall back to defaults when Redis unavailable

## Recommended Action
**Use Option A (Docker Redis)** - Most reliable, doesn't interfere with dev script changes

```bash
docker run -d --name redis-dev -p 6379:6379 redis:latest
npm run dev:quic:full
```

## Verify Redis Connection
```bash
# Test Redis is reachable
redis-cli ping

# If running in Docker
docker exec redis-dev redis-cli ping
```

## Environment Variables
```bash
# For local Redis (default)
REDIS_PASSWORD=redis
REDIS_URL=redis://localhost:6379

# For Docker Redis (no password)
REDIS_PASSWORD=
REDIS_URL=redis://localhost:6379
```

## Next Steps
1. Choose Option A, B, or C above
2. Start Redis using selected method
3. Run `npm run dev:quic:full`
4. Verify no Redis connection errors in logs
