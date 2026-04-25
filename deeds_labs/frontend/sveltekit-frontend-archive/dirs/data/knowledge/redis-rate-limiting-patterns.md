# Redis Rate Limiting: Scalable Request Throttling

**Category:** Operational Security
**Tags:** #redis #rate-limit #throttling #security #abuse-prevention #sliding-window #token-bucket
**Symbols:** `redis` `rateLimit` `incr` `pexpire` `pttl` `keys` `del` `setex` `RequestHandler` `getClientAddress`
**Route Kind:** `middleware operational`
**HTTP Methods:** `GET POST PUT PATCH DELETE`
**Risk:** `security perf`
**Last Updated:** 2025-12-24

---

## Intent

Production-ready rate limiting implementation using Redis to prevent API abuse, resource exhaustion, and denial-of-service attacks. Supports **fixed window**, **sliding window**, and **token bucket** algorithms with **per-user**, **per-IP**, and **global** rate limits.

**One-Sentence Summary:**
Track request counts in Redis with TTL-based windows → Reject requests exceeding limits → Return Retry-After headers.

---

## When to Use

✅ **Use rate limiting when:**
- Endpoint is publicly accessible (auth not required)
- Endpoint performs expensive operations (AI generation, database writes, file uploads)
- Endpoint has abuse potential (search, password reset, email sending)
- You need to enforce fair usage across users
- Protecting against credential stuffing, scraping, or DDoS

❌ **Don't rate limit when:**
- Internal server-to-server calls (trusted sources)
- Health check endpoints (`/api/health`)
- Static assets (handled by CDN)
- Idempotent GET requests with aggressive caching (cache handles traffic)

---

## Rate Limiting Algorithms

### 1. Fixed Window (Simple, Memory Efficient)

**How it works:**
- Count requests in fixed time windows (e.g., 0-60s, 60-120s)
- Window resets at fixed intervals (e.g., every minute at :00 seconds)
- Simple but allows burst at window boundaries

**Implementation:**
```typescript
// $lib/server/rate-limit/fixed-window.ts
import { redis } from '$lib/server/redis';

interface FixedWindowOptions {
  max: number;       // Maximum requests per window
  window: number;    // Window size in milliseconds
  identifier: string; // User ID or IP address
}

export async function fixedWindowRateLimit(key: string, options: FixedWindowOptions) {
  const windowStart = Math.floor(Date.now() / options.window);
  const redisKey = `rl:fixed:${key}:${options.identifier}:${windowStart}`;

  // Increment counter
  const current = await redis.incr(redisKey);

  // Set expiry on first request in window
  if (current === 1) {
    await redis.pexpire(redisKey, options.window);
  }

  const ttl = await redis.pttl(redisKey);

  return {
    success: current <= options.max,
    limit: options.max,
    remaining: Math.max(0, options.max - current),
    resetIn: ttl > 0 ? ttl : options.window,
    algorithm: 'fixed-window'
  };
}
```

**Example:**
- Window: 60 seconds
- Limit: 10 requests
- User makes 10 requests at :59 seconds → Allowed
- User makes 10 requests at :01 seconds → Allowed (new window)
- Total: 20 requests in 2 seconds (edge case)

### 2. Sliding Window (Accurate, More Complex)

**How it works:**
- Tracks request timestamps in a sorted set
- Removes old timestamps outside the window
- Prevents burst at window boundaries

**Implementation:**
```typescript
// $lib/server/rate-limit/sliding-window.ts
import { redis } from '$lib/server/redis';

interface SlidingWindowOptions {
  max: number;
  window: number;
  identifier: string;
}

export async function slidingWindowRateLimit(key: string, options: SlidingWindowOptions) {
  const now = Date.now();
  const windowStart = now - options.window;
  const redisKey = `rl:sliding:${key}:${options.identifier}`;

  // Remove timestamps outside window
  await redis.zremrangebyscore(redisKey, 0, windowStart);

  // Add current timestamp
  await redis.zadd(redisKey, now, `${now}-${Math.random()}`);

  // Count requests in window
  const count = await redis.zcard(redisKey);

  // Set expiry (cleanup old keys)
  await redis.pexpire(redisKey, options.window);

  // Get oldest timestamp to calculate reset time
  const oldest = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
  const resetIn = oldest.length > 0
    ? Math.max(0, Number(oldest[1]) + options.window - now)
    : options.window;

  return {
    success: count <= options.max,
    limit: options.max,
    remaining: Math.max(0, options.max - count),
    resetIn,
    algorithm: 'sliding-window'
  };
}
```

