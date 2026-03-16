# Agentic Component Audit — Garden Pruning

You are running an automated codebase audit to find orphan components and determine their disposition: **wire**, **rewrite**, or **archive**.

## Target: `$ARGUMENTS`

If no argument is provided, audit `sveltekit-frontend/src/lib/components/` root-level `.svelte` files.
If a directory path is provided, audit that directory instead.

## Phase 1: Discovery — Find Orphans

For each `.svelte`, `.svelte.ts`, or `.ts` file in the target directory:
1. `grep -r "FILENAME" src/routes/ src/lib/` — count import references
2. If **0 imports** → candidate for audit (orphan)
3. If **1+ imports** → USED, skip

Report the orphan list with file sizes.

## Phase 2: Classification — 5-Gate Test

For each orphan, read the file and apply these gates IN ORDER:

| Gate | Question | Pass | Fail |
|------|----------|------|------|
| **G1: Functional** | Does it compile? Clean Svelte 5 runes? No syntax errors? | Continue | → ARCHIVE (corrupted) |
| **G2: Feature Gap** | Does it provide functionality no other component covers? | Continue | → ARCHIVE (redundant) |
| **G3: Rewrite Potential** | If Svelte 4 or corrupted, is the feature valuable enough to rewrite from scratch? | → REWRITE candidate | Continue to G4 |
| **G4: Integration Point** | Is there a natural route or layout that should host this? | Continue | → ARCHIVE (homeless) |
| **G5: Effort** | Can it be wired with a simple import + render (< 30 min)? | → WIRE | → DEFER to backlog |

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

## Rules

- NEVER delete files — always move to `deeds_labs/`
- ALWAYS run `grep -r` before classifying — false negatives are destructive
- Check root layout, barrel exports (`index.ts`), dynamic imports
- Follow the Directory Audit Protocol from CLAUDE.md
- Run `svelte-check` after any wiring changes
