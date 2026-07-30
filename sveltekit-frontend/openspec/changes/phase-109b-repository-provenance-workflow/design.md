## Phase 109B Repository Provenance Workflow Design - 2026-07-30

## Design

The workflow is organized as a deterministic foundation with progressively richer derived layers.

### Authority Layers

- **Postgres** owns canonical artifact identity, content hashes, provenance, labels, summaries, and validity ranges.
- **Qdrant** owns retrieval projections for dense and sparse vectors.
- **Neo4j** owns graph relationships and topology traversal.
- **Redis** owns hot cache and transient execution state.

### Artifact Model

Every derived object should carry:

- artifact identity
- repository revision
- source reference
- content hash
- producer revision
- schema version
- validity window

### Incremental Updates

If a file hash does not change, its parsed structure, lexical index entries, embeddings, labels, and graph edges may be reused. If a hash changes, only dependent artifacts must be invalidated.

### Retrieval

Query-time search must combine:

- exact symbol lookup
- lexical ranking
- semantic ranking
- bounded graph expansion
- reranking

No single lane may be treated as complete evidence on its own.