**Advantages:**
- More accurate than fixed window
- Prevents burst at boundaries
- Fair distribution of requests

**Disadvantages:**
- More memory (stores timestamps)
- More Redis operations (zadd, zremrangebyscore)

### 3. Token Bucket (Smooth Rate, Allows Bursts)

**How it works:**
- Tokens regenerate at constant rate
- Each request consumes 1 token
- Allows short bursts if tokens available

**Implementation:**
```typescript
// $lib/server/rate-limit/token-bucket.ts
import { redis } from '$lib/server/redis';

interface TokenBucketOptions {
  capacity: number;   // Maximum tokens (bucket size)
  refillRate: number; // Tokens added per second
  identifier: string;
}

export async function tokenBucketRateLimit(key: string, options: TokenBucketOptions) {
  const now = Date.now();
  const redisKey = `rl:tokens:${key}:${options.identifier}`;

  // Get current state
  const state = await redis.get(redisKey);
  const [lastTokens, lastRefill] = state
    ? state.split(':').map(Number)
    : [options.capacity, now];

  // Calculate tokens added since last check
  const timePassed = (now - lastRefill) / 1000; // seconds
  const tokensToAdd = timePassed * options.refillRate;
  const currentTokens = Math.min(options.capacity, lastTokens + tokensToAdd);

  // Try to consume 1 token
  const success = currentTokens >= 1;
  const remainingTokens = success ? currentTokens - 1 : currentTokens;

  // Save new state
  await redis.setex(redisKey, 3600, `${remainingTokens}:${now}`);

  return {
    success,
    limit: options.capacity,
    remaining: Math.floor(remainingTokens),
    resetIn: success
      ? Math.ceil((options.capacity - remainingTokens) / options.refillRate * 1000)
      : Math.ceil((1 - remainingTokens) / options.refillRate * 1000),
    algorithm: 'token-bucket'
  };
}
```

**Use cases:**
- Smooth request distribution
- Allow occasional bursts (user can accumulate tokens)
- API quotas (e.g., 1000 requests/day)

---

## Key Format Standards

### Recommended Key Structure
```
rl:{algorithm}:{operation}:{identifier}:{window_timestamp}
```

**Examples:**
```typescript
// Fixed window
`rl:fixed:create_case:user_abc123:1735052400`

// Sliding window (no timestamp - uses sorted set)
`rl:sliding:upload_file:192.168.1.100`

// Token bucket
`rl:tokens:search:user_def456`

// Global rate limit (all users)
`rl:fixed:ai_generate:global:1735052400`
```

### Identifier Types

**1. User ID (Authenticated)**
```typescript
const rateLimitKey = `create_case:${locals.user.id}`;
const result = await rateLimit(rateLimitKey, {
  max: 10,
  window: 60000,
  identifier: locals.user.id
});
```

**2. IP Address (Unauthenticated)**
```typescript
const rateLimitKey = `login_attempt`;
const result = await rateLimit(rateLimitKey, {
  max: 5,
  window: 300000, // 5 minutes
  identifier: getClientAddress()
});
```

**3. Combined (User + IP)**
```typescript
const identifier = locals.user
  ? `user:${locals.user.id}`
  : `ip:${getClientAddress()}`;
const result = await rateLimit('api_call', { max: 100, window: 60000, identifier });
```

**4. Global (All Users)**
```typescript
const result = await rateLimit('expensive_operation', {
  max: 1000,
  window: 60000,
  identifier: 'global'
});
```

---

## TTL Strategies

### Window-Based TTL
```typescript
// Set TTL to window duration (auto-cleanup)
const windowSec = Math.ceil(options.window / 1000);
await redis.pexpire(redisKey, options.window);
```

### Extended TTL (for analysis)
```typescript
// Keep data 24 hours for rate limit analytics
await redis.expire(redisKey, 86400);
```

### No TTL (manual cleanup)
```typescript
// For permanent quotas (monthly API limits)
// Cleanup via separate job
```

---

## Bypass Rules

