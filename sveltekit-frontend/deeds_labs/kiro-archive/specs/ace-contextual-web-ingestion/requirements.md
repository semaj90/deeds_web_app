# Requirements Document: ACE Contextual Web Ingestion & RAG+KAG Pipeline

## Introduction

A comprehensive web ingestion and contextual retrieval system for ACE (Autonomous Coding Engine) that implements the full pipeline: web_search → crawl → extract → summarize → store (MinIO + Postgres17 + pgvector + Qdrant) → retrieve (RAG) + graph (KAG) → contextual prompt assembly → tool-call plan. This system enables ACE to gather fresh web context, store it efficiently, and retrieve it with hybrid ranking (cosine similarity + freshness + graph boost) for contextual code generation.

## Glossary

- **ACE**: Autonomous Coding Engine - the agent system that generates and fixes code
- **RAG**: Retrieval-Augmented Generation - vector similarity search for relevant context
- **KAG**: Knowledge-Augmented Generation - graph-based entity/relation retrieval
- **Context Bundle**: Combined RAG + KAG + metadata package for prompt assembly
- **Tool Plan**: Ordered sequence of tool calls ACE should execute
- **MinIO**: S3-compatible object storage for raw/derived content
- **pgvector**: Postgres extension for vector similarity search
- **Qdrant**: Fast vector database for ANN (Approximate Nearest Neighbor) search
- **Hybrid Ranking**: Scoring that combines cosine similarity, freshness, and graph boost
- **Embedding Dimension**: 384 (nomic-embed-text model)
- **Chunk**: 800-1200 token text segment with metadata

---

## Requirements

### Requirement 1: Web Search Integration

**User Story:** As ACE, I want to search the web for relevant information, so that I can gather fresh context for code generation tasks.

#### Acceptance Criteria

1. WHEN ACE calls web_search tool THEN the system SHALL execute a web search query and return result URLs
2. WHEN search results are returned THEN the system SHALL store them in ace_sources table with status 'new'
3. WHEN storing search results THEN the system SHALL save a JSON snapshot to MinIO at ace_web_raw/search/<query_hash>/<timestamp>.json
4. WHEN a URL already exists in ace_sources THEN the system SHALL update last_seen timestamp but not duplicate the entry
5. WHEN search fails THEN the system SHALL log the error to ace_eval_logs and return empty results without crashing

### Requirement 2: Web Crawler with Rate Limiting

**User Story:** As a system operator, I want to crawl web pages responsibly with rate limiting and robots.txt respect, so that we don't overload external servers.

#### Acceptance Criteria

1. WHEN crawling a URL THEN the system SHALL check robots.txt and respect crawl-delay directives
2. WHEN fetching HTML THEN the system SHALL store raw HTML in MinIO at ace_web_raw/crawl/<source_id>/<timestamp>.html
3. WHEN a fetch succeeds THEN the system SHALL compute content_hash and etag, and update ace_sources.crawl_status to 'ok'
4. WHEN content_hash matches previous crawl THEN the system SHALL skip processing and log "unchanged"
5. WHEN a fetch fails THEN the system SHALL update ace_sources.crawl_status to 'error' and log details to ace_eval_logs
6. WHEN rate limit is hit THEN the system SHALL update ace_sources.crawl_status to 'blocked' and retry with exponential backoff

### Requirement 3: HTML Cleaning and Markdown Conversion

**User Story:** As a content processor, I want to convert raw HTML to clean markdown, so that embeddings and summaries focus on actual content not navigation/scripts.

#### Acceptance Criteria

1. WHEN processing raw HTML THEN the system SHALL strip navigation, scripts, cookie banners, and ads
2. WHEN converting to markdown THEN the system SHALL preserve headings, links, code blocks, and semantic structure
3. WHEN cleaning completes THEN the system SHALL store cleaned markdown in MinIO at ace_web_raw/crawl/<source_id>/<timestamp>.md
4. WHEN markdown is stored THEN the system SHALL update ace_docs.minio_clean_key with the MinIO path
5. WHEN cleaning fails THEN the system SHALL log the error but keep the raw HTML for manual review

### Requirement 4: Chunking with Stable Strategy

**User Story:** As an embedding generator, I want text chunked into 800-1200 token segments with metadata, so that retrieval returns focused, relevant context.

#### Acceptance Criteria

1. WHEN chunking a document THEN the system SHALL create chunks of 800-1200 tokens each
2. WHEN creating chunks THEN the system SHALL preserve heading context and add metadata (section title, offsets, url, fetched_at)
3. WHEN storing chunks THEN the system SHALL insert into ace_chunks table with chunk_index for ordering
4. WHEN a chunk is created THEN the system SHALL store chunk text in MinIO at ace_web_derived/chunks/<doc_id>.jsonl (one chunk per line)
5. WHEN chunking completes THEN the system SHALL update ace_docs.tokens with total token count

