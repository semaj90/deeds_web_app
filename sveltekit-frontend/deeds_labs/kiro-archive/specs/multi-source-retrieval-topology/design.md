# Design Document: Multi-Source Retrieval Topology

## Overview

The Multi-Source Retrieval Topology is an advanced knowledge retrieval system that intelligently routes queries across multiple authoritative sources (Google Search, Wikipedia, RAG/KAG, 4D graph topology, PostgreSQL summaries, MinIO documents, and mirrored vector databases). The system synthesizes results from diverse sources into a unified 4D knowledge graph with confidence scoring, temporal awareness, and automatic fallback chains.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Query Entry Point                            │
│                  (ACE Orchestrator)                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Query Analyzer & Router                             │
│  - Analyze query intent, entities, temporal aspects             │
│  - Determine source relevance scores                            │
│  - Select routing strategy based on confidence                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌─────────┐    ┌──────────┐    ┌──────────────┐
   │ Primary │    │Secondary │    │   Fallback   │
   │ Sources │    │ Sources  │    │   Sources    │
   └────┬────┘    └────┬─────┘    └──────┬───────┘
        │              │                 │
        ├──────────────┼─────────────────┤
        │              │                 │
        ▼              ▼                 ▼
   ┌─────────────────────────────────────────────┐
   │         Multi-Source Retrieval Layer        │
   │                                             │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
   │  │ RAG/KAG  │  │Wikipedia │  │  Google  │ │
   │  │ (Legal)  │  │ (General)│  │ (Recent) │ │
   │  └──────────┘  └──────────┘  └──────────┘ │
   │                                             │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
   │  │4D Graph  │  │PostgreSQL│  │  MinIO   │ │
   │  │Topology  │  │Summaries │  │Documents │ │
   │  └──────────┘  └──────────┘  └──────────┘ │
   └────────────────┬────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │      Vector Database Mirror Layer           │
   │                                             │
   │  ┌──────────────┐    ┌──────────────┐     │
   │  │   Qdrant     │◄──►│  pgvector    │     │
   │  │  (Primary)   │    │  (Secondary) │     │
   │  └──────────────┘    └──────────────┘     │
   │                                             │
   │  Gemma Embeddings ◄─► pgvector Embeddings │
   └────────────────┬────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │    Topology Synthesis & Ranking             │
   │                                             │
   │  - Normalize scores across sources         │
   │  - Merge duplicate results                 │
   │  - Create 4D graph representation          │
   │  - Compute confidence scores               │
   │  - Rank by relevance & recency             │
   └────────────────┬────────────────────────────┘
                    │
                    ▼
   ┌─────────────────────────────────────────────┐
   │      Result Ranking & Attribution          │
   │                                             │
   │  - Source attribution                      │
   │  - Confidence scores                       │
   │  - Temporal relevance                      │
   │  - Credibility ratings                     │
   └────────────────┬────────────────────────────┘
                    │
                    ▼
            ┌──────────────┐
            │ Final Results│
            │ (Ranked)     │
            └──────────────┘
```

## Components and Interfaces

### 1. Query Analyzer & Router

**Purpose**: Analyze incoming queries and determine optimal source routing strategy.

**Interface**:
```python
class QueryAnalyzer:
    def analyze_query(query: str) -> QueryProfile:
        """
        Returns:
        - intent: "legal", "general", "recent", "temporal"
        - entities: List of identified entities
        - temporal_refs: Temporal references if any
        - confidence_threshold: Minimum acceptable confidence
        - source_preferences: Ranked list of preferred sources
        """

    def route_query(profile: QueryProfile) -> RoutingStrategy:
        """
        Returns routing strategy with source selection and order
        """
```

### 2. Multi-Source Retrieval Layer

**Purpose**: Execute queries across multiple knowledge sources in parallel.

**Sources**:
- **RAG/KAG**: Legal document retrieval with knowledge graph augmentation
- **Wikipedia**: General knowledge via MediaWiki API
- **Google Search**: Current information via Custom Search API
- **4D Graph Topology**: Entity relationships with temporal and confidence dimensions
- **PostgreSQL Summaries**: Cached document summaries with pgvector embeddings
- **MinIO Documents**: Full document storage with metadata

**Interface**:
```python
class MultiSourceRetriever:
    async def retrieve_from_rag_kag(query: str) -> List[Result]
    async def retrieve_from_wikipedia(query: str) -> List[Result]
    async def retrieve_from_google(query: str) -> List[Result]
    async def retrieve_from_graph_topology(query: str) -> List[Result]
    async def retrieve_from_postgres_summaries(query: str) -> List[Result]
    async def retrieve_from_minio(query: str) -> List[Result]

    async def retrieve_multi_source(
        query: str,
        sources: List[str],
        parallel: bool = True
    ) -> Dict[str, List[Result]]
