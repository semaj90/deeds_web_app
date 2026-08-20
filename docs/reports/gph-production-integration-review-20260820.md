# GPH production integration review — 2026-08-20

## Scope

This review is the PROOF MODE integration receipt for the current Graphify structural-owner migration. It reconciles the live startup wiring, the production-oriented batch/delta contract, the node-tree-sitter challenger work, and the EMB3A revision-owner audit.

The central correction from this pass is that a content digest is a useful deterministic `sourceVersionAnchor`, but it is **not** canonical `source_revision` authority.

## Progress accounting

Two percentages remain intentionally separate:

- **Strict canonical checklist completion: 44%** — canonical checked GPH tasks only; duplicate aliases are excluded.
- **Evidence-weighted implementation/proof readiness: ~56%** — gives partial credit to GPH-15/GPH-16 implementation and opt-in GPH-17 wiring. It is not equivalent to `PROVEN` or owner promotion.

## Current gate reconciliation

| Gate | Current state | Evidence / next requirement |
|---|---|---|
| GPH-14R | IMPLEMENTED_UNPROVEN | Revision semantics now distinguish canonical `sourceRevision` from noncanonical `sourceVersionAnchor`; promotion fails closed while authority is unproven. Execute focused tests. |
| GPH-15 | IMPLEMENTED_UNPROVEN | Production-oriented batch contract isolates per-file failures; existing sidecar isolation evidence exists. Needs focused tests + live 8095 batch receipt. |
| GPH-16 | IMPLEMENTED_UNPROVEN | Same batch supports unchanged skip, changed re-extraction and explicit tombstones. Native old-tree reuse remains a later executor optimization. Needs focused tests + live 8095 delta receipt. |
| GPH-17 | WIRED_BEHIND_FLAG / LIVE_UNPROVEN | `run-graphify-daily-startup.mjs` invokes the native structural stage when `GRAPHIFY_NATIVE_STRUCTURAL=1`. Reachability must be proven with APPLY disabled. |
| GPH-18 | PARTIAL / BLOCKED | Production persistence/readback is still pending and canonical writes are now explicitly blocked while source-revision authority is unproven. |
| GPH-19 | BLOCKED | Requires GPH-15/16, GPH-17 reachability, GPH-18 readback, canonical revision ownership, and identity invariants. |
| GPH-20 | BLOCKED | Legacy cannot become `SUPERSEDED` before GPH-19 acceptance. |
| GPH-21 | PARTIAL_PROVEN | Ownership audit can observe imports; CI supersession guard remains pending. |
| GPH-22 | OPEN | Recommendation state remains advisory only. |
| GPH-35 | DEFERRED | Cleanup only after supersession recovery-window proof. |

## Live startup correction

The old note that the replacement was not wired is stale. Current `graphify:daily` has an opt-in structural stage:

```text
graphify:daily
  -> graphify:daily:chain
  -> if GRAPHIFY_NATIVE_STRUCTURAL=1
       -> native-structural-materializer.mts
```

The environment flags remain intentionally separate:

```text
GRAPHIFY_NATIVE_STRUCTURAL=1
  enables the stage

GRAPHIFY_NATIVE_STRUCTURAL_APPLY=1
  requests canonical writes

GRAPHIFY_NATIVE_STRUCTURAL_ALLOW_CREATE_SYMBOLS=1
  additionally permits GIS symbol creation
```

This is migration wiring, not canonical-owner acceptance.

## GPH-14R — revision authority correction

The EMB3A lineage audit established that the representation/projection writers do not currently prove populated canonical workspace/source revision authority. That finding applies directly to Graphify.

Before this correction the native structural script used:

```text
content:<sha256(source)>
```

as a value named `sourceRevision`, and the 8095 sidecar echoed the caller-supplied value into `atlas.ast.evidence.v1.source_revision`. The normalizer then preserved it. That round trip is parser correlation, not revision authority.

The owner boundary now distinguishes:

```text
sourceVersionAnchor
  deterministic correlation coordinate
  may be content-derived
  NONCANONICAL

sourceRevision
  canonical mutation/freshness lineage
  nullable until owner is proven

sourceRevisionAuthority
  PROVEN | CONTENT_ANCHOR_ONLY | UNPROVEN
```

Parser providers still receive their legacy string request field. When authority is not proven, `GraphifyStructuralMaterializer` supplies an explicitly tagged parser token:

```text
anchor:<sourceVersionAnchor>
```

while retaining:

```text
sourceRevision = null
sourceRevisionAuthority = CONTENT_ANCHOR_ONLY
```

The parser token may be echoed in raw/normalized parser evidence, but it cannot become canonical lineage merely because it completed a round trip through 8095 or the node-tree-sitter challenger.

## Promotion invariant

`canonicalPromotionAllowed=true` now requires all of:

```text
native structural provenance complete
AND parser status = PROVEN
AND sourceRevisionAuthority = PROVEN
AND sourceRevision != null
```

