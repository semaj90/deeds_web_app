# Phase 3 Spec Summary: GPU-Accelerated RAG with pgvector + Qdrant

## Overview

Phase 3 delivers a production-grade legal RAG system with GPU acceleration, combining:

- **Hybrid Document Chunking**: Layout-aware chunking that respects document structure while semantically merging small blocks
- **GPU Granite-Docling**: OCR + layout extraction (fp16 encoder → int8 decoder, 1.6-1.9 GB VRAM)
- **EmbeddingGemma Pipeline**: GPU-optimized embeddings with fp16 compression (0.8 GB VRAM)
- **FP16 Vector Compression**: 50% memory reduction via fp16 + CBOR serialization (10x vs JSON)
- **Redis FP16 Cache**: Query reuse + embedding compression (60-day TTL)
- **Postgres 17 + pgvector**: Legal system of record (metadata, joins, ACID, audit trail)
- **Qdrant GPU Search**: FAISS-GPU acceleration for top-K cosine similarity (<100ms)
- **MiniLM TensorRT Reranker**: Rerank top-K to top-5 (INT8, <50ms)
- **Go QUIC Orchestrator**: Dual-write to Postgres + Qdrant, handles CAG ranking
- **Golden-Ratio UI**: Law library aesthetic with 3-column layout (22% / 55% / 23%)
- **Laws Search**: Statute search with accordion filters and pgvector queries
- **Evidence Board**: Visual evidence organization with GPU-powered relationships
- **Legal Chat**: AI assistant with streaming Gemma-Legal INT4 responses

## Key Decisions

1. **Chunking Strategy**: Hybrid (layout-aware + semantic merge) - preserves document structure while enabling semantic retrieval
2. **GPU Acceleration**: Qdrant FAISS-GPU for vector search, NOT Postgres itself - Postgres remains legal system of record
3. **Embedding Compression**: FP16 + CBOR - 10x size reduction vs JSON, maintains search accuracy
4. **Storage Architecture**:
   - **Postgres pgvector**: Metadata, joins, ACID transactions, audit trail
   - **Qdrant GPU**: Fast vector search with FAISS-GPU acceleration
   - **Redis fp16**: Query cache + embedding compression
5. **Go QUIC Orchestration**: Dual-write to Postgres + Qdrant, handles CAG ranking and inverse lookups
6. **UI Theme**: Warm parchment + soft charcoal + burgundy accents - professional yet approachable
7. **MVP Strategy**: Build foundation once, add intelligence after - no rewrites

## Implementation Phases (MVP Execution Order)

### Phase 1: Foundation (Tasks 1-4)
1. **Hybrid Document Chunker** ✅ DONE
   - Parse DocTags, merge small blocks, split large blocks
   - Preserve bounding boxes + page numbers

2. **GPU DocLing Gateway** (Python)
   - Granite-Docling OCR + layout extraction
   - Stream to Redis, return DocTags

3. **Embedding Pipeline** (Python)
   - EmbeddingGemma (int8 quantized)
   - Generate embeddings, convert to fp16

4. **Go QUIC FP16 Cache**
   - Compress/decompress fp16 vectors
   - Store in Redis with TTL

### Phase 2: Storage + Search (Tasks 5-6)
5. **Mirror to Postgres + Qdrant**
   - Dual-write: Postgres (metadata) + Qdrant (GPU search)
   - Background worker for reconciliation

6. **MiniLM TensorRT Reranker**
   - Rerank top-K to top-5
   - INT8 quantization, <50ms latency

### Phase 3: Frontend (Tasks 7-9)
7. **Laws Search Page** (`/laws`)
   - Statute search with accordion filters
   - pgvector queries, related cases

8. **Evidence Board UI** (`/evidence_board`)
   - Visual evidence organization
   - GPU-powered relationships

9. **Legal Chat** (`/cases/[id]/chat`)
   - Streaming Gemma-Legal INT4 responses
   - Citation linking

## Testing Strategy

Optional tasks (marked with *) include:
- Unit tests for chunker, workers, FP16 compression, inverse ranking
- Integration tests for end-to-end pipeline
- Performance tests for throughput, latency, memory usage

These can be added after core implementation for faster MVP delivery.

## Next Steps

1. Start with Task 1: Implement Hybrid Document Chunker
2. Follow sequential task execution
3. Test each component before moving to next
4. Deploy to RTX 3060 Ti with 8GB VRAM
5. Prepare for Phase 4: Postgres 17 + pgvector integration

## Success Criteria

- Chunking throughput: >1000 chunks/sec
- Embedding latency: <50ms per batch of 32
- Inverse lookup latency: <100ms per query
- Memory usage: <2GB for embedding workers
- UI responsiveness: <200ms for page transitions
- Search accuracy: >0.75 cosine similarity for related cases

