## Semantic Alignment Pipeline

Atlas-tools implements a multi-stage semantic alignment strategy to normalize embeddings and ensure consistency:

### Pipeline Order (Sequential)

1. **TreeSitter Chunker (Structural Extraction)**
   - Input: Raw source code
   - Tool: Tree-sitter parser (syntax-aware boundaries)
   - Output: Structurally aligned code chunks with deterministic symbols
   - Storage: codebase_chunk_index.content (canonical chunks)

2. **Boundary IR (AstUnit Facts)**
   - Input: Structurally aligned chunks
   - Tool: Boundary IR projection
   - Output: AstUnit facts → atlas_ast_nodes (packet_key null, structural_revision)
   - Storage: Postgres tlas_ast_nodes

3. **AST-grep Structural Extraction**
   - Input: Boundary IR facts
   - Tool: ast-grep (pattern matching on AST nodes)
   - Output: Functions, classes, imports, symbols with metadata
   - Storage: Postgres tlas_ast_nodes (structural_revision)

4. **Lexical Analysis (Identifier Splitting)**
   - Input: AST symbols
   - Tool: Identifier splitter (camelCase, snake_case, paths)
   - Output: Split identifiers, keywords, paths
   - Storage: Postgres tlas_ast_nodes (symbol metadata)

5. **EmbeddingGemma (Semantic Geometry)**
   - Input: title + summary + symbols + identifiers + structural facts
   - Service: Ollama embeddinggemma:latest (768-dim native)
   - Output: Full-dimensional embeddings (semantic_768)
   - Storage: codebase_chunk_index.content_embedding (Qdrant payload)

6. **MiniLM / Mixedbread (Relevance)**
   - Input: query + candidate embeddings
   - Service: MiniLM / Mixedbread cross-encoder
   - Output: Query↔candidate relevance scores
   - Storage: Redis cache (optional)

7. **LangExtract (Grounded Extraction)** [optional, expensive]
   - Input: Code comments, docstrings, error messages, specs
   - Tool: LangExtract (structured extraction with source grounding)
   - Output: Named entities, semantic anchors, NLP confidence scores
   - Storage: Postgres semantic_anchors table

8. **Stanza (Linguistic Features)** [optional, disabled by default]
   - Input: comments, docstrings, error messages, OpenSpec text, README/docs, user query
   - Tool: Stanza (UPOS/XPOS/morphology, lemmatization, dependency parsing)
   - Output: POS tags, lemmas, dependency relations
   - Storage: Not persisted (consumed at inference time)

9. **Semantic Alignment Scoring**
   - Input: Embeddings + structural metadata + entity alignment
   - Service: Parent Atlas Python middleware
   - Computes: Per-lane confidence (semantic, lexical, structural, AST, domain)
   - Output: \semantic_confidence\, \lignment_score\, per-lane flags
   - Storage: Postgres \tlas_packets\ confidence columns

10. **Optional: 384-dim Truncation (Post-Alignment)**
    - Input: 768-dim aligned embeddings
    - Process: MRL (Matryoshka Representation Learning) projection
    - Output: 384-dim truncated vectors for TurboVec prefilter
    - Storage: Optional Redis cache for fast retrieval

11. **Dual-Vector Qdrant Indexing**
    - Input: 768-dim embeddings (canonical)
    - Storage: Qdrant \codebase_chunks_768\ with:
      - \content_embedding\ (768-dim, primary semantic search)
      - \signature_embedding\ (768-dim, secondary rerank signal)
    - Reranking: 6-signal fusion (semantic + signature + AST + SOM + authority + lexical)
