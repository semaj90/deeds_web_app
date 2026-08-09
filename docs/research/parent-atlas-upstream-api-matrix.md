# Parent Atlas Upstream API Matrix

This document maps the live Parent Atlas owners to the upstream APIs they should
track. It is a gap map, not a request to create new peer owners.

Repo rule of thumb:

- Postgres remains identity and lineage truth.
- Python \	reesitter-chunker\ is the current structural extraction implementation. Tree-sitter + ast-grep provide parsing/query primitives. simd-json provides JSON parsing acceleration.
- \python/langextract_service.py\ remains the Python NLP/extraction sidecar and grounding layer.
- cuGraph / cuVS are GPU analysis oracles, not canonical retrieval owners.
- Qdrant remains the online retrieval projection.
- \FeatureRowV1\ stays narrow; wide signals belong in offline experiment matrices.

## Corrected NLP Sidecar Structure

\miniforge_nlp_sidecar
│
├── structural
│   ├── treesitter-chunker  (HIGHEST authority for code, deterministic)
│   └── ast-grep            (deterministic structural queries/rules)
│
├── lexical
│   ├── identifier splitter (camelCase, snake_case, paths, symbols)
│   ├── keyword extraction
│   └── rg evidence adapter
│
├── linguistic              [optional, disabled by default]
│   └── Stanza              (UPOS/XPOS/morphology, lemmatization, dependency parsing)
│       Input: comments, docstrings, error messages, OpenSpec text, README/docs, user query
│       NOT: raw TypeScript/Python/Rust source
│
├── sequence
│   ├── HMM observation builder
│   └── Viterbi / Baum-Welch
│
├── rerank
│   ├── MiniLM              (query↔candidate relevance)
│   └── Mixedbread
│
└── grounded
    └── LangExtract         [conditional, expensive]
\
**NLP Pass Hierarchy** (by authority):
1. Tree-sitter / treesitter-chunker — deterministic code structure (HIGHEST for code)
2. ast-grep — deterministic structural queries/rules
3. lexical / identifier analysis — camelCase, snake_case, paths, symbols, rg/BM25
4. EmbeddingGemma semantic_768 — semantic geometry
5. MiniLM / Mixedbread — query↔candidate relevance
6. Stanza or spaCy — linguistic features from prose/comments/errors
7. LangExtract — expensive grounded structured extraction
8. Ornith — reasoning / synthesis

**Stanza vs spaCy decision**: Stanza preferred for multilingual consistency and accuracy. spaCy only if speed/engineering simplicity wins for corpus. Baseline to beat: no POS parser at all.

## Verified owner summary

| area | current repo owner | repo status | note |
|---|---|---:|---|
| structural parsing | \python/miniforge_nlp_sidecar.py\, \python/langextract_service.py\, \sveltekit-frontend/src/lib/server/analysis/ast-langextract-bridge.ts\, \sveltekit-frontend/src/lib/server/langextract/native.ts\, \scripts/atlas/phase1-ast-grep-extraction.mjs\, \scripts/atlas/phase1.5-ast-grep-extraction.mjs\ | active | Python \	reesitter-chunker\ is the current structural extraction implementation; Tree-sitter + ast-grep are parsing/query primitives; Boundary IR AstUnit facts project into atlas_ast_nodes with packet_key null at that stage; AstUnit is the permanent canonical contract, not the third party package itself |
| NLP extraction | \python/langextract_service.py\, \sveltekit-frontend/src/lib/server/langextract/\*\ | active | Python LangExtract service is the current NLP/extraction sidecar and grounding layer. Stanza is optional linguistic pass for comments/docstrings/errors. |
| graph analysis | \src/lib/server/graph/graph-analysis-runner.ts\, \src/lib/server/graph/pagerank-analysis-adapter.ts\, \src/lib/server/graph/neo4j-gds-client.ts\ | active | PageRank + Louvain are live; Leiden/k-core/betweenness remain stubs/analysis-only. |
| GPU sidecar | \simd-bridge/\*\, \scripts/atlas/check-simd-json-runtime.mjs\, \scripts/atlas/run-louvain-analysis.mts\ | active | GPU substrate is split across the existing bridge + analysis runners, not a new service per algorithm. |
| retrieval rerank | \src/lib/server/retrieval/canonical-rerank-executor.ts\, \cross-encoder-reranker.ts\, eranker-blend.ts\, \cross-ranker.ts\ | active | Canonical rerank path already exists; improve it, do not replace it. |
| embeddings | \mbeddinggemma:latest\ via Ollama / current 768 policy | active | Canonical dense semantic lane is 768; 384 is legacy/migration evidence only. |

