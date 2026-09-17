## Context

Parent Atlas currently has real source, packet, semantic, classifier, graph,
ACE/BitFrost, and workflow contracts, but current-cohort admission is not yet
proven end to end. Daily Graphify also needs to tolerate ordinary edits without
requiring a new repository-wide sealed snapshot. PostgreSQL remains the durable
identity and evidence owner; Qdrant, Neo4j, GPU executors, Redis/Valkey, and
prompt-context artifacts remain rebuildable projections.

The change therefore crosses the workspace event/head, source-to-packet/chunk
lineage, domain-classifier admission, candidate-feature, and context-cache
boundaries. Existing owners are reused. No second packet registry, model owner,
fusion owner, or event bus is introduced.

## Goals / Non-Goals

**Goals:**

- Represent incremental source changes as revision-qualified events folded into a
  lightweight workspace head, with strict snapshots reserved for compaction and
  promotion.
- Require exact source, packet, chunk, representation, and classifier lineage
  before a row enters a promotion cohort.
- Keep classifier, graph, topology, NLP, and cache outputs as derived evidence.
- Provide deterministic candidate/feature/checksum seams and guarded durable
  adapters with exact readback.
- Preserve bounded, approval-gated TypeScript repair and explicit blocked states.

**Non-Goals:**

- Applying the planned workspace-event migration or performing production data
  backfills in this change.
- Training or promoting a PyTorch/XGBoost/QLoRA model without a current labeled
  cohort and held-out receipt.
- Making GPU, Qdrant, Neo4j, Redis/Valkey, ACE, KV state, tensors, or centroids
  canonical identity.
- Replacing PostgreSQL, LangGraph/Hermes/Ornith, SearchRuntime, or the existing
  Graphify execution owner.

## Decisions

### Incremental head over per-edit full snapshots

`WorkspaceSnapshotV1` remains an immutable checkpoint. `WorkspaceEventV1` and
`WorkspaceHeadV1` represent admitted deltas and the folded current state. Daily
Graphify may classify ADDED, CHANGED, UNCHANGED, and DELETED sources and advance
the head; a full snapshot is required only for compaction, release, migration,
or an explicitly requested promotion boundary.

Alternative considered: requiring two identical whole-tree scans for every daily
run. Rejected because it turns unrelated edits into a global liveness failure.

### PostgreSQL sidecar with guarded transactional adapter

The append-only event and participant tables plus the materialized head are
installed by a reviewed sidecar. The adapter locks the current head, validates
sequence and prior-head identity, writes the event/head atomically, and reads
both back through the canonical schemas. The apply script is dry-run by default
and requires explicit authorization.

Alternative considered: using Redis/Valkey or a LangGraph checkpoint as durable
state. Rejected because those layers are cache/orchestration projections, not
canonical identity owners.

### Exact lineage joins

Source whole-file digests and chunk content hashes remain different grains.
Admission joins source reference plus source/workspace revisions to packet and
chunk lineage, then checks semantic representation metadata. Missing, stale,
ambiguous, and digest-mismatched rows are quarantined; no alias, path, array
position, Qdrant point ID, or synthetic revision is accepted.

### Derived classifier and topology evidence

NB/LR establishes the baseline on the same admitted cohort. PyTorch/XGBoost and
QLoRA remain challengers until their training manifest, label evidence,
checkpoint checksum, and held-out evaluation are proven. NetworkX is the CPU
graph oracle; cuGraph/GPU and topology coordinates are derived executors.

### Revision-qualified context and cache

ACE/BitFrost cache admission requires the existing revision-qualified cache
identity and dependency checksum. Legacy cache entries remain readable only as
degraded evidence. Context manifests contain references and checksums rather
than hidden reasoning, KV cache, tensors, or untraceable blobs.

## Risks / Trade-offs

- [Concurrent source edits] → reject only the affected source result, enqueue a
  superseding event, and leave unrelated dependency cones usable.
- [Unapplied sidecar] → keep the adapter fixture-proven and expose a guarded
  transactional runner; never report live durability before readback.
- [Duplicate Graphify executions] → compare immutable evidence signatures and
  bind downstream plans to an explicit execution/run pair.
- [Historical rows with weak lineage] → retain them for observation but exclude
  them from promotion cohorts.
- [GPU or service unavailability] → return typed unavailable/degraded states;
  do not silently substitute fake vectors, identities, or success receipts.

## Migration Plan

1. Run schema and Drizzle mirror parity audits.
2. Review the sidecar and authorize it separately from application changes.
3. Apply it transactionally in a disposable/canary database and require table,
   constraint, trigger, event, and head readback.
4. Bind exactly one Graphify execution to its completed run, then run bounded
   source-to-packet-to-chunk admission and readback.
5. Admit semantic/classifier candidates and only then warm derived caches or
   projections.
6. Roll back an unsuccessful canary transaction; never delete historical event
   rows or rewrite conflicting lineage automatically.

## Open Questions

- Which migration owner will authorize the sidecar and provide the disposable
  live readback canary?
- Which exact packet digest producer will close the current missing/mismatch
  cohort?
- When will the admitted Graphify execution/run bridge be applied?
- Which current labeled classifier cohort is approved for baseline evaluation?
