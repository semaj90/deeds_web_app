# Svelte 5 Migration Patterns for ACE Contextual Engineering

## Overview
This guide provides patterns for migrating Svelte 4 code to Svelte 5 using runes. Use these patterns for automated fixes and AI-assisted code transformation.

---

## 🎯 Core Rune Migrations

### 1. Component Props (CRITICAL - High Frequency)

**Pattern Detection:**
```regex
export\s+let\s+(\w+)(?:\s*:\s*([^;=]+))?(?:\s*=\s*([^;]+))?;
```

**Migration:**
```typescript
// ❌ Old (Svelte 4)
export let title: string;
export let count = 0;
export let user: User | null = null;

// ✅ New (Svelte 5)
let { title, count = 0, user = null }: {
  title: string;
  count?: number;
  user?: User | null
} = $props();
```

**ACE Rule:**
- Extract all `export let` declarations
- Group into single `$props()` destructuring
- Preserve types and defaults
- Mark optional props with `?` in type annotation

---

### 2. Reactive State (HIGH - Very Common)

**Pattern Detection:**
```regex
let\s+(\w+)\s*=\s*([^;]+);(?!\s*\/\/\s*non-reactive)
```

**Migration:**
```typescript
// ❌ Old (Svelte 4)
let count = 0;
let items = [];
let user = { name: 'John' };

// ✅ New (Svelte 5)
let count = $state(0);
let items = $state([]);
let user = $state({ name: 'John' });
```

**ACE Rule:**
- Wrap initialization value in `$state()`
- Preserve type annotations
- For large immutable objects, use `$state.raw()` for performance
- **Exception:** Function parameters, loop variables, and constants (const) don't need $state

---

### 3. Derived/Computed Values (HIGH - Very Common)

**Pattern Detection:**
```regex
\$:\s*(\w+)\s*=\s*([^;]+);
```

**Migration:**
```typescript
// ❌ Old (Svelte 4)
$: doubled = count * 2;
$: fullName = `${firstName} ${lastName}`;
$: items = data.filter(item => item.active);

// ✅ New (Svelte 5)
let doubled = $derived(count * 2);
let fullName = $derived(`${firstName} ${lastName}`);
let items = $derived(data.filter(item => item.active));
```

**For complex logic:**
```typescript
// ❌ Old
$: {
  let sum = 0;
  for (const item of items) {
    sum += item.price;
  }
  total = sum;
}

// ✅ New
let total = $derived.by(() => {
  let sum = 0;
  for (const item of items) {
    sum += item.price;
  }
  return sum;
});
```

**ACE Rule:**
- Simple expressions → `$derived(expression)`
- Complex logic with statements → `$derived.by(() => { ... return value; })`
- Dependencies tracked automatically

---

### 4. Side Effects (HIGH - Very Common)

**Pattern Detection:**
```regex
\$:\s*\{[^}]+\}|\$:\s*(?![\w\s]*=)[^;]+;
```

**Migration:**
```typescript
// ❌ Old (Svelte 4)
$: {
  console.log('Count changed:', count);
  document.title = `Count: ${count}`;
}

$: console.log(user);

// ✅ New (Svelte 5)
$effect(() => {
  console.log('Count changed:', count);
  document.title = `Count: ${count}`;
});

$effect(() => {
  console.log(user);
});
```

**ACE Rule:**
- Wrap in `$effect(() => { ... })`
- Return cleanup function if needed
- No dependency array (auto-tracked)

---

### 5. Lifecycle Hooks (CRITICAL - Common)

**Pattern Detection:**
```regex
import\s*\{[^}]*on(?:Mount|Destroy|BeforeUpdate|AfterUpdate)[^}]*\}\s*from\s*['"]svelte['"];
```

**Migration:**

#### onMount → $effect
```typescript
// ❌ Old (Svelte 4)
import { onMount } from 'svelte';

onMount(async () => {
  const data = await fetch('/api/data');
  items = await data.json();
});

// ✅ New (Svelte 5)
$effect(() => {
  (async () => {
    const data = await fetch('/api/data');
    items = await data.json();
  })();
});
```

