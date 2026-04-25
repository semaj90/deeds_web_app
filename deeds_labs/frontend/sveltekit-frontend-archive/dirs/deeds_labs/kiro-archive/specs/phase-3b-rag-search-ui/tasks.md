# Phase 3B: Evidence RAG Search UI - Implementation Plan

- [x] 1. Implement Search Service Backend



  - Create `backend/search_service.py` with SearchService class
  - Implement query embedding generation using Gemma-2b model
  - Implement Qdrant client initialization and connection pooling
  - Implement top-50 semantic search with filter support
  - Implement result retrieval from MinIO with metadata
  - Add latency tracking and logging
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. Implement Search Caching Layer
  - Create `backend/search_cache.py` with CacheManager class
  - Implement query hash computation for cache keys
  - Implement Redis cache storage with 24-hour TTL
  - Implement cache hit/miss tracking
  - Implement cache invalidation on new document uploads
  - Add cache statistics endpoint for monitoring
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 3. Implement Reranking Service
  - Create `backend/reranker_service.py` with RerankerService class
  - Load MiniLM-L6-v2 cross-encoder model from HuggingFace
  - Implement batch reranking (top-50 → top-5)
  - Implement cross-encoder scoring for query + candidate pairs
  - Implement result sorting by relevance score
  - Add latency monitoring and caching
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 4. Create Search API Endpoints
  - Create `backend/api/search_routes.py` with FastAPI routes
  - Implement `POST /api/search/evidence` endpoint
  - Implement `GET /api/search/results/{search_id}` endpoint
  - Implement `POST /api/search/rerank` endpoint
  - Implement `GET /api/search/stream/{search_id}` SSE endpoint
  - Add request validation and error handling
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2_

- [ ] 5. Implement Search Progress Streaming
  - Create `backend/search_events.py` with SearchEventEmitter class
  - Implement SSE event streaming for search progress
  - Emit events: embedding_complete, search_complete, reranking_complete, done
  - Implement event queue using Redis Streams
  - Add timestamp and progress tracking
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 6. Implement Search Filters
  - Update `backend/search_service.py` to support filters
  - Implement jurisdiction filter (query Qdrant with metadata filter)
  - Implement statute type filter
  - Implement date range filter
  - Implement filter combination logic (AND/OR)
  - Add filter validation
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 7. Create Search UI Page
  - Create `sveltekit-frontend/src/routes/search/+page.svelte`
  - Implement search bar with input validation
  - Implement filter panel (jurisdiction, statute, date range)
  - Implement results list view with pagination
  - Implement result detail panel
  - Add loading and error states
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 8. Implement Search Input Handling
  - Create `sveltekit-frontend/src/lib/services/searchService.ts`
  - Implement search query submission
  - Implement debounced search input (300ms)
  - Implement autocomplete suggestions
  - Implement filter state management
  - Add error handling and retry logic
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 9. Implement Search Results Display
  - Create `sveltekit-frontend/src/lib/components/SearchResults.svelte`
  - Implement results list rendering
  - Display rank, title, snippet, relevance score
  - Implement result selection and detail panel
  - Add pagination controls
  - Implement virtual scrolling for large result sets
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 10. Implement Result Detail Panel
  - Create `sveltekit-frontend/src/lib/components/ResultDetail.svelte`
  - Display full chunk text in serif font
  - Display metadata (page, doc_id, relevance score, bounding boxes)
  - Display related chunks from same document
  - Implement chunk navigation
  - Add statute reference linking
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 11. Implement Search Progress Streaming (Frontend)
  - Create `sveltekit-frontend/src/lib/services/searchStream.ts`
  - Implement SSE connection for search progress
  - Parse and display progress events
  - Update UI with real-time status
  - Implement error handling and reconnection
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 12. Create Evidence Board Page
  - Create `sveltekit-frontend/src/routes/evidence-board/+page.svelte`
  - Implement golden-ratio 3-column layout (22% / 55% / 23%)
  - Implement left sidebar (evidence list)
  - Implement center canvas (evidence cards)
  - Implement right rail (metadata and related evidence)
  - Add zoom controls (100%, +10%, -10%, reset)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 13. Implement Evidence Card Component
  - Create `sveltekit-frontend/src/lib/components/EvidenceCard.svelte`
  - Implement manila folder/polaroid shape styling
  - Implement status color strip (top)
  - Display title and snippet
  - Add hover effects (highlight related cards)
  - Implement click handler (open detail panel)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 14. Implement Evidence Connections
  - Create `sveltekit-frontend/src/lib/components/EvidenceConnections.svelte`
  - Implement dotted connection lines between related evidence
  - Implement line rendering using SVG
  - Add hover effects (stronger contrast)
  - Implement connection filtering (show/hide by type)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 15. Implement Evidence Board Zoom
  - Update `sveltekit-frontend/src/routes/evidence-board/+page.svelte`
  - Implement zoom controls (100%, +10%, -10%, reset)
  - Implement canvas scaling with CSS transform
  - Implement pan controls (drag to move)
  - Add keyboard shortcuts (Ctrl+, Ctrl-, Ctrl+0)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 16. Implement Search Error Handling
  - Update `backend/api/search_routes.py` with error handlers
  - Implement empty query validation
  - Implement query length validation (max 1000 chars)
  - Implement Qdrant unavailable handling
  - Implement embedding service failure handling
  - Implement reranking failure handling (graceful degradation)
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 17. Implement Search Performance Monitoring
  - Create `backend/search_metrics.py` with MetricsCollector class
  - Track embedding latency
  - Track Qdrant search latency
  - Track reranking latency
  - Track total search latency
  - Implement latency logging and alerting (warn if >500ms)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 18. Implement Search Analytics
  - Create `backend/search_analytics.py` with AnalyticsCollector class
  - Track search queries (anonymized)
  - Track search result clicks
  - Track filter usage
  - Track cache hit rate
  - Implement analytics dashboard endpoint
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ]* 19. Write Unit Tests for Search Service
  - Test query embedding generation
  - Test Qdrant search filtering
  - Test result retrieval from MinIO
  - Test cache hit/miss logic
  - Test error handling
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ]* 20. Write Unit Tests for Reranking Service
  - Test MiniLM model loading
  - Test batch reranking (top-50 → top-5)
  - Test cross-encoder scoring
  - Test result sorting
  - Test caching
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ]* 21. Write Integration Tests for Search Pipeline
  - Test end-to-end search (query → embedding → search → rerank)
  - Test cache invalidation on new uploads
  - Test filter application
  - Test progress streaming
  - Test error handling
  - _Requirements: 1.1, 2.1, 5.1, 6.1, 10.1_

