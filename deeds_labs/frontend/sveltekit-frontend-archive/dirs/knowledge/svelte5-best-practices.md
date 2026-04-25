# Svelte 5 Best Practices & Migration Guide

## 1. New Reactivity Model: Runes

Svelte 5 introduces "runes" to handle reactivity, replacing the `let` and `$:` syntax.

### `$state`
Replaces top-level `let` variables for reactive state.
```svelte
<script>
  let count = $state(0);

  function increment() {
    count += 1;
  }
</script>
```

### `$derived`
Replaces `$:` for derived values.
```svelte
<script>
  let count = $state(0);
  let double = $derived(count * 2);
</script>
```

### `$effect`
Replaces `$:` for side effects.
```svelte
<script>
  let count = $state(0);

  $effect(() => {
    console.log(`Count is now ${count}`);

    return () => {
      console.log('Cleanup');
    };
  });
</script>
```

### `$props`
Replaces `export let` for component props.
```svelte
<script>
  let { name, age = 25 } = $props();
</script>
```

## 2. Migration from Svelte 4

| Svelte 4 | Svelte 5 (Runes) |
|----------|------------------|
| `let count = 0;` | `let count = $state(0);` |
| `$: double = count * 2;` | `let double = $derived(count * 2);` |
| `$: console.log(count);` | `$effect(() => console.log(count));` |
| `export let name;` | `let { name } = $props();` |
| `export let age = 25;` | `let { age = 25 } = $props();` |

## 3. TypeScript Utilities for SvelteKit

### `ComponentProps`
Extract props type from a component.
```typescript
import type { ComponentProps } from 'svelte';
import MyComponent from './MyComponent.svelte';

type Props = ComponentProps<typeof MyComponent>;
```

### `Snippet`
Type for snippets (new in Svelte 5).
```typescript
import type { Snippet } from 'svelte';

let { header }: { header: Snippet } = $props();
```

## 4. Gotchas & Patterns

- **Deep Reactivity**: `$state` creates a deeply reactive proxy. Mutating nested properties works automatically.
- **Classes**: You can use runes inside classes (`.svelte.js` or `.svelte.ts` files).
- **Untracking**: Use `untrack(() => ...)` to read a reactive value without creating a dependency in an effect.
- **Frozen State**: Use `$state.frozen()` for immutable data that shouldn't be proxied (good for large objects).

## 5. Common Patterns

### Shared State (Store replacement)
```typescript
// counter.svelte.ts
export class Counter {
  count = $state(0);

  increment() {
    this.count += 1;
  }
}

export const globalCounter = new Counter();
```

### Event Handling
Event dispatching (`createEventDispatcher`) is deprecated in favor of callback props.
```svelte
<!-- Child.svelte -->
<script>
  let { onsubmit } = $props();
</script>
<button onclick={onsubmit}>Submit</button>

<!-- Parent.svelte -->
<Child onsubmit={() => console.log('Submitted')} />
```
