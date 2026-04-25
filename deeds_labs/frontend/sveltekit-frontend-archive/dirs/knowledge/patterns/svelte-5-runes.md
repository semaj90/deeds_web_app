---
title: Svelte 5 Runes & Migration Patterns
description: Comprehensive guide to Svelte 5 runes ($state, $derived, $props, $effect) and migration strategies from Svelte 4.
tags: [svelte-5, runes, frontend, migration, reactivity]
type: pattern
---

# Svelte 5 Runes & Migration Patterns

## 1. Core Runes

### $state
Replaces `let variable = value;` for reactive state.

```svelte
<script>
  let count = $state(0);

  function increment() {
    count += 1;
  }
</script>

<button onclick={increment}>{count}</button>
```

### $derived
Replaces `$: derived = ...` for computed values.

```svelte
<script>
  let count = $state(0);
  let double = $derived(count * 2);

  // Complex derivation with block
  let status = $derived.by(() => {
    if (count > 10) return 'high';
    return 'low';
  });
</script>
```

### $props
Replaces `export let prop;` for component inputs.

```svelte
<script>
  let { title, count = 0, children } = $props();
</script>

<h1>{title}</h1>
{@render children()}
```

### $effect
Replaces `onMount`, `afterUpdate`, and reactive statements with side effects.

```svelte
<script>
  let count = $state(0);

  $effect(() => {
    console.log('Count changed:', count);

    return () => {
      console.log('Cleanup');
    };
  });
</script>
```

## 2. Event Handling

Svelte 5 deprecates `on:event` in favor of standard HTML attributes.

```svelte
<!-- Svelte 4 -->
<button on:click={handleClick}>Click</button>

<!-- Svelte 5 -->
<button onclick={handleClick}>Click</button>
```

## 3. Snippets (Slots Replacement)

Slots are replaced by snippets for more flexibility.

```svelte
{#snippet header(text)}
  <header class="font-bold">{text}</header>
{/snippet}

{@render header('My Title')}
```

## 4. Migration Checklist

1.  **Script Tag**: Ensure `<script lang="ts">` is used.
2.  **Props**: Convert `export let` to `let { ... } = $props()`.
3.  **Reactivity**: Convert top-level `let` to `$state()`.
4.  **Computed**: Convert `$:` to `$derived()`.
5.  **Events**: Convert `on:click` to `onclick`.
6.  **Lifecycle**: Convert `onMount` to `$effect`.

## 5. Common Pitfalls

*   **Classes**: Do not use `$state` inside classes unless using the new fine-grained reactivity system properly.
*   **Destructuring**: Destructuring `$props()` is fine, but destructuring `$state` objects loses reactivity unless you use nested `$state`.
*   **Async**: `$derived` cannot be async. Use `$effect` or a resource loader for async data.
