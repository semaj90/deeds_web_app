# SvelteKit REST Route Structure

## Tags
#sveltekit #api #rest #endpoint #server #requestevent #http #crud

## Symbols
`RequestHandler` `RequestEvent` `json` `error` `redirect` `+server.ts` `GET` `POST` `PUT` `PATCH` `DELETE` `locals` `url` `request` `params` `cookies` `fetch` `platform`

## Route Kind
endpoint

## HTTP Methods
GET POST PUT PATCH DELETE

## Risk Factors
security data-loss perf

---

## Intent

SvelteKit REST routes (`+server.ts` files) provide type-safe HTTP endpoints with automatic type generation, server-side data fetching, and seamless integration with form actions and load functions. They replace traditional Express/Fastify route handlers with a convention-based approach.

**Solves:**
- Type-safe API endpoints with automatic `$types` generation
- Server-only code execution (no client bundle leakage)
- Consistent error handling and status codes
- Direct integration with SvelteKit's routing and authentication

---

## When to Use / When Not

### Use REST Routes When:
- Building JSON APIs for external consumption
- Creating CRUD operations for database resources
- Implementing webhook receivers
- Building internal microservices communication
- Need explicit HTTP method handling (GET, POST, etc.)
- Require custom response headers or status codes

### Do NOT Use When:
- Simple data fetching for page rendering → Use `+page.server.ts` load functions
- Form submissions with progressive enhancement → Use form actions in `+page.server.ts`
- Static data that doesn't change → Use `+page.ts` (runs on client)
- Real-time data streams → Use WebSocket routes or SSE
- File downloads > 100MB → Use presigned URLs (MinIO/S3)

---

## Route Structure

### File Convention
```
src/routes/
  api/
    cases/
      +server.ts          # /api/cases (GET, POST)
      [id]/
        +server.ts        # /api/cases/:id (GET, PUT, DELETE)
    reports/
      +server.ts          # /api/reports (GET, POST)
      [reportId]/
        +server.ts        # /api/reports/:reportId
```

### Basic Structure
```typescript
// src/routes/api/cases/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
  // 1. Extract query params
  const limit = Number(url.searchParams.get('limit')) || 10;
  const offset = Number(url.searchParams.get('offset')) || 0;

  // 2. Fetch data
  const data = await fetchCases({ limit, offset });

  // 3. Set headers
  setHeaders({
    'Cache-Control': 'max-age=60'
  });

  // 4. Return JSON
  return json({ success: true, data, count: data.length });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  // 1. Parse body
  const body = await request.json();

  // 2. Create resource
  const created = await createCase(body);

  // 3. Return 201 Created
  return json({ success: true, data: created }, { status: 201 });
};
```

### Dynamic Parameters
```typescript
// src/routes/api/cases/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const caseId = Number(params.id);

  if (isNaN(caseId)) {
    throw error(400, 'Invalid case ID');
  }

  const caseData = await fetchCaseById(caseId);

  if (!caseData) {
    throw error(404, 'Case not found');
  }

  return json({ success: true, data: caseData });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  // Auth check happens in hooks.server.ts
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  await deleteCase(Number(params.id));

  return json({ success: true }, { status: 204 });
};
```

---

## Security Model

### Authentication (Lucia v3)
```typescript
// hooks.server.ts - Session validation
export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('auth_session');

  if (!sessionId) {
    event.locals.user = null;
    event.locals.session = null;
    return resolve(event);
  }

  const { session, user } = await lucia.validateSession(sessionId);

  if (session && session.fresh) {
    const sessionCookie = lucia.createSessionCookie(session.id);
    event.cookies.set(sessionCookie.name, sessionCookie.value, {
      path: '/',
      ...sessionCookie.attributes
    });
  }

  if (!session) {
    const sessionCookie = lucia.createBlankSessionCookie();
    event.cookies.set(sessionCookie.name, sessionCookie.value, {
      path: '/',
      ...sessionCookie.attributes
    });
  }

  event.locals.session = session;
  event.locals.user = user;

  return resolve(event);
};
```

### Protected Endpoint Pattern
```typescript
// src/routes/api/cases/+server.ts
export const POST: RequestHandler = async ({ locals, request }) => {
  // 1. Check authentication
  if (!locals.user) {
    throw error(401, { message: 'Authentication required' });
  }

  // 2. Check authorization
  if (locals.user.role !== 'ADMIN') {
    throw error(403, { message: 'Insufficient permissions' });
  }

  // 3. Proceed with operation
  const body = await request.json();
  // ...
};
```

### CSRF Protection
**Built-in:** SvelteKit provides CSRF protection for same-origin requests using the `Origin` header.

