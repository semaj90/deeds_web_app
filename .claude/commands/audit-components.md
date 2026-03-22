# Agentic Component Audit — Garden Pruning

You are running an automated codebase audit to find orphan components and determine their disposition: **wire**, **rewrite**, or **archive**.

## Target: `$ARGUMENTS`

If no argument is provided, audit `sveltekit-frontend/src/lib/components/` root-level `.svelte` files.
If a directory path is provided, audit that directory instead.

## Phase 1: Discovery — Find Orphans

For each `.svelte`, `.svelte.ts`, or `.ts` file in the target directory:
1. `grep -r "FILENAME" src/routes/ src/lib/` — count import references
2. **ALSO check dynamic imports**: `grep -r "import('.*FILENAME')" src/` — dynamic `import()` expressions
3. **ALSO check duplicate names**: `find src/lib/components/ -name "FILENAME"` — if same file exists in a subdirectory, the root-level version may be a dead duplicate
4. If **0 imports** (static + dynamic) → candidate for audit (orphan)
5. If **1+ imports** → USED, skip

**CRITICAL**: Dynamic imports like `import('$lib/components/Foo.svelte')` are NOT caught by `from` grep patterns. Always check both `from '...'` AND `import('...')` patterns. The root layout `(app)/+layout.svelte` uses dynamic imports for SSR-safe components.

Report the orphan list with file sizes.

### 1b. Reverse Dependency Chain (Anti-False-Archive Gate)

**CRITICAL**: Before classifying ANY file as an orphan, trace its **reverse dependency chain** to check if it's a transitive dependency of a wired file.

A file with 0 route imports is NOT necessarily dead — it may be a helper/utility imported by a canonical facade that IS wired to routes.

```
For each candidate orphan X:
1. Find all importers: grep -r "from.*X" src/
2. For each importer Y, check if Y is itself imported by routes or wired files
3. Recursively trace up the chain until you reach a route file OR exhaust all importers
4. If ANY chain leads to an active route → X is a TRANSITIVE DEPENDENCY, not an orphan
```

**Example of false archival this prevents:**
```
embedding-cache.ts (0 route imports — looks dead)
  ↑ imported by: embedding/embed.ts (canonical facade)
    ↑ imported by: batch-embedder.ts, multiple API routes
      ↑ imported by: /api/embed/+server.ts, /api/evidence/*/+server.ts
        → WIRED — embedding-cache.ts is a transitive dependency, NOT dead
```

