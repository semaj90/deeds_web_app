# Implementation Plan

## Phase 1: Core Infrastructure

- [x] 1. Set up project structure and core interfaces
  - [x] 1.1 Create `src/lib/services/knowledge-search/` directory structure
    - Create types.ts with all TypeScript interfaces
    - Create index.ts barrel export
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 1.2 Write property test for embedding dimension
    - **Property 1: Embedding Dimension Consistency**
    - **Validates: Requirements 1.1, 4.4**
  - [x] 1.3 Create KnowledgeIndexer service skeleton
    - Implement indexDocument(), indexBatch(), deleteDocument()
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Implement TF-IDF Ranker
  - [x] 2.1 Create TfIdfRanker class
    - Implement computeTf() for term frequency
    - Implement computeIdf() with log(N/df) formula
    - Implement score() for query-document scoring
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 2.2 Write property test for TF-IDF formula
    - **Property 5: TF-IDF Formula Correctness**
    - **Validates: Requirements 3.2**
  - [x] 2.3 Write property test for hybrid score calculation
    - **Property 6: Hybrid Score Calculation**
    - **Validates: Requirements 3.3**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 2: Storage Layer Integration

- [x] 4. Implement Qdrant integration
  - [x] 4.1 Create QdrantKnowledgeStore class
    - Implement upsertDocument() with 768-dim vectors
    - Implement search() with cosine similarity
    - Implement getDocument() by ID
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 4.2 Write property test for search result ordering
    - **Property 2: Search Results Ordering**
    - **Validates: Requirements 1.3, 3.3**
  - [x] 4.3 Write property test for result schema completeness
    - **Property 3: Search Result Schema Completeness**
    - **Validates: Requirements 1.4, 3.4**

- [x] 5. Implement PostgreSQL + pgvector integration
  - [x] 5.1 Create database migration for knowledge_documents table
    - Add pgvector extension if not exists
    - Create table with embedding vector(768) column
    - Create IVFFlat index for cosine similarity
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 5.2 Create PostgresKnowledgeStore class
    - Implement hybrid search with SQL filters
    - Implement fallback to Qdrant when unavailable
    - _Requirements: 4.2, 4.5_
  - [x] 5.3 Write property test for PostgreSQL-Qdrant parity
    - **Property 12: PostgreSQL-Qdrant Embedding Parity**
    - **Validates: Requirements 4.4**

- [x] 6. Implement MinIO storage
  - [x] 6.1 Create MinioKnowledgeStore class
    - Implement storeDocument() with key format {collection}/{url_hash}.md
    - Implement getDocument() to fetch full content
    - Implement chunking for content > 100KB
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
  - [x] 6.2 Write property test for MinIO key format
    - **Property 9: MinIO Object Key Format**
    - **Validates: Requirements 5.2**
  - [x] 6.3 Write property test for storage round-trip
    - **Property 4: Summary Generation and Storage Round-Trip**
    - **Validates: Requirements 2.3, 5.3**

- [x] 7. Implement Redis caching
  - [x] 7.1 Create RedisCacheService class
    - Implement cacheSearchResults() with 1hr TTL
    - Implement getCachedResults() with cache hit detection
    - Implement invalidateCache() for kb:search:* keys
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 7.2 Write property test for cache key format
    - **Property 7: Redis Cache Key Format**
    - **Validates: Requirements 6.2**
  - [x] 7.3 Write property test for cache hit behavior
    - **Property 8: Cache Hit Behavior**
    - **Validates: Requirements 6.3**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: Search and Synthesis

- [x] 9. Implement KnowledgeSearcher
  - [x] 9.1 Create KnowledgeSearcher class
    - Implement search() with Qdrant + TF-IDF hybrid ranking
    - Implement getDocument() with MinIO content fetch
    - Implement getStats() for collection statistics
    - _Requirements: 1.2, 1.3, 3.3, 3.4_
  - [x] 9.2 Implement LLM synthesis integration
    - Add synthesize option to search
    - Inject top-K results as context
    - Support multiple LLM providers (ollama, gemini, claude)
    - _Requirements: 2.1_
  - [x] 9.3 Write property test for LLM context injection
    - **Property 16: LLM Synthesis Context Injection**
    - **Validates: Requirements 2.1**