- [ ]* 22. Write Performance Tests
  - Test search latency (<500ms new, <100ms cached)
  - Test embedding latency (<50ms)
  - Test Qdrant search latency (<100ms)
  - Test reranking latency (<50ms)
  - Test concurrent search handling (10+ simultaneous)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ]* 23. Write UI Tests for Search Page
  - Test search bar input and submission
  - Test filter selection and application
  - Test result display and detail panel
  - Test pagination
  - Test error messages
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 24. Write UI Tests for Evidence Board
  - Test golden-ratio layout rendering
  - Test evidence card display
  - Test connection line rendering
  - Test zoom controls
  - Test pan controls
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 25. Integrate Search with Evidence Upload
  - Update evidence upload workflow to trigger search indexing
  - Implement cache invalidation on new uploads
  - Add search availability check after upload completes
  - _Requirements: 1.1, 5.1_

- [ ] 26. Create Search Documentation
  - Create `docs/SEARCH_API.md` with API documentation
  - Document all endpoints with examples
  - Document filter syntax
  - Document error codes
  - Document performance characteristics
  - _Requirements: All_

- [ ] 27. Create Evidence Board Documentation
  - Create `docs/EVIDENCE_BOARD.md` with user guide
  - Document layout and controls
  - Document keyboard shortcuts
  - Document filtering and sorting
  - Document export options
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 28. Deploy Search Service
  - Build Docker image for search service
  - Configure environment variables
  - Deploy to production
  - Verify Qdrant connectivity
  - Verify Redis connectivity
  - Verify MinIO connectivity
  - _Requirements: All_

- [ ] 29. Deploy Frontend Updates
  - Build SvelteKit frontend
  - Deploy search page
  - Deploy evidence board page
  - Verify API connectivity
  - Test end-to-end search
  - _Requirements: All_

- [ ] 30. Implement Search Monitoring Dashboard
  - Create `sveltekit-frontend/src/routes/admin/search-metrics/+page.svelte`
  - Display search latency metrics (real-time)
  - Display cache hit rate
  - Display search volume
  - Display error rate
  - Add alerting configuration
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
