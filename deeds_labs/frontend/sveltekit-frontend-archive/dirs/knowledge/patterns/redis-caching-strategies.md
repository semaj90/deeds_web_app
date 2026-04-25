---
tags: ["redis", "caching", "performance", "optimization", "kv-store", "ttl", "invalidation"]
symbols: ["redis.get", "redis.setex", "redis.del", "JSON.stringify", "JSON.parse", "withCache", "Cache-Control", "stale-while-revalidate"]
route_kind: ["endpoint", "load"]
http_methods: ["GET"]
risk: ["data-consistency", "perf", "memory"]
---

# Redis Caching Strategies

## Intent

Reduces database load and improves response latency by storing expensive query results in Redis with TTL-based expiration and strategic invalidation patterns.

**One-Sentence Summary**: Cache-Aside pattern (GET from cache → if miss fetch DB → SET to cache with TTL → return) with write-through invalidation.

---

## When to Use / When Not

✅ **Use Redis caching when:**
- Data is read-heavy (10:1 read/write ratio or higher)
- Database queries are expensive (>100ms, complex joins, aggregations)
- Data changes infrequently (configuration, public content, reference data)
- Response time requirements are strict (<100ms target)
- Need to share state across multiple server instances

❌ **Don't cache when:**
- Data requires strong consistency (real-time stock prices, inventory levels)
- Data is unique per request (non-reusable search queries with 1000s of permutations)
- Dataset larger than available Redis memory (use DB query optimization instead)
- Sensitive PII data without proper encryption + namespacing
- Write-heavy workloads (cache constantly invalidated)

---

## Cache Structure

### Key Format Standards
```
cache:{tenant}:{resource}:{identifier}:{hash?}
```

**Examples:**
- `cache:tenant_123:reports:456` - Single report for tenant
- `cache:global:config:app_settings` - Global application config
- `cache:user_789:dashboard:stats` - User-specific dashboard data
- `cache:tenant_123:reports:list:page_1` - Paginated list cache

### TTL Tiers (Recommended Values)

| Tier | Duration | Use Case |
|------|----------|----------|
| **Ultra-Short** | 30-60s | Real-time dashboards, volatile data |
| **Short** | 5-15min | API responses, user sessions |
| **Medium** | 1-6hr | Reports, analytics, aggregations |
| **Long** | 24hr+ | Static content, config, public data |
| **Sliding** | Reset on access | Session data, active users |

### Value Format
- **Simple**: `JSON.stringify(data)`
- **Complex**: Use `superjson` for Date, BigInt, undefined, Map, Set
- **Large**: Consider compression with `lz-string` if >10KB

---

## Caching Strategies

### 1. Cache-Aside (Lazy Loading) ⭐ Most Common
**Pattern**: Application controls both read and write to cache.

**Flow:**
1. Check cache for key
2. If HIT: Return cached data
3. If MISS: Fetch from database
4. Write to cache with TTL
5. Return data

**Pros**: Simple, cache only what's requested
**Cons**: Initial request is slow (cache miss)

### 2. Read-Through
**Pattern**: Cache sits between app and database, handles fetching automatically.

**Flow:**
1. App requests from cache
2. Cache checks itself
3. If MISS: Cache fetches from DB, stores, returns
4. If HIT: Returns data

**Pros**: Transparent to application
**Cons**: Requires cache library with DB integration

### 3. Write-Through
**Pattern**: Data written to cache and database synchronously.

**Flow:**
1. App writes to cache
2. Cache writes to database (blocking)
3. Confirm write success

**Pros**: Cache always consistent with DB
**Cons**: Slower writes, complexity

### 4. Write-Behind (Write-Back)
**Pattern**: Write to cache immediately, queue DB write asynchronously.

**Flow:**
1. App writes to cache
2. Cache returns success
3. Background worker writes to DB

**Pros**: Fast writes
**Cons**: Risk of data loss if cache crashes before DB sync

### 5. Stale-While-Revalidate (SWR) ⭐ High Availability
**Pattern**: Return stale data immediately while fetching fresh data in background.

**Implementation:**
```typescript
async function withSWR<T>(key: string, fetcher: () => Promise<T>, ttl = 300) {
  const cached = await redis.get(key);
  const cacheTime = await redis.get(`${key}:time`);

  if (cached) {
    const age = Date.now() - (parseInt(cacheTime || '0'));

    // If stale (> 50% of TTL), revalidate in background
    if (age > (ttl * 1000) / 2) {
      // Fire and forget background refresh
      fetcher().then(fresh => {
        redis.setex(key, ttl, JSON.stringify(fresh));
        redis.setex(`${key}:time`, ttl, Date.now().toString());
      });
    }

    return JSON.parse(cached) as T;
  }

  // Cache miss - fetch and store
  const fresh = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(fresh));
  await redis.setex(`${key}:time`, ttl, Date.now().toString());
  return fresh;
}
```

