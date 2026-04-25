# Enhancement Specification: Google Search + Citations + Gemma3 VLM + Image Search

## Overview

This enhancement extends the multi-source retrieval topology with:
1. **Google Search Integration** with citation highlighting
2. **Citation Management** system for tracking sources
3. **Gemma3 VLM** for multimodal image understanding
4. **Image Search** with Qdrant vector database
5. **Visual Evidence** extraction and storage

## 1. Google Search with Citation Highlighting

### 1.1 Enhanced GoogleSearchRetriever

```python
class GoogleSearchRetriever(BaseRetriever):
    async def retrieve(self, query: str, top_k: int = 10) -> List[Result]:
        # Search Google
        # Extract snippets with citation markers
        # Highlight cited passages
        # Return results with citation metadata
        pass

    async def extract_citations(self, snippet: str, url: str) -> List[Citation]:
        # Parse snippet for quoted passages
        # Extract citation context
        # Create citation objects with source tracking
        pass
```

### 1.2 Citation Data Model

```python
@dataclass
class Citation:
    id: str
    text: str  # Quoted passage
    source_url: str
    source_title: str
    context_before: str
    context_after: str
    confidence: float
    timestamp: datetime
    highlighted: bool = True
```

### 1.3 Result with Citations

```python
@dataclass
class ResultWithCitations(Result):
    citations: List[Citation]
    highlighted_content: str  # HTML with highlighted citations
    citation_count: int
    citation_confidence: float
```

## 2. Citation Management System

### 2.1 CitationManager

```python
class CitationManager:
    async def save_citation(self, citation: Citation) -> str:
        # Store in PostgreSQL
        # Index in Qdrant
        # Return citation ID
        pass

    async def get_citations_for_result(self, result_id: str) -> List[Citation]:
        # Retrieve all citations for a result
        pass

    async def highlight_citations(self, content: str, citations: List[Citation]) -> str:
        # Generate HTML with highlighted citations
        # Add citation markers and links
        pass

    async def verify_citation(self, citation: Citation) -> bool:
        # Verify citation still exists at source
        # Check URL accessibility
        # Validate quote accuracy
        pass
```

### 2.2 Citation Storage

```sql
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

## 3. Gemma3 VLM Integration

### 3.1 Gemma3VLMProcessor

```python
class Gemma3VLMProcessor:
    async def process_image(self, image_path: str) -> ImageAnalysis:
        # Load image
        # Process with Gemma3 VLM
        # Extract text, objects, relationships
        # Generate embeddings
        # Return analysis
        pass

    async def extract_text_from_image(self, image_path: str) -> str:
        # Use Gemma3 VLM for OCR
        # Extract all visible text
        # Preserve layout information
        pass

    async def analyze_visual_content(self, image_path: str) -> VisualAnalysis:
        # Identify objects, people, scenes
        # Extract relationships
        # Generate descriptions
        # Create embeddings
        pass
```

### 3.2 Image Analysis Data Model

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

## 4. Image Search with Qdrant

### 4.1 ImageSearcher

```python
class ImageSearcher:
    async def index_image(self, image_analysis: ImageAnalysis) -> str:
        # Store image metadata in PostgreSQL
        # Store image file in MinIO
        # Store embedding in Qdrant
        # Return image ID
        pass

    async def search_images(
        self,
        query: str,
        top_k: int = 10
    ) -> List[ImageSearchResult]:
        # Generate query embedding
        # Search Qdrant for similar images
        # Retrieve image metadata
        # Return results with images
        pass

    async def search_by_visual_similarity(
        self,
        image_path: str,
        top_k: int = 10
    ) -> List[ImageSearchResult]:
        # Generate embedding for query image
        # Search Qdrant for similar images
        # Return results
        pass
```

### 4.2 Image Storage

```sql
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

## 5. Integration with Multi-Source Retrieval

### 5.1 Enhanced QueryAnalyzer

```python
class EnhancedQueryAnalyzer(QueryAnalyzer):
    async def analyze_query(self, query: str) -> EnhancedQueryProfile:
        profile = await super().analyze_query(query)

        # Detect if query requires visual search
        profile.requires_visual_search = self._detect_visual_intent(query)

        # Detect if query requires citation tracking
        profile.requires_citations = self._detect_citation_intent(query)

        return profile
```

