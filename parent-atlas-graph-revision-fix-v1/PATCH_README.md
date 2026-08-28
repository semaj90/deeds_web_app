# Parent Atlas graph revision ownership fix v1

This bundle fixes the revision-coordinate substitutions identified in the
GraphRevision / StructuralGraphSnapshot audit.

## Invariant

These coordinates are independent and MUST NOT substitute for one another:

- `workspaceRevision`: one admitted workspace/source-manifest state
- `sourceRevision`: exact bytes for one source
- `relationshipRevision`: one relationship fact
- `graphRevision`: one selected revision-qualified relationship set
- `candidateSnapshotRevision`: one CandidateOrdinal candidate set
- `ordinalMapChecksum`: CandidateOrdinal <-> canonical candidate coordinate

## Files

### New

- `scripts/atlas/lib/graph-revision-v1.mjs`
  - Single graph-revision owner.
  - Derives `graphRevision` from a canonical relationship-set checksum plus
    `workspaceRevision`, `relationshipPolicyRevision`, and
    `projectionSchemaRevision`.
  - Accepts an empty relationship set.
  - Rejects mixed workspaces, missing source/relationship revisions, unknown
    authority, per-kernel graph authority, duplicate identity conflicts, and
    non-canonical participant ordinals.

- `scripts/atlas/prove-graph-revision-v1.mjs`
  - GRAPH-REV-02 bounded determinism/mutation proof.

- `scripts/atlas/graph-rev-01-materialize-current-revision.mts`
  - Read-only live relationship-set receipt.
  - Does NOT require CandidateOrdinal.
  - Historical / other-workspace relationships are excluded, never restamped.

### Replacements

- `sveltekit-frontend/src/lib/server/atlas/graph/structural-graph-snapshot-from-incidence-v1.ts`
  - Fixes the candidate binding bug.
  - Compares:
    `projection.workspaceRevision == candidateBinding.workspaceRevision`
  - Does NOT compare:
    `workspaceRevision == candidateSnapshotRevision`

- `sveltekit-frontend/src/lib/server/atlas/graph/structural-graph-snapshot-from-incidence-v1.spec.ts`
  - Proves independent candidate/workspace revision coordinates.

- `scripts/atlas/graph-prod-01-build-production-structural-snapshot-v1.mts`
  - No defaults for graph or candidate revisions.
  - Requires a real `--candidate-map`.
  - Requires a separately-produced `--graph-revision-receipt`.
  - Recomputes the graph revision from live relationship kernels and requires
    exact readback equality.
  - Uses the actual CandidateOrdinal map checksum, never `projection.nodeTableHash`.

- `scripts/atlas/populate-hyperedges-from-taxonomy-edges-v1.mts`
  - Quarantines the historical taxonomy bridge as READ ONLY.
  - Explicitly refuses `--apply`.
  - Removes Git-HEAD/workspace/source/graph revision substitutions.

## Suggested apply order

Copy these files into a clean review branch, preserving paths.

Then:

```powershell
node scripts/atlas/prove-graph-revision-v1.mjs
```

Expected: `PROVEN_BOUNDED`.

Run the existing focused structural snapshot spec:

```powershell
cd sveltekit-frontend
node node_modules/vitest/vitest.mjs run `
  src/lib/server/atlas/graph/structural-graph-snapshot-from-incidence-v1.spec.ts
cd ..
```

Materialize the CURRENT relationship-set revision without CandidateOrdinal:

```powershell
npx tsx scripts/atlas/graph-rev-01-materialize-current-revision.mts `
  --workspace-revision='<measured workspaceRevision>' `
  --relationship-policy-revision='atlas.relationship-policy.v1' `
  --projection-schema-revision='atlas.incidence-projection.v1'
```

If the correctly-admitted relationship corpus is empty, the expected status is:

`GRAPH_REVISION_OWNER_PROVEN_CURRENT_RELATIONSHIP_CORPUS_EMPTY`

That is a valid proof result.

## Structural graph remains blocked until CandidateOrdinal is real

Do NOT manufacture a candidate map or dummy checksum.

When a lineage-qualified `CandidateOrdinalMapV1` exists:

```powershell
npx tsx scripts/atlas/graph-prod-01-build-production-structural-snapshot-v1.mts `
  --workspace-revision='<same workspaceRevision>' `
  --candidate-map='docs/reports/<real-lineage-qualified-candidate-map>.json' `
  --graph-revision-receipt='docs/reports/<graph-rev-01-receipt>.json'
```

`GRAPH-PROD-01` will independently verify:

1. candidate map schema
2. candidate row count / ordinal continuity
3. candidate workspace binding
4. candidateSnapshotRevision consistency
5. ordinalMapChecksum recomputation
6. graph receipt workspace binding
7. live relationship-set graphRevision recomputation
8. Arrow artifact determinism

## Intentionally NOT included

- No graph_revision backfill.
- No CandidateOrdinal promotion.
- No source/workspace revision restamping.
- No Postgres schema migration.
- No Qdrant/Neo4j/Valkey writes.
- No attempt to repair historical taxonomy relationships by inference.

Next after this bundle is `REL-REV-02`: a current relationship producer that consumes
real source/workspace bindings and emits a real `relationshipRevision`.
