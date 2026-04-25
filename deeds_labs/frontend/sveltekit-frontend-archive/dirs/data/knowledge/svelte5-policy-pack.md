# Svelte 5 / SvelteKit 2 / Bits-UI Policy Pack

**Version**: 1.0.0 (Phase 88)
**Purpose**: Enforce modern Svelte 5 patterns, ban legacy syntax, prefer Bits-UI + UnoCSS

This policy pack is prepended to all Gemma3-legal prompts to ensure generated code follows current best practices.

---

## 🎯 Core Principles

1. **Svelte 5 Runes First** - Always use runes (`$state`, `$derived`, `$effect`, `$props`)
2. **SvelteKit 2 Conventions** - Follow current routing, load functions, form actions
3. **Bits-UI for Components** - Prefer headless Bits-UI over custom component primitives
4. **UnoCSS for Styling** - Use atomic utility classes, avoid global CSS frameworks
5. **TypeScript Strict** - All code must be fully typed with `.svelte.ts` modules
6. **Documentation First** - When in conflict, cite official docs chunk IDs

---

## ✅ Svelte 5 Patterns (DO THIS)

### Reactive State
```svelte
<script lang="ts">
  // ✅ Svelte 5: Use $state rune
  let count = $state(0);

  // ✅ Derived values: Use $derived
  let doubled = $derived(count * 2);

  // ✅ Side effects: Use $effect
  $effect(() => {
    console.log(`Count is now ${count}`);
  });
</script>
```

### Component Props
```svelte
<script lang="ts">
  // ✅ Svelte 5: Use $props rune with destructuring
  interface Props {
    title: string;
    count?: number;
  }

  let { title, count = 0 }: Props = $props();
</script>
```

### Event Handlers
```svelte
<script lang="ts">
  // ✅ Svelte 5: Standard event handlers (no 'on:' prefix for custom events)
  function handleClick() {
    count++;
  }
</script>

<button onclick={handleClick}>Click me</button>
```

### Component Slots
```svelte
<script lang="ts">
  // ✅ Svelte 5: Snippet for reusable content
  let { children } = $props();
</script>

<div class="wrapper">
  {@render children?.()}
</div>
```

---

## ❌ Svelte 4 Legacy Patterns (NEVER DO THIS)

### Reactive State (BANNED)
```svelte
<script lang="ts">
  // ❌ Svelte 4: export let (BANNED - use $props)
  export let count = 0;

  // ❌ Svelte 4: $: reactive declarations (BANNED - use $derived)
  $: doubled = count * 2;

  // ❌ Svelte 4: $: reactive statements (BANNED - use $effect)
  $: {
    console.log(count);
  }
</script>
```

**Why banned**: Svelte 5 runes provide better TypeScript inference, clearer intent, and improved performance.

### Component API (BANNED)
```svelte
<script lang="ts">
  // ❌ BANNED: export let for props
  export let title: string;

  // ❌ BANNED: createEventDispatcher
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>
```

**Replacement**: Use `$props()` and callback props instead of event dispatchers.

---

## 🎨 SvelteKit 2 Routing Conventions

### Page Load Functions
```typescript
// ✅ src/routes/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  return {
    user: locals.user,
    items: await db.query.items.findMany()
  };
};
```

### Form Actions
```typescript
// ✅ src/routes/+page.server.ts
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const data = await request.formData();
    const email = data.get('email');

    if (!email) {
      return fail(400, { email, missing: true });
    }

    // Process...
    return { success: true };
  }
};
```

### API Routes
```typescript
// ✅ src/routes/api/users/+server.ts
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
  const users = await db.query.users.findMany();
  return json(users);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  // Process...
  return json({ success: true }, { status: 201 });
};
```

---

## 🧩 Bits-UI Component Patterns

### Dialog Example
```svelte
<script lang="ts">
  import { Dialog } from 'bits-ui';

  let open = $state(false);
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>Open Dialog</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/50" />
    <Dialog.Content class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <Dialog.Title>Dialog Title</Dialog.Title>
      <Dialog.Description>Dialog content goes here</Dialog.Description>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Dropdown Menu Example
```svelte
<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>Options</DropdownMenu.Trigger>
  <DropdownMenu.Content>
    <DropdownMenu.Item>Edit</DropdownMenu.Item>
    <DropdownMenu.Item>Delete</DropdownMenu.Item>
    <DropdownMenu.Separator />
    <DropdownMenu.Item>Cancel</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