### Requirement 5: Embedding Generation and Storage

**User Story:** As a retrieval system, I want embeddings generated for each chunk and stored in both Postgres and Qdrant, so that I can perform fast vector similarity search.

#### Acceptance Criteria

1. WHEN a chunk is created THEN the system SHALL generate a 384-dimensional embedding using nomic-embed-text
2. WHEN embedding is generated THEN the system SHALL store it in ace_chunks.embedding (vector(384) type)
3. WHEN storing in Qdrant THEN the system SHALL upsert with payload containing doc_id, url, domain, fetched_at, heading
4. WHEN Qdrant upsert succeeds THEN the system SHALL log success with chunk_id
5. WHEN embedding generation fails THEN the system SHALL retry with exponential backoff up to 3 times before logging failure

### Requirement 6: Document Summarization

**User Story:** As ACE, I want concise summaries of crawled documents, so that I can quickly understand content without reading full text.

#### Acceptance Criteria

1. WHEN a document is fully chunked THEN the system SHALL generate a short summary (3-5 sentences) and long summary (structured bullets)
2. WHEN generating summaries THEN the system SHALL extract key claims with supporting chunk references
3. WHEN summarization completes THEN the system SHALL store summary JSON in MinIO at ace_web_derived/summary/<doc_id>.json
4. WHEN storing summary THEN the system SHALL update ace_docs.summary with short summary text
5. WHEN summarization fails THEN the system SHALL log error and leave ace_docs.summary as null

### Requirement 7: Entity and Relation Extraction (KAG)

**User Story:** As a knowledge graph builder, I want entities and relations extracted from documents, so that I can boost retrieval with graph connections.

#### Acceptance Criteria

1. WHEN processing a document THEN the system SHALL extract entities (TECH, PERSON, ORG, CONCEPT) using NER
2. WHEN entities are extracted THEN the system SHALL store them in ace_entities table with entity_type
3. WHEN finding relations THEN the system SHALL extract triples (src_entity, rel, dst_entity) and store in ace_edges
4. WHEN storing relations THEN the system SHALL compute weight based on co-occurrence frequency
5. WHEN extraction completes THEN the system SHALL include entities and relations in summary JSON

### Requirement 8: Hybrid Retrieval with Cosine + Freshness + Graph Boost

**User Story:** As ACE, I want retrieval that combines vector similarity, freshness, and graph connections, so that I get the most relevant and up-to-date context.

#### Acceptance Criteria

1. WHEN ACE queries for context THEN the system SHALL retrieve top 40 candidates from Qdrant using cosine similarity
2. WHEN scoring candidates THEN the system SHALL apply formula: score = 0.65 * cosine_sim + 0.10 * freshness_boost + 0.05 * graph_boost
3. WHEN calculating freshness_boost THEN the system SHALL give +1.0 for <7 days, +0.5 for 7-30 days, +0.0 for >30 days
4. WHEN calculating graph_boost THEN the system SHALL give +0.5 for entity match in chunk, +0.25 for 1-hop neighbor match
5. WHEN retrieval completes THEN the system SHALL return top 10 chunks sorted by final score with citations

### Requirement 9: Context Bundle Assembly

**User Story:** As ACE, I want a complete context bundle with RAG chunks, KAG snippets, and metadata, so that I can assemble prompts with all relevant information.

#### Acceptance Criteria

1. WHEN buildContextBundle is called THEN the system SHALL return retrieved chunks (RAG), graph snippets (KAG), doc summaries, and citations
2. WHEN assembling bundle THEN the system SHALL include provenance (url, domain, fetched_at) for each chunk
3. WHEN bundle includes graph data THEN the system SHALL return top 50 edges sorted by weight
4. WHEN bundle is too large THEN the system SHALL truncate to fit within token budget (default 4000 tokens)
5. WHEN bundle assembly fails THEN the system SHALL return partial bundle with error flag

### Requirement 10: Tool Plan Generation

**User Story:** As ACE, I want a tool plan that suggests next actions based on context quality, so that I know whether to search more or proceed with generation.

#### Acceptance Criteria

1. WHEN buildToolPlan is called THEN the system SHALL analyze context bundle quality
2. WHEN context is stale (>30 days) THEN the system SHALL suggest web_search tool call
3. WHEN context is insufficient (<3 relevant chunks) THEN the system SHALL suggest web_search with refined query
4. WHEN context is sufficient THEN the system SHALL suggest proceeding with code generation
5. WHEN tool plan is generated THEN the system SHALL return ordered list of tool calls with parameters

