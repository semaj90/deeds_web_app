# Implementation Plan: Multi-Source Retrieval Topology

- [x] 1. Set up project structure and core interfaces




  - Create directory structure: `backend/services/retrieval/` with subdirectories for each component
  - Define base interfaces and data models in `backend/services/retrieval/models.py`
  - Set up configuration management for API keys (Google, Wikipedia, etc.)
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1_

- [ ] 2. Implement Query Analyzer & Router
  - Create `QueryAnalyzer` class with intent detection (legal, general, recent, temporal)
  - Implement entity extraction using NER or keyword matching
  - Implement temporal reference detection
  - Create `RoutingStrategy` generator based on query profile
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2.1 Write property test for query analysis
  - **Property 1.1: Query Intent Detection**
  - **Validates: Requirements 1.1**

- [ ] 3. Implement Multi-Source Retrieval Layer
  - Create `MultiSourceRetriever` base class with async retrieval methods
  - Implement RAG/KAG retriever integration with existing legal_rag_plus_kag service
  - Implement Wikipedia retriever using MediaWiki API
  - Implement Google Search retriever using Custom Search API
  - Implement 4D Graph Topology retriever
  - Implement PostgreSQL summaries retriever
  - Implement MinIO document retriever
  - _Requirements: 1.5, 3.1, 4.1, 5.1, 6.1, 7.1_

- [ ] 3.1 Write property test for multi-source retrieval
  - **Property 1.5: Multi-Source Result Retrieval**
  - **Validates: Requirements 1.5**

- [ ] 4. Implement Vector Database Mirror Layer
  - Create `VectorMirror` class for Qdrant and pgvector synchronization
  - Implement embedding storage in both Qdrant and pgvector
  - Implement search with automatic fallback between databases
  - Implement sync verification and consistency checks
  - Create background sync job for maintaining consistency
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 4.1 Write property test for vector mirror consistency
  - **Property 3.5: Vector Mirror Consistency**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [ ] 5. Implement Wikipedia Integration
  - Create `WikipediaRetriever` class using MediaWiki API
  - Implement content extraction and section parsing
  - Implement MinIO storage for Wikipedia articles
  - Implement pgvector embedding creation for Wikipedia content
  - Add source attribution and confidence scoring
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 5.1 Write property test for Wikipedia persistence
  - **Property 7: Wikipedia Content Persistence**
  - **Validates: Requirements 4.3, 4.4, 4.5**

- [ ] 6. Implement Google Search Integration
  - Create `GoogleSearchRetriever` class using Custom Search API
  - Implement snippet and full content extraction
  - Implement MinIO storage with timestamps
  - Implement Gemma embedding creation for Google results
  - Add recency scoring and credibility ratings
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 6.1 Write property test for Google search recency
  - **Property 8: Google Search Recency Scoring**
  - **Validates: Requirements 5.2, 5.3, 5.5**

- [ ] 7. Implement 4D Graph Topology
  - Create `Graph4D` data structure with entity, relationship, temporal, and confidence dimensions
  - Implement graph node and edge creation
  - Implement graph querying with multi-dimensional filtering
  - Implement confidence-based edge marking
  - Implement temporal ordering for results
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 7.1 Write property test for 4D graph consistency
  - **Property 5: 4D Graph Consistency**
  - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [ ] 8. Implement PostgreSQL Summary Storage
  - Create `PostgreSQLSummaryStore` class for document summaries
  - Implement summary generation using existing Gemma service
  - Implement pgvector embedding creation for summaries
  - Implement vector similarity search for summaries
  - Implement full document retrieval from MinIO
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 8.1 Write property test for PostgreSQL summary accuracy
  - **Property 9: PostgreSQL Summary Accuracy**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [ ] 9. Implement MinIO Document Storage Integration
  - Create `MinIODocumentStore` class for centralized document storage
  - Implement document storage with structured metadata
  - Implement PostgreSQL record creation with summaries
  - Implement document retrieval based on PostgreSQL search
  - Implement version history tracking
  - Implement LRU eviction based on access patterns
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 9.1 Write property test for MinIO storage durability
  - **Property 10: MinIO Storage Durability**
  - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [ ] 10. Implement Topology Synthesis Engine
  - Create `TopologySynthesis` class for result synthesis
  - Implement score normalization across sources
  - Implement duplicate result merging with confidence combination
  - Implement 4D graph representation creation
  - Implement result ranking by relevance, recency, and source reliability
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 10.1 Write property test for result deduplication
  - **Property 3: Result Deduplication**
  - **Validates: Requirements 8.3, 8.4**

- [ ] 11. Implement Fallback Chain Manager
  - Create `FallbackChainManager` class for source failure handling
  - Implement fallback chain generation based on source availability
  - Implement query execution with automatic fallback
  - Implement source failure detection and removal
  - Implement cached result retrieval from MinIO
  - Implement source recovery and re-integration
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 11.1 Write property test for source fallback
  - **Property 2: Source Fallback Completeness**
  - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

- [ ] 12. Implement Confidence-Based Source Selection
  - Create `ConfidenceRouter` class for confidence-based routing
  - Implement high-confidence routing (>0.8) - primary sources only
  - Implement medium-confidence routing (0.5-0.8) - secondary sources for verification
  - Implement low-confidence routing (<0.5) - multi-source retrieval and web search
  - Implement confidence increase optimization
  - Implement default comprehensive retrieval for unknown confidence
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 12.1 Write property test for confidence-based routing
  - **Property 4: Confidence-Based Routing**
  - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

