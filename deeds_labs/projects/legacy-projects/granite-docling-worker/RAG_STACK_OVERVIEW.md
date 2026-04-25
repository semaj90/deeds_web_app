# RAG Architecture Overview

## Current RAG Stack (Custom Implementation)

### **NOT Using:**
- ❌ Microsoft GraphRAG
- ❌ Pydantic AI
- ❌ CopilotKit RAG

### **USING: Custom Hybrid RAG+KAG System**

## Architecture Components

### 1. **Custom Graph-RAG Orchestrator** (TypeScript)
**Location**: `sveltekit-frontend/src/lib/server/ai/graph-rag-orchestrator.ts`

**Features**:
- **Vector Search**: Qdrant for dense embeddings
- **Knowledge Graph**: Neo4j for entity relationships
- **Hybrid Retrieval**: BM25 (sparse) + Dense vectors
- **Graph Expansion**: Neighbor traversal for context enrichment

**Key Function**: `queryGraphRAG(opts: QueryOptions)`
```typescript
// 1. Embed query text
// 2. Qdrant semantic search
// 3. Neo4j graph expansion (neighbors)
// 4. Score combination & reranking
```

### 2. **Phase 79 RAG/KAG Middleware** (Python FastAPI)
**Location**: `sveltekit-frontend/scripts/phase79-rag-kag-middleware.py`

**Stack**:
- **Vector DB**: Qdrant (`phase79_rag_vectors`, `phase79_kag_graph`)
- **Embeddings**: Ollama `embeddinggemma:latest` (local)
- **LLM**: Ollama `gemma3-legal:latest` (local)
- **Knowledge Graph**: Neo4j (optional)
- **Storage**: MinIO (S3-compatible)
- **Cache**: Redis

**API Endpoints**:
- `POST /api/rag/upload` - Ingest documents
- `GET /api/rag/search` - Query with RAG
- `POST /api/rag/kag/build-graph` - Build knowledge graph
- `POST /api/rag/kag/query` - Query with KAG enhancement

### 3. **Granite-Docling Worker Integration**
**Location**: `granite-docling-worker/src/core/phase79_rag_client.py`

**Purpose**: Connect document processing → RAG → ACE synthesis

**Flow**:
```
PDF → Granite-Docling/Tesseract → Chunks → Phase79Client.upload_document()
  ↓
Qdrant Indexing → Knowledge Graph Build → ACE Synthesis Trigger
```

### 4. **Backend RAG Services** (Multiple Implementations)

#### Python RAG Ingestor
**Location**: `backend/rag_ingest.py`
- **BM25 Indexing**: `rank_bm25` library
- **Dense Embeddings**: Ollama embeddinggemma
- **Redis Caching**: Query results
- **Top-K Retrieval**: Configurable

#### Go Unified RAG Service
**Location**: `go-enhanced-rag-service/cmd/unified-rag-service/main.go`
- **Chunking Strategies**: Semantic, fixed, sliding
- **Hybrid Search**: BM25 + dense vectors
- **Score Normalization**: L2 + softmax
- **MinIO Integration**: Document storage

#### TypeScript LangChain RAG
**Location**: `sveltekit-frontend/src/lib/server/services/langchain-rag.ts`
- **Framework**: LangChain.js
- **Document Loaders**: PDF, TXT, MD
- **Vector Store**: Qdrant
- **Retrieval Chain**: With sources

#### Cached RAG Service
**Location**: `sveltekit-frontend/src/lib/server/services/cached-rag-service.ts`
- **Cache-First**: pgvector caching
- **Query Rewriting**: Expansion & normalization
- **Reranking**: Score combination
- **Fallback**: Full search on cache miss

## Embedding Stack

### Primary: Ollama Embeddings
**Model**: `embeddinggemma:latest`
- **Dimensions**: 768
- **Engine**: Ollama (local inference)
- **Speed**: ~50ms per chunk

### Secondary: Gemma-3 VLM (Multimodal)
**Location**: `backend/services/gemma_vlm_embedding_service.py`
**Model**: `google/gemma-3-2b-it-v` (Vision Language Model)
- **Dimensions**: 1024
- **Modalities**: Text + Vision + Layout + Seal confidence
- **Use Case**: Complex legal documents with visual elements

**Features**:
- Image understanding (signatures, seals, stamps)
- Layout preservation (bounding boxes)
- Seal confidence scoring (from YOLO detector)
- L2 normalization
- Batch processing (4 default)

## Knowledge Graph Architecture

### Storage: Neo4j (Optional) + Qdrant
**Collections**:
- `phase79_rag_vectors` - Document chunks
- `phase79_kag_graph` - Knowledge graph nodes/edges
- `phase94_knowledge_graph` - ACE synthesis KB

### Node Types:
- **error** - Error patterns
- **fix** - Solutions
- **pattern** - Code patterns
- **file** - Source files
- **entity** - Legal entities, terms

### Relationship Types:
- `fixes` - Fix → Error
- `relates_to` - Semantic similarity
- `similar_to` - Vector similarity
- `depends_on` - Code dependencies

## RAG Query Pipeline

