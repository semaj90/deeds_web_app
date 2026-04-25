fix-ts1005 — TS1005 dry-run fixer

What it does
- Scans a small set of TypeScript files (top-20 or all if top list missing) for likely missing-comma locations (TS1005 pattern).
- Emits preview .patch files (no writes) into logs/commas-previews/ and writes a summary JSON to logs/fix-comma-summary.json.

How to run (from repository root)
- npm run --prefix sveltekit-frontend fix:ts1005

Notes
- This is intentionally conservative and heuristic-based. Review the previews before applying any changes.
- To apply patches, we'll implement a separate safe applier that creates .bak backups for each file. Do not run any automatic writer yet.
