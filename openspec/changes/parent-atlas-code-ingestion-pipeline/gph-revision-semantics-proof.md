# GPH-14R — Structural revision semantics proof boundary

Status: **IMPLEMENTED_UNPROVEN**

Date: 2026-08-20

## Why this gate exists

The EMB3A lineage audit found that a representation writer and projection writer exist, but canonical `workspace_revision` / `source_revision` ownership is not yet populated/proven across the live packet fabric. In particular, a content digest is useful as a deterministic source correlation coordinate but is not evidence that the canonical `source_revision` owner assigned that value.

The Graphify structural migration previously used `content:<sha256>` values in a field named `sourceRevision`. The 8095 AST facade simply echoed that caller-provided value into `atlas.ast.evidence.v1.source_revision`, and the structural normalizer preserved it. That parser round trip does not create revision authority.

GPH-14R therefore freezes the following distinction before GPH-15/16 live proof and before any GPH-17 apply attempt.

```text
sourceVersionAnchor
  = deterministic source/content correlation
  = may be content-derived
  = NONCANONICAL

sourceRevision
  = canonical freshness/mutation lineage
  = nullable until its owner is proven

sourceRevisionAuthority
  = PROVEN | CONTENT_ANCHOR_ONLY | UNPROVEN
```

## Materializer rule

`GraphifyStructuralMaterializer` owns the revision-authority boundary above parser providers.

Parser providers retain their existing string-valued request field named `sourceRevision`, but that value is explicitly only an opaque parser correlation token. When canonical revision ownership is not proven the materializer supplies:

```text
anchor:<sourceVersionAnchor>
```

The materializer separately preserves:

```text
sourceRevision = null
sourceRevisionAuthority = CONTENT_ANCHOR_ONLY
```

A parser or sidecar echo of the `anchor:*` token MUST NOT upgrade it to canonical revision evidence.

## Promotion invariant

Canonical GIS promotion may be attempted only when all gates pass:

```text
native structural provenance complete
AND provider parse status = PROVEN
AND sourceRevisionAuthority = PROVEN
AND sourceRevision != null
```

Therefore the expected current EMB3A/GPH dry-run state is valid:

```text
provider status              PROVEN
structural provenance        NATIVE_READY
source revision authority    CONTENT_ANCHOR_ONLY
sourceRevision               null
canonicalPromotionAllowed    false
```

This state proves parser/structural behavior without inventing freshness lineage.

## GPH-15 and GPH-16 remain independently provable

GPH-15 proves batch failure isolation. It does not require canonical revision authority.

GPH-16 proves production delta orchestration:

```text
unchanged UPSERT -> SKIPPED_UNCHANGED
changed UPSERT   -> structural materializer
DELETE           -> explicit tombstone
```

A `GraphifyStructuralTombstoneV1` is deletion evidence only. It is not a canonical persistence deletion and carries `sourceRevision=null` until the lifecycle/revision owner proves the corresponding canonical revision.

`atlas.graphify-structural-batch.v1.revisionAuthorityPass` is intentionally expected to remain false in the current content-anchor-only proof while GPH-15/GPH-16 may still pass.

## Apply/write rule

`native-structural-materializer.mts --apply` MUST fail before any canonical evidence/entity write when:

```text
sourceRevisionAuthority != PROVEN
OR sourceRevision == null
```

Current expected failure tag:

```text
NATIVE_STRUCTURAL_APPLY_BLOCKED_SOURCE_REVISION_AUTHORITY_UNPROVEN
```

Do not enable `GRAPHIFY_NATIVE_STRUCTURAL_APPLY=1` until EMB3A or another accepted canonical lineage proof identifies and populates the real revision owner.

## Proof ladder

```text
GPH-14R revision semantics fail-closed
        |
        v
GPH-15 unit + live 8095 batch isolation
        |
        v
GPH-16 delta orchestration + tombstone emission
        |
        v
GPH-17 graphify:daily reachability
  GRAPHIFY_NATIVE_STRUCTURAL=1
  GRAPHIFY_NATIVE_STRUCTURAL_APPLY=0
        |
        +------------------------------+
        |                              |
        v                              v
GPH-18 persistence/readback      canonical revision-owner proof
        |                              |
        +---------------+--------------+
                        v
                     GPH-19
              canonical owner acceptance
```

## Workstation proof commands

From `sveltekit-frontend/` with 8095 running:

```bash
npx vitest run \
  src/lib/server/atlas/indexing/graphify-structural-materializer.spec.ts \
  src/lib/server/atlas/indexing/graphify-structural-batch-v1.spec.ts \
  src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.spec.ts

npx tsx scripts/atlas/prove-graphify-structural-batch-integration.mts
```

Expected integration gates:

```text
status                                DRY_RUN_PROVEN
gph14rRevisionSemanticsFailClosed     true
gph15ParseFailureIsolation            true
gph16ProductionDeltaOrchestration     true
sourceRevisionAuthorityProven         false
productionPersistenceReadback         false
graphifyDailyReachability              false
```

Then GPH-17 reachability only:

```bash
GRAPHIFY_NATIVE_STRUCTURAL=1 \
GRAPHIFY_NATIVE_STRUCTURAL_APPLY=0 \
GRAPHIFY_NATIVE_STRUCTURAL_LIMIT=5 \
npm run graphify:daily
```

## State accounting

```text
GPH-14R  IMPLEMENTED_UNPROVEN
GPH-15   IMPLEMENTED_UNPROVEN
GPH-16   IMPLEMENTED_UNPROVEN
GPH-17   WIRED_BEHIND_FLAG / LIVE_UNPROVEN
GPH-18   PARTIAL / BLOCKED
GPH-19   BLOCKED
revision owner  NOT_PROVEN
```

`IMPLEMENTED`, `DRY_RUN_PROVEN`, `LIVE_REACHABLE`, `APPLY_PROVEN`, `READBACK_PROVEN`, and `PROMOTED` remain distinct states.
