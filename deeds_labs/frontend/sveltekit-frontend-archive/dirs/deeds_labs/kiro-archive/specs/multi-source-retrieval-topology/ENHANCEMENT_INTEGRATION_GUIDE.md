# Enhancement Integration Guide

## Quick Integration Overview

This guide shows how to integrate the enhancement features into the existing multi-source retrieval topology.

## 1. Google Search Integration

### Step 1: Add Google Custom Search API Configuration

```python
# backend/services/retrieval/config.py
GOOGLE_SEARCH_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY")
GOOGLE_SEARCH_ENGINE_ID = os.getenv("GOOGLE_SEARCH_ENGINE_ID")
```

### Step 2: Implement GoogleSearchRetriever

```python
# backend/services/retrieval/sources/google_search_retriever.py
from backend.services.retrieval.sources.base_retriever import BaseRetriever
from backend.services.retrieval.models import Result, Citation

class GoogleSearchRetriever(BaseRetriever):
    async def retrieve(self, query: str, top_k: int = 10) -> List[Result]:
        # Use Google Custom Search API
        # Extract citations from snippets
        # Return results with citations
        pass
```

### Step 3: Update MultiSourceRetriever

```python
# backend/services/retrieval/multi_source_retriever.py
class MultiSourceRetriever:
    def __init__(self, ...):
        self.google_retriever = GoogleSearchRetriever()
        # ... other retrievers

    async def retrieve_multi_source(self, query: str, sources: List[str]):
        if "google" in sources:
            google_results = await self.google_retriever.retrieve(query)
            results["google"] = google_results
```

## 2. Citation Management Integration

### Step 1: Create CitationManager

```python
# backend/services/retrieval/citations/citation_manager.py
class CitationManager:
    def __init__(self, pg_pool, qdrant_client):
        self.pg = pg_pool
        self.qdrant = qdrant_client

    async def save_citation(self, citation: Citation) -> str:
        # Store in PostgreSQL
        # Index in Qdrant
        # Return citation ID
        pass
```

### Step 2: Update Database Schema

```sql
-- Run migration to create citations table
CREATE TABLE citations (
    id UUID PRIMARY KEY,
    result_id UUID,
    text TEXT,
    source_url VARCHAR,
    source_title VARCHAR,
    context_before TEXT,
    context_after TEXT,
    confidence FLOAT,
    highlighted BOOLEAN,
    created_at TIMESTAMP,
    verified_at TIMESTAMP,
    embedding vector(768)
);

CREATE INDEX idx_citations_result ON citations(result_id);
CREATE INDEX idx_citations_source ON citations(source_url);
```

### Step 3: Integrate with Results

```python
# backend/services/retrieval/models.py
@dataclass
class ResultWithCitations(Result):
    citations: List[Citation]
    highlighted_content: str
    citation_count: int
    citation_confidence: float
```

## 3. Gemma3 VLM Integration

### Step 1: Implement Gemma3VLMProcessor

```python
# backend/services/retrieval/vlm/gemma3_vlm_processor.py
class Gemma3VLMProcessor:
    def __init__(self, model_path: str = "gemma3-vlm"):
        self.model = load_model(model_path)

    async def process_image(self, image_path: str) -> ImageAnalysis:
        # Load image
        # Process with Gemma3 VLM
        # Extract text, objects, relationships
        # Generate embeddings
        pass
```

### Step 2: Add Image Processing to Retrieval Pipeline

```python
# backend/services/retrieval/multi_source_retriever.py
class MultiSourceRetriever:
    def __init__(self, ...):
        self.vlm_processor = Gemma3VLMProcessor()
        # ... other components

    async def process_search_results(self, results: List[Result]):
        # Extract images from results
        # Process with Gemma3 VLM
        # Store image analysis
        pass
```

## 4. Image Search Integration

### Step 1: Implement ImageSearcher

```python
# backend/services/retrieval/images/image_searcher.py
class ImageSearcher:
    def __init__(self, qdrant_client, pg_pool, minio_client):
        self.qdrant = qdrant_client
        self.pg = pg_pool
        self.minio = minio_client

    async def index_image(self, image_analysis: ImageAnalysis) -> str:
        # Store metadata in PostgreSQL
        # Store image in MinIO
        # Store embedding in Qdrant
        pass

    async def search_images(self, query: str, top_k: int = 10):
        # Generate query embedding
        # Search Qdrant
        # Return results
        pass
```

