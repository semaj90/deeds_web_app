# Tasks

## 1. Discover owners

- [ ] Run phase-110 discovery script.
- [ ] Map each relevant file to owner, role, runtime, and proof state.
- [ ] Identify placeholder implementations and duplicated contracts.
- [ ] Record TensorRT/N-API paths and consumers.

## 2. Canonical schema

- [ ] Add code artifact ledger.
- [ ] Add source provenance.
- [ ] Add representation registry.
- [ ] Add projection and validation runs.
- [ ] Add label observations.
- [ ] Add cluster run and assignment tables.
- [ ] Add hyperedge tables only if an existing owner is confirmed.

## 3. Extraction

- [ ] Reuse existing treechunker/tree-sitter owners.
- [ ] Add ast-grep structural rules.
- [ ] Add source-span and content-hash readback.
- [ ] Quarantine parser failures.
- [ ] Reconcile inventory counts.

## 4. Retrieval

- [ ] Build lexical records.
- [ ] Build dense representations.
- [ ] Project both to Qdrant.
- [ ] Implement weighted RRF.
- [ ] Add Mixedbread-compatible reranker interface.
- [ ] Persist retrieval traces and evidence reasons.

## 5. Enrichment

- [ ] Add bounded symbol and module summaries.
- [ ] Add LangExtract only for prose.
- [ ] Add rule and judgment label observations.
- [ ] Add prompt-injection isolation.

## 6. Offline analysis

- [ ] Materialize a versioned feature matrix.
- [ ] Run K-means.
- [ ] Run SOM 20x20 only after cluster gate.
- [ ] Persist hyperparameters and metrics.
- [ ] Add optional PageRank/community projection after graph gate.

## 7. Runtime proof

- [ ] Prove Qdrant dense/sparse readback.
- [ ] Prove Postgres identity parity.
- [ ] Prove Neo4j canonical-ID projection if enabled.
- [ ] Prove TensorRT/N-API load, operation, and fallback.
- [ ] Run retrieval evaluation.
- [ ] Run bounded ACE packet coding task.