- [x] 10. Implement auto-tagging
  - [x] 10.1 Create TagExtractor class
    - Parse entities field for technologies, frameworks, languages
    - Fallback to URL domain when no entities
    - Store tags in Qdrant payload
    - _Requirements: 9.1, 9.2, 9.3, 9.5_
  - [x] 10.2 Write property test for tag extraction and filtering
    - **Property 10: Tag Extraction and Filtering**
    - **Validates: Requirements 9.1, 9.3, 9.4**

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 4: API Layer

- [x] 12. Create REST API endpoints
  - [x] 12.1 Create POST /api/knowledge/search endpoint
    - Accept query, topK, filters, synthesize options
    - Return ranked results with scores
    - _Requirements: 8.1_
  - [x] 12.2 Write property test for API response schema
    - **Property 11: API Response Schema Validation**
    - **Validates: Requirements 8.1**
  - [x] 12.3 Create GET /api/knowledge/document/:id endpoint
    - Fetch full content from MinIO
    - Return complete document with metadata
    - _Requirements: 8.2_
  - [x] 12.4 Create GET /api/knowledge/stats endpoint
    - Return collection statistics from all stores
    - _Requirements: 8.3_

- [x] 13. Implement FastMCP server
  - [x] 13.1 Create phase76-mcp-server.mjs
    - Register knowledge-search tool
    - Implement qdrant_search, postgres_query, minio_fetch, redis_cache tools
    - Start on port 3002
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 13.2 Add MCP tool to ACE agent
    - Update phase76-ace-prompt-engineer.mjs to use MCP tools
    - Implement fallback to HTTP API when MCP unavailable
    - _Requirements: 7.4_

- [ ] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 5: A2A/ACP Integration

- [ ] 15. Implement A2A Protocol Handler
  - [ ] 15.1 Create A2AProtocolHandler class
    - Implement register() for agent registration
    - Implement discoverAgents() by capability
    - Implement delegateTask() for task delegation
    - _Requirements: 7.1_
  - [ ]* 15.2 Write property test for A2A registration
    - **Property 13: A2A Agent Registration**
    - **Validates: Requirements 7.1**
  - [ ]* 15.3 Write property test for A2A task delegation
    - **Property 17: A2A Task Delegation Round-Trip**
    - **Validates: Requirements 7.3**

- [ ] 16. Implement ACP Tool Registry
  - [ ] 16.1 Create ACPToolRegistry class
    - Register 6 built-in tools
    - Implement listTools(), getTool(), executeTool()
    - Generate OpenAPI spec for tools
    - _Requirements: 7.2_
  - [ ]* 16.2 Write property test for ACP schema validation
    - **Property 14: ACP Tool Schema Validation**
    - **Validates: Requirements 7.2**

- [ ] 17. Implement Web Search Agent
  - [ ] 17.1 Create WebSearchAgent class
    - Implement search() with site filtering
    - Implement fetchAndProcess() for URL scraping
    - Auto-index results when indexResults=true
    - _Requirements: 2.1_
  - [ ]* 17.2 Write property test for web search indexing
    - **Property 15: Web Search Result Indexing**
    - **Validates: Requirements 2.1, 1.1**

- [ ] 18. Create A2A/ACP API endpoints
  - [ ] 18.1 Create POST /api/knowledge/web-search endpoint
    - Accept query, maxResults, siteFilter, indexResults
    - Return web search results
  - [ ] 18.2 Create POST /api/a2a/register endpoint
    - Register agent with capabilities
  - [ ] 18.3 Create POST /api/a2a/discover endpoint
    - Discover agents by capability
  - [ ] 18.4 Create POST /api/a2a/delegate endpoint
    - Delegate task to target agent
  - [ ] 18.5 Create GET /api/acp/tools endpoint
    - Return tool registry
  - [ ] 18.6 Create POST /api/acp/execute endpoint
    - Execute tool with validation

