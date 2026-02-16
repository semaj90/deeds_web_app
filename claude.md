# Legal AI Platform — Claude Project Instructions

## Last Updated: February 16, 2026 (Session 35)
## Status: svelte-check 0 errors, 2 warnings (down from 19,666+)

---

## IDE Linter Warning

VS Code ESLint/Prettier auto-reformats files on disk change, sometimes reverting Edit tool changes.

**Workarounds** (ranked by reliability):
1. **Write tool** for full file rewrites (linter reformats style only, not logic)
2. **Batch edits** into single Write instead of multiple Edits
3. **Re-read after Edit** to verify changes survived
4. **Detection**: "file was modified by user or linter" system reminder = linter reverted

See `memory/ide-linter-workarounds.md` for full details.

---

## Technology Stack

- **Frontend**: SvelteKit 2 + Svelte 5 (runes) + bits-ui v2.15.5 + UnoCSS (svelte-scoped)
- **Forms**: sveltekit-superforms v2 + Zod validation
- **Local Cache**: IndexedDB + Loki.js
- **Server Cache**: Redis (SSR pages + sessions)
- **Database**: PostgreSQL 16 + Drizzle ORM 0.44 + pgvector
- **Vector DB**: Qdrant (GPU-accelerated)
- **AI Models**: Ollama (`embeddinggemma:latest` + `gemma3-legal:latest`)
- **Real-Time**: Server-Sent Events (SSE)
- **State Machines**: XState v5
- **Message Queue**: RabbitMQ

---

## Svelte 5 Runes (REQUIRED — No Svelte 4 Patterns)

```typescript
// State
let count = $state(0);
let user = $state({ name: '', email: '' });

// Derived (simple expression)
let doubled = $derived(count * 2);

// Derived (complex — use $derived.by for blocks)
let filtered = $derived.by(() => { /* complex logic */ return result; });

// Effects
$effect(() => { console.log(count); });

// Props
let { value, onChange }: Props = $props();
```

