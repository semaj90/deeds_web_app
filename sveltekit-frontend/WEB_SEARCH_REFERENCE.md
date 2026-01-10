# Svelte 5 + XState v5 Migration - Web Search Reference

**For**: Claude, Gemini, GitHub Copilot context
**Purpose**: Quick reference for AI assistants helping with Svelte 5 migration
**Date**: January 9, 2026

---

## 🎯 Project Context

**Stack**:
- **Frontend**: Svelte 5 (runes mode), SvelteKit, bits-ui v2.14.4
- **State Management**: XState v5.24.0
- **Backend**: Go microservices (HTTP/3 QUIC), RabbitMQ, Redis, Qdrant, PostgreSQL
- **AI**: Ollama (gemma3-legal), Gemini 2.0, Claude Sonnet

**Migration Status** (Jan 9, 2026):
- ✅ XState v4 → v5: Complete (43 files fixed, destructuring typos resolved)
- ⚠️ Svelte 4 → 5: In progress (218 → 215 errors)
- 🔧 Service API wiring: Needs manual audit

---

## 🔑 Key Patterns

### 1. Svelte 5 Runes (NOT $: reactive statements)

**❌ Svelte 4 (OLD)**:
```svelte
<script>
  export let count = 0;
  $: doubled = count * 2;

  function increment() {
    count += 1;
  }
</script>
```

**✅ Svelte 5 (NEW)**:
```svelte
<script>
  let { count = 0 } = $props();
  let doubled = $derived(count * 2);

  function increment() {
    count += 1;
  }
</script>
```

**Key Differences**:
- `export let` → `$props()` (component props)
- `$:` → `$derived()` (computed values)
- `let` (top-level) → `$state()` (reactive state)
- `$:` (side effects) → `$effect()` (lifecycle hooks)

---

### 2. XState v5 setup() API

**❌ XState v4 (OLD)**:
```typescript
import { createMachine, assign } from 'xstate';

const machine = createMachine({
  id: 'myMachine',
  initial: 'idle',
  context: { count: 0 },
  states: {
    idle: {
      on: {
        INCREMENT: {
          actions: assign({ count: (ctx) => ctx.count + 1 })
        }
      }
    }
  }
});
```

**✅ XState v5 (NEW)**:
```typescript
import { setup, assign } from 'xstate';

const machine = setup({
  types: {
    context: {} as { count: number },
    events: {} as { type: 'INCREMENT' }
  },
  actions: {
    incrementCount: assign({
      count: ({ context }) => context.count + 1
    })
  }
}).createMachine({
  id: 'myMachine',
  initial: 'idle',
  context: { count: 0 },
  states: {
    idle: {
      on: {
        INCREMENT: { actions: 'incrementCount' }
      }
    }
  }
});
```

**Key Changes**:
- Import `setup` from xstate (not just `createMachine`)
- Define `types` for context and events (type-safe)
- Extract actions to setup config
- `assign()` takes object parameter, not function

---

### 3. XState v5 fromPromise Actors

**❌ XState v4 (OLD)**:
```typescript
invoke: {
  src: 'fetchData',
  onDone: { target: 'success', actions: assign({ data: (_, event) => event.data }) }
}
```

**✅ XState v5 (NEW)**:
```typescript
import { fromPromise } from 'xstate';

const fetchData = fromPromise(async ({ input }: { input: { query: string } }) => {
  const response = await fetch(`/api?q=${input.query}`);
  return response.json();
});

// In machine:
invoke: {
  src: fetchData,
  input: ({ context, event }) => ({ query: context.searchQuery }),
  onDone: {
    target: 'success',
    actions: assign({ data: ({ event }) => event.output })  // ✅ event.output (NOT event.data)
  }
}
```

