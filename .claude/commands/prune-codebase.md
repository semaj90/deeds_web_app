# Agentic Codebase Pruning — Full Garden Audit

You are running a comprehensive dead code detection sweep across the codebase.
This skill combines automated import analysis, AI-driven assessment, integration guidance, and safe archival.

## Target: `$ARGUMENTS`

If no argument: audit all of `sveltekit-frontend/src/lib/` (excluding `services/` which is blanket-excluded).
If argument provided: audit that specific subdirectory.

---

## Phase 1: Discovery — Directory-Level Scan

For each subdirectory in `src/lib/`:
1. Count total files
2. Count files with **0 import references** across `src/routes/` and `src/lib/`
3. Calculate **dead ratio** = (dead files / total files)
4. Flag directories with dead ratio > 50%

Report:
| Directory | Total Files | Dead Files | Dead % | Recommendation |

Recommendations:
- **> 80% dead** → Archive entire directory to `deeds_labs/`
- **50-80% dead** → Audit individual files (run /audit-components on it)
- **< 50% dead** → Healthy, skip unless specific files flagged

---

## Phase 2: Analysis — AI-Driven Import Cross-Reference

For each orphan file (0 imports), perform deep analysis:

### 2a. Import Graph Analysis
```
For file X with 0 importers:
1. What does X export? (functions, classes, types, components)
2. Do any of those exports DUPLICATE functionality in active files?
3. Was X previously imported? (check: git log --all -p -- "path/to/X" | grep "^-.*import.*X")
4. Does X import from other orphans? (orphan cluster detection)
```

### 2b. Code Quality Assessment
Read each file and assess:
- **Syntax era**: Svelte 5 runes / Svelte 4 / plain TS / corrupted
- **Completeness**: Full implementation vs stub/skeleton (< 20 lines)
- **Dependencies**: Does it require packages not in package.json?
- **Type safety**: Any `any` casts, missing types, TS errors?

### 2c. Feature Value Assessment
For each orphan, answer:
- Could this feature improve user experience if wired?
- Is there user-facing functionality (UI component, API endpoint)?
- Does it implement a capability listed in project requirements?
- Would a user notice if this was removed?

### 2d. Trigger Reachability Check
If a file exposes callbacks, async handlers, state machines, or `fetch('/api/...')` calls, verify the trigger path is real:
1. Is the handler bound to a rendered button, form, onMount, load function, machine transition, or keyboard shortcut?
2. Can current state/conditions actually reach that trigger, or is it trapped behind a permanently-false branch?
3. If the file calls an API route, can a real consumer action reach that call end to end?
4. If the function exists but is never bound or never reachable, classify it as **SHALLOW/DEAD**, not wired.

---

## Phase 3: Classification — 5-Gate Test

Apply gates IN ORDER. Stop at first fail.

| Gate | Question | Pass | Fail |
|------|----------|------|------|
| G1: Functional | Compiles, clean TS/Svelte 5, no syntax errors? | Continue | → ARCHIVE |
| G2: Feature Gap | Unique functionality no other file covers? | Continue | → ARCHIVE |
| G3: Rewrite Value | If broken/Svelte4, is feature valuable enough to rewrite? | → REWRITE | Continue |
| G4: Integration Point | Natural route/layout/API that should host this? | Continue | → ARCHIVE |
| G5: Effort | Wire in < 30 min (import + render, not deep refactor)? | → WIRE | → DEFER |

---

## Phase 4: Integration Guidance

For files classified as WIRE or REWRITE, provide specific guidance:

### For WIRE files:
```
FILE: ComponentName.svelte
ACTION: WIRE
WHERE: src/routes/(app)/target-route/+page.svelte
HOW:
  1. Add dynamic import: import('$lib/components/ComponentName.svelte')
  2. Add $state variable for component reference
  3. Add conditional render: {#if Component}<Component />{/if}
  4. Add trigger: keyboard shortcut / button / route param
  5. Verify the trigger path actually fires the consumer handler/API route
PATTERN: Follow (app)/+layout.svelte dynamic import pattern
EFFORT: ~10 min
```

### AI-Assisted Planning For DEFER Cases:
Use chat-based AI tools or web search only for planning, not as proof. Good uses:
- Map SvelteKit 2 production patterns before wiring SSR/client-only code
- Check TypeScript/JavaScript interop when a module boundary is unclear
- Confirm Drizzle ORM 0.44 typing/migration patterns before schema work
- Plan backend ↔ frontend data contracts before wiring orphaned UI to live routes

