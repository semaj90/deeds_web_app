# Representation Matrix + Index Alignment Addendum

Status: **IMPLEMENTED_UNPROVEN / CONTRACT-ONLY / NO STORE MUTATION**

This addendum freezes the ownership boundary between semantic representations, derived latent representations, candidate feature matrices, vector indexes, and GPU execution artifacts.

## Canonical rule

`semantic_768` is the canonical **semantic numeric representation** for this lane. It is not canonical identity authority and no vector store becomes identity authority merely by holding a copy or index of it.

Canonical identity remains revision-qualified source/packet identity. `CandidateOrdinal` is a dense execution coordinate scoped by a frozen `candidateSnapshotRevision` plus `ordinalMapChecksum`.

```text
canonicalId / packetKey / sourceRevision
                │
                ▼
       CandidateOrdinalMapV1
                │
                ├── semantic_768 matrix [N,768] FP32
                ├── latent_128 matrix   [N,128] derived
                ├── latent_64 matrix    [N,64]  derived
                ├── candidate features  [N,F]
                └── sparse AST/graph derived blocks
```

Every aligned matrix must carry the same candidate snapshot revision and ordinal-map checksum. Row-count drift is a hard failure.

## Representation roles

| Representation | Role | Source | Authority |
| --- | --- | --- | --- |
| `semantic_768` | canonical semantic numeric matrix | embedding producer | numeric reference only |
| `latent_128` | derived routing/compression matrix | `semantic_768` | derived, never semantic identity |
| `latent_64` | derived routing/compression matrix | `semantic_768` | derived, never semantic identity |
| candidate feature matrix | interpretable candidate state | semantic + lexical + AST + graph + domain + execution evidence | derived |
| binary semantic matrix | Hamming shortlist challenger | `semantic_768` | derived |
| AST relation matrix | sparse structural evidence | source/AST authority | derived execution projection |

`semantic_128_mrl` is not `latent_128`. If a Matryoshka semantic projection is introduced, it needs its own representation ID/revision and evaluation receipt.

## One semantic lane, multiple executors, one vote

The semantic lane may be executed by different implementations:

```text
PGVECTOR_EXACT
QDRANT_HNSW
CUVS_EXACT
CAGRA
TURBOVEC
```

All consume the same logical `semantic_768` representation and must normalize to the same frozen CandidateOrdinal domain before higher-level ranking/fusion.

Executor choice does not create another retrieval lane or another RRF vote.

```text
semantic_768 logical lane
        │
        ├── pgvector exact      audit/reference/fallback
        ├── Qdrant HNSW         serving projection
        ├── cuVS exact          GPU exact oracle
        ├── CAGRA               GPU ANN challenger
        └── TurboVec            compressed ANN challenger

                         => one semantic vote
```

Executor-local IDs terminate below the ordinal-normalization boundary.

## Qdrant physical naming

The canonical serving collection is:

```text
collection: codebase_chunks_768_v2
physical dense vector: content
logical representation: semantic_768
metric: Cosine
```

The package-level dense-vector resolver must return the physical vector name `content`. Logical labels such as `dense_retrieval` must not be mistaken for physical named-vector keys.

Qdrant payload is a compact search/filter projection. AST/domain/concept/community/cluster fields belong in payload or the candidate feature matrix; they are not appended to the 768 semantic dimensions.

## PostgreSQL / pgvector

Postgres remains the transactional identity/provenance/join ledger. pgvector can provide exact/reference search and derived indexes, but it does not receive an independent semantic fusion vote.

This tranche does not authorize creation of HNSW/IVFFlat indexes, does not apply migrations, and does not mutate the shared PostgreSQL target.

Historical vector columns remain subject to their existing provenance audits. A matching dimension alone is not representation proof.

## Bulk matrices vs control transport

Large numeric state remains behind revision/checksum-qualified artifacts:

```text
semantic_768     NPY FP32 / mmap
latent_128       mmap FP16 or bounded derived artifact
latent_64        mmap INT8/FP16 as explicitly contracted
candidate matrix Arrow IPC / columnar
sparse AST/graph CSR/Arrow-derived artifact
```

