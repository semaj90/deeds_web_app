# Svelte 5 Reactive Snippets & Code Patterns

## State Management Patterns

### Basic Counter
```typescript
<script lang="ts">
	let count = $state(0);
	let doubled = $derived(count * 2);

	function increment() {
		count++;
	}
</script>

<button onclick={increment}>
	Count: {count} (Doubled: {doubled})
</button>
```

### Object State
```typescript
<script lang="ts">
	let user = $state({
		name: 'Alice',
		email: 'alice@example.com',
		role: 'admin'
	});

	function updateName(newName: string) {
		user.name = newName; // Direct mutation works
	}

	function updateUser(updates: Partial<typeof user>) {
		user = { ...user, ...updates }; // Or use spread
	}
</script>

<input value={user.name} oninput={(e) => updateName(e.currentTarget.value)} />
<p>Email: {user.email}</p>
```

### Array State
```typescript
<script lang="ts">
	let todos = $state<Array<{ id: number; text: string; done: boolean }>>([]);
	let nextId = 0;

	function addTodo(text: string) {
		todos.push({ id: nextId++, text, done: false });
	}

	function toggleTodo(id: number) {
		const todo = todos.find(t => t.id === id);
		if (todo) todo.done = !todo.done;
	}

	function removeTodo(id: number) {
		todos = todos.filter(t => t.id !== id);
	}
</script>

{#each todos as todo (todo.id)}
	<div>
		<input type="checkbox" checked={todo.done} onchange={() => toggleTodo(todo.id)} />
		<span class:line-through={todo.done}>{todo.text}</span>
		<button onclick={() => removeTodo(todo.id)}>Delete</button>
	</div>
{/each}
```

### Frozen State (Immutable)
```typescript
<script lang="ts">
	// Use for large datasets or configuration objects
	let config = $state.frozen({
		theme: 'dark',
		locale: 'en',
		features: ['ai', 'rag', 'kag']
	});

	function updateConfig(key: string, value: any) {
		config = { ...config, [key]: value }; // Create new reference
	}
</script>
```

## Derived Values

### Simple Derivation
```typescript
<script lang="ts">
	let firstName = $state('John');
	let lastName = $state('Doe');
	let fullName = $derived(`${firstName} ${lastName}`);
</script>

<p>Full Name: {fullName}</p>
```

### Complex Derivation with $derived.by
```typescript
<script lang="ts">
	let items = $state([
		{ name: 'Apple', category: 'fruit', price: 1.50 },
		{ name: 'Carrot', category: 'vegetable', price: 0.80 },
		{ name: 'Banana', category: 'fruit', price: 1.20 }
	]);

	let selectedCategory = $state('fruit');

	let filteredItems = $derived.by(() => {
		return items
			.filter(item => item.category === selectedCategory)
			.sort((a, b) => a.price - b.price);
	});

	let totalPrice = $derived(
		filteredItems.reduce((sum, item) => sum + item.price, 0)
	);
</script>

<select bind:value={selectedCategory}>
	<option value="fruit">Fruits</option>
	<option value="vegetable">Vegetables</option>
</select>

<p>Total: ${totalPrice.toFixed(2)}</p>
{#each filteredItems as item}
	<div>{item.name} - ${item.price}</div>
{/each}
```

### Chained Derivations
```typescript
<script lang="ts">
	let celsius = $state(0);
	let fahrenheit = $derived((celsius * 9/5) + 32);
	let kelvin = $derived(celsius + 273.15);
	let description = $derived(
		celsius < 0 ? 'Freezing' :
		celsius < 10 ? 'Cold' :
		celsius < 20 ? 'Cool' :
		celsius < 30 ? 'Warm' : 'Hot'
	);
</script>

<input type="number" bind:value={celsius} />
<p>{celsius}°C = {fahrenheit.toFixed(1)}°F = {kelvin.toFixed(1)}K</p>
<p>It's {description}!</p>
```

## Effects & Side Effects

### Basic Effect
```typescript
<script lang="ts">
	let count = $state(0);

	// Runs whenever count changes
	$effect(() => {
		console.log('Count changed to:', count);
		document.title = `Count: ${count}`;
	});
</script>
```

