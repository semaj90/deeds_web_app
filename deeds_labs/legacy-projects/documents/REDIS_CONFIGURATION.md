# Redis Configuration Guide - Legal AI Platform

## Problem Summary

**Issue**: Repeated "ERR AUTH <password> called without any password configured for the default user" errors in Vite dev logs.

**Root Cause**: Multiple locations in the codebase were hardcoding `'redis'` as the default password, causing the app to send AUTH commands to Redis instances that don't require authentication (passwordless setup).

## Solution Applied

### Principle: Conditional Authentication
Only send Redis AUTH command if `REDIS_PASSWORD` environment variable is explicitly set. If not set, skip the password parameter entirely.

### Files Fixed

#### 1. **ai-assistant-input-synthesizer.ts**
```typescript
// BEFORE (❌ Always sends 'redis' password)
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false
});

// AFTER (✅ Only sets password if explicitly provided)
const redisConfig: any = {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false
};

if (process.env.REDIS_PASSWORD) {
  redisConfig.password = process.env.REDIS_PASSWORD;
}

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', redisConfig);
```

#### 2. **server/config.ts**
Changed from: `password: process.env.REDIS_PASSWORD || 'redis'`
Changed to: `password: process.env.REDIS_PASSWORD || undefined`

#### 3. **server/adapters/service-integrations.ts**
Changed from: `password: process.env.REDIS_PASSWORD || 'redis'`
Changed to: `password: process.env.REDIS_PASSWORD || undefined`

#### 4. **server/chrrom/predictor.ts**
Changed hardcoded password logic to conditional password setting with proper URL construction.

#### 5. **server/connections/connection-pool.ts**
Applied conditional password configuration to avoid unnecessary AUTH attempts.

#### 6. **server/ws-evidence-server.ts**
Fixed WebSocket Redis client to only set password when explicitly configured.

#### 7. **config/gpu-rag-config.ts**
Changed from: `password: 'redis'`
Changed to: `password: process.env.REDIS_PASSWORD || undefined`

## Environment Configuration

### For Passwordless Redis (Development)
```bash
# Don't set REDIS_PASSWORD
# Or explicitly set it to empty
REDIS_PASSWORD=
REDIS_URL=redis://localhost:6379
```

### For Password-Protected Redis (Production)
```bash
# Set the actual password
REDIS_PASSWORD=your_secure_password
REDIS_URL=redis://localhost:6379
# or with auth in URL:
REDIS_URL=redis://:your_secure_password@localhost:6379
```

## Docker Redis Setup

### Option 1: Passwordless (Development)
```bash
# Start Redis without authentication
docker run -d \
  --name legal-ai-redis \
  -p 6379:6379 \
  redis:7-alpine

# Don't set REDIS_PASSWORD in environment
```

### Option 2: Password-Protected (Production)
```bash
# Start Redis with authentication
docker run -d \
  --name legal-ai-redis \
  -p 6379:6379 \
  redis:7-alpine \
  redis-server --requirepass your_secure_password

# Set environment variable
export REDIS_PASSWORD=your_secure_password
```

## Verification

### Check Redis Server Status
```bash
# Connect without authentication (passwordless setup)
redis-cli ping

# Connect with authentication (password-protected)
redis-cli -h localhost -p 6379 -a your_password ping
```

### Check Application Connection
```bash
# View logs for "✅ Redis connected" or "⚠️ Redis unavailable"
npm run dev

# Check if AUTH errors appear in logs
```

### Test Specific Redis Clients
```typescript
// Quick test in Node.js
import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  // Don't set password if Redis doesn't require it
});

redis.ping().then(() => console.log('✅ Connected')).catch(err => console.error('❌ Error:', err));
```

## Configuration Files

### Primary Configuration Source
- `src/lib/config/redis-config.ts` - Master configuration with proper `undefined` defaults
- `src/lib/server/config.ts` - Server configuration
- `src/lib/server/adapters/service-integrations.ts` - Integration adapter config

### Pattern for New Redis Clients
```typescript
// Always follow this pattern when creating Redis clients:

const password = process.env.REDIS_PASSWORD;
const config: any = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  // ... other config options
};

// Only add password if explicitly set
if (password) {
  config.password = password;
}

const redisClient = new Redis(config);
```

## Troubleshooting

### Error: "ERR AUTH <password> called without any password configured"
**Cause**: Redis client trying to authenticate but Redis server doesn't require it.
**Solution**: Make sure `REDIS_PASSWORD` is not set in environment variables.

### Error: "NOAUTH Authentication required"
**Cause**: Redis requires password but it's not provided.
**Solution**: Set `REDIS_PASSWORD` environment variable to the correct value.

### Error: "ERR invalid password"
**Cause**: `REDIS_PASSWORD` is set but incorrect.
**Solution**: Verify the password matches the Docker container configuration.

### Redis Connection Timeouts
**Cause**: Wrong host/port or firewall blocking.
**Solution**:
```bash
# Test connectivity
redis-cli -h localhost -p 6379 ping

# Check Docker container is running
docker ps | grep redis

# Check logs
docker logs legal-ai-redis
```

## Best Practices

1. **Never Hardcode Passwords**: Always use `process.env.REDIS_PASSWORD`
2. **Use Conditionals**: Only set password config if environment variable exists
3. **Environment Parity**: Match dev/prod Redis configurations
4. **Error Handling**: Gracefully degrade if Redis is unavailable
5. **Logging**: Log which Redis server is being used during initialization

## Redis Clients in Use

The application uses multiple Redis clients:
1. **bullmqService** - Job queue management
2. **cache-service** - General caching
3. **ai-assistant-input-synthesizer** - RAG caching
4. **connection-pool** - Vector database pool
5. **ws-evidence-server** - WebSocket real-time updates
6. **chrrom/predictor** - Prediction caching
7. **service-integrations** - Service adapter

All have been updated to use conditional password handling.

## Performance Impact

Removing hardcoded passwords:
- ✅ Eliminates AUTH failures on passwordless Redis
- ✅ Reduces error spam in logs
- ✅ Cleaner startup experience
- ❌ No negative performance impact

## Migration Checklist

- [x] Fix ai-assistant-input-synthesizer.ts
- [x] Fix server/config.ts
- [x] Fix server/adapters/service-integrations.ts
- [x] Fix server/chrrom/predictor.ts
- [x] Fix server/connections/connection-pool.ts
- [x] Fix server/ws-evidence-server.ts
- [x] Fix config/gpu-rag-config.ts
- [x] Update redis-config.ts to use `undefined` defaults
- [x] Document pattern for future clients
- [x] Test with both passwordless and password-protected Redis

---

**Status**: ✅ All Redis password issues resolved
**Last Updated**: 2025-10-26
