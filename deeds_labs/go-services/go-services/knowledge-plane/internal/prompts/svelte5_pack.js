/**
 * Phase 88: Svelte 5 / SvelteKit 2 Prompt Pack
 *
 * Enforces modern framework conventions via retrieval + prompt engineering.
 * Used by Knowledge Plane /compose_prompt to inject context-aware policies.
 */

export const SVELTE5_PROMPT_PACK = {
	// Core policy: ban legacy patterns
	framework_policy: `
## Framework Assumptions (NON-NEGOTIABLE)

### Svelte 5 (Runes-First Reactivity)
- **ALWAYS use runes**: \`$state\`, \`$derived\`, \`$effect\`, \`$props\`
- **NEVER use**: \`export let\` (legacy Svelte 3/4), \`$:\` (reactive statements), lifecycle hooks directly
- **Component state**: \`let count = $state(0)\` NOT \`export let count = 0\`
- **Derived values**: \`let doubled = $derived(count * 2)\` NOT \`$: doubled = count * 2\`
- **Side effects**: \`$effect(() => { ... })\` NOT \`$: { ... }\`
- **Props**: \`let { name, age = 0 } = $props()\` NOT \`export let name; export let age = 0\`

### SvelteKit 2 (File-Based Routing)
- **Routes**: \`+page.svelte\`, \`+page.server.ts\`, \`+layout.svelte\`, \`+server.ts\`
- **Load functions**: \`export const load\` in \`+page.server.ts\` (server) or \`+page.ts\` (universal)
- **Actions**: \`export const actions\` in \`+page.server.ts\` for form handling
- **Route params**: \`[slug]\` for dynamic segments, \`[...rest]\` for rest params
- **NEVER use**: \`__layout.svelte\`, \`index.svelte\`, \`.svelte\` without \`+\` prefix

### Bits UI (Svelte 5-Compatible Headless Components)
- **Prefer Bits UI** over custom Dialog/Dropdown/Popover implementations
- **Import pattern**: \`import { Dialog } from 'bits-ui'\`
- **Composition**: Use builder pattern with \`<Dialog.Root>\`, \`<Dialog.Content>\`, \`<Dialog.Trigger>\`
- **Accessibility**: Bits UI handles ARIA, focus trapping, keyboard nav automatically

### UnoCSS (Atomic Utility-First)
- **Prefer atomic utilities**: \`class="flex items-center gap-2 p-4 bg-primary text-white"\`
- **AVOID global CSS** unless absolutely necessary (use \`uno.config.ts\` presets instead)
- **Dynamic classes**: Use \`class:active={isActive}\` NOT inline styles

### Drizzle ORM (TypeScript-First SQL)
- **Schema definition**: \`pgTable\`, \`serial\`, \`text\`, \`timestamp\`, etc.
- **Queries**: \`db.select().from(table).where(eq(table.id, id))\`
- **Migrations**: Use \`drizzle-kit generate\` and \`drizzle-kit push\`
- **NEVER write raw SQL** unless using \`db.execute(sql\`...\`)\`

### PostgreSQL 17 + pgvector
- **Vector ops**: \`<->\` (cosine distance), \`<#>\` (inner product), \`<+>\` (L1 distance)
- **Indexes**: \`CREATE INDEX ON table USING hnsw (embedding vector_cosine_ops)\`
- **NEVER use**: \`ORDER BY embedding <-> query_vec LIMIT 10\` without HNSW index (slow!)

## Citation Requirement
When using knowledge retrieved from KB:
- ALWAYS cite chunk IDs: \`// Source: chunk_abc123 (svelte5:docs)\`
- If conflict between KB and your training data, **KB WINS**
`,

	// Prompt templates for common tasks
	templates: {
		component_generation: `
You are generating a Svelte 5 component. Follow these rules:

1. **Use runes exclusively**: \`$state\`, \`$derived\`, \`$effect\`, \`$props\`
2. **Check KB first**: Search for similar patterns in \`svelte5:docs\` or \`bits-ui:docs\`
3. **Prefer Bits UI**: For Dialog, Dropdown, Popover, Tooltip, Accordion, etc.
4. **Style with UnoCSS**: Atomic utilities only, no \`<style>\` blocks unless critical

Example scaffold:
\`\`\`svelte
<script lang="ts">
  import { Dialog } from 'bits-ui';

  let { title, open = $bindable(false) } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log('Count changed:', count);
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger class="btn btn-primary">
    {title}
  </Dialog.Trigger>
  <Dialog.Content class="p-6 bg-white rounded-lg">
    <p>Count: {count} (Doubled: {doubled})</p>
    <button class="btn" onclick={() => count++}>Increment</button>
  </Dialog.Content>
</Dialog.Root>
\`\`\`
`,

		route_generation: `
You are generating a SvelteKit 2 route. Follow these rules:

1. **File structure**: \`+page.svelte\` (UI), \`+page.server.ts\` (data/actions), \`+layout.svelte\` (shared)
2. **Load function**: \`export const load\` returns data for \`$page.data\`
3. **Actions**: \`export const actions = { default: async ({ request }) => { ... } }\`
4. **DB queries**: Use Drizzle ORM, never raw SQL strings

Example scaffold:
\`\`\`typescript
// +page.server.ts
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const load = async ({ params }) => {
  const user = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
  return { user: user[0] };
};

export const actions = {
  update: async ({ request }) => {
    const data = await request.formData();
    // ... validation + update
    return { success: true };
  }
};
\`\`\`

\`\`\`svelte
<!-- +page.svelte -->
<script lang="ts">
  let { data } = $props();
  let user = $state(data.user);
</script>

<h1>{user.name}</h1>
<form method="POST" action="?/update">
  <input name="name" value={user.name} />
  <button type="submit">Update</button>
</form>
\`\`\`
`,

		vector_search: `
You are implementing vector search with pgvector. Follow these rules:

1. **Always use HNSW index**: \`CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops)\`
2. **Cosine distance**: \`ORDER BY embedding <-> $1\` (operator is \`<->\` NOT \`<>\`)
3. **Limit results**: \`LIMIT 10\` (HNSW is approximate, more results = slower)
4. **Generate embeddings**: Use Ollama \`embeddinggemma:latest\` or OpenAI \`text-embedding-3-small\`

Example scaffold:
\`\`\`typescript
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export async function searchKnowledge(query: string, limit = 10) {
  // 1. Generate embedding
  const embedding = await generateEmbedding(query);

  // 2. Query with cosine distance
  const results = await db.execute(sql\`
    SELECT id, content, tags,
           embedding <-> \${embedding}::vector AS distance
    FROM kb_chunks
    ORDER BY distance
    LIMIT \${limit}
  \`);

  return results.rows;
}
\`\`\`
`
	},

	// Retrieval hints (what to search for before generating)
	retrieval_hints: {
		component: ['svelte5:docs:runes', 'bits-ui:docs:components', 'svelte5:examples'],
		route: ['sveltekit2:docs:routing', 'sveltekit2:docs:load', 'sveltekit2:docs:actions'],
		database: ['drizzle:docs:queries', 'postgres17:docs:syntax', 'pgvector:docs:operators'],
		styling: ['unocss:docs:utilities', 'unocss:docs:presets']
	},

	// Error pattern fixes (common migrations)
	error_fixes: {
		'export let': {
			pattern: /export\s+let\s+(\w+)/g,
			fix: 'let { $1 } = $props()',
			reason: 'Svelte 5 uses $props() instead of export let'
		},
		'reactive statement': {
			pattern: /\$:\s+(.+)/g,
			fix: 'let result = $derived($1)',
			reason: 'Svelte 5 uses $derived() instead of $: reactive statements'
		},
		'onMount': {
			pattern: /onMount\((.+)\)/g,
			fix: '$effect(() => { $1 })',
			reason: 'Svelte 5 uses $effect() instead of onMount()'
		}
	}
};

// Export as JSON for API consumption
export const SVELTE5_PROMPT_PACK_JSON = JSON.stringify(SVELTE5_PROMPT_PACK, null, 2);