Therefore the expected current dry-run state is:

```text
structural status              PROVEN
provenance readiness           NATIVE_READY
source revision authority      CONTENT_ANCHOR_ONLY
sourceRevision                 null
canonicalPromotionAllowed      false
```

This is an intended fail-closed state, not a failed parser proof.

## Production batch contract

`runGraphifyStructuralBatchV1` now makes both orchestration and revision state explicit:

```text
GraphifyStructuralDeltaInputV1
  UPSERT | DELETE
        |
        v
runGraphifyStructuralBatchV1
        |
        +-- unchanged hash -> SKIPPED_UNCHANGED
        +-- changed source -> GraphifyStructuralMaterializer
        +-- parser/file error -> FAILED receipt; neighbors continue
        +-- DELETE -> GraphifyStructuralTombstoneV1
        |
        v
atlas.graphify-structural-batch.v1
        |
        +-- isolatedFailurePass
        +-- incrementalDeltaPass
        +-- revisionAuthorityPass
```

In the current content-anchor-only proof:

```text
isolatedFailurePass     may become true
incrementalDeltaPass    may become true
revisionAuthorityPass   expected false
```

The batch does not persist canonical identity and does not invent a deletion-persistence owner. Tombstones are downstream deletion observations with `sourceRevision=null` until the lifecycle/revision owner proves canonical deletion lineage.

## Apply safety

`native-structural-materializer.mts --apply` now fails before canonical evidence/entity writes unless:

```text
sourceRevisionAuthority == PROVEN
AND sourceRevision != null
```

Current expected block:

```text
NATIVE_STRUCTURAL_APPLY_BLOCKED_SOURCE_REVISION_AUTHORITY_UNPROVEN
```

Do **not** enable `GRAPHIFY_NATIVE_STRUCTURAL_APPLY=1` in the current repository state.

## Provider challenger boundary

The node-tree-sitter challenger remains a parser/executor experiment, not a revision or identity owner.

Provider parity now runs with:

```text
sourceRevision = null
sourceVersionAnchor = proof fixture anchor
sourceRevisionAuthority = CONTENT_ANCHOR_ONLY
```

Both 8095 and node-tree-sitter receive the same tagged parser token. A parity PASS proves fixture syntax/span/diagnostic behavior only. It does not prove canonical revision identity or authorize provider promotion.

Native Tree-sitter old-tree reuse remains separate from GPH-16 correctness:

```text
GPH-16A  production delta orchestration
GPH-16B  Tree.edit + oldTree incremental reuse optimization
```

Correct changed/delete semantics must not wait for native tree reuse.

## Scaffold reconciliation

The archived `parent-atlas-event-merkle-identity-pack` remains reference material only. Its event family overlaps the stronger live `WorkflowActionEventV1`; its graph identity proposal must not replace GIS identity; its daily compiler is stale relative to current Graphify/QAS orchestration; SQL remains template-only; and the historical execution-order document contains older representation assumptions.

The package was archived rather than imported as a second runtime application owner.

## Exact next proof order

From `sveltekit-frontend/`, with 8095 running:

```bash
npx vitest run \
  src/lib/server/atlas/indexing/graphify-structural-materializer.spec.ts \
  src/lib/server/atlas/indexing/graphify-structural-batch-v1.spec.ts \
  src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.spec.ts
```

Then:

```bash
npx tsx scripts/atlas/prove-graphify-structural-batch-integration.mts
```

Required integration result:

```text
status                                DRY_RUN_PROVEN
gph14rRevisionSemanticsFailClosed     true
gph15ParseFailureIsolation            true
gph16ProductionDeltaOrchestration     true
sourceRevisionAuthorityProven         false
productionPersistenceReadback         false
graphifyDailyReachability              false
```

Only then run GPH-17 reachability:

```bash
GRAPHIFY_NATIVE_STRUCTURAL=1 \
GRAPHIFY_NATIVE_STRUCTURAL_APPLY=0 \
GRAPHIFY_NATIVE_STRUCTURAL_LIMIT=5 \
npm run graphify:daily
```

Do not advance to apply/readback until a separate accepted proof establishes the canonical revision owner.

## Promotion order after dry-run proof

```text
GPH-14R  fail-closed revision semantics
   -> GPH-15 parse isolation
   -> GPH-16 delta orchestration
   -> GPH-17 live dry-run reachability
          |
          +--------------------------+
          |                          |
          v                          v
       GPH-18                  revision-owner proof
   persistence/readback               |
          +-------------+-------------+
                        v
                     GPH-19
              canonical owner acceptance
                        |
                        v
                  GPH-20/GPH-21
              supersession + import guard
```

## Promotion rule

`IMPLEMENTED`, `WIRED`, `DRY_RUN_PROVEN`, `LIVE_REACHABLE`, `APPLY_PROVEN`, `READBACK_PROVEN`, and `PROMOTED` are different states. Source code existence, parser success, or a content hash must never be used as a substitute for canonical revision authority.
