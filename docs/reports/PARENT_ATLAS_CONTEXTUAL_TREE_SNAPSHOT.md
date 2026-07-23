# Parent Atlas Contextual Tree Snapshot

## Scope

This milestone adds a pure, deterministic compiler for canonical packet rows. It
does not write PostgreSQL, Neo4j, Qdrant, Valkey, or authority scores.

## Reused Boundaries

- `packages/parent-atlas/src/core/graph-snapshot-manifest.ts` remains the
  existing manifest contract.
- `packages/parent-atlas/src/pipelines/backfill-tree-nodes.ts` remains the
  legacy, write-oriented backfill path and is not used for replay proof.
- `packages/parent-atlas/src/core/contextual-tree-snapshot.ts` is the new pure
  compiler for the contextual-tree snapshot.

## Deterministic Contract

Input rows require `packet_key`, `source_ref`, and `content_hash`; optional
`tree_node_id` and `feature_id` are carried as evidence. Invalid rows are
recorded as exclusions. Duplicate canonical packet keys reject the snapshot.

The compiler emits a containment-only graph:

```text
repository -> directory -> file -> chunk -> packet
```

It derives `snapshot_id`, `source_manifest_hash`, and `topology_hash` from
sorted canonical inputs. Reordering inputs cannot change the result.

## Fixture Evidence

```json
{
  "snapshot_id": "2eca90d4-6d95-5b55-8a55-6ed8fc0946fd",
  "source_manifest_hash": "c1cfeb5723b7f696e2004de273a736eed18dc72519e4a39557f3e3c5a5b15ba2",
  "topology_hash": "49da114bcf23a6a160b001b8f4a1908e6f96173c6f189732611111aa218817bf",
  "node_count": 9,
  "edge_count": 8,
  "exclusion_count": 0
}
```

## Proof

- `CONTEXTUAL_TREE_REPLAY_PROVEN`: input-order invariant; 4 focused Node tests pass.
- `INVALID_IDENTITY_EXCLUDED`: malformed rows are recorded, not assigned IDs.
- `DUPLICATE_PACKET_KEY_REJECTED`: canonical identity collisions fail closed.
- `GRAPH_AUTHORITY_FOUNDATION_RECHECKED`: 12 focused Vitest tests pass, including live NetworkX/GDS parity and production-score witnesses.
- `NETWORKX_REFERENCE_PROVEN`: Python test passes from repository root.

## Intentionally Deferred

- PostgreSQL snapshot tables and live materialization.
- Bounded traversal and fan-out.
- Qdrant, Valkey, Go Retrieval, and RRF integration.
- Authority promotion and any update to legacy score columns.

The next safe milestone is a PostgreSQL adapter that persists an already
validated immutable snapshot and records replay manifests before any derived
store projection.