#### onDestroy → $effect return
```typescript
// ❌ Old (Svelte 4)
import { onMount, onDestroy } from 'svelte';

let interval;
onMount(() => {
  interval = setInterval(() => tick(), 1000);
});
onDestroy(() => {
  clearInterval(interval);
});

// ✅ New (Svelte 5)
$effect(() => {
  const interval = setInterval(() => tick(), 1000);

  return () => {
    clearInterval(interval);
  };
});
```

#### beforeUpdate/afterUpdate → $effect.pre / $effect
```typescript
// ❌ Old (Svelte 4)
import { beforeUpdate, afterUpdate } from 'svelte';

beforeUpdate(() => {
  console.log('Before update');
});

afterUpdate(() => {
  console.log('After update');
});

// ✅ New (Svelte 5)
$effect.pre(() => {
  console.log('Before update');
});

$effect(() => {
  console.log('After update');
});
```

**ACE Rule:**
- Remove lifecycle imports
- `onMount` → `$effect` (runs on mount, re-runs on dependencies)
- `onDestroy` → return cleanup function from `$effect`
- `beforeUpdate` → `$effect.pre`
- `afterUpdate` → `$effect`

---

### 6. Event Handlers (CRITICAL - Already Migrated)

**Pattern Detection:**
```regex
on:(\w+)=\{([^}]+)\}
```

**Migration:**
```typescript
// ❌ Old (Svelte 4)
<button on:click={handleClick}>Click</button>
<input on:input={handleInput} on:change={handleChange} />
<form on:submit|preventDefault={handleSubmit}>

// ✅ New (Svelte 5)
<button onclick={handleClick}>Click</button>
<input oninput={handleInput} onchange={handleChange} />
<form onsubmit={(e) => { e.preventDefault(); handleSubmit(e); }}>
```

**ACE Rule:**
- `on:event` → `onevent` (lowercase)
- Modifiers like `preventDefault` must be explicit in handler

---

### 7. Event Dispatching (CRITICAL - Component Communication)

**Pattern Detection:**
```regex
import\s*\{\s*createEventDispatcher\s*\}\s*from\s*['"]svelte['"];\s*const\s+dispatch\s*=\s*createEventDispatcher\(\);
```

**Migration:**
```typescript
// ❌ Old (Svelte 4)
import { createEventDispatcher } from 'svelte';
const dispatch = createEventDispatcher();

function handleSubmit() {
  dispatch('submit', { data: formData });
}

// ✅ New (Svelte 5) - Use callback props
let { onsubmit }: { onsubmit?: (data: FormData) => void } = $props();

function handleSubmit() {
  onsubmit?.(formData);
}
```

**ACE Rule:**
- Remove `createEventDispatcher` import
- Add callback props prefixed with `on`
- Use optional chaining `?.()` to call

---

### 8. Two-Way Binding (Component Props)

**Pattern Detection:**
```regex
bind:(\w+)=\{([^}]+)\}
```

**Migration:**
```typescript
// ❌ Old (Svelte 4) - Parent
<ChildComponent bind:value={myValue} />

// ✅ New (Svelte 5) - Parent
<ChildComponent bind:value={myValue} />  // Still works!

// Child component changes:
// ❌ Old (Svelte 4)
export let value;

// ✅ New (Svelte 5)
let { value = $bindable() }: { value?: string } = $props();
```

**ACE Rule:**
- Parent: `bind:` syntax unchanged
- Child: Use `$bindable()` for props that can be bound

---

### 9. Stores (OPTIONAL - Only if using stores)

**Pattern Detection:**
```regex
import\s*\{\s*writable\s*\}\s*from\s*['"]svelte/store['"];
```

**Migration:**
```typescript
// ❌ Old (Svelte 4)
import { writable } from 'svelte/store';
const count = writable(0);

// Access with $count

// ✅ New (Svelte 5) - Consider using runes instead
let count = $state(0);

// If you need store for cross-component state:
// Keep stores, but consider Svelte 5 context API
```

**ACE Rule:**
- For component-local state: migrate to `$state`
- For global state: keep stores OR use context
- `$store` syntax still works in Svelte 5

---

### 10. Slots → Snippets (MEDIUM Priority)

**Pattern Detection:**
```regex
<slot\s+name=['"](\w+)['"]
```

