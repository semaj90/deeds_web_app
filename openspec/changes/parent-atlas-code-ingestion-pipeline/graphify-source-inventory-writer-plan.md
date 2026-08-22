# Graphify source inventory writer plan

Status: **MIGRATION_WRITTEN_UNAPPLIED / WRITER_IMPLEMENTED_UNPROVEN / CONTROLLED_CANARY_OPEN**

This addendum follows the read-only `CodeRevisionOwnerCanaryV1`. The planner remains the state-to-next-action contract, and the branch contains exactly one canonical Graphify source-inventory writer plus a guarded single-file persistence/readback canary. FANOUT remains blocked until the manual v2 migration is reconciled onto current `main`, applied to the intended non-production proof database, one controlled row is committed, and the independent read-only owner proof reports `REVISION_OWNER_PROVEN`.

## Ownership

The canonical implementation is:

```text
sveltekit-frontend/src/lib/server/atlas/indexing/
  graphify-source-inventory-writer-v1.ts
```

No second Graphify revision writer is authorized. Historical `drizzle/001_graphify_lineage.sql` is schema intent only; it is not a revision owner and it must not be treated as if its legacy Git-oriented uniqueness keys represented current logical revision authority.

The writer creates revision evidence inside its own boundary from the actual indexed byte set:

```text
WorkspaceRevisionRecordV1
  = sha256:<SHA-256 of sorted exact-byte source manifest>

CodeSourceRevisionV1
  = sha256:<SHA-256 of exact source bytes>

baseGitCommitOid
  = Git provenance only
```

Caller-provided revision strings are not accepted as authority.

## Storage-aware revision binding

The v2 durable layout keeps Git provenance and logical byte authority in separate columns:

```text
graphify_runs.repository_revision  = base Git commit provenance
graphify_runs.workspace_revision   = WorkspaceRevisionRecordV1
graphify_runs.source_manifest_digest = unprefixed workspace manifest SHA-256

graphify_files.source_revision     = historical Git/file provenance
graphify_files.code_source_revision = CodeSourceRevisionV1
graphify_files.content_hash        = exact-byte SHA-256
graphify_files.byte_length         = exact byte length
```

Historical rows are never promoted merely because the v2 columns exist. Legacy `source_revision` remains untouched. A row becomes reusable as canonical revision evidence only when `workspace_revision`, `source_manifest_digest`, `code_source_revision`, `content_hash`, and byte length all read back consistently from a write performed by the canonical writer.

## Manual migration

The only v2 migration for this tranche is:

```text
sveltekit-frontend/drizzle/manual/
  20260822_graphify_revision_authority_v2.sql
```

It is intentionally **manual and unapplied**.

It is base-schema safe:

```text
if graphify_runs / graphify_files are absent
  → create only those two source-inventory tables

if they already exist
  → preserve historical rows and columns

then
  → add workspace_revision
  → add source_manifest_digest
  → add code_source_revision
  → add format checks
  → replace legacy Git-based uniqueness with partial logical-revision uniqueness
  → add bounded lookup/reconciliation indexes
```

The migration performs no backfill, `UPDATE`, or `DELETE`. It does not create `graphify_symbols` or `graphify_edges`; those remain a separate Graphify projection/persistence concern.

Important index ownership:

```text
UNIQUE graphify_runs
  (workspace_id, workspace_revision, parser_contract_version)
  WHERE workspace_revision IS NOT NULL

UNIQUE graphify_files
  (workspace_id, source_ref, code_source_revision)
  WHERE code_source_revision IS NOT NULL
```

Git lookup indexes remain provenance indexes only.

## Transaction semantics

The writer performs one transactionally coherent lineage operation:

```text
materialize exact workspace source manifest
        ↓
derive WorkspaceRevisionRecordV1
        ↓
select exact source binding
        ↓
derive CodeRevisionAuthorityV1
        ↓
insert/read back graphify_runs
        ↓
insert/update graphify_files
        ↓
verify sourceRef + logical revisions + Git provenance
       + content hash + byte length + run identity
        ↓
caller COMMIT or ROLLBACK
```

The writer's `ON CONFLICT` targets use the v2 partial unique indexes. A stored logical file revision may only advance `last_seen_run_id` when exact digest and byte length still agree. Identity/content mismatch fails closed.

## Controlled canary

```text
sveltekit-frontend/scripts/atlas/
  prove-graphify-source-inventory-writer-canary.mts
```

The canary now preflights table existence **before querying `graphify_runs`**. On the current known workstation state where the base tables are absent, it must produce a structured migration-required receipt rather than throwing from workspace lookup:

