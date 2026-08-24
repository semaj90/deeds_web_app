# Parent Atlas Retrieval Reconciliation — Requirements

## Requirement: Retrieval lanes remain semantically distinct

The system SHALL preserve logical retrieval lane identity across executors.

Recommended logical lanes include lexical, structural/AST, semantic, graph and association/low-rank.

Multiple executors for one lane SHALL NOT receive independent fusion votes.

### Current owner status and references

The verified Graphify lexical owner is PostgreSQL native full-text search:
`tsvector` candidate lookup through GIN and `ts_rank_cd` relevance scoring.
This SHALL be labeled `POSTGRES_FTS_AST` in receipts. The repository has not
demonstrated a `pg_search` BM25 index or scorer, so `BM25_AST` remains an
unproven alternate owner rather than a production claim.

Reference URLs:

- PostgreSQL full-text search: https://www.postgresql.org/docs/18/textsearch.html
- PostgreSQL GIN indexes: https://www.postgresql.org/docs/current/gin.html
- PostgreSQL pg_trgm: https://www.postgresql.org/docs/18/pgtrgm.html
- ParadeDB pg_search BM25: https://www.paradedb.com/learn/search-in-postgresql/bm25
- ParadeDB pg_search source: https://github.com/paradedb/paradedb/blob/main/pg_search/README.md

The structural lane SHALL use AST-grep/tree-sitter structure rather than
regular-expression source parsing. AST-grep patterns and rules are structural
candidate extraction; simdjson is reserved for large JSON/NDJSON manifests and
receipts, not source parsing.

Reference URLs:

- AST-grep pattern syntax: https://ast-grep.github.io/guide/pattern-syntax.html
- AST-grep rules: https://ast-grep.github.io/reference/rule.html
- AST-grep API: https://ast-grep.github.io/reference/api.html
- AST-grep CLI: https://ast-grep.github.io/reference/cli.html
- Tree-sitter SyntaxNode: https://tree-sitter.github.io/node-tree-sitter/interfaces/SyntaxNode.html
- simdjson basics: https://github.com/simdjson/simdjson/blob/master/doc/basics.md
- simdjson On Demand design: https://github.com/simdjson/simdjson/blob/master/doc/ondemand_design.md

NetworkX remains the CPU algorithm contract and `nx-cugraph`/cuGraph remains
an optional accelerated executor. PageRank, Leiden, spectral diagnostics and
cuVS/CAGRA are graph or ANN signals, not additional canonical truth stores.

Reference URLs:

- NetworkX backends: https://networkx.org/documentation/stable/backends.html
- nx-cugraph: https://docs.rapids.ai/api/cugraph/stable/nx_cugraph/
- cuGraph API: https://docs.rapids.ai/api/cugraph/stable/api_docs/
- cuGraph PageRank: https://docs.rapids.ai/api/cugraysph/stable/api_docs/api/cugraph/cugraph.pagerank.html
- cuVS CAGRA: https://docs.rapids.ai/api/cuvs/stable/python_api/neighbors_cagra.html
- cuVS distance: https://docs.rapids.ai/api/cuvs/stable/python_api/distance.html

---

## Requirement: Canonical identity promotion before fusion

Candidate results from Postgres/BM25, Qdrant, Neo4j, NetworkX/cuGraph, AST indexes or low-rank factors SHALL resolve to canonical candidate/feature identity before cross-lane fusion whenever possible.

Degraded identity SHALL remain explicit and observable.

### Cross-store identity and fan-out alignment

The reconciliation receipt SHALL distinguish the canonical identity fields
`source_ref`, `packet_key`, `feature_id`, `feature_label`, and `tree_node_id`.
When a store does not carry all fields, the receipt SHALL record the join path
used to recover them and SHALL mark the candidate degraded when recovery is
ambiguous. `codebase_chunk_index` embeddings, Qdrant points, Neo4j nodes,
NetworkX/cuGraph graph rows, Drizzle JSON/JSONB projections, and n-ary
`hypergraph_edges` participants SHALL be treated as projections of the same
canonical evidence, not independent identities.

Parallel lane fan-out MAY run lexical, dense, AST, graph, hypergraph, and
recommendation probes concurrently, but fan-out results SHALL be joined before
fusion and SHALL preserve lane, graph revision, embedding revision, and
projection revision. A successful local lane smoke SHALL NOT promote the
reconciliation gate while cross-store counts or identity coverage diverge.

---

## Requirement: Inverse lexical lookup

Atlas MAY maintain inverse lexical indexes from terms/tokens to canonical evidence or feature IDs for exact and BM25-style retrieval.

Lexical scores SHALL remain retrieval relevance signals and SHALL NOT be interpreted as feature completion.

---

## Requirement: Dense/vector projection

Qdrant collections MAY store semantic vectors and metadata tags for canonical evidence/features.

Each vector point SHALL carry canonical identity, projection revision, embedding model/revision, domain and feature/evidence tags sufficient for deterministic filtering and reconciliation.

### Dense lane alignment contract

The canonical dense content lane is 768-dimensional EmbeddingGemma output.
PostgreSQL `codebase_chunk_index.content_embedding_768` is the canonical
content vector, and Qdrant collection `codebase_chunks_768` named vector
`content` is its rebuildable projection. A content projection SHALL reuse the
existing `qdrant_id` and preserve `source_ref`; it SHALL NOT create a second
point identity.

The 768-dimensional `signature` vector is a separate structural/signature
lane. It SHALL remain distinct from semantic content ranking even when both
vectors are stored on the same Qdrant point. The legacy 384-dimensional lane
is compatibility or routing-only and SHALL NOT replace `semantic_768`.

TurboVec, cuVS/CAGRA, FAISS experiments, and GPU rerankers MAY accelerate
candidate generation or exact rescoring, but SHALL remain behind the same
retrieval backend boundary. Their indexes are projections and SHALL NOT
become canonical identity or evidence stores.

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

### Scenario: bounded recommendation fan-out

Given a query with lexical terms, an EmbeddingGemma 768-dimensional vector,
AST symbols, graph seeds, and optional n-ary hyperedge participants, when the
retrieval orchestrator fans out across Go retrieval, PostgreSQL/Drizzle,
Qdrant, Neo4j, NetworkX/cuGraph, and Valkey centroids, then each returned
candidate SHALL retain its canonical identity, lane score, and provenance
before neural reranking or a "did you mean" suggestion is generated. The
autoencoder/SOM 20x20 and KMeans features MAY provide routing or association
priors, but SHALL NOT replace exact identity or evidence authority.
