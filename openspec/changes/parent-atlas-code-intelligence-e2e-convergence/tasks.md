# Tasks

## PA-CODE-INTEL-E2E-01 — current-revision code-intelligence spine

- [ ] **CI-E2E-01 Source -> symbol exact join**
  - Freeze one current workspace/source cohort.
  - Require exact source_ref + source_revision + byte interval.
  - Resolve symbol_version_id/tree_node_id only through existing owners.
  - Report missing/stale/ambiguous joins separately; never infer latest.
  - Exit: one receipt proving every admitted row has one exact current identity path.

- [ ] **CI-E2E-02 AST/LSP/Clang evidence convergence**
  - Reuse Tree-sitter/ast-grep structural evidence contracts.
  - Inventory existing LSP observations and exact revision binding.
  - For C/C++, add a bounded Clang/clangd challenger only if no equivalent current
    contract already exists.
  - Record declarations/references/types/include edges as observations with exact spans.
  - No parser/backend ids become canonical identity.
  - Exit: parity/coverage receipt against the same frozen source cohort.

- [ ] **CI-E2E-03 Graph revision convergence**
  - Trace the current canonical graph snapshot owner and PageRank owner.
  - Materialize/observe only revision-qualified typed relationships.
  - Prove NetworkX/cuGraph parity using the existing graph-revision contract.
  - Keep SocratiCode graph facts as evidence/reference where already wired.
  - Keep semantic k-NN graph explicitly separate as DERIVED_SEMANTIC_KNN,
    canonicalAuthority=false.
  - Exit: one graph_revision consumed by downstream retrieval with no stale joins.

- [ ] **CI-E2E-04 Retrieval -> ContextManifest -> MCP**
  - Run lexical + semantic + graph evidence through existing retrieval owners.
  - Resolve canonical candidate identity before ordinal assignment.
  - Build CandidateOrdinalMap and CandidateFeatureMatrix from the same frozen snapshot.
  - Admit selected evidence through existing ContextManifest owner.
  - Resolve one MCP/tool proposal against a revisioned registry without write execution.
  - Exit: one trace id linking query -> candidates -> ordinals -> features ->
    ContextManifest -> proposal receipt.

- [ ] **CI-E2E-05 Bounded end-to-end proof**
  - Select one real code-intelligence question with a known file/symbol answer.
  - Run source -> symbol -> AST/LSP -> graph -> retrieval -> ContextManifest -> MCP.
  - No datastore/cache/model writes are required for the first proof.
  - Record correct-file@k, correct-symbol@k, stale-join count, missing-authority count,
    graph/retrieval latency and evidence refs.
  - Fail closed if any admitted evidence lacks exact current lineage.

## CI-SEM-GRAPH-01 — semantic topology challenger (separate from canonical graph)

- [x] Decision: PageRank over embeddings requires a real graph; use a deterministic
  bounded cosine k-NN adjacency rather than passing embeddings directly.
- [x] Keep semantic k-NN graph noncanonical (`canonicalAuthority=false`).
- [x] Route PageRank/attention/KMeans/SOM through the existing pytorch-graph owner
  instead of duplicating native N-API signatures.
- [x] Add CPU PageRank oracle and connected-components diagnostics.
- [ ] Run focused Vitest for `semantic-knn-graph-v1.spec.ts` on the workstation.
- [ ] Run bounded dry replay against current Qdrant semantic_768
  (`--limit=128 --graph-limit=128 --graph-k=8`).
- [ ] Record GPU/CPU PageRank max-abs error, graph density/components, KMeans/SOM
  result shapes and execution sources.
- [ ] Do not run `--apply` until the dry report is reviewed.

## Compaction handoff — 2026-09-27

### PROVEN / implemented in source
- The earlier LibTorch five-zero-caller census was wrong; all five have real callers.
- Attention, KMeans and SOM argument-shape defects in the semantic embedding script
  were identified; native contracts require flattened Float32Array buffers.
- Semantic PageRank cannot operate on embeddings directly; it requires adjacency.
- Existing `pytorch-graph.ts` already owns PageRank, attention, KMeans and SOM
  signatures plus CPU fallback behavior.
- New semantic graph implementation lives in
  `sveltekit-frontend/src/lib/server/graph/semantic-knn-graph-v1.ts`.
- The semantic graph is derived retrieval topology only, never canonical code graph.
- The canonical PageRank/code-graph path remains the Graphify/Neo4j/NetworkX/cuGraph
  owner over actual typed code relationships.

### OPEN
- Workstation test execution for the new semantic graph helper.
- Dry Qdrant replay and GPU-vs-CPU PageRank parity receipt.
- Exact source_revision -> symbol/version overlap across the current cohort.
- One current graph_revision feeding retrieval without stale joins.
- Full retrieval -> ContextManifest -> MCP trace proof.
- Optional C/C++ Clang challenger design/fixture after current-owner inventory.

### BLOCKED / do not infer
- Do not classify semantic k-NN edges as import/call/reference relationships.
- Do not create a peer symbol/identity owner for Clang USRs or clangd ids.
- Do not add another graph DB, vector DB, parser framework or MCP server.
- Do not promote cache presence, vector similarity, classifier labels or ontology
  tuples into canonical identity.
- Do not treat checklist completion in adjacent OpenSpec changes as E2E proof here.

### Safe next commands
```
cd C:/Users/james/Videos/deeds-web-app/sveltekit-frontend
npx vitest run src/lib/server/graph/semantic-knn-graph-v1.spec.ts

cd ..
npx tsx scripts/atlas/gemma4-semantic-embedding-cache.mts \
  --dry-run --limit=128 --graph-limit=128 --graph-k=8

npx openspec validate parent-atlas-code-intelligence-e2e-convergence --strict
```