Control-plane transport moves descriptors, ordinals, scores, ranks, revisions, checksums, and artifact references.

Appropriate compact formats include:

```text
PROTOBUF
MSGPACK
JSON
small BYTEA artifacts
```

They are not the canonical transport for an entire N×768 corpus.

## Go retrieval boundary

A Go retrieval service is a low-latency gateway/control-plane owner, not a new semantic lane. Its bounded result should be equivalent to `CandidateOrdinalSetV1`:

```text
requestId
candidateSnapshotRevision
ordinalMapChecksum
representationRevision
candidateOrdinal
score
rank
executor
```

It should not return raw 768-float vectors in ordinary retrieval responses. The Python/GPU materializer resolves revision-qualified artifacts and gathers only the selected ordinals.

## GPU materialization

Existing CandidateFeature GPU packing/residency remains the execution owner. This addendum does not create another GPU service.

The bounded GPU working set is conceptually:

```text
semantic  [B,768]
latent128 [B,128] optional
latent64  [B,64]  optional
features  [B,F]
presence  [B,F]
validMask [physical_B]
ordinals  [B]
```

Padding exists only at physical kernel boundaries. Fake candidates are never introduced into the logical ordinal map.

CAGRA's graph is an ANN executor artifact. It is distinct from the semantic kNN graph, the structural Neo4j/cuGraph projection, and the source AST graph.

## Interpolation / learned projection

Interpolation belongs in explicit feature or learned projection space:

```text
X = CandidateFeatureMatrix [B,F]
Z = XW
```

or in a separately revisioned candidate-state representation. Semantic embeddings are never silently extended with PageRank, domain IDs, AST depth, or cluster IDs.

Any learned composite vector must receive a distinct representation ID, revision, producer/checkpoint lineage, normalization contract, checksum, and evaluation receipt.

## CouchDB

CouchDB, where retained, is outside the numerical hot path. It may hold syncable documents, annotations, review state, summaries, or structured evidence. It is not an owner for canonical N×768 tensors, CAGRA indexes, or per-query GPU feature matrices.

No CouchDB integration change is made in this tranche.

## New contracts in this tranche

`RepresentationMatrixIndexContractV1` freezes:

- one `semantic_768` FP32 canonical semantic numeric matrix;
- derived latent/feature/binary/sparse matrix roles;
- same-row/same-ordinal alignment;
- semantic executor bindings;
- ordinal-only executor results;
- one semantic lane vote;
- no raw-vector transport;
- no identity authority transfer to matrix/index/executor coordinates.

`CandidateOrdinalSetV1` provides an additive kernel/Go/Python-facing ordinal-only result contract. The older kernel `CandidateSetV1` is not deleted or silently reinterpreted in this tranche.

## Proof gates

```text
MATRIX-01  focused contract unit tests pass
MATRIX-02  semantic_768 is the only CANONICAL_SEMANTIC matrix
MATRIX-03  latent_128/latent_64 explicitly derive from semantic_768
MATRIX-04  every matrix shares candidateSnapshotRevision + ordinalMapChecksum + row count
MATRIX-05  every semantic executor returns ordinals, not vectors
MATRIX-06  every semantic executor has independentFusionVote=false
MATRIX-07  Qdrant v2 physical dense vector resolves to content
MATRIX-08  CandidateOrdinalSetV1 checksum + duplicate-ordinal rejection pass
MATRIX-09  no PostgreSQL/Qdrant/Neo4j/Valkey/CouchDB mutation performed
```

Until workstation/CI evidence exists, these remain **IMPLEMENTED_UNPROVEN**.

## Explicit non-goals

- no PostgreSQL migration or index application;
- no Qdrant collection/vector rewrite;
- no latent vector backfill;
- no CouchDB write path;
- no new ANN backend;
- no live RRF/ranking-policy change;
- no model training;
- no CandidateOrdinal identity promotion;
- no replacement of the existing frozen semantic snapshot, candidate-feature columnar, GPU parity, or GPU residency owners.
