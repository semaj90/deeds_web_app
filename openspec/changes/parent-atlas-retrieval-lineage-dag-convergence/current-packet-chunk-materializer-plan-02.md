# CURRENT-PACKET-CHUNK-MATERIALIZER-PLAN-02

Owner: `parent-atlas-retrieval-lineage-dag-convergence`

Status: `IMPLEMENTED_READ_ONLY / WORKSTATION_REPLAY_PENDING`

This gate advances the existing packet/chunk lineage work. It does **not** create a new lineage owner and does not authorize materialization.

## Current admitted input

`docs/reports/graphify-snapshot-native-readback-v1.json` on current `main` proves:

- execution `14667026-459c-4a99-b3c2-c20b739a6e0d`
- workspace revision `sha256:3be7901e1b6bc4f6499185f775eac2ae93e56305940703a7da66a436e4e3a3e0`
- snapshot revision `sha256:9b61929b85a6c4e2d8e459e4cca1294c934746f1430e6535f9546cf16e83c9a5`
- `25,271 / 25,271` membership-v2 rows
- 7 repositories
- zero duplicate, missing, unexpected, source-revision, content-checksum, byte-length, or workspace-revision mismatches
- `authority=false`
- `writesPerformed=false`

The selected snapshot execution/membership proof is therefore complete enough for bounded structural-lineage planning. It does not authorize canonical projection or lineage mutation.

## Corrections relative to the stale planner

The earlier branch-local planner had two authority mistakes and must not be used unchanged:

1. `atlas_packets` is FILE-granularity for the frozen `PacketChunkMembershipV1` contract. A packet row must not be selected by comparing Graphify's whole-source `content_hash` to a packet/chunk payload hash.
2. `graphify_execution_file_membership_v2.repository_id` is repository scope, not `PacketChunkMembershipV1.sourceNamespace`. The source namespace is bound from `graphify_executions.workspace_id`, matching the already-proven packet/chunk canary convention `workspace:<workspace_id>`.

The corrected planner also treats an existing `(packet_key, canonical_chunk_id)` row as complete only when its `chunk_row_id`, `source_ref`, `source_namespace`, `source_revision`, and `revision_status` agree with the selected execution. A stale/conflicting lineage row blocks instead of being counted as present.

## Correct chain

```text
selected SNAPSHOT_NATIVE_READBACK_PROVEN execution
  -> graphify_executions.workspace_id
  -> graphify_execution_file_membership_v2 exact source revision + source digest
  -> revision-addressed sealed source bytes
  -> AST sidecar chunk observations
  -> exact existing codebase_chunk_index chunk identity
  -> unique existing file-level atlas_packets packet identity
  -> compare existing atlas_packet_chunk_lineage
  -> classify only
```

Hard rules:

- sidecar IDs never become canonical chunk IDs
- `canonicalChunkId` comes only from `codebase_chunk_index.chunk_id`
- whole-source hashes are never compared to per-chunk hashes
- repository ID is never substituted for workspace/source namespace
- explicit packet source-revision conflicts fail closed
- multiple file packets for one selected source fail closed
- existing lineage revision/namespace conflicts fail closed
- no database, Qdrant, Neo4j, Valkey, Graphify, model, or projection writes

## Result vocabulary

```text
LINEAGE_FILL_CANARY_READY
CURRENT_CHUNK_MATERIALIZER_REQUIRED
CURRENT_PACKET_MATERIALIZER_REQUIRED
BOUNDED_PACKET_CHUNK_LINEAGE_ALREADY_COMPLETE
PACKET_CHUNK_MATERIALIZER_PLAN_BLOCKED
```

Per-source classifications include:

```text
READY_LINEAGE_FILL_EXISTING_PACKET_EXISTING_CHUNKS
ALREADY_COMPLETE_FOR_OBSERVED_CHUNKS
NEEDS_CURRENT_CHUNK_MATERIALIZER
NEEDS_CURRENT_PACKET_MATERIALIZER
BLOCKED_AMBIGUOUS_OR_UNPROVEN
```

Packet classifications include:

```text
EXACT_CURRENT_FILE_PACKET
UNIQUE_FILE_PACKET_REVISION_UNPROVEN
CURRENT_PACKET_MATERIALIZATION_REQUIRED
AMBIGUOUS_FILE_PACKET_IDENTITY
CONFLICTING_PACKET_SOURCE_REVISION
```

`UNIQUE_FILE_PACKET_REVISION_UNPROVEN` does not synthesize revision authority. It means a single existing file packet may be reused while the proven current source revision is carried by the proposed `atlas_packet_chunk_lineage` membership, consistent with the frozen contract and existing canary behavior.

## Workstation proof

Run from the current reconciliation branch:

```powershell
node --test scripts/atlas/test-snapshot-packet-chunk-materializer-v2.mjs
node --check scripts/atlas/plan-snapshot-packet-chunk-materializer-v2.mjs
node scripts/atlas/plan-snapshot-packet-chunk-materializer-v2.mjs --limit=8 --no-report
```

Only after the bounded no-report result is reviewed should a durable derived report be emitted:

```powershell
node scripts/atlas/plan-snapshot-packet-chunk-materializer-v2.mjs --limit=8
```

A `LINEAGE_FILL_CANARY_READY` result is only a proposal for a separate explicit authorization gate. It is not write authority.

## Downstream order

```text
CURRENT-PACKET-CHUNK-MATERIALIZER-PLAN-02
  -> review bounded classifications
  -> if identities exist: explicit bounded lineage-fill authorization
  -> otherwise: current chunk or packet materializer dry-run
  -> packet/chunk lineage readback
  -> current semantic_768 cohort authority
  -> retrieval/fusion/classifier
  -> ontology n-ary evidence
  -> ACE/BitFrost/ContextManifest
```

This work does not advance Qdrant mutation, semantic promotion, ontology materialization, or production prefill/agent execution.
