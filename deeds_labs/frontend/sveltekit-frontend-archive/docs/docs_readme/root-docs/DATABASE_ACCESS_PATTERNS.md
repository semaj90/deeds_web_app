# Database Access Patterns for SvelteKit

## 🚨 CRITICAL RULE: API-Route Access Only (Never in SSR)

**All database imports MUST happen inside endpoint handlers (`+server.ts`), NOT during `load()` or SSR module load.**

This prevents:
- ❌ Vite module graph pollution
- ❌ Server-side rendering errors
- ❌ Database connection leaks in development
- ❌ Build-time dependency issues
- ❌ Memory bloat from unused connections

---

## ✅ CORRECT PATTERN: Endpoint-Only Database Access

### Structure
```
src/routes/
├── api/
│   └── health/
│       └── db/
│           └── +server.ts    ← Database access HERE ✓
├── page/
│   └── +page.ts             ← No DB here ✗
│   └── +page.server.ts      ← No DB here ✗
└── layout/
    └── +layout.server.ts    ← No DB here ✗
```

### Example 1: Simple Health Check Endpoint

```typescript
// ✅ CORRECT: src/routes/api/health/db/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  try {
    // Database access happens HERE, inside the handler
    const result = await db.select().from(users).limit(1);

    return json({
      success: true,
      connected: true,
      timestamp: new Date().toISOString(),
      recordCount: result.length
    });
  } catch (error) {
    return json({
      success: false,
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};
```

### Example 2: Data Fetch Endpoint (Using Type Definitions)

```typescript
// ✅ CORRECT: src/routes/api/cases/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ListQueryResult, Case } from '$lib/types';
import { db } from '$lib/server/db';
import { cases } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const page = parseInt(url.searchParams.get('page') ?? '1');
    const pageSize = 20;

    // Database access in handler
    const caseData = await db
      .select()
      .from(cases)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const total = await db.select().from(cases);

    const result: ListQueryResult<Case> = {
      success: true,
      data: caseData,
      pagination: {
        page,
        pageSize,
        total: total.length,
        pages: Math.ceil(total.length / pageSize),
        hasMore: page < Math.ceil(total.length / pageSize)
      },
      timestamp: new Date().toISOString()
    };

    return json(result);
  } catch (error) {
    const result: ListQueryResult<Case> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };

    return json(result, { status: 500 });
  }
};
```

### Example 3: POST Endpoint (Create/Insert)

```typescript
// ✅ CORRECT: src/routes/api/cases/create/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { CreateQueryResult, Case } from '$lib/types';
import { db } from '$lib/server/db';
import { cases } from '$lib/server/db/schema';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    // Validate input
    if (!body.title || !body.caseId) {
      return json({
        success: false,
        error: 'Missing required fields: title, caseId'
      } as CreateQueryResult<Case>, { status: 400 });
    }

    // Database access in handler
    const newCase = await db.insert(cases).values({
      id: uuidv4(),
      title: body.title,
      description: body.description,
      createdBy: body.userId,
      status: 'active',
      metadata: body.metadata
    }).returning();

    const result: CreateQueryResult<Case> = {
      success: true,
      data: newCase[0],
      timestamp: new Date().toISOString()
    };

    return json(result, { status: 201 });
  } catch (error) {
    const result: CreateQueryResult<Case> = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };

    return json(result, { status: 500 });
  }
};
```

---

## ❌ WRONG PATTERNS: DON'T DO THIS

### ❌ Pattern 1: Database in Page Load

```typescript
// ❌ WRONG: src/routes/page/+page.server.ts
import { db } from '$lib/server/db';

export async function load() {
  // This runs during SSR and causes problems!
  const users = await db.select().from(usersTable);
  return { users };
}
```

**Why it's wrong:**
- Runs on server-side rendering
- Vite tries to bundle the db import
- Creates connection during build/dev startup
- Can't properly handle async operations in load()

**Fix:** Create an API endpoint instead

