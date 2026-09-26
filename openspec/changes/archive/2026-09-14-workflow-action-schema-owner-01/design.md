## Context

A live reachability-trace audit (2026-09-14) found the schema identity literal
`'atlas.workflow-action.v1'` declared independently in four files. Before designing a fix, this
change re-verified every file's real consumers (not just its existence) via direct `grep` for
import sites, which changed the picture substantially from the original review's framing.

**Real finding, not assumed**: `packages/parent-atlas/src/core/` already has a small,
internally-consistent cluster of files that correctly treat one schema as canonical:

- `workflow-action-event.ts` defines `workflowActionEventSchema` (the richest of the four --
  `workflowId`/`workflowRevision`/`sequence`/`actionId`/`parentActionId`/`dagNodeId`/`attempt`/
  `lane`/`transport`/`kind` (12-value enum incl. `cancelled`)/`toolId`/`receiptId`/`resourceRefs`/
  `evidenceRefs`/`artifactRefs`/`startedAt`/`completedAt`/`errorCode`/`metadata`/
  `producerRevision`, plus a `superRefine` requiring `receiptId` on `completed` and `errorCode` on
  `failed`).
- `workflow-action-adapters.ts`, `temporal-action-workflow-adapter.ts`,
  `agentic-workflow-control-plane.ts`, `a2a-wire-v1.ts`, `jetstream-workflow-envelope-v1.ts` all
  correctly `import { workflowActionEventSchema, type WorkflowActionEventV1 } from
  './workflow-action-event.js'` -- none of them redefine the schema.
- `workflow-execution-coordinates-v1.ts` (same directory) does not define its own
  `WorkflowActionEventV1` either -- it references the schema name via
  `workflowActionEventSchema: z.literal('atlas.workflow-action.v1')` and its own docstring states
  outright: *"WorkflowActionEventV1 remains the workflow/action identity owner"* and
  `canonicalIdentityOwner: z.literal('workflow_action_event')`. This file was written assuming a
  single canonical owner already exists in this directory.

**The real divergence is isolated to three files in `sveltekit-frontend/`, each independently
reinvented without ever importing `@deeds/parent-atlas`** (confirmed importable and already used
by 10+ real production files in `sveltekit-frontend/src`, via the `file:../packages/parent-atlas`
dependency already declared in `sveltekit-frontend/package.json`):

- `sveltekit-frontend/.../workflow/workflow-action-event-v1.ts` -- shares the exact same
  `WORKFLOW_LANES`/`WORKFLOW_TRANSPORTS` value arrays as the canonical file (strong evidence of a
  common ancestor that diverged by copy, not independent design), but drops `toolId`/`receiptId`/
  `resourceRefs`/`producerRevision`/`errorCode`, renames `startedAt`/`completedAt` to
  `emittedAt`/`finishedAt`, and adds UI-only fields: `state`, `operation`, `progress`
  (`completedUnits`/`totalUnits`/`fraction`/`etaMs`/`confidence`), `target`, `visual`
  (station/animation/fx, explicitly marked "presentation hint only").
