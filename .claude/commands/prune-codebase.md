# Agentic Codebase Pruning — Full Garden Audit

You are running a comprehensive dead code detection sweep across the entire `src/lib/` directory tree.

## Target: `$ARGUMENTS`

If no argument: audit all of `sveltekit-frontend/src/lib/` (excluding `services/` which is blanket-excluded).
If argument provided: audit that specific subdirectory.

## Phase 1: Directory-Level Scan

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

## Phase 2: File-Level Scan (for flagged directories)

For each dead file in flagged directories, apply the 5-Gate Test:

| Gate | Question | Pass | Fail |
|------|----------|------|------|
| G1: Functional | Compiles, clean TS/Svelte 5? | Continue | ARCHIVE |
| G2: Feature Gap | Unique functionality? | Continue | ARCHIVE |
| G3: Rewrite Value | Worth rewriting if broken? | REWRITE | Continue |
| G4: Integration Point | Natural host route exists? | Continue | ARCHIVE |
| G5: Effort | < 30 min to wire? | WIRE | DEFER |

## Phase 3: Cross-Cutting Checks

After file-level audit, check for:

### Barrel Export Zombies
Files exported from `index.ts` but never imported downstream:
```bash
# Find all exports from index.ts files
grep -r "export.*from" src/lib/**/index.ts
# Cross-reference each export against src/routes/ imports
```

### Shadow Duplicates
Files that exist in two locations (e.g., `stores/machines/` shadowing `machines/`):
```bash
# Find files with same basename in different directories
find src/lib/ -name "*.ts" -o -name "*.svelte" | sort -t/ -k+4 | uniq -d -f3
```

### Orphan Type Files
`.d.ts` files declaring types for deleted components:
```bash
grep -rL "import.*from" src/lib/**/*.d.ts
```

### Dead Server Files
`src/lib/server/` files not imported by any API route:
```bash
# For each file in src/lib/server/
grep -r "FILENAME" src/routes/api/ src/lib/server/
```

## Phase 4: Relocation Candidates

Files in wrong canonical locations:
| Current Location | Canonical Location | Rule |
|-----------------|-------------------|------|
| `src/lib/text/*.ts` | `src/lib/ai/*.ts` | AI/ML utilities go in `ai/` |
| `src/lib/vector/*.ts` | `src/lib/server/vector/*.ts` | Server-only code goes in `server/` |
| `src/lib/core/logic/*.ts` | `src/lib/utils/*.ts` | Generic utilities go in `utils/` |
| `src/lib/*.mjs` scripts | `scripts/` | Build/test scripts don't belong in `$lib` |

## Phase 5: Report

Output final summary:
```
CODEBASE HEALTH REPORT
======================
Total src/lib/ files: N
Dead files found: N (N%)
Action breakdown:
  WIRE:     N files
  REWRITE:  N files
  ARCHIVE:  N files
  DEFER:    N files
  RELOCATE: N files
  HEALTHY:  N files

Estimated cleanup: -N files, -N KB
```

## Safety Rules

- **NEVER delete** — always move to `deeds_labs/lib-dead-directories/`
- **ALWAYS grep before archiving** — check ALL import patterns:
  - Static: `from '$lib/MODULE'`
  - Dynamic: `import('$lib/MODULE')`
  - Barrel: re-exported via `index.ts`
  - Root layout: `+layout.svelte` imports
  - API routes: `src/routes/api/` server imports
- **NEVER archive** `$lib/webgpu/`, `$lib/gpu/`, `$lib/ai/onnx/`, `simd-bridge/cpp/`
- Follow the Directory Audit Protocol from CLAUDE.md (7-step checklist)
- Run `svelte-check` + `vite build` after any changes
- `src/lib/services/**` is blanket-excluded — 312 corrupted files, DO NOT touch