```text
status = GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED
canonicalWriteAttempted = false
```

After schema application, if no prior Graphify run exists and no workspace UUID can be reused, it returns:

```text
status = GRAPHIFY_CANARY_WORKSPACE_ID_REQUIRED
canonicalWriteAttempted = false
```

and requires explicit:

```text
ATLAS_GRAPHIFY_REVISION_CANARY_WORKSPACE_ID=<non-production workspace UUID>
```

Default behavior remains non-mutating:

```text
READY_CANARY_DISABLED
canonicalWriteAttempted = false
```

Enable a rolled-back write/readback proof:

```powershell
$env:ATLAS_GRAPHIFY_REVISION_CANARY='1'
npx tsx scripts/atlas/prove-graphify-source-inventory-writer-canary.mts
Remove-Item Env:ATLAS_GRAPHIFY_REVISION_CANARY
```

Expected status:

```text
GRAPHIFY_REVISION_OWNER_WRITE_READBACK_PROVEN_ROLLED_BACK
```

A durable single-file canary additionally requires explicit opt-in in the intended non-production proof database:

```powershell
$env:ATLAS_GRAPHIFY_REVISION_CANARY='1'
$env:ATLAS_GRAPHIFY_REVISION_CANARY_COMMIT='1'
npx tsx scripts/atlas/prove-graphify-source-inventory-writer-canary.mts
Remove-Item Env:ATLAS_GRAPHIFY_REVISION_CANARY_COMMIT
Remove-Item Env:ATLAS_GRAPHIFY_REVISION_CANARY
```

Expected status:

```text
GRAPHIFY_REVISION_OWNER_CONTROLLED_PERSISTENCE_COMMITTED
```

The script refuses `NODE_ENV=production` and never invents a workspace identity.

After the committed canary, rerun:

```powershell
npx tsx scripts/atlas/prove-code-revision-owner-canary.mts
```

Only this independent read-only result closes the owner gate:

```text
status = REVISION_OWNER_PROVEN
revisionOwnerProven = true
fanoutMayConsumeAsCanonical = true
```

## Gates

```text
REV-ORIGIN-01 exact byte/source manifest formulas       IMPLEMENTED_UNPROVEN
REV-ORIGIN-02 Git provenance separation                 STATICALLY_CONFIRMED
REV-ORIGIN-03 compatibility classifier                  IMPLEMENTED_UNPROVEN
REV-MIG-01 v2 base-schema-safe migration                WRITTEN_UNAPPLIED
REV-MIG-02 logical revision partial unique indexes       WRITTEN_UNAPPLIED
REV-MIG-03 lookup/reconciliation indexes                 WRITTEN_UNAPPLIED
REV-OWNER-01 canonical writer                           IMPLEMENTED_UNPROVEN
REV-OWNER-02 writer unit tests                          WRITTEN_UNPROVEN
REV-OWNER-03 rolled-back persistence/readback            WRITTEN_UNPROVEN
REV-OWNER-04 one-file committed canary                  WRITTEN_UNPROVEN / EXPLICIT_OPT_IN
REV-OWNER-05 independent read-only owner proof           OPEN UNTIL WORKSTATION RUN
FANOUT-01                                                BLOCKED UNTIL REVISION_OWNER_PROVEN
```

## Required promotion order

```text
reconcile branch with current main
  ↓
review manual migration diff
  ↓
apply migration to intended NON-PRODUCTION proof DB only
  ↓
prove-code-revision-owner-canary.mts
  ↓
require v2 columns present, persistedMatchingRows = 0
  ↓
rolled-back writer canary
  ↓
review receipt
  ↓
explicit one-row committed writer canary
  ↓
independent read-only owner canary
  ↓
REVISION_OWNER_PROVEN
  ↓
FANOUT-01 may consume workspace/source revisions
```

## Validation

From `sveltekit-frontend`:

```powershell
node_modules\.bin\vitest run `
  src/lib/server/atlas/indexing/code-revision-authority-v1.spec.ts `
  src/lib/server/atlas/indexing/code-revision-owner-canary-v1.spec.ts `
  src/lib/server/atlas/indexing/graphify-source-inventory-write-plan-v1.spec.ts `
  src/lib/server/atlas/indexing/graphify-source-inventory-writer-v1.spec.ts

npx tsx scripts/atlas/prove-code-revision-owner-canary.mts
npx tsx scripts/atlas/prove-graphify-source-inventory-writer-canary.mts
```

Do not begin Qdrant/cuVS/CAGRA/TurboVec FANOUT normalization merely because the migration, writer, or indexes exist. Durable exact readback and the independent canary must both prove the same revision authority first.