## Upstream API matrix

| capability | upstream | documented version | installed version | exact API | constraints | Parent Atlas owner | repo status | missing wiring | source URL |
|---|---|---:|---|---|---|---|---|---|---|
| PageRank / HITS / Louvain / Leiden / k-core / betweenness / BFS / SSSP | cuGraph | 26.06 stable | 26.06.00/26.06.01 in \tlas-rapids-cu13.yml\ | \cugraph.pagerank\, \cugraph.hits\, \cugraph.louvain\, \cugraph.leiden\, \cugraph.core_number\, \cugraph.k_core\, \cugraph.betweenness_centrality\, \cugraph.bfs\, \cugraph.sssp\ | Leiden requires an undirected weighted graph; BFS/SSSP return predecessor/distance outputs; some algorithms expose convergence / iteration controls | \graph-analysis-runner.ts\, \graph-analysis-sidecar.ts\, eo4j-gds-client.ts\ | PageRank + Louvain live; Leiden/k-core/betweenness are analysis-only stubs | cuGraph parity lane should remain an oracle / sidecar, not a canonical owner | https://docs.rapids.ai/api/cugraph/stable/api_docs/ ; https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.leiden/ |
| exact KNN / brute force / CAGRA / KMeans / PCA | cuVS | 26.06 stable | 26.06.00 in \tlas-rapids-cu13.yml\ | \cuvs.neighbors.brute_force.Index\, \uild\, \search\, \save\, \load\; \cuvs.neighbors.cagra.IndexParams\, \uild\, \search\; \cuvs.cluster.kmeans.KMeansParams\, \it\, \predict\; PCA \Params\, \it\, \it_transform\, \	ransform\, \inverse_transform\ | brute-force supports CUDA-array inputs and \loat16\ / \loat32\; CAGRA uses graph degree controls and may require host-memory input for ACE build; KMeans supports \streaming_batch_size\ for host batching; explicit esources.sync()\ is required when reusing resources | GPU sidecar / vector contract | exact KNN live as oracle; CAGRA/KMeans/PCA are the next bounded lanes | Keep exact brute-force as the oracle before promoting ANN / cluster outputs | https://docs.rapids.ai/api/cuvs/stable/python_api/ ; https://docs.rapids.ai/api/cuvs/stable/python_api/neighbors_brute_force/ ; https://docs.rapids.ai/api/cuvs/stable/python_api/neighbors_cagra/ ; https://docs.rapids.ai/api/cuvs/stable/python_api/cluster_kmeans/ |
| BM25 / hybrid retrieval / RRF / multivectors | Qdrant | current hosted service docs | repo uses Qdrant clients and retrieval adapters; service version not pinned in repo | BM25 document embedding/query model (\qdrant/bm25\); hybrid prefetch + \Rrf()\ query; named vector / multivector docs on the hybrid page | RRF is a second-stage fusion over 2+ prefetches; multivectors are for bounded late interaction, not corpus-wide token expansion | \canonical-rerank-executor.ts\, retrieval orchestration, Qdrant search backend | active | keep late interaction bounded; do not promote Qdrant as canonical truth | https://qdrant.tech/documentation/inference/inference-bm25/ ; https://qdrant.tech/documentation/search/hybrid-queries/ |
| Tree-sitter parsing / Rust bindings | Tree-sitter | current docs site / crate \	ree_sitter\ 0.26.12 | \	ree-sitter\ 0.25.1, \	ree-sitter-typescript\ 0.23.2, \	ree-sitter-go\ 0.25.0, \	ree-sitter-python\ 0.25.0, \web-tree-sitter\ 0.26.11 in \package.json\ | \Parser\, \Language\, \	ree_sitter\ Rust crate; incremental \parse()\ / \	ree.edit()\ workflow; official Rust bindings | incremental parsing, syntax-tree update on edits, CST / AST boundary support | structural worker / AST chunk lineage | active | no \	reesitter-chunker\ canonical owner; the primitives are already in-repo | https://tree-sitter.github.io/tree-sitter/ ; https://docs.rs/tree-sitter |
| ast-grep structural search / rewrite | ast-grep | current docs | repo uses ast-grep scripts; package version not pinned in this repo slice | Tree-sitter-backed pattern matching, rewrite, structural queries | works on CST / structural matching, not textual search alone | \scripts/atlas/phase1-ast-grep-extraction.mjs\, \scripts/index/ast-grep-map.mjs\ | active | keep it as a structural query layer, not a parser owner | https://ast-grep.github.io/advanced/core-concepts.html |
| JSON SIMD parsing / Serde bridge | simd-json | current docs / latest crate | no direct Python \simd-json\ dependency pinned; repo has vendored/native simdjson bridge code and runtime checks | \simd_json::serde::from_slice\, \serde_impl\, \BorrowedValue\ / \OwnedValue\ | Serde-compatible; runtime feature gating for serializer/deserializer support | \src/lib/server/gpu/simdjson-bridge.ts\, \src/lib/utils/simd-json-parser.ts\, \simd-bridge/\*\ | active | keep as parsing acceleration; do not make it semantic identity | https://docs.rs/simd-json |
| UPOS / XPOS / morphology / lemmatization / dependency parsing | Stanza | current PyPI | not installed; optional, disabled by default | \stanza.Model\, \stanza.Document\, \stanza.Sentence\, \stanza.Token\ | UPOS/XPOS/morphology lemmas from Universal Dependencies; batch CPU/GPU; multilingual; POS tagging is a prediction, not ground truth | NLP sidecar / linguistic pass | not installed; Stanza preferred over spaCy for multilingual consistency | https://stanza模型.stanfordnlp.github.io/ |