- [ ] 19. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 6: Search UI

- [ ] 20. Create Knowledge Search UI
  - [ ] 20.1 Create /knowledge route
    - Search input with autocomplete
    - Results display with cards
    - Tag filtering chips
    - _Requirements: 10.1, 10.2, 10.4_
  - [ ] 20.2 Implement result expansion
    - Full content display on click
    - Syntax highlighting for code
    - _Requirements: 10.3_
  - [ ] 20.3 Add LLM synthesis toggle
    - AI-generated answer display
    - Source citations
    - Multi-provider selection

- [ ] 21. Add package.json scripts
  - [ ] 21.1 Add npm scripts for knowledge search
    - `phase76:search` - Query knowledge base
    - `phase76:mcp` - Start FastMCP server
    - `phase76:index` - Index documents
    - `phase76:stats` - Show collection stats

- [ ] 22. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Run full integration test suite
  - Verify all 17 correctness properties

## Phase 7: HMM Route Inference Engine

- [ ] 23. Implement RouteInferenceEngine
  - [ ] 23.1 Create RouteInferenceEngine class
    - Implement parseErrors() to extract RoutePattern from svelte-check output
    - Implement buildTransitionMatrix() from error history
    - _Requirements: 11.1, 11.2_
  - [ ]* 23.2 Write property test for route pattern parsing
    - **Property 18: HMM Route Pattern Parsing**
    - **Validates: Requirements 11.1**
  - [ ]* 23.3 Write property test for transition matrix probability sum
    - **Property 19: Transition Matrix Probability Sum**
    - **Validates: Requirements 11.2**

- [ ] 24. Implement Viterbi Algorithm for Route Inference
  - [ ] 24.1 Implement inferMissingFiles() using Viterbi
    - Calculate most likely sequence of missing files
    - Return confidence scores for each inference
    - _Requirements: 11.3, 11.4_
  - [ ] 24.2 Implement generateScaffold() for code generation
    - Generate +page.svelte, +layout.svelte, +server.ts templates
    - Include rollback plan
    - _Requirements: 11.5_
  - [ ]* 24.3 Write property test for Viterbi inference confidence
    - **Property 20: Viterbi Inference Confidence**
    - **Validates: Requirements 11.3, 11.5**

- [ ] 25. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 8: Codebase Indexer with ts-morph

- [ ] 26. Implement CodebaseIndexer
  - [ ] 26.1 Create CodebaseIndexer class with ts-morph
    - Implement indexFile() with AST parsing
    - Extract imports, exports, functions, classes, types
    - _Requirements: 12.1, 12.2, 12.3_
  - [ ]* 26.2 Write property test for AST import extraction
    - **Property 21: AST Import Extraction**
    - **Validates: Requirements 12.1, 12.2**
  - [ ] 26.3 Implement indexDirectory() for batch indexing
    - Recursive directory scanning
    - Filter by file extensions (.ts, .svelte, .js)
    - _Requirements: 13.1, 13.2_

- [ ] 27. Implement Dependency Graph
  - [ ] 27.1 Create getDependencyGraph() method
    - Build Neo4j graph from imports/exports
    - Detect circular dependencies
    - _Requirements: 12.2, 12.4_
  - [ ]* 27.2 Write property test for cycle detection
    - **Property 22: Dependency Graph Acyclicity Detection**
    - **Validates: Requirements 12.4**
  - [ ] 27.3 Implement watchAndIndex() file watcher
    - Detect file changes via content hash
    - Re-index only changed files
    - _Requirements: 13.4_
  - [ ]* 27.4 Write property test for file change detection
    - **Property 24: File Change Detection**
    - **Validates: Requirements 13.4**

- [ ] 28. Implement LLM Summaries for Code
  - [ ] 28.1 Generate LLM summaries for indexed files
    - Use gemma3-legal:latest for code summarization
    - Store in Qdrant codebase_index collection
    - _Requirements: 13.2, 13.3_
  - [ ]* 28.2 Write property test for codebase index round-trip
    - **Property 23: Codebase Index Round-Trip**
    - **Validates: Requirements 13.1, 13.2, 13.3**

