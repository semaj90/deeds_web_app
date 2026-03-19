# Semantic Search Pipeline — Architecture & File Map

## Overview

The platform implements a multi-tier semantic search pipeline spanning client-side ONNX inference, server-side Ollama/gRPC embedding, hybrid BM42+dense vector search, and a 2-stage retrieval orchestration pattern. Search is available across 37 dedicated API endpoints covering cases, evidence, statutes, citations, knowledge base, and more.

---

## Architecture Diagram

```
User Query
  |
  v
Client Router (src/lib/ai/client-router.ts)
  |--- Simple query ---> Local ONNX (WebGPU/WASM/CPU)
  |                       src/lib/ai/client-embed.ts (768-dim)
  |                       src/lib/ai/onnx/session.ts
  |
  |--- Complex query ---> Server Ollama/gRPC
  |                        src/lib/server/ai/embeddings.ts
  |                        src/lib/server/grpc/embedding-client.ts
  |                        src/lib/server/embeddings/ollama.ts
  |
  v
Cache Hierarchy (L0 → L4)
  L0: LokiJS in-memory (5-10min TTL) --- src/lib/cache/loki-cache.svelte.ts
  L1: IndexedDB persistent (7-day TTL) --- src/lib/cache/indexdb-cache.svelte.ts
  L2: Server memory Map (5min TTL) --- src/lib/server/cache.ts
  L3: Redis (configurable TTL) --- src/lib/server/cache.ts
  L4: DB/Qdrant (source of truth)
  |
  v
2-Stage Retrieval (src/lib/machines/retrieval-machine.ts)
  Stage 1: Fuse.js fuzzy recall --- src/lib/utils/fuse-index.ts
  Stage 2: Qdrant semantic rerank --- src/lib/server/vector/qdrant-manager.ts
  |
  v
Hybrid Search (BM42 + Dense)
  Dense: embeddinggemma 768-dim vectors
  Sparse: BM42 FNV-1a hashed tokens --- src/lib/server/vector/bm42-sparse.ts
  Fusion: Qdrant RRF (Reciprocal Rank Fusion)
  |
  v
Results → Ranking → Response
  Multi-signal ranker --- src/lib/server/rag/ranker.ts
  GPU reranker (WebGPU) --- src/lib/gpu/gpu-search-reranker.ts
  Corrective RAG (reformulate on low confidence) --- /api/rag/enhanced
```

---

## File Inventory by Category

### 1. Vector Storage — Qdrant

| File | Purpose |
|------|---------|
| `src/lib/server/vector/qdrant-manager.ts` | Core client: point ID generation, collection init, multi-vector support |
| `src/lib/server/vector/qdrant-api-wrapper.ts` | REST wrapper with health checks |
| `src/lib/server/vector/qdrant-health.ts` | Health monitoring and diagnostics |
| `src/lib/server/adapters/qdrant-adapter.ts` | Adapter pattern for service layer |
| `src/lib/server/db/qdrant-integration.ts` | DB-to-Qdrant sync and query translation |
| `src/lib/server/db/qdrant-sync.ts` | Background sync (PostgreSQL ↔ Qdrant) |
| `src/lib/server/rag/qdrant.ts` | RAG-specific Qdrant operations |
| `src/lib/server/startup/qdrant-init.ts` | Server startup initialization |

### 2. Vector Storage — pgvector

| File | Purpose |
|------|---------|
| `src/lib/server/vector/pgvector.ts` | Core pgvector operations (HNSW, similarity) |
| `src/lib/server/vector/PgVectorService.ts` | Service class wrapper |
| `src/lib/server/db/pgvector-service.ts` | Legacy service implementation |
| `src/lib/server/db/pgvector-utils.ts` | Utility functions |
| `src/lib/server/db/enhanced-vector-operations.ts` | Optimized vector operations |
| `src/lib/server/db/vector-operations.ts` | Core DB vector operations |
| `src/lib/server/db/vector-schema.ts` | Vector table schemas |

