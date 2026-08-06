# manual-migration-reconciliation

Drift-closing change for `drizzle/manual/*.sql`. This project's Drizzle Safety Rule (CLAUDE.md) requires manual SQL sidecar migrations to be applied by hand and cross-checked before any `drizzle-kit push`/`generate` run — but nothing tracked *whether* each sidecar file had actually been applied to the live database. Two of them (`workflow_orchestration_tables.sql`, `0051_atlas_topology_eval_times.sql`) turned out to be sitting on disk unapplied, which is what broke `npm run dev:gpu` (outbox publisher) and `npm run graphify:daily` (SOM telemetry write) in session work on 2026-08-05.

This change tracks reconciliation for the remaining `drizzle/manual/*.sql` files whose target tables are confirmed missing from the live `legal_ai_db`, one file at a time, with an explicit risk tier per file so nothing gets blind-applied.
