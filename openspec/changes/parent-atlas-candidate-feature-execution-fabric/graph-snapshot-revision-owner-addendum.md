# Graph snapshot revision owner addendum

Status: **IMPLEMENTED_UNPROVEN**

This tranche keeps `FANOUT-01` blocked until graph candidates can round-trip through explicit snapshot-level revision identity and authoritative per-source revision evidence.

## Ownership decision

`atlas_graph_snapshots_v2` owns revision fields that are constant for the complete immutable graph snapshot:

- `workspaceRevision`
- `sourceInventoryRevision`
- `graphRevision`
- `identityContractVersion`
- `parserContractVersion`
- `sourceInventoryHash`
- `topologyHash`
- `policyHash`

`atlas_graph_nodes_v2` and `atlas_graph_edges_v2` inherit those values by their existing `snapshot_id` foreign-key spine. They do **not** duplicate workspace/graph revision columns per row.

`atlas_graph_nodes_v2.source_revision` is nullable and is populated only when an authoritative source owner actually supplies a source revision. `source_ref`, `content_hash`, `packet_key`, `tree_node_id`, Qdrant point IDs, Neo4j internal IDs, GPU ordinals and vector dimensions never substitute for source-revision authority.

`graphRevision` is deterministic logical revision identity over relevant world state and excludes `snapshotId`; two independent immutable snapshot occurrences can therefore prove they represent the same logical graph revision. `revisionChecksum` includes `snapshotId` and verifies one persisted revision record.

## Gates

- [x] **REV-OWNER-01A** Define `GraphSnapshotRevisionV1` and deterministic `graphRevision` derivation. **IMPLEMENTED_UNPROVEN**
- [x] **REV-OWNER-01B** Define snapshot revision checksum/tamper verification. **IMPLEMENTED_UNPROVEN**
- [x] **REV-OWNER-01C** Add nullable snapshot revision columns and nullable node `source_revision` migration; perform no inferred backfill. **IMPLEMENTED_UNPROVEN / MIGRATION_NOT_APPLIED_BY_THIS CHANGE**
- [x] **REV-OWNER-01D** Add rolled-back Postgres write/readback canary. **IMPLEMENTED_UNPROVEN**
- [x] **REV-OWNER-01E** Add read-only live owner proof joining node -> snapshot revision identity. **IMPLEMENTED_UNPROVEN**
- [x] **REV-OWNER-02** Wire the accepted full-corpus snapshot writer to populate all snapshot-level revision columns in the same insert transaction and checksum-verify readback before commit. **IMPLEMENTED_UNPROVEN**
- [ ] **REV-OWNER-03** Identify an authoritative source-revision producer and populate node `source_revision` only from that owner.
- [ ] **REV-OWNER-04** Prove selected nodes round-trip `node -> snapshotId -> workspaceRevision -> graphRevision -> sourceRevision`.
- [ ] **REV-OWNER-05** Reject mixed/revisionless candidates at the FANOUT boundary.

## Full-corpus writer semantics

`materialize-full-corpus-graph-snapshot.mts` remains the sole full-corpus graph snapshot writer. No parallel revisioned writer was introduced.

In `--verify` / `--apply` mode, two independent materializations must now match on both:

```text
topologyHash
graphRevision
```

The snapshots may have different `snapshotId` UUIDs because `snapshotId` is occurrence identity, not logical graph revision identity.

Before `--apply`, the writer checks that the additive revision migration is present. It then writes the snapshot revision columns in the same immutable snapshot insert, mirrors the revision identity in `source_manifest`, and verifies `GraphSnapshotRevisionV1` from database readback before committing node/edge publication.

The writer still leaves `atlas_graph_nodes_v2.source_revision` NULL. That is deliberate until REV-OWNER-03 establishes an authoritative source-revision producer.

## Required statuses

Before the additive migration or first revision-aware snapshot is published, the expected live result is one of:

```text
GRAPH_SNAPSHOT_REVISION_MIGRATION_REQUIRED
GRAPH_SNAPSHOT_REVISION_OWNER_NOT_PROVEN
```

After snapshot writer adoption, but before authoritative per-source revision exists:

```text
GRAPH_SNAPSHOT_REVISION_OWNER_PROVEN_SOURCE_REVISION_BLOCKED
```

Only this status unblocks `FANOUT-01`:

```text
GRAPH_FANOUT_REVISION_OWNER_PROVEN
```

## Workstation proof order

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend

npx vitest run `
  src/lib/server/atlas/graph/graph-snapshot-revision-v1.spec.ts

# Dry/verify path has no canonical writes and proves logical revision stability.
npx tsx scripts/atlas/materialize-full-corpus-graph-snapshot.mts --verify

# Apply only in the intended non-production/proof environment:
# drizzle/manual/20260822_graph_snapshot_revision_owner_v1.sql

npx tsx scripts/atlas/prove-graph-snapshot-revision-writer.mts
$env:ATLAS_GRAPH_REVISION_CANARY='1'
npx tsx scripts/atlas/prove-graph-snapshot-revision-writer.mts
Remove-Item Env:ATLAS_GRAPH_REVISION_CANARY

# A real revision-aware snapshot must be published by the accepted writer before
# this can advance beyond snapshot-owner proof.
npx tsx scripts/atlas/prove-graph-snapshot-revision-owner.mts --sample=20
```

The canary inserts only inside a transaction that is rolled back. It must never be interpreted as canonical graph publication.

## Explicit non-goals

- no FANOUT executor normalization yet
- no Qdrant/Neo4j/cuGraph/CAGRA/TurboVec mutation
- no PageRank score promotion
- no source revision synthesized from hashes or filenames
- no duplicate workspace/graph revisions on every node/edge row
- no historical graph snapshot backfill without separately proven provenance