### Requirement 11: Prompt Assembly with Constraints

**User Story:** As ACE, I want prompts assembled with system constraints, retrieved evidence, and action plan, so that the LLM has all context needed for accurate generation.

#### Acceptance Criteria

1. WHEN buildPrompt is called THEN the system SHALL assemble prompt with system message, developer rules, project rules, and retrieved evidence
2. WHEN adding evidence THEN the system SHALL format chunks with citations (url, fetched_at)
3. WHEN evidence exceeds token budget THEN the system SHALL truncate lowest-scoring chunks first
4. WHEN including action plan THEN the system SHALL format tool calls as structured instructions
5. WHEN prompt is complete THEN the system SHALL return final prompt string ready for LLM

### Requirement 12: Ingestion API Endpoint

**User Story:** As a frontend developer, I want an API endpoint to trigger web ingestion, so that I can initiate crawling from the UI.

#### Acceptance Criteria

1. WHEN POST /api/ace/web/ingest is called THEN the system SHALL enqueue a job to RabbitMQ
2. WHEN job is enqueued THEN the system SHALL return job_id and status 'queued'
3. WHEN job payload is invalid THEN the system SHALL return 400 with validation errors
4. WHEN RabbitMQ is unavailable THEN the system SHALL return 503 with retry-after header
5. WHEN job is enqueued successfully THEN the system SHALL log job_id and timestamp

### Requirement 13: Ingestion Worker Process

**User Story:** As a background worker, I want to process ingestion jobs from RabbitMQ, so that crawling happens asynchronously without blocking the API.

#### Acceptance Criteria

1. WHEN worker starts THEN it SHALL connect to RabbitMQ and subscribe to 'ace_web_ingest' queue
2. WHEN job is received THEN the worker SHALL execute: crawl → clean → chunk → embed → store pipeline
3. WHEN pipeline step fails THEN the worker SHALL log error and update job status to 'failed'
4. WHEN pipeline completes THEN the worker SHALL update job status to 'completed' and ack the message
5. WHEN worker crashes THEN the job SHALL remain in queue for retry (no ack sent)

### Requirement 14: Context Retrieval API Endpoint

**User Story:** As ACE, I want an API endpoint to retrieve context bundles, so that I can get RAG+KAG data for prompt assembly.

#### Acceptance Criteria

1. WHEN GET /api/ace/context is called with query parameter THEN the system SHALL return ContextBundle
2. WHEN query is provided THEN the system SHALL generate embedding and perform hybrid retrieval
3. WHEN filters are provided THEN the system SHALL apply them to Qdrant search (domain, date_range, tags)
4. WHEN retrieval succeeds THEN the system SHALL return 200 with bundle containing chunks, entities, edges, and metadata
5. WHEN retrieval fails THEN the system SHALL return 500 with error details

### Requirement 15: Database Schema and Migrations

**User Story:** As a database administrator, I want Postgres schema with pgvector extension and proper indexes, so that vector search is fast and reliable.

#### Acceptance Criteria

1. WHEN migration runs THEN it SHALL create extension vector if not exists
2. WHEN creating ace_chunks table THEN it SHALL include embedding column as vector(384)
3. WHEN creating indexes THEN it SHALL create ivfflat index on ace_chunks.embedding with lists=100
4. WHEN creating foreign keys THEN it SHALL use ON DELETE CASCADE for ace_chunks and ace_entities
5. WHEN migration completes THEN all tables SHALL have proper constraints and indexes

### Requirement 16: MinIO Bucket Organization

**User Story:** As a storage administrator, I want MinIO buckets organized by content type, so that raw, derived, and log data are separated.

#### Acceptance Criteria

1. WHEN system initializes THEN it SHALL create buckets: ace_web_raw, ace_web_derived, ace_eval_logs
2. WHEN storing raw HTML THEN it SHALL use path: ace_web_raw/crawl/<source_id>/<timestamp>.html
3. WHEN storing cleaned markdown THEN it SHALL use path: ace_web_raw/crawl/<source_id>/<timestamp>.md
4. WHEN storing summaries THEN it SHALL use path: ace_web_derived/summary/<doc_id>.json
5. WHEN storing chunks THEN it SHALL use path: ace_web_derived/chunks/<doc_id>.jsonl

### Requirement 17: Qdrant Collection Management

**User Story:** As a vector search administrator, I want Qdrant collections properly configured, so that ANN search is fast and accurate.