**Migration:**
```typescript
// ❌ Old (Svelte 4)
<!-- Parent -->
<Modal>
  <span slot="header">Title</span>
  <p slot="footer">Footer</p>
</Modal>

<!-- Child -->
<div>
  <slot name="header" />
  <slot />
  <slot name="footer" />
</div>

// ✅ New (Svelte 5)
<!-- Parent -->
<Modal>
  {#snippet header()}
    <span>Title</span>
  {/snippet}

  {#snippet footer()}
    <p>Footer</p>
  {/snippet}

  <p>Default content</p>
</Modal>

<!-- Child -->
<script>
  let { header, footer, children } = $props();
</script>

<div>
  {@render header?.()}
  {@render children?.()}
  {@render footer?.()}
</div>
```

**ACE Rule:**
- Named slots → snippet definitions
- `<slot name="x" />` → `{@render x?.()}`
- Default slot → `{@render children?.()}`
- Props type: `Snippet` from `svelte`

---

## 🔧 Advanced Patterns

### API Endpoint Integration (SvelteKit 2)

```typescript
// ✅ Modern pattern with Svelte 5 + SvelteKit 2
<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Reactive fetch
  let items = $state<Item[]>(data.items);
  let loading = $state(false);

  async function refetch() {
    loading = true;
    const res = await fetch('/api/items');
    items = await res.json();
    loading = false;
  }

  // Auto-refetch on interval
  $effect(() => {
    const interval = setInterval(refetch, 30000);
    return () => clearInterval(interval);
  });
</script>
```

### WebSocket/SSE with Svelte 5

```typescript
<script lang="ts">
  let messages = $state<Message[]>([]);
  let connected = $state(false);

  $effect(() => {
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => { connected = true; };
    ws.onmessage = (event) => {
      messages = [...messages, JSON.parse(event.data)];
    };
    ws.onerror = () => { connected = false; };

    return () => ws.close();
  });
</script>
```

### gRPC/QUIC Integration

```typescript
<script lang="ts">
  import type { GRPCClient } from '$lib/grpc';

  let client = $state<GRPCClient | null>(null);
  let response = $state<Response | null>(null);

  $effect(() => {
    // Initialize gRPC/QUIC client
    (async () => {
      client = await initGRPCClient();
      response = await client.call('GetCases', {});
    })();

    return () => client?.close();
  });
</script>
```

---

## 🚀 Migration Execution Order

1. **Phase 1: Props** - Convert `export let` → `$props()`
2. **Phase 2: Lifecycle** - Remove imports, convert to `$effect`
3. **Phase 3: Events** - Already done (`on:` → `on`)
4. **Phase 4: Reactive Statements** - Convert `$:` → `$derived` / `$effect`
5. **Phase 5: State** - Add `$state()` where needed
6. **Phase 6: Event Dispatch** - Convert to callback props
7. **Phase 7: Slots** - Convert to snippets (optional, lower priority)

---

## 🤖 ACE Automation Hints

### RegEx Patterns for Detection
```regex
# Props
export\s+let\s+\w+

# Reactive assignments
\$:\s*\w+\s*=

# Reactive blocks
\$:\s*\{

# Lifecycle imports
from\s+['"]svelte['"].*(?:onMount|onDestroy)

# Event dispatchers
createEventDispatcher\(\)

# Old event syntax
on:\w+
```

### Safe Transformation Rules
1. Always preserve types
2. Always preserve default values
3. Group related `$props()` in single destructure
4. Async in `$effect` requires IIFE wrapper
5. Test after each phase

---

## ✅ Validation Checklist

After migration:
- [ ] No `export let` remains (except stores/context)
- [ ] No `on:event` syntax (should be `onevent`)
- [ ] No lifecycle imports from `'svelte'`
- [ ] No `createEventDispatcher` usage
- [ ] All reactive statements converted
- [ ] `npx svelte-check` passes
- [ ] Tests pass
- [ ] App runs without console errors

---

## 📚 References

- [Svelte 5 Runes Docs](https://svelte.dev/docs/svelte/what-are-runes)
- [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [SvelteKit 2 Docs](https://kit.svelte.dev/docs)
