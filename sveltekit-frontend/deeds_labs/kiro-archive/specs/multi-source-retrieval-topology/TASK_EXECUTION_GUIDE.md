# Task Execution Guide: Multi-Source Retrieval Topology

## Overview

This guide provides step-by-step instructions for executing the implementation tasks. Each task builds on previous tasks and includes specific code locations and patterns to follow.

---

## Task 1: Set up project structure and core interfaces

### Objective
Create the directory structure and define base interfaces for the multi-source retrieval system.

### Steps

1. **Create directory structure**:
   ```bash
   mkdir -p backend/services/retrieval/{sources,synthesis,routing}
   mkdir -p backend/services/retrieval/models
   mkdir -p backend/services/retrieval/utils
   ```

2. **Create `backend/services/retrieval/__init__.py`**:
   - Import and expose main classes
   - Set up logging

3. **Create `backend/services/retrieval/models.py`**:
   - Define `QueryProfile` dataclass
   - Define `Result` dataclass
   - Define `Graph4D` dataclass
   - Define `RoutingStrategy` dataclass
   - Reference: Design document, Data Models section

4. **Create `backend/services/retrieval/config.py`**:
   - Load API keys from environment
   - Configure database connections
   - Set up service endpoints

### Key Files to Reference
- `backend/services/alignment_router.py` - Existing router pattern
- `backend/services/multimodal_retriever.py` - Existing retriever pattern
- `.env.development` - Environment configuration

### Acceptance Criteria
- ✅ Directory structure created
- ✅ All dataclasses defined with proper type hints
- ✅ Configuration loaded from environment
- ✅ Logging configured

---

## Task 2: Implement Query Analyzer & Router

### Objective
Create the QueryAnalyzer class to analyze queries and determine optimal routing strategy.

### Steps

1. **Create `backend/services/retrieval/routing/query_analyzer.py`**:
   ```python
   class QueryAnalyzer:
       def analyze_query(self, query: str) -> QueryProfile:
           # Detect intent: legal, general, recent, temporal
           # Extract entities using NER or keywords
           # Detect temporal references
           # Return QueryProfile

       def route_query(self, profile: QueryProfile) -> RoutingStrategy:
           # Determine which sources to query
           # Set source priorities
           # Return RoutingStrategy
   ```

2. **Implement intent detection**:
   - Use keyword matching for legal queries (contract, agreement, clause, etc.)
   - Use keyword matching for temporal queries (when, date, time, etc.)
   - Use keyword matching for recent queries (latest, recent, new, etc.)
   - Default to general

3. **Implement entity extraction**:
   - Use simple keyword extraction or NER
   - Reference: `BehaviorRouter` for intent patterns

4. **Implement routing strategy**:
   - Legal queries → legal_rag_plus_kag, PostgreSQL summaries
   - General queries → Wikipedia, Google Search
   - Temporal queries → 4D Graph Topology
   - Recent queries → Google Search, web search

### Key Files to Reference
- `backend/services/alignment_router.py` - `_route_decision()` method
- `python_codebase/utilities/native/autoencoder/behavior_router.py` - Intent detection

### Acceptance Criteria
- ✅ QueryAnalyzer class created
- ✅ Intent detection working for all types
- ✅ Entitytion implemented
- ✅ Routing strategy generation working

---

## Task 2.1: Write property test for query analysis

### Objective
Create property-based tests for query analysis.

### Steps

1. **Create `tests/test_retrieval_query_analyzer.py`**:
   ```python
   from hypothesis import given, settings
   import hypothesis.strategies as st

   class TestQueryAnalyzer:
       @given(st.text(min_size=1, max_size=500))
       @settings(max_examples=100)
       def test_query_profile_consistency(self, query: str):
           # Property 1.1: Query Intent Detection
           # For any query, analyzing it should produce a valid QueryProfile
           analyzer = QueryAnalyzer()
           profile = analyzer.analyze_query(query)

           assert profile is not None
           assert profile.intent in ["legal", "general", "recent", "temporal"]
           assert isinstance(profile.entities, list)
           assert 0 <= profile.confidence_threshold <= 1
   ```

