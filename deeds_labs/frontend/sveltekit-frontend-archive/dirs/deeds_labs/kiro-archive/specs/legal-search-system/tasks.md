# Legal Search System - Implementation Plan

- [ ] 1. Set up PostgreSQL schema and Drizzle ORM
  - Create migrations for cases, crimes, laws, lawSections, caseChunks tables
  - Add pgvector extension and embedding columns
  - Define Drizzle schema files in `src/lib/server/db/schema/`
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 1.1 Set up MinIO buckets for document storage
  - Create MinIO buckets: `minio_bucket_laws`, `minio_bucket_laws_parsed`, `minio_bucket_laws_metadata`
  - Configure bucket policies and lifecycle rules
  - Create `src/lib/server/services/minio-service.ts` for bucket operations
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 2. Implement LangExtract integration and chunking pipeline
  - Create `src/lib/server/services/langextract-service.ts` to call LangExtract API
  - Implement section type detection and validation
  - Create `src/lib/server/services/chunking-service.ts` with sliding window logic
  - Handle fallback to heuristic section detection if LangExtract fails
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 3. Implement embedding generation and storage
  - Create `src/lib/server/services/embedding-service.ts` to call Gemma3 embeddings via Ollama
  - Implement batch embedding with caching
  - Store embeddings in PostgreSQL pgvector columns
  - _Requirements: 1.2, 7.2, 7.4_

- [ ] 4. Set up Qdrant collection and indexing
  - Create Qdrant collections: case_chunks and law_sections
  - Configure HNSW indexing with cosine distance
  - Implement `src/lib/server/services/qdrant-indexing-service.ts` to index chunks
  - Handle metadata payload storage (crime_code, crime_category, section_type, etc.)
  - _Requirements: 3.1, 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 5. Set up Elasticsearch indices and mappings
  - Create Elasticsearch indices: case_chunks and law_sections
  - Configure text analyzer and keyword fields
  - Implement `src/lib/server/services/elasticsearch-indexing-service.ts` to index chunks
  - _Requirements: 3.2, 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 6. Implement Go microservice for hybrid search
  - Create Go project structure with gRPC and REST handlers
  - Define protobuffer schemas (search.proto) for SearchCases and SearchLaws
  - Implement Qdrant client for semantic search with filters
  - Implement Elasticsearch client for full-text search
  - Implement RRF (Reciprocal Rank Fusion) ranking algorithm
  - Implement `/search/cases` and `/search/laws` endpoints (gRPC + REST)
  - Implement `/health` endpoint for health checks
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 7. Implement SvelteKit API routes for search proxying
  - Create `src/routes/api/search/cases/+server.ts` to proxy to Go microservice
  - Create `src/routes/api/search/laws/+server.ts` to proxy to Go microservice
  - Add request validation and error handling
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 8. Implement SvelteKit /laws routes for law library UI
  - Create `src/routes/laws/+layout.server.ts` to load jurisdictions
  - Create `src/routes/laws/+page.svelte` to display state list
  - Create `src/routes/laws/[state]/+page.server.ts` to load statutes by state
  - Create `src/routes/laws/[state]/+page.svelte` to display statute cards
  - Create `src/routes/laws/[state]/[sectionId]/+page.server.ts` to load statute details and related cases
  - Create `src/routes/laws/[state]/[sectionId]/+page.svelte` to display statute with related cases
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 9. Implement crime metadata extraction and storage
  - Extend LangExtract prompt to extract crime_code, crime_category, crime_classification, sentencing_year, sentence_length_months, enhancements
  - Create `src/lib/server/services/crime-extraction-service.ts` to parse LangExtract output
  - Implement database storage in crimes table
  - Handle multiple crimes per case
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 10. Implement agentic function calls for LLM
  - Define `search_cases` function schema with parameters: query, jurisdiction, crimeCategory, crimeClassification, sectionType, limit
  - Define `search_law_sections` function schema with parameters: query, state, codeAbbrev, limit
  - Create `src/lib/server/services/agentic-functions-service.ts` to handle function invocations
  - Integrate with Gemma3-legal LLM
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 11. Implement document ingestion pipeline
  - Create `src/lib/server/services/ingestion-service.ts` to orchestrate: PDF upload → LangExtract → Chunking → Embedding → Storage
  - Handle MinIO file storage
  - Implement error handling and retry logic
  - _Requirements: 1.1, 2.1, 3.1, 7.1, 8.1, 9.1, 10.1_

- [ ] 12. Implement search result merging and ranking (RRF)
  - Create `src/lib/server/services/rrf-ranking-service.ts` to merge Qdrant and Elasticsearch results
  - Implement Reciprocal Rank Fusion algorithm
  - Handle tie-breaking and score normalization
  - _Requirements: 3.2, 3.3, 3.4, 3.5_

