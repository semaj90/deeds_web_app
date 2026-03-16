# Agentic Module Wiring — Missing Import Resolver

You are running an automated analysis to find and fix missing module wiring in the SvelteKit 2 + Svelte 5 + Drizzle ORM 0.44 codebase.

## Target: `$ARGUMENTS`

If no argument, scan all `src/routes/` and `src/lib/` for broken import chains.
If a file/directory is given, analyze that scope.

## Phase 1: Discover Broken Imports

For each `.svelte`, `.svelte.ts`, or `.ts` file in scope:
1. Extract all `import ... from '...'` statements
2. Verify the target file exists (resolve `$lib/` → `src/lib/`, `.js` → `.ts`)
3. If target is missing → **BROKEN IMPORT**
4. If target exists but the exported symbol doesn't match → **STALE IMPORT**
5. If a `fetch('/api/...')` helper exists, verify a rendered consumer, lifecycle hook, or machine transition can actually trigger it

Also check:
- `fetch('/api/...')` calls → verify corresponding `+server.ts` route exists
- Dynamic `import('...')` → verify target module exists
- Type-only imports → verify the type is actually exported

## Phase 2: Classify Each Issue

| Category | Description | Fix Strategy |
|----------|-------------|-------------|
| **MISSING_FILE** | Import target doesn't exist | Create stub or find replacement |
| **MISSING_EXPORT** | File exists but named export is gone | Update import to correct export |
| **MISSING_API_ROUTE** | `fetch('/api/...')` calls non-existent route | Create `+server.ts` stub |
| **SHALLOW_TRIGGER** | API route exists but no rendered UI path can invoke it | Wire handler into rendered UI/lifecycle, or archive dead path |
| **DEAD_CHAIN** | File imported → function defined → fetch call exists, but the call is never reachable from any rendered element, lifecycle hook, or machine transition | Trace back from fetch: if no onclick/onMount/$effect/XState actor invokes the function, mark DEAD_CHAIN |
| **DUPLICATE_IMPL** | Two files implement the same feature (same basename or overlapping API) | Keep the richer/actively-imported version, archive the other |
| **STALE_TYPE** | Type import references removed/renamed type | Update type import |
| **CIRCULAR** | Circular dependency detected | Refactor to break cycle |

## Phase 3: Report

Output a markdown table:
| File | Line | Import | Issue | Category | Suggested Fix |

## Phase 4: Fix (if user confirms)

For each issue:

### MISSING_API_ROUTE — Create route stubs
```typescript
// src/routes/api/ROUTE/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({ error: 'Not implemented' }, { status: 501 });
};
```

### MISSING_EXPORT — Update import
Find the correct export name in the target file and update the import.

### STALE_TYPE — Fix type reference
Find the renamed/moved type and update the import path.

## SvelteKit 2 Module Resolution Rules

- `$lib/` → `src/lib/` (configured in `svelte.config.js`)
- `.js` extension in imports → TypeScript bundler resolves to `.ts`
- Exception: `$lib/server/db/client` — NO `.js` extension (named export issue)
- `$app/environment`, `$app/navigation`, `$app/state` — SvelteKit built-ins
- `.svelte.ts` files can use runes (`$state`, `$derived`)
- `.ts` files CANNOT use runes — use plain TypeScript patterns
- Server-only: `.server.ts` suffix prevents client import

## Drizzle ORM 0.44 Type Safety

- Schema types: `typeof table.$inferSelect` / `typeof table.$inferInsert`
- Column types: `vector(768)` → `number[]` (NOT `string`)
- Import from: `$lib/server/db/schema-postgres.js` (with .js)
- DB client: `$lib/server/db/client` (without .js)
- Enums: defined in schema, import as values not types

## Svelte 5 Runes Checks

- `$props()` — must destructure: `let { x } = $props()`
- `$state()` — only in `.svelte` or `.svelte.ts` files
- `$derived()` / `$derived.by()` — expression vs block
- `$effect()` — side effects, NOT for computed values
- Stores: `.svelte.ts` for rune-based, `.ts` for plain

## Rules

- NEVER create files unless the missing module is clearly needed
- Prefer finding existing alternatives over creating stubs
- Run `svelte-check` after any fixes
- Check `src/lib/services/` is excluded (312 corrupted files)
- Follow CLAUDE.md conventions for all new code