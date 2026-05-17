# Svelte 5 Runes & Reactivity Reference Manual

This official reference manual provides detailed specifications, rules, and examples for Svelte 5 reactivity runes, custom snippets, and reactive event bindings, optimized for high-performance frontend engineering.

---

## 1. Core Reactivity Runes

### A. `$state`
The `$state` rune declares a reactive state variable. It replaces traditional `let` bindings that were compiled to reactive variables in Svelte 4.

```svelte
<script>
  // Simple reactive state
  let count = $state(0);

  // Object-level and array-level deep reactivity
  let user = $state({
    name: 'James',
    role: 'Operator'
  });

  function increment() {
    count += 1;
  }
</script>

<button onclick={increment}>Count: {count}</button>
```

### B. `$derived`
The `$derived` rune declares a reactive derivation that automatically recomputes when its dependencies change. This replaces the traditional reactive statement `$:`.

```svelte
<script>
  let width = $state(10);
  let height = $state(20);

  // Derived reactive value
  let area = $derived(width * height);
</script>

<p>Dimensions: {width}x{height} | Area: {area}</p>
```

### C. `$props`
The `$props` rune declares component properties. It replaces Svelte 4's `export let` syntax. Properties can be destructured with default values.

```svelte
<script>
  // Destructuring props with default values
  let { title = 'Default Title', active = false } = $props();
</script>

<div class:active={active}>
  <h3>{title}</h3>
</div>
```

---

## 2. Snippets and Render Functions

Svelte 5 replaces slots (`<slot />`) with much more flexible, parameterizable **Snippets**. Snippets act like inline, reusable markup templates.

```svelte
{#snippet userCard(userInfo)}
  <div class="card">
    <h4>{userInfo.name}</h4>
    <p>Role: {userInfo.role}</p>
  </div>
{/snippet}

<!-- Using the snippet locally -->
{@render userCard({ name: 'James', role: 'Operator' })}
```

---

## 3. Event Handling

In Svelte 5, custom event handlers use standard HTML attribute naming conventions (`onclick`, `onmouseenter`) rather than the legacy `on:click` syntax.

```svelte
<script>
  let { onsave } = $props();
</script>

<!-- Clean, standard native event binding -->
<button onclick={() => onsave({ id: 1 })}>Save Settings</button>
```
