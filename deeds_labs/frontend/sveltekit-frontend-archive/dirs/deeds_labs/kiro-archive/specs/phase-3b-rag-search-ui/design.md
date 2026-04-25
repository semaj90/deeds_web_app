# Phase 3B: Evidence RAG Search UI - Design

## Overview

Phase 3B implements a complete Evidence RAG Search UI with semantic search, reranking, and visual evidence organization. The system integrates Qdrant vector search, MiniLM reranking, and a golden-ratio evidence board layout.

**Key Components**:
- Backend search service (Python FastAPI)
- Frontend search UI (SvelteKit)
- Evidence board visualization
- Search result caching (Redis)
- Real-time progress streaming (SSE)

**Performance Targets**:
- Cached search: <100ms
- New search: <500ms
- Embedding generation: <50ms
- Qdrant search: <100ms
- Reranking: <50ms

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (SvelteKit)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Search Page  │  │ Results List │  │ Evidence Board   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                 │                    │             │
│         └─────────────────┼────────────────────┘             │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                    API Layer (FastAPI)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ POST /api/search/evidence                            │   │
│  │ GET /api/search/results/{id}                         │   │
│  │ POST /api/search/rerank                              │   │
│  │ GET /api/search/stream/{id}                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                  Search Service Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Query Embed  │  │ Qdrant Search│  │ MiniLM Rerank    │  │
│  │ (Gemma-2b)   │  │ (top-50)     │  │ (top-5)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                 │                    │             │
├─────────┼─────────────────┼────────────────────┼─────────────┤
│         │                 │                    │             │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌─────────▼────────┐    │
│  │ Redis Cache │  │ Qdrant DB   │  │ MinIO (Chunks)   │    │
│  │ (24h TTL)   │  │ (Vectors)   │  │ (Metadata)       │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Search Service (`backend/search_service.py`)

**Responsibilities**:
- Query embedding generation
- Qdrant search (top-50)
- Result retrieval from MinIO
- Cache management

**Key Methods**:
```python
class SearchService:
    async def search(query: str, filters: Dict) -> SearchResult
    async def rerank(query: str, candidates: List[Chunk]) -> List[RankedResult]
    async def get_cached_results(query_hash: str) -> Optional[SearchResult]
    async def cache_results(query_hash: str, results: SearchResult) -> None
```

**Dependencies**:
- Qdrant client (vector search)
- MinIO client (chunk retrieval)
- Redis client (caching)
- Embedding model (Gemma-2b)

### 2. Reranking Service (`backend/reranker_service.py`)

**Responsibilities**:
- MiniLM model loading
- Cross-encoder scoring
- Result sorting and ranking

**Key Methods**:
```python
class RerankerService:
    async def rerank(query: str, candidates: List[Chunk], top_k: int = 5) -> List[RankedResult]
    async def score_pair(query: str, text: str) -> float
```

**Dependencies**:
- MiniLM-L6-v2 model (HuggingFace)
- Sentence transformers library

### 3. Search API Endpoints

**POST /api/search/evidence**
```json
Request:
{
  "query": "evidence of intent",
  "filters": {
    "jurisdiction": "CA",
    "statute": "PC 187",
    "date_range": ["2020-01-01", "2024-12-31"]
  }
}

Response:
{
  "search_id": "search_123",
  "status": "processing",
  "stream_url": "/api/search/stream/search_123"
}
```

**GET /api/search/results/{search_id}**
```json
Response:
{
  "search_id": "search_123",
  "query": "evidence of intent",
  "results": [
    {
      "rank": 1,
      "chunk_id": "chunk_456",
      "doc_id": "doc_789",
      "text": "...",
      "relevance_score": 0.92,
      "page": 3,
      "bounding_boxes": [...]
    }
  ],
  "total_results": 5,
  "latency_ms": 245
}
```

**POST /api/search/rerank**
```json
Request:
{
  "query": "evidence of intent",
  "candidates": [
    {"chunk_id": "chunk_1", "text": "..."},
    {"chunk_id": "chunk_2", "text": "..."}
  ]
}

Response:
{
  "reranked": [
    {"chunk_id": "chunk_1", "score": 0.92},
    {"chunk_id": "chunk_2", "score": 0.87}
  ]
}
```

**GET /api/search/stream/{search_id}** (SSE)
```
event: embedding_complete
data: {"status": "embedding_complete", "timestamp": "2024-01-01T12:00:00Z"}

event: search_complete
data: {"status": "search_complete", "result_count": 50, "timestamp": "2024-01-01T12:00:01Z"}

event: reranking_complete
data: {"status": "reranking_complete", "top_k": 5, "timestamp": "2024-01-01T12:00:02Z"}

event: done
data: {"status": "done", "total_latency_ms": 245}
```

### 4. Frontend Search UI (`sveltekit-frontend/src/routes/search/+page.svelte`)

