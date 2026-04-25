# Legal Agentic Alignment + Search Router - Implementation Plan

- [x] 1. Backend: AlignmentRouter + /api/search Implementation




  - [ ] 1.1 Create backend/api/search_api.py with AlignmentRouter class
    - Implement dynamic lexicon management (seed + global + user-specific)
    - Implement signal extraction (_negativity_score, _legal_score, _kag_match_score)
    - Implement intent classification and route decision logic
    - Implement per-user metrics tracking in Redis
    - Implement learn_from_chat hook for Granite sentiment analysis

    - _Requirements: 1, 2, 3, 4, 5, 12, 14_

  - [ ] 1.2 Implement /api/search endpoint in search_api.py
    - Accept SearchRequest (query, user_id, case_id, limit, include_kag, include_reasoning, mode)
    - Embed query via EmbeddingClient (Ollama + embeddinggemma, Redis-cached)
    - Run AlignmentRouter.plan() to extract signals and decide route
    - Query Qdrant for semantic search results
    - Optionally enrich chunks with KAG context from Neo4j
    - Optionally invoke Granite for reasoning summary
    - Update manifold usage heat in Redis

    - Return SearchResponse with chunks + alignment signals
    - _Requirements: 6, 7, 8, 9, 10, 15_

  - [ ] 1.3 Implement KAG context fetching helper
    - Query Neo4j for local neighborhood around case_id

    - Return nodes and edges for KAG context enrichment
    - Cache results per-request to avoid duplicate queries
    - _Requirements: 7_

  - [x] 1.4 Implement manifold usage heat tracking

    - Create _update_manifold_usage helper function
    - Compute heat from on_task_score + calm (1 - negativity_score)
    - Store in Redis with key manifold-usage:{case_id}:{chunk_index}
    - _Requirements: 13_


  - [ ] 1.5 Create backend/api/main.py to mount both routers
    - Import similarity_api router and search_api router


    - Create FastAPI app and include both routers

    - _Requirements: 13_

  - [ ] 1.6 Update backend requirements and environment configuration
    - Ensure all dependencies are in requirements-legal-ingestion.txt
    - Verify environment variables (QDRANT_HOST, NEO4J_URI, REDIS_URL, etc.)
    - _Requirements: 13_


- [ ] 2. Frontend: SvelteKit Integration
  - [ ] 2.1 Create SvelteKit /api/search proxy route
    - Create sveltekit-frontend/src/routes/api/search/+server.ts

    - Proxy POST requests to backend /api/search
    - Attach user_id from session/locals if available
    - Return SearchResponse to frontend
    - _Requirements: 6_

  - [x] 2.2 Create search store for state management

    - Create src/lib/stores/search.ts with writable stores
    - Store searchResults, searchAlignment, searchReasoning, searchLoading
    - _Requirements: 9_

  - [ ] 2.3 Implement search UI component with alignment HUD
    - Create search input + button
    - Display alignment signals (intent, route_decision, on_task_score)
    - Display reasoning summary if available
    - Show web_search_suggested indicator
    - _Requirements: 9, 14_

  - [ ] 2.4 Integrate search results into Memory Palace visualization
    - Render search result chunks with metadata
    - Display KAG context if available
    - Show chunk scores and section types
    - _Requirements: 10_

- [ ] 3. Chat Integration: Learn from User Messages
  - [ ] 3.1 Wire chat backend to call learn_from_chat
    - Identify where user messages are processed in chat backend
    - Call alignment_router.learn_from_chat(user_id, message_text) after each message
    - Handle errors gracefully (fail-soft)
    - _Requirements: 12, 14_

  - [ ] 3.2 Implement Granite sentiment classifier (optional hook)
    - Define Granite prompt for sentiment classification + token extraction
    - Implement GraniteClient.classify_sentiment_and_tokens(text)
    - Return {"sentiment": "negative"|"neutral"|"positive", "negative_tokens": [...]}
    - _Requirements: 12_

