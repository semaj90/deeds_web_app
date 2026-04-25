# Quick-Win Optimizations - Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing the 4 quick-win optimizations that will improve performance by 25-33% with minimal effort.

## Quick-Win 1: Response Compression (1 hour)

### Step 1: Update hooks.server.ts

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const requestId = crypto.randomUUID();
  event.locals.requestId = requestId;

  const startTime = Date.now();

  // Session validation code...
  const sessionId = event.cookies.get(lucia.sessionCookieName);
  if (!sessionId) {
    event.locals.user = null;
    event.locals.session = null;
  } else {
    try {
      const { session, user } = await lucia.validateSession(sessionId);
      if (session && session.fresh) {
        const sessionCookie = lucia.createSessionCookie(session.id);
        event.cookies.set(sessionCookie.name, sessionCookie.value, {
          path: '/',
          ...sessionCookie.attributes,
        });
      }
      if (!session) {
        const blankSessionCookie = lucia.createBlankSessionCookie();
        event.cookies.set(blankSessionCookie.name, blankSessionCookie.value, {
          path: '/',
          ...blankSessionCookie.attributes,
        });
      }
      event.locals.session = session;
      event.locals.user = user;
    } catch (error) {
      console.error('[lucia] Session validation error:', error);
      event.locals.user = null;
      event.locals.session = null;
    }
  }

  const response = await resolve(event);

  // ADD: Compression headers
  const acceptEncoding = event.request.headers.get('accept-encoding') || '';
  if (acceptEncoding.includes('gzip')) {
    response.headers.set('Content-Encoding', 'gzip');
  }

  // ADD: Cache headers for API responses
  if (event.url.pathname.startsWith('/api/yorha/')) {
    response.headers.set('Cache-Control', 'public, max-age=300'); // 5 minutes
  }

  // ADD: Cache headers for static assets
  if (event.url.pathname.match(/\.(js|css|woff2)$/)) {
    response.headers.set('Cache-Control', 'public, max-age=31536000'); // 1 year
  }

  const duration = Date.now() - startTime;
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('X-Response-Time', `${duration}ms`);

  if (event.url.pathname.startsWith('/api/ai/')) {
    response.headers.set('Content-Type', 'application/x-ndjson');
    response.headers.set('Cache-Control', 'no-cache');
    response.headers.set('X-Accel-Buffering', 'no');
  }

  return response;
};
```

### Step 2: Enable Gzip in Nginx

```nginx
# nginx.conf
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
gzip_min_length 1000;
gzip_vary on;
gzip_comp_level 6;
```

### Step 3: Test Compression

```bash
# Check if compression is working
curl -H "Accept-Encoding: gzip" -I https://yourdomain.com/api/yorha/cases

# Should see: Content-Encoding: gzip
```

**Expected Improvement:** 25-30% reduction in response size

---

## Quick-Win 2: Caching Layer (2 hours)

### Step 1: Setup Redis Connection

```typescript
// src/lib/server/redis.ts
import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
  },
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('connect', () => console.log('Redis connected'));

await redis.connect();

export default redis;
```

### Step 2: Create Cache Service

```typescript
// src/lib/server/services/cache.service.ts
import redis from '$lib/server/redis';

export const cacheService = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  },

  async set<T>(key: string, value: T, ttl: number = 300): Promise<void> {
    try {
      await redis.setEx(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  },

  async invalidate(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } catch (error) {
      console.error('Cache invalidate error:', error);
    }
  },

  async clear(): Promise<void> {
    try {
      await redis.flushDb();
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  },
};
```

### Step 3: Update API Endpoints

```typescript
// src/routes/api/yorha/cases/+server.ts
import { cacheService } from '$lib/server/services/cache.service';

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    if (!locals.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create cache key
    const cacheKey = `cases:${locals.user.id}:${url.searchParams.toString()}`;

    // Check cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return json(cached);
    }

    // Fetch from database
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');

    const conditions = [];
    if (status) conditions.push(eq(yorhaCases.status, status));
    if (priority) conditions.push(eq(yorhaCases.priority, priority));

    const casesList = await db
      .select()
      .from(yorhaCases)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(yorhaCases.updated_at))
      .limit(limit)
      .offset(offset);

    const result = {
      success: true,
      data: casesList,
      pagination: { limit, offset, total: casesList.length },
    };

    // Cache result for 5 minutes
    await cacheService.set(cacheKey, result, 300);

    return json(result);
  } catch (err) {
    console.error('Error fetching cases:', err);
    return json({ error: 'Failed to fetch cases' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    if (!locals.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.case_number || !body.title) {
      return json(
        { error: 'case_number and title are required' },
        { status: 400 }
      );
    }

    const newCase = await db
      .insert(yorhaCases)
      .values({
        case_number: body.case_number,
        title: body.title,
        description: body.description || null,
        status: body.status || 'active',
        priority: body.priority || 'medium',
        case_type: body.case_type || null,
        jurisdiction: body.jurisdiction || null,
        created_by: locals.user.id,
        assigned_to: body.assigned_to || null,
        metadata: body.metadata || null,
      })
      .returning();

    // Invalidate cache
    await cacheService.invalidate(`cases:${locals.user.id}:*`);

    return json(
      {
        success: true,
        data: newCase[0],
        message: 'Case created successfully',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Error creating case:', err);
    return json({ error: 'Failed to create case' }, { status: 500 });
  }
};
```

### Step 4: Configure Redis in Docker

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: always

volumes:
  redis_data:
```

### Step 5: Test Caching

```bash
# First request (cache miss)
time curl http://localhost:5173/api/yorha/cases

# Second request (cache hit - should be faster)
time curl http://localhost:5173/api/yorha/cases
```

**Expected Improvement:** 60% cache hit rate, 50% faster cached responses

---

## Quick-Win 3: Code Splitting (1.5 hours)

### Step 1: Update svelte.config.js

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from 'svelte-preprocess';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    vite: {
      build: {
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: true,
          },
        },
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-xstate': ['xstate'],
              'vendor-drizzle': ['drizzle-orm'],
              'vendor-ui': ['bits-ui'],
            },
          },
        },
      },
    },
  },
};
```

### Step 2: Lazy Load Heavy Components

```svelte
<!-- src/lib/components/yorha/+layout.svelte -->
<script>
  import { browser } from '$app/environment';
  import { lazy, Suspense } from 'svelte';

  let activeView = 'command-center';

  // Lazy load heavy components
  const EvidenceBoard = browser
    ? lazy(() => import('./EvidenceBoard.svelte'))
    : null;
  const YoRHaCommandCenter = browser
    ? lazy(() => import('./YoRHaCommandCenter.svelte'))
    : null;
