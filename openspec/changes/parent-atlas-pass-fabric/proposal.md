## Why

Added 2026-09-16 — this change previously had no `proposal.md` (flagged by the
`parent-atlas-openspec-tasks-audit-fabric` audit). This file summarizes intent from `tasks.md`'s
own status header without changing any task or status recorded there.

This is the Parent Atlas Pass Fabric: detailed tasks for the analysis-pass pipeline
(`sveltekit-frontend/src/lib/server/analysis/{worker.ts,analysis-jobs.ts}`), covering batch
claiming, gate-filling, and LISTEN/NOTIFY-driven job dispatch (PF0-PF3, verified done via direct
source read as of 2026-08-11). The live-open work is packet identity: a same-day escalation found
that at least **three incompatible `packet_key` formats coexist in live code**
(`pkt:<workspaceId>:<32hex>` — orphaned, zero real callers; raw `<64hex>` — 2 real callers; and
`ace:packet:<12hex>` — high-volume, de facto dominant by file count and the format real proof data
actually emitted). This is a genuine identity-collision remediation, not a simple "wire resolver A
into writer B" task — it requires deciding which scheme is canonical (or defining a new
`PacketIdentityV1` all three collapse into) and migrating every producer/consumer to it.

## What Changes

See `tasks.md` for the full PF0-PF-N task sequence and the P0 packet-identity remediation detail.
This proposal introduces no new task.

## Capabilities

No new capability — this documents the existing analysis-pass pipeline and packet-identity
remediation work already specified in `tasks.md`.