### Effect with Cleanup
```typescript
<script lang="ts">
	let isActive = $state(false);

	$effect(() => {
		if (!isActive) return;

		const interval = setInterval(() => {
			console.log('Active!');
		}, 1000);

		// Cleanup function
		return () => {
			clearInterval(interval);
			console.log('Cleaned up interval');
		};
	});
</script>
```

### Pre-Render Effect
```typescript
<script lang="ts">
	let scrollY = $state(0);

	// Runs before DOM updates
	$effect.pre(() => {
		console.log('Pre-render scroll:', scrollY);
	});

	// Runs after DOM updates
	$effect(() => {
		console.log('Post-render scroll:', scrollY);
	});
</script>

<svelte:window bind:scrollY />
```

### Debounced Effect
```typescript
<script lang="ts">
	let searchQuery = $state('');
	let debouncedQuery = $state('');

	$effect(() => {
		const timer = setTimeout(() => {
			debouncedQuery = searchQuery;
		}, 300);

		return () => clearTimeout(timer);
	});

	// Only runs when user stops typing for 300ms
	$effect(() => {
		if (debouncedQuery) {
			fetch(`/api/search?q=${debouncedQuery}`)
				.then(r => r.json())
				.then(data => console.log(data));
		}
	});
</script>

<input bind:value={searchQuery} placeholder="Search..." />
```

## Component Props

### Basic Props
```typescript
<script lang="ts">
	interface Props {
		title: string;
		count?: number;
		enabled?: boolean;
	}

	let { title, count = 0, enabled = true }: Props = $props();
</script>

<h1>{title}</h1>
<p>Count: {count}</p>
<p>Enabled: {enabled}</p>
```

### Props with Callbacks
```typescript
<script lang="ts">
	interface Props {
		onSubmit: (value: string) => void;
		onCancel?: () => void;
	}

	let { onSubmit, onCancel }: Props = $props();
	let value = $state('');

	function handleSubmit() {
		onSubmit(value);
		value = '';
	}
</script>

<form onsubmit|preventDefault={handleSubmit}>
	<input bind:value />
	<button type="submit">Submit</button>
	{#if onCancel}
		<button type="button" onclick={onCancel}>Cancel</button>
	{/if}
</form>
```

### Generic Props
```typescript
<script lang="ts" generics="T">
	interface Props<T> {
		items: T[];
		renderItem: (item: T) => string;
		onSelect?: (item: T) => void;
	}

	let { items, renderItem, onSelect }: Props<T> = $props();
</script>

<ul>
	{#each items as item}
		<li onclick={() => onSelect?.(item)}>
			{renderItem(item)}
		</li>
	{/each}
</ul>
```

## Form Patterns

### Two-Way Binding
```typescript
<script lang="ts">
	let formData = $state({
		username: '',
		email: '',
		age: 0,
		newsletter: false
	});

	function handleSubmit() {
		console.log('Submitted:', formData);
	}
</script>

<form onsubmit|preventDefault={handleSubmit}>
	<input bind:value={formData.username} placeholder="Username" />
	<input type="email" bind:value={formData.email} placeholder="Email" />
	<input type="number" bind:value={formData.age} placeholder="Age" />
	<label>
		<input type="checkbox" bind:checked={formData.newsletter} />
		Subscribe to newsletter
	</label>
	<button type="submit">Submit</button>
</form>
```

### Form Validation
```typescript
<script lang="ts">
	let email = $state('');
	let password = $state('');

	let emailValid = $derived(
		/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
	);

	let passwordValid = $derived(
		password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)
	);

	let formValid = $derived(emailValid && passwordValid);
</script>

<form>
	<input
		type="email"
		bind:value={email}
		class:invalid={email && !emailValid}
	/>
	{#if email && !emailValid}
		<span class="error">Invalid email</span>
	{/if}

	<input
		type="password"
		bind:value={password}
		class:invalid={password && !passwordValid}
	/>
	{#if password && !passwordValid}
		<span class="error">Password must be 8+ chars with uppercase and number</span>
	{/if}

	<button type="submit" disabled={!formValid}>Submit</button>
</form>

<style>
	.invalid {
		border-color: red;
	}
	.error {
		color: red;
		font-size: 0.875rem;
	}
</style>
```

