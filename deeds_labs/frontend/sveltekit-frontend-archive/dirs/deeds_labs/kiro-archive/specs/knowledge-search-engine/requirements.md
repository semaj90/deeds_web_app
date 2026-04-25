# Requirements Document

## Introduction

This specification defines a Knowledge Search Engine that provides semantic search over crawled documentation with AI-generated summaries, inverse document frequency (IDF) ranking, and integration with the existing RAG+KAG pipeline. The system enables contextual prompt engineering for LLM synthesis using embeddinggemma, Qdrant vectors, PostgreSQL 17, MinIO text storage, and Redis caching.

Additionally, this specification extends the system with HMM-like route inference capabilities using ts-morph AST analysis to detect missing routes, pages, and layouts from TypeScript/Svelte errors. The system indexes the codebase with LLM summaries to enable contextual engineering that prevents repeated errors and brings the application to production safely.

## Glossary

- **Knowledge_Search_Engine**: The system that indexes, searches, and retrieves crawled documentation for LLM synthesis
- **RAG**: Retrieval-Augmented Generation - semantic search using vector embeddings
- **KAG**: Knowledge-Augmented Generation - graph-based entity relationships
- **IDF**: Inverse Document Frequency - ranking metric that weights rare terms higher
- **MCP**: Model Context Protocol - agentic tool calling interface
- **ACE**: Autonomous Coding Engine - the agentic orchestrator
- **embeddinggemma**: Ollama embedding model (768-dim vectors)
- **Qdrant**: Vector database for semantic search
- **MinIO**: S3-compatible object storage for document text/summaries
- **pgvector**: PostgreSQL extension for vector similarity search
- **HMM**: Hidden Markov Model - probabilistic model for inferring hidden states from observations
- **ts-morph**: TypeScript compiler API wrapper for AST manipulation
- **AST**: Abstract Syntax Tree - tree representation of source code structure
- **Route_Inference_Engine**: The subsystem that infers missing routes/pages/layouts from error patterns
- **Codebase_Indexer**: The subsystem that indexes source files with embeddings and LLM summaries

## Requirements

### Requirement 1

**User Story:** As a developer, I want to search crawled documentation semantically, so that I can find relevant context for my coding tasks.

#### Acceptance Criteria

1. WHEN a user submits a search query THEN the Knowledge_Search_Engine SHALL generate a 768-dimensional embedding using embeddinggemma:latest
2. WHEN embeddings are generated THEN the Knowledge_Search_Engine SHALL search the phase76_knowledge_base collection in Qdrant with cosine similarity
3. WHEN search results are returned THEN the Knowledge_Search_Engine SHALL display results ranked by relevance score (0.0-1.0)
4. WHEN displaying results THEN the Knowledge_Search_Engine SHALL show title, URL, AI summary, and relevance percentage
5. WHEN no results exceed the score threshold (0.5) THEN the Knowledge_Search_Engine SHALL return an empty result set with a suggestion to broaden the query

### Requirement 2

**User Story:** As a developer, I want AI-generated summaries of crawled documents, so that I can quickly understand content without reading full pages.

#### Acceptance Criteria

1. WHEN a document is crawled THEN the Knowledge_Search_Engine SHALL generate a concise summary using gemma3-legal:latest
2. WHEN generating summaries THEN the Knowledge_Search_Engine SHALL extract key entities (technologies, organizations, people)
3. WHEN storing summaries THEN the Knowledge_Search_Engine SHALL persist them in both Qdrant payload and MinIO object storage
4. WHEN summaries exceed 500 characters THEN the Knowledge_Search_Engine SHALL truncate with ellipsis for display
5. WHEN summary generation fails THEN the Knowledge_Search_Engine SHALL store the first 500 characters of raw content as fallback

### Requirement 3

**User Story:** As a developer, I want inverse document frequency ranking, so that rare/specific terms are weighted higher in search results.

#### Acceptance Criteria

1. WHEN indexing documents THEN the Knowledge_Search_Engine SHALL compute term frequency (TF) for each document
2. WHEN computing IDF THEN the Knowledge_Search_Engine SHALL use the formula: IDF(t) = log(N / df(t)) where N is total docs and df(t) is docs containing term t
3. WHEN ranking results THEN the Knowledge_Search_Engine SHALL combine cosine similarity (70%) with TF-IDF score (30%)
4. WHEN displaying rankings THEN the Knowledge_Search_Engine SHALL show both semantic score and keyword relevance
5. WHEN a term appears in all documents THEN the Knowledge_Search_Engine SHALL assign IDF weight of 0

### Requirement 4

**User Story:** As a developer, I want the search engine to integrate with PostgreSQL 17, so that I can query structured metadata alongside vector search.

#### Acceptance Criteria

