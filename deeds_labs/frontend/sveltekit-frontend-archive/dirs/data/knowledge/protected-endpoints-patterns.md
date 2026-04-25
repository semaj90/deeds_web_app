# Protected Endpoints: Complete Security Stack Pattern

**Category:** API Security
**Tags:** #sveltekit #api #security #auth #lucia #rate-limit #endpoint #csrf #protected
**Symbols:** `RequestHandler` `RequestEvent` `lucia` `validateSession` `event.locals.user` `rateLimit` `redis` `error` `json` `+server.ts`
**Route Kind:** `endpoint`
**HTTP Methods:** `GET POST PUT PATCH DELETE`
**Risk:** `security data-loss perf`
**Last Updated:** 2025-12-24

---

## Intent

Comprehensive pattern for securing SvelteKit API endpoints with layered defense: **session authentication** (Lucia v3), **rate limiting** (Redis), **CSRF protection**, and **Zod validation**. This is the canonical "protected endpoint" implementation combining all security primitives into a single, copy-paste reference.

**One-Sentence Summary:**
Enforce authentication → Check rate limits → Validate input → Execute business logic → Return typed response.

---

## When to Use

✅ **Use this pattern when:**
- Endpoint modifies data (POST/PUT/PATCH/DELETE)
- Endpoint returns user-specific data (my cases, my profile)
- Endpoint performs privileged operations (admin actions, role-gated features)
- Endpoint has abuse potential (search, file upload, AI generation)

❌ **Don't use when:**
- Public read-only endpoints (e.g., `/api/public/stats`)
- Webhook receivers (use API key auth instead)
- Server-to-server communication (use service tokens)
- Static data that never changes (cache at CDN instead)

---

## Complete Protected Endpoint Structure

### File Convention
```
src/routes/api/
├── cases/
│   └── +server.ts           # Protected CRUD for cases
├── reports/
│   ├── +server.ts           # Protected reports list
│   └── [id]/
│       └── +server.ts       # Protected single report operations
└── admin/
    └── users/
        └── +server.ts       # Role-gated admin endpoint
```

### Minimal Structure (Layered Security)
```typescript
// src/routes/api/cases/+server.ts
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { rateLimit } from '$lib/server/rate-limit';
import { CreateCaseSchema } from '$lib/schemas';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  // LAYER 1: Session Authentication (Lucia v3)
  if (!locals.user) {
    throw error(401, { message: 'Unauthorized - valid session required' });
  }

  // LAYER 2: Rate Limiting (Redis)
  const rateLimitKey = `create_case:${locals.user.id}`;
  const rateLimitResult = await rateLimit(rateLimitKey, {
    max: 10,        // 10 requests
    window: 60000,  // per 60 seconds
    identifier: getClientAddress()
  });

  if (!rateLimitResult.success) {
    throw error(429, {
      message: 'Rate limit exceeded',
      retryAfter: rateLimitResult.resetIn
    });
  }

  // LAYER 3: Input Validation (Zod)
  const body = await request.json();
  const validation = CreateCaseSchema.safeParse(body);

  if (!validation.success) {
    throw error(400, {
      message: 'Validation failed',
      errors: validation.error.flatten().fieldErrors
    });
  }

  // LAYER 4: Business Logic
  const newCase = await db.insert(cases).values({
    ...validation.data,
    assignedAttorney: locals.user.id,
    createdAt: new Date()
  }).returning();

  // LAYER 5: Response
  return json({
    success: true,
    data: newCase[0]
  }, {
    status: 201,
    headers: {
      'X-RateLimit-Limit': rateLimitResult.limit.toString(),
      'X-RateLimit-Remaining': rateLimitResult.remaining.toString()
    }
  });
};
```

---

## Security Model

### 1. Session Authentication (Lucia v3)

**Cookie Contract:**
- Cookie name: `auth_session`
- Attributes: `httpOnly: true`, `secure: true` (production), `sameSite: 'lax'`
- Expiry: 30 days, auto-refresh if <15 days remaining

