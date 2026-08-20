# Parent Atlas Candidate Feature Execution Fabric

## Goal

Create a revision-qualified candidate fabric that joins canonical identity, semantic retrieval, lexical evidence, AST structure, graph features, optional manifold4 orientation features, neural reranking, exact evidence promotion, deterministic DAG execution, validators, receipts, cache artifacts, and later training data.

## Non-goals

- manifold4 does not replace `semantic_768`.
- quaternion coordinates do not become canonical identity.
- Qdrant does not become canonical truth.
- CrossEncoder scores do not become final relevance truth.
- learned/generative outputs do not bypass exact promotion or validators.

## Core identity

`CandidateOrdinal` is the dense execution join key for a frozen candidate revision. It maps back to canonical identity (`canonicalId`, `packetKey`, `treeNodeId`, `symbolVersionId`) and must never be inferred from Qdrant point ids or GPU node ids.

## Manifold4 definition

`manifold4` is a DERIVED_PROJECTION feature represented as a unit quaternion `[w,x,y,z]`.

A unit quaternion has four stored components but represents a 3-DOF spatial orientation. Quaternions `q` and `-q` represent the same rotation, therefore storage and indexing must either canonicalize the sign or use an antipodal-aware distance. Parent Atlas does both: deterministic sign canonicalization at materialization and `abs(dot(q,p))` for similarity.

This representation avoids Euler-coordinate singularities such as gimbal lock. It does not mean that arbitrary four-dimensional vectors are rotations; only normalized values governed by the manifold contract are treated as orientation features.

## Feature fabric

```text
canonical identity
      ↓
CandidateOrdinal[]
      ↓
semantic | lexical | AST | graph | manifold4 | domain | execution | memory
      ↓
CandidateFeatureRowV1[]
      ↓
CandidateFeatureSnapshotV1
      ↓
cheap deterministic pruning
      ↓
CrossEncoderRerankerV1
      ↓
exact promotion
      ↓
ContextManifestV1
      ↓
DSPy program / candidate DAG
      ↓
typed tools
      ↓
validators
      ↓
receipt
      ↓
content-addressed cache + verified training corpus
```

## Index/retrieve/rank ownership

- Postgres/Graphify: canonical identity, source/AST/graph truth and revisions.
- Qdrant/cuVS/CAGRA: semantic candidate executors for one logical `semantic_768` lane.
- ripgrep/FTS/ast-grep: lexical/structured candidate producers, not identity owners.
- Neo4j/cuGraph: structural feature executors over revisioned graph projections.
- SOM/manifold4: derived topology/orientation features only.
- CrossEncoder: bounded query×candidate relevance feature after cheap candidate pruning.
- Feature ranker: final feature fusion before exact promotion.

## Required cache key

Every expensive computation key MUST include:

```text
operation
input revisions/checksums
parameter hash
producer revision
executor/model revision
representation revision
```

CrossEncoder cache keys additionally include deterministic `RerankDocumentV1` content hash, tokenizer revision, prompt/instruction revision and truncation policy.

## Required gates

- CAND-01 canonical candidate identity round-trip.
- CAND-02 dense CandidateOrdinal determinism.
- CAND-03 no Qdrant/GPU id substitution for canonical identity.
- REV-01 revision dependency graph defined.
- CACHE-01 immutable computation artifact key proven deterministic.
- FEAT-01 all lane features join by CandidateOrdinal.
- FEAT-02 missing learned features are null + availability flag, never synthetic neutral scores.
- MAN4-01 quaternion unit norm enforced.
- MAN4-02 q and -q canonicalize identically.
- MAN4-03 antipodal similarity returns identical-rotation score for q/-q.
- MAN4-04 manifold4 cannot satisfy semantic_768 or identity contracts.
- CE-01 deterministic RerankDocumentV1 text assembly.
- CE-02 CrossEncoder preserves CandidateOrdinal.
- CE-03 reranker cache revision completeness.
- CE-04 benchmark current deterministic ranker vs neural challengers.
- PROMOTE-01 every promoted candidate resolves exact source/AST/graph evidence.
- DSPY-01 program consumes ContextManifest, not raw stores.
- GEPA-01 optimization metric derives from validators/receipts.
- TRAIN-01 only verified outcomes enter gold training corpus; heuristic/OKF labels remain weak supervision.

## Promotion metrics

Measure at minimum:

- Recall@20 / Recall@100
- MRR / nDCG
- wrong-symbol rate
- wrong-tree-node rate
- wrong-source-revision rate
- canonical promotion coverage
- verified-evidence precision
- downstream validated repair success
- query latency
- peak VRAM
- cache-hit latency

## Training boundary

Keep the existing canonical `semantic_768` EmbeddingGemma space frozen. Any domain-adapted encoder uses a new representation/model revision and separate Qdrant collection until it proves retrieval and exact-promotion gains. OKF domain labels may train an auxiliary classifier and provide weak supervision, but retrieval relevance and verified execution outcomes remain the primary learning targets.