## API Integration

### Fetch with Loading State
```typescript
<script lang="ts">
	interface User {
		id: number;
		name: string;
		email: string;
	}

	let users = $state<User[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function fetchUsers() {
		loading = true;
		error = null;

		try {
			const response = await fetch('/api/users');
			if (!response.ok) throw new Error('Failed to fetch');
			users = await response.json();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	// Fetch on mount
	$effect(() => {
		fetchUsers();
	});
</script>

{#if loading}
	<p>Loading...</p>
{:else if error}
	<p class="error">{error}</p>
{:else}
	<ul>
		{#each users as user (user.id)}
			<li>{user.name} ({user.email})</li>
		{/each}
	</ul>
{/if}
```

### Paginated Data
```typescript
<script lang="ts">
	let page = $state(1);
	let pageSize = 10;
	let items = $state<any[]>([]);
	let totalPages = $state(1);

	async function loadPage(pageNum: number) {
		const response = await fetch(`/api/items?page=${pageNum}&size=${pageSize}`);
		const data = await response.json();
		items = data.items;
		totalPages = data.totalPages;
		page = pageNum;
	}

	$effect(() => {
		loadPage(page);
	});
</script>

<div class="pagination">
	<button onclick={() => loadPage(page - 1)} disabled={page === 1}>
		Previous
	</button>
	<span>Page {page} of {totalPages}</span>
	<button onclick={() => loadPage(page + 1)} disabled={page === totalPages}>
		Next
	</button>
</div>
```

## Animation Patterns

### Fade Transition
```typescript
<script lang="ts">
	import { fade } from 'svelte/transition';
	let visible = $state(true);
</script>

<button onclick={() => visible = !visible}>Toggle</button>

{#if visible}
	<div transition:fade={{ duration: 300 }}>
		Fading content
	</div>
{/if}
```

### List Animations
```typescript
<script lang="ts">
	import { flip } from 'svelte/animate';
	import { fade } from 'svelte/transition';

	let items = $state([
		{ id: 1, text: 'First' },
		{ id: 2, text: 'Second' },
		{ id: 3, text: 'Third' }
	]);

	function shuffle() {
		items = items.sort(() => Math.random() - 0.5);
	}
</script>

<button onclick={shuffle}>Shuffle</button>

{#each items as item (item.id)}
	<div animate:flip={{ duration: 300 }} transition:fade>
		{item.text}
	</div>
{/each}
```

## Advanced Patterns

### Portal/Teleport Pattern
```typescript
<script lang="ts">
	import { onMount } from 'svelte';

	let portal: HTMLElement | null = null;
	let show = $state(false);

	onMount(() => {
		portal = document.getElementById('portal-target');
	});
</script>

<button onclick={() => show = !show}>Toggle Modal</button>

{#if show && portal}
	{@html ''}
	<div class="modal">
		<h2>Modal Content</h2>
		<button onclick={() => show = false}>Close</button>
	</div>
{/if}
```

### Context API
```typescript
<!-- Parent.svelte -->
<script lang="ts">
	import { setContext } from 'svelte';

	interface Theme {
		primaryColor: string;
		fontSize: number;
	}

	const theme: Theme = {
		primaryColor: '#007bff',
		fontSize: 16
	};

	setContext('theme', theme);
</script>

<slot />

<!-- Child.svelte -->
<script lang="ts">
	import { getContext } from 'svelte';

	interface Theme {
		primaryColor: string;
		fontSize: number;
	}

	const theme = getContext<Theme>('theme');
</script>

<div style="color: {theme.primaryColor}; font-size: {theme.fontSize}px">
	Themed content
</div>
```

### Store Integration
```typescript
<script lang="ts">
	import { writable, derived } from 'svelte/store';

	// Create stores
	const count = writable(0);
	const doubled = derived(count, $count => $count * 2);

	// Auto-subscribe with $
	// No need for unsubscribe - Svelte handles it
</script>

<button onclick={() => $count++}>
	Count: {$count} (Doubled: {$doubled})
</button>
```

## Tags
#svelte5 #snippets #reactivity #examples #templates #patterns #state-management #effects #forms #api #animation