**Session Validation:**
```typescript
// Runs in hooks.server.ts for every request
const sessionId = event.cookies.get('auth_session');
if (sessionId) {
  const { session, user } = await lucia.validateSession(sessionId);
  if (session && session.fresh) {
    event.cookies.set('auth_session', lucia.createSessionCookie(session.id), { path: '/' });
  }
  event.locals.user = user;    // Available in all endpoints
  event.locals.session = session;
}
```

**Endpoint Auth Check:**
```typescript
// Always first line of protected endpoints
if (!locals.user) {
  throw error(401, { message: 'Unauthorized - valid session required' });
}
```

**Role-Based Access:**
```typescript
// For admin-only endpoints
if (!locals.user) {
  throw error(401, { message: 'Unauthorized' });
}

if (locals.user.role !== 'ADMIN') {
  throw error(403, {
    message: 'Forbidden - admin role required',
    required: 'ADMIN',
    current: locals.user.role
  });
}
```

### 2. CSRF Protection

**Built-In Protection (SvelteKit):**
- SvelteKit validates `Origin` header for all mutating requests (POST/PUT/PATCH/DELETE)
- If `Origin` doesn't match host, request is rejected automatically
- No additional code needed for same-origin requests

**Custom CSRF for External Clients:**
```typescript
// For API clients (mobile apps, external services)
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  // Check custom CSRF token header
  const csrfToken = request.headers.get('X-CSRF-Token');
  if (!csrfToken || csrfToken !== locals.session.csrfToken) {
    throw error(403, { message: 'Invalid CSRF token' });
  }

  // ... rest of endpoint logic
};
```

### 3. Rate Limiting (Redis)

**Rate Limit Function:**
```typescript
// $lib/server/rate-limit.ts
import { redis } from '$lib/server/redis';

interface RateLimitOptions {
  max: number;       // Maximum requests
  window: number;    // Time window in milliseconds
  identifier: string; // IP address or user ID
}

export async function rateLimit(key: string, options: RateLimitOptions) {
  const redisKey = `rl:${key}:${options.identifier}:${Math.floor(Date.now() / options.window)}`;

  const current = await redis.incr(redisKey);

  if (current === 1) {
    // First request in this window - set expiry
    await redis.pexpire(redisKey, options.window);
  }

  const ttl = await redis.pttl(redisKey);

  return {
    success: current <= options.max,
    limit: options.max,
    remaining: Math.max(0, options.max - current),
    resetIn: ttl > 0 ? ttl : options.window
  };
}
```

**Key Format:**
- Pattern: `rl:{operation}:{identifier}:{window_timestamp}`
- Examples:
  - `rl:create_case:user_123:1735052400000`
  - `rl:upload_file:192.168.1.1:1735052400000`
  - `rl:search:user_456:1735052400000`

**Common Limits:**
```typescript
// Read operations
const readLimit = { max: 100, window: 60000 };  // 100 req/min

// Write operations
const writeLimit = { max: 10, window: 60000 };  // 10 req/min

// Expensive operations
const aiLimit = { max: 5, window: 300000 };     // 5 req/5min

// File uploads
const uploadLimit = { max: 3, window: 60000 };  // 3 uploads/min
```

**Response Headers:**
```typescript
return json(data, {
  headers: {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': new Date(Date.now() + resetIn).toISOString(),
    'Retry-After': Math.ceil(resetIn / 1000).toString() // seconds
  }
});
```

### 4. Input Validation (Zod)

**Schema Definition:**
```typescript
// $lib/schemas/case.ts
import { z } from 'zod';

export const CreateCaseSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  tags: z.array(z.string()).max(10).optional()
});

export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;
```

**Validation in Endpoint:**
```typescript
const body = await request.json();
const validation = CreateCaseSchema.safeParse(body);

if (!validation.success) {
  throw error(400, {
    message: 'Validation failed',
    errors: validation.error.flatten().fieldErrors
  });
}

// Type-safe validated data
const { title, description, priority, tags } = validation.data;
```

