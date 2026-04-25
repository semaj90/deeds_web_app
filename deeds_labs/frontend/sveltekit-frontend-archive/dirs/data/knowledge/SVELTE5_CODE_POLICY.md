# Svelte 5 / SvelteKit 2 / Bits-UI Code Generation Policy

## ALWAYS Enforce (Non-Negotiable)

### Svelte 5 Runes (NOT Svelte 3/4 patterns)
- ✅ `let count = $state(0)` — reactive state
- ✅ `let doubled = $derived(count * 2)` — computed values
- ✅ `$effect(() => { ... })` — side effects
- ✅ `let { prop1, prop2 } = $props()` — component props
- ❌ NEVER `export let count = 0` — this is Svelte 3/4 syntax
- ❌ NEVER `$: doubled = count * 2` — this is reactive statement syntax (replaced by `$derived`)
- ❌ NEVER `onMount(() => { ... })` unless truly necessary (prefer `$effect`)

### SvelteKit 2 Routing
- ✅ `+page.svelte`, `+page.server.ts`, `+layout.svelte`, `+layout.server.ts`
- ✅ `export async function load({ params, fetch }) { ... }` in `+page.server.ts`
- ✅ `export const actions = { default: async ({ request }) => { ... } }` for forms
- ✅ Use `$app/navigation` for `goto`, `invalidate`, `invalidateAll`
- ❌ NEVER old routing patterns like `__layout.svelte` or page endpoints without `+`

### Bits-UI Components (Svelte 5 compatible)
- ✅ Import from `bits-ui`: `import { Dialog, Button, Select } from 'bits-ui'`
- ✅ Use headless components with runes: `<Dialog.Root bind:open={$state(false)}>`
- ✅ Compose with UnoCSS utilities: `<Dialog.Title class="text-xl font-bold">`
- ❌ NEVER mix with full UI frameworks like shadcn-svelte unless explicitly requested

### Styling
- ✅ Prefer UnoCSS utilities: `class="flex items-center gap-2"`
- ✅ Scoped component styles: `<style>` tags are still valid
- ❌ Avoid global CSS frameworks (Bootstrap, Tailwind) unless specified

### Database & ORM
- ✅ Drizzle ORM 0.44+ syntax: `db.select().from(users).where(eq(users.id, userId))`
- ✅ Postgres 17 features: pgvector HNSW indexes, generated columns
- ✅ pgvector operators: `<=>` (cosine distance), `<->` (L2 distance), `<#>` (inner product)
- ❌ NEVER assume MySQL or older Postgres syntax

### TypeScript
- ✅ `.svelte.ts` files for shared reactive state
- ✅ Type-safe props: `interface Props { count: number; onChange?: (n: number) => void; }`
- ✅ Use `import type` for type-only imports

## Retrieval Priority

When generating code:

1. **Always retrieve from KB first**: Use `knowledge_retrieve` tool with query like "Svelte 5 runes state" or "SvelteKit 2 load function"
2. **Cite chunk IDs**: Include `// Source: chunk-abc123` in generated code
3. **Prefer official docs over guesses**: If retrieval returns Svelte docs, use that pattern exactly
4. **Fallback to codebase examples**: If no docs, search codebase for similar patterns with `ripgrep`

## Example Queries for Agent

```javascript
// Before generating a component:
await knowledgeRetrieve({
  query: "Svelte 5 component props runes $props",
  k: 5,
  tags: ["svelte5", "docs"]
});

// Before creating a load function:
await knowledgeRetrieve({
  query: "SvelteKit 2 +page.server.ts load function",
  k: 3,
  tags: ["sveltekit2", "docs"]
});

// Before using Bits-UI:
await knowledgeRetrieve({
  query: "Bits UI Dialog Svelte 5 open state",
  k: 5,
  tags: ["bits-ui", "docs"]
});
```

## Anti-Patterns to Reject

If retrieval returns Svelte 3/4 patterns, **DO NOT USE THEM**. Instead:

- Old: `export let count = 0` → New: `let { count = 0 } = $props()`
- Old: `$: doubled = count * 2` → New: `let doubled = $derived(count * 2)`
- Old: `onMount(() => { ... })` → New: `$effect(() => { ... })` (or keep `onMount` if truly lifecycle-specific)
- Old: `<script context="module">` → New: `.svelte.ts` file for shared state

## Prompt Pack Template

When composing prompts (Knowledge Plane `/compose_prompt`), prepend:

```
SYSTEM POLICY:
- Assume Svelte 5 (runes). Use $state, $derived, $effect, $props.
- Assume SvelteKit 2 routing (+page.svelte, +page.server.ts, actions).
- For UI, prefer Bits-UI + UnoCSS.
- For DB, assume Postgres 17 + Drizzle 0.44 + pgvector HNSW.
- ALWAYS retrieve from knowledge base before generating code.
- If docs conflict with guess, cite docs chunk ID and prefer docs.
- NEVER use Svelte 3/4 patterns like `export let` or `$:`.
```

## Verification

After generating code, the agent should:

1. Run `read_file` to check existing patterns
2. Run `ripgrep` to find similar examples in codebase
3. Run `knowledge_retrieve` to validate against docs
4. If mismatch, regenerate with correct pattern

This ensures "Gemma3 behaves Svelte 5-first" via retrieval + prompt grounding, not model retraining.
