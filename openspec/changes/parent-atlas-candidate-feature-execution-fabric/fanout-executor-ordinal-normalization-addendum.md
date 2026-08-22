# FANOUT executor CandidateOrdinal normalization addendum

Status: **IMPLEMENTED_UNPROVEN / LIVE WIRING BLOCKED**

## Scope

This addendum freezes the pure executor-result identity boundary that follows a proven FANOUT admission. It does not query stores, authorize revisions, create CandidateOrdinals, or wire a live Qdrant/cuVS/CAGRA/TurboVec executor.

```text
proven CandidateOrdinalMapV1
        +
raw dense executor hits
        ↓
DenseExecutorCandidateOrdinalV1 boundary
        ↓
CandidateOrdinal + score + rank only
```

## Invariants

- `CandidateOrdinal` is scoped to `candidateSnapshotRevision` and is never canonical identity.
- The boundary may only return an ordinal already present in the frozen `CandidateOrdinalMapV1`.
- Qdrant point IDs, cuVS/CAGRA/TurboVec local IDs, Neo4j IDs and cuGraph vertex IDs terminate below this layer.
- A claimed ordinal with conflicting canonical/packet/symbol/tree evidence is rejected.
- A raw local executor ID without canonical or ordinal evidence is rejected.
- Duplicate hits resolving to one ordinal are collapsed within one executor result set; this boundary cannot create another semantic vote.
- Score, rank and accepted order are preserved exactly. This boundary does not rerank or fuse.
- No canonical/Postgres/Qdrant/Neo4j/Valkey/GPU writes are performed.

## New contracts

```text
DenseExecutorRawHitV1
DenseSearchHitV1
DenseSearchNormalizationReceiptV1
```

Supported executor labels are initially:

```text
QDRANT
CUVS_EXACT
CAGRA
TURBOVEC
```

The enum is an execution provenance label only. It does not create separate semantic lanes.

## Proof dependency

This work does **not** close `FANOUT-01` on its own. Live use remains blocked until the upstream read-only admission gate proves:

```text
REVISION_OWNER_PROVEN
GRAPH_FANOUT_REVISION_OWNER_PROVEN
Qdrant semantic_768 identity/revision alignment
exact CandidateOrdinalMapV1 snapshot/checksum
FANOUT_ADMISSION_READONLY_PROVEN
```

Only after that proof may live adapters call this normalizer.

## Focused validation

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
node_modules\.bin\vitest run src/lib/server/atlas/retrieval/dense-executor-candidate-ordinal-v1.spec.ts
```

Acceptance for this addendum:

```text
FANOUT_EXECUTOR_ORDINAL_BOUNDARY_PROVEN
executorIdsEscapedAboveBoundary = false
ordinalRemappingPerformed       = false
rankingMutationPerformed        = false
canonicalWritesAttempted        = false
```

Until the focused workstation test runs, status remains `IMPLEMENTED_UNPROVEN`.
