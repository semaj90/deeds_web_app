# Agentic Shallow-Wiring Analysis — Dead Chain Detector

You are running a deep analysis to find components that APPEAR wired but have broken execution chains — buttons that navigate to missing routes, handlers that call non-existent APIs, tabs that reference invalid state values, or actions that can never be triggered.

## Target: `$ARGUMENTS`

If no argument, scan all `src/routes/(app)/` page files for shallow wiring.
If a file/directory is given, analyze that scope.

## What is Shallow Wiring?

A component is **shallow-wired** when it's imported, rendered, and receives props — but the execution chain from UI → handler → effect is broken somewhere. These bugs are invisible to `svelte-check` and `vite build` because they're runtime logic errors, not type errors.

## Phase 1: Scan for Execution Chains

For each route page (`+page.svelte`), extract ALL:

1. **Navigation calls**: `goto('...')`, `<a href="...">`, `window.location`
   - Verify target route EXISTS: `src/routes/(app)/PATH/+page.svelte` or `+page.server.ts`
   - Flag as **DEAD_ROUTE** if target doesn't exist

2. **Fetch calls**: `fetch('/api/...')`, `fetch(\`/api/...\`)`
   - Verify `+server.ts` exists with matching HTTP method
   - Flag as **MISSING_API** if route doesn't exist

3. **Tab/state switches**: `activeTab = 'value'`, `currentView = 'value'`
   - Verify the state value has a matching render branch: `{#if activeTab === 'value'}`
   - Flag as **DEAD_TAB** if no render branch matches

