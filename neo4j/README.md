# neo4j/

Canonical output directory for Neo4j-analysis artifacts (dry-run projection dumps, sync reports,
context-graph exports, etc.) — mirrors the `graphify/` pattern. Gitignored, but kept greppable via
the `!/neo4j/` negation in `.rgignore`.

**Status (2026-08-09): infra only.** Created alongside `graphify/`. The following files currently
live in `.tmp/` (or `sveltekit-frontend/.tmp/`) instead, and were deliberately NOT moved yet:

- `.tmp/ast-neo4j-dryrun.json` (written by `scripts/atlas/export-neo4j-dryrun.mjs`, read by
  `scripts/atlas/build-atlas-token-map.mjs`, `scripts/atlas/label-features.mjs`,
  `scripts/atlas/normalize-source-ref-id.mjs`)
- `.tmp/calls-neo4j-dryrun.json` (written by `scripts/atlas/extract-calls-graph.mjs`)
- `.tmp/neo4j-sync-report.json` (written by `scripts/atlas/phase-19c-neo4j-sync.mjs`, read by
  `scripts/atlas/smoke-phase19c-consolidation.mjs`)
- `sveltekit-frontend/.tmp/neo4j-context-graph.json` (written by
  `scripts/atlas/generate-neo4j-context.mjs`)

Reason for deferring: several of these scripts derive their output path from `process.cwd()`
rather than a fixed repo-root constant, so a path swap needs per-script verification (same care as
the `frozen-graph-snapshot-v2.json` move into `graphify/`), not a blind find-and-replace. That
migration is a small, well-scoped follow-up (4 files, 9 consumer scripts) — not the full 280+
script sweep still deferred for `graphify/` — but it's still its own task, not bundled into
standing up this directory.