**Svelte 4 → 5 mapping:**
| Svelte 4 | Svelte 5 |
|----------|----------|
| `export let x` | `let { x } = $props()` |
| `$: doubled = x * 2` | `let doubled = $derived(x * 2)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| `on:click={fn}` | `onclick={fn}` |
| `<slot>` | `{#snippet children()}{/snippet}` + `{@render children()}` |
| `writable()` stores | `$state()` in `.svelte.ts` files |

---

## Bits UI v2 Import Patterns

```typescript
// Namespace imports from main entry
import { Accordion, Dialog, Select, Checkbox } from "bits-ui";

// Usage
<Dialog.Root>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Content>
    {#snippet children()}
      <div transition:fade>Content</div>
    {/snippet}
  </Dialog.Content>
</Dialog.Root>
```

**Key v1 → v2 changes:**
- Transition props removed — use Svelte 5 transitions in snippets
- `let:` directives → `{#snippet children({ data })}` for data exposure
- `multiple={true}` → `type="multiple"` (Accordion/Select)
- `el` → `ref` for element binding
- `asChild` → `child` snippet
- Local wrapper components are obsolete — import bits-ui directly
- Use bits-ui component API, NOT melt-ui builders directly

**Button**: Default import: `import Button from '$lib/components/ui/Button.svelte'`

---

## UnoCSS Configuration

Config at `sveltekit-frontend/unocss.config.ts`. Svelte-scoped mode via `@unocss/svelte-scoped/vite`.

**Theme colors**: sand, sandDark, panel, panelSoft, accent, accentSoft, danger, warning, info
**Shortcuts**: `app-bg`, `panel`, `btn-base`, `btn-primary`, `tag`

```css
/* CSS class syntax — NO spaces before pseudo-class colons */
hover:bg-accent focus:border-blue-500 disabled:opacity-50
```

---

## Superforms v2

```typescript
// Server: import from sveltekit-superforms (NOT @sveltejs/kit)
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

// Client
const { form, errors, enhance, delayed } = superForm(data.form, {
  validators: zodClient(schema),
  dataType: 'form', // Required for file uploads
});

// File upload: use fileProxy
const file = fileProxy(form, 'file');
```

See `memory/superforms-reference.md` for full patterns.

---

## Database Migration Safety

**CRITICAL: Always use `drizzle-kit migrate` (not `push`) on databases with real data.**

**STOP if you see:**
```
Warning: You're about to delete kg_nodes table with 2764 items
```
Answer NO or Ctrl+C immediately. Drizzle marks tables not in schema for deletion.

**Safe approaches:**
1. Add missing tables to schema (prevents deletion)
2. Use `tablesFilter` in drizzle.config.ts: `['!phase89_*', '!kg_*']`
3. Use `introspect` to auto-generate schema from DB
4. Raw SQL for simple changes: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

**Table rename pro-tip:** Drizzle generates DROP+CREATE for renames. Edit the SQL to `ALTER TABLE "old" RENAME TO "new"` before running migrate.

**Pre-flight checklist:** Review SQL for DROP statements, verify schema includes all existing tables, test on dev first.

---

## tsconfig Services Exclude (CRITICAL)

`src/lib/services/**` is **blanket-excluded** — 312 of 564 service files are corrupted (20K+ errors if included).

**Clean services ARE type-checked** — TypeScript's `exclude` only affects file discovery. Files imported by routes/components are checked transitively.

**DO NOT remove the blanket exclude** unless most corrupted files are cleaned first.

---

## Phase 99 Corruption Reference

Commit `0a2bd98929` corrupted 83 `.svelte` files via auto-migration tool. Clean versions at `fa8498dc4a`. Only ~5 imported by active routes. DO NOT run the Phase 99 tool again.

See `memory/corruption-patterns.md` for detection patterns and fix strategies.

---

## Drizzle ORM 0.44 (PostgreSQL 16 + pgvector)

**Main schema**: `src/lib/server/db/schema-postgres.ts` (70+ tables, 14 enums)

```typescript
// Imports — use .js extension (bundler resolves .js → .ts)
import { users, cases, evidence, caseStatusEnum } from '$lib/server/db/schema-postgres.js';
import type { User, NewUser } from '$lib/server/db/schema-postgres.js';
import { eq, desc, and, or, sql } from 'drizzle-orm';

// Type inference: $inferSelect (read) / $inferInsert (write)
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;

// Common query patterns
const result = await db.select().from(cases).where(eq(cases.status, 'open'));
const [newCase] = await db.insert(cases).values({ title, status: 'open', priority: 'medium' }).returning();
await db.update(cases).set({ status: 'closed' }).where(eq(cases.id, caseId));
```

**Key enums**: `userRoleEnum`, `caseStatusEnum`, `casePriorityEnum`, `evidenceTypeEnum`, `documentTypeEnum`, `documentStatusEnum`, `patchStatusEnum`, `threatLevelEnum`

**Core table groups**: Auth (users, sessions), Cases (cases, caseNotes, caseStatuteLinks), Evidence (evidence, evidenceRelationships), Documents (documents, legalDocuments, documentChunks), Legal (citations, statutes, statuteChunks, legalPrecedents), RAG (ragSessions, ragMessages), Embeddings (6 vector tables, 768 dims), Workspaces, Route Health, Error Tracking

See `memory/drizzle-schema-reference.md` for full table reference.

---

## Route Map

**App routes** (23 — `src/routes/(app)/`): active-cases, admin/*, ai-dashboard, all-routes (SSE), analysis-center, cases, citations, command-center, dashboard, error-brain, evidence, evidence-library, global-search, gpu-evidence-graph, persons-of-interest, phase78, system-configuration, terminal

**API routes** (43 — `src/routes/api/`): auth, cases, chat, citations, embed, evidence, health, indexing, kb, knowledge, ollama, persons, rag (search/validate/answer), reports, routes (SSE), sse, stream, summarize, topology, tools, and more

See `memory/drizzle-schema-reference.md` for full route map.

---

## XState v5 Patterns

```typescript
// Runtime functions — NOT types
import { assign, createMachine, fromPromise } from 'xstate';

// Svelte 5 integration
import { useMachine } from '$lib/utils/xstate-svelte5';
const { snapshot, send } = useMachine(myMachine);
const isLoading = $derived(snapshot.matches('loading'));
```

---

## Graceful Error Handling Pattern (Session 35)

All page server load functions use graceful degradation instead of `throw error(500)`:

```typescript
// safe() helper — wraps DB queries to prevent 500s
const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

// Usage in load functions
const rows = await safe(
  db.select().from(table).where(eq(table.id, id)).limit(1),
  []
);

// Return loadError instead of throwing
if (!rows[0]) {
  return { data: null, loadError: 'Not found or database unavailable' };
}
return { data: rows[0], loadError: null };
```

**Rules:**
- `throw redirect()` is still correct for auth guards
- `throw error(404)` → return `{ data: null, loadError: '...' }` for missing records
- `throw error(500)` → NEVER in catch blocks; use `safe()` + `loadError` field
- API routes (`+server.ts`) can still return error JSON responses — this pattern is for page loads

---

## Test Scripts

**NEVER delete working scripts.** Move them to `scripts/tests/` if they're in the wrong place. We keep scripts that worked — we might need them later.

```bash
# Quick test (7 core routes) — requires dev server running
node scripts/tests/test-screenshots.mjs

# All app routes (23 routes)
node scripts/tests/test-screenshots.mjs --all

# Single route
node scripts/tests/test-screenshots.mjs --route /evidence

# Custom port
node scripts/tests/test-screenshots.mjs --port 3000
```

Outputs timestamped screenshots + JSON report to `scripts/tests/screenshots/`. Latest run always copied to `scripts/tests/screenshots/latest/`.

---

## Key Lessons (Proven Patterns)

- **$derived vs $derived.by**: `$derived(() => {...})` returns a function. Use `$derived.by(() => {...})` for complex computations
- **TS imports in SvelteKit**: Use `.js` extensions not `.ts` (bundler resolves `.js` → `.ts`)
- **bits-ui Tabs SSR**: `Record<string, any>` cast passes svelte-check but causes SSR 500. Use native `$state`-based tabs
- **CouchDB client**: `put(db, docId, doc)` = 3 args; `post(db, doc)` = 2 args; no `find` method — use `allDocs` + filter
- **Qdrant filter**: `match: { value: someVar }` not `match: { value, someVar }` — shorthand fails when var name != `value`
- **ioredis v5 types**: DO NOT add `declare module 'ioredis'` augmentations — they shadow bundled types
- **amqplib**: Named/namespace imports fail with `moduleResolution: "bundler"`. Use local interfaces + dynamic `await import('amqplib')`
- **Corrupted files <50 lines**: Need complete rewrites, not incremental fixes
- **IDE linter reverts**: Use Write tool (not Edit) for reliable file modifications

---

## Reference Docs

- `memory/drizzle-schema-reference.md` — 70+ tables, 14 enums, type patterns, route map
- `memory/architecture-reference.md` — DB tiers, JSONB, caching strategy, vector search
- `memory/docker-cuda-setup.md` — Docker, CUDA, GPU acceleration, FlashAttention
- `memory/corruption-patterns.md` — All 8 corruption patterns + detection commands
- `memory/superforms-reference.md` — Superforms v2 full API patterns
- `memory/ide-linter-workarounds.md` — VS Code linter revert strategies
- `memory/session-history.md` — Full session-by-session changelog (sessions 1-35)
- `scripts/tests/test-screenshots.mjs` — Playwright visual regression / 500-error tester

Sources:
- [Bits UI Docs](https://bits-ui.com/) | [Migration Guide](https://bits-ui.com/docs/migration-guide)
- [Svelte 5 Runes](https://svelte.dev/blog/runes) | [Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [UnoCSS Svelte Scoped](https://unocss.dev/integrations/svelte-scoped) | [SvelteKit Setup](https://frontavo.com/blog/setting-up-unocss-with-sveltekit)
- [Superforms Docs](https://superforms.rocks/) | [File Uploads](https://superforms.rocks/concepts/files)
