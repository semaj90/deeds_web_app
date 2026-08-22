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

The new origin contract is:

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

## Important historical schema conflict

`drizzle/001_graphify_lineage.sql` describes:

```text
graphify_runs.repository_revision = Git commit SHA
graphify_files.source_revision    = specific Git SHA when file was seen
```

The latter is not the same semantic contract as current `CodeSourceRevisionV1`.

Therefore this tranche **must not** silently start writing `sha256:<digest>` into an existing `graphify_files.source_revision` column whose populated rows use Git-SHA semantics. The live read-only canary classifies existing values as one of:

```text
CODE_SOURCE_REVISION_V1
LEGACY_GIT_SHA
UNKNOWN
```

`LEGACY_GIT_SHA` and `UNKNOWN` block owner promotion. A later migration/writer decision must reconcile the storage semantic explicitly.

## Production writer census

Repository search found no trustworthy currently enrolled production `graphify_files` revision-origin writer. The only direct `graphifyFiles` implementation surface found is the legacy `scripts/atlas/index-engine.ts`, which is already known to be corrupted/interleaved and accepts `FileCandidate.sourceRevision` from its caller.

That file is therefore not a revision authority owner and is not used by this tranche.

The canary intentionally reports:

```text
productionWriterPath = null
productionWriterPresent = false
```

until a new writer is explicitly integrated into the canonical Graphify job.

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
2. persisted source-revision storage semantics are `CODE_SOURCE_REVISION_V1`.
3. an enrolled production writer creates both workspace/source revisions itself.
4. at least one controlled persisted row read-backs with the exact computed workspace revision, source revision, source ref and content digest.

A deterministic Git/SHA calculation without durable binding is not enough.

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
6. classifies sampled `graphify_files.source_revision` semantics;
7. checks whether an exactly matching persisted lineage row already exists;
8. emits the canary receipt;
9. rolls back and performs no canonical write.

Until a writer is enrolled, the healthy expected outcome is a blocked/nonzero receipt such as:

```text
REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND
```

or, depending on the live schema:

```text
BLOCKED_SCHEMA_MISSING
BLOCKED_STORAGE_SEMANTICS_MISMATCH
```

Those are useful proof outcomes, not failures to be bypassed.

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

legacy Git-SHA source_revision
  -> explicit storage-semantic migration/compatibility decision

schema compatible but writer absent
  -> integrate CodeRevisionAuthorityV1 into the canonical Graphify source inventory writer

writer + schema compatible
  -> controlled single-file persistence/readback canary
```

Only after `REVISION_OWNER_PROVEN` may `GraphViewNodeV1` and `atlas_graph_nodes_v2` be revision-qualified and `FANOUT-01` normalize Qdrant/cuVS/CAGRA/TurboVec results to the canonical `CandidateOrdinal` fabric.
