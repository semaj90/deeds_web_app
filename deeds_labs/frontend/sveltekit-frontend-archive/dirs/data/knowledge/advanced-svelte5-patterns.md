# Advanced Svelte 5 Migration Patterns

## TypeScript Language Server Cache Issues

### Problem
When modifying barrel files (`index.ts`) that re-export modules, TypeScript Language Server may cache the old module shape and report false "no exported member" errors even though the code runs correctly at runtime.

### Root Cause
VSCode's TypeScript Language Server caches module exports for performance. When `index.ts` changes, the cache isn't automatically invalidated.

### Solution
```
Ctrl+Shift+P → "TypeScript: Restart TS Server"
```

### Prevention
1. After modifying barrel files, always restart TS Server
2. Avoid circular dependencies between schema and db files
3. Clear `.svelte-kit` cache if issues persist:
```bash
rm -rf .svelte-kit && npm run dev
```

## Database Schema Type Consistency

### Issue
Mixed integer/UUID types for foreign keys cause type mismatches in Drizzle ORM queries.

### Example Problem
```typescript
// schema-postgres.ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey() // UUID type
});

export const reports = pgTable('reports', {
  createdBy: integer('created_by') // ❌ WRONG: integer doesn't match users.id
});
```

### Solution
```typescript
export const reports = pgTable('reports', {
  createdBy: uuid('created_by').references(() => users.id) // ✅ CORRECT: UUID matches
});
```

### API Endpoint Impact
```typescript
// ❌ WRONG: Don't cast UUID to Number
const userId = Number(locals.user.id); // Type error + data loss

// ✅ CORRECT: Use UUID strings directly
const userId = locals.user.id; // string (UUID)
```

## Svelte 5 `<select>` Element Patterns

### Migration Task False Positives
The Svelte migration tool may report `` </select>` attempted to close an element that was not open` errors even when `<select>` tags are properly matched.

### Common Causes
1. **Conditional rendering inside `<select>`**:
```svelte
<!-- ❌ May trigger false positive -->
<select>
  {#if condition}
    <option>A</option>
  {:else}
    <option>B</option>
  {/if}
</select>

<!-- ✅ Better: conditional on entire select -->
{#if condition}
  <select><option>A</option></select>
{:else}
  <select><option>B</option></select>
{/if}
```

2. **Missing whitespace in templates**:
```svelte
<!-- ❌ Parser may misread -->
<select><option value="a">A</option></select>

<!-- ✅ Clearer formatting -->
<select>
  <option value="a">A</option>
  <option value="b">B</option>
</select>
```

### Verification
If migration comments appear but code looks correct:
1. Remove `@migration-task` comments
2. Run `npx svelte-check --threshold error`
3. If no errors reported, migration tool had false positive

## Lucia v3 Authentication Patterns

### Session-Based Auth with UUID
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

  if (session?.fresh) {
    const cookie = lucia.createSessionCookie(session.id);
    event.cookies.set(cookie.name, cookie.value, cookie.attributes);
  }

  if (!session) {
    const cookie = lucia.createBlankSessionCookie();
    event.cookies.set(cookie.name, cookie.value, cookie.attributes);
  }

  event.locals.user = user;
  event.locals.session = session;

  return resolve(event);
};
```

### Protected API Endpoints
```typescript
// src/routes/api/cases/+server.ts
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  // Use locals.user.id (UUID string)
  const cases = await db.select()
    .from(schema.cases)
    .where(eq(schema.cases.createdBy, locals.user.id));

  return json({ cases });
};
```

## Drizzle ORM Best Practices

### Timestamp Handling
```typescript
// ❌ WRONG: JavaScript Date objects
await db.update(schema.cases)
  .set({ updatedAt: new Date() });

// ✅ CORRECT: Database-native NOW()
import { sql } from 'drizzle-orm';

await db.update(schema.cases)
  .set({ updatedAt: sql`NOW()` });
```

### Enum Type Casting
```typescript
// Drizzle schema
export const caseStatusEnum = pgEnum('case_status', ['open', 'in_progress', 'closed']);

// ❌ WRONG: Direct string assignment
const status = 'open';
await db.update(schema.cases).set({ status });

