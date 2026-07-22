# Session 140 Review Finish-Up To-Do

1. Patch `sveltekit-frontend/src/lib/server/ace/features/som-clustering.ts` to fail closed when apply mode reports zero successful updates.
2. Check whether the underlying Drizzle update call exposes a rowcount and use it if available.
3. Convert dry-run to an explicit read-only proof path instead of a branch-only skip.
4. Run a bounded smoke test and confirm write/readback parity on a small packet set.
5. Keep `feature-extraction-orchestrator.ts` aligned so the result summary cannot report success on a silent no-op.
6. Do not widen scope to PageRank or registry projection until SOM write proof is complete.
