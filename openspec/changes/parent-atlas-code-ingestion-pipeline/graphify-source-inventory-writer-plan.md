# Graphify source inventory writer plan

Status: **IMPLEMENTED_UNPROVEN**

This addendum follows the read-only `CodeRevisionOwnerCanaryV1` with a planner only. It does not execute SQL, apply a migration, bind a production writer, mutate Graphify/Qdrant, or authorize FANOUT.

## Purpose

The live canary can end in five materially different states. The next implementation must be selected from that observed state rather than guessing storage semantics or creating a second revision owner.

`GraphifySourceInventoryWritePlanV1` therefore maps the canary to exactly one safe path:

```text
BLOCKED_SCHEMA_MISSING
  -> BLOCKED_SCHEMA_DECISION_REQUIRED
  -> no target table
  -> migration review required

BLOCKED_STORAGE_SEMANTICS_MISMATCH
  -> BLOCKED_STORAGE_SEMANTICS_DECISION_REQUIRED
  -> versioned lineage schema decision required
  -> existing graphify_files.source_revision is NOT reinterpreted

REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND
  -> READY_FOR_CANONICAL_WRITER_IMPLEMENTATION
  -> existing Graphify lineage may be targeted
  -> one canonical writer may be implemented

REVISION_OWNER_READY_FOR_CONTROLLED_CANARY
  -> OWNER_ALREADY_BOUND_CONTROLLED_CANARY_REQUIRED
  -> second writer forbidden

REVISION_OWNER_PROVEN
  -> OWNER_ALREADY_PROVEN_NO_NEW_WRITER
  -> second writer forbidden
```

## Planned revision values

The planner preserves the exact values from `CodeRevisionAuthorityV1`:

```text
graphify_runs.repository_revision
  = git rev-parse HEAD

graphify_files.source_revision
  = CodeSourceRevisionV1
  = sha256(exact UTF-8 source bytes)

graphify_files.content_hash
  = exact source byte digest
```

The planner never accepts caller-provided revision coordinates as authority.

## Required writer behavior

Any future canonical Graphify source-inventory writer must satisfy all of:

```text
createsWorkspaceRevisionInsideBoundary = true
createsSourceRevisionInsideBoundary = true
acceptsCallerWorkspaceRevisionAsAuthority = false
acceptsCallerSourceRevisionAsAuthority = false
writesRunAndFileLineageTransactionally = true
exactReadbackRequiredBeforePromotion = true
```

The writer must not be implemented at all if the live storage is still classified `LEGACY_GIT_SHA` or `UNKNOWN`.

## Ownership guards

The planner intentionally carries:

```text
applyAllowed = false
canonicalWriteAttempted = false
fanoutMayConsumeAsCanonical = false
```

Even when the input canary is already `REVISION_OWNER_PROVEN`, this planner does not become the authority that enables FANOUT; consumers must use the proven canary/owner contract itself. This prevents the planning layer from becoming a second promotion authority.

## Files

```text
sveltekit-frontend/src/lib/server/atlas/indexing/
  graphify-source-inventory-write-plan-v1.ts
  graphify-source-inventory-write-plan-v1.spec.ts
```

## Validation

From `sveltekit-frontend`:

```powershell
node_modules\.bin\vitest run `
  src/lib/server/atlas/indexing/code-revision-authority-v1.spec.ts `
  src/lib/server/atlas/indexing/code-revision-owner-canary-v1.spec.ts `
  src/lib/server/atlas/indexing/graphify-source-inventory-write-plan-v1.spec.ts

npx tsx scripts/atlas/prove-code-revision-owner-canary.mts
```

The live canary remains the deciding proof. Do not implement or apply a writer until that receipt identifies the compatible path.