**Components**:
- Search bar with autocomplete
- Filter panel (jurisdiction, statute, date range)
- Results list view
- Result detail panel
- Evidence board view

**State Management**:
- Search query
- Filter selections
- Results list
- Selected result
- Loading state
- Error state

### 5. Evidence Board (`sveltekit-frontend/src/routes/evidence-board/+page.svelte`)

**Layout**:
- Golden-ratio 3-column: 22% / 55% / 23%
- Left sidebar: Evidence list
- Center canvas: Evidence cards with connections
- Right rail: Related evidence and metadata

**Card Styling**:
- Manila folder shape (CSS border-radius)
- Polaroid-style shadow
- Status color strip (top)
- Title and snippet

**Interactions**:
- Hover: Highlight related cards
- Click: Open detail panel
- Zoom: Scale view (100%, ±10%, reset)
- Drag: Pan canvas

## Data Models

### SearchResult
```python
@dataclass
class SearchResult:
    search_id: str
    query: str
    results: List[RankedResult]
    total_results: int
    latency_ms: int
    cached: bool
    timestamp: datetime
```

### RankedResult
```python
@dataclass
class RankedResult:
    rank: int
    chunk_id: str
    doc_id: str
    text: str
    relevance_score: float
    page: int
    bounding_boxes: List[Dict]
    semantic_type: str
    metadata: Dict
```

### SearchCache
```python
@dataclass
class SearchCache:
    query_hash: str
    results: SearchResult
    created_at: datetime
    ttl_seconds: 86400  # 24 hours
```

## Error Handling

**Search Errors**:
- Empty query → "Please enter a search query"
- Query too long (>1000 chars) → "Query too long"
- Qdrant unavailable → "Search service unavailable"
- Embedding service fails → "Could not process query"
- Reranking fails → Return top-50 without reranking

**Retry Logic**:
- Qdrant search: 3 retries with exponential backoff
- Embedding service: 2 retries
- Reranking: 1 retry (fail gracefully)

**Logging**:
- Log all search queries (for analytics)
- Log latency breakdown (embedding, search, reranking)
- Log cache hits/misses
- Log errors with context

## Testing Strategy

### Unit Tests
- Query embedding generation
- Qdrant search filtering
- MiniLM reranking
- Cache hit/miss logic
- Error handling

### Integration Tests
- End-to-end search (query → embedding → search → rerank → display)
- Cache invalidation on new uploads
- Filter application
- Progress streaming

### Performance Tests
- Search latency (<500ms new, <100ms cached)
- Embedding latency (<50ms)
- Qdrant search latency (<100ms)
- Reranking latency (<50ms)
- Concurrent search handling (10+ simultaneous)

### UI Tests
- Search bar input and submission
- Filter selection and application
- Result display and detail panel
- Evidence board rendering
- Zoom and pan controls

## Performance Optimization

**Caching Strategy**:
- Query hash-based caching (24-hour TTL)
- Result caching in Redis
- Reranking result caching
- Chunk metadata caching

**Search Optimization**:
- Batch embedding generation
- Qdrant filter optimization
- Reranking batch processing
- Connection pooling (Qdrant, Redis, MinIO)

**Frontend Optimization**:
- Lazy loading of result details
- Virtual scrolling for large result lists
- Debounced search input
- Progressive rendering of evidence board

## Deployment Considerations

**Environment Variables**:
- `QDRANT_URL`: Qdrant server URL
- `QDRANT_API_KEY`: Qdrant API key
- `REDIS_URL`: Redis connection URL
- `MINIO_ENDPOINT`: MinIO endpoint
- `EMBEDDING_MODEL`: Embedding model name (default: google/gemma-2b-it)
- `RERANKER_MODEL`: Reranker model name (default: sentence-transformers/msmarco-MiniLM-L6-v2)

**Dependencies**:
- Qdrant (vector database)
- Redis (caching)
- MinIO (chunk storage)
- Transformers library (embedding + reranking)
- FastAPI (backend)
- SvelteKit (frontend)

**Scaling**:
- Horizontal scaling: Multiple search service instances
- Load balancing: Round-robin across instances
- Cache sharing: Centralized Redis
- Database sharing: Centralized Qdrant

## Security Considerations

- Input validation: Query length, filter values
- Rate limiting: Search requests per user
- Authentication: User must be logged in
- Authorization: Users can only search their own evidence
- Data privacy: Search queries not logged with user data

---

## Summary

Phase 3B implements a complete Evidence RAG Search UI with:
- Semantic search via Qdrant (top-50)
- MiniLM reranking (top-5)
- Evidence board visualization
- Search result caching
- Real-time progress streaming
- Comprehensive error handling

The design prioritizes performance (<500ms new search, <100ms cached) and user experience (intuitive search, visual evidence organization).
