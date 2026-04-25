---
tags: ["redis", "rate-limit", "security", "middleware", "dos-protection"]
symbols: ["redis.incr", "redis.expire", "Retry-After", "X-RateLimit-Remaining", "429"]
route_kind: ["endpoint", "action"]
http_methods: ["ALL"]
risk: ["security", "availability"]
---

# Redis Rate Limiting

## Intent
Protects the application from abuse, brute-force attacks, and denial-of-service by limiting the number of requests a user/IP can make in a time window.

## When to use / when not
Use on all public endpoints, auth routes (login/register), and expensive AI/DB operations. Internal admin routes may have higher limits.

## Route structure
- Implement as a helper function or middleware called at the start of `RequestHandler`.

## Security model
- **Key**: `rl:{ip}:{route}` or `rl:{userId}:{route}`.
- **Fail Open/Closed**: Decide if Redis failure blocks traffic (usually fail open for UX, closed for high security).

## Validation
- Check if count > limit.
- If exceeded, return 429 Too Many Requests.

## Caching/rate-limits
- **Algorithm**: Fixed Window (simplest) or Sliding Window (more accurate).
- **TTL**: Window size (e.g., 60 seconds).

## Failure modes
- Redis downtime blocking all traffic (wrap in try/catch).
- IP spoofing (use `Client-IP` or `X-Forwarded-For` carefully).

## Reference implementation
```typescript
import { redis } from '$lib/server/redis';
import { error } from '@sveltejs/kit';

const WINDOW = 60; // seconds
const LIMIT = 100; // requests

export async function rateLimit(ip: string, route: string) {
  const key = `rl:${ip}:${route}`;

  try {
    const requests = await redis.incr(key);
    if (requests === 1) {
      await redis.expire(key, WINDOW);
    }

    const remaining = Math.max(0, LIMIT - requests);

    if (requests > LIMIT) {
      return {
        limited: true,
        headers: { 'Retry-After': String(WINDOW) }
      };
    }

    return {
      limited: false,
      headers: { 'X-RateLimit-Remaining': String(remaining) }
    };
  } catch (e) {
    console.error('Redis rate limit error', e);
    return { limited: false, headers: {} }; // Fail open
  }
}
```

## Integration checklist
1. Import `rateLimit` helper.
2. Call with `getClientAddress()` and route ID.
3. Check `.limited` property.
4. If true, throw `error(429)`.
5. Append headers to response.

## Tests
- Test under limit -> 200.
- Test over limit -> 429.
- Test expiry -> 200 after window.