```

### 3. Vector Database Mirror Layer

**Purpose**: Maintain synchronized embeddings across Qdrant and pgvector for redundancy and performance.

**Interface**:
```python
class VectorMirror:
    async def store_embedding(
        embedding: List[float],
        metadata: Dict,
        embedding_type: str  # "gemma" or "pgvector"
    ) -> None:
        """Store in both Qdrant and pgvector"""

    async def search_embeddings(
        query_embedding: List[float],
        top_k: int = 10,
        fallback: bool = True
    ) -> List[Result]:
        """Search with automatic fallback"""

    async def sync_databases() -> SyncStatus:
        """Ensure consistency across mirrors"""
```

### 4. Topology Synthesis Engine

**Purpose**: Combine results from multiple sources into unified 4D knowledge graph.

**Interface**:
```python
class TopologySynthesis:
    def normalize_scores(
        results: Dict[str, List[Result]]
    ) -> Dict[str, List[Result]]:
        """Normalize scores across different sources"""

    def merge_duplicates(
        results: List[Result]
    ) -> List[Result]:
        """Merge duplicate results and combine confidence"""

    def create_4d_graph(
        results: List[Result]
    ) -> Graph4D:
        """Create 4D representation: (entity, relationship, temporal, confidence)"""

    def rank_results(
        results: List[Result],
        weights: Dict[str, float]
    ) -> List[Result]:
        """Rank by relevance, recency, source reliability"""
```

### 5. Fallback Chain Manager

**Purpose**: Handle source failures and gracefully degrade service.

**Interface**:
```python
class FallbackChainManager:
    def get_fallback_chain(
        primary_sources: List[str]
    ) -> List[str]:
        """Get ordered fallback chain"""

    async def execute_with_fallback(
        query: str,
        chain: List[str]
    ) -> Result:
        """Execute query with automatic fallback"""

    async def handle_source_failure(
        source: str,
        error: Exception
    ) -> None:
        """Remove source from chain and alert"""

    async def retrieve_cached_results(
        query: str
    ) -> Optional[Result]:
        """Get cached results from MinIO"""
```

## Data Models

### QueryProfile
```python
@dataclass
class QueryProfile:
    query: str
    intent: str  # "legal", "general", "recent", "temporal"
    entities: List[str]
    temporal_refs: Optional[List[str]]
    confidence_threshold: float
    source_preferences: List[str]
    timestamp: datetime
```

### Result
```python
@dataclass
class Result:
    content: str
    source: str
    relevance_score: float  # 0-1
    confidence_score: float  # 0-1
    recency_score: float  # 0-1 (1 = most recent)
    credibility_score: float  # 0-1
    timestamp: datetime
    metadata: Dict
    embedding: Optional[List[float]]
```

### Graph4D
```python
@dataclass
class Graph4D:
    entities: Dict[str, Entity]
    relationships: Dict[str, Relationship]
    temporal_edges: Dict[str, TemporalEdge]
    confidence_scores: Dict[str, float]

@dataclass
class Entity:
    id: str
    name: str
    type: str
    attributes: Dict

@dataclass
class Relationship:
    source_id: str
    target_id: str
    type: str
    strength: float

@dataclass
class TemporalEdge:
    relationship_id: str
    timestamp: datetime
    confidence: float
```

### RoutingStrategy
```python
@dataclass
class RoutingStrategy:
    primary_sources: List[str]
    secondary_sources: List[str]
    fallback_sources: List[str]
    parallel_execution: bool
    timeout_per_source: int  # seconds
    min_results_threshold: int
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Vector Mirror Consistency
*For any* embedding stored in the system, querying either Qdrant or pgvector should return identical results within a configurable sync window.
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 2: Source Fallback Completeness
*For any* query and any source failure, the system should automatically fall back to the next source in the chain without losing the query or returning an error to the user.
**Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

### Property 3: Result Deduplication
*For any* set of results from multiple sources, duplicate results should be merged with combined confidence scores, and the final result count should be less than or equal to the sum of individual source results.
**Validates: Requirements 8.3, 8.4**

