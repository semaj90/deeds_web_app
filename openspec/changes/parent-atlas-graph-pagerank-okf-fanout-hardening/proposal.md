## Why

Added 2026-09-16 — this change previously had no `proposal.md` (flagged by the
`parent-atlas-openspec-tasks-audit-fabric` audit). This file summarizes intent from `tasks.md`'s
own Context section without changing any task or status recorded there.

This is a 2026-08-21 session handoff hardening the Graph/PageRank/OKF/Qdrant-fanout lane. A
parallel session in a different clone (`deeds-web-app-post17-clean`) had reported audit gaps in
this area; rather than trust that summary, this session independently reproduced the failures in
**this** repo by running the real test suite
(`graph-qdrant-fanout-alignment.spec.ts`, `okf-schema-validation.spec.ts`,
`atlas-rapids-pagerank-client.spec.ts`, `pagerank-parity.spec.ts`), then fixed what was verifiably
broken here — including a real async-rejection bug in the RAPIDS PageRank client (a synchronous
arrow function meant its validation throw happened before any Promise existed, so
`await expect(...).rejects.toThrow(...)` couldn't catch it; fixed by making the function `async`).
Status per `tasks.md`: **PROVEN** — all 12/12 tests across the 4-spec suite pass live, reproduced
twice, ~10s total runtime.

## What Changes

See `tasks.md` for the full fixed-and-verified list. This proposal introduces no new task.

## Capabilities

No new capability — this documents the existing graph/PageRank/OKF-fanout hardening work already
specified in `tasks.md`.