2. **Implement test generators**:
   - Generate legal queries with legal keywords
   - Generate general queries with common words
   - Generate temporal queries with time references
   - Generate recent queries with recency keywords

3. **Test routing strategy**:
   - Verify legal queries route to legal sources
   - Verify general queries route to Wikipedia/Google
   - Verify temporal queries route to 4D graph

### Key Files to Reference
- `tests/test_phase4_properties.py` - Property-based test patterns
- `tests/test_phase4_multimodal_retrieval.py` - Test structure

### Acceptance Criteria
- ✅ Property tests written
- ✅ Tests pass with 100+ examples
- ✅ All query types covered

---

## Task 3: Implement Multi-Source Retrieval Layer

### Objective
Create the MultiSourceRetriever class that executes queries across multiple sources.

### Steps

1. **Create `backend/services/retrieval/sources/__init__.py`**:
   - Define base `Retriever` interface
   - Define `Result` structure

2. **Create `backend/services/retrieval/sources/base_retriever.py`**:
   ```python
   class BaseRetriever(ABC):
       @abstractmethod
       async def retrieve(self, query: str, top_k: int = 10) -> List[Result]:
           pass
   ```

3. **Create `backend/services/retrieval/multi_source_retriever.py`**:
   ```python
   class MultiSourceRetriever:
       def __init__(self, retrievers: Dict[str, BaseRetriever]):
           self.retrievers = retrievers

       async def retrieve_multi_source(
           self, query: str, sources: List[str], parallel: bool = True
       ) -> Dict[str, List[Result]]:
           # Execute queries in parallel or sequentially
           # Return results from each source
   ```

4. **Implement RAG/KAG retriever**:
   - Extend existing `MultimodalRetriever`
   - Reference: `backend/services/multimodal_retriever.py`

5. **Implement 4D Graph Topology retriever**:
   - Query Neo4j for entities and relationships
   - Reference: `go-microservice/neo4j-integration.go`

6. **Implement PostgreSQL summaries retriever**:
   - Query pgvector for similar summaries
   - Reference: `python-services/rag_search.py`

7. **Implement MinIO document retriever**:
   - Query MinIO for documents
   - Reference: `python-services/evidence_crud.py`

### Key Files to Reference
- `backend/services/multimodal_retriever.py` - Existing retriever pattern
- `python-services/rag_search.py` - pgvector search pattern
- `python-services/evidence_crud.py` - MinIO operations

### Acceptance Criteria
- ✅ MultiSourceRetriever class created
- ✅ All source retrievers implemented
- ✅ Parallel execution working
- ✅ Results properly formatted

---

## Task 3.1: Write property test for multi-source retrieval

### Objective
Create property-based tests for multi-source retrieval.

### Steps

1. **Create `tests/test_retrieval_multi_source.py`**:
   ```python
   class TestMultiSourceRetriever:
       @given(st.text(min_size=1, max_size=500))
       @settings(max_examples=100)
       def test_multi_source_retrieval(self, query: str):
           # Property 1.5: Multi-Source Result Retrieval
           # For any query, retrieving from multiple sources should return results
           retriever = MultiSourceRetriever(...)
           results = await retriever.retrieve_multi_source(query, sources=["rag", "wikipedia"])

           assert isinstance(results, dict)
           assert all(isinstance(v, list) for v in results.values())
   ```

2. **Test result consistency**:
   - Verify results have required fields
   - Verify source attribution
   - Verify confidence scores

### Acceptance Criteria
- ✅ Property tests written
- ✅ Tests pass with 100+ examples
- ✅ All sources tested

---

## Task 4: Implement Vector Database Mirror Layer

### Objective
Create the VectorMirror class for Qdrant ↔ pgvector synchronization.

### Steps

1. **Create `backend/services/retrieval/vector_mirror.py`**:
   ```python
   class VectorMirror:
       def __init__(self, qdrant_client, pg_pool):
           self.qdrant = qdrant_client
           self.pg = pg_pool

       async def store_embedding(self, embedding: List[float], metadata: Dict) -> None:
           # Store in both Qdrant and pgvector
           pass

       async def search_embeddings(self, query_embedding: List[float], top_k: int = 10) -> List[Result]:
           # Search with automatic fallback
           pass
   ```

