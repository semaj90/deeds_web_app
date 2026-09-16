## Why

Added 2026-09-16 — this change previously had no `proposal.md` (flagged by the
`parent-atlas-openspec-tasks-audit-fabric` audit). This file summarizes intent from `tasks.md`'s
own origin/scope section without changing any task or status recorded there.

Captured 2026-08-30 from an external architecture review of an "adaptive DAG synthesis" proposal:
RabbitMQ work dispatch feeding Postgres/Tree-sitter/ast-grep/graph/Qdrant local retrieval plus
optional web search and simdjson typed evidence, converging through a deterministic
evidence→context→prompt chain before Ornith synthesis. Reviewed against live code before writing
anything — `RUNTIME-QUEUE-01` is a verified, fixed, real bug (a missing `kb_ingest` queue
declaration that would 404 a consumer channel at boot), not a theoretical one. Everything else in
this file is a design freeze / backlog, not yet built.

## What Changes

See `tasks.md` for the `RUNTIME-QUEUE-*` immediate-fix sequence (done first, small and scoped) and
the larger adaptive-DAG design/backlog items that follow. This proposal introduces no new task.

## Capabilities

No new capability — this documents the existing RabbitMQ runtime fix and adaptive-DAG design work
already specified in `tasks.md`.
