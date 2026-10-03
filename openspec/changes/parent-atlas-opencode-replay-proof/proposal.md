## Why

Added 2026-09-16 — this change previously had no `proposal.md` (flagged by the
`parent-atlas-openspec-tasks-audit-fabric` audit, `structuralScore: 60`). This file summarizes
intent from `tasks.md`'s own opening section without changing any task there.

This backlog exists to unblock and prove OpenCode's multi-turn tool-call replay path against a
live Ornith agent session. It was frozen around this live evidence: `valkey-seed-opencode-rules.mjs`
was broken by a wrong package-script path and has since been fixed; OpenCode replay/history
corruption during multi-turn tool calling remains open; Phase 3-5 graph sync and a bounded Phase 6
simulator are already proven; Topology Search (`:8101`) and TurboVec MCP (`:8792`) are soft
dependencies for this lane, not blockers.

The concrete failure this lane is chasing: a real root cause was found and fixed (2026-08-31) — the
ACP tool-listing endpoint (`GET /api/acp/tools`) always returned the full ~108-tool registry with
complete input/output schemas and examples, unfiltered, producing a 1.2MB payload that a turn-2
replay then re-embedded verbatim and blew past the 65,536-token context budget. The fix (a
query-hint-scoped tool selector, mirroring the sibling MCP server's `selectMcpToolSubset()`
pattern already proven elsewhere in this repo) has been applied and typechecks clean, but — per
`tasks.md`'s own note — the actual turn-2 Ornith replay has not yet been re-run against the fix to
confirm it now stays under budget. That re-run is a payload-size *mitigation* proof, not an
end-to-end pass, and is explicitly called out as the next concrete step before checking that box.

## What Changes

See `tasks.md` for the full P0 (unblock + prove replay) → P1 (freeze graph proof artifacts) → P2
(grounded execution lane) sequence. This proposal introduces no new task and reorders nothing.

## Capabilities

No new capability — this documents the existing OpenCode replay-proof and grounded-execution-lane
work already specified in `tasks.md`.
