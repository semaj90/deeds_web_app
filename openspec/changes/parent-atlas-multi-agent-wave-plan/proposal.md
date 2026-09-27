## Why

The Parent Atlas OpenSpec portfolio has ~40 active changes at very different completion states
(from 11/11 fully closed to 4/2186 barely started). An externally-drafted supervisor/subagent plan
proposed partitioning the remaining work across ~12 concurrent workers grouped into 3 waves, with
explicit ownership-boundary rules to prevent the exact concurrent-write collisions this session
already hit twice on `parent-atlas-agentic-file-compiler` (two independent processes editing the
same registry files and the same owner-verification receipt within one session).

Before launching any of that concurrency, the plan itself needs to be (a) written down durably
rather than living only in chat/pasted text, and (b) reconciled against real current numbers —
several completion percentages in the source draft were already found stale on a spot-check
(`parent-atlas-openspec-tasks-audit-fabric` was cited as "11/12" but is actually `11/11`, fully
closed, zero open checkboxes). This change is that durable, reconciled record. It is a
coordination/governance artifact, not a code change — no implementation task in this change should
itself modify runtime code; each *assigned* wave/subagent does that under its own OpenSpec change.

## What Changes

- Record the 3-wave, ~12-worker partition of the open OpenSpec portfolio, grouped by ownership
  boundary (not raw completion percentage), with each worker's owned changes, explicit
  do-not-touch list, and required first deliverable (a read-only blocker census before any
  implementation).
- Record the cross-cutting governance rules every worker must follow (ownership-boundary
  discipline, negative-proof-is-terminal, no speculative dependency installs, no shared-file
  edits without a convergence step) as a single canonical list, not restated per-worker.
- Reconcile the source plan's cited completion numbers against the live `openspec-workboard-v1.json`
  projection and flag every discrepancy found.
- Explicitly gate actual subagent launch behind a separate, later operator go-ahead — this change
  records the plan and readiness; it does not itself authorize execution of any wave.

## Impact

- Affected specs: `multi-agent-wave-plan` (new)
- Affected code: none — this is a planning/governance document only
- Downstream: if/when a wave is launched, each subagent operates against its own already-existing
  OpenSpec changes' `tasks.md` files, not against this one
