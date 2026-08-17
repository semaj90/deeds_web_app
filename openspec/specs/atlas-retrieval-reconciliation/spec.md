# Parent Atlas Retrieval Reconciliation — Requirements

## Requirement: Retrieval lanes remain semantically distinct

The system SHALL preserve logical retrieval lane identity across executors.

Recommended logical lanes include lexical, structural/AST, semantic, graph and association/low-rank.

Multiple executors for one lane SHALL NOT receive independent fusion votes.

---

## Requirement: Canonical identity promotion before fusion

Candidate results from Postgres/BM25, Qdrant, Neo4j, NetworkX/cuGraph, AST indexes or low-rank factors SHALL resolve to canonical candidate/feature identity before cross-lane fusion whenever possible.

Degraded identity SHALL remain explicit and observable.

---

## Requirement: Inverse lexical lookup

Atlas MAY maintain inverse lexical indexes from terms/tokens to canonical evidence or feature IDs for exact and BM25-style retrieval.

Lexical scores SHALL remain retrieval relevance signals and SHALL NOT be interpreted as feature completion.

---

## Requirement: Dense/vector projection

Qdrant collections MAY store semantic vectors and metadata tags for canonical evidence/features.

Each vector point SHALL carry canonical identity, projection revision, embedding model/revision, domain and feature/evidence tags sufficient for deterministic filtering and reconciliation.

---

## Requirement: Graph projection

Neo4j, NetworkX and cuGraph MAY execute traversal, PageRank, PPR, fanout, community and path algorithms over the same canonical edge snapshot.

Algorithm outputs SHALL identify the graph revision and map back to canonical feature/evidence IDs.

---

## Requirement: SVD/low-rank association lane

SVD or related low-rank factorization MAY generate association candidates over feature/evidence matrices.

Low-rank association SHALL be treated as candidate generation or weak evidence, not canonical semantic truth.

### Scenario: Hidden feature association

Given two features share a strong low-rank factor but no direct graph edge,
when Atlas expands candidates,
then it MAY inspect their shared evidence neighborhoods before creating any canonical relation.

---

## Requirement: Feature-row materialization

Atlas SHOULD materialize a revisioned feature matrix where rows correspond to canonical `feature_id` and columns contain normalized derived signals such as:

- lexical evidence counts
- semantic centroids or projections
- AST/structural counts
- graph centrality/fanout
- schema/table coverage
- package capability coverage
- test/validation coverage
- runtime evidence coverage
- uncertainty/staleness flags

The matrix SHALL be derivable from canonical evidence and SHALL NOT become a separate source of truth.