2. **Implement Qdrant storage**:
   - Reference: `backend/services/alignment_router.py` - `_store_in_qdrant()`

3. **Implement pgvector storage**:
   - Reference: `python_codebase/data_ingestion/ingest-legal-documents.py`

4. **Implement fallback logic**:
   - Try Qdrant first
   - Fall back to pgvector if Qdrant unavailable
   - Fall back to Qdrant if pgvector unavailable

5. **Implement sync verification**:
   - Compare record counts
   - Verify consistency of results

### Key Files to Reference
- `backend/services/alignment_router.py` - Qdrant integration
- `python_codebase/data_ingestion/ingest-legal-documents.py` - pgvector integration
- `setup_chr97_database.py` - pgvector schema

### Acceptance Criteria
- ✅ VectorMirror class created
- ✅ Dual storage working
- ✅ Fallback logic working
- ✅ Sync verification working

---

## Task 4.1: Write property test for vector mirror consistency

### Objective
Create property-based tests for vector mirror consistency.

### Steps

1. **Create `tests/test_retrieval_vector_mirror.py`**:
   ```python
   class TestVectorMirror:
       @given(st.lists(st.floats(min_value=-1, max_value=1), min_size=768, max_size=768))
       @settings(max_examples=50)
       def test_vector_mirror_consistency(self, embedding: List[float]):
           # Property 3.5: Vector Mirror Consistency
           # For any embedding stored in both DBs, queries should return identical results
           mirror = VectorMirror(...)
           await mirror.store_embedding(embedding, {"test": True})

           qdrant_results = await mirror.search_embeddings(embedding, source="qdrant")
           pgvector_results = await mirror.search_embeddings(embedding, source="pgvector")

           assert len(qdrant_results) == len(pgvector_results)
           assert qdrant_results[0].id == pgvector_results[0].id
   ```

### Acceptance Criteria
- ✅ Property tests written
- ✅ Tests pass with 50+ examples
- ✅ Consistency verified

---

## Task 5: Implement Wikipedia Integration

### Objective
Create the WikipediaRetriever class for Wikipedia content retrieval.

### Steps

1. **Create `backend/services/retrieval/sources/wikipedia_retriever.py`**:
   ```python
   class WikipediaRetriever(BaseRetriever):
       async def retrieve(self, query: str, top_k: int = 10) -> List[Result]:
           # Search Wikipedia
           # Extract key sections
           # Create embeddings
           # Store in MinIO
           # Return results
   ```

2. **Implement Wikipedia search**:
   - Use `wikipedia` library or MediaWiki API
   - Extract summary and sections
   - Handle disambiguation pages

3. **Implement content extraction**:
   - Extract key sections
   - Remove metadata and references
   - Preserve structure

4. **Implement MinIO storage**:
   - Reference: `python-services/evidence_crud.py`
   - Store with metadata: source, timestamp, URL

5. **Implement pgvector embedding**:
   - Generate embeddings using Ollama
   - Reference: `backend/services/alignment_router.py` - `_batch_embed()`

### Key Files to Reference
- `python-services/evidence_crud.py` - MinIO operations
- `backend/services/alignment_router.py` - Embedding generation
- `python_codebase/data_ingestion/ingest-legal-documents.py` - pgvector storage

### Acceptance Criteria
- ✅ WikipediaRetriever class created
- ✅ Wikipedia search working
- ✅ Content extraction working
- ✅ MinIO storage working
- ✅ pgvector embedding working

---

## Task 5.1: Write property test for Wikipedia persistence

### Objective
Create property-based tests for Wikipedia content persistence.

### Steps

1. **Create `tests/test_retrieval_wikipedia.py`**:
   ```python
   class TestWikipediaRetriever:
       @given(st.text(min_size=5, max_size=100))
       @settings(max_examples=20)
       def test_wikipedia_persistence(self, query: str):
           # Property 7: Wikipedia Content Persistence
           # For any Wikipedia article retrieved, storing and searching should retrieve it
           retriever = WikipediaRetriever(...)
           results = await retriever.retrieve(query)

           if results:
               stored_result = results[0]
               # Search for similar content
               search_results = await retriever.search_similar(stored_result.content)
               assert any(r.id == stored_result.id for r in search_results)
   ```

