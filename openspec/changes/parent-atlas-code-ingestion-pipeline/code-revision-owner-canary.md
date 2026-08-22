# Code revision owner canary

Status: **IMPLEMENTED_UNPROVEN**

This tranche exists to unblock revision authority correctly before `FANOUT-01`. It does **not** change canonical graph rows, enable native structural APPLY, backfill revisions, or authorize Qdrant/cuVS/CAGRA/TurboVec fanout.

## Decision

The repository already has an explicit code-source revision contract:

```text
CodeSourceRevisionV1
  sourceRevision = sha256(exact UTF-8 source bytes)
```

The workspace revision origin is:

```text
git rev-parse HEAD
```

Both values must be created inside the revision writer boundary. Callers are not allowed to inject either coordinate and then have the writer treat that value as authority.

The origin contract is:

```text
CodeRevisionAuthorityV1
  workspaceRevisionKind = GIT_COMMIT_SHA
  sourceRevisionKind = SHA256_EXACT_UTF8_SOURCE_BYTES
  workspaceRevisionCreatedByWriter = true
  sourceRevisionCreatedByWriter = true
  callerSuppliedWorkspaceRevisionAccepted = false
  callerSuppliedSourceRevisionAccepted = false
```

The contract defaults to `canonicalWritesAllowed=false`.

## Historical Graphify storage compatibility

`drizzle/001_graphify_lineage.sql` already separates two revision concepts:

```text
graphify_runs.repository_revision = Git commit SHA
graphify_files.source_revision    = Git provenance coordinate for the file
graphify_files.content_hash       = SHA-256 of the file content
```

Current `CodeSourceRevisionV1` is the exact-byte SHA-256, encoded as:

```text
sha256:<content digest>
```

Therefore the historical `source_revision` column does **not** need to be reinterpreted or overwritten merely to support the current source-revision contract. The existing `content_hash` field can be the durable byte-authority field while `source_revision` preserves its historical Git-provenance meaning.

The read-only canary now recognizes these layouts:

```text
CODE_SOURCE_REVISION_V1
  sourceRevisionAuthorityField = SOURCE_REVISION

LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1
  sourceRevisionAuthorityField = CONTENT_HASH

LEGACY_GIT_SHA
  sourceRevisionAuthorityField = NONE

UNKNOWN
  sourceRevisionAuthorityField = NONE
```

`LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1` is storage-compatible: `CodeSourceRevisionV1` can be reconstructed exactly as `sha256:<content_hash>` without changing historical column semantics.

`LEGACY_GIT_SHA` without a valid SHA-256 `content_hash`, `UNKNOWN`, or an authority-field mismatch still blocks owner promotion.

This compatibility decision does **not** prove durable ownership. A legacy row having a content hash is only stored evidence; the canonical production writer must still prove that it creates the workspace Git revision and source byte digest itself.

## Production writer census

Repository search found no trustworthy currently enrolled production Graphify revision-origin writer. The known legacy `scripts/atlas/index-engine.ts` accepts revision data from its caller and therefore cannot establish writer-origin authority.

The canary intentionally reports:

```text
productionWriterPath = null
productionWriterPresent = false
```

until a canonical Graphify source-inventory writer is explicitly integrated.

## Canary status model

`CodeRevisionOwnerCanaryV1` separates deterministic semantics from durable ownership:

```text
REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND
REVISION_OWNER_READY_FOR_CONTROLLED_CANARY
REVISION_OWNER_PROVEN
BLOCKED_SCHEMA_MISSING
BLOCKED_STORAGE_SEMANTICS_MISMATCH
```

`fanoutMayConsumeAsCanonical=true` is possible **only** for `REVISION_OWNER_PROVEN`.

That final state requires all of:

1. Graphify lineage schema exists with required columns.
2. source byte authority is available through either:
   - canonical `source_revision = sha256:<digest>`, or
   - legacy Git `source_revision` plus SHA-256 `content_hash` authority.
3. an enrolled production writer creates both workspace and source revision coordinates itself.
4. at least one controlled persisted row reads back with the exact computed workspace revision, source ref, and exact-byte digest under the selected authority field.

A deterministic Git/SHA calculation, historical content hash, or populated column without writer-origin proof is not enough.

## Read-only proof

Implemented:

```text
sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-authority-v1.ts
sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-authority-v1.spec.ts
sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-owner-canary-v1.ts
sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-owner-canary-v1.spec.ts
sveltekit-frontend/scripts/atlas/prove-code-revision-owner-canary.mts
```

The proof:

1. computes Git HEAD from the repository itself;
2. reads one real source file;
3. derives `CodeSourceRevisionV1` from exact bytes;
4. opens Postgres with `BEGIN READ ONLY`;
5. inspects `graphify_runs` / `graphify_files` existence and columns;
6. samples `source_revision` and `content_hash` together;
7. selects `SOURCE_REVISION`, `CONTENT_HASH`, or `NONE` as the byte-authority field without redefining historical data;
8. checks whether an exactly matching persisted lineage row already exists under that layout;
9. emits the canary receipt;
10. rolls back and performs no canonical write.

Until a writer is enrolled, a healthy compatibility result is expected to remain blocked at:

```text
REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND
```

A `BLOCKED_STORAGE_SEMANTICS_MISMATCH` result should now mean the live rows truly lack a usable exact-byte authority or have mixed/unknown semantics, rather than merely using the documented legacy Git `source_revision` field.

## Validation

From `sveltekit-frontend`:

```powershell
node_modules\.bin\vitest run `
  src/lib/server/atlas/indexing/code-revision-authority-v1.spec.ts `
  src/lib/server/atlas/indexing/code-revision-owner-canary-v1.spec.ts

npx tsx scripts/atlas/prove-code-revision-owner-canary.mts
```

Do not set `ATLAS_SOURCE_REVISION_OWNER_PROVEN=1`, do not enable `GRAPHIFY_NATIVE_STRUCTURAL_APPLY=1`, and do not mutate Graphify/Qdrant data merely to make the receipt green.

## Next tranche after this proof runs

Use the live receipt to choose exactly one path:

```text
schema missing
  -> additive lineage migration review

legacy Git source_revision + valid SHA-256 content_hash
  -> storage is compatible; integrate canonical revision-origin writer

legacy Git source_revision without valid content hash / mixed semantics
  -> explicit storage repair or additive migration review

compatible storage but writer absent
  -> integrate CodeRevisionAuthorityV1 into canonical Graphify source inventory writer

writer + compatible storage
  -> controlled single-file persistence/readback canary
```

Only after `REVISION_OWNER_PROVEN` may `GraphViewNodeV1` / graph snapshots be revision-qualified for canonical consumption and `FANOUT-01` normalize Qdrant/cuVS/CAGRA/TurboVec results to the canonical `CandidateOrdinal` fabric.