```

**Why Bits-UI**: Headless, accessible, composable, built for Svelte 5 runes.

---

## 🎨 UnoCSS Styling Patterns

### Utility-First Classes
```svelte
<div class="flex items-center gap-4 p-4 bg-gray-100 rounded-lg">
  <button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
    Click me
  </button>
</div>
```

### Responsive Design
```svelte
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <!-- Responsive grid -->
</div>
```

### Dark Mode
```svelte
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
  <!-- Auto dark mode support -->
</div>
```

**Why UnoCSS**: Instant atomic CSS, Tailwind-compatible, zero runtime, Vite-optimized.

---

## 🗄️ Drizzle ORM Patterns

### Schema Definition
```typescript
// ✅ src/lib/db/schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow()
});
```

### Query Patterns
```typescript
// ✅ Type-safe queries
import { db } from '$lib/db';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

// Select
const allUsers = await db.select().from(users);

// Where
const user = await db.select().from(users).where(eq(users.email, 'test@example.com'));

// Insert
const newUser = await db.insert(users).values({ email: 'new@example.com', name: 'New User' }).returning();
```

**Why Drizzle**: Type-safe, SQL-like, zero runtime overhead, excellent PostgreSQL support.

---

## 📊 PostgreSQL 17 + pgvector Patterns

### Vector Search
```sql
-- ✅ HNSW index for fast cosine similarity
CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops);

-- ✅ Vector similarity query
SELECT * FROM embeddings
ORDER BY embedding <=> '[0.1, 0.2, 0.3, ...]'::vector
LIMIT 10;
```

### JSON Queries
```sql
-- ✅ JSONB operators
SELECT * FROM documents WHERE metadata @> '{"tag": "svelte5"}';
```

---

## 🚨 Anti-Patterns (NEVER DO THIS)

1. **NEVER use `export let`** → Use `$props()` rune
2. **NEVER use `$:` reactive statements** → Use `$derived` or `$effect`
3. **NEVER use `createEventDispatcher`** → Use callback props
4. **NEVER use global CSS frameworks** (Bootstrap, Bulma) → Use UnoCSS utilities
5. **NEVER use `any` type** → Use proper TypeScript generics or `unknown`
6. **NEVER use `.js` for Svelte modules** → Use `.svelte.ts` for type safety
7. **NEVER hardcode database URLs** → Use environment variables from `$env/static/private`

---

## 🔍 When in Doubt

1. **Search official docs first**: Use `knowledge_retrieve` tool to search Svelte 5 / SvelteKit 2 / Bits-UI docs
2. **Cite sources**: When answering from docs, include chunk IDs or URLs
3. **Prefer composition**: Break complex components into smaller Bits-UI primitives
4. **Type everything**: Use `.svelte.ts` modules for shared state/logic
5. **Test edge cases**: Use Vitest for logic, Playwright for E2E

---

## 📚 Documentation Priority

When conflicting information exists:

1. **Svelte 5 docs** (`svelte.dev/docs/svelte`) - Source of truth for runes
2. **SvelteKit 2 docs** (`kit.svelte.dev/docs`) - Source of truth for routing/loading
3. **Bits-UI docs** (`bits-ui.com/docs`) - Source of truth for component APIs
4. **Local operator docs** (your KB) - Source of truth for project-specific patterns

---

## 🤖 Tool Calling Protocol

Before generating code:

1. Call `knowledge_retrieve({ query: "Svelte 5 <topic>", tags: ["svelte5", "docs"] })`
2. Review returned snippets for current best practices
3. Generate code using retrieved patterns
4. If uncertain, call `knowledge_retrieve` again with more specific query

---

## 🎯 Success Criteria

Generated code passes all of these checks:

- ✅ No `export let` (use `$props`)
- ✅ No `$:` (use `$derived` or `$effect`)
- ✅ No `createEventDispatcher` (use callback props)
- ✅ TypeScript strict mode compliant
- ✅ Uses Bits-UI for complex components
- ✅ Uses UnoCSS utilities for styling
- ✅ Follows SvelteKit 2 routing conventions
- ✅ Includes proper type imports from `$types`

---

**Last Updated**: Phase 88 (2025-12-28)
**Maintained By**: ACE Agentic System
**Enforcement**: Prepended to all Gemma3-legal prompts
