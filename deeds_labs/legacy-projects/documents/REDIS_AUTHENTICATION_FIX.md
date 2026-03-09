# Redis Authentication Fix - Complete Guide

## Problem Summary

**Error**: `[ioredis] Unhandled error event: ReplyError: NOAUTH Authentication required`

**Root Cause**: Your development scripts are trying to connect to Redis port 6380 with an empty password, but that instance requires authentication.

---

## The Issue Explained

Your current environment (from package.json):
```bash
REDIS_URL=redis://localhost:6380
REDIS_PASSWORD=  (empty/blank)
```

**Problems**:
1. ❌ Port 6380 is the **isolated test Redis** (requires auth)
2. ❌ REDIS_PASSWORD is **empty string** (no credentials provided)
3. ❌ ioredis client requires both URL with embedded password AND env variable

---

## Solution: Fix Scripts

### Scripts That Need Fixing

**In `sveltekit-frontend/package.json`, find these lines:**

```json
"dev": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://localhost:6380 REDIS_PASSWORD= node scripts/start-dev-dynamic.js",
"dev:quic": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://localhost:6380 REDIS_PASSWORD= node scripts/start-full-stack.js",
```

### Fix Option 1: Use Main Redis (RECOMMENDED)

**Change to:**
```json
"dev": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://:redis@localhost:6379 REDIS_PASSWORD=redis node scripts/start-dev-dynamic.js",
"dev:quic": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://:redis@localhost:6379 REDIS_PASSWORD=redis node scripts/start-full-stack.js",
```

**Why this works**:
- ✅ Uses main Redis on **port 6379** (RediSearch, RedisJSON, fully configured)
- ✅ Includes password in URL: `redis://:redis@`
- ✅ Sets REDIS_PASSWORD env variable: `redis`
- ✅ Already pre-configured with password: `redis`

### Fix Option 2: Use Test Redis (If you want isolated instances)

**Change to:**
```json
"dev": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://:redis@localhost:6380 REDIS_PASSWORD=redis node scripts/start-dev-dynamic.js",
"dev:quic": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://:redis@localhost:6380 REDIS_PASSWORD=redis node scripts/start-full-stack.js",
```

**Why this works**:
- ✅ Still uses **port 6380** if you prefer test instance
- ✅ But now includes proper authentication
- ✅ You may need to pre-configure 6380 with password `redis`

---

## Which Option to Choose?

### Choose Option 1 (Main Redis on 6379) if:
- ✅ Doing normal development
- ✅ Want all Redis features (RediSearch, RedisJSON)
- ✅ Not running isolated tests
- ✅ **RECOMMENDED FOR MOST USERS**

### Choose Option 2 (Test Redis on 6380) if:
- ✅ Running isolated test suites
- ✅ Need separate caches for different test scenarios
- ⚠️ Requires extra setup (password configuration)

---

## Complete Fixed Scripts

Replace the entire script section (lines 7-19 in package.json) with:

```json
"dev": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://:redis@localhost:6379 REDIS_PASSWORD=redis node scripts/start-dev-dynamic.js",
"dev:static": "concurrently -n \"Redis,Vite\" -c \"red,cyan\" \"node scripts/start-redis.js\" \"vite dev --host 0.0.0.0\"",
"dev:solo": "vite dev --host 0.0.0.0 --strictPort",
"ingest:file": "node scripts/ingest-file.js",
"test:minio:redis": "node scripts/test-minio-redis.js",
"dev:port": "node scripts/start-dev-dynamic.js",
"dev:gpu": "cross-env NODE_OPTIONS=--max-old-space-size=3072 ENABLE_GPU=true RTX_3060_OPTIMIZATION=true CONTEXT7_MULTICORE=true OLLAMA_GPU_LAYERS=30 vite dev",
"dev:gpu:quic": "cross-env NODE_OPTIONS=--max-old-space-size=3072 ENABLE_GPU=true RTX_3060_OPTIMIZATION=true CONTEXT7_MULTICORE=true OLLAMA_GPU_LAYERS=30 vite dev --port 5174 --strictPort --host 127.0.0.1",
"dev:gpu:8g": "cross-env NODE_OPTIONS=\"--max-old-space-size=8192\" ENABLE_GPU=true RTX_3060_OPTIMIZATION=true CONTEXT7_MULTICORE=true OLLAMA_GPU_LAYERS=30 vite dev",
"dev:8g": "cross-env NODE_OPTIONS=\"--max-old-space-size=8192\" vite dev",
"dev:auto": "node scripts/start-dev-with-ollama.mjs",
"dev:auto:quic": "node scripts/start-dev-with-ollama.mjs --quic",
"dev:quic": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://:redis@localhost:6379 REDIS_PASSWORD=redis node scripts/start-full-stack.js",
```