- [ ] 13. Integrate with ACE Orchestrator
  - Update `AceOrchestrator` to use `MultiSourceRetriever` instead of single sources
  - Integrate `ConfidenceRouter` for dynamic source selection
  - Integrate `TopologySynthesis` for result synthesis
  - Integrate `FallbackChainManager` for error handling
  - Update signal building to include multi-source context
  - _Requirements: 1.1, 1.5, 8.5, 9.1, 10.1_

- [ ] 14. Implement Error Handling and Monitoring
  - Create error handlers for source unavailability
  - Implement vector database sync failure handling
  - Implement embedding generation failure handling
  - Implement result merging conflict handling
  - Create monitoring and alerting for source failures
  - Create logging for all retrieval operations
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Create integration tests
  - Test multi-source retrieval with all sources available
  - Test multi-source retrieval with sources failing sequentially
  - Test vector database failover scenarios
  - Test end-to-end query flow with result synthesis
  - Test concurrent queries across multiple sources
  - _Requirements: 1.1, 1.5, 3.5, 8.5, 9.1_

- [ ] 16.1 Write integration test for multi-source retrieval
  - Test all sources working together
  - Verify result synthesis and ranking
  - Verify source attribution

- [ ] 16.2 Write integration test for source failover
  - Test sequential source failures
  - Verify fallback chain execution
  - Verify cached result retrieval

- [ ] 16.3 Write integration test for vector database failover
  - Test Qdrant unavailability
  - Test pgvector unavailability
  - Verify automatic failover

- [ ] 17. Create API endpoints for multi-source retrieval
  - Create `/api/retrieve/multi-source` endpoint
  - Create `/api/retrieve/with-confidence` endpoint
  - Create `/api/graph/query` endpoint for 4D graph queries
  - Create `/api/sources/status` endpoint for source health
  - Create `/api/cache/clear` endpoint for cache management
  - _Requirements: 1.1, 1.5, 2.2, 9.1_

- [ ] 18. Create documentation and examples
  - Create API documentation for all endpoints
  - Create usage examples for each retrieval strategy
  - Create troubleshooting guide for common issues
  - Create performance tuning guide
  - _Requirements: All_

- [ ] 19. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


---

## ENHANCEMENT TASKS: Google Search + Citations + Gemma3 VLM + Image Search

- [ ] 6.5 Implement Google Search with Citation Extraction
  - Create `GoogleSearchRetriever` class using Custom Search API
  - Implement citation extraction from search snippets
  - Highlight cited passages in results
  - Generate embeddings for citations
  - Store citations with metadata
  - _Requirements: 11.1, 11.2, 11.3_

- [ ] 6.6 Write property test for citation accuracy
  - **Property 11: Citation Accuracy**
  - **Validates: Requirements 11.1, 11.2, 11.4**

- [ ] 6.7 Implement Citation Management System
  - Create `CitationManager` class
  - Implement PostgreSQL storage for citations
  - Implement Qdrant indexing for citations
  - Implement citation verification
  - Implement citation highlighting
  - _Requirements: 11.2, 11.3, 11.4, 11.5_

- [ ] 6.8 Implement Gemma3 VLM Integration
  - Create `Gemma3VLMProcessor` class
  - Implement image text extraction (OCR)
  - Implement visual object detection
  - Implement scene understanding
  - Generate visual embeddings
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 6.9 Write property test for image embedding consistency
  - **Property 12: Image Embedding Consistency**
  - **Validates: Requirements 12.3, 13.3**

- [ ] 7.0 Implement Image Search with Qdrant
  - Create `ImageSearcher` class
  - Implement image indexing in Qdrant
  - Implement text-based image search
  - Implement visual similarity search
  - Implement result ranking
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 7.1 Write property test for visual search relevance
  - **Property 13: Visual Search Relevance**
  - **Validates: Requirements 13.1, 13.2, 13.3**

- [ ] 7.2 Implement Visual Evidence Extraction
  - Create `VisualEvidenceExtractor` class
  - Implement image extraction from search results
  - Implement image extraction from documents
  - Process images with Gemma3 VLM
  - Store in MinIO with metadata
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 7.3 Write property test for visual evidence completeness
  - **Property 14: Visual Evidence Completeness**
  - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**

- [ ] 10.5 Enhance Topology Synthesis with Visual Evidence
  - Extend `TopologySynthesis` class
  - Implement citation network building
  - Implement visual evidence integration
  - Add visual nodes to 4D graph
  - Rank by evidence quality
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 10.6 Write property test for citation network consistency
  - **Property 15: Citation Network Consistency**
  - **Validates: Requirements 15.1, 15.2, 15.3**

- [ ] 17.5 Create Enhanced API Endpoints
  - Create `/api/search/with-citations` endpoint
  - Create `/api/search/images` endpoint
  - Create `/api/search/visual-similarity` endpoint
  - Create `/api/citations/verify` endpoint
  - Create `/api/citations/network` endpoint
  - _Requirements: 11.5, 13.4, 14.5, 15.5_

- [ ] 18.5 Create Enhancement Documentation
  - Document citation system
  - Document image search
  - Document Gemma3 VLM integration
  - Create usage examples
  - Create troubleshooting guide
  - _Requirements: All enhancement requirements_

- [ ] 19.5 Final Enhancement Checkpoint
  - Ensure all enhancement tests pass
  - Verify all properties
  - Test end-to-end workflows
  - Ask the user if questions arise
