# OpenSpec Change: Agentic Code Index

## Why

The repository contains multiple extraction, retrieval, projection, and GPU-analysis components, but their ownership, provenance, revision lineage, and runtime proof states are not unified. Large-scale indexing can therefore create stale embeddings, duplicate identities, unsupported domain labels, and projections that cannot be reconciled to canonical source.

## What changes

- introduce a canonical code artifact ledger;
- introduce pinned external-source and model provenance;
- separate dense, sparse, structural, entity, graph, and cluster signals;
- add retrieval fusion and bounded reranking;
- add versioned label observations instead of mutable single labels;
- add projection and validation runs;
- add JSONL dataset contracts;
- add incremental invalidation;
- add explicit TensorRT/N-API runtime proof gates.

## Impact

Affected areas are expected to include:

- Drizzle/Postgres schema and migrations
- code parsing and treechunker/tree-sitter
- ast-grep rules
- Qdrant indexing and payload indexes
- search/ranking services
- GPU analysis scripts
- Neo4j/hypergraph projection
- MCP tools and health checks
- ACE packet assembly
- evaluation datasets and tests

No existing component is declared removed until discovery proves duplication and replacement ownership.