### Internal IPs
```typescript
const INTERNAL_IPS = ['127.0.0.1', '::1', '10.0.0.0/8'];

function isInternalIP(ip: string): boolean {
  return INTERNAL_IPS.some(range => ip.startsWith(range.split('/')[0]));
}

export const POST: RequestHandler = async ({ getClientAddress, ...rest }) => {
  const clientIP = getClientAddress();

  if (!isInternalIP(clientIP)) {
    const rateLimitResult = await rateLimit('endpoint', {
      max: 10,
      window: 60000,
      identifier: clientIP
    });

    if (!rateLimitResult.success) {
      throw error(429, { message: 'Rate limit exceeded', retryAfter: rateLimitResult.resetIn });
    }
  }

  // ... endpoint logic
};
```

### Service Tokens
```typescript
const SERVICE_TOKENS = process.env.SERVICE_TOKENS?.split(',') || [];

export const POST: RequestHandler = async ({ request, ...rest }) => {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (SERVICE_TOKENS.includes(token || '')) {
    // Bypass rate limit for service accounts
  } else {
    // Apply rate limit
  }
};
```

### Admin Users
```typescript
if (locals.user?.role !== 'ADMIN') {
  const rateLimitResult = await rateLimit('operation', {
    max: 10,
    window: 60000,
    identifier: locals.user.id
  });

  if (!rateLimitResult.success) {
    throw error(429, { message: 'Rate limit exceeded', retryAfter: rateLimitResult.resetIn });
  }
}
```

---

## Response Headers

### Standard Headers
```typescript
return json(data, {
  headers: {
    'X-RateLimit-Limit': limit.toString(),           // Max requests per window
    'X-RateLimit-Remaining': remaining.toString(),   // Requests left in window
    'X-RateLimit-Reset': new Date(Date.now() + resetIn).toISOString(), // Window reset time
    'Retry-After': Math.ceil(resetIn / 1000).toString() // Seconds to wait (429 only)
  }
});
```

### On Rate Limit Exceeded (429)
```typescript
if (!rateLimitResult.success) {
  throw error(429, {
    message: 'Rate limit exceeded',
    retryAfter: rateLimitResult.resetIn,
    limit: rateLimitResult.limit,
    window: options.window
  }, {
    headers: {
      'Retry-After': Math.ceil(rateLimitResult.resetIn / 1000).toString(),
      'X-RateLimit-Limit': rateLimitResult.limit.toString(),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': new Date(Date.now() + rateLimitResult.resetIn).toISOString()
    }
  });
}
```

---

## Common Rate Limit Values

### By Operation Type

| Operation | Limit | Window | Algorithm | Reason |
|-----------|-------|--------|-----------|--------|
| **Read (GET)** | 100 req | 60s | Fixed | High throughput, low cost |
| **Write (POST/PUT)** | 10 req | 60s | Fixed | Prevent data pollution |
| **Search** | 20 req | 60s | Sliding | Expensive DB queries |
| **Login Attempt** | 5 req | 300s | Fixed | Brute force protection |
| **Password Reset** | 3 req | 3600s | Fixed | Prevent email spam |
| **File Upload** | 3 uploads | 60s | Token Bucket | Bandwidth/storage limits |
| **AI Generation** | 5 req | 300s | Token Bucket | GPU resource contention |
| **Email Sending** | 10 emails | 3600s | Token Bucket | SMTP rate limits |
| **Webhook Receiver** | 1000 req | 60s | Sliding | Handle bursts |

### By User Type

| User Type | Multiplier | Example (base: 10 req/min) |
|-----------|------------|----------------------------|
| **Anonymous** | 1x | 10 req/min |
| **Authenticated** | 5x | 50 req/min |
| **Premium** | 10x | 100 req/min |
| **Admin** | Bypass | Unlimited |

---

## Failure Modes

| Symptom | Root Cause | Fix | Verification |
|---------|-----------|-----|--------------|
| Rate limit bypassed | Wrong identifier (IP spoofed) | Use `getClientAddress()` from SvelteKit, not `X-Forwarded-For` directly | Check Redis keys: `redis-cli KEYS "rl:*"` |
| 429 but no Retry-After header | Missing header in error response | Add `Retry-After` to error throw options | Check Response Headers in browser Network tab |
| Rate limit too strict | Window too small or limit too low | Increase `max` or `window` based on usage analytics | Monitor Redis `INFO stats` for evicted keys |
| Redis connection failed | Rate limit crashes endpoint | Wrap Redis calls in try-catch, fail open or closed based on policy | Add `redis.ping()` in health check endpoint |
| Old keys not cleaned up | TTL not set or too long | Ensure `pexpire()` called on first request | Check key TTL: `redis-cli TTL rl:...` |
| Different users share limit | Same identifier for all users | Use user ID or IP, not static string | Inspect Redis keys for duplicates |
| Rate limit resets mid-window | Window timestamp calculation wrong | Use `Math.floor(Date.now() / window)` for fixed window | Log window timestamps |
| Burst allowed at boundary | Using fixed window algorithm | Switch to sliding window or token bucket | Test with 20 requests at :59/:01 boundary |
| Rate limit not enforced for POST | Only checking GET requests | Apply rate limit before method handler dispatch | Check endpoint code for all methods |