**Custom CSRF for External Clients:**
```typescript
// src/lib/server/csrf.ts
export function validateCSRF(event: RequestEvent) {
  const token = event.request.headers.get('X-CSRF-Token');
  const storedToken = event.cookies.get('csrf_token');

  if (!token || token !== storedToken) {
    throw error(403, 'CSRF validation failed');
  }
}

// In endpoint
export const POST: RequestHandler = async (event) => {
  validateCSRF(event);
  // ...
};
```

### Security Headers
```typescript
// hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
};
```

---

## Validation (Zod Schemas)

### Input Validation
```typescript
// src/lib/server/schemas/case.ts
import { z } from 'zod';

export const CreateCaseSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  assignedAttorney: z.string().uuid().optional()
});

export const QueryCasesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['active', 'closed', 'archived']).optional()
});

export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;
export type QueryCasesInput = z.infer<typeof QueryCasesSchema>;
```

### Endpoint with Validation
```typescript
// src/routes/api/cases/+server.ts
import { CreateCaseSchema, QueryCasesSchema } from '$lib/server/schemas/case';

export const GET: RequestHandler = async ({ url }) => {
  // Validate query params
  const result = QueryCasesSchema.safeParse({
    limit: url.searchParams.get('limit'),
    offset: url.searchParams.get('offset'),
    status: url.searchParams.get('status')
  });

  if (!result.success) {
    throw error(400, {
      message: 'Invalid query parameters',
      errors: result.error.flatten().fieldErrors
    });
  }

  const { limit, offset, status } = result.data;
  // ... fetch with validated params
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();

  const result = CreateCaseSchema.safeParse(body);

  if (!result.success) {
    throw error(400, {
      message: 'Validation failed',
      errors: result.error.flatten().fieldErrors
    });
  }

  const created = await db.insert(cases).values(result.data).returning();
  return json({ success: true, data: created[0] }, { status: 201 });
};
```

### Error Response Shape (Standardized)
```typescript
// All validation errors return this shape
{
  "message": "Validation failed",
  "errors": {
    "title": ["String must contain at least 3 character(s)"],
    "priority": ["Invalid enum value. Expected 'low' | 'medium' | 'high' | 'critical'"]
  }
}
```

---

## Caching / Rate Limits

### Redis Rate Limiting
```typescript
// src/lib/server/rate-limit.ts
import { redis } from '$lib/server/redis';
import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export async function rateLimit(
  event: RequestEvent,
  key: string,
  limit: number,
  window: number
) {
  const identifier = event.getClientAddress();
  const redisKey = `rl:${key}:${identifier}:${Math.floor(Date.now() / window / 1000)}`;

  const current = await redis.incr(redisKey);

  if (current === 1) {
    await redis.expire(redisKey, window);
  }

  const remaining = Math.max(0, limit - current);
  const resetTime = Math.ceil(Date.now() / 1000 / window) * window;

  event.setHeaders({
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': resetTime.toString()
  });

  if (current > limit) {
    throw error(429, {
      message: 'Rate limit exceeded',
      retryAfter: resetTime - Math.floor(Date.now() / 1000)
    });
  }
}

// Usage in endpoint
export const POST: RequestHandler = async (event) => {
  await rateLimit(event, 'create_case', 10, 60); // 10 requests per minute
  // ...
};
```

### Response Caching (Redis)
```typescript
// src/lib/server/cache.ts
import { redis } from '$lib/server/redis';
import crypto from 'crypto';

export async function cachedFetch<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttl: number = 300
): Promise<T> {
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const data = await fetcher();
  await redis.setex(cacheKey, ttl, JSON.stringify(data));

  return data;
}

// Usage
export const GET: RequestHandler = async ({ url }) => {
  const cacheKey = `cases:list:${crypto.createHash('md5').update(url.search).digest('hex')}`;

  const data = await cachedFetch(cacheKey, async () => {
    return await db.select().from(cases).limit(10);
  }, 60); // 1 minute cache

  return json({ success: true, data });
};
```

### Cache Invalidation on Write
```typescript
export const POST: RequestHandler = async ({ request }) => {
  const created = await db.insert(cases).values(body).returning();

  // Invalidate list caches
  const keys = await redis.keys('cases:list:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  return json({ success: true, data: created[0] }, { status: 201 });
};
```

---

## Failure Modes

### Common Bugs

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| `Cannot read 'user' of undefined` | `locals.user` not set in hooks | Check `hooks.server.ts` session validation |
| `413 Payload Too Large` | Body size exceeds limit | Configure adapter: `bodyParser.sizeLimit` |
| `CORS error from external client` | Missing CORS headers | Add `Access-Control-Allow-Origin` in `handle()` |
| `Double validation errors` | Client + server validation mismatch | Sync Zod schemas with client form validation |
| `Empty request body` | `await request.json()` called twice | Cache parsed body in variable |
| `Type error on `params.id`` | Forgot to parse/validate | Always validate: `Number(params.id)` or Zod |
| `401 on valid session` | Cookie domain mismatch | Check cookie `domain` attribute in Lucia config |
| `Rate limit bypassed` | Using wrong identifier | Use `event.getClientAddress()` not `request.headers.get('x-forwarded-for')` |