### Acceptance Criteria
- ✅ Property tests written
- ✅ Tests pass with 20+ examples
- ✅ Persistence verified

---

## Continuing Tasks 6-19

Follow the same pattern for remaining tasks:

1. **Implement the component** (main task)
2. **Write property tests** (sub-task)
3. **Verify against requirements** (acceptance criteria)
4. **Document patterns used** (for consistency)

### Task Sequence
- Task 6: Google Search Integration
- Task 7: 4D Graph Topology
- Task 8: PostgreSQL Summary Storage
- Task 9: MinIO Document Storage
- Task 10: Topology Synthesis Engine
- Task 11: Fallback Chain Manager
- Task 12: Confidence-Based Source Selection
- Task 13: ACE Orchestrator Integration
- Task 14: Error Handling and Monitoring
- Task 15: Checkpoint
- Task 16: Integration Tests
- Task 17: API Endpoints
- Task 18: Documentation
- Task 19: Final Checkpoint

---

## Key Patterns to Follow

### Pattern 1: Async Retrieval
```python
async def retrieve(self, query: str, top_k: int = 10) -> List[Result]:
    # Implement retrieval logic
    # Return List[Result] with proper fields
    pass
```

### Pattern 2: Error Handling
```python
try:
    # Attempt operation
    pass
except Exception as e:
    logger.error(f"Error: {e}")
    # Fall back to alternative
    pass
```

### Pattern 3: Embedding Generation
```python
embeddings = await self.embedding_service.embed_batch(texts)
# Store embeddings with metadata
```

### Pattern 4: Vector Storage
```python
await self.vector_mirror.store_embedding(embedding, metadata)
# Automatically stores in both Qdrant and pgvector
```

---

## Testing Checklist

For each task:
- [ ] Unit tests written
- [ ] Property tests written
- [ ] Tests pass locally
- [ ] Code follows existing patterns
- [ ] Documentation updated
- [ ] No breaking changes

---

## Deployment Checklist

Before final deployment:
- [ ] All tests passing
- [ ] All properties verified
- [ ] Integration tests passing
- [ ] API endpoints working
- [ ] Documentation complete
- [ ] Performance acceptable
- [ ] Error handling robust

---

## Quick Reference: Common Operations

### Embedding Generation
```python
from backend.services.alignment_router import AlignmentRouter
router = AlignmentRouter()
embeddings = await router._batch_embed(texts)
```

### MinIO Operations
```python
from python-services.evidence_crud import upload_to_minio, delete_from_minio
await upload_to_minio("path/to/file", content)
```

### pgvector Search
```python
from python-services.rag_search import search_pgvector
results = await search_pgvector(query_embedding, top_k=10)
```

### Qdrant Operations
```python
from qdrant_client import QdrantClient
client = QdrantClient(url="http://localhost:6333")
results = client.search(collection_name="embeddings", query_vector=embedding, limit=10)
```

---

## Support and Debugging

### Common Issues

1. **Embedding dimension mismatch**:
   - Ensure all embeddings are 768-dimensional
   - Check embedding model configuration

2. **Vector database connection errors**:
   - Verify Qdrant and PostgreSQL are running
   - Check connection strings in configuration

3. **MinIO upload failures**:
   - Verify MinIO is running
   - Check bucket permissions
   - Verify object path format

4. **API key errors**:
   - Verify API keys in environment variables
   - Check API key permissions
   - Verify API endpoints

### Debugging Commands

```bash
# Check Qdrant health
curl http://localhost:6333/health

# Check PostgreSQL connection
psql -U postgres -d chr97 -c "SELECT 1"

# Check MinIO health
curl http://localhost:9000/minio/health/live

# Check Ollama embeddings
curl -X POST http://localhost:11434/api/embed -d '{"model":"embeddinggemma","input":"test"}'
```

---

## Next Steps

1. Start with Task 1: Set up project structure
2. Follow the task sequence in order
3. Write tests as you implement
4. Verify each task against requirements
5. Document patterns and decisions
6. Run integration tests before final checkpoint