**Pros**: Always fast response, high availability
**Cons**: Clients may see slightly stale data

---

## Invalidation Strategies

### 1. TTL-Based (Passive)
Let keys expire naturally. Good for data with predictable staleness.

```typescript
await redis.setex(key, 300, JSON.stringify(data)); // Expires in 5 minutes
```

### 2. Event-Based (Active)
Invalidate on mutation. Ensures consistency.

```typescript
// On report update
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const updated = await db.update(reports)
    .set({ ...data })
    .where(eq(reports.id, params.id));

  // Invalidate specific report cache
  await redis.del(`cache:${locals.user.tenantId}:reports:${params.id}`);

  // Invalidate list caches (all pages)
  const listKeys = await redis.keys(`cache:${locals.user.tenantId}:reports:list:*`);
  if (listKeys.length > 0) {
    await redis.del(...listKeys);
  }

  return json(updated);
};
```

### 3. Version-Based (Mass Invalidation)
Increment version number to invalidate all related caches.

```typescript
// Store version in Redis
const version = await redis.incr('cache:version:reports');

// Use version in cache key
const key = `cache:${tenantId}:reports:list:v${version}:page_1`;
```

### 4. Tag-Based (Redis Sets)
Group related keys with tags for batch invalidation.

```typescript
// On cache write, add to tag set
await redis.sadd(`tag:reports:user_${userId}`, cacheKey);

// On invalidation, get all keys with tag and delete
const keys = await redis.smembers(`tag:reports:user_${userId}`);
if (keys.length > 0) {
  await redis.del(...keys);
  await redis.del(`tag:reports:user_${userId}`);
}
```

---

## Dogpile Prevention (Cache Stampede)

### Problem
Cache expires → 1000 concurrent requests → All hit database → Database overload

### Solution 1: Probabilistic Early Expiration
Recompute cache *before* expiration based on probability.

```typescript
async function withEarlyExpiration<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = 300
) {
  const cached = await redis.get(key);
  const ttlRemaining = await redis.ttl(key);

  if (cached && ttlRemaining > 0) {
    // Probability of early recompute: (TTL - remaining) / TTL
    const delta = ttl - ttlRemaining;
    const recomputeProbability = delta / ttl;

    if (Math.random() < recomputeProbability) {
      // Recompute in background
      fetcher().then(fresh => redis.setex(key, ttl, JSON.stringify(fresh)));
    }

    return JSON.parse(cached) as T;
  }

  // Cache miss - fetch and store
  const fresh = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(fresh));
  return fresh;
}
```

### Solution 2: Lock-Based Recompute (Redlock)
Only one request recomputes, others wait.

```typescript
import Redlock from 'redlock';

async function withLock<T>(key: string, fetcher: () => Promise<T>, ttl = 300) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;

  const lockKey = `lock:${key}`;
  const redlock = new Redlock([redis]);

  try {
    const lock = await redlock.acquire([lockKey], 5000); // 5s lock

    // Double-check cache (another request may have filled it)
    const cached2 = await redis.get(key);
    if (cached2) {
      await lock.release();
      return JSON.parse(cached2) as T;
    }

    // Fetch and cache
    const fresh = await fetcher();
    await redis.setex(key, ttl, JSON.stringify(fresh));
    await lock.release();
    return fresh;
  } catch (err) {
    // Lock acquisition failed - fall back to fetcher
    return await fetcher();
  }
}
```

---

## Validation (Cache Health)

### Metrics to Track
```typescript
export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number; // hits / (hits + misses)
  evictions: number;
  memoryUsed: number;
  keyCount: number;
}

// Increment hit/miss counters
await redis.incr('cache:metrics:hits');
await redis.incr('cache:metrics:misses');

// Calculate hit rate
const hits = parseInt((await redis.get('cache:metrics:hits')) || '0');
const misses = parseInt((await redis.get('cache:metrics:misses')) || '0');
const hitRate = hits / (hits + misses);
```

### Health Check Endpoint
```typescript
// src/routes/api/cache/health/+server.ts
export const GET: RequestHandler = async () => {
  const info = await redis.info('stats');
  const memory = await redis.info('memory');

  return json({
    status: 'healthy',
    keyspace: await redis.dbsize(),
    hitRate: parseFloat(info.match(/keyspace_hits:(\d+)/)?.[1] || '0'),
    memoryUsedMB: parseFloat(memory.match(/used_memory:(\d+)/)?.[1] || '0') / 1024 / 1024,
    evictions: parseFloat(info.match(/evicted_keys:(\d+)/)?.[1] || '0')
  });
};
```

