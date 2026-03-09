# Redis Authentication Fix - Port 6380 Issue

## Problem Identified

Error: `NOAUTH Authentication required` on `redis://localhost:6380`

**Environment variables being set:**
```bash
REDIS_URL=redis://localhost:6380
REDIS_PASSWORD=  (empty string!)
```

**Issue**: Port 6380 is the isolated **test Redis instance** (not the main Redis on 6379), and you're not providing the password.

## Root Cause

From `.github/copilot-instructions.md`:
```
- Redis:6379 (redis-stack with RediSearch, RedisJSON) - password: redis
- Redis Test:6380 (isolated test cache) - needs authentication
```

Your script is trying to:
1. Connect to port **6380** (test instance)
2. With **empty password** (`REDIS_PASSWORD=`)
3. But Redis **requires authentication** on 6380

## Solution Options

### Option 1: Use Main Redis (Recommended for Development)
```bash
REDIS_URL=redis://:redis@localhost:6379
REDIS_PASSWORD=redis
```

**Why**: 
- Main production instance with all features (RediSearch, RedisJSON)
- Password already configured: `redis`
- Better for testing real configurations

### Option 2: Use Test Redis with Proper Auth
```bash
REDIS_URL=redis://:redis@localhost:6380
REDIS_PASSWORD=redis
```

**Why**:
- Isolated test instance
- Same password as main (`redis`)
- Useful for isolated testing

### Option 3: Start Fresh Docker Redis with Known Password
```bash
docker run -d \
  --name legal-ai-redis-6380 \
  -p 6380:6379 \
  redis:7-alpine \
  redis-server --requirepass redis

# Then use:
REDIS_URL=redis://:redis@localhost:6380
REDIS_PASSWORD=redis
```

## File to Fix

**Location**: `sveltekit-frontend/scripts/start-full-stack.js`

Current problematic line in npm run dev:quic:
```bash
cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://localhost:6380 REDIS_PASSWORD= node scripts/start-full-stack.js
```

Should be changed to:
```bash
cross-env DEV_BYPASS_AUTH=true REDIS_URL=redis://:redis@localhost:6379 REDIS_PASSWORD=redis node scripts/start-full-stack.js
```

## Verification

After fixing, test with:
```bash
# Check if Redis is running on 6379
docker ps | grep redis

# Test connection
npm run dev:quic

# Should NOT see "NOAUTH Authentication required" error
```

## Why Both URL and PASSWORD Needed?

The ioredis client used in the project needs:
1. **REDIS_URL** with embedded password: `redis://:PASSWORD@host:port`
2. **REDIS_PASSWORD** as environment variable for client configuration

Both are checked by different parts of the system.

## Quick Fix Summary

| What | Current | Fixed |
|------|---------|-------|
| URL | `redis://localhost:6380` | `redis://:redis@localhost:6379` |
| Password | (empty) | `redis` |
| Port | 6380 (test, needs setup) | 6379 (main, pre-configured) |

---

**Recommendation**: Use Option 1 (main Redis on 6379) unless you specifically need isolated test instances.