4. **Callback props**: `onFoo={handler}`, `onclick={handler}`
   - Trace `handler` back to its definition
   - If handler body is `() => {}`, `console.log(...)`, or `noop` → **NO_OP_HANDLER**
   - If handler calls `fetch('/api/...')` → verify API route (see #2)
   - If handler sets state → verify state is consumed (see #3)

5. **Component props**: `<Component data={value} />`
   - If `value` is always `null`, `undefined`, `[]`, or `$state` that's never set → **DEAD_PROP**

6. **Dynamic imports**: `import('$lib/components/...')`
   - If the imported component is conditionally rendered, verify the condition CAN become true
   - If gate state is `$state(false)` and nothing ever sets it `true` → **UNREACHABLE_IMPORT**

## Phase 2: Chain Tracing Algorithm

For each suspicious chain, trace the FULL path:

```
START: Rendered UI element (button, link, form)
  ↓ Is element visible? (check parent {#if} / {#each} gates)
  ↓ What event fires? (onclick, onsubmit, onMount)
  ↓ What handler runs? (inline function, named function, callback prop)
  ↓ What does handler DO?
     ├─ goto('/path') → Does route exist?
     ├─ fetch('/api/path') → Does +server.ts exist?
     ├─ stateVar = 'value' → Does render branch exist for value?
     ├─ callback(args) → Trace callback to parent's prop binding
     └─ nothing (no-op) → DEAD_CHAIN
```

## Phase 3: Report

Output a markdown table:
| Route | Component | Chain | Issue | Category | Fix |

Categories:
- **DEAD_ROUTE**: `goto()` or `<a href>` points to non-existent page
- **MISSING_API**: `fetch('/api/...')` calls non-existent `+server.ts`
- **DEAD_TAB**: State set to value with no matching render branch
- **NO_OP_HANDLER**: Callback prop wired to empty/logging function
- **DEAD_PROP**: Component receives data that is always null/empty
- **UNREACHABLE_IMPORT**: Dynamic import behind permanently-false gate
- **ORPHAN_STATE**: `$state` declared and set but never read in template

Severity levels:
- **P0**: User clicks button → error/404 (DEAD_ROUTE, MISSING_API)
- **P1**: User clicks button → nothing happens (NO_OP_HANDLER, DEAD_TAB)
- **P2**: Code loaded but never reachable (UNREACHABLE_IMPORT, DEAD_PROP)
- **P3**: State allocated but unused (ORPHAN_STATE)

## Phase 4: Fix (if user confirms)

### DEAD_ROUTE — Remap to valid target
```
BEFORE: goto('/cases/${id}/board')
AFTER:  activeTab = 'organize'  // or create the missing route
```
Choose: remap to existing feature OR create missing route stub.

### MISSING_API — Create route stub
Use the `/wire-modules` skill pattern to create `+server.ts` with 501 stub.

### NO_OP_HANDLER — Wire to real logic
Replace `() => {}` with actual handler. If no logical handler exists, remove the prop entirely.

### DEAD_TAB — Remove or add render branch
If the tab value is intentional, add the missing `{:else if activeTab === 'value'}` block.
If accidental, change to a valid tab value.

## Real Example: QuickActionsPanel on /cases/[id]

**Discovery**: QuickActions rendered inside theory tab (line 895).
Four actions defined (lines 172-213):

| Action | Handler | Target | Status |
|--------|---------|--------|--------|
| Timeline Analysis | `activeTab = 'timeline'` | Tab at line 911 | WORKS |
| Evidence Summary | `activeTab = 'summary'` | Tab at line 947 | WORKS |
| Suspect Connections | `goto('/cases/${id}/board')` | Route EXISTS at `cases/[id]/board/` | WORKS |
| Draft Document | `activeTab = 'document'` | Tab at line 931 | WORKS |

**Cautionary note on glob false negatives**: The initial audit used `**/cases/[id]/board/**`
which treated `[id]` as a glob character class, not a literal directory name. This produced
a false negative (0 matches) for a route that actually exists. Always verify dynamic route
segments with `ls` or `find` in addition to glob patterns.

**Key insight**: Shallow-wiring bugs pass svelte-check, vite build, and Playwright smoke tests
because they are runtime logic errors. Always verify `goto()` targets and `fetch()` endpoints
at the filesystem level, not just with type checks. Be especially careful with SvelteKit
dynamic route segments (`[id]`, `[slug]`) — glob patterns treat brackets as character classes.

## Phase 5: Infrastructure Chain Analysis

Beyond UI → handler → API chains, trace infrastructure dependencies:

### 5a. XState Machine Dead Chains
```
PATTERN: Component imports useMachine(fooMachine)
CHECK:
  1. Does the component ever call send({ type: 'EVENT' })?
  2. Does fooMachine handle that event in its current state?
  3. Does the machine's invoke.src actor do real work (API call, DB query)?
  4. Is the machine's state consumed in the template ({#if snapshot.matches('...')})?
```
Flag as **DEAD_MACHINE** if machine is imported but `send()` never called with a reachable event.
Flag as **UNREACHABLE_STATE** if machine has states that no transition path can reach.

### 5b. RabbitMQ Orphan Queues
```bash
# Find all publish calls
rg "publish(VectorIndex|DocumentEmbed|EvidenceProcess|ChatContext|AnalyticsTrack|CacheInvalidate|CodebaseIndex)" src/ --no-heading
# Find all consume calls
rg "consume\(" src/lib/server/queue/ --no-heading
```
Flag as **ORPHAN_QUEUE** if a queue has publishers but no consumer (or vice versa).

### 5c. Redis Stale Cache Keys
```bash
rg "redis\.(get|hget|mget)\(" src/ --no-heading -n
rg "redis\.(set|hset|setex)\(" src/ --no-heading -n
```
Group by key pattern prefix. Flag as **STALE_CACHE** if:
- Key written but never read (dead write)
- Key read but never written (always cache miss)
- Key used with TTL but read pattern doesn't handle miss gracefully

### 5d. Missing Environment Variables
```bash
rg "ENV\.\w+" src/lib/config/env.server.ts -o | sort -u
rg "ENV\.\w+" src/routes/ src/lib/server/ -o | sort -u
```
Cross-reference: Flag as **MISSING_ENV** if code accesses `ENV.X` but the getter in `env.server.ts` doesn't define it or `.env.example` doesn't list it.

### 5e. Demo Page Reachability
```bash
# All demo routes that exist on disk
ls -d src/routes/(app)/demos/*/
# All demo hrefs listed in the index page
rg "href:.*'/demos/" src/routes/(app)/demos/+page.svelte -o
```
Flag as **UNLISTED_DEMO** if a demo route exists but isn't linked from the demos index page.
Flag as **DEAD_DEMO_LINK** if the index page links to a demo route that doesn't exist on disk.

### 5f. Ripgrep-Based Shallow Route Fix
Use ripgrep to systematically find ALL broken route references across the codebase:
```bash
# Extract all goto() targets
rg "goto\(['\`]([^'\`]+)" src/ -o --no-heading | sort -u
# Extract all <a href="..."> targets
rg 'href="(/[^"]+)"' src/ -o --no-heading | sort -u
# Extract all fetch() API targets
rg "fetch\(['\`](/api/[^'\`]+)" src/ -o --no-heading | sort -u
```
For each extracted route:
1. Resolve SvelteKit dynamic segments: `[id]` → check parent dir exists
2. Verify `+page.svelte` or `+server.ts` exists at that path
3. Report ALL broken references in one pass (not file-by-file)

## Detection Heuristics

**High-probability shallow wiring patterns:**
- `goto()` with template literals containing route params → verify with `ls`, NOT glob (glob treats `[id]` as character class)
- Callback props with `() => {}` or `() => console.log(...)` → always a no-op
- `fetch('/api/v1/...')` or `fetch('/api/v2/...')` → versioned APIs rarely exist in SvelteKit
- `$state(false)` for modal visibility that's never set `true` by any handler
- Component imported but no `<Component` or `{@render` in template
- State variable assigned in handler but never read in `{#if}` / `{:else if}` / `{#each}`
- XState machine imported but `send()` never called from rendered UI
- RabbitMQ publish with no matching consumer
- Redis key written with TTL but never read before expiry

## Rules

- Do NOT flag working chains — only report broken ones
- Trace FULL chain before classifying — a handler may look like a no-op but be called indirectly
- Check both static imports AND dynamic `import()` patterns
- Verify `goto()` targets against BOTH `(app)/` routes and `api/` routes
- For `fetch()` calls, check the HTTP method matches (GET vs POST vs PATCH)
- Use ripgrep (`rg`) for fast cross-file searches, NOT grep
- Run `svelte-check` after any fixes
- Follow CLAUDE.md Directory Audit Protocol for any file moves