### 3. Embedding Generation

| File | Purpose |
|------|---------|
| `src/lib/ai/client-embed.ts` | Client-side ONNX 768-dim embeddings (mean-pool + L2-norm) |
| `src/lib/ai/onnx/session.ts` | ONNX Runtime session factory (WebGPU → WASM → CPU) |
| `src/lib/server/ai/embeddings.ts` | Server embedding orchestration (Ollama, gRPC, fallbacks) |
| `src/lib/server/ai/embeddings-simple.ts` | Simplified embedding API |
| `src/lib/server/embedding/embed.ts` | Core service with caching and batching |
| `src/lib/server/embedding/embedding-persist.ts` | Persistence to PostgreSQL/Qdrant |
| `src/lib/server/embedding/embedding-repository.ts` | Repository pattern for data access |
| `src/lib/server/embedding/ingestion-queue.ts` | Bulk ingestion queue |
| `src/lib/server/embeddings/ollama.ts` | Ollama-specific client (embeddinggemma) |
| `src/lib/server/embedding-cache-service.ts` | Redis + memory cache for embeddings |
| `src/lib/server/embedding-gateway.ts` | Routing gateway for embedding requests |
| `src/lib/server/batch-embedder.ts` | Batch processing for multiple requests |
| `src/lib/server/vector/embedding-gemma.ts` | Gemma embedding model integration |
| `src/lib/server/grpc/embedding-client.ts` | gRPC client (Go backend) with HTTP/Ollama fallback |

### 4. Hybrid Search (BM42 Sparse Vectors)

| File | Purpose |
|------|---------|
| `src/lib/server/vector/bm42-sparse.ts` | BM42 sparse vector generation (FNV-1a hashing, RRF fusion) |
| `src/lib/server/vector/quantize.ts` | INT8 vector quantization (4x compression) |
| `src/lib/server/vector/multi-store.ts` | Multi-store vector backend abstraction |
| `src/lib/server/vector/metadata-encoder.ts` | Metadata encoding for vector storage |

### 5. RAG Pipeline

| File | Purpose |
|------|---------|
| `src/lib/server/rag/evidenceRag.ts` | Evidence retrieval and Q&A |
| `src/lib/server/rag/uiComplianceRag.ts` | UI compliance RAG |
| `src/lib/server/rag/ranker.ts` | Multi-signal ranking (confidence, relevance, recency) |
| `src/lib/server/rag/sdk.ts` | RAG SDK for search integration |
| `src/lib/server/rag/tag-extractor.ts` | Entity/tag extraction from results |
| `src/lib/server/rag/rag-types.ts` | TypeScript types |

### 6. Retrieval Utilities

| File | Purpose |
|------|---------|
| `src/lib/server/retrieval/query-expansion.ts` | Query expansion for improved recall |
| `src/lib/server/retrieval/tfidf-scorer.ts` | TF-IDF relevance scoring |
| `src/lib/server/retrieval/legal-pagerank.ts` | PageRank for legal document authority |
| `src/lib/server/retrieval/citation-graph.ts` | Citation relationship graph |
| `src/lib/server/retrieval/document-dag.ts` | DAG for document dependency resolution |
| `src/lib/server/retrieval/graph-context.ts` | Graph context extraction for RAG |
| `src/lib/server/retrieval/web-search.ts` | Web search integration (SearXNG) |
| `src/lib/server/retrieval/wikipedia-search.ts` | Wikipedia API integration |

### 7. Indexing & Chunking

| File | Purpose |
|------|---------|
| `src/lib/server/indexer/legal-chunker.ts` | Structure-aware legal document chunking (ARTICLE/SECTION/§) |
| `src/lib/server/indexer/ast-chunker.ts` | AST-based code chunking |
| `src/lib/server/indexer/dual-embedder.ts` | Dual embedding pipeline (content + signature vectors) |
| `src/lib/server/embedding/text-splitter.ts` | Text splitting utilities |
| `src/lib/server/embedding/knn-helper.ts` | KNN helpers for chunk similarity |

