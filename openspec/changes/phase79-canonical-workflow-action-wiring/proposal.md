# Proposal: Phase 79 canonical WorkflowActionEventV1 wiring

## Why

`workflow-action-schema-owner-01` (closed and archived 2026-09-14) reconciled four divergent
`WorkflowActionEventV1` schema definitions into one canonical owner
(`packages/parent-atlas/src/core/workflow-action-event.ts`) with three sveltekit-frontend adapters.
Its own receipt recorded an explicit, unfinished follow-up:

> "Who wires a real Phase 78/79/Kanban/A2A caller to construct/consume canonical
> WorkflowActionEventV1 events at runtime -- not done in this change, Phase 79 still emits none of
> these shapes."

`sveltekit-frontend/scripts/phase79-agentic-repair.mts` is the real, live-adjacent agentic repair
loop for Parent Atlas. Its own header comment already claims "Repair memory: append-only
analysis_pass_results through the existing pass-fabric writer" -- true, but that pass-fabric write
is not a `WorkflowActionEventV1`, so no repair attempt Phase 79 makes is visible to anything that
consumes the canonical workflow-action event stream (Kanban projection, A2A, future LangGraph
checkpoint/resume). This change closes that specific gap.

## What Changes

- Add a pure, side-effect-free builder (`scripts/phase79-canonical-workflow-action-event.mts`) that
  constructs a canonical `WorkflowActionEventV1` from a Phase 79 repair attempt's real outcome data.
- Wire `phase79-agentic-repair.mts` to call this builder and persist the resulting event through the
  **already-existing** DB-backed writer (`writeCanonicalWorkflowActionAtomically` in
  `sveltekit-frontend/src/lib/server/agent/action-writer.ts`) -- no new persistence path invented.
- This is additive observability, not a new control path: Phase 79's actual repair/mutation logic,
  `--apply`/`--dry-run` gating, and risk-level gating are untouched.

## Non-Goals (explicitly out of scope, per workflow-action-schema-owner-01's own non-goals)

- LangGraph interrupt/resume wiring (`REPAIR-DURABLE-WORKFLOW-01` / `REPAIR-HITL-APPROVAL-01`).
- Wiring Phase 79 through `FileMutationPlanV1`/`MutationApprovalReceiptV1`/`preflightFileMutation`
  (`REPAIR-MUTATION-OWNER-BINDING-01`).
- The full end-to-end `AGENTIC-REPAIR-CANARY-01` proof run.
- Any change to Phase 78, Kanban, or A2A callers -- this change only proves Phase 79 can emit a
  valid canonical event; wiring a consumer to read it back is separate future work.
