# GPH production integration review — 2026-08-20

## Scope

This review is the entry receipt for PROOF MODE after the 2026-08-20 merge of PR #9.
It reconciles the current Graphify AST hardening gates with the merged repository and classifies the stray top-level scaffold package before any runtime import/move.

## Progress accounting

Two percentages are intentionally reported:

- **Strict canonical checklist completion: 44%** — 11 completed canonical tasks out of GPH-01..GPH-24 plus GPH-35 (25 tasks), excluding duplicate aliases GPH-25..GPH-34.
- **Evidence-weighted readiness: ~56%** — gives partial credit to GPH-15/GPH-16 proof evidence and the now-present opt-in GPH-17 daily wiring. This is an engineering-readiness estimate, **not** a promotion/proof state.

Never use duplicate alias checkboxes to claim lifecycle completion.

## Current gate reconciliation

| Gate | Current state | Evidence / next requirement |
|---|---|---|
| GPH-15 | PARTIAL_PROVEN | Sidecar 4-file isolation proof exists; production native materializer also catches per-file failures. New `graphify-structural-batch-v1` contract makes isolation explicit. Needs live production-owner invocation + receipt. |
| GPH-16 | PARTIAL_PROVEN | Bounded skip/reextract/delete proof exists. New batch contract accepts explicit UPSERT/DELETE and emits tombstones. Production delta-manifest invocation + tombstone handoff/readback remain. |
| GPH-17 | IMPLEMENTED_BEHIND_MIGRATION_FLAG | `run-graphify-daily-startup.mjs` now invokes `native-structural-materializer.mts` when `GRAPHIFY_NATIVE_STRUCTURAL=1`. Needs live reachability receipt, canonical-owner acceptance, and explicit fallback policy. |
| GPH-18 | PARTIAL_IMPLEMENTED | `atlas.native-structural-materialization-run.v1` already records engine-facing status, counts, failures, evidence/symbol writes and checksum. Must be reconciled into the production Graphify receipt with projection/persistence evidence. |
| GPH-19 | BLOCKED | Requires GPH-15/16 production proof + GPH-17/18 accepted live owner/receipt + parity/identity invariants. |
| GPH-20 | BLOCKED | Legacy cannot become SUPERSEDED until every GPH-19 gate passes. |
| GPH-21 | PARTIAL_PROVEN | Ownership audit can detect imports; dedicated CI regression guard remains pending and must only enforce after SUPERSEDED. |
| GPH-22 | OPEN | Recommendation receipt must remain advisory and may not mutate canonical Graphify truth. |
| GPH-35 | DEFERRED | Cleanup only after supersession recovery window, digest/reason evidence and rollback instructions. |

## Important merged-code correction

The older 2026-08-14 note saying the replacement was not wired is stale relative to current `main`.
The real startup wrapper now has an opt-in native structural stage:

```text
graphify:daily
  -> graphify:daily:chain
  -> if GRAPHIFY_NATIVE_STRUCTURAL=1
       build @deeds/parent-atlas
       -> native-structural-materializer.mts
```

`GRAPHIFY_NATIVE_STRUCTURAL_APPLY=1` controls writes and
`GRAPHIFY_NATIVE_STRUCTURAL_ALLOW_CREATE_SYMBOLS=1` separately controls GIS symbol creation.
This is migration wiring, not yet canonical-owner acceptance.

## New proof implementation on agent/gph-production-integration-proof

Added live-owner-compatible orchestration:

```text
GraphifyStructuralDeltaInputV1
  UPSERT | DELETE
        |
        v
runGraphifyStructuralBatchV1
        |
        +-- unchanged hash -> SKIPPED_UNCHANGED
        +-- changed source -> existing GraphifyStructuralMaterializer -> 8095
        +-- parser/file error -> FAILED file receipt, batch continues
        +-- DELETE -> explicit GraphifyStructuralTombstoneV1
        |
        v
atlas.graphify-structural-batch.v1 receipt
```

