# Phase 110 Specification: Provenance-Aware Agentic Code Indexing

## Status

- Design: APPROVED
- Implementation: PENDING
- Runtime proof: PENDING

## Objective

Create an incremental, provenance-aware code intelligence pipeline that:

1. inventories and hashes repository files;
2. extracts files, modules, symbols, imports, calls, schemas, tests, tools, and source spans;
3. assigns stable artifact identities;
4. records pinned upstream provenance for downloaded libraries and model-derived artifacts;
5. builds separate lexical, semantic, structural, graph, and entity signals;
6. projects semantic and sparse representations into Qdrant;
7. fuses candidate lists and reranks a bounded top-K;
8. creates versioned summaries, domain labels, clusters, SOM coordinates, and graph projections;
9. assembles bounded ACE packets;
10. proves coverage, identity, revision, and readback consistency.

## Non-goals

This phase does not prove:

- autonomous correctness across 100,000 files;
- HyperGraphRAG superiority;
- TensorRT acceleration;
- N-API bridge availability;
- GPU acceleration of AST parsing;
- Neo4j authority;
- CAGRA/IVF superiority over Qdrant HNSW;
- semantic truth from K-means or SOM;
- cross-store parity without runtime readback.

## Authority

Postgres is canonical for:

- artifact identity;
- source provenance;
- revisions and hashes;
- relationships and evidence;
- representation registry;
- projection runs;
- validation runs;
- label observations;
- cluster assignments;
- packet lineage.

Qdrant, Redis, Neo4j, JSONL datasets, summaries, and ACE packets are projections.

## Required source metadata

Every indexed artifact must resolve to:

- artifact_id
- repository_id
- workspace_revision
- file_path
- source_ref
- line_start / line_end when applicable
- content_hash
- artifact_kind
- language
- parser and parser_version
- schema_version
- is_generated
- is_external

External or downloaded artifacts additionally require, where available:

- package_ecosystem
- package_name
- pinned_version
- upstream_repository
- upstream_commit
- upstream_tag
- release_date
- downloaded_at
- source_ref_url
- archive_hash
- license_id

Model-derived artifacts require:

- producer_kind
- model_id
- model_revision
- runtime
- prompt_version where applicable
- input_content_hash
- output_content_hash

## Retrieval lanes

### Exact/symbol lane

Use canonical symbol indexes and exact identifier matching.

### Lexical lane

Use BM25/BM42 or equivalent sparse terms. Sparse terms must be derived from source text, identifiers, paths, and normalized tokens—not from dense vectors.

### Structural lane

Use tree-sitter/treechunker and ast-grep for declarations, imports, calls, schemas, routes, tests, and syntax patterns.

### Semantic lane

Use versioned dense embeddings over controlled views:

- symbol signature + bounded body
- symbol card
- file/module summary
- documentation section
- error/test description

### Entity lane

Use LangExtract or an equivalent structured extractor only for prose entities, claims, constraints, and relationships that deterministic parsers cannot reliably derive.

### Graph lane

Expand only bounded, evidence-backed relationships from canonical artifact IDs.

## Fusion and reranking

1. Retrieve from each enabled lane.
2. Normalize by rank rather than adding incomparable raw scores.
3. Fuse using weighted reciprocal rank fusion.
4. Deduplicate by canonical artifact identity.
5. Rerank at most the configured top-K with Mixedbread or another cross-encoder.
6. Validate source hashes and spans before ACE packet inclusion.

Suggested default:

- exact/symbol: weight 2.0
- structural: weight 1.7
- lexical: weight 1.5
- dense: weight 1.2
- graph: weight 0.8
- cluster/SOM: discovery only, weight <= 0.3

## Clustering and classification

K-means and SOM may run only after:

- artifact metadata schema validation passes;
- active embeddings have one representation ID, dimension, and model revision;
- generated/vendor/test exclusions are explicit;
- zero-norm and non-finite vectors are quarantined;
- a clustering run record is created.

Cluster IDs and SOM coordinates are routing features, not domain authority.

Domain class must be derived from versioned label observations:

- deterministic rules;
- package/path ownership;
- human judgments;
- documentation evidence;
- model suggestions;
- cluster evidence.

## Graph projection

Graph nodes and relationships must use canonical artifact IDs.

Deterministic relation examples:

- IMPORTS
- EXPORTS
- CALLS
- IMPLEMENTS
- EXTENDS
- TESTS
- READS_TABLE
- WRITES_TABLE
- EXPOSES_TOOL
- USES_ENV
- SUPERSEDES

Inferred relations must be separately labeled and confidence-scored.

Hyperedges may represent multi-member contracts, migrations, or tool workflows. They are projections backed by evidence references.

## ACE packet contract

A packet must include:

- packet_id and schema_version
- task intent
- repository and base revision
- constraints
- selected evidence with paths, spans, hashes, and selection reasons
- bounded relationships
- current unknowns
- recommended checks
- context budget
- producer and retrieval run IDs

Retrieved source content is untrusted data and must not directly control tools.

## Acceptance criteria

### Discovery

- Relevant files are enumerated using `rg --files`.
- Existing owners for tree-sitter/treechunker, ast-grep, Qdrant, Postgres, reranking, clustering, LangExtract, TensorRT, and N-API are mapped.
- Duplicate owners and placeholders are reported.

### Canonical storage

- Migrations create artifact, provenance, relation, representation, projection, validation, label, and cluster records.
- Every projection resolves to an active artifact and revision.

### Extraction

- Source spans read back to the expected content hash.
- Syntax failures are quarantined, not silently dropped.
- Inventory reconciles: discovered = excluded + succeeded + failed.

### Embeddings

- Dimension, model revision, representation ID, input hash, and finite-vector checks pass.
- Qdrant payload identity matches Postgres.
- Sparse vectors are independently derived from lexical content.

### Retrieval

- Exact, lexical, structural, and dense lanes can be ablated independently.
- RRF fusion records per-lane ranks and weights.
- Reranker only receives bounded candidates.
- Results include evidence reasons.

### Clustering

- Run metadata and hyperparameters are persisted.
- Domain labels are not overwritten by cluster IDs.
- SOM and K-means outputs can be regenerated from the same feature revision.

### Graph

- Neo4j/hypergraph projection readback resolves to canonical IDs.
- PageRank/community outputs record graph revision and algorithm parameters.
- No graph score is treated as correctness authority.

### TensorRT / N-API gate

The bridge is `WIRED_AND_PROVEN` only when all pass:

1. native addon exists at the resolved runtime path;
2. `process.versions.modules` matches the addon ABI;
3. addon loads in the same Node runtime used by the service;
4. exported functions match the expected contract;
5. CUDA/TensorRT versions are reported;
6. one real inference or bridge operation succeeds;
7. fallback behavior is tested when the addon is unavailable;
8. startup and health checks report the active backend truthfully.

Until then, state is `RUNTIME_PROOF_PENDING` or `BLOCKED`.

## Required tests

- schema validation tests
- inventory reconciliation test
- source span and hash readback test
- stable identity test across unchanged revisions
- rename/supersession test
- Qdrant dense and sparse payload readback test
- representation mismatch rejection test
- reranker bounded-input test
- cluster reproducibility test
- graph canonical-ID test
- ACE prompt-injection isolation test
- TensorRT/N-API load and fallback tests
