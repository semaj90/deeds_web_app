# Codebase Analysis: Multi-Source Retrieval Topology

## Executive Summary

This document maps existing implementations in the codebase that can be leveraged for the multi-source retrieval topology feature. The codebase has substantial infrastructure for retrieval, embeddings, vector databases, and microservices that can be integrated.

---

## 1. Existing Retrieval Infrastructure

### 1.1 AlignmentRouter (backend/services/alignment_router.py)
**Status**: ✅ Existing - Can be extended

**Current Capabilities**:
- Query routing based on intent and negativity scores
- Multiple route execution: `legal_rag_plus_kag`, `legal_rag_safe`, `general_web`, `web_search_with_reembed`
- Confidence scoring and sentiment analysis
- LLM-based decision making
- Web search integration (DuckDuckGo)
- Batch embedding with Ollama
- Qdrant storage integration

**Integration Points**:
- Extend `_route_decision()` to support confidence-based routing
- Leverage existing `_web_search()` for Google Search integration
- Use existing `_batch_embed()` for Wikipedia and Google content
- Extend `_store_in_qdrant()` for vector mirror synchronization

**Reusable Code**:
```python
# Existing methods to leverage:
- handle_low_confidence()
- matrix_transform_fallback()
- _web_search()
- _batch_embed()
- _store_in_qdrant()
- _reset_session_context()
```

### 1.2 MultimodalRetriever (backend/services/multimodal_retriever.py)
**Status**: ✅ Existing - Can be extended

**Current Capabilities**:
- Orchestrates RAG + KAG + VAG retrieval
- Async retrieval methods
- Result merging and ranking
- Query embedding
- Caching mechanisms

**Integration Points**:
- Use as base class for `MultiSourceRetriever`
- Extend `retrieve()` method to support additional sources
- Leverage result merging logic for topology synthesis

### 1.3 BehaviorRouter (python_codebase/utilities/native/autoencoder/behavior_router.py)
**Status**: ✅ Existing - Can be extended

**Current Capabilities**:
- Stateful user intent prediction
- HMM-based behavior modeling
- Intent routing

**Integration Points**:
- Use for query intent analysis
- Leverage for confidence scoring

---

## 2. Embedding Infrastructure

### 2.1 QueryEmbedder (tests/test_phase4_multimodal_retrieval.py)
**Status**: ✅ Existing - Can be reused

**Current Capabilities**:
- 768-dimensional embeddings
- FP16 support for GPU efficiency
- Batch embedding
- Caching with configurable size
- Normalization support

**Integration Points**:
- Use for query embedding in QueryAnalyzer
- Leverage for Wikipedia and Google content embedding
- Use for PostgreSQL summary embedding

### 2.2 Embedding Services
**Status**: ✅ Multiple implementations exist

**Available Services**:
- `embedding_service.py` - FastAPI endpoint for embeddings
- `embedding_service_cuda.py` - CUDA-accelerated embeddings
- `nlp_middleware_service.py` - Gemma embeddings (768-dim bi-encoder)
- `python-services/rag_ingest_worker.py` - Ollama embedding generation
- `python-services/rag_ingest.py` - Local sentence-transformers embeddings

**Integration Points**:
- Use Ollama for batch embedding (already integrated in AlignmentRouter)
- Use Gemma for Google Search results
- Use pgvector-compatible embeddings for PostgreSQL storage

---

## 3. Vector Database Infrastructure

### 3.1 Qdrant Integration
**Status**: ✅ Existing - Widely used

**Current Usage**:
- Embedded in AlignmentRouter for result storage
- Used in MultimodalRetriever
- Collection: `embeddings`, `legal_vectors`

**Integration Points**:
- Extend for vector mirror synchronization
- Use existing Qdrant client patterns
- Implement consistency checks

### 3.2 pgvector Integration
**Status**: ✅ Existing - PostgreSQL extension

