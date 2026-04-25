# Svelte 5 Best Practices & Reactive Patterns

## Runes System (Svelte 5+)

### State Management
```typescript
// ✅ CORRECT: $state for reactive variables
let count = $state(0);
let user = $state({ name: 'Alice', age: 30 });

// ✅ CORRECT: $state.frozen for immutable state
let config = $state.frozen({ theme: 'dark', locale: 'en' });

// ❌ WRONG: Don't use let without $state for reactive values
let count = 0; // Won't trigger reactivity
```

### Props (Component Inputs)
```typescript
// ✅ CORRECT: $props() for component props
let { title, onSubmit, children } = $props();

// ✅ CORRECT: With defaults
let { count = 0, enabled = true } = $props();

// ✅ CORRECT: With types
interface Props {
	title: string;
	count?: number;
}
let { title, count = 0 }: Props = $props();

// ❌ WRONG: Don't use export let
export let title; // Svelte 4 syntax
```

### Derived State
```typescript
// ✅ CORRECT: $derived for computed values
let count = $state(5);
let doubled = $derived(count * 2);

// ✅ CORRECT: Complex derivations
let user = $state({ firstName: 'John', lastName: 'Doe' });
let fullName = $derived(`${user.firstName} ${user.lastName}`);

// ✅ CORRECT: $derived.by for complex logic
let filtered = $derived.by(() => {
	return items.filter(item => item.active);
});

// ❌ WRONG: Don't use $: for reactivity
$: doubled = count * 2; // Svelte 4 syntax
```

### Effects (Side Effects)
```typescript
// ✅ CORRECT: $effect for side effects
$effect(() => {
	console.log('Count changed:', count);
	// Cleanup function (optional)
	return () => console.log('Cleanup');
});

// ✅ CORRECT: $effect.pre for pre-render effects
$effect.pre(() => {
	// Runs before DOM updates
});

// ✅ CORRECT: $effect.root for manual control
const cleanup = $effect.root(() => {
	$effect(() => {
		console.log(count);
	});
	return () => cleanup();
});

// ❌ WRONG: Don't use $: for effects
$: console.log(count); // Svelte 4 syntax
```

## Event Handlers

### Modern Syntax
```svelte
<!-- ✅ CORRECT: Use lowercase event attributes -->
<button onclick={() => count++}>Increment</button>
<input oninput={(e) => name = e.currentTarget.value} />
<form onsubmit={handleSubmit}>Submit</form>

<!-- ✅ CORRECT: Event modifiers -->
<button onclick|preventDefault={() => save()}>Save</button>
<div onclick|stopPropagation={handler}>Click me</div>
<input onkeydown|enter={submit} />

<!-- ❌ WRONG: Don't use on: prefix -->
<button on:click={() => count++}>Old syntax</button>
```

### Custom Events
```typescript
// ✅ CORRECT: Use callbacks instead of createEventDispatcher
interface Props {
	onsubmit?: (data: FormData) => void;
}

let { onsubmit }: Props = $props();

function handleSubmit() {
	onsubmit?.(formData);
}
```

```svelte
<!-- Parent component -->
<MyForm onsubmit={(data) => console.log(data)} />
```

## Component Patterns

### Reactive Class/Style Bindings
```svelte
<!-- ✅ CORRECT: Reactive class names -->
<div class={active ? 'active' : 'inactive'}>Content</div>
<div class:active={isActive}>Toggle class</div>
<div class:active class:disabled={!enabled}>Multiple</div>

<!-- ✅ CORRECT: Reactive styles -->
<div style="color: {textColor}; font-size: {size}px">Styled</div>
<div style:color={textColor} style:font-size="{size}px">Modern</div>
```