- [ ] 4. Topology Integration: CH-ROM97 Heat Updates
  - [ ] 4.1 Update manifold export script to read Redis heat
    - In Python export script (e.g., export_to_chr97.py), query Redis for each chunk
    - Retrieve manifold-usage:{case_id}:{chunk_index} heat values
    - Include heat in topology JSON export
    - _Requirements: 13_

  - [ ] 4.2 Update chr97.mjs to adjust 4D coordinates by heat
    - Read heat from topology JSON
    - Adjust t-dimension: t' = t + alpha * tanh(heat)
    - Store adjusted_manifold in output
    - _Requirements: 13_

  - [ ] 4.3 Update SvelteKit 3D scene to use heat for visualization
    - Color tiles by heat (hot = frequently-consulted chunks)
    - Sort suggestions by heat (most-used legal chunks first)
    - Display heat as visual indicator in Memory Palace
    - _Requirements: 13_

- [ ] 5. Testing & Validation
  - [ ]* 5.1 Write unit tests for AlignmentRouter
    - Test signal extraction (_negativity_score, _legal_score, _kag_match_score)
    - Test dynamic lexicon loading and user-specific words
    - Test intent classification and route decision logic
    - Test metrics tracking and rolling averages
    - _Requirements: 1, 2, 3, 4, 5_

  - [ ]* 5.2 Write integration tests for /api/search endpoint
    - Test end-to-end search flow (embed → route → search → enrich → return)
    - Test KAG enrichment with Neo4j
    - Test Granite reasoning summary generation
    - Test manifold heat updates
    - _Requirements: 6, 7, 8, 9, 10_

  - [ ]* 5.3 Write property-based tests for alignment signals
    - Property: negativity_score and legal_score always in [0, 1]
    - Property: route_decision always one of valid routes
    - Property: metrics monotonicity (search_count increases, averages converge)
    - Property: heat accumulation (never decreases)
    - _Requirements: 1, 2, 3, 4, 5_

  - [ ]* 5.4 Write performance tests
    - Measure /api/search latency (target < 500ms p95)
    - Measure throughput with concurrent requests
    - Measure Redis cache hit rate for embeddings
    - Measure lexicon refresh performance
    - _Requirements: 15_

  - [ ]* 5.5 Write integration tests for chat learning
    - Test learn_from_chat updates user lexicon in Redis
    - Test Granite sentiment classification
    - Test that learned words affect negativity_score in subsequent searches
    - _Requirements: 12, 14_

- [ ] 6. Documentation & Integration Guide
  - [ ] 6.1 Update LEGAL_COMPLAINT_INGESTION_GUIDE.md
    - Add "Agentic Alignment + Search Router" section
    - Document /api/search endpoint and AlignmentRouter
    - Document Redis metrics and heat tracking
    - Document CH-ROM97 topology integration
    - _Requirements: 13_

  - [ ] 6.2 Update legal-search-system spec (requirements.md + design.md)
    - Add Agentic Alignment Router as new feature
    - Document signal extraction and route decision logic
    - Document per-user metrics and learning
    - Document manifold heat integration
    - _Requirements: 13_

  - [ ] 6.3 Create API documentation for /api/search
    - Document request/response models
    - Document alignment signals and their meanings
    - Document error handling and fail-soft behavior
    - Provide example requests and responses
    - _Requirements: 6, 9_

- [ ] 7. Checkpoint: Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Deployment & Phase Container Integration
  - [ ] 8.1 Update Phase container startup scripts
    - Ensure backend container runs uvicorn backend.api.main:app
    - Verify all environment variables are set
    - Verify Redis, Neo4j, Qdrant, Ollama are accessible
    - _Requirements: 13_

  - [ ] 8.2 Create deployment checklist
    - Verify all Phase containers are running
    - Verify /api/search endpoint is accessible
    - Verify alignment signals are being tracked in Redis
    - Verify manifold heat is being updated
    - _Requirements: 13_

- [ ] 9. Final Checkpoint: Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