### 8. Client-Side Search

| File | Purpose |
|------|---------|
| `src/lib/ai/client-router.ts` | 3-tier inference routing (local/hybrid/server) |
| `src/lib/ai/client-cache.ts` | Dual-tier cache (LokiJS + IndexedDB) |
| `src/lib/client/search-client.ts` | Client search API wrapper |
| `src/lib/utils/fuse-import.ts` | Fuse.js dynamic import |
| `src/lib/utils/fuse-index.ts` | Fuse.js indexing and fuzzy recall |
| `src/lib/machines/retrieval-machine.ts` | XState v5 2-stage retrieval orchestration |

### 9. GPU-Accelerated Search

| File | Purpose |
|------|---------|
| `src/lib/gpu/gpu-search-reranker.ts` | WebGPU compute result reranking |
| `src/lib/gpu/gpu-embedding-bridge.ts` | GPU embedding acceleration |
| `src/lib/gpu/hybrid-gpu-context.ts` | Hybrid GPU context for search |

### 10. Search UI Components

| File | Purpose |
|------|---------|
| `src/lib/components/ui/search/Search.svelte` | Main search input |
| `src/lib/components/rag/AnswerWithCitations.svelte` | RAG answer display with citations |
| `src/lib/components/rag/DocumentCard.svelte` | Search result document card |
| `src/lib/components/rag/RagDocumentGrid.svelte` | Retrieved documents grid |
| `src/lib/components/rag/SourceValidator.svelte` | Citation source validation UI |
| `src/lib/stores/search.svelte.ts` | Global search state |
| `src/lib/stores/knowledge-search.svelte.ts` | Knowledge base search state |

---

## Search API Endpoints (37 total)

### Platform Search Orchestrator
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search` | POST | 8-adapter fan-out (Qdrant, PG, Go, Fuse.js, etc.) |
| `/api/search/suggestions` | GET | BM42 sparse vector suggestions |
| `/api/search/cases` | POST | Case-specific search |
| `/api/search/citations` | POST | Citation search with context |
| `/api/search/laws` | POST | Statute/law search |
| `/api/search/filters` | GET | Search filter metadata |

### RAG Pipeline
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rag/search` | POST | Vector search with reranking |
| `/api/rag/answer` | POST | Answer generation with citations (SSE) |
| `/api/rag/validate` | POST | Result validation |
| `/api/rag/enhanced` | POST | Corrective RAG (reformulates on low confidence) |