</script>

<div class="layout">
  {#if activeView === 'command-center' && YoRHaCommandCenter}
    <Suspense fallback={<div class="loading">Loading dashboard...</div>}>
      <YoRHaCommandCenter />
    </Suspense>
  {:else if activeView === 'evidence' && EvidenceBoard}
    <Suspense fallback={<div class="loading">Loading evidence board...</div>}>
      <EvidenceBoard {caseId} />
    </Suspense>
  {/if}
</div>

<style>
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-size: 1.2rem;
    color: #00d4ff;
  }
</style>
```

### Step 3: Test Code Splitting

```bash
# Build and check bundle
npm run build

# Analyze bundle size
npm run build -- --analyze

# Check chunk sizes
ls -lh .svelte-kit/output/server/chunks/
```

**Expected Improvement:** 20% bundle size reduction

---

## Quick-Win 4: Bundle Size Optimization (1 hour)

### Step 1: Remove Unused Dependencies

```bash
# Audit dependencies
npm audit

# Check for unused packages
npm ls --depth=0

# Remove unused packages
npm uninstall unused-package
```

### Step 2: Optimize Imports

```typescript
// Before: Import entire library
import * as drizzle from 'drizzle-orm';

// After: Import only what you need
import { eq, and, desc } from 'drizzle-orm';
```

### Step 3: Enable Tree-Shaking

```javascript
// package.json
{
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

### Step 4: Minify CSS

```javascript
// svelte.config.js
import { vitePreprocess } from 'svelte-preprocess';

export default {
  preprocess: vitePreprocess({
    postcss: true,
  }),
};
```

**Expected Improvement:** 10-15% additional bundle reduction

---

## Implementation Checklist

### Week 1: Compression & Caching
- [ ] Update hooks.server.ts with compression headers
- [ ] Configure Nginx gzip
- [ ] Setup Redis connection
- [ ] Create cache service
- [ ] Update API endpoints with caching
- [ ] Test compression and caching
- [ ] Deploy to staging

### Week 2: Code Splitting & Optimization
- [ ] Update svelte.config.js
- [ ] Implement lazy loading
- [ ] Audit and remove unused dependencies
- [ ] Optimize imports
- [ ] Enable tree-shaking
- [ ] Minify CSS
- [ ] Test bundle size
- [ ] Deploy to production

---

## Performance Validation

### Before Optimization

```bash
# Baseline metrics
npm run test:performance

# Expected results:
# - Page load: 1.2s
# - API response: 200ms
# - Bundle size: 350KB
# - Cache hit rate: 0%
```

### After Optimization

```bash
# Post-optimization metrics
npm run test:performance

# Expected results:
# - Page load: 0.8s (33% improvement)
# - API response: 150ms (25% improvement)
# - Bundle size: 280KB (20% improvement)
# - Cache hit rate: 60%
```

---

## Troubleshooting

### Redis Connection Issues

```bash
# Check Redis is running
redis-cli ping

# Check connection string
echo $REDIS_URL

# Test connection
redis-cli -u $REDIS_URL ping
```

### Cache Not Working

```typescript
// Debug cache
const result = await cacheService.get('test-key');
console.log('Cache result:', result);

// Clear cache if needed
await cacheService.clear();
```

### Bundle Size Not Reducing

```bash
# Analyze bundle
npm run build -- --analyze

# Check for duplicate dependencies
npm ls

# Update dependencies
npm update
```

---

## Success Metrics

| Metric | Target | Validation |
|--------|--------|-----------|
| Page Load | 0.8s | `npm run test:performance` |
| API Response | 150ms | `curl -w "@curl-format.txt"` |
| Bundle Size | 280KB | `ls -lh .svelte-kit/output` |
| Cache Hit Rate | 60% | Redis monitoring |
| Compression Ratio | 70% | Response headers |

---

**Implementation Guide Created:** November 23, 2025
**Estimated Total Time:** 5.5 hours
**Expected Performance Gain:** 25-33%
