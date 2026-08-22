# Graph + FANOUT revision gates v2

Status: **IMPLEMENTED_UNPROVEN**

This tranche is stacked on the Parent Atlas Graphify workspace/source revision owner. It does not apply migrations, publish graph snapshots, repair Qdrant payloads, mutate Neo4j, create GPU indexes, or enable production FANOUT.

## Revision namespaces

These coordinates are deliberately non-interchangeable:

```text
workspace_cache_revision
  legacy atlas_packets integer cache epoch

repository_revision
  Git commit provenance only

workspace_world_revision
  WorkspaceRevisionRecordV1
  sha256:<sorted exact indexed source manifest>

source_revision
  CodeSourceRevisionV1
  sha256:<exact UTF-8 source bytes>

source_inventory_revision
  sha256:<exact graph materializer source inventory hash>

graph_revision
  deterministic logical graph world state

representation_revision
  semantic representation revision
```

Neither Git provenance nor the integer cache epoch may satisfy `workspace_world_revision` equality.

## Ownership

```text
WorkspaceRevisionRecordV1
  owns workspace_world_revision

CodeSourceRevisionV1 / WorkspaceSourceBindingV1
  owns source_revision

GraphSnapshotRevisionV1
  binds workspace_world_revision
  owns source_inventory_revision + graph_revision

Qdrant
  projection only
  must carry matching revision/identity payload to participate in canonical FANOUT

CandidateOrdinalMapV1
  owns dense execution coordinates only after FANOUT admission
```

`source_ref`, `tree_node_id`, Qdrant point IDs, Postgres row IDs, Neo4j IDs and GPU ordinals do not mint canonical identity or revision authority.

## Graph gates

### GRAPH-REV-01 — snapshot revision contract

`GraphSnapshotRevisionV1` requires:

```text
workspaceRevision       = WorkspaceRevisionRecordV1
sourceInventoryRevision = sha256:<sourceInventoryHash>
graphRevision           = deterministic logical graph hash
snapshotId              = occurrence identity only
```

Same logical graph world may have different snapshot UUIDs and the same `graphRevision`.

### GRAPH-REV-02 — source revision binding

`GraphSnapshotSourceRevisionBindingV1` joins source-backed graph nodes to `WorkspaceSourceBindingV1` by exact normalized `source_ref`.

Rules:

- source-backed node + exact binding -> authoritative `sourceRevision`;
- graph node without `source_ref` -> revisionless structural node;
- source-backed node absent from the workspace manifest -> blocked;
- duplicate source_ref with conflicting revisions -> rejected;
- no inference from graph hashes, packet hashes, tree IDs, Qdrant IDs, or ordinals.

### GRAPH-REV-03 — persistence preflight

`GraphSnapshotRevisionPreflightV1` combines:

```text
WorkspaceRevisionRecordV1
+ WorkspaceSourceBindingV1[]
+ graph materializer output
+ GraphSnapshotRevisionV1
```

and returns one `applyAllowed` gate. `applyAllowed=true` requires complete source-backed node coverage and exact workspace-revision binding.

### GRAPH-REV-04 — persisted readback

Before promotion, a read-only proof must verify:

- snapshot revision checksum;
- snapshot `workspace_revision` is `sha256:...` logical world state;
- `source_inventory_revision` binds `source_hash`;
- selected source-backed node has authoritative `source_revision`;
- selected edge and both endpoint nodes share the same immutable `snapshot_id`.

## Qdrant gates

### QDRANT-LINEAGE-01 — revision namespaces

Canonical v2 payload vocabulary:

```text
workspace_revision       integer legacy cache epoch
workspace_cache_revision integer legacy cache epoch alias
workspace_world_revision WorkspaceRevisionRecordV1 logical revision
repository_revision      Git provenance
source_revision          CodeSourceRevisionV1
graph_revision           GraphSnapshotRevisionV1 graphRevision
representation_id        semantic_768
representation_revision  exact semantic representation revision
```

Historical rows missing these fields remain retrieval evidence only.

### QDRANT-LINEAGE-02 — strong identity

At least one matching strong identity coordinate is required:

```text
canonical_id
symbol_version_id
packet_key
```

`source_ref` and `tree_node_id` may corroborate or contradict but cannot admit a candidate by themselves.

### QDRANT-LINEAGE-03 — read-only exact point proof

The proof retrieves the exact packet-owned Qdrant point from `codebase_chunks_768_v2` with:

```text
with_payload = true
with_vector  = false
```

No vector read, payload write, upsert, overwrite, backfill or re-embedding is allowed.

## FANOUT gates

### FANOUT-01A — cross-store admission

`FanoutAdmissionV1` requires all of:

```text
snapshot_id exact
strong canonical identity agreement
source_revision exact
workspace_world_revision exact
graph_revision exact
representation_id = semantic_768
representation_revision exact
```

### FANOUT-01B — CandidateOrdinal creation

`CandidateOrdinalMapV1` may be materialized only after `FANOUT-01A` succeeds.

Before admission:

```text
candidateOrdinalMap = null
```

After admission:

```text
candidateOrdinal = dense snapshot-scoped execution coordinate
identityAuthority = false
```

Executors must normalize results to this ordinal map. Qdrant/cuVS/CAGRA/TurboVec executor-local IDs never become canonical identity.

### FANOUT-01C — live read-only convergence receipt

`scripts/atlas/prove-fanout-admission-readonly.mts` emits typed blocked states including:

```text
GRAPH_REVISION_SCHEMA_MISSING
NO_REVISION_AWARE_VALIDATED_GRAPH_SNAPSHOT
GRAPH_SNAPSHOT_REVISION_READBACK_REJECTED
SOURCE_BINDING_GAP
EDGE_SNAPSHOT_BINDING_REJECTED
PACKET_QDRANT_PROJECTION_REFERENCE_MISSING
QDRANT_IDENTITY_GAP
QDRANT_WORLD_REVISION_GAP
QDRANT_SOURCE_REVISION_GAP
QDRANT_GRAPH_REVISION_GAP
FANOUT_ADMISSION_BLOCKED
```

Only:

```text
FANOUT_ADMISSION_READONLY_PROVEN
```

permits the next executor-normalization tranche.

## Current proof state

```text
GRAPH-REV-01 contract                         IMPLEMENTED_UNPROVEN
GRAPH-REV-02 source binding                   IMPLEMENTED_UNPROVEN
GRAPH-REV-03 preflight                        IMPLEMENTED_UNPROVEN
GRAPH-REV-04 persisted readback               SCRIPTED_UNPROVEN
QDRANT-LINEAGE-01 namespace split              IMPLEMENTED_UNPROVEN on Qdrant writer branch
QDRANT-LINEAGE-02 strong identity              IMPLEMENTED_UNPROVEN
QDRANT-LINEAGE-03 exact point read             SCRIPTED_UNPROVEN
FANOUT-01A admission                           IMPLEMENTED_UNPROVEN
FANOUT-01B CandidateOrdinal boundary           IMPLEMENTED_UNPROVEN
FANOUT-01C live convergence                    SCRIPTED_UNPROVEN
cuVS/CAGRA/TurboVec normalization              BLOCKED
Neo4j admitted-seed expansion                  BLOCKED
production graph/Qdrant backfill               NOT PERFORMED
```

## Workstation proof

From `sveltekit-frontend`:

```powershell
node_modules\.bin\vitest run `
  src/lib/server/atlas/graph/graph-snapshot-revision-v1.spec.ts `
  src/lib/server/atlas/graph/graph-snapshot-source-revision-binding-v1.spec.ts `
  src/lib/server/atlas/graph/graph-snapshot-revision-preflight-v1.spec.ts `
  src/lib/server/atlas/graph/graph-qdrant-fanout-alignment.spec.ts `
  src/lib/server/atlas/graph/fanout-admission-v1.spec.ts

npx tsx scripts/atlas/prove-fanout-admission-readonly.mts
```

A nonzero typed blocked result is expected until the graph revision migration/source bindings and Qdrant v2 lineage are actually populated. Do not weaken a blocker to make the proof green.

## Next phase after green convergence

Only after `FANOUT_ADMISSION_READONLY_PROVEN`:

```text
FANOUT-02 Qdrant executor -> CandidateOrdinal
FANOUT-03 cuVS exact executor -> CandidateOrdinal
FANOUT-04 CAGRA executor -> CandidateOrdinal
FANOUT-05 TurboVec challenger -> CandidateOrdinal
FANOUT-06 one logical dense-lane vote after executor normalization
GRAPH-EXPAND-01 admitted seeds -> bounded Neo4j AST/call/reference expansion
GRAPH-EXPAND-02 PPR/BFS evidence -> graph feature columns, not independent votes
```