```typescript
// ✅ CORRECT: src/routes/api/users/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  const users = await db.select().from(usersTable);
  return json(users);
};

// Then call from component:
// const response = await fetch('/api/users');
// const users = await response.json();
```

### ❌ Pattern 2: Database in Layout Server Load

```typescript
// ❌ WRONG: src/routes/layout/+layout.server.ts
import { db } from '$lib/server/db';

export async function load() {
  // Shared with ALL routes
  const config = await db.select().from(configTable);
  return { config };
}
```

**Why it's wrong:**
- Runs for every page load
- Configuration should be cached or static
- Creates unnecessary DB queries

**Fix:** Cache in API or Redis

```typescript
// ✅ CORRECT: src/routes/api/config/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { redis } from '$lib/server/redis';

export const GET: RequestHandler = async () => {
  // Try cache first
  const cached = await redis.get('app:config');
  if (cached) {
    return json(JSON.parse(cached));
  }

  // Get from DB and cache
  const config = await db.select().from(configTable);
  await redis.set('app:config', JSON.stringify(config), 3600);

  return json(config);
};
```

### ❌ Pattern 3: Database in Shared Server File

```typescript
// ❌ WRONG: src/lib/server/data-loader.ts
import { db } from './db';

// This module initializes DB connection when imported
const caseData = await db.select().from(cases);

export function getCaseData() {
  return caseData;
}
```

**Why it's wrong:**
- Module loads when IMPORTED (at build/startup time)
- Can't handle async in module load
- Data becomes stale

**Fix:** Create service with lazy loading

```typescript
// ✅ CORRECT: src/lib/server/services/case-service.ts
import { db } from '../db';

class CaseService {
  async getCaseData() {
    // Runs when called, not on import
    return await db.select().from(cases);
  }
}

export const caseService = new CaseService();

// Use from endpoint:
// export const GET: RequestHandler = async () => {
//   const data = await caseService.getCaseData();
//   return json(data);
// };
```

---

## 📊 Comparison: Wrong vs. Right

| Task | ❌ WRONG | ✅ CORRECT |
|------|---------|-----------|
| Get cases list | `+page.server.ts` with DB import | `GET /api/cases` endpoint |
| Create new case | `+page.server.ts` form action | `POST /api/cases/create` endpoint |
| Health check | `+layout.server.ts` load() | `GET /api/health/db` endpoint |
| Cache config | Module-level await | `GET /api/config` + Redis |
| User auth | Auth in load() | Auth in `+page.server.ts` or hooks |
| File upload | Form action in page | `POST /api/files/upload` endpoint |

---

## 🏗️ Proper Architecture

### Component (Frontend)
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { ListQueryResult, Case } from '$lib/types';

  let cases: ListQueryResult<Case> | null = null;
  let loading = true;

  onMount(async () => {
    // Fetch from API endpoint only
    const response = await fetch('/api/cases?page=1');
    cases = await response.json();
    loading = false;
  });
</script>