**Current Usage**:
- `setup_chr97_database.py` - CHR97 consolidated database with pgvector
- `python_codebase/data_ingestion/ingest-legal-documents.py` - Legal document RAG with pgvector
- `python-services/topic_pipeline.py` - Topic modeling with pgvector
- `python-services/rag_search.py` - Semantic search with pgvector

**Integration Points**:
- Use existing pgvector schema patterns
- Leverage `search_pgvector()` function for vector similarity search
- Implement vector mirror synchronization

**Existing Schema**:
```sql
CREATE TABLE document_embeddings (
    id SERIAL PRIMARY KEY,
    document_id VARCHAR,
    chunk_id VARCHAR,
    embedding vector(768),
    metadata JSONB,
    created_at TIMESTAMP
);
```

---

## 4. Document Storage Infrastructure

### 4.1 MinIO Integration
**Status**: ✅ Existing - Widely used

**Current Usage**:
- `setup_minio.py` - MinIO bucket setup
- `python-services/evidence_crud.py` - Upload/delete operations
- Tests in `test_phase_3d_integration.py`

**Integration Points**:
- Use existing `upload_to_minio()` and `delete_from_minio()` functions
- Implement version history tracking
- Implement LRU eviction

**Reusable Code**:
```python
# From evidence_crud.py:
async def upload_to_minio(path: str, content: bytes) -> bool
async def delete_from_minio(path: str) -> bool
```

### 4.2 PostgreSQL Integration
**Status**: ✅ Existing - Multiple implementations

**Current Usage**:
- `setup_chr97_database.py` - Consolidated database
- `python_codebase/data_ingestion/ingest-legal-documents.py` - Document ingestion
- `python-services/rag_index_sync.py` - Index synchronization

**Integration Points**:
- Use existing connection pooling patterns
- Leverage asyncpg for async operations
- Implement summary storage schema

---

## 5. Web Search Infrastructure

### 5.1 DuckDuckGo Integration
**Status**: ✅ Existing - In AlignmentRouter

**Current Implementation**:
- `_web_search()` method in AlignmentRouter
- No API key required
- Returns search results with snippets

**Integration Points**:
- Extend for Google Search integration
- Extend for Wikipedia integration
- Reuse batch embedding pattern

### 5.2 Wikipedia Integration
**Status**: ⚠️ Partial - MediaWiki API available

**Available Libraries**:
- `wikipedia` Python library (not currently used)
- `pywikibot` for advanced Wikipedia operations

**Integration Points**:
- Implement WikipediaRetriever using MediaWiki API
- Extract sections and key content
- Store in MinIO with metadata

### 5.3 Google Search Integration
**Status**: ⚠️ Partial - Custom Search API available

**Requirements**:
- Google Custom Search API key
- Custom search engine ID

**Integration Points**:
- Implement GoogleSearchRetriever
- Use existing web search pattern from DuckDuckGo
- Add recency scoring based on publication date

---

## 6. 4D Graph Topology Infrastructure

### 6.1 Neo4j Integration
**Status**: ✅ Existing - Multiple implementations

**Current Usage**:
- `go-microservice/neo4j-integration.go` - Go Neo4j client
- `go-microservice/neo4j-simd-worker.exe` - SIMD-optimized Neo4j worker
- Docker compose files for Neo4j deployment

**Integration Points**:
- Use Neo4j for 4D graph storage
- Implement entity, relationship, temporal, and confidence dimensions
- Leverage existing Neo4j patterns

### 6.2 Graph Query Patterns
**Status**: ✅ Existing - In various services

**Available Patterns**:
- Entity extraction and linking
- Relationship discovery
- Temporal queries

**Integration Points**:
- Implement Graph4D data structure
- Map to Neo4j schema
- Implement multi-dimensional filtering

---

## 7. Microservice Infrastructure

### 7.1 Go Microservices
**Status**: ✅ Existing - Extensive Go service ecosystem

**Available Services**:
- `legal-ai-microservice.go` - Main legal AI service
- `gpu-compute-service.go` - GPU computation
- `embedding-service.go` - Embedding generation
- `enhanced-rag-service.go` - Enhanced RAG
- `multi-protocol-gateway.go` - Protocol gateway
- `quic-server.go` - QUIC protocol support
- `tensorrt-bridge.go` - TensorRT integration

