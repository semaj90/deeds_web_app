# FANOUT-01 canonical admission addendum

Status: **IMPLEMENTED_UNPROVEN**

This tranche freezes the consumer boundary after revision, graph, Qdrant identity, and CandidateOrdinal proofs. It does not query an executor, mutate ranking, create a second retrieval vote, or write canonical state.

## Dependency order

```text
REV-OWNER-V2
  PR #29
  WorkspaceRevisionRecordV1 + CodeSourceRevisionV1 durable Graphify readback
        ↓
GRAPH-REV-OWNER
  PR #31
  graph snapshot binds the proven workspace revision + graphRevision
        ↓
QDRANT-LINEAGE
  PR #30 / readback proof
  codebase_chunks_768_v2 canonical identity + revision-qualified payload
        ↓
CandidateOrdinalMapV1
  immutable candidate snapshot execution map
        ↓
FANOUT-01
  executor result → existing CandidateOrdinal only
```

All upstream gates are conjunctive. A matching score, Qdrant point ID, Neo4j ID, GPU node ID, packet-like string, or array position cannot substitute for a missing proof.

## Admission rule

`FanoutProofGateV1` requires:

- `revisionOwnerStatus = REVISION_OWNER_PROVEN`
- `graphRevisionOwnerStatus = GRAPH_FANOUT_REVISION_OWNER_PROVEN`
- exact manifest-qualified `workspaceRevision`
- exact `graphRevision`
- exact `candidateSnapshotRevision`
- exact `CandidateOrdinalMapV1.ordinalMapChecksum`
- Qdrant lineage `PROVEN` before a Qdrant result can seed FANOUT

Each executor result must then match the canonical candidate's:

```text
canonicalId
workspaceRevision
sourceRevision
graphRevision
candidateSnapshotRevision
```

and the candidate must not be degraded.

## Executor identity boundary

Executor result IDs terminate at FANOUT admission. Output does not expose them.

```text
Qdrant point ID  ─┐
cuVS result index ├─ rejected as identity
CAGRA node/index  ┤
TurboVec result   ┤
Neo4j internal ID ┤
cuGraph vertex ID ┘

canonicalId
    ↓ existing immutable map
CandidateOrdinal
```

The admission layer never allocates, sorts, repairs, or compacts ordinals.

## Mixed retrieval batches

Degraded/unresolved results may remain retrieval evidence. They are rejected from FANOUT individually and do not invalidate a concurrently admitted canonical subset.

This is intentional:

```text
retrieval evidence != structural/GPU traversal seed
```

A mixed batch can therefore produce admitted and rejected rows in one receipt. `fanoutAdmissionProven=true` means at least one result passed all global and per-candidate gates; rejected rows remain explicitly recorded.

## Lane / executor invariant

The admission receipt freezes:

```text
rankingMutationPerformed = false
extraRrfVotesCreated = false
ordinalRemappingPerformed = false
executorIdsEscapedAboveBoundary = false
canonicalWritesAllowed = false
```

Qdrant, cuVS exact, CAGRA, and TurboVec remain executors beneath the same logical semantic lane. Neo4j/cuGraph remain graph executors. Executor multiplicity does not create fusion-vote multiplicity.

## Proof gates

- FANOUT-01A global revision gate: **WRITTEN_UNPROVEN**
- FANOUT-01B Qdrant identity-lineage gate: **WRITTEN_UNPROVEN**
- FANOUT-01C degraded/unresolved rejection: **WRITTEN_UNPROVEN**
- FANOUT-01D exact CandidateOrdinal preservation: **WRITTEN_UNPROVEN**
- FANOUT-01E revision-drift rejection: **WRITTEN_UNPROVEN**
- FANOUT-01F executor-ID substitution rejection: **WRITTEN_UNPROVEN**
- FANOUT-01G no ranking/RRF mutation: **WRITTEN_UNPROVEN**

## Next after bounded tests

Do not wire live Qdrant/cuVS/CAGRA/TurboVec/Neo4j/cuGraph adapters until the three upstream live proofs are green.

After they are green:

1. Qdrant adapter emits `FanoutExecutorResultV1` from admitted v2 payload rows.
2. cuVS exact adapter emits the same contract and is compared to Qdrant recall/order without adding another vote.
3. CAGRA/TurboVec adapters normalize to the same canonical candidate IDs and CandidateOrdinals.
4. graph seeds pass only admitted CandidateOrdinals into bounded BFS/PPR.
5. CPU/GPU graph result parity is proved before any production ranking influence.