### Step 2: Update Database Schema

```sql
-- Run migration to create images table
CREATE TABLE images (
    id UUID PRIMARY KEY,
    file_path VARCHAR,
    minio_path VARCHAR,
    extracted_text TEXT,
    visual_objects TEXT[],
    scene_description TEXT,
    relationships TEXT[],
    embedding vector(768),
    confidence FLOAT,
    source_url VARCHAR,
    created_at TIMESTAMP
);

CREATE INDEX idx_images_source ON images(source_url);
CREATE INDEX idx_images_confidence ON images(confidence);
```

## 5. Enhanced Topology Synthesis

### Step 1: Extend TopologySynthesis

```python
# backend/services/retrieval/synthesis/enhanced_topology_synthesis.py
class EnhancedTopologySynthesis(TopologySynthesis):
    async def synthesize_results(
        self,
        results: Dict[str, List[Result]],
        citations: List[Citation],
        images: List[ImageAnalysis]
    ) -> EnhancedSynthesizedResult:
        # Synthesize text results
        synthesized = await super().synthesize_results(results)

        # Add citation network
        synthesized.citation_network = self._build_citation_network(citations)

        # Add visual evidence
        synthesized.visual_evidence = images

        # Add visual nodes to 4D graph
        synthesized.graph_4d = self._add_visual_nodes(synthesized.graph_4d, images)

        return synthesized
```

## 6. API Endpoints Integration

### Step 1: Add New Endpoints

```python
# backend/api/retrieval_api.py
from fastapi import FastAPI, UploadFile

app = FastAPI()

@app.post("/api/search/with-citations")
async def search_with_citations(query: str, top_k: int = 10):
    """Search with citation highlighting"""
    results = await retriever.retrieve_multi_source(query)
    citations = await citation_manager.get_citations_for_results(results)
    highlighted = await citation_manager.highlight_citations(results, citations)
    return {
        "results": results,
        "citations": citations,
        "highlighted_content": highlighted
    }

@app.post("/api/search/images")
async def search_images(query: str, top_k: int = 10):
    """Search for images"""
    results = await image_searcher.search_images(query, top_k)
    return {"images": results}

@app.post("/api/search/visual-similarity")
async def search_visual_similarity(image_file: UploadFile):
    """Search for visually similar images"""
    image_path = await save_upload(image_file)
    results = await image_searcher.search_by_visual_similarity(image_path)
    return {"similar_images": results}
```

## 7. Configuration Updates

### Step 1: Update Environment Variables

```bash
# .env.development
GOOGLE_SEARCH_API_KEY=your_api_key
GOOGLE_SEARCH_ENGINE_ID=your_engine_id
GEMMA3_VLM_MODEL_PATH=models/gemma3-vlm
GEMMA3_VLM_DEVICE=cuda  # or cpu
```

### Step 2: Update Docker Compose

```yaml
# docker-compose.phase72.yml
services:
  # ... existing services

  gemma3-vlm:
    image: gemma3-vlm:latest
    ports:
      - "8001:8000"
    environment:
      - MODEL_PATH=/models/gemma3-vlm
      - DEVICE=cuda
    volumes:
      - ./models:/models
```

## 8. Testing Integration

### Step 1: Add Property Tests

```python
# tests/test_retrieval_citations.py
from hypothesis import given, settings
import hypothesis.strategies as st

class TestCitations:
    @given(st.text(min_size=10, max_size=500))
    @settings(max_examples=50)
    def test_citation_accuracy(self, snippet: str):
        # Property 11: Citation Accuracy
        # Test that citations accurately reflect source content
        pass

# tests/test_retrieval_images.py
class TestImageSearch:
    @given(st.binary(min_size=1000, max_size=100000))
    @settings(max_examples=20)
    def test_image_embedding_consistency(self, image_data: bytes):
        # Property 12: Image Embedding Consistency
        # Test that same image produces same embedding
        pass
```

### Step 2: Add Integration Tests