1. WHEN storing documents THEN the Knowledge_Search_Engine SHALL insert metadata into PostgreSQL with pgvector extension
2. WHEN querying THEN the Knowledge_Search_Engine SHALL support hybrid search combining pgvector similarity with SQL filters
3. WHEN filtering by source THEN the Knowledge_Search_Engine SHALL support WHERE clauses on url, title, scrapedAt columns
4. WHEN using pgvector THEN the Knowledge_Search_Engine SHALL use the same 768-dimensional embeddings as Qdrant
5. WHEN PostgreSQL is unavailable THEN the Knowledge_Search_Engine SHALL fallback to Qdrant-only search

### Requirement 5

**User Story:** As a developer, I want document text stored in MinIO, so that full content is available for LLM context windows.

#### Acceptance Criteria

1. WHEN crawling documents THEN the Knowledge_Search_Engine SHALL store full markdown content in MinIO bucket "knowledge-docs"
2. WHEN storing in MinIO THEN the Knowledge_Search_Engine SHALL use object key format: {collection}/{url_hash}.md
3. WHEN retrieving for LLM THEN the Knowledge_Search_Engine SHALL fetch full text from MinIO using the object key
4. WHEN MinIO is unavailable THEN the Knowledge_Search_Engine SHALL use cached content from Redis
5. WHEN content exceeds 100KB THEN the Knowledge_Search_Engine SHALL chunk into multiple objects with index suffix

### Requirement 6

**User Story:** As a developer, I want Redis caching for search results, so that repeated queries are fast.

#### Acceptance Criteria

1. WHEN a search query is executed THEN the Knowledge_Search_Engine SHALL cache results in Redis with TTL of 1 hour
2. WHEN caching THEN the Knowledge_Search_Engine SHALL use key format: kb:search:{query_hash}
3. WHEN a cached result exists THEN the Knowledge_Search_Engine SHALL return it without hitting Qdrant
4. WHEN cache is invalidated THEN the Knowledge_Search_Engine SHALL remove all keys matching kb:search:*
5. WHEN Redis is unavailable THEN the Knowledge_Search_Engine SHALL proceed without caching

### Requirement 7

**User Story:** As a developer, I want MCP tool calling for agentic workflows, so that the ACE agent can dynamically fetch knowledge.

#### Acceptance Criteria

1. WHEN ACE agent needs documentation THEN the Knowledge_Search_Engine SHALL expose MCP tool "knowledge-search"
2. WHEN calling MCP tool THEN the Knowledge_Search_Engine SHALL accept parameters: query (string), topK (number), filters (object)
3. WHEN returning results THEN the Knowledge_Search_Engine SHALL format as JSON with fields: id, title, url, summary, score, content
4. WHEN MCP server is unavailable THEN the Knowledge_Search_Engine SHALL fallback to direct HTTP API call
5. WHEN tool call times out (>30s) THEN the Knowledge_Search_Engine SHALL return partial results with timeout flag

### Requirement 8

**User Story:** As a developer, I want an API endpoint for knowledge search, so that I can integrate with other services.

#### Acceptance Criteria

1. WHEN POST /api/knowledge/search is called THEN the Knowledge_Search_Engine SHALL accept JSON body with query, topK, filters
2. WHEN GET /api/knowledge/document/:id is called THEN the Knowledge_Search_Engine SHALL return full document with content from MinIO
3. WHEN GET /api/knowledge/stats is called THEN the Knowledge_Search_Engine SHALL return collection statistics (doc count, index status)
4. WHEN authentication fails THEN the Knowledge_Search_Engine SHALL return 401 Unauthorized
5. WHEN rate limit exceeded (100 req/min) THEN the Knowledge_Search_Engine SHALL return 429 Too Many Requests

### Requirement 9

**User Story:** As a developer, I want auto-tagging of documents, so that I can filter by technology/framework.

#### Acceptance Criteria

1. WHEN indexing documents THEN the Knowledge_Search_Engine SHALL extract tags from entities field
2. WHEN extracting tags THEN the Knowledge_Search_Engine SHALL identify: technologies, frameworks, languages, libraries
3. WHEN storing tags THEN the Knowledge_Search_Engine SHALL add to Qdrant payload as tags[] array
4. WHEN filtering by tag THEN the Knowledge_Search_Engine SHALL support Qdrant filter: {"must": [{"key": "tags", "match": {"value": "svelte"}}]}
5. WHEN no entities are extracted THEN the Knowledge_Search_Engine SHALL use URL domain as fallback tag

### Requirement 10

**User Story:** As a developer, I want a search UI component, so that I can browse and explore the knowledge base visually.

#### Acceptance Criteria

1. WHEN rendering search UI THEN the Knowledge_Search_Engine SHALL display a search input with autocomplete
2. WHEN displaying results THEN the Knowledge_Search_Engine SHALL show cards with title, summary, tags, and relevance bar
3. WHEN clicking a result THEN the Knowledge_Search_Engine SHALL expand to show full content with syntax highlighting
4. WHEN filtering THEN the Knowledge_Search_Engine SHALL provide tag chips for quick filtering
5. WHEN no results found THEN the Knowledge_Search_Engine SHALL suggest related queries based on existing tags

### Requirement 11