## Current answers to the user's direct question

- No, \	reesitter-chunker\ is not the canonical owner in the current repo state.
- The live structural owner is the Python \	reesitter-chunker\ lane, with Tree-sitter primitives and ast-grep as its parsing/query substrate.
- If a separate chunker claims more language coverage, that is only a benchmarking advantage until it proves stable spans, deterministic chunk IDs, and clean fit into the existing chunk-lineage contracts.
- \langextract==1.6.0\ is present in \scripts/atlas/environments/atlas-rapids-cu13.yml\.
- \	ree-sitter-language-pack==1.14.0\ is present in the same env export.
- The repo already has \	ree-sitter\ packages pinned in \sveltekit-frontend/package.json\.
- Stanza is NOT the main semantic intelligence layer; it is an optional linguistic pass for prose/comments/errors only. Code gets Tree-sitter AST + EmbeddingGemma semantic_768.

## What remains missing

- A single typed \AstUnit\ / chunk-lineage contract wired across the structural worker and downstream feature matrix.
- A formal \ExperimentFeatureMatrix\ / \FeatureRegistry\ for reranker, AST, graph, and GPU-derived features.
- cuGraph parity stubs for Leiden / k-core / betweenness.
- cuVS exact-vs-ANN evaluation harness for CAGRA / KMeans / PCA.
- A bounded, promoted-only path from experimental signals into \FeatureRowV1\.
- Stanza installation and benchmarking (ablation: with vs without linguistic pass).