### 5.2 Enhanced RoutingStrategy

```python
@dataclass
class EnhancedRoutingStrategy(RoutingStrategy):
    include_google_search: bool = True
    track_citations: bool = True
    search_images: bool = False
    vlm_analysis: bool = False
    image_confidence_threshold: float = 0.7
```

### 5.3 Enhanced MultiSourceRetriever

```python
class EnhancedMultiSourceRetriever(MultiSourceRetriever):
    async def retrieve_multi_source(
        self,
        query: str,
        sources: List[str],
        strategy: EnhancedRoutingStrategy
    ) -> EnhancedRetrievalResults:
        results = await super().retrieve_multi_source(query, sources)

        # Add Google Search with citations
        if strategy.include_google_search:
            google_results = await self.google_retriever.retrieve(query)
            results['google'] = google_results

        # Track citations
        if strategy.track_citations:
            for result in results.values():
                if hasattr(result, 'citations'):
                    await self.citation_manager.save_citations(result.citations)

        # Search images
        if strategy.search_images:
            image_results = await self.image_searcher.search_images(query)
            results['images'] = image_results

        return results
```

## 6. Visual Evidence Extraction

### 6.1 VisualEvidenceExtractor

```python
class VisualEvidenceExtractor:
    async def extract_from_search_results(
        self,
        results: List[Result]
    ) -> List[ImageAnalysis]:
        # Download images from search results
        # Process with Gemma3 VLM
        # Extract text and visual content
        # Generate embeddings
        # Store in system
        pass

    async def extract_from_documents(
        self,
        document_path: str
    ) -> List[ImageAnalysis]:
        # Extract images from PDF/document
        # Process with Gemma3 VLM
        # Extract text and visual content
        # Generate embeddings
        # Store in system
        pass
```

## 7. Enhanced Result Synthesis

### 7.1 EnhancedTopologySynthesis

```python
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

        # Create unified 4D graph with visual nodes
        synthesized.graph_4d = self._add_visual_nodes_to_graph(
            synthesized.graph_4d,
            images
        )

        return synthesized
```

## 8. API Endpoints

### 8.1 Search with Citations

```python
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
```

### 8.2 Image Search

```python
@app.post("/api/search/images")
async def search_images(query: str, top_k: int = 10):
    """Search for images related to query"""
    results = await image_searcher.search_images(query, top_k)
    return {"images": results}
```

### 8.3 Visual Similarity Search

```python
@app.post("/api/search/visual-similarity")
async def search_visual_similarity(image_file: UploadFile):
    """Search for visually similar images"""
    image_path = await save_upload(image_file)
    results = await image_searcher.search_by_visual_similarity(image_path)
    return {"similar_images": results}
```

## 9. Implementation Tasks

### New Tasks to Add

- Task 6.5: Implement Google Search with citation extraction
- Task 6.6: Implement CitationManager and storage
- Task 6.7: Implement Gemma3 VLM integration
- Task 6.8: Implement ImageSearcher with Qdrant
- Task 6.9: Implement VisualEvidenceExtractor
- Task 10.5: Enhance TopologySynthesis with visual evidence
- Task 17.5: Add citation and image search endpoints

## 10. Testing Strategy

### Property-Based Tests

- Property 11: Citation Accuracy - Citations accurately reflect source content
- Property 12: Image Embedding Consistency - Same image produces same embedding
- Property 13: Visual Search Relevance - Similar images rank higher
- Property 14: Citation Verification - Verified citations remain accessible

### Integration Tests

- Test Google Search with citation extraction
- Test image indexing and retrieval
- Test visual similarity search
- Test citation network building
- Test end-to-end search with citations and images

## 11. Performance Considerations

### Optimization

- Cache image embeddings
- Batch process images
- Parallel citation verification
- Lazy load images in results
- Compress stored images

### Scalability

- Partition images by date
- Archive old images
- Implement image cleanup policies
- Use CDN for image delivery

## 12. Security Considerations

- Validate image sources
- Scan images for malware
- Verify citation URLs
- Rate limit image uploads
- Implement access controls
