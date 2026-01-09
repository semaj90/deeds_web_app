# Svelte 5 Reactivity Patterns

**Version**: Svelte 5.43.2
**Last Updated**: January 9, 2026
**Source**: https://svelte.dev/docs/svelte

## Core Runes

### $props()
Component props are declared using `$props()` rune:

```svelte
<script lang="ts">
  // Basic destructuring
  let { adjective } = $props();

  // With fallback values
  let { adjective = 'happy' } = $props();

  // With TypeScript types
  let { adjective }: { adjective: string } = $props();

  // Interface-based typing (RECOMMENDED)
  interface Props {
    adjective: string;
    optional?: number;
  }
  let { adjective, optional = 0 }: Props = $props();

  // Rest props
  let { a, b, c, ...others } = $props();
</script>
```

### $state()
Reactive state declaration:

```svelte
<script lang="ts">
  let count = $state(0);
  let user = $state({ name: 'Alice', age: 30 });
</script>

<button onclick={() => count++}>
  Clicked {count} times
</button>
```

### $derived()
Computed/derived state:

```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
  let complex = $derived(() => {
    return count > 10 ? 'high' : 'low';
  });
</script>
```

### $effect()
Side effects (replaces `onMount`, `afterUpdate`, `beforeUpdate`):

```svelte
<script lang="ts">
  let count = $state(0);

  // Runs whenever dependencies change
  $effect(() => {
    console.log(`Count is ${count}`);
  });

  // Cleanup function
  $effect(() => {
    const interval = setInterval(() => count++, 1000);
    return () => clearInterval(interval);
  });
</script>
```

### $bindable()
Two-way binding for props:

```svelte
<script lang="ts">
  // In child component
  let { value = $bindable(0) } = $props();
</script>

<!-- Parent component -->
<Child bind:value={parentValue} />
```

## Migration from Svelte 4

### BEFORE (Svelte 4)
```svelte
<script lang="ts">
  export let name: string;
  export let age = 25;

  let count = 0;
  $: doubled = count * 2;

  onMount(() => {
    console.log('Mounted');
  });
</script>
```

### AFTER (Svelte 5)
```svelte
<script lang="ts">
  interface Props {
    name: string;
    age?: number;
  }
  let { name, age = 25 }: Props = $props();

  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log('Mounted');
  });
</script>
```

## Event Handlers

### BEFORE (Svelte 4)
```svelte
<button on:click={handler}>Click</button>
```

### AFTER (Svelte 5)
```svelte
<button onclick={handler}>Click</button>
```

Event names are now lowercase: `onclick`, `onmouseenter`, `onkeydown`, etc.

## Snippets (Replaces Slots)

### BEFORE (Svelte 4)
```svelte
<slot name="header" />
<slot />
```

### AFTER (Svelte 5)
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    header?: Snippet;
    children?: Snippet;
  }
  let { header, children }: Props = $props();
</script>

{#if header}
  {@render header()}
{/if}

{#if children}
  {@render children()}
{/if}
```

## Common Patterns

### Component with Typed Props and State
```svelte
<script lang="ts">
  interface Props {
    initialValue?: number;
    onChange?: (value: number) => void;
  }

  let {
    initialValue = 0,
    onChange
  }: Props = $props();

  let count = $state(initialValue);

  function increment() {
    count++;
    onChange?.(count);
  }
</script>

<button onclick={increment}>
  Count: {count}
</button>
```

### Form Binding
```svelte
<script lang="ts">
  let value = $state('');
  let checked = $state(false);
</script>

<input bind:value />
<input type="checkbox" bind:checked />
```

## Important Notes

1. **No `$state` in `$props`**: Don't mix `$state` and `$props` for the same variable
2. **Prop Mutation**: Don't mutate props unless they're `$bindable`
3. **Effect Cleanup**: Always return cleanup function from `$effect` if needed
4. **Type Safety**: Always use TypeScript interfaces for props
5. **Snippets > Slots**: Use snippets pattern for component composition

## Resources

- [Svelte 5 Runes Documentation](https://svelte.dev/docs/svelte/what-are-runes)
- [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [Svelte 5 Tutorial](https://learn.svelte.dev/)