#### Acceptance Criteria

1. WHEN system initializes THEN it SHALL create collection 'ace_chunks' with vector size 384 and distance metric Cosine
2. WHEN upserting points THEN it SHALL include payload with doc_id, url, domain, fetched_at, heading, tags
3. WHEN collection exists THEN the system SHALL verify configuration matches expected settings
4. WHEN collection is missing THEN the system SHALL create it with proper configuration
5. WHEN Qdrant is unavailable THEN the system SHALL log error and fall back to pgvector search

### Requirement 18: Error Handling and Logging

**User Story:** As a system operator, I want comprehensive error logging, so that I can diagnose and fix ingestion failures.

#### Acceptance Criteria

1. WHEN any pipeline step fails THEN the system SHALL log error with context (url, doc_id, step_name, error_message)
2. WHEN rate limit is hit THEN the system SHALL log rate_limit event to ace_eval_logs with retry_after
3. WHEN robots.txt blocks crawl THEN the system SHALL log blocked event and skip URL
4. WHEN embedding generation fails THEN the system SHALL log embedding_error with model and input_length
5. WHEN storage fails THEN the system SHALL log storage_error with bucket, key, and error details

### Requirement 19: Adapter Integration with Existing ACE

**User Story:** As ACE, I want the contextual adapter integrated with my existing tool-calling system, so that I can use web context seamlessly.

#### Acceptance Criteria

1. WHEN ACE receives a user request THEN it SHALL call buildContextBundle to get RAG+KAG data
2. WHEN context is insufficient THEN ACE SHALL call buildToolPlan and execute suggested tools (web_search, fetch_url)
3. WHEN tools complete THEN ACE SHALL call buildContextBundle again to get updated context
4. WHEN context is sufficient THEN ACE SHALL call buildPrompt to assemble final prompt with evidence
5. WHEN prompt is ready THEN ACE SHALL send it to LLM (Gemma3/Claude/Gemini) for generation

### Requirement 20: Performance and Scalability

**User Story:** As a system architect, I want the ingestion pipeline to handle high throughput, so that we can crawl and process many documents efficiently.

#### Acceptance Criteria

1. WHEN processing documents THEN the system SHALL handle at least 10 concurrent crawls
2. WHEN embedding generation is slow THEN the system SHALL batch requests to Ollama (up to 10 texts per request)
3. WHEN Qdrant search is slow THEN the system SHALL use pgvector as fallback with acceptable latency (<500ms)
4. WHEN storage is slow THEN the system SHALL use async writes to MinIO without blocking pipeline
5. WHEN system is under load THEN the system SHALL maintain <2 second p95 latency for context retrieval

---

## Success Criteria

- [ ] Web search integration working with result storage
- [ ] Crawler respects robots.txt and rate limits
- [ ] HTML cleaning produces readable markdown
- [ ] Chunking creates 800-1200 token segments with metadata
- [ ] Embeddings stored in both Postgres pgvector and Qdrant
- [ ] Summaries generated and stored in MinIO
- [ ] Entities and relations extracted for KAG
- [ ] Hybrid retrieval combines cosine + freshness + graph boost
- [ ] Context bundle assembly returns RAG + KAG + metadata
- [ ] Tool plan suggests next actions based on context quality
- [ ] Prompt assembly includes constraints + evidence + plan
- [ ] Ingestion API endpoint enqueues jobs to RabbitMQ
- [ ] Worker processes jobs asynchronously
- [ ] Context retrieval API returns bundles in <500ms
- [ ] Database schema with pgvector indexes deployed
- [ ] MinIO buckets organized and accessible
- [ ] Qdrant collection configured with proper settings
- [ ] Error logging comprehensive and actionable
- [ ] Adapter integrated with existing ACE system
- [ ] Performance meets targets (10 concurrent crawls, <2s p95 latency)

---

## Technical Constraints

- **Embedding Model**: nomic-embed-text (384 dimensions)
- **Embedding Service**: Ollama at http://localhost:11434
- **Vector Databases**: Postgres 17 with pgvector + Qdrant
- **Object Storage**: MinIO (S3-compatible)
- **Message Queue**: RabbitMQ for async job processing
- **Chunk Size**: 800-1200 tokens
- **Retrieval Limit**: Top 40 candidates, return top 10 after scoring
- **Token Budget**: 4000 tokens for context bundle
- **Freshness Thresholds**: <7 days (+1.0), 7-30 days (+0.5), >30 days (+0.0)
- **Graph Boost**: Entity match (+0.5), 1-hop neighbor (+0.25)

---

**Last Updated:** December 20, 2025
