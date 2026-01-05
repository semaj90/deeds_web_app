# Phase 75: Targeted Top 100 Error Fixes

## Objective
Reduce error count by targeting the top 100 files with the highest error density, identified by `svelte-check` analysis.

## Workflow
1. **Analyze:** Parse `svelte-check` logs to identify "Top Offenders".
2. **Prioritize:** Focus on files with:
   - TypeScript 2307 (Missing Module) -> Fix imports/tsconfig.
   - TypeScript 2304 (Cannot find name) -> Fix missing imports/globals.
   - TypeScript 7006 (Implicit Any) -> Add types.
3. **Execute:**
   - Use `scripts/phase74-error-analyzer.mjs` to generate the list.
   - Manually fix or use patterns to fix the top 10 files per batch.
   - Verify with `svelte-check` (scoped to file).


## Current Status (2026-01-05)
- [x] Batch fixed 1,800+ files for Object Literal Corruption.
- [x] Restored 404/421 "under reconstruction" stubs from backups.
- [x] Applied multi-pass corruption fixes during restoration.
- [x] Reduced error count from ~83.7k to 82.6k.

## Next Steps
- [ ] Refactor core components (`Tooltip`, `Switch`, `Select`) to `bits-ui` v2.
- [ ] Run `node scripts/phase74-error-analyzer.mjs` on the post-restoration log.
- [ ] Target the new Top 100 error orphans created by restoration.
- [ ] Fix the 17 stubbed files that had no backups.