The batch layer does **not** persist canonical identity and does not invent a deletion persistence owner.
Tombstones are explicit downstream facts for the existing lifecycle/persistence owner to consume.

Contract tests are written for:

1. failed file between two valid files does not abort neighbors;
2. one delta contains skip-unchanged + changed re-extraction + deletion tombstone;
3. duplicate normalized source refs fail before double processing.

Tests remain IMPLEMENTED_UNPROVEN until executed in the actual SvelteKit test environment.

## Tree-sitter proof distinction

GPH-16 has two distinct concepts:

1. **Production delta orchestration** — changed/deleted source inputs reach the canonical Graphify structural owner, unchanged files can be skipped, and deletion is explicit. This is required for Graphify integration.
2. **Native parser incremental reuse** — edit/reuse a prior Tree-sitter tree and inspect changed ranges. This is an executor optimization/proof and must not be confused with changed-file orchestration.

Do not block correct deletion/tombstone semantics on implementation of parser-tree reuse.

## Stray scaffold reconciliation

Source pack:

`parent-atlas-event-merkle-identity-pack/parent-atlas-event-merkle-identity-pack/`

Its own MANIFEST states it is a scaffold/contract pack and is not evidence that the listed runtime files are missing. It must not be bulk-imported.

| Scaffold area | Classification | Correct treatment |
|---|---|---|
| `src/contracts/events.ts` | OVERLAPS_LIVE_OWNER | Do not import wholesale. Live `WorkflowActionEventV1` exists in `sveltekit-frontend/src/lib/server/atlas/workflow` and `packages/parent-atlas/src/core`. Adapt only missing event-lineage concepts under those owners after contract review. |
| `src/contracts/graph-identity.ts` | PROPOSAL_ONLY | Do not mint a second identity system. Reconcile useful inventory/audit fields against canonical chunk/GIS/symbol contracts first. |
| `src/contracts/merkle.ts` | PROPOSAL_CANDIDATE | No exact live-name collision found in this review, but Merkle hashing must reuse existing stable/canonical hashing semantics before import. |
| `src/daily/kanban-contracts.ts` | PROPOSAL_ONLY | Do not install as a parallel daily/Kanban owner. Map recommendation fields to existing Kanban/recommendation contracts. |
| `src/daily/parent-atlas-daily-compiler.ts` | SUPERSEDED_BY_LIVE_ORCHESTRATION_SHAPE | Do not install. Current Graphify/startup/QAS flows already own daily orchestration. |
| `sql/*.sql` | TEMPLATE_ONLY | Never apply directly. Reconcile against live schema/migration owners first. |
| `docs/EXECUTION_ORDER.md` | HISTORICAL | Contains stale `semantic_768` assumptions; retain only as archive evidence. |
| Merkle implementation/tests | REVIEW_REQUIRED | Potentially reusable only after stable-hash/RFC9162 collision and deterministic-vector review. |

### Consolidation decision

The scaffold package should be moved under the repository archive convention after its useful primitives are reconciled. It should not remain a second top-level pseudo-application root. Runtime imports must point only at the live `sveltekit-frontend/` or `packages/parent-atlas/` owners.

No scaffold SQL or daily compiler is authorized for runtime promotion by this review.

## Next proof order

```text
1. Execute graphify-structural-batch-v1.spec.ts
2. Live 8095 production-batch isolation receipt (GPH-15)
3. Wire/read explicit delta manifest through native structural script (GPH-16)
4. Live graphify:daily with GRAPHIFY_NATIVE_STRUCTURAL=1, dry-run first (GPH-17 reachability)
5. Reconcile structural receipt into existing Graphify production receipt (GPH-18)
6. Apply/readback only after dry-run receipts pass
7. GPH-19 ownership acceptance
8. GPH-20/21 supersession + CI import guard
9. GPH-22 advisory recommendation receipt
```

## Promotion rule

`IMPLEMENTED`, `WIRED`, `DRY_RUN_PROVEN`, `APPLY_PROVEN`, `READBACK_PROVEN`, and `PROMOTED` are separate states. Do not mark a checkbox complete merely because source code exists.