Any external recommendation must be reconciled against the current repo before action.

### For REWRITE files:
```
FILE: OldComponent.svelte (Svelte 4)
ACTION: REWRITE
VALUE: [description of what it does that nothing else does]
MIGRATION:
  1. export let → $props()
  2. $: → $derived() / $effect()
  3. on:click → onclick
  4. <slot> → {#snippet}
  5. createEventDispatcher → callback props
ESTIMATED SIZE: ~N lines
COMPLEXITY: Low/Medium/High
```

### For RELOCATE files:
```
FILE: src/lib/wrong-place/util.ts
ACTION: RELOCATE
FROM: src/lib/wrong-place/util.ts
TO: src/lib/correct-place/util.ts
REASON: [canonical location rule]
CONSUMERS: [list files that import it — all need updating]
```

---

## Phase 5: Cross-Cutting Checks

### 5a. Route Reachability Audit
For every `fetch('/api/...')` call in `src/lib/`:
```
1. Does the API route +server.ts exist?
2. Does the calling function have a RENDERED trigger?
   (onclick/onsubmit/onMount/$effect/XState fromPromise actor)
3. Is the trigger reachable from the current state?
   (check: is the $state that guards the render ever set to true?)
```
Flag as **DEAD_CHAIN** if fetch exists but no rendered path invokes it.
Flag as **MISSING_API_ROUTE** if +server.ts doesn't exist.

### 5b. Barrel Export Zombies
Files exported from `index.ts` but never imported downstream:
```bash
grep -r "export.*from" src/lib/**/index.ts
# Cross-reference each export against src/routes/ imports
```

### 5c. Shadow Duplicates
Files with same basename in different directories (e.g., `stores/machines/` vs `machines/`):
```bash
find src/lib/ -name "*.ts" -o -name "*.svelte" | xargs -I{} basename {} | sort | uniq -d
```
When two files share a name, the one with ACTIVE route imports wins. Archive the other.

### 5d. Orphan Type Files
`.d.ts` files declaring types for deleted components.

### 5e. Dead Server Files
`src/lib/server/` files not imported by any API route or other server file.

### 5f. Orphan Cluster Detection
Groups of files that only import each other but nothing imports the group:
```
If A imports B, B imports C, but nothing outside {A,B,C} imports any of them
→ entire cluster is dead
```

### 5g. No-Op Handler Detection
Scan route files for callback props wired to empty functions:
```
onCallback={() => {}}
onCallback={() => console.log(...)}
```
These indicate incomplete integration — component rendered but non-functional.

### 5h. XState Actor Audit
For each machine in `src/lib/machines/`:
```
1. List all invoke.src actors — verify each has a real implementation (not a stub/mock)
2. List all sendTo() targets — verify target actor ID exists in machine hierarchy
3. List all guard functions — verify they return meaningful booleans (not always true/false)
4. Verify machine is actually used: grep for useMachine(machineName) or interpret(machineName)
```
Flag: **DEAD_MACHINE** if machine exists but is never instantiated.
Flag: **DEAD_ACTOR** if `invoke.src` references a missing or stub actor.

### 5i. RabbitMQ Flow Audit
For each queue in `rabbitmq-manager-fixed.ts`:
```
1. Verify both a publisher AND consumer exist for the queue
2. Verify message schema matches between producer and consumer
3. Verify consumer does real work (not just console.log)
```
Flag: **ORPHAN_PUBLISHER** if `publish*()` called but no consumer for that queue.
Flag: **ORPHAN_CONSUMER** if consumer registered but nothing publishes to that queue.

### 5j. Redis Key Pattern Audit
```bash
rg "redis\.(get|set|del|hget|hset)" src/lib/ --no-heading
```
Group by key pattern (e.g., `case:*`, `embed:*`, `cache:*`):
- Flag **WRITE_ONLY_KEY** if key pattern has set() but no get()
- Flag **READ_ONLY_KEY** if key pattern has get() but no set()
- Flag **ORPHAN_TTL** if key set with TTL but never refreshed or read before expiry

