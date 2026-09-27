# Design: Parent Atlas code-intelligence E2E convergence

## Ownership invariants

1. PostgreSQL/revision-qualified source rows own canonical source identity.
2. Symbol/version identity is resolved by the existing symbol registry owner.
3. Tree-sitter/ast-grep observations are structural evidence, not identity.
4. Clang/libTooling/clangd observations, when added, are C/C++ semantic evidence only.
5. Neo4j/cuGraph/NetworkX are graph executors/projections, not source identity owners.
6. semantic_768/Qdrant and semantic k-NN are retrieval artifacts, not graph identity.
7. ContextManifest remains the context/evidence admission boundary.
8. MCP/tool registries execute admitted proposals; they do not mint source/symbol identity.

## Frozen route

```
current source revision
  -> symbol/version resolution
  -> AST/LSP/optional Clang evidence
  -> revision-qualified graph snapshot
  -> lexical/semantic/graph retrieval
  -> canonical candidate identity
  -> CandidateOrdinalMap
  -> CandidateFeatureMatrix
  -> ContextManifest
  -> MCP/tool proposal
  -> execution/evidence receipt
```

Every join must either carry the exact revision/identity tuple or fail closed.

## Semantic k-NN PageRank decision

The repaired semantic embedding experiment may construct:

```
semantic_768 vectors
  -> deterministic bounded cosine k-NN
  -> weighted row-major adjacency
  -> PageRank / connected components / KMeans / SOM
```

This artifact is labeled `DERIVED_SEMANTIC_KNN` and
`canonicalAuthority=false`. Default experiment bounds are intentionally small
(e.g. graph-limit <= 512, k=8) because dense PageRank adjacency is O(n^2).

The canonical authority PageRank path remains the graph built from actual code
relationships (imports/calls/references/etc.) through the existing Graphify/Neo4j/
NetworkX/cuGraph owners. Semantic PageRank is a challenger feature, not a replacement.

## Clang boundary

For C/C++ only:

```
Tree-sitter / ast-grep
  = syntax/structure/exact spans

Clang tooling
  = declarations, types, overload resolution, references, includes

clangd/LSP
  = request-time editor semantics
```

Clang observations must resolve through exact
`(source_ref, source_revision, byte_start, byte_end)` before symbol/version
promotion. No Clang USR or backend node id becomes Parent Atlas canonical identity
without the existing resolution owner.

## SocratiCode boundary

SocratiCode can remain a graph-fact/reference producer where already wired. This
change uses it for parity/coverage comparison only and does not add a second
canonical graph or identity authority.
