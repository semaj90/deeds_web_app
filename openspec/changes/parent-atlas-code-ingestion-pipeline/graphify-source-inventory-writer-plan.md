# Graphify source inventory writer plan

Status: **IMPLEMENTED_UNPROVEN**

This addendum follows the read-only `CodeRevisionOwnerCanaryV1` with a planner only. It does not execute SQL, apply a migration, bind a production writer, mutate Graphify/Qdrant, or authorize FANOUT.

## Purpose

The live canary can end in five materially different states. The next implementation must be selected from that observed state rather than guessing storage semantics or creating a second revision owner.

`GraphifySourceInventoryWritePlanV1` maps the canary to exactly one safe path:

```text
BLOCKED_SCHEMA_MISSING
  -> BLOCKED_SCHEMA_DECISION_REQUIRED
  -> no target table
  -> migration review required

BLOCKED_STORAGE_SEMANTICS_MISMATCH
  -> BLOCKED_STORAGE_SEMANTICS_DECISION_REQUIRED
  -> versioned lineage storage review
  -> historical graphify_files.source_revision is NOT reinterpreted

REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND
  -> READY_FOR_CANONICAL_WRITER_IMPLEMENTATION
  -> existing Graphify lineage may be targeted
  -> source revision authority column comes from the canary
  -> one canonical writer may be implemented

REVISION_OWNER_READY_FOR_CONTROLLED_CANARY
  -> OWNER_ALREADY_BOUND_CONTROLLED_CANARY_REQUIRED
  -> second writer forbidden

REVISION_OWNER_PROVEN
  -> OWNER_ALREADY_PROVEN_NO_NEW_WRITER
  -> second writer forbidden
```

## Storage-aware revision binding

The historical Graphify schema separates Git provenance from byte identity. The writer plan therefore does not hard-code `graphify_files.source_revision` as the current byte-revision authority.

Two compatible layouts are supported:

```text
Direct canonical layout
  graphify_runs.repository_revision = git rev-parse HEAD
  graphify_files.source_revision     = sha256:<exact-byte digest>
  sourceRevisionAuthorityColumn      = source_revision

Historical compatibility layout
  graphify_runs.repository_revision = git rev-parse HEAD
  graphify_files.source_revision     = historical Git provenance
  graphify_files.content_hash        = exact-byte SHA-256 digest
  sourceRevisionAuthorityColumn      = content_hash
  canonical CodeSourceRevisionV1     = sha256:<content_hash>
```

The planner records both:

```text
sourceRevisionAuthorityColumn
legacySourceRevisionColumn = source_revision
```

so a future writer cannot accidentally overwrite the legacy Git-provenance column when `content_hash` is the authority field.

## Planned revision values

The planner preserves the exact values from `CodeRevisionAuthorityV1`:

```text
workspaceRevision
  = git rev-parse HEAD

sourceRevision
  = CodeSourceRevisionV1
  = sha256:<sha256(exact UTF-8 source bytes)>

contentDigest
  = exact source-byte SHA-256 digest
```

Those logical values are independent of which compatible physical Graphify column carries byte authority.

The planner never accepts caller-provided revision coordinates as authority.

## Required writer behavior

Any future canonical Graphify source-inventory writer must satisfy all of:

```text
createsWorkspaceRevisionInsideBoundary = true
createsSourceRevisionInsideBoundary = true
preservesLegacySourceRevisionSemantics = true
acceptsCallerWorkspaceRevisionAsAuthority = false
acceptsCallerSourceRevisionAsAuthority = false
writesRunAndFileLineageTransactionally = true
exactReadbackRequiredBeforePromotion = true
```

A compatibility layout using legacy Git `source_revision` plus valid SHA-256 `content_hash` does not require a migration merely for revision naming. Mixed/unknown storage or legacy Git rows lacking a byte digest remain blocked.

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

The live canary remains the deciding proof. Do not implement or apply a writer until that receipt identifies the compatible authority field and confirms that no durable owner is already bound.