// ✅ CORRECT: Type assertion
const status = 'open' as 'open' | 'in_progress' | 'closed';
await db.update(schema.cases).set({ status });
```

### UUID vs Integer Primary Keys
```typescript
// ✅ CORRECT: UUID for distributed systems
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom()
});

// ✅ CORRECT: Serial for auto-incrementing
export const logs = pgTable('logs', {
  id: serial('id').primaryKey()
});
```

## Phase 79 Cognitive Engine Integration

### Redis Caching
```typescript
// Check Redis before expensive operations
import { redis } from '$lib/server/redis';

const cacheKey = `analysis:${fileHash}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const result = await expensiveAnalysis();
await redis.set(cacheKey, JSON.stringify(result), 'EX', 3600); // 1 hour TTL

return result;
```

### Error Pattern Documentation
```markdown
# Error: Module has no exported member 'db'

**Cause**: TypeScript Language Server cache not updated after barrel file modification

**Fix**: `Ctrl+Shift+P` → "TypeScript: Restart TS Server"

**Prevention**: Always restart TS Server after editing `index.ts` files

**Related Files**:
- `src/lib/server/db/index.ts`
- `src/lib/server/db/schema-postgres.ts`

**Tags**: #typescript #vscode #cache #module-resolution
```

## RAG/KAG Knowledge Base Tags

### Effective Tagging Strategy
```markdown
# Knowledge Base Article Template

## Title

### Problem Description
[Clear description of the issue]

### Root Cause
[Technical explanation]

### Solution
[Step-by-step fix]

### Prevention
[How to avoid in future]

### Related Files
- `path/to/file1.ts`
- `path/to/file2.svelte`

### Tags
#category #technology #issue-type #component #migration
```

### Tag Categories
- **Technology**: `#svelte5`, `#typescript`, `#drizzle`, `#lucia`
- **Issue Type**: `#error`, `#warning`, `#migration`, `#performance`
- **Component**: `#api`, `#auth`, `#database`, `#ui`
- **Resolution**: `#fixed`, `#workaround`, `#wontfix`

## Testing Patterns

### Unit Testing Svelte 5 Components
```typescript
// tests/MyComponent.spec.ts
import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';
import MyComponent from '$lib/components/MyComponent.svelte';

test('increments counter on click', async () => {
  const { getByRole } = render(MyComponent);
  const button = getByRole('button');

  await button.click();

  expect(button).toHaveTextContent('Count: 1');
});
```

### API Endpoint Testing
```typescript
// tests/api/cases.test.ts
import { expect, test } from 'vitest';

test('GET /api/cases requires authentication', async () => {
  const response = await fetch('http://localhost:5175/api/cases');
  expect(response.status).toBe(401);
});

test('POST /api/cases creates new case', async () => {
  const response = await fetch('http://localhost:5175/api/cases', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `auth_session=${validSessionId}`
    },
    body: JSON.stringify({
      title: 'Test Case',
      status: 'open'
    })
  });

  expect(response.ok).toBe(true);
  const data = await response.json();
  expect(data.case.title).toBe('Test Case');
});
```

## Performance Optimization

### Lazy Loading Routes
```typescript
// src/routes/+layout.ts
export const load = async () => {
  // Only load heavy dependencies when needed
  const { initializeWebGPU } = await import('$lib/webgpu/webgpu-init');
  return { initializeWebGPU };
};
```

### Debounced Search
```svelte
<script lang="ts">
  let searchQuery = $state('');
  let debouncedQuery = $state('');

  $effect(() => {
    const timer = setTimeout(() => {
      debouncedQuery = searchQuery;
    }, 300);

    return () => clearTimeout(timer);
  });

  // API call only when user stops typing
  $effect(() => {
    if (debouncedQuery.length > 2) {
      fetch(`/api/search?q=${debouncedQuery}`);
    }
  });
</script>
```

### Memoization with $derived
```typescript
let items = $state<Item[]>([]);
let filter = $state('');

// Only recomputes when items or filter changes
let filteredItems = $derived.by(() => {
  return items.filter(item =>
    item.name.toLowerCase().includes(filter.toLowerCase())
  );
});
```

## Tags
#svelte5 #migration #typescript #drizzle #lucia #rag #kag #performance #testing #best-practices #advanced-patterns