**Rule**: If file X has 0 direct route imports but IS imported by file Y, and Y (or Y's importers) trace back to an active route, mark X as **TRANSITIVE_DEP** and skip it. Never archive transitive dependencies.

**Common patterns that trigger false positives:**
- Cache helpers (`*-cache.ts`) imported only by facade modules (`embed.ts`, `rag-pipeline.ts`)
- Persistence layers (`*-persist.ts`) imported only by service files
- Type/schema files imported only by other server modules
- Utility functions imported only by one canonical consumer
- Service files re-exported via barrel `index.ts` → facade → route

## Phase 2: Classification — 7-Gate Test

For each orphan, read the file and apply these gates IN ORDER:

| Gate | Question | Pass | Fail |
|------|----------|------|------|
| **G0: Transitive Dep** | Is this file imported (directly or transitively) by any wired file? | → TRANSITIVE_DEP (skip all gates) | Continue |
| **G1: Functional** | Does it compile? Clean Svelte 5 runes? No syntax errors? | Continue | → ARCHIVE (corrupted) |
| **G2: Feature Gap** | Does it provide functionality no other component covers? | Continue | → ARCHIVE (redundant) |
| **G3: Rewrite Potential** | If Svelte 4 or corrupted, is the feature valuable enough to rewrite? Does it enhance an existing pipeline (evidence, RAG, chat, search, cache, inference)? Could it serve a production use case? | → REWRITE candidate | Continue to G4 |
| **G4: Integration Point** | Is there a natural route or layout that should host this? | Continue | → ARCHIVE (homeless) |
| **G5: Effort** | Can it be wired with a simple import + render (< 30 min)? | → WIRE | → DEFER to backlog |
| **G6: Route Reachability** | Is there a REACHABLE execution path from rendered UI → handler → API route? | FULLY WIRED | → SHALLOW (incomplete) |

### Gate 0: Transitive Dependency Check (MUST run first)

Before classifying ANY file, check if it's a transitive dependency:
```
1. grep -r "from.*FILENAME" src/ — find all files that import this file
2. For each importer, recursively check if THAT file is imported by routes
3. If ANY chain leads to a route → mark TRANSITIVE_DEP, skip all other gates
```
This prevents false archival of cache helpers, persistence layers, and utility modules used by canonical facades (e.g., `embedding-cache.ts` imported by `embed.ts`).

### Gate 3: Rewrite Production Value Assessment

When evaluating G3 for orphans that fail G1/G2 but may have production value, assess:
- **Pipeline fit**: Does it enhance evidence (9-stage), RAG, chat (4 systems), search (8-adapter), cache (L0-L3), or inference pipelines?
- **Production use**: Is it end-user facing, internal ops, dev tooling, or demo-only?
- **Existing infra**: Do the required API routes, DB tables, and services already exist?
- **Uniqueness**: Does any other file implement this feature?

If the orphan scores well on these dimensions, classify as REWRITE and create a `next_steps/` entry with: file path, what it does, which pipeline it enhances, estimated rewrite effort, and what infrastructure already exists for it.

### Gate 6: Route Reachability Verification

For every component (imported or candidate), trace the full execution chain. A component is **FULLY WIRED** only if ALL links in the chain resolve:

```
Rendered UI element (button/form/onMount/lifecycle)
  → Event handler or callback prop
    → fetch('/api/...') or server action
      → +server.ts file EXISTS with matching HTTP method
        → Server logic returns data that flows back to UI
```

**6a. Static Chain** (must all resolve):
1. **Import exists** — `grep -r "ComponentName" src/` shows the import
2. **Render exists** — Importing file actually renders `<ComponentName` or `{@render`
3. **Trigger reachable** — A rendered button/form/onMount/machine transition can invoke the handler
4. **API route exists** — Every `fetch('/api/...')` call has a matching `+server.ts` with the right HTTP method (GET/POST/PATCH/DELETE)
5. **Props connected** — Callback props wired to real handlers, NOT `() => {}` or `() => console.log()`
6. **Data flows** — Component receives real data from `$props()`, not placeholder/mock

**6b. Dynamic Chain** (for SSE/streaming/XState):
1. **EventSource URLs** — `new EventSource('/api/...')` must have matching SSE endpoint
2. **XState actors** — `fromPromise` actors must resolve to real API calls, not mocks
3. **WebSocket URLs** — Must match a running server (note: project uses SSE, not WS)

**Shallow wiring indicators (flag as SHALLOW):**
- `onCallback={() => {}}` or `onCallback={() => console.log()}` — no-op handlers
- `fetch('/api/foo')` where `src/routes/api/foo/+server.ts` does NOT exist
- `fetch('/api/foo')` inside a function that is never bound to rendered UI
- Component imported but never rendered in template (`<Component` not found)
- Component rendered but trigger state is declared but never set (e.g., `let show = $state(false)` and nothing ever sets it to `true`)
- Props bound to `$state` that's initialized but never mutated
- Dynamic import loaded but conditional render gate never opens

**Missing API route catalog** — When a component references a non-existent API route, log it:
```
MISSING ROUTE: /api/search/cases (GET) — referenced by search-client.ts
```
These become stubs for the wire-modules skill.

## AI Planning Guardrail

For borderline `WIRE` vs `DEFER` calls, AI tools and web search are useful for planning SvelteKit 2 SSR/client splits, TypeScript ↔ JavaScript interop, Drizzle ORM 0.44 type patterns, and backend ↔ frontend data contracts. Do not treat external guidance as proof: confirm it against this repo before wiring or archiving.

Report any "imported but not truly wired" component as **SHALLOW**.

## Phase 3: Report

Output a markdown table with columns:
| File | Lines | Gate Result | Action | Integration Point | Notes |

Actions: `WIRE`, `REWRITE`, `ARCHIVE`, `DEFER`, `USED` (already imported)

## Phase 4: Execute (if user confirms)

For files marked WIRE:
1. Add dynamic import to the target route/layout
2. Add conditional render block
3. Follow the SSR-safe dynamic import pattern from `(app)/+layout.svelte`

For files marked ARCHIVE:
1. Move to `deeds_labs/lib-dead-directories/components-orphans/`
2. Stage the deletion in git

For files marked REWRITE:
1. Create a todo in `next_steps/active/` with the rewrite spec
2. Do NOT rewrite in this session unless user explicitly asks

## Detection Patterns

**Corrupted file indicators** (→ ARCHIVE or REWRITE):
- `export let` instead of `$props()` (Svelte 4)
- `$:` reactive statements instead of `$derived`/`$effect`
- `on:click` instead of `onclick`
- `<slot>` instead of `{#snippet}`
- File < 10 lines (likely stub/skeleton)
- Garbled syntax, mismatched braces, random characters
- References to non-existent imports

**Redundancy indicators** (→ ARCHIVE):
- Another component with same name in a subdirectory
- Functionality fully covered by `$lib/services/*.ts`
- Storybook files (`.stories.ts`) when Storybook is not active
- Test files (`.test.ts`) that test archived/deleted code

**High-value rewrite indicators** (→ REWRITE):
- Clean logic but Svelte 4 syntax (mechanical migration)
- Feature exists in no other form in the codebase
- Used to be imported but import was removed (git log check)

## Gate 7: Infrastructure Wiring

After G6 Route Reachability, apply G7 to verify the component's backend dependencies are real:

### 7a. XState Machine Connectivity
If the component uses `useMachine()` or imports from `$lib/machines/`:
1. Verify every `invoke.src` actor in the machine has a real implementation (not a stub)
2. Verify `send()` calls use events that the machine actually handles
3. Verify `fromPromise` actors resolve to real API calls or DB queries
4. Flag as **DEAD_MACHINE** if machine is imported but `send()` is never called from rendered UI

### 7b. RabbitMQ Queue Wiring
If the component's handler calls `publishVectorIndex()`, `publishDocumentEmbed()`, etc.:
1. Verify a consumer exists for that queue in `rabbitmq-manager-fixed.ts`
2. Verify the consumer does real work (not a no-op handler)
3. Flag as **ORPHAN_QUEUE** if publisher exists but no consumer (or vice versa)

### 7c. Redis/Cache Coherence
If the component uses `cache.get()`, `cache.set()`, or Redis operations:
1. Verify the cache key pattern has both read AND write paths
2. Flag **STALE_CACHE** if key is written but never read (dead write)
3. Flag **STALE_CACHE** if key is read but never written (always miss)

### 7d. Environment Variable Dependencies
If the file imports from `$lib/config/env.server.ts` or accesses `ENV.*`:
1. Verify the referenced env var is set in `.env` or `.env.example`
2. Flag **MISSING_ENV** if var is accessed but not defined anywhere

### 7e. Demo Page Verification
If the component is used ONLY by a `/demos/*` route:
1. Verify the demo is listed in `/demos/+page.svelte` (the demos index)
2. If not listed → the demo is unreachable from navigation → flag as **UNLISTED_DEMO**
3. Verify the demo page loads without 500 errors (if dev server is running)

## Rules

- NEVER delete files — always move to `deeds_labs/`
- ALWAYS run `grep -r` before classifying — false negatives are destructive
- Check root layout, barrel exports (`index.ts`), dynamic imports
- Follow the Directory Audit Protocol from CLAUDE.md
- Run `svelte-check` after any wiring changes
- Use ripgrep (`rg`) for fast cross-file searches: `rg "from.*\$lib/PATTERN" src/`
