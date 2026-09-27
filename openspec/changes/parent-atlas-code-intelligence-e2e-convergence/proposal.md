# Change: Parent Atlas code-intelligence E2E convergence

## Why

Parent Atlas already has parser, AST, symbol, graph, lexical, semantic, ontology,
ContextManifest, MCP and GPU components. The remaining product risk is not lack of
another framework; it is whether one current source revision can traverse the
existing owners without stale, inferred, duplicate or cross-representation joins.

This change therefore converges the existing code-intelligence owners instead of
introducing a new parser, graph database, vector store, retrieval owner, identity
schema, cache framework or MCP surface.

A separate semantic-topology experiment may build a bounded cosine k-NN graph from
semantic_768 vectors for PageRank/KMeans/SOM research. That graph is explicitly a
DERIVED_RETRIEVAL_ARTIFACT with canonicalAuthority=false. It must never replace the
Tree-sitter/AST/import/call graph or become source/symbol identity authority.

## What changes

- Prove the exact source_revision -> symbol/version -> AST/LSP observation join.
- Add C/C++ Clang/clangd evidence only as a challenger semantic-authority lane,
  preserving Tree-sitter/ast-grep as the cross-language structural lane.
- Reconcile graph evidence into one revision-qualified graph snapshot consumed by
  retrieval rather than adding another graph owner.
- Prove retrieval candidate identity -> CandidateOrdinalMap/FeatureMatrix ->
  ContextManifest -> MCP/tool evidence under one trace/revision chain.
- Run one bounded end-to-end proof and record stale/missing-authority failures.
- Keep SocratiCode as a comparison/reference and existing graph-fact producer where
  already wired; do not make it a canonical identity owner.

## Non-goals

- No new vector database, graph database, parser framework, embedding model or MCP server.
- No promotion of semantic k-NN graph edges into canonical code-graph identity.
- No cache/Valkey/BitFrost authority changes.
- No model-state/KV ownership changes.
- No destructive native/GPU cleanup in this change.
