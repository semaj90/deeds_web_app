## Why

A live reachability-trace audit of the agentic repair architecture (2026-09-14) found **four
independent, real TypeScript definitions** that all declare the same schema identity literal,
`'atlas.workflow-action.v1'`, with materially different field shapes:

1. `packages/parent-atlas/src/core/workflow-action-event.ts` -- canonical resource-ref shape
   (`toolId`, `receiptId`, `producerRevision`, checksummed runtime-evidence conversion, requires
   `receiptId` for completed actions).
2. `sveltekit-frontend/src/lib/server/atlas/workflow/workflow-action-event-v1.ts` -- UI-facing
   shape (`state`, `operation`, `progress`, `ETA`, presentation data, evidence-artifact refs).
3. `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/contracts.ts` -- compiler
   lifecycle shape (`runId`, executor identity, revision envelope, `suspended`/`resumed`/
   `validated`/`materialized` events, plus a checksum).
4. `sveltekit-frontend/src/lib/server/atlas/workflow/context-tool-dag-contracts.ts` -- a fourth
   independent surface, found during this audit via a direct grep for the schema literal; not
   identified by the original architecture review that first flagged this gap.

Because all four claim the same schema identity but are not interchangeable, a repair receipt
emitted by one subsystem does not validate against another's shape. Confirmed concretely: Phase 79
(`sveltekit-frontend/scripts/phase79-agentic-repair.mts`) emits none of these four shapes at all --
it writes local, ad hoc JSON receipts via its own `writeAttemptReceipt()` -- despite its own header
comment claiming it persists into the shared `analysis_pass_results` pass-fabric writer (no such
import exists in the file). This means the workflow identity that is supposed to tie Phase 78,
Phase 79, LangGraph checkpoint/resume, Kanban, and OpenSpec receipts together does not currently
exist as one thing a caller can rely on. Reconciling this now, before more subsystems accrete their
own divergent shape under the same schema name, is the highest-priority (P0) gap identified in that
audit -- every later repair-architecture gate (durable workflow, HITL approval, mutation-owner
binding, the eventual end-to-end repair canary) depends on a single, trustworthy workflow-action
identity existing first.

## What Changes

- Establish exactly ONE canonical `WorkflowActionEventV1` schema and identity contract -- a
  superset shape capable of representing every real field currently used by the four existing
  definitions (resource refs + evidence checksums, UI presentation fields, and compiler lifecycle
  fields), not a lowest-common-denominator subset that would force a subsystem to drop information
  it actually needs.
- Classify each of the four existing definitions (plus the related adapter/recorder files already
  found: `workflow-action-event-adapter.ts`, `workflow-action-adapters.ts`,
  `temporal-action-workflow-adapter.ts`, `agentic-workflow-control-plane.ts`, `a2a-wire-v1.ts`,
  `jetstream-workflow-envelope-v1.ts`, `temporal-tool-post-dispatch-recorder.ts`,
  `temporal-post-dispatch-recorder.ts`) as `CANONICAL_OWNER`, `ADAPTER`, or `COMPATIBILITY`, per
  this repo's existing "One Canonical Runtime Owner Per Capability" governance vocabulary. No file
  is silently left ambiguous.
- Determine whether `packages/parent-atlas/src/core/workflow-execution-coordinates-v1.ts`'s
  existing `workflowActionEventSchema: z.literal('atlas.workflow-action.v1')` reference is already
  the intended identity anchor, and whether the divergence happened because the four definitions
  never actually cross-checked against it.
- Convert the three non-canonical definitions into thin adapters at their subsystem boundary
  (translate to/from the canonical shape), preserving each subsystem's internal working shape where
  that is still useful -- this is a convergence at the boundary, not a wholesale subsystem rewrite.
- **BREAKING** (schema-identity level only, not a runtime behavior change for existing callers
  outside this convergence): any future code that constructs an object claiming
  `schema: 'atlas.workflow-action.v1'` must conform to the new canonical shape (or go through an
  adapter), not to whichever of the four prior definitions it happened to import.

## Capabilities

### New Capabilities
- `workflow-action-event-identity`: the single canonical `WorkflowActionEventV1` schema, its
  validation contract, and the classification of every existing definition/adapter/consumer
  relative to it. This is the capability this whole change exists to establish.

### Modified Capabilities
(none -- no existing `openspec/specs/` capability currently governs workflow-action-event identity;
this is confirmed net-new, not a requirements change to something already specified)

## Impact

**Affected code** (8 files classified, 0 deleted -- convergence via adapters, not removal):
- `packages/parent-atlas/src/core/workflow-action-event.ts`
- `packages/parent-atlas/src/core/workflow-action-adapters.ts`
- `packages/parent-atlas/src/core/temporal-action-workflow-adapter.ts`
- `packages/parent-atlas/src/core/agentic-workflow-control-plane.ts`
- `packages/parent-atlas/src/core/a2a-wire-v1.ts`
- `packages/parent-atlas/src/core/jetstream-workflow-envelope-v1.ts`
- `packages/parent-atlas/src/core/workflow-execution-coordinates-v1.ts` (identity-anchor candidate,
  read-only check, likely no edit needed)
- `sveltekit-frontend/src/lib/server/atlas/workflow/workflow-action-event-v1.ts` (+ its `.spec.ts`)
- `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/contracts.ts`
- `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/workflow-action-event-adapter.ts`
- `sveltekit-frontend/src/lib/server/atlas/workflow/context-tool-dag-contracts.ts`
- `sveltekit-frontend/src/lib/server/atlas/temporal/temporal-tool-post-dispatch-recorder.ts` (+ spec)
- `sveltekit-frontend/src/lib/server/atlas/temporal/temporal-post-dispatch-recorder.ts` (+ spec)

**Explicitly NOT touched by this change** (separate, later gates per the source audit's own P0
ordering): LangGraph interrupt/resume wiring, Phase 79's mutation path (FileMutationPlanV1 /
MutationApprovalReceiptV1 / `preflightFileMutation`), the HMM error classifier (already corrected
via docstring in a prior pass), Mastra/Paperclip/Prime-Agent naming cleanup, and the end-to-end
`AGENTIC-REPAIR-CANARY-01` proof run.

**Dependencies**: none new -- this change reconciles existing schemas using existing tooling (Zod,
this repo's existing checksum utilities), no new package installs.