### Property 4: Confidence-Based Routing
*For any* query with a given confidence threshold, the system should select sources such that the minimum confidence of returned results meets or exceeds the threshold.
**Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

### Property 5: 4D Graph Consistency
*For any* entity in the 4D graph, the temporal edges should be ordered chronologically, and confidence scores should be consistent with source reliability ratings.
**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 6: Source Attribution Round-Trip
*For any* result returned to the user, the source attribution should be traceable back to the original source, and retrieving the same query should return results with the same source attribution.
**Validates: Requirements 1.5, 8.5**

### Property 7: Wikipedia Content Persistence
*For any* Wikipedia article retrieved, storing it in MinIO and creating pgvector embeddings should allow retrieval of the same content via vector similarity search.
**Validates: Requirements 4.3, 4.4, 4.5**

### Property 8: Google Search Recency
*For any* Google Search result, the recency score should be inversely proportional to the age of the result, and more recent results should rank higher when recency is a factor.
**Validates: Requirements 5.2, 5.3, 5.5**

### Property 9: PostgreSQL Summary Accuracy
*For any* document stored with a summary in PostgreSQL, the summary should contain the key information from the original document, and vector similarity search should retrieve the summary when querying for related topics.
**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

### Property 10: MinIO Storage Durability
*For any* document stored in MinIO, it should be retrievable with identical content and metadata after storage, and version history should be maintained for all updates.
**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

## Error Handling

### Source Unavailability
- Automatically remove source from routing chain
- Log error with timestamp and reason
- Trigger fallback to next source
- Alert operators if multiple sources fail

### Vector Database Sync Failures
- Log sync error with affected records
- Continue serving from available database
- Trigger background sync retry
- Alert if sync lag exceeds threshold

### Embedding Generation Failures
- Fall back to keyword-based search
- Log error with query and source
- Retry with different embedding model if available
- Continue with degraded functionality

### Result Merging Conflicts
- Keep highest confidence score
- Preserve all source attributions
- Log conflict for analysis
- Return merged result with confidence caveat

## Testing Strategy

### Unit Testing
- Test QueryAnalyzer with various query types
- Test RoutingStrategy selection logic
- Test Result normalization and ranking
- Test 4D Graph construction
- Test Vector Mirror consistency checks

### Property-Based Testing
- Property 1: Vector Mirror Consistency - Generate random embeddings, store in both DBs, verify retrieval consistency
- Property 2: Source Fallback Completeness - Generate queries, simulate source failures, verify fallback execution
- Property 3: Result Deduplication - Generate duplicate results from multiple sources, verify merging
- Property 4: Confidence-Based Routing - Generate queries with various confidence thresholds, verify source selection
- Property 5: 4D Graph Consistency - Generate graph updates, verify temporal ordering and confidence consistency
- Property 6: Source Attribution Round-Trip - Generate results, verify source traceability
- Property 7: Wikipedia Content Persistence - Retrieve Wikipedia articles, store and search, verify retrieval
- Property 8: Google Search Recency - Generate results with various timestamps, verify recency scoring
- Property 9: PostgreSQL Summary Accuracy - Store documents with summaries, verify vector search retrieval
- Property 10: MinIO Storage Durability - Store documents, verify retrieval and version history

### Integration Testing
- Test multi-source retrieval with all sources available
- Test multi-source retrieval with sources failing sequentially
- Test vector database failover scenarios
- Test end-to-end query flow with result synthesis
- Test concurrent queries across multiple sources

### Performance Testing
- Measure query latency with different source combinations
- Measure vector database query performance
- Measure embedding generation throughput
- Measure result synthesis time
- Measure memory usage with large result sets


---

## ENHANCEMENT: Google Search + Citations + Gemma3 VLM + Image Search

### Enhanced Components

#### 1. Enhanced GoogleSearchRetriever
- Extract citations from search snippets
- Highlight cited passages
- Track source URLs and titles
- Generate citation embeddings
- Verify citation accessibility

#### 2. CitationManager
- Store citations in PostgreSQL
- Index citations in Qdrant
- Highlight citations in content
- Verify citation accuracy
- Build citation networks

#### 3. Gemma3VLMProcessor
- Process images with Gemma3 VLM
- Extract text from images (OCR)
- Identify objects and scenes
- Extract relationships
- Generate visual embeddings

