---
paths:
  - "sveltekit-frontend/src/routes/**"
  - "sveltekit-frontend/src/lib/components/**"
  - "sveltekit-frontend/src/lib/stores/**"
  - "sveltekit-frontend/src/lib/machines/**"
---

# Svelte 5 / SvelteKit rules

## Required patterns (Svelte 5 runes only)
```svelte
<!-- Props -->
let { value, onChange }: Props = $props();

<!-- State -->
let count = $state(0);
let items = $state<Item[]>([]);

<!-- Derived (simple) -->
let doubled = $derived(count * 2);

<!-- Derived (complex) -->
let filtered = $derived.by(() => items.filter(x => x.active));

<!-- Effects -->
$effect(() => { console.log(count); });

<!-- Events -->
<button onclick={fn}>click</button>

<!-- Snippets (not slots) -->
{#snippet children()}{/snippet}
{@render children()}
```

## Forbidden (Svelte 4)
- `export let x` → use `let { x } = $props()`
- `$: derived` → use `$derived`
- `$: { sideEffect() }` → use `$effect`
- `on:click={fn}` → use `onclick={fn}`
- `<slot>` → use `{#snippet}` + `{@render}`
- `writable()` stores in `.svelte` files → use `$state()`

## Imports
- Bits UI: `import { Dialog, Select, Accordion } from 'bits-ui'`
- Button: `import Button from '$lib/components/ui/Button.svelte'`
- Icons: `import Icon from '$lib/components/ui/Icon.svelte'` + `<Icon name="kebab-name" />`
- Forms: `import { superValidate } from 'sveltekit-superforms'` + `import { zod } from 'sveltekit-superforms/adapters'`

## SSR classification
- SSR-safe: components using only `load()` data, no browser globals
- Client-only: Canvas/WebGL/WebGPU, `window.*`, `localStorage` → `export const ssr = false`
- Mixed: guard browser code with `onMount()` or `typeof window !== 'undefined'`