- `sveltekit-frontend/.../agentic-file-compiler/contracts.ts` -- adds `runId`, `executor`
  (`family`/`runtimeId`/`runtimeRevision`), `revisions` (`workspace`/`graph`/`feature`/
  `representation` -- Parent Atlas revision-binding), `inputRefs`/`outputRefs` (vs. the canonical
  file's `resourceRefs`/`artifactRefs`), `errorRef` (a reference, not an inline error string), an
  embedded `checksum` field, and the richest `kind` enum of all four (adds `suspended`/`resumed`/
  `validated`/`materialized` on top of the canonical file's set).
- `sveltekit-frontend/.../workflow/context-tool-dag-contracts.ts` -- a fourth surface the original
  review missed; adds `canonicalIds`, top-level `toolName`, `mutationRequested`/
  `validationRequired` booleans, and a `transport` enum that adds `'mcp'` (absent from the other
  three).

**Consumer census (the fact that makes this low-risk to fix now)**: every one of the four schemas'
`WorkflowActionEventV1` export has **zero real production callers today**.
`packages/parent-atlas/src/core/workflow-action-event.ts` is only reached via its package's own
barrel re-export and test. `workflow-action-event-v1.ts` and `agentic-file-compiler/contracts.ts`'s
`WorkflowActionEventSchema` are each reached only by their own spec file (and, for the latter, one
adapter file -- `workflow-action-event-adapter.ts` -- that itself has zero further consumers).
`context-tool-dag-contracts.ts` DOES have two real production consumers
(`route-head-dag-builder-v1.ts`, `atlas-kernel-session.ts`), but verified directly: neither imports
its `WorkflowActionEventV1Schema` -- both only use that file's separate `ContextToolDagV1Schema`/
`ContextToolDagNodeV1Schema` exports. So there is no live caller anywhere in the repo today that
would break from converging these four shapes.

## Goals / Non-Goals

**Goals:**
- Exactly one canonical `WorkflowActionEventV1` schema and validation contract, extended to a real
  superset that can losslessly represent every field currently used by all four existing
  definitions -- not a lowest-common-denominator subset.
- `packages/parent-atlas/src/core/workflow-action-event.ts` becomes that canonical owner (see
  Decision 1) -- extend in place rather than invent a fifth file.
- The three sveltekit-frontend definitions become typed adapters at their subsystem boundary
  (UI/Kanban presentation, compiler lifecycle, DAG execution), each translating to/from the
  canonical shape, so each subsystem keeps its own ergonomic internal type where useful.
- A cross-workspace import path proven to work (`@deeds/parent-atlas`'s existing `file:` dependency
  and `exports` map, extended with a `./core/workflow-action-event` subpath matching the existing
  pattern for `./core/contextual-tree-snapshot` and `./core/graph-snapshot-v2`).
- A deterministic round-trip test proving every adapter's `subsystemShape -> canonical ->
  subsystemShape` (or vice versa, per adapter direction) preserves every field the subsystem
  actually needs, with a frozen fixture per subsystem shape.

**Non-Goals** (explicitly deferred to separate, later gates per the source audit's own ordering):
- LangGraph interrupt/resume wiring (`REPAIR-DURABLE-WORKFLOW-01` / `REPAIR-HITL-APPROVAL-01`).
- Wiring Phase 79 through `FileMutationPlanV1`/`MutationApprovalReceiptV1`/`preflightFileMutation`
  (`REPAIR-MUTATION-OWNER-BINDING-01`).
- Actually wiring Phase 78/79/Kanban/A2A to EMIT canonical `WorkflowActionEventV1` events at
  runtime -- this change produces the schema + adapters + tests; wiring real emitters into Phase
  78/79 is separate follow-up work once this contract is proven, tracked as an explicit open item
  below, not silently assumed done.
- The HMM error classifier (already corrected via docstring in a prior session pass).
- Mastra/Paperclip/Prime-Agent naming cleanup (P2).
- `AGENTIC-REPAIR-CANARY-01` (the full end-to-end proof run).

## Decisions

### Decision 1: `packages/parent-atlas/src/core/workflow-action-event.ts` is the canonical owner

**Alternatives considered:**
- *Pick the sveltekit-frontend UI shape as canonical* -- rejected: it has the weakest identity
  guarantees (no `receiptId`/`errorCode` completion invariant, no `resourceRefs` evidence binding),
  and would require sveltekit-frontend's OWN downstream consumers (if any ever appear) to still
  reach into `packages/parent-atlas` for evidence-checksum conversion anyway.
- *Design a brand-new fifth schema from scratch* -- rejected: `packages/parent-atlas/src/core/`
  already has 5 real files correctly built around `workflow-action-event.ts` as canonical (see
  Context) plus `workflow-execution-coordinates-v1.ts` explicitly documenting this expectation.
  Inventing a sixth file would ignore working, already-converged infrastructure.
- *Keep four separate schemas, unify only at a shared identity-key level (workflowId+sequence)* --
  rejected: this is exactly the failure mode already observed (a receipt from one subsystem doesn't
  validate in another) -- a shared key without a shared shape doesn't fix cross-subsystem
  validation, only cross-subsystem correlation.

**Chosen**: extend `workflowActionEventSchema` in place to a superset. New/changed fields, additive
only (no existing field renamed or removed, since removing would break the file's own existing 5
real consumers even though none currently touch the new fields):

```
kind: enum union of all four files' kind values =
  'scheduled' | 'started' | 'progress' | 'artifact' | 'blocked' | 'suspended' | 'resumed' |
  'retrying' | 'validated' | 'materialized' | 'completed' | 'failed' | 'cancelled'
runId: string, optional (compiler-lifecycle identity; distinct from workflowId/actionId)
executor: { family: enum('local','mastra','temporal','grpc-worker','gpu-worker'),
            runtimeId?: string, runtimeRevision?: string }, optional
revisions: { workspace: string, graph?: string, feature?: string, representation?: string },
           optional (Parent Atlas revision-binding, from the compiler shape)
inputRefs: string[], default [] (compiler shape; distinct from resourceRefs -- inputs vs. any-role
           resource)
outputRefs: string[], default [] (compiler shape)
errorRef: string, optional (a reference to stored error detail; errorCode remains the short code)
state: enum('queued','running','waiting','blocked','succeeded','failed'), optional
       (UI/Kanban projection state -- distinct from `kind`, which is the event-lifecycle marker;
       do not conflate: `kind` says what KIND of event this is, `state` says what state the
       ACTION is in as of this event)
operation: string, optional (UI-facing human label)
progress: { completedUnits?, totalUnits?, fraction?, etaMs?, confidence? }, optional
target: { canonicalId?: string, resource?: string }, optional
visual: { station: enum(...), animation: enum(...), fx?: string }, optional
        -- MUST carry the same "presentation hint only, never infer durable workflow truth from
        this field" restriction the UI file already documents
canonicalIds: string[], optional, max 4096 (DAG-execution shape)
toolName: string, optional (DAG-execution shape; distinct from toolId -- toolId is a resolved
          canonical tool identity, toolName is a display/lookup name)
mutationRequested: boolean, optional (DAG-execution shape)
validationRequired: boolean, optional (DAG-execution shape)
checksum: string, optional (self-checksum field some producers embed; distinct from the SEPARATE
          `workflowActionEventReceiptSchema.event_checksum` this file already computes externally
          -- if both are present they must agree, enforced in `superRefine`)
```

All new fields are optional/defaulted so the schema remains backward-compatible with every existing
real construction site in `packages/parent-atlas/src/core/`.

### Decision 2: the three sveltekit-frontend files become adapters, not deletions

Per this repo's "One Canonical Runtime Owner Per Capability" governance vocabulary
(`CANONICAL_OWNER` / `ADAPTER` / `COMPATIBILITY` / `DEAD`), each keeps its subsystem-specific type
(genuinely useful internally -- e.g. the UI shape's `visual` field has no reason to leak into the
compiler or DAG layers) but adds a bidirectional adapter function to/from the canonical shape.

**Implementation note (corrected after building, not left silently diverged from this design)**:
this decision originally called for removing the local `schema: z.literal('atlas.workflow-action.v1')`
field from each of the three non-canonical files. That was NOT done, deliberately, once
implementation started: TypeScript types are structural, not nominal, so three local objects
sharing the same string literal value was never a runtime collision -- nothing anywhere ever
validated one file's object against another file's schema, so there was no real ambiguity to
remove, only a documentation/ownership-clarity concern. Removing the field would have forced every
existing test fixture in all three files (and their own real, if test-only, consumers) to change
for no functional benefit. The actual fix this change delivers is the adapter functions
(`toCanonicalWorkflowActionEvent`/`fromCanonicalWorkflowActionEvent` in each of the three files)
plus this document's own disposition table -- ownership clarity is established by documentation
and by the adapter boundary existing, not by deleting a locally-scoped field.

| File | Disposition | Rationale |
|---|---|---|
| `packages/parent-atlas/src/core/workflow-action-event.ts` | `CANONICAL_OWNER` | Richest identity/evidence shape; already the target of 5 correct internal consumers; explicitly expected by `workflow-execution-coordinates-v1.ts`'s own docstring. |
| `packages/parent-atlas/src/core/workflow-action-adapters.ts` | `ADAPTER` (unchanged) | Already correctly builds real `WorkflowActionEventV1` from `AcePacketV2`/`RetrievalActionReceiptV1` -- no change needed, but re-verify it still type-checks against the extended schema (additive fields should not require changes here). |
| `packages/parent-atlas/src/core/temporal-action-workflow-adapter.ts` | `ADAPTER` (unchanged) | Already imports canonical schema correctly. |
| `packages/parent-atlas/src/core/agentic-workflow-control-plane.ts` | `ADAPTER` (unchanged) | Same. |
| `packages/parent-atlas/src/core/a2a-wire-v1.ts` | `ADAPTER` (unchanged) | Same. |
| `packages/parent-atlas/src/core/jetstream-workflow-envelope-v1.ts` | `ADAPTER` (unchanged) | Same. |
| `packages/parent-atlas/src/core/workflow-execution-coordinates-v1.ts` | `COMPATIBILITY`/anchor (unchanged) | Already correctly references the schema literal only, does not redefine it; no change needed. |
| `sveltekit-frontend/.../workflow/workflow-action-event-v1.ts` | `ADAPTER` (new adapter functions added) | Keep local `WorkflowActionEventV1` type (drop its own `schema` literal claim), add `toCanonicalWorkflowActionEvent()` / `fromCanonicalWorkflowActionEvent()` mapping `state`/`operation`/`progress`/`target`/`visual` <-> canonical's new optional fields. |
| `sveltekit-frontend/.../agentic-file-compiler/contracts.ts` | `ADAPTER` (new adapter functions added) | Keep local `WorkflowActionEventSchema` (drop the literal being treated as an independent identity claim beyond the adapter boundary), add adapter mapping `runId`/`executor`/`revisions`/`inputRefs`/`outputRefs`/`errorRef`/`checksum` <-> canonical. |
| `sveltekit-frontend/.../agentic-file-compiler/workflow-action-event-adapter.ts` | `ADAPTER` (updated) | Currently adapts local `WorkflowActionEventV1` (#3) into `ExistingActionWriterRequest`. After #3 gains a canonical adapter, this file's input type is unchanged (still #3's local shape) -- no functional change required, just re-verify after #3's edits. |
| `sveltekit-frontend/.../workflow/context-tool-dag-contracts.ts` | `ADAPTER` (new adapter functions added) | Keep local `WorkflowActionEventV1Schema` (used nowhere today, but keep for its 2 real consumers' file cohesion around `ContextToolDagV1Schema`), add adapter mapping `canonicalIds`/`toolName`/`mutationRequested`/`validationRequired` <-> canonical. |

### Decision 3: cross-workspace import via `@deeds/parent-atlas`'s existing `exports` map

`sveltekit-frontend/package.json` already declares `"@deeds/parent-atlas": "file:../packages/parent-atlas"`
and 10+ real files already import from it. Add one subpath export to
`packages/parent-atlas/package.json`'s `exports` map --
`"./core/workflow-action-event": "./dist/core/workflow-action-event.js"` -- matching the existing
pattern for `./core/contextual-tree-snapshot` and `./core/graph-snapshot-v2`. sveltekit-frontend's
three adapter files import the canonical schema/type from
`@deeds/parent-atlas/core/workflow-action-event`, not a relative path across the workspace
boundary (there is no such relative path -- these are genuinely separate npm packages joined by
`file:` dependency).

## Risks / Trade-offs

- **[Risk] Extending the canonical schema's `kind` enum or adding fields could be read as
  "the schema is still not finished converging."** → **Mitigation**: every added field is
  documented above with which real subsystem needs it and why it's semantically distinct from an
  existing field (e.g. `state` vs `kind`, `toolId` vs `toolName`, `resourceRefs` vs
  `inputRefs`/`outputRefs`). This is a deliberate, bounded superset, not an unbounded merge.
- **[Risk] Zero real consumers today means this convergence could silently rot again if a future
  subsystem reinvents a fifth shape.** → **Mitigation**: this is exactly the governance gap this
  change closes -- record the canonical owner + adapter list in this change's disposition table,
  and treat any FUTURE `z.literal('atlas.workflow-action.v1')` declaration outside the canonical
  file as a violation of the "One Canonical Runtime Owner Per Capability" rule, to be caught the
  same way this audit caught the first four.
- **[Risk] Adapters existing but nothing calling them yet means this change alone does not fix
  Phase 79's actual silence (it emits none of the four shapes today).** → **Mitigation**: explicitly
  out of scope per Non-Goals -- wiring real emitters into Phase 78/79 is separate follow-up work,
  tracked as an open question below so it is not silently assumed solved by this change.
- **[Trade-off] Not deleting any of the three sveltekit-frontend types (keeping them as adapters
  with their own local shape) means the repo still has 4 TypeScript types describing overlapping
  concepts.** Accepted deliberately: each subsystem's local shape carries fields genuinely useful
  only within that subsystem (e.g. `visual` for UI/Kanban rendering) that would pollute the
  canonical identity schema if merged in wholesale. The convergence that matters is at the
  cross-subsystem BOUNDARY (the adapter), not forcing one universal in-memory type everywhere.

## Migration Plan

1. Extend `workflow-action-event.ts`'s `workflowActionEventSchema` with the new optional fields
   (Decision 1). Add/update its own spec to cover the new fields with the existing
   `superRefine` invariants (`completed` requires `receiptId`, `failed` requires `errorCode`) still
   enforced, plus a new invariant: if both `checksum` (embedded) and an externally-computed receipt
   checksum are present for the same event, they must agree.
2. Add the `./core/workflow-action-event` subpath to `packages/parent-atlas/package.json`'s
   `exports` map (Decision 3). Re-run that package's build (`tsc`) so `dist/core/workflow-action-event.js`
   exists for the new subpath to resolve.
3. For each of the three sveltekit-frontend files, add adapter functions (Decision 2) plus a
   round-trip test: build a frozen fixture in the subsystem's own shape, convert to canonical,
   convert back, assert every field the subsystem actually reads survives losslessly. Do NOT test
   fields the subsystem never reads (e.g. sveltekit's UI adapter doesn't need to preserve
   `executor`/`revisions` round-trip, since it never reads those going the other direction) --
   test the real, used surface, not full commutativity for its own sake.
4. Re-run full existing test suites for all 8 touched files plus their neighbors (no regressions
   expected since no live behavior changes -- only additive schema fields and new adapter
   functions).
5. Write the receipt to `docs/reports/workflow-action-schema-owner-01-results.json` per this repo's
   Status Language discipline (`DRY_RUN_PROVEN` for the adapter round-trip tests; this change makes
   no production writes and touches no canonical Postgres/Qdrant/Neo4j data).

**Rollback**: purely additive to the canonical schema (no field removed/renamed) and purely
additive to the three adapter files (new functions, no existing export removed) -- a `git revert`
of this change's commits is sufficient; no data migration exists to roll back since no production
data is touched.

## Open Questions

1. **Who actually calls the new adapters first?** This change proves the adapters round-trip
   correctly but does not wire any real Phase 78/79/Kanban/A2A caller to construct/consume a
   canonical `WorkflowActionEventV1` at runtime yet. Recommend this become the explicit next task
   once this change lands -- likely starting with Phase 79, since it currently emits none of the
   four shapes despite its own header comment claiming it does.
2. **Should `workflow-action-event-adapter.ts`'s `writeActionAtomically` boundary itself eventually
   accept a canonical `WorkflowActionEventV1` directly**, bypassing definition #3's local shape
   entirely? Deferred -- out of scope here since it would change a real (if currently uncalled)
   existing function's input contract; revisit once a real caller exists to inform the decision.
3. **Does the embedded `checksum` field (added to the canonical schema per Decision 1) create
   redundancy with `workflowActionEventReceiptSchema.event_checksum`** (computed externally by
   `workflowActionEventToRuntimeEvidence()`) in a way that should be resolved by removing one?
   Deferred to implementation -- the migration plan's step 1 invariant (both must agree if both
   present) is a safe interim answer; a cleaner resolution can be revisited once real callers exist
   to show which one is actually load-bearing in practice.