---

## Step-by-Step Fix Instructions

### 1. Edit package.json

**File**: `sveltekit-frontend/package.json`

**Find line 7:**
```bash
"dev": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://localhost:6380 REDIS_PASSWORD= node scripts/start-dev-dynamic.js",
```

**Replace with:**
```bash
"dev": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://:redis@localhost:6379 REDIS_PASSWORD=redis node scripts/start-dev-dynamic.js",
```

**Find line 19:**
```bash
"dev:quic": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://localhost:6380 REDIS_PASSWORD= node scripts/start-full-stack.js",
```

**Replace with:**
```bash
"dev:quic": "cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://:redis@localhost:6379 REDIS_PASSWORD=redis node scripts/start-full-stack.js",
```

### 2. Verify Redis is Running

```bash
# Check if Redis is running on port 6379
docker ps | grep redis

# If not running, start it
docker-compose up -d redis
```

### 3. Test the Fix

```bash
# Clear npm cache (sometimes helps with env changes)
npm cache clean --force

# Run dev with new credentials
npm run dev

# Or run dev:quic
npm run dev:quic
```

### 4. Expected Result

✅ Should NOT see: `NOAUTH Authentication required`
✅ Should see: Normal Redis connection and Vite dev server output

---

## Understanding the Fix

### What Changed?

| Part | Before | After | Reason |
|------|--------|-------|--------|
| **Port** | `6380` | `6379` | Main Redis (not test instance) |
| **URL Format** | `redis://localhost:6380` | `redis://:redis@localhost:6379` | Embedded password |
| **Password Env** | `REDIS_PASSWORD=` (empty) | `REDIS_PASSWORD=redis` | Matches embedded password |

### Why Both URL and Password Needed?

The ioredis client (used in this project) checks credentials in multiple places:

1. **REDIS_URL**: For connection string with embedded auth
2. **REDIS_PASSWORD**: For explicit password configuration
3. **REDIS_USERNAME**: For user (optional, defaults to "default")

Both must match for successful authentication.

---

## Troubleshooting

### If you still get "NOAUTH Authentication required":

**Step 1**: Verify Redis is running
```bash
docker ps | grep redis
# Should show a running redis container
```

**Step 2**: Check Redis password
```bash
# Inside the Redis container
docker-compose exec redis redis-cli CONFIG GET requirepass
# Should return: "requirepass" "redis"
```

**Step 3**: Test connection manually
```bash
# From your host machine
docker-compose exec redis redis-cli -p 6379 -a redis ping
# Should return: PONG
```

**Step 4**: Check environment variables in your running process
```bash
# In your npm run dev terminal, look for:
# REDIS_URL=redis://:redis@localhost:6379
# REDIS_PASSWORD=redis
```

### If Redis container won't start:

```bash
# Stop all Redis containers
docker-compose down

# Remove old Redis volume
docker volume rm legal-ai-redis-data

# Start fresh
docker-compose up -d redis

# Verify
docker-compose logs redis
```

---

## Redis Configuration Reference

From `.github/copilot-instructions.md`:

```
- Redis:6379 (redis-stack with RediSearch, RedisJSON)
  Default password: redis
  Default URL: redis://:redis@localhost:6379

- Redis Test:6380 (isolated test cache)
  Default password: redis (if configured)
  Default URL: redis://:redis@localhost:6380
```

---

## Prevention

To prevent this in the future:

1. **Always include password in REDIS_URL**: `redis://:password@host:port`
2. **Always set REDIS_PASSWORD**: Even if embedded, set the env var
3. **Use consistent ports**: 6379 for main, 6380 for test
4. **Test locally first**: Run `npm run dev` before pushing

---

## Summary

| What | Value |
|------|-------|
| Fix Type | Environment variable correction |
| Files Modified | `sveltekit-frontend/package.json` |
| Lines Changed | 2 (dev + dev:quic) |
| Time to Fix | < 1 minute |
| Risk Level | Very Low (no code changes, just env vars) |
| Breakage Risk | None (improves compatibility) |

---

## Next Steps

1. ✅ Edit package.json with the fixes above
2. ✅ Verify Redis is running: `docker-compose ps`
3. ✅ Run: `npm run dev` or `npm run dev:quic`
4. ✅ Look for successful connection (no NOAUTH errors)
5. ✅ Navigate to http://localhost:5173 (or your configured port)

**Questions?** Check the troubleshooting section or verify Redis is running with the correct password.