{#if loading}
  <p>Loading...</p>
{:else if cases?.success}
  {#each cases.data as c}
    <div>{c.title}</div>
  {/each}
{/if}
```

### Endpoint Handler
```typescript
// src/routes/api/cases/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ListQueryResult, Case } from '$lib/types';
import { db } from '$lib/server/db';
import { cases } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const page = parseInt(url.searchParams.get('page') ?? '1');

    // Database access ONLY happens here
    const data = await db.select().from(cases).limit(20);

    const result: ListQueryResult<Case> = {
      success: true,
      data,
      timestamp: new Date().toISOString()
    };

    return json(result);
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    } as ListQueryResult<Case>, { status: 500 });
  }
};
```

---

## 🔌 Special Cases

### File Upload with Database

```typescript
// ✅ CORRECT: src/routes/api/files/upload/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { FileUploadResponse } from '$lib/types';
import { db } from '$lib/server/db';
import { evidence } from '$lib/server/db/schema';
import { minioClient } from '$lib/server/storage/minio';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const caseId = formData.get('caseId') as string;

    if (!file || !caseId) {
      return json({
        success: false,
        error: 'Missing file or caseId'
      } as FileUploadResponse, { status: 400 });
    }

    // Upload to MinIO
    const buffer = await file.arrayBuffer();
    const objectName = `${caseId}/${crypto.randomUUID()}/${file.name}`;

    await minioClient.putObject(
      'legal-evidence',
      objectName,
      Buffer.from(buffer),
      buffer.byteLength,
      { 'Content-Type': file.type }
    );

    // Save metadata to database
    const result = await db.insert(evidence).values({
      caseId,
      title: file.name,
      evidenceType: 'document',
      uploadedBy: 'system'
    }).returning();

    return json({
      success: true,
      file: {
        fileId: result[0].id,
        fileName: file.name,
        fileSize: buffer.byteLength,
        uploadPath: objectName
      }
    } as FileUploadResponse);
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    } as FileUploadResponse, { status: 500 });
  }
};
```

### Database Queries with RabbitMQ

```typescript
// ✅ CORRECT: src/routes/api/documents/process/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { documents } from '$lib/server/db/schema';
import { publishToQueue } from '$lib/server/rabbitmq';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    // Save to database
    const doc = await db.insert(documents).values({
      content: body.content,
      userId: body.userId
    }).returning();

    // Queue async job
    await publishToQueue('legal_ai.embedding.document', {
      documentId: doc[0].id,
      content: body.content,
      userId: body.userId
    });

    return json({
      success: true,
      documentId: doc[0].id,
      queued: true
    });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};
```

---

## ✅ Checklist for API Endpoints

- [ ] Database imports are ONLY in `+server.ts` handler functions
- [ ] No database imports in `load()` functions
- [ ] No database imports in layout server files
- [ ] No database imports at module level in shared files
- [ ] All queries wrapped in try-catch
- [ ] All responses typed with type definitions
- [ ] Errors handled and returned as JSON
- [ ] Timestamp included in all responses
- [ ] HTTP status codes are appropriate (200, 201, 400, 500, etc.)
- [ ] Content-Type headers set correctly
- [ ] CORS headers if needed for cross-origin requests

---

## 📚 References

- **Type Definitions**: `src/lib/types/index.ts`
- **Database Types**: `TYPE_DEFINITIONS_GUIDE.md`
- **Database Client**: `src/lib/server/db/client.ts`
- **Database Schema**: `src/lib/server/db/schema.ts`
- **SvelteKit Docs**: https://kit.svelte.dev/docs/routing#server
- **Database Queries**: `src/lib/server/db/queries.ts`

---

## 🚀 Migration Guide: Convert Existing Code

### Step 1: Identify problem code
```bash
grep -r "import.*from.*db" src/routes/ | grep -v "+server.ts"
```

### Step 2: Extract to API endpoint
```typescript
// Before: src/routes/page/+page.server.ts
export async function load() {
  const data = await db.select()...
}

// After: src/routes/api/page-data/+server.ts
export const GET: RequestHandler = async () => {
  const data = await db.select()...
  return json(data);
}
```

### Step 3: Update component to fetch
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  let data;

  onMount(async () => {
    const response = await fetch('/api/page-data');
    data = await response.json();
  });
</script>
```

---

## 💡 Why This Matters

1. **Vite Compatibility**: Vite can't properly tree-shake or bundle database code mixed with frontend code
2. **SSR Safety**: Database connections can't work properly in SSR context
3. **Performance**: Lazy loading means DB connects only when needed
4. **Type Safety**: API responses can be fully typed
5. **Testing**: Endpoints are easier to test independently
6. **Error Handling**: Clear error boundaries between client and server

---

## 🎓 Summary

| Rule | Reason |
|------|--------|
| DB imports ONLY in `+server.ts` handlers | Prevents Vite/SSR issues |
| All responses should be typed | Type safety and documentation |
| Always handle errors in try-catch | Prevent crashes and provide feedback |
| Include timestamp in responses | Debugging and temporal context |
| Use appropriate HTTP status codes | Client knows success/failure |
| Validate input on server | Security and data integrity |
