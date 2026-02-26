# Phase 4: Multimodal Retrieval - Integration Plan

## Overview

Phase 4 implements the multimodal retrieval layer by integrating existing embedding and reranking services with the Phase 1-3 infrastructure (runes, tiles, Neo4j KAG, Qdrant, FAISS).

## Existing Components Found

### 1. Embedding Service ✅
**File**: `backend/services/embedding_service.py`
- EmbeddingGemmaService class
- 768-dimensional embeddings
- GPU-accelerated (CUDA fallback to CPU)
- Batch processing support
- Cosine similarity computation
- Singleton pattern

**Integration**: Use directly for query embedding

### 2. Reranker Service ✅
**File**: `backend/reranker_service.py`
- RerankerService class
- MiniLM-L6-v2 cross-encoder
- Batch reranking (top-50 → top-5)
- Cross-encoder scoring
- Latency monitoring
- Singleton pattern

**Integration**: Use for final result ranking

### 3. RAG Orchestrator ✅
**File**: `python_codebase/legal_ai_core/rag-orchestrator_main.py`
- Query embedding generation
- Qdrant vector search
- Result reranking
- Web search integration
- Caching support

**Integration**: Reference for orchestration pattern

### 4. Phase 47 Graph Analyzer ✅
**File**: `python_codebase/utilities/phase47_graph_analyzer.py`
- AST and textual embedding fusion
- Similarity ranking
- Neo4j persistence
- CUDA acceleration
- TensorRT support

**Integration**: Reference for fusion patterns

## Phase 4 Implementation Plan

### Task 16: Query Embedding Service
**Status**: Ready to integrate
**Source**: `backend/services/embedding_service.py`
**Action**: Create wrapper for Phase 4

```python
# backend/services/query_embedder.py
from backend.services.embedding_service import get_embedding_service

class QueryEmbedder:
    def __init__(self):
        self.embedding_service = get_embedding_service()

    def embed_query(self, query: str) -> np.ndarray:
        """Embed query using EmbeddingGemma"""
        return self.embedding_service.embed_single(query)

    def embed_batch(self, queries: List[str]) -> np.ndarray:
        """Embed multiple queries"""
        return self.embedding_service.embed(queries)
```

### Task 17: KAG Expansion Engine
**Status**: Ready to integrate
**Source**: `backend/services/kag_loader.py`
**Action**: Create expansion wrapper

```python
# backend/services/kag_expander.py
from backend.services.kag_loader import KAGLoader

class KAGExpander:
    def __init__(self):
        self.kag_loader = KAGLoader()

    def expand(self, node_id: str, depth: int = 2) -> List[Dict]:
        """Expand KAG from node"""
        return self.kag_loader.expand_kag(node_id, depth)

    def get_edges(self, node_id: str) -> List[Dict]:
        """Get edges from node"""
        return self.kag_loader.get_kag_edges(node_id)
```

### Task 18: Fusion Ranker
**Status**: Ready to integrate
**Source**: `backend/reranker_service.py`
**Action**: Create fusion wrapper

```python
# backend/services/fusion_ranker.py
from backend.reranker_service import get_reranker_service

class FusionRanker:
    def __init__(self):
        self.reranker = get_reranker_service()

    async def fuse_and_rank(
        self,
        query: str,
        rag_results: List[Dict],
        kag_results: List[Dict],
        vag_results: List[Dict],
        weights: Dict[str, float] = None
    ) -> List[Dict]:
        """Fuse RAG + KAG + VAG and rank"""
        # Combine results
        combined = self._combine_results(rag_results, kag_results, vag_results, weights)

        # Rerank with cross-encoder
        reranked = await self.reranker.rerank(query, combined, top_k=20)

        return reranked

    def _combine_results(self, rag, kag, vag, weights):
        """Combine results with weighted fusion"""
        # Implementation
        pass
```

### Task 19: RAG + KAG + VAG Retriever
**Status**: Ready to integrate
**Source**: `python_codebase/legal_ai_core/rag-orchestrator_main.py`
**Action**: Create unified retriever

```python
# backend/services/multimodal_retriever.py
from backend.services.query_embedder import QueryEmbedder
from backend.services.qdrant_client import QdrantClient
from backend.services.kag_loader import KAGLoader
from backend.services.faiss_builder import FAISSBuilder
from backend.services.fusion_ranker import FusionRanker

class MultimodalRetriever:
    def __init__(self):
        self.query_embedder = QueryEmbedder()
        self.qdrant = QdrantClient()
        self.kag = KAGLoader()
        self.faiss = FAISSBuilder()
        self.ranker = FusionRanker()

    async def retrieve(self, query: str) -> List[Dict]:
        """Full multimodal retrieval"""
        # 1. Embed query
        query_vec = self.query_embedder.embed_query(query)

        # 2. RAG search (Qdrant)
        rag_results = self.qdrant.search("embeddings", query_vec, top_k=20)

        # 3. KAG expansion
        kag_results = []
        for result in rag_results[:5]:
            expanded = self.kag.expand_kag(str(result['id']), depth=2)
            kag_results.extend(expanded)

        # 4. VAG search (FAISS)
        vag_results = self.faiss.search(self.faiss_index, query_vec, k=20)

        # 5. Fuse and rank
        final_results = await self.ranker.fuse_and_rank(
            query, rag_results, kag_results, vag_results
        )

        return final_results
```

## Integration Points

### With Phase 1-3
- Query embedding uses Phase 1 rune embeddings
- KAG expansion uses Phase 3 Neo4j loader
- Qdrant search uses Phase 3 vector store
- FAISS search uses Phase 3 index builder

### With Existing Services
- EmbeddingGemmaService for query embedding
- RerankerService for final ranking
- RAG orchestrator pattern for workflow
- Phase 47 fusion patterns for multimodal fusion

## Files to Create

1. `backend/services/query_embedder.py` - Query embedding wrapper
2. `backend/services/kag_expander.py` - KAG expansion wrapper
3. `backend/services/fusion_ranker.py` - Fusion and ranking
4. `backend/services/multimodal_retriever.py` - Main retriever orchestrator

## Files to Integrate

1. `backend/services/embedding_service.py` - Already exists
2. `backend/reranker_service.py` - Already exists
3. `backend/services/kag_loader.py` - Already exists
4. `backend/services/qdrant_client.py` - Created in Phase 3
5. `backend/services/faiss_builder.py` - Created in Phase 3

## Testing Strategy

### Unit Tests
- Query embedding correctness
- KAG expansion completeness
- Fusion ranking monotonicity
- Multimodal retrieval end-to-end

### Property-Based Tests
- Property 11: Query Embedding Format
- Property 13: KAG Expansion Completeness
- Property 14: Fusion Score Monotonicity

## Performance Targets

| Component | Target | Current |
|-----------|--------|---------|
| Query embedding | <50ms | ~10-20ms |
| Qdrant search | <50ms | ~10-50ms |
| KAG expansion | <100ms | ~50ms |
| FAISS search | <10ms | ~1-5ms |
| Reranking | <100ms | ~50ms |
| Total end-to-end | <300ms | ~150-250ms |

## Next Steps

1. Create query embedder wrapper
2. Create KAG expander wrapper
3. Create fusion ranker wrapper
4. Create multimodal retriever orchestrator
5. Write unit tests
6. Write property-based tests
7. Integration testing

## Status

Ready to implement Phase 4 with existing infrastructure.