---

## Reference Implementation

### Complete Rate Limit Function
```typescript
// $lib/server/rate-limit.ts
import { redis } from '$lib/server/redis';

export interface RateLimitOptions {
  max: number;       // Maximum requests
  window: number;    // Time window in milliseconds
  identifier: string; // User ID, IP, or 'global'
  algorithm?: 'fixed' | 'sliding' | 'token-bucket';
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetIn: number;
  algorithm: string;
}

export async function rateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const algorithm = options.algorithm || 'fixed';

  try {
    switch (algorithm) {
      case 'sliding':
        return await slidingWindowRateLimit(key, options);
      case 'token-bucket':
        return await tokenBucketRateLimit(key, {
          capacity: options.max,
          refillRate: options.max / (options.window / 1000),
          identifier: options.identifier
        });
      case 'fixed':
      default:
        return await fixedWindowRateLimit(key, options);
    }
  } catch (error) {
    console.error('Rate limit check failed:', error);

    // Fail open (allow request) for non-critical endpoints
    // Fail closed (deny request) for security-critical endpoints
    return {
      success: true, // Change to false for fail-closed
      limit: options.max,
      remaining: options.max,
      resetIn: options.window,
      algorithm: 'fallback'
    };
  }
}

// Fixed window implementation
async function fixedWindowRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const windowStart = Math.floor(Date.now() / options.window);
  const redisKey = `rl:fixed:${key}:${options.identifier}:${windowStart}`;

  const pipeline = redis.pipeline();
  pipeline.incr(redisKey);
  pipeline.pttl(redisKey);

  const results = await pipeline.exec();
  const current = results?.[0]?.[1] as number;
  let ttl = results?.[1]?.[1] as number;

  if (current === 1) {
    await redis.pexpire(redisKey, options.window);
    ttl = options.window;
  }

  return {
    success: current <= options.max,
    limit: options.max,
    remaining: Math.max(0, options.max - current),
    resetIn: ttl > 0 ? ttl : options.window,
    algorithm: 'fixed-window'
  };
}

// Sliding window implementation (from above)
async function slidingWindowRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  // ... (implementation from "Sliding Window" section)
}

// Token bucket implementation (from above)
async function tokenBucketRateLimit(
  key: string,
  options: { capacity: number; refillRate: number; identifier: string }
): Promise<RateLimitResult> {
  // ... (implementation from "Token Bucket" section)
}
```

### Endpoint Integration
```typescript
// src/routes/api/cases/+server.ts
import { json, error } from '@sveltejs/kit';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  // Auth check
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  // Rate limit (10 req/min for writes)
  const rateLimitResult = await rateLimit(`create_case`, {
    max: 10,
    window: 60000,
    identifier: locals.user.id,
    algorithm: 'fixed'
  });

  if (!rateLimitResult.success) {
    throw error(429, {
      message: 'Rate limit exceeded',
      retryAfter: rateLimitResult.resetIn,
      limit: rateLimitResult.limit,
      window: 60000
    }, {
      headers: {
        'Retry-After': Math.ceil(rateLimitResult.resetIn / 1000).toString(),
        'X-RateLimit-Limit': rateLimitResult.limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(Date.now() + rateLimitResult.resetIn).toISOString()
      }
    });
  }

  // ... endpoint logic

  return json(data, {
    headers: {
      'X-RateLimit-Limit': rateLimitResult.limit.toString(),
      'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
      'X-RateLimit-Reset': new Date(Date.now() + rateLimitResult.resetIn).toISOString()
    }
  });
};
```

---

## Integration Checklist

When adding rate limiting to an endpoint:

