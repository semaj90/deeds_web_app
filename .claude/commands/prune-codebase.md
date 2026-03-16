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
PATTERN: Follow (app)/+layout.svelte dynamic import pattern
EFFORT: ~10 min
```

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

### Barrel Export Zombies
Files exported from `index.ts` but never imported downstream:
```bash
grep -r "export.*from" src/lib/**/index.ts
# Cross-reference each export against src/routes/ imports
```

### Shadow Duplicates
Files with same basename in different directories (e.g., `stores/machines/` vs `machines/`):
```bash
find src/lib/ -name "*.ts" -o -name "*.svelte" | xargs -I{} basename {} | sort | uniq -d
```

### Orphan Type Files
`.d.ts` files declaring types for deleted components.

### Dead Server Files
`src/lib/server/` files not imported by any API route or other server file.

### Orphan Cluster Detection
Groups of files that only import each other but nothing imports the group:
```
If A imports B, B imports C, but nothing outside {A,B,C} imports any of them
→ entire cluster is dead
```

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
- **NEVER archive** `$lib/webgpu/`, `$lib/gpu/`, `$lib/ai/onnx/`, `simd-bridge/cpp/`
- **ALWAYS generate/update MANIFEST.md** after archiving
- Follow the Directory Audit Protocol from CLAUDE.md (7-step checklist)
- Run `svelte-check` + `vite build` after any changes
- `src/lib/services/**` is blanket-excluded — 312 corrupted files, DO NOT touch
- If in doubt about a file → DEFER, never ARCHIVE uncertain files