- [ ] 29. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 9: Error-Code Correlation

- [ ] 30. Implement ErrorCodeCorrelator
  - [ ] 30.1 Create ErrorCodeCorrelator class
    - Implement parseErrors() for tsc and svelte-check output
    - Implement findASTNode() to locate error in AST
    - _Requirements: 14.1, 14.2_
  - [ ]* 30.2 Write property test for error location AST mapping
    - **Property 25: Error Location AST Mapping**
    - **Validates: Requirements 14.2**
  - [ ] 30.3 Implement findSimilarErrors() with Qdrant
    - Search error_patterns collection by embedding similarity
    - Return historical fixes with confidence
    - _Requirements: 14.3, 14.4_
  - [ ]* 30.4 Write property test for similar error retrieval
    - **Property 26: Similar Error Retrieval**
    - **Validates: Requirements 14.3**

- [ ] 31. Implement Fix Suggestion
  - [ ] 31.1 Implement suggestFix() method
    - Use historical fixes when available
    - Fall back to LLM generation with codebase context
    - _Requirements: 14.4, 14.5_
  - [ ] 31.2 Implement applyFix() with rollback
    - Apply file changes
    - Verify error is resolved
    - Record outcome for learning
    - _Requirements: 15.1_
  - [ ]* 31.3 Write property test for fix recording and retrieval
    - **Property 27: Fix Recording and Retrieval**
    - **Validates: Requirements 15.1, 14.4**

- [ ] 32. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 10: Contextual Engineering Service

- [ ] 33. Implement ContextualEngineeringService
  - [ ] 33.1 Create ContextualEngineeringService class
    - Implement recordFix() for learning
    - Implement checkForPatterns() for proactive warnings
    - _Requirements: 15.1, 15.2_
  - [ ]* 33.2 Write property test for pattern warning consistency
    - **Property 28: Pattern Warning Consistency**
    - **Validates: Requirements 15.2, 15.4**
  - [ ] 33.3 Implement buildContext() for LLM prompts
    - Inject relevant docs, error history, code context
    - Optimize for token budget
    - _Requirements: 15.3_
  - [ ] 33.4 Implement escalateIfNeeded() for human review
    - Detect recurring errors (3+ occurrences)
    - Generate aggregated context report
    - _Requirements: 15.4_

- [ ] 34. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Phase 11: Production Validation

- [ ] 35. Implement ProductionValidator
  - [ ] 35.1 Create ProductionValidator class
    - Implement validate() to run all checks
    - Implement runCheck() for individual checks
    - _Requirements: 16.1, 16.2_
  - [ ]* 35.2 Write property test for validation completeness
    - **Property 29: Production Validation Completeness**
    - **Validates: Requirements 16.1, 16.2**
  - [ ] 35.3 Implement generateReport() for deployment readiness
    - Calculate confidence score
    - List blockers and recommendations
    - _Requirements: 16.3, 16.4_
  - [ ] 35.4 Implement createCheckpoint() for codebase backup
    - Store in MinIO with timestamp
    - Record file manifest
    - _Requirements: 16.5_
  - [ ]* 35.5 Write property test for checkpoint creation
    - **Property 30: Checkpoint Creation and Retrieval**
    - **Validates: Requirements 16.5**

- [ ] 36. Create Production Validation API
  - [ ] 36.1 Create POST /api/production/validate endpoint
    - Run all validation checks
    - Return ValidationReport
  - [ ] 36.2 Create GET /api/production/report endpoint
    - Generate deployment readiness report
  - [ ] 36.3 Create POST /api/production/checkpoint endpoint
    - Create codebase checkpoint in MinIO

- [ ] 37. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Run full integration test suite
  - Verify all 30 correctness properties
  - Test HMM route inference with real svelte-check errors
  - Validate codebase indexing with ts-morph
