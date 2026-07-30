# Parent Atlas Phase 110 — Agentic Code Indexing

Status: DESIGN_APPROVED / IMPLEMENTATION_PENDING / RUNTIME_PROOF_PENDING

This bundle defines a provenance-aware pipeline for indexing large code corpora into:

- Postgres canonical artifact records
- Qdrant dense and sparse projections
- deterministic AST relationships
- optional Neo4j/hypergraph projections
- versioned summaries and labels
- K-means/SOM routing features
- bounded ACE packets
- retrieval and agent evaluations

It deliberately does **not** claim that TensorRT, the N-API bridge, HyperGraphRAG, cuGraph, CAGRA, IVF, SOM, or cross-store parity are wired until their runtime proof gates pass.

## Execution order

1. Run `scripts/atlas/phase-110-discover.sh` from the repository root.
2. Review `artifacts/phase-110/discovery/`.
3. Implement the canonical Postgres artifact and provenance tables.
4. Add deterministic extraction using existing tree-sitter/treechunker/ast-grep owners.
5. Add dense and sparse projections.
6. Add fusion and reranking.
7. Add summaries and label observations.
8. Add clustering only after metadata and embeddings validate.
9. Add graph projections only after canonical identities and relationships validate.
10. Run all proof gates in `specs/phase-110-agentic-code-index/spec.md`.

## Architectural rule

Postgres is authority. Qdrant, Redis, Neo4j, SOM, K-means, summaries, and ACE packets are versioned projections.