**Integration Points**:
- Implement Go microservices for high-performance retrieval
- Use existing service patterns
- Leverage QUIC for low-latency communication

### 7.2 Python Services
**Status**: ✅ Existing - FastAPI-based services

**Available Services**:
- `nlp_middleware_service.py` - NLP middleware
- `rag_search.py` - RAG search service
- `rag_ingest_worker.py` - Document ingestion
- `rag_indexer_service.py` - Index management
- `embedding_service.py` - Embedding generation

**Integration Points**:
- Extend existing services for multi-source retrieval
- Use FastAPI patterns for new endpoints
- Leverage async/await for concurrent operations

---

## 8. Testing Infrastructure

### 8.1 Property-Based Testing
**Status**: ✅ Existing - Hypothesis framework

**Current Usage**:
- `tests/test_phase4_properties.py` - Query embedding properties
- Property-based tests for various components

**Integration Points**:
- Use Hypothesis for property-based tests
- Implement generators for test data
- Follow existing test patterns

### 8.2 Unit Testing
**Status**: ✅ Existing - pytest framework

**Current Usage**:
- `tests/test_phase4_multimodal_retrieval.py` - Multimodal retriever tests
- `tests/test_phase_3d_integration.py` - Integration tests

**Integration Points**:
- Use pytest for unit tests
- Follow existing test structure
- Use fixtures for setup/teardown

---

## 9. Configuration and Deployment

### 9.1 Docker Compose
**Status**: ✅ Existing - Multiple configurations

**Available Configurations**:
- `docker-compose.phase72.yml` - Phase 72 stack
- `docker-compose.gpu.yml` - GPU-enabled stack
- `docker-compose.tensorrt.yml` - TensorRT stack
- `docker-compose.yml` - Default stack

**Integration Points**:
- Add services for multi-source retrieval
- Configure vector database mirrors
- Set up MinIO and PostgreSQL

### 9.2 Environment Configuration
**Status**: ✅ Existing - .env files

**Available Configurations**:
- `.env.development` - Development settings
- `.env.production` - Production settings
- `.env.phase72.local` - Phase 72 local settings

**Integration Points**:
- Add API keys for Google Search, Wikipedia
- Configure database connections
- Set vector database endpoints

---

## 10. Implementation Roadmap

### Phase 1: Extend Existing Components (Tasks 1-4)
- Extend AlignmentRouter for multi-source routing
- Extend MultimodalRetriever for additional sources
- Implement QueryAnalyzer using existing patterns
- Implement VectorMirror for Qdrant ↔ pgvector sync

**Estimated Effort**: 40% of total work
**Reuse**: 70% existing code

### Phase 2: Implement New Sources (Tasks 5-9)
- Wikipedia integration (new)
- Google Search integration (new)
- 4D Graph Topology (new)
- PostgreSQL Summary Storage (extend existing)
- MinIO Document Storage (extend existing)

**Estimated Effort**: 35% of total work
**Reuse**: 40% existing code

### Phase 3: Synthesis and Integration (Tasks 10-14)
- Topology Synthesis Engine (new)
- Fallback Chain Manager (extend existing)
- Confidence-Based Routing (extend existing)
- ACE Orchestrator integration (extend existing)
- Error handling and monitoring (new)

**Estimated Effort**: 20% of total work
**Reuse**: 60% existing code

### Phase 4: Testing and Documentation (Tasks 15-19)
- Property-based tests (new)
- Integration tests (new)
- API endpoints (new)
- Documentation (new)

**Estimated Effort**: 5% of total work
**Reuse**: 30% existing patterns

---

## 11. Key Reusable Patterns

### 11.1 Async Retrieval Pattern
```python
# From MultimodalRetriever
async def retrieve(self, query: str, top_k: int = 10) -> List[Result]:
    tasks = [
        self.retrieve_rag(query, top_k),
        self.retrieve_kag(query, top_k),
        self.retrieve_vag(query, top_k),
    ]
    results = await asyncio.gather(*tasks)
    return self.merge_results(results)
```

