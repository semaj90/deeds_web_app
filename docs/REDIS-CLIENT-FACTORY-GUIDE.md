# Shared Redis Client Factory Guide

**Date**: July 28, 2026  
**Status**: ✅ WIRED & TESTED  
**File**: `scripts/atlas/lib/redis-client-factory.mjs`

## Overview

Centralizes Redis/Valkey connection configuration to eliminate divergence across Atlas pipeline scripts. Single source of truth for host, port, password, and connection behavior.

## Quick Start

```typescript
import { createAtlasRedisClient, VECTOR_LANE_REGISTRY } from './lib/redis-client-factory.mjs';

async function main() {
  const redis = createAtlasRedisClient();
  await redis.connect();

  try {
    const value = await redis.get('key');
    console.log(value);
  } finally {
    await redis.quit();
  }
}
```

## Configuration

**Environment variables** (priority order):
1. Function parameter overrides
2. `.env` file (loaded at process startup)
3. Defaults (127.0.0.1:6379, no password)

**Example `.env`:**
```bash
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=redis
```

## API Reference

### `createAtlasRedisClient(overrides?)`

Creates a new Redis client (not connected yet).

```javascript
// Defaults from environment
const redis = createAtlasRedisClient();

// With overrides
const redis = createAtlasRedisClient({
  host: '192.168.1.100',
  port: 6380,
  password: 'custom-password',
  ioredisOptions: { connectTimeout: 5000 }
});

await redis.connect();
```

**Returns**: `Redis` client instance (requires explicit `connect()`)

### `createAndConnectAtlasRedisClient(overrides?)`

Creates and connects in one call.

```javascript
const redis = await createAndConnectAtlasRedisClient();
// Ready to use immediately
```

### `verifyRedisConnection(client)`

Check if a client is healthy.

```javascript
const isHealthy = await verifyRedisConnection(redis);
if (!isHealthy) {
  console.log('Redis is offline');
}
```

### `getAtlasRedisConfig()`

Get current configuration (for logging/diagnostics).

```javascript
const config = getAtlasRedisConfig();
console.log(config.host, config.port);
// Output: { host: '127.0.0.1', port: 6379, passwordSet: true, ... }
```

## Vector Lane Registry

Documents semantic meaning of each embedding dimension.

```javascript
import { VECTOR_LANE_REGISTRY } from './lib/redis-client-factory.mjs';

// Canonical 768-dim
const primary = VECTOR_LANE_REGISTRY.DENSE_768;
console.log(primary.role);        // 'CANONICAL_SEMANTIC'
console.log(primary.dimensions);   // 768
console.log(primary.model);        // 'embeddinggemma'

// Secondary 384-dim routing cache
const routing = VECTOR_LANE_REGISTRY.DENSE_384_COMPACT;
console.log(routing.role);         // 'ROUTING_PREFILTER'
console.log(routing.onlineSearch); // false (cache only)

// Experimental 64-dim compression
const latent = VECTOR_LANE_REGISTRY.LATENT_64;
console.log(latent.role);          // 'EXPERIMENTAL_COMPRESSION'
```

## Hard Rules

1. **Always use `createAtlasRedisClient()`** — don't instantiate `new Redis()` directly in scripts
2. **Call `await redis.connect()` explicitly** — factory uses `lazyConnect: true`
3. **Call `await redis.quit()` on exit** — prevents connection leaks
4. **Use vector lane registry** when documenting retrieval strategy decisions
5. **Fail fast on configuration errors** — invalid port number throws immediately

## Error Handling

The factory throws on invalid configuration:

```javascript
// ❌ This throws
createAtlasRedisClient({ port: 'invalid' });
// Error: Invalid REDIS_PORT: invalid. Must be an integer between 1 and 65535.

// ✅ This works
createAtlasRedisClient({ port: 6380 });
```

Connection errors are logged but don't throw:

```javascript
const redis = createAtlasRedisClient();
redis.on('error', (err) => console.log('Connection error:', err.message));
await redis.connect(); // Throws if connection fails
```

## Migration Path

**Old pattern** (scattered across scripts):
```javascript
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';
const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD });
```

**New pattern** (canonical):
```javascript
import { createAtlasRedisClient } from './lib/redis-client-factory.mjs';
const redis = createAtlasRedisClient();
await redis.connect();
```

**Benefits**:
- Single source of truth
- Prevents password divergence
- Standardized error handling
- Easy to audit and upgrade

## Pipeline Scripts Status

| Script | Status | Pattern |
|--------|--------|---------|
| `graphify-cluster-pagerank.mjs` | ⏳ Pending | `new Redis()` → shared factory |
| `graphify-semantic-cluster.mjs` | ⏳ Pending | `new Redis()` → shared factory |
| `prewarm-compact-cache.mjs` | ✅ Updated | Uses shared factory |
| `backfill-redis-cache-from-postgres.mjs` | ✅ Working | Uses old pattern (backward compatible) |
| `graphify-kag-notes-missing.mjs` | ✅ Working | Uses old pattern (backward compatible) |

## Testing

Run the migration guide to verify the pattern:

```bash
cd scripts/atlas
REDIS_PASSWORD=redis node migrate-scripts-to-shared-redis-client.mjs --verbose
```

Expected output:
```
✅ All tests passed!
📦 Vector Lane Registry:
  DENSE_768: ...
  DENSE_384_COMPACT: ...
  LATENT_64: ...
```

## References

- **Implementation**: `scripts/atlas/lib/redis-client-factory.mjs` (200 lines)
- **Migration Guide**: `scripts/atlas/migrate-scripts-to-shared-redis-client.mjs` (interactive demo)
- **Related**: Valkey connection pattern fix (commit e33b1f2482)
- **Policy**: CLAUDE.md § "Valkey/Redis Connection Pattern (ioredis)"

---

**Next Steps**:
1. Update `graphify-cluster-pagerank.mjs` to use `createAtlasRedisClient()`
2. Update `graphify-semantic-cluster.mjs` to use `createAtlasRedisClient()`
3. Run daily pipeline: `npm run graphify:daily`
4. Monitor for any port/password divergence issues