**Key Changes**:
- Use `fromPromise` for async actors (not inline functions)
- Actor receives `{ input }` destructured parameter
- `onDone` receives `event.output` (NOT `event.data`)
- `input` callback destructures `{ context, event }` (NOT `({ context: event })` - that's a typo!)

---

### 4. Import Patterns

**❌ Common Mistakes**:
```typescript
import { cn } from "$lib/utils/cn";  // ❌ TypeScript can't resolve $lib/*
import * as DropdownMenu from 'bits-ui/dropdown-menu';  // ❌ No subpath exports in bits-ui v2
```

**✅ Correct Patterns**:
```typescript
// Use barrel export from $lib/index.ts
import { cn } from "$lib";

// bits-ui v2: Use wrapper components
import { DropdownMenu } from "$lib/components/ui/dropdown-menu";

// OR import bits-ui namespace directly (if needed)
import { DropdownMenu } from "bits-ui";  // ⚠️ May need type fix
```

**$lib Barrel Exports** (`src/lib/index.ts`):
```typescript
export { cn, confidenceClass, legalCn, priorityClass } from './utils/cn';
export { EnhancedApiClient as apiClient } from './services/enhanced-api-client';
export * from './types/index';
```

---

## 🐛 Common Errors & Fixes

### Error 1: Cannot find module '$lib/utils/cn'

**Cause**: TypeScript path mapping doesn't have wildcard `$lib/*`

**Fix**:
```diff
- import { cn } from "$lib/utils/cn";
+ import { cn } from "$lib";
```

**Automation**:
```powershell
$content -replace 'import \{ cn \} from ["\x27]\$lib/utils/cn["\x27]', 'import { cn } from "$lib"'
```

---

### Error 2: Property 'Root' does not exist on type 'ComponentCtor'

**Cause**: bits-ui v2 namespace export pattern + Svelte 5 type compatibility

**Fix** (RECOMMENDED): Use wrapper components
```diff
- import { Button } from "bits-ui";
- <Button.Root>...</Button.Root>
+ import { Button } from "$lib/components/ui/button";
+ <Button>...</Button>
```

**Alternative** (UNTESTED): Type augmentation
```typescript
// In src/app.d.ts
declare module "bits-ui" {
  export namespace Button {
    export const Root: typeof import("bits-ui").Button;
  }
}
```

---

### Error 3: SvelteComponentTyped not assignable to Component

**Cause**: Svelte 4 → Svelte 5 component type system change

**Fix** (TBD): Use Svelte 5 Component type
```diff
- import type { SvelteComponentTyped } from "svelte";
+ import type { Component } from "svelte";

- let MyComponent: typeof SvelteComponentTyped;
+ let MyComponent: Component;
```

**Status**: ⏸️ Needs research - Svelte 5 component type system is different

---

### Error 4: XState destructuring typo

**Cause**: Colon instead of comma in object destructuring

**Fix**:
```diff
  invoke: {
    src: myActor,
-   input: ({ context: event }) => ({ ... })  // ❌ Typo: colon = assignment
+   input: ({ context, event }) => ({ ... })  // ✅ Correct: comma = destructuring
  }
```

**Auto-fix**:
```powershell
$content -replace '\(\{\s*context:\s*event\s*\}\)', '({ context, event })'
```

---

## 📦 Dependencies

**Package Versions** (from `package.json`):
```json
{
  "svelte": "^5.2.9",
  "xstate": "^5.24.0",
  "bits-ui": "^2.14.4",
  "@sveltejs/kit": "^2.42.0",
  "drizzle-orm": "^0.38.5",
  "lucide-svelte": "^0.515.0"
}
```

**Key Notes**:
- bits-ui v2 exports from main entry (`"bits-ui"`) - no subpath exports
- XState v5 requires `setup()` API for type-safe machines
- Svelte 5 uses runes (`$props`, `$state`, `$derived`, `$effect`)

---

## 🔧 Service API Patterns

### Go Microservice Client (HTTP/3 QUIC)

**File**: `src/lib/services/production-service-client.ts`

```typescript
import { fetch } from 'undici';  // HTTP/3 support

class ProductionServiceClient {
  async query(input: string, opts?: { userId?: string; caseId?: string }) {
    const response = await fetch(this.ragUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input, ...opts }),
      version: 'h3'  // HTTP/3 QUIC
    });
    return response.json();
  }

  async uploadFile(file: File, opts?: { userId?: string; caseId?: string }) {
    const formData = new FormData();
    formData.append('file', file);
    if (opts?.userId) formData.append('userId', opts.userId);

    const response = await fetch(this.uploadUrl, {
      method: 'POST',
      body: formData,
      version: 'h3'
    });
    return response.json();
  }
}
```

**Fallback Pattern** (HTTP/3 → HTTP/2):
```typescript
try {
  return await fetch(url, { version: 'h3' });
} catch (error) {
  console.warn('HTTP/3 failed, falling back to HTTP/2');
  return await fetch(url);  // Auto HTTP/2
}
```

---

### RabbitMQ Integration

**File**: `src/lib/integrations/rabbitmq-xstate-integration.ts`

```typescript
import { fromCallback } from 'xstate';

const rabbitmqListener = fromCallback(({ sendBack, receive }) => {
  const channel = await rabbitmqClient.createChannel();

  await channel.consume('legal_documents_queue', (msg) => {
    if (msg) {
      const data = JSON.parse(msg.content.toString());
      sendBack({ type: 'MESSAGE_RECEIVED', data });
      channel.ack(msg);
    }
  });

  receive((event) => {
    if (event.type === 'STOP') {
      channel.close();
    }
  });
});
```

---

### Redis Cache Pattern

**File**: `src/lib/server/cache/redis.ts`

```typescript
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export async function getCached<T>(key: string): Promise<T | null> {
  const cached = await redis.get(key);
  return cached ? JSON.parse(cached) : null;
}

export async function setCached<T>(key: string, value: T, ttl = 3600): Promise<void> {
  await redis.setex(key, ttl, JSON.stringify(value));
}
```

**Usage in XState**:
```typescript
const cacheActor = fromPromise(async ({ input }: { input: { key: string } }) => {
  const cached = await getCached(input.key);
  if (cached) return cached;

  const fresh = await fetchFreshData();
  await setCached(input.key, fresh);
  return fresh;
});
```

---

## 🎓 Learning Resources

**Svelte 5**:
- Runes docs: https://svelte-5-preview.vercel.app/docs/runes
- Migration guide: https://svelte.dev/docs/svelte/v5-migration-guide
- Component types: https://svelte.dev/docs/svelte/typescript

**XState v5**:
- Setup API: https://stately.ai/docs/setup
- fromPromise: https://stately.ai/docs/actors#frompromise
- Migration: https://stately.ai/docs/migration

**bits-ui v2**:
- Components: https://bits-ui.com/docs/components
- Svelte 5 support: https://bits-ui.com/docs/svelte-5

---

## ✅ Checklist for AI Assistants

When helping with Svelte 5 migration:

- [ ] Use `$props()` not `export let`
- [ ] Use `$derived()` not `$:`
- [ ] Use `$state()` for reactive variables
- [ ] Import `cn` from `"$lib"` not `"$lib/utils/cn"`
- [ ] Use XState `setup()` API, not raw `createMachine`
- [ ] XState actors use `fromPromise`, receive `{ input }`, return via `event.output`
- [ ] Destructure `{ context, event }` with **comma** not colon
- [ ] bits-ui imports from main entry or wrapper components
- [ ] Check service API schemas match Go microservices
- [ ] Verify RabbitMQ queue names and message formats
- [ ] Test with actual services, not mocks

---

**Last Updated**: January 9, 2026
**Status**: Dry-run complete, automation pending research