- [ ] **1. Choose algorithm:** Fixed (simple), Sliding (accurate), Token Bucket (smooth)
- [ ] **2. Define limits:** Based on operation cost (10/min writes, 100/min reads)
- [ ] **3. Choose identifier:** User ID (auth), IP (anon), combined, or global
- [ ] **4. Set window:** 60s (standard), 300s (login), 3600s (email)
- [ ] **5. Add rate limit call:** Before business logic, after auth check
- [ ] **6. Check success:** `if (!result.success) throw error(429, ...)`
- [ ] **7. Add response headers:** `X-RateLimit-*` on success, `Retry-After` on 429
- [ ] **8. Add bypass rules:** Internal IPs, service tokens, admin users
- [ ] **9. Set TTL:** Match window duration for auto-cleanup
- [ ] **10. Test limits:** Send burst requests to trigger 429
- [ ] **11. Monitor Redis:** Check memory usage, evicted keys
- [ ] **12. Document limits:** Add to API docs, OpenAPI spec

---

## Tests

### Unit Test: Rate Limit Function
```typescript
// tests/unit/rate-limit.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit } from '$lib/server/rate-limit';
import { redis } from '$lib/server/redis';

describe('rateLimit (fixed window)', () => {
  beforeEach(async () => {
    await redis.flushdb();
  });

  it('should allow requests within limit', async () => {
    const result = await rateLimit('test', {
      max: 5,
      window: 60000,
      identifier: '192.168.1.1',
      algorithm: 'fixed'
    });

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should block requests exceeding limit', async () => {
    const options = { max: 2, window: 60000, identifier: '192.168.1.1', algorithm: 'fixed' as const };

    await rateLimit('test', options);
    await rateLimit('test', options);
    const result = await rateLimit('test', options);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should include correct headers info', async () => {
    const result = await rateLimit('test', {
      max: 10,
      window: 60000,
      identifier: 'user_123',
      algorithm: 'fixed'
    });

    expect(result.limit).toBe(10);
    expect(result.resetIn).toBeGreaterThan(0);
    expect(result.algorithm).toBe('fixed-window');
  });
});
```

### Integration Test: Endpoint Rate Limiting
```typescript
// tests/integration/rate-limit.test.ts
import { describe, it, expect } from 'vitest';
import { POST } from '$routes/api/cases/+server';
import { redis } from '$lib/server/redis';

describe('POST /api/cases rate limiting', () => {
  it('should enforce rate limits', async () => {
    await redis.flushdb();

    const user = { id: 'test_user_123', username: 'test', role: 'USER' };
    const validBody = {
      title: 'Rate Limit Test',
      description: 'Testing rate limiting functionality.',
      priority: 'medium'
    };

    // Make 11 requests (limit is 10/min)
    for (let i = 0; i < 11; i++) {
      const response = await POST({
        locals: { user },
        request: new Request('http://localhost/api/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validBody)
        }),
        getClientAddress: () => '192.168.1.1'
      });

      if (i < 10) {
        expect(response.status).toBe(201);
        const headers = Object.fromEntries(response.headers.entries());
        expect(headers['x-ratelimit-remaining']).toBe(String(9 - i));
      } else {
        expect(response.status).toBe(429);
        const body = await response.json();
        expect(body.retryAfter).toBeGreaterThan(0);
        const headers = Object.fromEntries(response.headers.entries());
        expect(headers['retry-after']).toBeDefined();
      }
    }
  });
});
```

---

## Monitoring & Analytics

### Redis Memory Usage
```bash
# Check memory usage
redis-cli INFO memory

# Check rate limit keys
redis-cli KEYS "rl:*" | wc -l

# Check specific key TTL
redis-cli TTL rl:fixed:create_case:user_123:1735052
```

### Rate Limit Analytics
```typescript
// Track rate limit hits for analysis
interface RateLimitLog {
  key: string;
  identifier: string;
  timestamp: number;
  blocked: boolean;
}

async function logRateLimit(log: RateLimitLog) {
  await redis.lpush('rl:analytics', JSON.stringify(log));
  await redis.ltrim('rl:analytics', 0, 10000); // Keep last 10k events
}

// Query analytics
const logs = await redis.lrange('rl:analytics', 0, 100);
const parsed = logs.map(l => JSON.parse(l));
const blockedCount = parsed.filter(l => l.blocked).length;
```

---

## Related Patterns

- **Protected Endpoints Patterns** - Combining auth + rate limiting + validation
- **Redis Caching Strategies** - Using Redis for response caching
- **SvelteKit REST Route Structure** - Implementing rate limits in endpoints
- **Lucia Session Auth Contract** - Rate limiting login attempts

---

**Pattern Status:** ✅ Complete
**Next Review:** After Phase 79 testing
**Maintained By:** Security & Operations Team
