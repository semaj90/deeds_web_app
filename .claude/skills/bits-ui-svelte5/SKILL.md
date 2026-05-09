---
name: bits-ui-svelte5
description: Use when implementing Svelte 5 UI components with Bits UI v2 primitives. Covers runes-only patterns, the `child` snippet, common Bits UI components, and the SSR-safety rules specific to this project.
---

# Bits UI + Svelte 5

This project is Svelte 5 runes only and Bits UI v2.16.2 only. Old
patterns from Svelte 4 / Bits UI v1 will fail svelte-check or break
SSR silently. Always use the patterns below.

## Runes-only

| Old (Svelte 4) | New (Svelte 5) |
|----------------|----------------|
| `export let x` | `let { x } = $props()` |
| `$: doubled = x * 2` | `let doubled = $derived(x * 2)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| `on:click={fn}` | `onclick={fn}` |
| `<slot>` | `{#snippet children()}{/snippet}` + `{@render children()}` |
| `writable()` store in `.svelte` | `$state(...)` directly |

`$derived(() => ...)` returns a function — for blocks use `$derived.by(() => { ...; return result })`.

## Bits UI v2 essentials

```svelte
<script lang="ts">
  import { Dialog, ScrollArea, Select } from 'bits-ui';
  let open = $state(false);
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description</Dialog.Description>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

Transitions use `forceMount` + `child` snippet:

```svelte
<Dialog.Overlay forceMount>
  {#snippet child({ props, open })}
    {#if open}<div {...props} transition:fade>overlay</div>{/if}
  {/snippet}
</Dialog.Overlay>
```

Other v1 → v2 changes:
- `multiple={true}` → `type="multiple"`
- `el` → `ref`
- `asChild` → `child` snippet (spread `{...props}` onto your element)
- `let:` directives → `{#snippet child({ props, open })}`

## SSR landmines

- **bits-ui Dialog SSR TDZ**: bits-ui v2.16.2 Dialog uses `let props = $props()` which triggers TDZ in Svelte 5.46.0 SSR. Routes that render `<Dialog>` at SSR time need `export const ssr = false`.
- **Browser-only APIs** (`window`, `document`, `localStorage`, IndexedDB) need `onMount(() => {...})` or `typeof window !== 'undefined'` guards in mixed routes.
- **Global `$state` in `.svelte.ts`** persists across SSR requests on the server — use `event.locals` for per-request state, never a module-level singleton with user data.

## Project-specific rules

- `import Button from '$lib/components/ui/Button.svelte'` — default import, not named.
- Icons: `import Icon from '$lib/components/ui/Icon.svelte'` + `<Icon name="kebab-name" />` (UnoCSS `i-lucide-*` under the hood). `@lucide/svelte` was removed.
- `{@const}` placement: must be a **direct child** of `{#if}` / `{:else if}` / `{#each}` — putting it inside a `<div>` is a parse error.
- Form handling: superforms v2 + Zod. `import { superValidate, fail } from 'sveltekit-superforms'` (NOT `@sveltejs/kit`).

## Anti-patterns

- Using `melt-ui` builders directly — use bits-ui's wrapped components.
- Hand-rolling accessibility primitives that Bits UI already implements.
- Mutating props inside a child component — use callback props or `$bindable()`.
- Mixing UnoCSS utility classes with raw Tailwind classes — pick one (this project uses UnoCSS).

## Related skills

- [uno-css-design-system](../uno-css-design-system/SKILL.md) for styling conventions.
- [trace-mcp-tooling](../trace-mcp-tooling/SKILL.md) when wiring components to backend data via MCP.