---

## Failure Modes

| Symptom | Root Cause | Fix | Verification |
|---------|-----------|-----|--------------|
| **Cache stampede: 1000 requests hit DB simultaneously** | Cache expired, all concurrent requests miss | Implement probabilistic early expiration or redlock | Monitor DB query spike at cache expiry time |
| **JSON.parse error: Unexpected token** | Corrupted cache data or invalid JSON | Wrap parse in try/catch, delete corrupted key, fetch fresh | Check error logs for SyntaxError in cache reads |
| **Redis OOM: MISCONF Redis is configured to save RDB** | Redis out of memory, can't accept writes | Set `maxmemory-policy allkeys-lru` in redis.conf | Run `redis-cli INFO memory` |
| **Stale data returned after update** | Cache not invalidated on mutation | Add `redis.del(key)` to PUT/POST/DELETE endpoints | Update entity, verify cache cleared with `redis-cli GET key` |
| **Cache miss on every request** | TTL too short or keys don't match | Check key format consistency, increase TTL | Monitor hit rate (should be >80% for read-heavy data) |
| **Memory leak: Redis memory grows unbounded** | Keys without TTL never expire | Set TTL on all keys, use `redis-cli KEYS *` to find persistent keys | Check for keys with `TTL -1` (no expiration) |
| **Cross-tenant data leak** | Missing tenant namespace in cache key | Include `tenantId` in all cache keys | Audit cache keys for tenant isolation |
| **Slow reads despite caching** | Large cached values (>1MB) or network latency | Compress large values with lz-string, use local Redis | Measure `redis.get()` duration |
| **Connection timeout: Redis unavailable** | Redis server down or network issue | Implement fail-open pattern (catch errors, fall back to DB) | Test with Redis stopped, verify app still works |
| **Cache working locally but not in production** | Different Redis instances or connection config | Verify `REDIS_URL` env var in production | Check connection logs |

---

---

## Security Model

### Key Namespacing (Tenant Isolation)
**Critical for multi-tenant apps:**
```typescript
const cacheKey = `cache:${locals.user.tenantId}:reports:${reportId}`;
```

**Prevents:**
- Cross-tenant data leakage
- Key collisions between tenants
- Unauthorized access to cached data

### What NOT to Cache
❌ **Never cache:**
- Session tokens (use Lucia session management)
- Passwords or password hashes
- Credit card numbers or PII without encryption
- Unpredictable keys (user-controlled input without sanitization)

✅ **Safe to cache:**
- Public API responses
- Aggregate statistics (counts, sums)
- Configuration data
- Rendered HTML fragments (with tenant namespace)

### Encryption for Sensitive Data
If caching sensitive data is unavoidable:
```typescript
import { encrypt, decrypt } from '$lib/server/crypto';

// Write
const encryptedData = encrypt(JSON.stringify(sensitiveData));
await redis.setex(key, ttl, encryptedData);

// Read
const encrypted = await redis.get(key);
if (encrypted) {
  const decrypted = decrypt(encrypted);
  return JSON.parse(decrypted);
}
```

---

## Reference Implementation

### 1. Basic Cache-Aside Wrapper (`src/lib/server/redis-cache.ts`)

```typescript
import { redis } from '$lib/server/redis';
import { logger } from '$lib/server/logger';

interface CacheOptions {
  ttl?: number; // Seconds
  key: string;
}

/**
 * Generic Cache-Aside Wrapper
 * @param options Cache configuration (key, ttl)
 * @param fetcher Async function to fetch data if cache miss
 */
export async function withCache<T>(
  { key, ttl = 300 }: CacheOptions,
  fetcher: () => Promise<T>
): Promise<T> {
  try {
    // 1. Try Cache
    const cached = await redis.get(key);
    if (cached) {
      logger.debug(`[CACHE] Hit: ${key}`);
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    logger.warn(`[CACHE] Read Error: ${key}`, err);
    // Proceed to fetcher on error (fail open)
  }

  // 2. Fetch Data
  logger.debug(`[CACHE] Miss: ${key}`);
  const data = await fetcher();

  // 3. Write Cache (Fire & Forget)
  if (data) {
    redis.setex(key, ttl, JSON.stringify(data)).catch(err => {
      logger.warn(`[CACHE] Write Error: ${key}`, err);
    });
  }

  return data;
}
```

