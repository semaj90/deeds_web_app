## Ownership boundaries

| Surface | Owner | Constraint |
|---|---|---|
| Source/workspace lineage | Parent Atlas/PostgreSQL | Exact revision required; no placeholders |
| Canonical dense vector | PostgreSQL `semantic_768` | 768 dimensions; EmbeddingGemma native output |
| Semantic projection | Qdrant `_768_v2` | Rebuildable projection; point IDs are projection IDs |
| Canonical content hydration | PostgreSQL | Projection results hydrate through exact identity joins |
| Candidate coordinate | `CandidateOrdinalMapV1` | One admitted candidate universe for every representation |
| Graph coordinate | Graph projection artifact | `projectionOrdinal` remains separate until parity proves a bridge |
| OaK execution | Parent Atlas bounded executor | Exact implementation references; read-only first |
| Context | ACE `ContextManifest` | Consumes predecessor evidence; does not rerun retrieval |
| Learned AE | Separate derived representation | Never aliases native MRL IDs or canonical identity |

## Gate sequence

```text
LINEAGE-01/02
       ↓
RETRIEVAL-01G/01H
       ↓
PROJECTION-REGISTRY-01
       ↓
RETRIEVAL-01J dry-run
       ↓
DAG-RUNTIME-01A..01E
       ↓
NESTED-TRAIN-02
       ↓
NESTED-REP-01
```

The initial implementation state is shadow/read-only. A bounded write canary,
if later authorized, must be a separate promotion decision with exact target
resolution, rollback evidence, and readback.

## Representation contract

`semantic_768` is the canonical dense oracle. Native MRL representations are
derived by exact prefix truncation plus renormalization and use representation
IDs distinct from learned latent representations. Learned `latent_128` and
`latent_64` require a new immutable training receipt and checkpoint revision.

## DAG contract

The planner emits actions; the runtime binds each action to an exact callable
owner using `implementationRef`, operator identity, retained `boundArguments`,
and a matching parameter checksum. Receipts exclude timing/process/session
metadata from deterministic hashes. Mutation actions remain rejected.