- [ ]* 13. Write unit tests for chunking and metadata extraction
  - Test sliding window logic with various token counts
  - Test LangExtract output parsing
  - Test crime code extraction and validation
  - Test RRF ranking algorithm
  - _Requirements: 1.2, 1.3, 2.1, 3.2, 3.3_

- [ ]* 14. Write integration tests for end-to-end ingestion and search
  - Test PDF upload → LangExtract → Chunk → Embed → Store pipeline
  - Test search query → Go microservice → Qdrant + ES → Merge → Return results
  - Test SvelteKit routes with mock data
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_

- [ ]* 15. Write performance tests for chunking, embedding, and search
  - Measure chunking throughput (chunks/second)
  - Measure embedding generation throughput (embeddings/second)
  - Measure search latency (p50/p95/p99)
  - _Requirements: 3.1, 3.2, 4.1, 4.2_

- [ ] 16. Implement consistency and reconciliation logic
  - Create reconciliation job to detect and fix mismatches between PostgreSQL, Qdrant, and Elasticsearch
  - Implement versioning for embeddings
  - Handle stale embedding invalidation on model updates
  - _Requirements: 8.5, 9.5_

- [ ] 18. Implement Redis echo cache for popular searches
  - Create `src/lib/server/services/redis-echo-cache-service.ts` to track search hits
  - Implement hit counter increment and TTL management
  - Integrate echo ranking into Go microservice search results
  - Apply ranking boost: `semantic_score + echo_hits * 0.15`
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 19. Implement RabbitMQ clustering job queue
  - Create RabbitMQ queue: `clustering.jobs`
  - Implement `src/lib/server/services/rabbitmq-clustering-service.ts` to publish NEW_DATA events
  - Create clustering job consumer with retry logic (3 retries, exponential backoff)
  - Implement timeout handling (1 hour max job duration)
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 20. Implement XState v5 orchestration for clustering workflow
  - Create `src/lib/server/services/xstate-clustering-machine.ts` with state machine
  - Implement state transitions: waiting → queue → clustering → tagging → indexing → complete
  - Implement retry logic (3 retries per state)
  - Implement rollback capability with version tracking
  - Implement event emission for job completion and errors
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [ ] 21. Implement SOM and K-Means clustering for legal taxonomy
  - Create `src/lib/server/services/som-clustering-service.ts` for Self-Organizing Map
  - Create `src/lib/server/services/kmeans-clustering-service.ts` for K-Means labeling
  - Implement SOM on statute embeddings to discover emergent categories
  - Implement K-Means on SOM centroids to assign crisp labels
  - Store cluster labels in Qdrant payloads: `som_cluster_id`, `kmeans_label`, `cluster_confidence`
  - Flag low-confidence clusters (< 0.7) for manual review
  - Implement change detection (> 20% label changes) with operator alerts
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [ ] 22. Implement IndexedDB cache for browser-side search and autocomplete
  - Create `src/lib/components/laws/indexeddb-cache.ts` for IndexedDB operations
  - Implement IndexedDB schema: statute_index with indexes on slug, category, jurisdiction
  - Implement sync logic to populate IndexedDB from server on page load
  - Implement autocomplete query logic: IndexedDB → Qdrant hint → pgvector confirm
  - Implement cache staleness check (24-hour TTL) with refresh logic
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 23. Implement browser ONNX agents for offline inference
  - Create `src/lib/components/laws/onnx-agents.ts` for ONNX model loading
  - Load `gemma-3-270m-onnx` for category suggestion and intent parsing
  - Load `embeddinggemma-onnx` for fallback embeddings
  - Implement offline search using IndexedDB + ONNX embeddings
  - Implement fallback to server-side inference if ONNX loading fails
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [ ] 24. Integrate echo ranking and cluster labels into Go microservice
  - Update Go microservice to query Redis for echo hits
  - Apply echo ranking boost to search results
  - Filter results by cluster labels (som_cluster_id, kmeans_label)
  - Return cluster metadata in search responses
  - _Requirements: 12.2, 16.3, 4.1, 4.2_

- [ ] 25. Update SvelteKit /laws routes to display cluster labels and autocomplete
  - Update `/laws/[state]/+page.svelte` to display cluster labels as badges
  - Implement autocomplete search box with IndexedDB + ONNX suggestions
  - Display echo hit counts and cluster confidence in statute cards
  - Add cluster filter UI to narrow results by category
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 15.2, 16.3_

- [ ] 17. Deploy and test full stack
  - Build Docker images for Go microservice
  - Deploy to Docker Desktop with PostgreSQL, Qdrant, Elasticsearch, Redis, RabbitMQ, MinIO
  - Run smoke tests on all endpoints
  - Verify end-to-end ingestion, clustering, and search workflows
  - Test IndexedDB sync and ONNX offline inference
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 9.1, 10.1, 11.1, 12.1, 13.1, 14.1, 15.1, 16.1, 17.1_