### Conditional Rendering
```svelte
<!-- ✅ CORRECT: {#if} blocks -->
{#if user}
	<p>Welcome, {user.name}!</p>
{:else}
	<p>Please log in</p>
{/if}

<!-- ✅ CORRECT: {#each} with key -->
{#each items as item (item.id)}
	<div>{item.name}</div>
{/each}

<!-- ✅ CORRECT: {#await} for promises -->
{#await promise}
	<p>Loading...</p>
{:then value}
	<p>Result: {value}</p>
{:catch error}
	<p>Error: {error.message}</p>
{/await}
```

### Stores (Still Valid)
```typescript
// ✅ CORRECT: Writable store
import { writable } from 'svelte/store';
const count = writable(0);

// ✅ CORRECT: Derived store
import { derived } from 'svelte/store';
const doubled = derived(count, $count => $count * 2);

// ✅ CORRECT: Custom store
function createCounter() {
	const { subscribe, set, update } = writable(0);
	return {
		subscribe,
		increment: () => update(n => n + 1),
		decrement: () => update(n => n - 1),
		reset: () => set(0)
	};
}
```

## TypeScript Integration

### Typed Props
```typescript
interface Props {
	title: string;
	count?: number;
	onSubmit: (value: string) => void;
	children?: import('svelte').Snippet;
}

let { title, count = 0, onSubmit, children }: Props = $props();
```

### Generic Components
```typescript
interface Props<T> {
	items: T[];
	renderItem: (item: T) => import('svelte').Snippet;
}

let { items, renderItem }: Props<T> = $props();
```

## Performance Best Practices

### Avoid Unnecessary Reactivity
```typescript
// ✅ GOOD: Minimal reactivity
let count = $state(0);
let doubled = $derived(count * 2); // Only recomputes when count changes

// ❌ BAD: Over-reactive
$effect(() => {
	// This runs on EVERY state change, not just count
	heavyComputation();
});
```

### Use $state.frozen for Large Objects
```typescript
// ✅ GOOD: Immutable state for large data
let largeDataset = $state.frozen(expensiveData);

// ✅ GOOD: Update with new reference
largeDataset = { ...largeDataset, newField: 'value' };
```

### Lazy Loading
```svelte
<script>
	import { onMount } from 'svelte';

	let HeavyComponent;

	onMount(async () => {
		HeavyComponent = (await import('./HeavyComponent.svelte')).default;
	});
</script>

{#if HeavyComponent}
	<HeavyComponent />
{/if}
```

## Common Migration Patterns

### From Svelte 4 to Svelte 5

| Svelte 4 | Svelte 5 |
|----------|----------|
| `export let prop` | `let { prop } = $props()` |
| `let reactive = value` + `$: reactive = computed` | `let reactive = $state(value)`<br>`let computed = $derived(fn)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| `on:click={handler}` | `onclick={handler}` |
| `createEventDispatcher()` | Props with callbacks |
| `<slot name="foo" />` | `{@render children?.foo?.()}` |

## Snippets (Replacement for Slots)

```svelte
<!-- Parent -->
<script>
	import Child from './Child.svelte';
</script>

<Child>
	{#snippet header()}
		<h1>Custom Header</h1>
	{/snippet}

	{#snippet footer()}
		<p>Custom Footer</p>
	{/snippet}
</Child>

<!-- Child.svelte -->
<script>
	let { children } = $props();
</script>

<div class="child">
	{@render children.header?.()}
	<main>
		{@render children?.()}
	</main>
	{@render children.footer?.()}
</div>
```

## Debugging Tips

### Inspect Reactive Values
```typescript
// Log when state changes
let count = $state(0);
$effect(() => {
	console.log('Count is now:', count);
});

// Track multiple values
$effect(() => {
	console.log({ count, doubled, user });
});
```

### Performance Profiling
```typescript
$effect(() => {
	const start = performance.now();
	expensiveComputation();
	console.log(`Took ${performance.now() - start}ms`);
});
```

## Tags
#svelte5 #runes #reactivity #best-practices #migration #performance #typescript #patterns