### 2. API Endpoint Usage (`src/routes/api/reports/+server.ts`)

```typescript
import { json } from '@sveltejs/kit';
import { withCache } from '$lib/server/redis-cache';
import { db } from '$lib/server/db';
import { reports } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const reportId = url.searchParams.get('id');
  if (!reportId) return json({ error: 'Missing ID' }, { status: 400 });

  // Cache Key: specific to user/tenant if data is private
  const cacheKey = `cache:reports:${locals.user.id}:${reportId}`;

  const data = await withCache(
    { key: cacheKey, ttl: 60 }, // 1 minute cache
    async () => {
      const result = await db.query.reports.findFirst({
        where: eq(reports.id, parseInt(reportId))
      });
      return result;
    }
  );

  if (!data) return json({ error: 'Not found' }, { status: 404 });

  return json(data, {
    headers: {
      'X-Cache': 'HIT' // Note: This will be misleading if it was a miss, logic needs adjustment for headers
    }
  });
};
```

### 3. Invalidation on Mutation (`src/routes/api/reports/+server.ts`)

```typescript
export const POST: RequestHandler = async ({ request, locals }) => {
  // ... validation ...

  const newReport = await db.insert(reports).values({...}).returning();

  // Invalidate List Cache
  const listKey = `cache:reports:list:${locals.user.id}`;
  await redis.del(listKey);

  return json(newReport);
};
```

---

## Failure Modes & Recovery

### 1. Cache Stampede (Dogpiling)
**Symptom:** Cache expires, 1000 requests hit DB simultaneously.
**Fix:**
- **Probabilistic Early Expiration (X-Fetch)**: Recompute cache before it actually expires.
- **Locking**: Use `redlock` to ensure only one worker recomputes.
- **Stale-While-Revalidate**: Serve stale data while one worker updates.

### 2. Serialization Errors
**Symptom:** `SyntaxError: Unexpected token` in `JSON.parse`.
**Fix:**
- Wrap `JSON.parse` in try/catch.
- If parse fails, treat as cache miss and delete the corrupted key.

### 3. Redis Out of Memory (OOM)
**Symptom:** Redis rejects writes with OOM error.
**Fix:**
- Set `maxmemory-policy allkeys-lru` in `redis.conf`.
- Ensure all keys have a TTL.
- Monitor memory usage.

### 4. Connection Failures
**Symptom:** Redis is down.
**Fix:**
- **Fail Open**: Catch Redis errors and fall back to Database. Do not crash the app.
- Use a circuit breaker pattern if Redis timeouts are high.

---

## Integration Checklist

- [ ] **Redis Client**: Ensure `ioredis` or `@upstash/redis` is configured.
- [ ] **Error Handling**: Verify `withCache` catches Redis errors and falls back to DB.
- [ ] **TTL Strategy**: Define TTLs for different data types (static vs dynamic).
- [ ] **Invalidation**: Identify all mutation points (POST/PUT/DELETE) and ensure they clear relevant keys.
- [ ] **Namespacing**: Verify keys include tenant/user IDs where appropriate.
- [ ] **Serialization**: Ensure Date objects and BigInts are handled (JSON doesn't support them natively, may need superjson).

---

## Testing

### Unit Test (Mock Redis)
```typescript
import { describe, it, expect, vi } from 'vitest';
import { withCache } from '$lib/server/redis-cache';

const mockRedis = {
  get: vi.fn(),
  setex: vi.fn()
};

vi.mock('$lib/server/redis', () => ({ redis: mockRedis }));

describe('withCache', () => {
  it('returns cached data on hit', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }));
    const fetcher = vi.fn();

    const result = await withCache({ key: 'test' }, fetcher);

    expect(result).toEqual({ foo: 'bar' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetches and caches on miss', async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetcher = vi.fn().mockResolvedValue({ foo: 'bar' });

    const result = await withCache({ key: 'test' }, fetcher);

    expect(result).toEqual({ foo: 'bar' });
    expect(mockRedis.setex).toHaveBeenCalled();
  });
});
```

  // 2. Fetch Data
  const data = await db.query.reports.findFirst({ where: eq(reports.id, id) });

  // 3. Set Cache (TTL 5 mins)
  if (data) {
    await redis.setex(key, 300, JSON.stringify(data));
  }

  return json(data);
};
```

## Integration checklist
1. Define unique cache key.
2. Implement "Get-Check-Return" pattern.
3. Implement "Fetch-Set-Return" pattern.
4. Add invalidation logic in mutation endpoints.

## Tests
- First request -> Cache Miss (DB call).
- Second request -> Cache Hit (No DB call).
- Update data -> Cache cleared/updated.