**Standardized Error Shape:**
```json
{
  "message": "Validation failed",
  "errors": {
    "title": ["String must contain at least 3 character(s)"],
    "priority": ["Invalid enum value. Expected 'low' | 'medium' | 'high' | 'critical'"]
  }
}
```

---

## Caching Strategy

### When to Cache Protected Endpoints

❌ **Never cache:**
- User-specific data that changes frequently (dashboard stats, notifications)
- Real-time data (live chat, active cases)
- Endpoints with side effects (POST/PUT/PATCH/DELETE)

✅ **Can cache:**
- User profile (changes rarely)
- Dropdown options (roles, statuses, categories)
- Reference data (legal codes, jurisdictions)

### Cache-Control Headers
```typescript
// For cacheable protected endpoints
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const profile = await getProfile(locals.user.id);

  return json(profile, {
    headers: {
      'Cache-Control': 'private, max-age=300',  // 5 minutes, user-specific
      'Vary': 'Cookie'                          // Cache per session
    }
  });
};
```

### Redis Response Caching
```typescript
import { redis } from '$lib/server/redis';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  // Cache key includes user ID for privacy
  const cacheKey = `cache:user:${locals.user.id}:cases:${url.searchParams.toString()}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return json(JSON.parse(cached), {
      headers: { 'X-Cache': 'HIT' }
    });
  }

  const cases = await db.query.cases.findMany({
    where: eq(schema.assignedAttorney, locals.user.id)
  });

  await redis.setex(cacheKey, 300, JSON.stringify(cases)); // 5 min TTL

  return json(cases, {
    headers: { 'X-Cache': 'MISS' }
  });
};
```

**Invalidation on Write:**
```typescript
export const POST: RequestHandler = async ({ locals, request }) => {
  // ... auth, rate limit, validation ...

  const newCase = await db.insert(cases).values(data).returning();

  // Invalidate user's case list cache
  const cachePattern = `cache:user:${locals.user.id}:cases:*`;
  const keys = await redis.keys(cachePattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  return json({ success: true, data: newCase[0] }, { status: 201 });
};
```

---

## Failure Modes

| Symptom | Root Cause | Fix | Verification |
|---------|-----------|-----|--------------|
| `TypeError: Cannot read 'user' of undefined` | `locals.user` not set in hooks | Check `hooks.server.ts` validates sessions and sets `event.locals.user` | Add `console.log(event.locals)` in hooks |
| 401 on valid session | Cookie not sent by client | Check `credentials: 'include'` in fetch, CORS `Access-Control-Allow-Credentials: true` | Inspect Network tab → Request Headers → Cookie |
| Rate limit bypassed | Wrong identifier used | Use `getClientAddress()` not `request.headers.get('x-forwarded-for')` | Check Redis keys: `redis-cli KEYS "rl:*"` |
| 429 but no Retry-After header | Missing headers in error response | Add headers to error: `throw error(429, { message, retryAfter })` | Check Response Headers in Network tab |
| Validation passes invalid data | Schema doesn't match requirements | Update Zod schema with `.refine()` or `.transform()` | Write unit test for schema |
| CSRF token mismatch | Token not stored in session | Store token in `locals.session.csrfToken` during login | Check session table for csrfToken column |
| Redis connection failed | Rate limit crashes endpoint | Wrap Redis calls in try-catch, fallback to allow request | Add `redis.ping()` health check |
| Role check fails for admin | `user.role` column missing | Add `role` to user table, default to 'USER' | Run migration: `ALTER TABLE user ADD COLUMN role TEXT DEFAULT 'USER'` |
| Double submission creates duplicates | No idempotency key | Add `idempotencyKey` to request, check Redis before insert | Store key in Redis with 24h TTL |
| 413 Payload Too Large | Body size exceeds default limit | Set `bodyParser.sizeLimit` in `svelte.config.js` adapter options | Test with large JSON payload |
| Cache returns stale data after update | Invalidation pattern wrong | Ensure cache key matches exactly, use wildcards carefully | Check Redis TTL: `redis-cli TTL cache:user:123:cases` |
| Endpoint slow with many users | N+1 queries in data fetching | Use `db.query` with `with` relations instead of loops | Add `console.time()` around DB calls |

---

## Reference Implementation

### Complete Protected CRUD Endpoint

```typescript
// src/routes/api/cases/+server.ts
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cases } from '$lib/server/db/schema-postgres';
import { rateLimit } from '$lib/server/rate-limit';
import { redis } from '$lib/server/redis';
import { CreateCaseSchema, UpdateCaseSchema, QueryCasesSchema } from '$lib/schemas';
import { eq, and, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// ========== GET: List cases (protected, cached) ==========
export const GET: RequestHandler = async ({ locals, url, getClientAddress }) => {
  // Auth check
  if (!locals.user) {
    throw error(401, { message: 'Unauthorized' });
  }

  // Rate limit (100 req/min for reads)
  const rateLimitResult = await rateLimit(`list_cases:${locals.user.id}`, {
    max: 100,
    window: 60000,
    identifier: getClientAddress()
  });

  if (!rateLimitResult.success) {
    throw error(429, {
      message: 'Rate limit exceeded',
      retryAfter: rateLimitResult.resetIn
    });
  }

  // Validate query params
  const queryValidation = QueryCasesSchema.safeParse({
    limit: url.searchParams.get('limit'),
    offset: url.searchParams.get('offset'),
    status: url.searchParams.get('status')
  });

  if (!queryValidation.success) {
    throw error(400, {
      message: 'Invalid query parameters',
      errors: queryValidation.error.flatten().fieldErrors
    });
  }

  const { limit, offset, status } = queryValidation.data;

  // Check cache
  const cacheKey = `cache:user:${locals.user.id}:cases:${status || 'all'}:${limit}:${offset}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return json(JSON.parse(cached), {
      headers: {
        'X-Cache': 'HIT',
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString()
      }
    });
  }

  // Fetch data
  const userCases = await db.select()
    .from(cases)
    .where(
      and(
        eq(cases.assignedAttorney, locals.user.id),
        status ? eq(cases.status, status) : undefined
      )
    )
    .orderBy(desc(cases.updatedAt))
    .limit(limit)
    .offset(offset);

  const response = {
    success: true,
    data: userCases,
    count: userCases.length,
    limit,
    offset
  };

  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(response));

  return json(response, {
    headers: {
      'X-Cache': 'MISS',
      'X-RateLimit-Limit': rateLimitResult.limit.toString(),
      'X-RateLimit-Remaining': rateLimitResult.remaining.toString()
    }
  });
};

// ========== POST: Create case (protected, rate limited) ==========
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
  // Auth check
  if (!locals.user) {
    throw error(401, { message: 'Unauthorized' });
  }

  // Rate limit (10 req/min for writes)
  const rateLimitResult = await rateLimit(`create_case:${locals.user.id}`, {
    max: 10,
    window: 60000,
    identifier: getClientAddress()
  });

  if (!rateLimitResult.success) {
    throw error(429, {
      message: 'Rate limit exceeded',
      retryAfter: rateLimitResult.resetIn
    });
  }

  // Validate input
  const body = await request.json();
  const validation = CreateCaseSchema.safeParse(body);

  if (!validation.success) {
    throw error(400, {
      message: 'Validation failed',
      errors: validation.error.flatten().fieldErrors
    });
  }

  // Business logic
  const newCase = await db.insert(cases).values({
    ...validation.data,
    assignedAttorney: locals.user.id,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();

  // Invalidate cache
  const cachePattern = `cache:user:${locals.user.id}:cases:*`;
  const keys = await redis.keys(cachePattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  return json({
    success: true,
    data: newCase[0]
  }, {
    status: 201,
    headers: {
      'X-RateLimit-Remaining': rateLimitResult.remaining.toString()
    }
  });
};

// ========== PUT: Update case (protected, role-gated) ==========
export const PUT: RequestHandler = async ({ locals, request, getClientAddress }) => {
  // Auth check
  if (!locals.user) {
    throw error(401, { message: 'Unauthorized' });
  }

  // Rate limit
  const rateLimitResult = await rateLimit(`update_case:${locals.user.id}`, {
    max: 20,
    window: 60000,
    identifier: getClientAddress()
  });

  if (!rateLimitResult.success) {
    throw error(429, {
      message: 'Rate limit exceeded',
      retryAfter: rateLimitResult.resetIn
    });
  }

  // Validate input
  const body = await request.json();
  const validation = UpdateCaseSchema.safeParse(body);

  if (!validation.success) {
    throw error(400, {
      message: 'Validation failed',
      errors: validation.error.flatten().fieldErrors
    });
  }

  const { id, ...updates } = validation.data;

  // Check ownership (only update own cases unless admin)
  const existingCase = await db.query.cases.findFirst({
    where: eq(cases.id, id)
  });

  if (!existingCase) {
    throw error(404, { message: 'Case not found' });
  }

  if (existingCase.assignedAttorney !== locals.user.id && locals.user.role !== 'ADMIN') {
    throw error(403, {
      message: 'Forbidden - can only update own cases',
      required: 'ADMIN',
      current: locals.user.role
    });
  }

  // Update
  const updated = await db.update(cases)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(cases.id, id))
    .returning();

  // Invalidate cache
  const cachePattern = `cache:user:${existingCase.assignedAttorney}:cases:*`;
  const keys = await redis.keys(cachePattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  return json({
    success: true,
    data: updated[0]
  });
};

// ========== DELETE: Remove case (admin only) ==========
export const DELETE: RequestHandler = async ({ locals, url }) => {
  // Auth check
  if (!locals.user) {
    throw error(401, { message: 'Unauthorized' });
  }

  // Role check (admin only)
  if (locals.user.role !== 'ADMIN') {
    throw error(403, {
      message: 'Forbidden - admin role required',
      required: 'ADMIN',
      current: locals.user.role
    });
  }

  const id = Number(url.searchParams.get('id'));
  if (!id) {
    throw error(400, { message: 'Case ID required' });
  }

  // Delete
  const deleted = await db.delete(cases)
    .where(eq(cases.id, id))
    .returning();

  if (deleted.length === 0) {
    throw error(404, { message: 'Case not found' });
  }

  // Invalidate all user caches (don't know who had access)
  const allCacheKeys = await redis.keys('cache:user:*:cases:*');
  if (allCacheKeys.length > 0) {
    await redis.del(...allCacheKeys);
  }

  return json({
    success: true,
    message: 'Case deleted',
    data: deleted[0]
  });
};
```

---

## Integration Checklist

When implementing a new protected endpoint:

- [ ] **1. Create file:** `src/routes/api/{resource}/+server.ts`
- [ ] **2. Add auth check:** `if (!locals.user) throw error(401, 'Unauthorized')`
- [ ] **3. Add rate limiting:** Call `rateLimit()` with appropriate limits
- [ ] **4. Add validation:** Create Zod schema in `$lib/schemas/`, use `safeParse()`
- [ ] **5. Add role check (if needed):** `if (locals.user.role !== 'ADMIN') throw error(403, ...)`
- [ ] **6. Add caching (if read endpoint):** Redis cache with user-specific keys
- [ ] **7. Add cache invalidation (if write endpoint):** Delete cache keys on POST/PUT/DELETE
- [ ] **8. Add response headers:** `X-RateLimit-*`, `X-Cache`, `Cache-Control`
- [ ] **9. Add error handling:** Try-catch for Redis/DB failures, return proper error shapes
- [ ] **10. Test authentication:** curl without cookie → 401
- [ ] **11. Test rate limiting:** Exceed limits → 429 with `Retry-After`
- [ ] **12. Test validation:** Send invalid data → 400 with `errors` object
- [ ] **13. Test authorization:** Non-admin tries admin endpoint → 403
- [ ] **14. Test caching:** Check `X-Cache` header, verify Redis keys
- [ ] **15. Document in route map:** Add to `data/route-map.json` when generator runs

---

## Tests

### Unit Test: Rate Limit Function
```typescript
// tests/unit/rate-limit.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit } from '$lib/server/rate-limit';
import { redis } from '$lib/server/redis';

describe('rateLimit', () => {
  beforeEach(async () => {
    await redis.flushdb(); // Clear Redis before each test
  });

  it('should allow requests within limit', async () => {
    const result = await rateLimit('test', {
      max: 5,
      window: 60000,
      identifier: '192.168.1.1'
    });

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should block requests exceeding limit', async () => {
    const options = { max: 2, window: 60000, identifier: '192.168.1.1' };

    await rateLimit('test', options); // 1st request
    await rateLimit('test', options); // 2nd request
    const result = await rateLimit('test', options); // 3rd request

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should reset after window expires', async () => {
    const options = { max: 1, window: 100, identifier: '192.168.1.1' };

    await rateLimit('test', options); // Exhausts limit
    await new Promise(resolve => setTimeout(resolve, 150)); // Wait for window
    const result = await rateLimit('test', options);

    expect(result.success).toBe(true);
  });
});
```

### Integration Test: Protected Endpoint
```typescript
// tests/integration/protected-endpoint.test.ts
import { describe, it, expect } from 'vitest';
import { POST } from '$routes/api/cases/+server';
import { lucia } from '$lib/server/auth';

describe('POST /api/cases', () => {
  it('should reject unauthenticated requests', async () => {
    const response = await POST({
      locals: { user: null },
      request: new Request('http://localhost/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' })
      })
    });

    expect(response.status).toBe(401);
  });

  it('should reject invalid input', async () => {
    const user = { id: '123', username: 'test', role: 'USER' };
    const response = await POST({
      locals: { user },
      request: new Request('http://localhost/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'AB' }) // Too short
      }),
      getClientAddress: () => '192.168.1.1'
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors.title).toBeDefined();
  });

  it('should create case with valid auth and input', async () => {
    const user = { id: '123', username: 'test', role: 'USER' };
    const response = await POST({
      locals: { user },
      request: new Request('http://localhost/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Valid Case Title',
          description: 'This is a valid description with enough characters.',
          priority: 'high'
        })
      }),
      getClientAddress: () => '192.168.1.1'
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Valid Case Title');
  });

  it('should enforce rate limits', async () => {
    const user = { id: '123', username: 'test', role: 'USER' };
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
      } else {
        expect(response.status).toBe(429);
        const body = await response.json();
        expect(body.retryAfter).toBeGreaterThan(0);
      }
    }
  });
});
```

---

## Security Checklist

Before deploying protected endpoints:

- [ ] ✅ Session cookies use `httpOnly: true` (prevents XSS access)
- [ ] ✅ Session cookies use `secure: true` in production (HTTPS only)
- [ ] ✅ Session cookies use `sameSite: 'lax'` (CSRF mitigation)
- [ ] ✅ Session validation runs in `hooks.server.ts` for every request
- [ ] ✅ `event.locals.user` is populated with user data after validation
- [ ] ✅ Rate limiting uses Redis (not in-memory - fails in multi-instance)
- [ ] ✅ Rate limit keys include user ID or IP (prevent cross-contamination)
- [ ] ✅ Rate limit responses include `Retry-After` header (client backoff)
- [ ] ✅ Zod schemas validate all input (no raw `request.json()` usage)
- [ ] ✅ Error responses don't leak sensitive data (no stack traces in production)
- [ ] ✅ Role checks happen after auth check (fail fast on 401 before 403)
- [ ] ✅ Cache keys include user ID (prevent cross-user cache poisoning)
- [ ] ✅ Write endpoints invalidate related cache keys
- [ ] ✅ CORS configured correctly (credentials: 'include', specific origins not '*')
- [ ] ✅ Database queries use parameterized statements (Drizzle prevents SQL injection)

---

## Troubleshooting

### Issue: locals.user is always null
**Symptoms:** All protected endpoints return 401
**Root Cause:** Session validation not running in hooks
**Fix:** Check `src/hooks.server.ts` has:
```typescript
export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('auth_session');
  if (sessionId) {
    const { session, user } = await lucia.validateSession(sessionId);
    event.locals.user = user;
    event.locals.session = session;
  }
  return resolve(event);
};
```

### Issue: Rate limit not enforced
**Symptoms:** Can exceed limits without 429 errors
**Root Cause:** Redis connection failed, rate limit function silently failing
**Fix:** Add error handling:
```typescript
try {
  const result = await rateLimit(key, options);
  if (!result.success) throw error(429, ...);
} catch (err) {
  console.error('Rate limit check failed:', err);
  // Fail open (allow request) or fail closed (deny request) based on policy
  throw error(503, 'Service temporarily unavailable');
}
```

### Issue: Cache returns stale data after update
**Symptoms:** GET returns old data even after POST/PUT
**Root Cause:** Cache invalidation pattern doesn't match cache key
**Fix:** Ensure cache keys use exact same format:
```typescript
// Cache key format
const cacheKey = `cache:user:${userId}:cases:${status}`;

// Invalidation pattern must match
const pattern = `cache:user:${userId}:cases:*`;
```

### Issue: 403 Forbidden on valid admin user
**Symptoms:** Admin user gets 403 on admin endpoints
**Root Cause:** `user.role` is null or not fetched from database
**Fix:** Update session validation to include role:
```typescript
const user = await db.query.user.findFirst({
  where: eq(schema.id, session.userId),
  columns: { id: true, username: true, email: true, role: true }
});
```

### Issue: CORS errors on authenticated requests
**Symptoms:** Browser blocks requests with "credentials include" error
**Root Cause:** CORS headers don't allow credentials
**Fix:** Add to `hooks.server.ts`:
```typescript
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Origin', event.request.headers.get('origin') || '');

  return response;
};
```

---

## Performance Optimization

### 1. Parallel Checks
```typescript
// ❌ Sequential (slow)
const user = await checkAuth(locals);
const rateLimit = await checkRateLimit(user.id);
const validation = await validateInput(body);

// ✅ Parallel (fast)
const [user, rateLimitResult, validation] = await Promise.all([
  checkAuth(locals),
  checkRateLimit(locals.user?.id),
  validateInput(body)
]);
```

### 2. Redis Pipelining
```typescript
// ❌ Multiple round trips
const current = await redis.incr(key);
const ttl = await redis.pttl(key);
if (current === 1) await redis.pexpire(key, window);

// ✅ Single pipeline
const pipeline = redis.pipeline();
pipeline.incr(key);
pipeline.pttl(key);
pipeline.pexpire(key, window);
const results = await pipeline.exec();
```

### 3. Database Connection Pooling
```typescript
// drizzle.config.ts
export default {
  pool: {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000
  }
};
```

---

## Related Patterns

- **SvelteKit REST Route Structure** - File conventions, HTTP methods, RequestHandler types
- **Lucia Session Auth Contract** - Session lifecycle, cookie configuration, hooks setup
- **Zod Validation Contracts** - Schema design, error shapes, type inference
- **Redis Rate Limiting** - Algorithms, key formats, bypass rules, headers
- **Redis Caching Strategies** - Key formats, TTL tiers, invalidation, dogpile prevention

---

**Pattern Status:** ✅ Complete
**Next Review:** After Phase 79 testing
**Maintained By:** API Security Team
