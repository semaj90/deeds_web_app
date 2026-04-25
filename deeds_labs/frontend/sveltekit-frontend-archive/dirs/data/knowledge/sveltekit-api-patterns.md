# SvelteKit API Design Patterns

## Tags
#sveltekit #api #endpoints #serverside #forms #authentication

## API Route Structure

### Route Naming Conventions

Follow RESTful patterns:

```
src/routes/api/
├── users/
│   ├── +server.ts          # GET /api/users, POST /api/users
│   ├── [id]/
│   │   ├── +server.ts      # GET/PUT/DELETE /api/users/:id
│   │   └── posts/
│   │       └── +server.ts  # GET /api/users/:id/posts
├── auth/
│   ├── login/+server.ts
│   ├── logout/+server.ts
│   └── refresh/+server.ts
└── health/+server.ts
```

### Basic API Endpoint

```typescript
// src/routes/api/users/+server.ts
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/database';

export const GET: RequestHandler = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') ?? '1');
  const limit = parseInt(url.searchParams.get('limit') ?? '10');

  try {
    const users = await db.user.findMany({
      skip: (page - 1) * limit,
      take: limit
    });

    return json({
      success: true,
      data: users,
      pagination: { page, limit }
    });
  } catch (err) {
    throw error(500, 'Failed to fetch users');
  }
};

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();

  try {
    const user = await db.user.create({ data });
    return json({ success: true, data: user }, { status: 201 });
  } catch (err) {
    throw error(400, 'Invalid user data');
  }
};
```

## Authentication Patterns

### Session-Based Auth with Lucia

```typescript
// src/routes/api/auth/login/+server.ts
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { lucia } from '$lib/server/auth';
import { db } from '$lib/server/database';
import { verify } from '@node-rs/argon2';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { email, password } = await request.json();

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    return json({ success: false, error: 'Invalid credentials' }, { status: 401 });
  }

  const validPassword = await verify(user.password_hash, password);
  if (!validPassword) {
    return json({ success: false, error: 'Invalid credentials' }, { status: 401 });
  }

  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);

  cookies.set(sessionCookie.name, sessionCookie.value, {
    path: '/',
    ...sessionCookie.attributes
  });

  return json({
    success: true,
    data: { userId: user.id }
  });
};
```

### Protected API Endpoints

```typescript
// src/routes/api/protected/+server.ts
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  // User is authenticated
  return json({
    success: true,
    data: { message: 'Protected data', userId: locals.user.id }
  });
};
```

### Hook for Session Validation

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { lucia } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get(lucia.sessionCookieName);

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

  event.locals.user = user;
  event.locals.session = session;

  return resolve(event);
};
```

## Error Handling

### Structured Error Responses

```typescript
// src/lib/api/errors.ts
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleApiError(err: unknown) {
  if (err instanceof ApiError) {
    return json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details
        }
      },
      { status: err.statusCode }
    );
  }

  console.error('Unexpected error:', err);
  return json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    },
    { status: 500 }
  );
}
```

### Usage in Endpoints

```typescript
import { ApiError, handleApiError } from '$lib/api/errors';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data = await request.json();

    if (!data.email) {
      throw new ApiError(400, 'MISSING_EMAIL', 'Email is required');
    }

    // ... process request
    return json({ success: true, data: result });
  } catch (err) {
    return handleApiError(err);
  }
};
```

## Request Validation

### Zod Schema Validation

```typescript
// src/lib/schemas/user.ts
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  age: z.number().int().positive().optional()
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