### Knowledge Base
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/knowledge` | GET/POST | Knowledge base CRUD |
| `/api/knowledge/search` | POST | BM42 + dense hybrid search |
| `/api/knowledge/document/[id]` | GET | Individual document retrieval |
| `/api/knowledge/stats` | GET | Collection statistics |
| `/api/knowledge/stream` | POST | Streaming search results (SSE) |

### Domain-Specific Search
| Endpoint | Description |
|----------|-------------|
| `/api/evidence/search` | Evidence search via Qdrant |
| `/api/citations/search` | Citation search and validation |
| `/api/statutes/search` | Statute/law search with hierarchy |
| `/api/glossary/search` | Legal glossary search |
| `/api/precedents/search` | Legal precedent search |
| `/api/codebase-index/search` | Dual-vector code search |
| `/api/error-brain/search` | Error knowledge base search |
| `/api/library/search` | Document library search |
| `/api/persons-of-interest/search` | POI search with embeddings |
| `/api/tags/search` | Tag search and filtering |
| `/api/web/search` | Web search integration |
| `/api/cartridge/search` | Cartridge tensor similarity |
| `/api/embed` | Standalone embedding generation |

---

## Key Architectural Patterns

### 1. 3-Tier Inference Routing
`client-router.ts` classifies queries and routes to the optimal tier:
- **Local ONNX** — Simple queries, runs on-device via WebGPU/WASM (gemma 270M)
- **Hybrid** — Factual queries, client embedding + server Qdrant search
- **Full Server** — Complex legal reasoning, server-side Ollama gemma3-legal

### 2. Dual-Vector Search
Documents get two embedding vectors:
- **Content vector** — Semantic meaning of the text
- **Signature vector** — Structural/syntactic features
- Reranking uses weighted combination: 0.6 content + 0.4 signature

### 3. Hybrid BM42 + Dense
- **Dense vectors** — 768-dim embeddings from embeddinggemma
- **Sparse vectors** — BM42 FNV-1a token hashing for keyword matching
- **Fusion** — Qdrant RRF (Reciprocal Rank Fusion) combines both signals

### 4. 2-Stage Retrieval (XState v5)
- **Stage 1: Recall** — Fuse.js fuzzy search for broad candidate set
- **Stage 2: Rerank** — Qdrant semantic similarity for precision filtering

### 5. Corrective RAG
When initial retrieval confidence < 0.50:
- LLM reformulates the query
- Re-runs retrieval with expanded/rephrased query
- Merges results from both passes

### 6. Cache Hierarchy (L0-L4)
Each layer reduces latency for repeated or similar queries:
- L0: LokiJS in-memory (5-10min, session-scoped)
- L1: IndexedDB persistent (7-day, survives refresh)
- L2: Server memory Map (5min, in-process)
- L3: Redis (configurable, cross-request, semantic cache 28x speedup)
- L4: DB/Qdrant (source of truth)

### 7. Multi-Adapter Orchestration
`/api/search` coordinates 8 adapters via `Promise.allSettled`:
- Qdrant vector search
- PostgreSQL full-text search
- Go gRPC library search
- Fuse.js client-side fuzzy
- Evidence, citations, statutes, glossary domain adapters
- Per-adapter timing and error isolation

---

## Go Microservice

| File | Purpose |
|------|---------|
| `services/go-search-service/main.go` | gRPC server on :50051 |
| `services/go-search-service/proto/libsearch/library_search.pb.go` | Generated Protobuf stubs |
| `services/go-search-service/proto/libsearch/library_search_grpc.pb.go` | Generated gRPC service defs |

---

## Qdrant Collections (9 active)

| Collection | Dim | Sparse | Purpose |
|------------|-----|--------|---------|
| `evidence_items` | 768 | BM42 | Evidence chunks + metadata |
| `legal_documents` | 768 | BM42 | Legal document embeddings |
| `legal_cases` | 768 | BM42 | Case description embeddings |
| `codebase_chunks_768` | 768 | - | Dual-vector code search |
| `chat_messages` | 768 | - | Chat context search |
| `embedding_cache` | 768 | - | Embedding lookup cache |
| `knowledge_base` | 768 | BM42 | Knowledge base entries |
| `poi_profiles` | 768 | - | Person of interest profiles |
| `error_patterns` | 768 | - | Error knowledge patterns |

All collections use INT8 quantization (4x compression, ~490MB savings).

---

## Models

| Model | Type | Dimensions | Location |
|-------|------|-----------|----------|
| `embeddinggemma:latest` | Embedding (primary) | 768 | Ollama (server) |
| `nomic-embed-text` | Embedding (fallback) | 768 | Ollama (server) |
| `gemma3-legal:latest` | LLM (legal reasoning) | - | Ollama (server) |
| `gemma3_270m_onnx` | LLM (client-side) | - | static/ (ONNX) |
| `embeddinggemma_300m_onnx` | Embedding (client-side) | 768 | static/ (ONNX) |

---

*Generated: March 19, 2026*
*Total search-related files: 150+*
*Total search API endpoints: 37*