```python
# tests/test_retrieval_enhancement_integration.py
class TestEnhancementIntegration:
    async def test_search_with_citations(self):
        # Test Google Search with citation extraction
        pass

    async def test_image_indexing_and_search(self):
        # Test image indexing and retrieval
        pass

    async def test_end_to_end_with_citations_and_images(self):
        # Test complete workflow
        pass
```

## 9. Migration Path

### Phase 1: Prepare (1 day)
- [ ] Set up Google Custom Search API
- [ ] Configure Gemma3 VLM
- [ ] Create database migrations
- [ ] Update environment variables

### Phase 2: Implement Citations (3-4 days)
- [ ] Implement GoogleSearchRetriever
- [ ] Implement CitationManager
- [ ] Add citation storage
- [ ] Write property tests

### Phase 3: Implement Image Processing (3-4 days)
- [ ] Implement Gemma3VLMProcessor
- [ ] Implement ImageSearcher
- [ ] Add image storage
- [ ] Write property tests

### Phase 4: Integration (2-3 days)
- [ ] Enhance TopologySynthesis
- [ ] Add API endpoints
- [ ] Write integration tests
- [ ] Update documentation

### Phase 5: Testing & Deployment (2-3 days)
- [ ] Run all tests
- [ ] Verify properties
- [ ] Performance testing
- [ ] Deploy to staging

**Total Duration**: 2-3 weeks

## 10. Rollback Plan

If issues arise:

1. **Disable Google Search**: Remove from routing strategy
2. **Disable Image Search**: Remove from retrieval pipeline
3. **Disable Citations**: Disable citation highlighting
4. **Disable VLM**: Disable image processing
5. **Revert Database**: Use migration rollback scripts

## 11. Monitoring & Metrics

### Key Metrics to Track

- Citation extraction accuracy
- Citation verification success rate
- Image processing latency
- Image search relevance
- Visual evidence completeness
- API endpoint performance

### Monitoring Setup

```python
# backend/services/retrieval/monitoring.py
class RetrievalMonitoring:
    async def track_citation_extraction(self, result_id: str, count: int):
        # Track citation extraction metrics
        pass

    async def track_image_processing(self, image_id: str, latency: float):
        # Track image processing metrics
        pass

    async def track_search_performance(self, query: str, latency: float):
        # Track search performance
        pass
```

## 12. Troubleshooting

### Common Issues

**Issue**: Google Search API rate limiting
**Solution**: Implement caching and rate limiting

**Issue**: Image processing too slow
**Solution**: Batch process images, use GPU acceleration

**Issue**: Citation verification failing
**Solution**: Implement retry logic with exponential backoff

**Issue**: Image embeddings inconsistent
**Solution**: Verify Gemma3 VLM model version and settings

## 13. Performance Optimization

### Caching Strategy

```python
# Cache citation embeddings
citation_cache = TTLCache(maxsize=10000, ttl=3600)

# Cache image embeddings
image_cache = TTLCache(maxsize=5000, ttl=3600)

# Cache search results
search_cache = TTLCache(maxsize=1000, ttl=300)
```

### Batch Processing

```python
# Batch process images
async def batch_process_images(images: List[str], batch_size: int = 10):
    for i in range(0, len(images), batch_size):
        batch = images[i:i+batch_size]
        results = await vlm_processor.process_batch(batch)
        yield results
```

### Parallel Execution

```python
# Process multiple sources in parallel
async def retrieve_multi_source_parallel(query: str, sources: List[str]):
    tasks = [
        retriever.retrieve(query) for retriever in retrievers
    ]
    results = await asyncio.gather(*tasks)
    return results
```

## 14. Documentation Updates

### Files to Update

- [ ] API Documentation - Add new endpoints
- [ ] User Guide - Add citation and image search sections
- [ ] Developer Guide - Add integration instructions
- [ ] Architecture Diagram - Add new components
- [ ] Database Schema - Document new tables

### Files to Create

- [ ] Citation System Guide
- [ ] Image Search Guide
- [ ] Gemma3 VLM Integration Guide
- [ ] API Examples
- [ ] Troubleshooting Guide

---

**Status**: ✅ INTEGRATION GUIDE COMPLETE
**Ready for Implementation**: YES
**Estimated Duration**: 2-3 weeks