#### 4. ImageSearcher
- Index images in Qdrant
- Search by text query
- Search by visual similarity
- Retrieve image metadata
- Rank by relevance

#### 5. VisualEvidenceExtractor
- Extract images from search results
- Extract images from documents
- Process with Gemma3 VLM
- Store in MinIO
- Index for search

#### 6. EnhancedTopologySynthesis
- Build citation networks
- Include visual evidence
- Add visual nodes to 4D graph
- Rank by evidence quality
- Combine text and visual results

### Enhanced Data Models

#### Citation
```python
@dataclass
class Citation:
    id: str
    text: str
    source_url: str
    source_title: str
    context_before: str
    context_after: str
    confidence: float
    timestamp: datetime
    highlighted: bool
```

#### ImageAnalysis
```python
@dataclass
class ImageAnalysis:
    image_id: str
    image_path: str
    extracted_text: str
    visual_objects: List[str]
    scene_description: str
    relationships: List[str]
    embedding: List[float]
    confidence: float
    timestamp: datetime
    source_url: Optional[str]
```

#### EnhancedResult
```python
@dataclass
class EnhancedResult(Result):
    citations: List[Citation]
    highlighted_content: str
    visual_evidence: List[ImageAnalysis]
    citation_network: Dict
    evidence_quality: float
```

### Enhanced Correctness Properties

#### Property 11: Citation Accuracy
*For any* search result with citations, the cited passages should accurately reflect the source content and be verifiable at the source URL.
**Validates: Requirements 11.1, 11.2, 11.4**

#### Property 12: Image Embedding Consistency
*For any* image processed with Gemma3 VLM, processing the same image should produce identical embeddings and visual analysis.
**Validates: Requirements 12.3, 13.3**

#### Property 13: Visual Search Relevance
*For any* image search query, visually similar images should rank higher than dissimilar images based on embedding distance.
**Validates: Requirements 13.1, 13.2, 13.3**

#### Property 14: Visual Evidence Completeness
*For any* document or search result, all extractable images should be processed and indexed for visual search.
**Validates: Requirements 14.1, 14.2, 14.3, 14.4**

#### Property 15: Citation Network Consistency
*For any* set of citations, the citation network should accurately represent source relationships and be queryable for citation paths.
**Validates: Requirements 15.1, 15.2, 15.3**

### Enhanced API Endpoints

#### Search with Citations
```
POST /api/search/with-citations
Query: string
Top K: integer
Response: {
  results: List[EnhancedResult],
  citations: List[Citation],
  highlighted_content: string
}
```

#### Image Search
```
POST /api/search/images
Query: string
Top K: integer
Response: {
  images: List[ImageSearchResult]
}
```

#### Visual Similarity Search
```
POST /api/search/visual-similarity
Image: file
Top K: integer
Response: {
  similar_images: List[ImageSearchResult]
}
```

### Enhanced Testing Strategy

#### New Property-Based Tests
- Property 11: Citation Accuracy
- Property 12: Image Embedding Consistency
- Property 13: Visual Search Relevance
- Property 14: Visual Evidence Completeness
- Property 15: Citation Network Consistency

#### New Integration Tests
- Test Google Search with citation extraction
- Test image indexing and retrieval
- Test visual similarity search
- Test citation network building
- Test end-to-end search with citations and images

### Implementation Tasks (Additional)

#### Task 6.5: Google Search with Citation Extraction
- Implement GoogleSearchRetriever
- Extract citations from snippets
- Highlight cited passages
- Generate citation embeddings

#### Task 6.6: Citation Management System
- Implement CitationManager
- Store citations in PostgreSQL
- Index in Qdrant
- Verify citations

#### Task 6.7: Gemma3 VLM Integration
- Implement Gemma3VLMProcessor
- Extract text from images
- Identify visual content
- Generate embeddings

#### Task 6.8: Image Search with Qdrant
- Implement ImageSearcher
- Index images in Qdrant
- Search by text and visual similarity
- Retrieve and rank results

#### Task 6.9: Visual Evidence Extraction
- Implement VisualEvidenceExtractor
- Extract images from results
- Process with Gemma3 VLM
- Store in MinIO

#### Task 10.5: Enhanced Topology Synthesis
- Extend TopologySynthesis
- Build citation networks
- Include visual evidence
- Add visual nodes to 4D graph

#### Task 17.5: Enhanced API Endpoints
- Add citation search endpoint
- Add image search endpoint
- Add visual similarity endpoint
- Add citation verification endpoint