// src/routes/api/users/+server.ts
import { CreateUserSchema } from '$lib/schemas/user';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const result = CreateUserSchema.safeParse(body);

  if (!result.success) {
    return json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: result.error.flatten()
        }
      },
      { status: 400 }
    );
  }

  const user = await db.user.create({ data: result.data });
  return json({ success: true, data: user }, { status: 201 });
};
```

## Rate Limiting

### Redis-Based Rate Limiter

```typescript
// src/lib/server/rate-limit.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function checkRateLimit(
  key: string,
  limit: number,
  window: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowStart = now - window * 1000;

  // Remove old entries
  await redis.zremrangebyscore(key, 0, windowStart);

  // Count current entries
  const count = await redis.zcard(key);

  if (count >= limit) {
    const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const resetAt = parseInt(oldestEntry[1]) + window * 1000;

    return {
      allowed: false,
      remaining: 0,
      resetAt
    };
  }

  // Add new entry
  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, window);

  return {
    allowed: true,
    remaining: limit - count - 1,
    resetAt: now + window * 1000
  };
}
```

### Rate Limit Hook

```typescript
// src/hooks.server.ts
import { checkRateLimit } from '$lib/server/rate-limit';
import { error } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Rate limit API routes
  if (event.url.pathname.startsWith('/api/')) {
    const ip = event.getClientAddress();
    const key = `rate-limit:${ip}`;

    const { allowed, remaining, resetAt } = await checkRateLimit(key, 100, 60); // 100 req/min

    if (!allowed) {
      throw error(429, {
        message: 'Too many requests',
        resetAt
      });
    }

    event.locals.rateLimit = { remaining, resetAt };
  }

  return resolve(event);
};
```

## Caching Strategies

### Redis Cache Wrapper

```typescript
// src/lib/server/cache.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function cached<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);

  if (cached) {
    return JSON.parse(cached) as T;
  }

  const data = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(data));

  return data;
}

export async function invalidateCache(pattern: string) {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

### Usage in Endpoints

```typescript
import { cached, invalidateCache } from '$lib/server/cache';

export const GET: RequestHandler = async ({ params }) => {
  const data = await cached(
    `user:${params.id}`,
    300, // 5 minutes
    () => db.user.findUnique({ where: { id: params.id } })
  );

  return json({ success: true, data });
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const updates = await request.json();
  const user = await db.user.update({
    where: { id: params.id },
    data: updates
  });

  // Invalidate cache
  await invalidateCache(`user:${params.id}`);

  return json({ success: true, data: user });
};
```

## File Upload Handling

### Multipart Form Data

```typescript
// src/routes/api/upload/+server.ts
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { writeFile } from 'fs/promises';
import path from 'path';

export const POST: RequestHandler = async ({ request }) => {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    throw error(400, 'No file uploaded');
  }

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw error(400, 'Invalid file type');
  }

  // Validate file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    throw error(400, 'File too large (max 5MB)');
  }

  // Save file
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const filename = `${Date.now()}-${file.name}`;
  const filepath = path.join('uploads', filename);

  await writeFile(filepath, buffer);

  return json({
    success: true,
    data: {
      filename,
      url: `/uploads/${filename}`,
      size: file.size,
      type: file.type
    }
  });
};
```

## Form Actions

### Server-Side Form Handling

```typescript
// src/routes/admin/users/+page.server.ts
import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/database';

export const load: PageServerLoad = async () => {
  const users = await db.user.findMany();
  return { users };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const name = formData.get('name') as string;

    if (!email || !email.includes('@')) {
      return fail(400, {
        email,
        error: 'Invalid email address'
      });
    }

    try {
      const user = await db.user.create({
        data: { email, name }
      });

      return { success: true, user };
    } catch (err) {
      return fail(500, {
        email,
        error: 'Failed to create user'
      });
    }
  },

  delete: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;

    await db.user.delete({ where: { id } });
    return { success: true };
  }
};
```

## Best Practices Summary

1. **Use consistent REST patterns** for API routes
2. **Validate all inputs** with Zod schemas
3. **Handle errors gracefully** with structured responses
4. **Implement rate limiting** on public endpoints
5. **Cache expensive operations** with Redis
6. **Secure endpoints** with session validation
7. **Use typed request handlers** from `./$types`
8. **Return JSON with status codes** using `json()` helper
9. **Validate file uploads** (type, size, content)
10. **Log errors** and monitor API performance