### Diagnostic Commands
```bash
# Check endpoint exists
curl -I http://localhost:5173/api/cases

# Test rate limiting
for i in {1..15}; do curl http://localhost:5173/api/cases; done

# Verify CORS headers
curl -H "Origin: http://example.com" -I http://localhost:5173/api/cases

# Check Redis connection
redis-cli PING

# Validate Zod schema
node -e "import('./src/lib/server/schemas/case.js').then(m => console.log(m.CreateCaseSchema.parse({title: 'Test'})))"
```

---

## Reference Implementation

### Complete CRUD Endpoint
```typescript
// src/routes/api/cases/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cases } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';
import { UpdateCaseSchema } from '$lib/server/schemas/case';
import { rateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const caseId = Number(params.id);
  if (isNaN(caseId)) {
    throw error(400, 'Invalid case ID');
  }

  const caseData = await db.select()
    .from(cases)
    .where(eq(cases.id, caseId))
    .limit(1);

  if (caseData.length === 0) {
    throw error(404, 'Case not found');
  }

  setHeaders({ 'Cache-Control': 'private, max-age=60' });

  return json({ success: true, data: caseData[0] });
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  await rateLimit(event, 'update_case', 30, 60);

  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const body = await request.json();
  const result = UpdateCaseSchema.safeParse(body);

  if (!result.success) {
    throw error(400, {
      message: 'Validation failed',
      errors: result.error.flatten().fieldErrors
    });
  }

  const updated = await db.update(cases)
    .set(result.data)
    .where(eq(cases.id, Number(params.id)))
    .returning();

  if (updated.length === 0) {
    throw error(404, 'Case not found');
  }

  // Invalidate cache
  await redis.del(`case:${params.id}`);

  return json({ success: true, data: updated[0] });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user || locals.user.role !== 'ADMIN') {
    throw error(403, 'Insufficient permissions');
  }

  await db.delete(cases).where(eq(cases.id, Number(params.id)));

  return json({ success: true }, { status: 204 });
};
```

---

## Integration Checklist

### 1. Create Endpoint File
```bash
# Create route directory
mkdir -p src/routes/api/resource

# Create +server.ts
touch src/routes/api/resource/+server.ts
```

### 2. Add Type Imports
```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
```

### 3. Implement HTTP Methods
```typescript
export const GET: RequestHandler = async (event) => { /* ... */ };
export const POST: RequestHandler = async (event) => { /* ... */ };
```

### 4. Add Validation
```typescript
import { ResourceSchema } from '$lib/server/schemas/resource';

const result = ResourceSchema.safeParse(body);
if (!result.success) {
  throw error(400, { message: 'Validation failed', errors: result.error.flatten() });
}
```

### 5. Add Auth Check
```typescript
if (!locals.user) {
  throw error(401, 'Unauthorized');
}
```

### 6. Add Rate Limiting
```typescript
await rateLimit(event, 'resource_create', 10, 60);
```

### 7. Add Caching (if GET)
```typescript
setHeaders({ 'Cache-Control': 'private, max-age=60' });
```

### 8. Test Endpoint
```bash
# GET
curl http://localhost:5173/api/resource

# POST
curl -X POST http://localhost:5173/api/resource \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'
```

---

## Tests

### Unit Test (Validation)
```typescript
// tests/unit/schemas/case.test.ts
import { describe, it, expect } from 'vitest';
import { CreateCaseSchema } from '$lib/server/schemas/case';

describe('CreateCaseSchema', () => {
  it('validates correct input', () => {
    const result = CreateCaseSchema.safeParse({
      title: 'Test Case',
      description: 'This is a test case description',
      priority: 'high'
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid priority', () => {
    const result = CreateCaseSchema.safeParse({
      title: 'Test',
      description: 'Description',
      priority: 'invalid'
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['priority']);
  });
});
```

### Integration Test (Endpoint)
```typescript
// tests/integration/api/cases.test.ts
import { describe, it, expect } from 'vitest';

describe('POST /api/cases', () => {
  it('creates case with valid data', async () => {
    const response = await fetch('http://localhost:5173/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Integration Test Case',
        description: 'Created by test suite',
        priority: 'medium'
      })
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBeDefined();
  });

  it('returns 400 for invalid data', async () => {
    const response = await fetch('http://localhost:5173/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x' }) // Too short
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.errors).toBeDefined();
  });
});
```