### Standard RAG Flow:
```
1. Query Embedding
   ├─ Ollama embeddinggemma (768d)
   └─ Or Gemma-3 VLM (1024d for multimodal)

2. Vector Search (Qdrant)
   ├─ Cosine similarity
   ├─ Top-K retrieval (K=5 default)
   └─ Threshold filtering (>0.7)

3. BM25 Ranking (Optional)
   ├─ Lexical matching
   └─ Score combination (0.3 BM25 + 0.7 Dense)

4. Result Reranking
   ├─ Cross-encoder scoring
   └─ Diversity filtering

5. LLM Synthesis
   ├─ gemma3-legal:latest
   └─ Context-aware generation
```

### Graph-Enhanced RAG (KAG) Flow:
```
1-3. [Same as Standard RAG]

4. Graph Expansion
   ├─ Fetch neighbors (1-2 hops)
   ├─ Related entities
   └─ Relationship weights

5. Context Enrichment
   ├─ Merge vector + graph results
   ├─ Entity disambiguation
   └─ Temporal/hierarchical ordering

6. LLM Synthesis with Graph Context
   ├─ Structured knowledge injection
   └─ Multi-hop reasoning
```

## ACE Contextual Engineering Integration

### Trigger: Document Upload → Knowledge Graph Build
**Location**: `main.py` Stage 3

```python
# Upload chunks to Phase 79
result = await phase79_client.upload_document(doc_id, chunks, metadata)

# Build knowledge graph
kg_success = await phase79_client.build_knowledge_graph(
    doc_id=doc_id,
    enable_ace_synthesis=True  # ← ACE trigger
)
```

### ACE Synthesis:
1. Extract entities from document chunks
2. Link to existing knowledge graph
3. Update `phase94_knowledge_graph` collection
4. Trigger contextual reasoning updates
5. Generate new relationship hypotheses

## Performance Characteristics

### Embedding Generation:
- **Ollama (CPU)**: ~50ms per chunk
- **Gemma-3 VLM (GPU)**: ~150ms per chunk (multimodal)
- **Batch Processing**: 4-32 chunks concurrent

### Vector Search:
- **Qdrant**: <10ms for K=5
- **Qdrant**: <50ms for K=20
- **With graph expansion**: +50-200ms

### End-to-End RAG Query:
- **Simple RAG**: 100-300ms
- **Graph-Enhanced RAG**: 300-800ms
- **With LLM synthesis**: +2-5 seconds

## Storage Distribution

### Qdrant Collections (24 total):
- `phase79_rag_vectors` - Document chunks (primary RAG)
- `phase79_kag_graph` - Knowledge graph embeddings
- `phase94_knowledge_graph` - ACE synthesis KB
- `phase95_dag_nodes` - DAG topology (768d)
- `phase89_cache_index` - Codebase search
- ... (19 more phase collections)

### Redis Caching:
- **L1**: In-memory (LRU 1000 items)
- **L2**: Redis (1 hour TTL)
- **L3**: Disk (persistent)

### MinIO Buckets:
- `legal-documents` - Source documents
- `rag-context` - Processed chunks
- `knowledge-base` - Graph exports

## Comparison to Alternatives

### vs. Microsoft GraphRAG:
- ✅ **Lighter weight** (no Azure dependency)
- ✅ **Local inference** (Ollama vs. OpenAI)
- ✅ **Custom graph schema** (legal-specific)
- ❌ **Less mature** (newer codebase)
- ❌ **Smaller community** (custom implementation)

### vs. Pydantic AI:
- ✅ **More integrated** (custom pipeline)
- ✅ **Domain-specific** (legal AI optimized)
- ❌ **Less structured** (no Pydantic validation in RAG layer)
- ❌ **Manual tool calling** (vs. Pydantic AI's auto-tools)

### vs. CopilotKit RAG:
- ✅ **Backend-focused** (not UI-centric)
- ✅ **Multi-modal** (VLM support)
- ❌ **No built-in UI components** (vs. CopilotKit's React hooks)
- ❌ **Manual state management** (vs. CopilotKit's auto-sync)

## Summary

**Your RAG Stack**:
```
Custom Hybrid RAG+KAG System
├─ Vector Search: Qdrant (dense embeddings)
├─ Embeddings: Ollama embeddinggemma + Gemma-3 VLM
├─ LLM: Ollama gemma3-legal (local)
├─ Knowledge Graph: Neo4j (optional) + Qdrant graph collections
├─ BM25 Ranking: rank_bm25 library
├─ Caching: Redis (3-tier L1/L2/L3)
├─ Storage: MinIO (S3-compatible)
└─ Orchestration: TypeScript (graph-rag-orchestrator) + Python (Phase 79 middleware)
```

**Strengths**:
- ✅ Fully local inference (no API costs)
- ✅ Multimodal support (VLM for images/seals)
- ✅ Legal domain optimization
- ✅ ACE contextual engineering integration
- ✅ Hybrid search (BM25 + dense)
- ✅ Knowledge graph enrichment

**Trade-offs**:
- ⚠️ Custom implementation (maintenance burden)
- ⚠️ Multiple services (Phase 79, Go, TypeScript, Python)
- ⚠️ Less mature than Microsoft GraphRAG
- ⚠️ Manual tool orchestration (vs. frameworks)

**Recommendation**: Your stack is well-suited for legal AI with local inference requirements. Consider migrating to Pydantic AI for better structured outputs and tool calling, while keeping Qdrant + Ollama backend.