### 5k. Environment Variable Audit
```bash
rg "ENV\.\w+" src/lib/ src/routes/ --no-heading -o | sort | uniq -c | sort -rn
```
Cross-reference against `.env.example` or `env.server.ts` getters:
- Flag **MISSING_ENV** if var is accessed but not in `.env.example`
- Flag **UNUSED_ENV** if var is in `.env.example` but never accessed in code

### 5l. API Contract Audit
For each `fetch('/api/...')` in client code:
1. Read the server's Zod schema (if present) in the matching `+server.ts`
2. Verify the client sends a matching request body shape
3. Verify the client reads the response in the same shape the server sends
Flag: **CONTRACT_MISMATCH** if request/response shapes diverge.

### 5m. Demo Page Reachability
```bash
# Find all demo route directories
ls src/routes/(app)/demos/*/+page.svelte
# Cross-reference with demos index page array
rg "href:.*'/demos/" src/routes/(app)/demos/+page.svelte
```
Flag: **UNLISTED_DEMO** if a demo page exists but is not in the demos index.
Flag: **DEAD_DEMO_LINK** if demos index links to a route that doesn't exist.

---

## Phase 6: Automated Refactoring (Execute with user confirmation)

### ARCHIVE action (safe move to deeds_labs):
```bash
# MANDATORY: Move BEFORE git-removing
mkdir -p deeds_labs/lib-dead-directories/DIRNAME/
cp src/lib/DIRNAME/FILE deeds_labs/lib-dead-directories/DIRNAME/FILE
git rm src/lib/DIRNAME/FILE
```

**CRITICAL SAFETY NET**: ALWAYS copy to deeds_labs FIRST, then git rm.
Never git rm without first copying. This prevents data loss.

### WIRE action (connect orphan to route):
1. Read the target route file
2. Add dynamic import in onMount (SSR-safe pattern)
3. Add $state variable for component reference
4. Add conditional render block
5. Add trigger mechanism (keyboard shortcut, button, etc.)
6. Run svelte-check to verify

### RELOCATE action (move to canonical location):
1. Copy file to new location
2. Update all consumer imports (grep + sed)
3. Remove old file
4. Run svelte-check to verify

### Generate archive manifest:
After all actions, create/update `deeds_labs/lib-dead-directories/MANIFEST.md`:
```markdown
# Archive Manifest
## Session: YYYY-MM-DD
| File | Source | Gate Failed | Reason | Recoverable From |
|------|--------|-------------|--------|-------------------|
| auth/password.ts | src/lib/auth/ | G2 (redundant) | Superseded by server/auth/ | git show COMMIT:path |
```

---

## Phase 7: Health Report

Output final summary:
```
CODEBASE HEALTH REPORT — [date]
================================
Target: src/lib/
Total files scanned: N
Already wired (healthy): N (N%)

Orphans found: N
  ├─ WIRE:     N files (ready to connect)
  ├─ REWRITE:  N files (valuable but need migration)
  ├─ ARCHIVE:  N files (moved to deeds_labs/)
  ├─ DEFER:    N files (complex, needs planning)
  └─ RELOCATE: N files (wrong canonical location)

Cross-cutting issues:
  Barrel zombies: N
  Shadow duplicates: N
  Orphan clusters: N
  Dead server files: N

Net change: -N files, -N lines, -N KB
Manifest: deeds_labs/lib-dead-directories/MANIFEST.md
```

---

## Safety Rules

- **NEVER git rm without copying to deeds_labs first** — this is the #1 rule
- **ALWAYS grep before archiving** — check ALL import patterns:
  - Static: `from '$lib/MODULE'`
  - Dynamic: `import('$lib/MODULE')`
  - Barrel: re-exported via `index.ts`
  - Root layout: `+layout.svelte` imports
  - API routes: `src/routes/api/` server imports
  - `.svelte.ts` stores: cross-module references
- **ALWAYS prove reachability** — an API route or handler only counts as wired if a rendered consumer, lifecycle hook, or machine transition can actually trigger it
- **NEVER archive** `$lib/webgpu/`, `$lib/gpu/`, `$lib/ai/onnx/`, `simd-bridge/cpp/`
- **ALWAYS generate/update MANIFEST.md** after archiving
- Follow the Directory Audit Protocol from CLAUDE.md (7-step checklist)
- Run `svelte-check` + `vite build` after any changes
- `src/lib/services/**` is blanket-excluded — 312 corrupted files, DO NOT touch
- If in doubt about a file → DEFER, never ARCHIVE uncertain files
