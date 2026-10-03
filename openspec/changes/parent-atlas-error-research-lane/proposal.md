## Why

Added 2026-09-16 — this change previously had no `proposal.md` (flagged by the
`parent-atlas-openspec-tasks-audit-fabric` audit). This file summarizes intent without changing
any status recorded in `tasks.md`.

This is the Parent Atlas Error Research Lane (ER0-ER13): an automated pipeline that fingerprints
unresolved errors, dedupes them by fingerprint + workspace revision, hydrates ACE local codebase
context, classifies each error as locally-sufficient or requiring external research, optionally
calls Local Deep Research (LDR) for the latter, and persists an `error_research_context` receipt —
without ever patching source, changing graph identity, or marking an error resolved. Slice 1
(ER0-ER6) is fully built; Slice 2 (ER7-ER13: fix-candidate generation, ranking, operator approval,
patch application, verification) is explicitly out of scope for the current session and not
started.

## What Changes

See `tasks.md` for the full ER0-ER13 task table. This proposal introduces no new task.

## Status as of 2026-09-16 (re-verified live)

`error_logs` — the table this lane's first four stages (ER0-ER4) read/write — was confirmed
restored live on 2026-09-15 (after being lost, likely in a Docker volume rebuild). The other four
lane tables (`error_research_context`, `error_fix_plan`, `fix_attempt`, `verification_receipt`)
remain unmigrated, live-verified via `information_schema.tables`. This narrows, but does not clear,
the lane's blocker: ER5 (persisting the research receipt) stays blocked on
`error_research_context`'s own never-applied migration, which is itself owned by
`openspec/changes/manual-migration-reconciliation/` — do not hand-apply that migration outside that
change's baseline decision, per `tasks.md`'s own explicit instruction.

## Capabilities

No new capability — this documents the existing ER0-ER13 pipeline already specified in `tasks.md`.