**User Story:** As a developer, I want HMM-like route inference from errors, so that the system can identify missing routes, pages, and layouts from TypeScript/Svelte error patterns.

#### Acceptance Criteria

1. WHEN svelte-check reports a "Cannot find module" error THEN the Route_Inference_Engine SHALL parse the import path to identify the expected route structure
2. WHEN multiple errors reference the same missing path pattern THEN the Route_Inference_Engine SHALL compute a transition probability matrix for route dependencies
3. WHEN inferring missing routes THEN the Route_Inference_Engine SHALL use Viterbi algorithm to find the most likely sequence of missing files (+page.svelte, +layout.svelte, +server.ts)
4. WHEN a route group pattern (e.g., "(app)") is detected THEN the Route_Inference_Engine SHALL infer the complete route hierarchy including parent layouts
5. WHEN inference confidence exceeds 0.8 THEN the Route_Inference_Engine SHALL generate scaffold code for the missing route files

### Requirement 12

**User Story:** As a developer, I want ts-morph AST analysis of my codebase, so that the system can understand code structure and relationships.

#### Acceptance Criteria

1. WHEN indexing a TypeScript file THEN the Codebase_Indexer SHALL parse it using ts-morph to extract imports, exports, classes, functions, and types
2. WHEN analyzing imports THEN the Codebase_Indexer SHALL build a dependency graph stored in Neo4j with IMPORTS_FROM relationships
3. WHEN analyzing exports THEN the Codebase_Indexer SHALL identify public API surface and store as EXPORTS relationship
4. WHEN a function references another function THEN the Codebase_Indexer SHALL create CALLS relationship in the graph
5. WHEN AST parsing fails THEN the Codebase_Indexer SHALL log the error and continue with text-based indexing as fallback

### Requirement 13

**User Story:** As a developer, I want codebase indexing with LLM summaries, so that I can search my own code semantically.

#### Acceptance Criteria

1. WHEN indexing a source file THEN the Codebase_Indexer SHALL generate a 768-dimensional embedding of the file content
2. WHEN indexing THEN the Codebase_Indexer SHALL generate an LLM summary describing the file's purpose, key functions, and dependencies
3. WHEN storing indexed files THEN the Codebase_Indexer SHALL persist to Qdrant collection "codebase_index" with file path, summary, and AST metadata
4. WHEN a file is modified THEN the Codebase_Indexer SHALL detect the change via file watcher and re-index only the changed file
5. WHEN indexing completes THEN the Codebase_Indexer SHALL cache the index state in Redis with key "codebase:index:state"

### Requirement 14

**User Story:** As a developer, I want error-to-code correlation, so that the system can link TypeScript errors to specific code locations and suggest fixes.

#### Acceptance Criteria

1. WHEN tsc reports an error THEN the Knowledge_Search_Engine SHALL parse the error to extract file path, line number, column, and error code
2. WHEN an error is parsed THEN the Knowledge_Search_Engine SHALL query the codebase index to find the exact AST node at that location
3. WHEN correlating errors THEN the Knowledge_Search_Engine SHALL search for similar errors in the error history (Qdrant "error_patterns" collection)
4. WHEN a similar error has a known fix THEN the Knowledge_Search_Engine SHALL retrieve the fix strategy and confidence score
5. WHEN no similar error exists THEN the Knowledge_Search_Engine SHALL generate a fix suggestion using LLM with codebase context

### Requirement 15

**User Story:** As a developer, I want contextual engineering to prevent repeated errors, so that the system learns from past fixes and applies them proactively.

#### Acceptance Criteria

1. WHEN a fix is applied successfully THEN the Knowledge_Search_Engine SHALL store the error-fix pair in Qdrant with embedding and metadata
2. WHEN indexing new code THEN the Knowledge_Search_Engine SHALL check for patterns that previously caused errors and warn proactively
3. WHEN generating LLM prompts THEN the Knowledge_Search_Engine SHALL inject relevant error history and successful fixes as context
4. WHEN the same error pattern appears 3+ times THEN the Knowledge_Search_Engine SHALL escalate to human review with aggregated context
5. WHEN a fix is rejected or reverted THEN the Knowledge_Search_Engine SHALL update the fix confidence score negatively

### Requirement 16

**User Story:** As a developer, I want safe production deployment validation, so that the system verifies the app builds and runs without breaking changes.

#### Acceptance Criteria

1. WHEN preparing for production THEN the Knowledge_Search_Engine SHALL run svelte-check and tsc with zero-error threshold
2. WHEN errors are detected THEN the Knowledge_Search_Engine SHALL categorize them by severity (blocking, warning, info)
3. WHEN blocking errors exist THEN the Knowledge_Search_Engine SHALL halt deployment and generate a remediation plan
4. WHEN all checks pass THEN the Knowledge_Search_Engine SHALL generate a deployment readiness report with confidence score
5. WHEN deployment is approved THEN the Knowledge_Search_Engine SHALL create a checkpoint of the current codebase state in MinIO