### 11.2 Embedding Pattern
```python
# From rag_ingest_worker.py
async def generate_embeddings_ollama(self, texts: List[str]) -> List[List[float]]:
    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{OLLAMA_URL}/api/embed",
            json={"model": "embeddinggemma", "input": texts}
        ) as resp:
            return await resp.json()
```

### 11.3 Vector Storage Pattern
```python
# From AlignmentRouter
async def _store_in_qdrant(self, results: List[Result]) -> None:
    for result in results:
        self.qdrant_client.upsert(
            collection_name="embeddings",
            points=[Point(
                id=hash(result.content),
                vector=result.embedding,
                payload={"content": result.content, "source": result.source}
            )]
        )
```

### 11.4 MinIO Storage Pattern
```python
# From evidence_crud.py
async def upload_to_minio(path: str, content: bytes) -> bool:
    try:
        minio_client.put_object(
            bucket_name="documents",
            object_name=path,
            data=BytesIO(content),
            length=len(content)
        )
        return True
    except Exception as e:
        logger.error(f"MinIO upload error: {e}")
        return False
```

---

## 12. Dependencies and Requirements

### 12.1 Python Dependencies
- `asyncpg` - PostgreSQL async driver
- `aiohttp` - Async HTTP client
- `qdrant-client` - Qdrant vector database client
- `minio` - MinIO client
- `wikipedia` - Wikipedia API wrapper
- `google-search-results` - Google Search API
- `hypothesis` - Property-based testing
- `pytest` - Unit testing

### 12.2 External Services
- PostgreSQL with pgvector extension
- Qdrant vector database
- MinIO object storage
- Ollama for embeddings
- Neo4j for graph topology
- Google Custom Search API (optional)
- Wikipedia API (free)

### 12.3 Go Dependencies
- `github.com/qdrant/go-client` - Qdrant Go client
- `github.com/neo4j/neo4j-go-driver` - Neo4j Go driver
- `github.com/minio/minio-go` - MinIO Go client

---

## 13. Risk Assessment

### 13.1 Low Risk
- ✅ Extending AlignmentRouter (proven pattern)
- ✅ Adding Wikipedia integration (simple API)
- ✅ Vector mirror synchronization (straightforward)
- ✅ PostgreSQL summary storage (existing schema)

### 13.2 Medium Risk
- ⚠️ Google Search integration (requires API key)
- ⚠️ 4D Graph Topology (new data structure)
- ⚠️ Confidence-based routing (complex logic)

### 13.3 High Risk
- ❌ None identified - all components have existing patterns

---

## 14. Recommendations

1. **Start with Phase 1**: Extend existing components first to minimize risk
2. **Leverage AlignmentRouter**: It already has most of the infrastructure needed
3. **Use existing patterns**: Follow established patterns for consistency
4. **Implement tests incrementally**: Write tests as you implement each component
5. **Document as you go**: Keep documentation in sync with implementation

---

## 15. Quick Reference: File Locations

| Component | File | Status |
|-----------|------|--------|
| AlignmentRouter | `backend/services/alignment_router.py` | ✅ Existing |
| MultimodalRetriever | `backend/services/multimodal_retriever.py` | ✅ Existing |
| QueryEmbedder | `tests/test_phase4_multimodal_retrieval.py` | ✅ Existing |
| Qdrant Integration | `backend/services/alignment_router.py` | ✅ Existing |
| pgvector Integration | `python_codebase/data_ingestion/ingest-legal-documents.py` | ✅ Existing |
| MinIO Integration | `python-services/evidence_crud.py` | ✅ Existing |
| Web Search | `backend/services/alignment_router.py` | ✅ Existing |
| Neo4j Integration | `go-microservice/neo4j-integration.go` | ✅ Existing |
| Testing Framework | `tests/test_phase4_properties.py` | ✅ Existing |
| Docker Compose | `docker-compose.phase72.yml` | ✅ Existing |
