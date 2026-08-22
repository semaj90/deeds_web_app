# Graphify source inventory writer plan

Status: **WRITER_IMPLEMENTED_UNPROVEN / CONTROLLED_CANARY_OPEN**

This addendum follows the read-only `CodeRevisionOwnerCanaryV1`. The planner remains the state-to-next-action contract, and the branch now contains exactly one canonical Graphify source-inventory writer plus a guarded single-file persistence/readback canary. FANOUT remains blocked until the controlled committed canary and the independent read-only owner proof both agree on `REVISION_OWNER_PROVEN`.

## Ownership

The canonical implementation is:

```text
sveltekit-frontend/src/lib/server/atlas/indexing/
  graphify-source-inventory-writer-v1.ts
```

No second Graphify revision writer was found in the repository census. Historical `drizzle/001_graphify_lineage.sql` explicitly defines the schema and states that ETL/ingest logic must populate it transactionally.

The writer creates revision evidence inside its own boundary:

```text
workspaceRevision
  = git rev-parse HEAD

CodeSourceRevisionV1
  = sha256:<sha256(exact UTF-8 source bytes)>
```

Caller-provided revision strings are not accepted as authority.

## Storage-aware revision binding

Two compatible physical layouts remain supported.

### Direct canonical layout

```text
graphify_runs.repository_revision = Git HEAD
graphify_files.source_revision     = CodeSourceRevisionV1
graphify_files.content_hash        = exact-byte SHA-256
sourceRevisionAuthorityField       = SOURCE_REVISION
```

### Historical compatibility layout

```text
graphify_runs.repository_revision = Git HEAD
graphify_files.source_revision     = legacy Git provenance
graphify_files.content_hash        = exact-byte SHA-256
CodeSourceRevisionV1               = sha256:<content_hash>
sourceRevisionAuthorityField       = CONTENT_HASH
```

The canonical writer preserves the historical meaning of `source_revision`; it does not rewrite that field to a byte hash in compatibility mode.

## Transaction semantics

The writer performs one transactionally coherent lineage operation:

```text
resolve Git HEAD + exact source bytes
        ↓
insert/read back graphify_runs
        ↓
insert/update graphify_files
        ↓
verify sourceRef + stored revision + content hash + byte length + run identity
        ↓
caller COMMIT or ROLLBACK
```

An existing `(workspace_id, source_ref, source_revision)` row may only advance `last_seen_run_id` when byte digest and byte length still agree. If the same stored identity points at different bytes, the writer fails closed with `GRAPHIFY_SOURCE_IDENTITY_CONTENT_MISMATCH`; it never overwrites the historical content identity.

PostgreSQL `INSERT ... ON CONFLICT DO UPDATE ... WHERE ... RETURNING` is deliberately used so a rejected conflict update returns no row and triggers explicit readback/mismatch handling.

## Controlled canary

```text
sveltekit-frontend/scripts/atlas/
  prove-graphify-source-inventory-writer-canary.mts
```

Default behavior is non-mutating:

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

The script refuses `NODE_ENV=production` and does not mint a workspace identity. It uses `ATLAS_GRAPHIFY_REVISION_CANARY_WORKSPACE_ID` when explicitly supplied; otherwise it reuses an existing `graphify_runs.workspace_id` from the lineage store.

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
REV-ORIGIN-01 formula                            IMPLEMENTED_UNPROVEN
REV-ORIGIN-02 historical storage semantics       STATICALLY_CONFIRMED
REV-ORIGIN-03 compatibility classifier           IMPLEMENTED_UNPROVEN
REV-OWNER-01 canonical writer                    IMPLEMENTED_UNPROVEN
REV-OWNER-02 writer unit tests                    WRITTEN_UNPROVEN
REV-OWNER-03 rolled-back persistence/readback     WRITTEN_UNPROVEN
REV-OWNER-04 one-file committed canary            WRITTEN_UNPROVEN / EXPLICIT_OPT_IN
REV-OWNER-05 independent read-only owner proof    OPEN UNTIL WORKSTATION RUN
FANOUT-01                                         BLOCKED UNTIL REVISION_OWNER_PROVEN
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

Do not begin Qdrant/cuVS/CAGRA/TurboVec FANOUT normalization merely because the writer file exists. Durable readback and the independent canary must both prove the same revision authority first.
