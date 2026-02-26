# Implementation Tasks: ACE Contextual Web Ingestion & RAG+KAG Pipeline

## Overview

This document provides a step-by-step implementation checklist for the ACE contextual web ingestion system. Tasks are organized by component and include acceptance criteria for verification.

---

## Phase 1: Database Schema and Infrastructure Setup

### Task 1.1: Create Database Schema

**Files to Create:**
- `sveltekit-frontend/src/lib/db/schema/ace-web.ts`
- `drizzle/migrations/0001_ace_web_schema.sql`

**Acceptance Criteria:**
- [ ] Drizzle schema file created with all 5 tables (ace_sources, ace_docs, ace_chunks, ace_entities, ace_edges)
- [ ] Migration SQL file created with pgvector extension and indexes
- [ ] Type exports available for use in services
- [ ] Migration runs successfully: `npm run db:migrate`
- [ ] Tables visible in database: `psql $DATABASE_URL -c "\dt ace_*"`
- [ ] pgvector extension enabled: `SELECT * FROM pg_extension WHERE extname = 'vector';`

**Estimated Time:** 2 hours

---

### Task 1.2: Setup MinIO Buckets

**Files to Create:**
- `scripts/setup-ace-minio.sh`

**Acceptance Criteria:**
- [ ] Script creates 3 buckets: ace-web-raw, ace-web-derived, ace-eval-logs
- [ ] Buckets have proper access policies
- [ ] Script is idempotent (can run multiple times safely)
- [ ] Verification: `mc ls local/` shows all 3 buckets

**Estimated Time:** 1 hour

---

### Task 1.3: Setup Qdrant Collection

**Files to Create:**
- `sveltekit-frontend/src/lib/services/ace-web/qdrant-service.ts`

**Acceptance Criteria:**
- [ ] QdrantService class created with ensureCollection() method
- [ ] Collection configured with 384 dimensions and Cosine distance
- [ ] Collection created automatically on first use
- [ ] Verification: `curl http://localhost:6333/collections/ace_chunks`

**Estimated Time:** 2 hours

---

### Task 1.4: Setup RabbitMQ Queue

**Files to Update:**
- `docker-compose.yml`

**Acceptance Criteria:**
- [ ] RabbitMQ service added to docker-compose.yml
- [ ] Management UI accessible at http://localhost:15672
- [ ] Queue 'ace_web_ingest' created with durable=true
- [ ] Verification: Login to management UI and see queue

**Estimated Time:** 1 hour

---

## Phase 2: Core Services Implementation

### Task 2.1: Implement MinIO Service

**Files to Create:**
- `sveltekit-frontend/src/lib/services/ace-web/minio-service.ts`

**Acceptance Criteria:**
- [ ] MinIOService class with methods: storeRawHtml, storeCleanMarkdown, storeSummary, storeChunks, getObject
- [ ] S3Client configured with MinIO endpoint
- [ ] All methods handle errors gracefully
- [ ] Unit tests pass: `npm test minio-service.test.ts`

**Estimated Time:** 3 hours

---

### Task 2.2: Implement Qdrant Service (Complete)

**Files to Create:**
- `sveltekit-frontend/src/lib/services/ace-web/qdrant-service.ts`
- `sveltekit-frontend/src/lib/services/ace-web/qdrant-service.test.ts`

**Acceptance Criteria:**
- [ ] QdrantService class with methods: ensureCollection, upsertChunk, search
- [ ] Search supports filters, score threshold, and limit
- [ ] Error handling with fallback to pgvector
- [ ] Unit tests pass with 100% coverage

**Estimated Time:** 4 hours

---

### Task 2.3: Implement ACE Context Service

**Files to Create:**
- `sveltekit-frontend/src/lib/services/ace-web/ace-context-service.ts`
- `sveltekit-frontend/src/lib/services/ace-web/ace-context-service.test.ts`

**Acceptance Criteria:**
- [ ] AceContextService class with methods: buildContextBundle, buildToolPlan, buildPrompt
- [ ] Hybrid scoring implemented: 0.65*cosine + 0.10*freshness + 0.05*graph
- [ ] Freshness boost: <7 days (+1.0), 7-30 days (+0.5), >30 days (+0.0)
- [ ] Graph boost: entity match (+0.5), 1-hop neighbor (+0.25)
- [ ] Token budget enforcement (4000 tokens default)
- [ ] Unit tests pass with all scoring scenarios covered

**Estimated Time:** 6 hours

---

## Phase 3: API Endpoints

### Task 3.1: Implement Ingestion Endpoint

**Files to Create:**
- `sveltekit-frontend/src/routes/api/ace/web/ingest/+server.ts`
- `tests/integration/ace-web-ingest.test.ts`

**Acceptance Criteria:**
- [ ] POST /api/ace/web/ingest endpoint created
- [ ] Validates input (urls array required)
- [ ] Creates/updates ace_sources records
- [ ] Enqueues jobs to RabbitMQ with priority
- [ ] Returns job IDs and success message
- [ ] Handles errors gracefully (400 for validation, 503 for RabbitMQ unavailable)
- [ ] Integration test passes

**Estimated Time:** 4 hours

---

### Task 3.2: Implement Context Retrieval Endpoint

**Files to Create:**
- `sveltekit-frontend/src/routes/api/ace/context/+server.ts`
- `tests/integration/ace-context-retrieval.test.ts`

**Acceptance Criteria:**
- [ ] GET /api/ace/context endpoint created
- [ ] Accepts query parameter (required) and filters (optional)
- [ ] Returns ContextBundle with chunks, entities, edges, summary
- [ ] Supports filters: domain, date_from, date_to, tags, limit
- [ ] Handles errors gracefully (400 for missing query, 500 for internal errors)
- [ ] Integration test passes

**Estimated Time:** 3 hours

---

## Phase 4: Worker Implementation

### Task 4.1: Implement Python Worker

**Files to Create:**
- `backend/workers/ace_web_worker.py`
- `backend/requirements-ace-worker.txt`
- `backend/Dockerfile.ace-worker`

**Acceptance Criteria:**
- [ ] Worker connects to RabbitMQ and consumes from 'ace_web_ingest' queue
- [ ] Implements full pipeline: crawl → clean → chunk → embed → store
- [ ] Respects robots.txt and rate limits
- [ ] Computes content hash and skips unchanged content
- [ ] Stores raw HTML and cleaned markdown in MinIO
- [ ] Creates doc record in ace_docs table
- [ ] Chunks text into 800-1200 token segments
- [ ] Generates embeddings using Ollama
- [ ] Stores chunks in ace_chunks table and Qdrant
- [ ] Generates summary and stores in MinIO
- [ ] Updates source status (ok/error/blocked)
- [ ] Handles errors and logs to ace_eval_logs
- [ ] Worker can be started with: `python backend/workers/ace_web_worker.py`

**Estimated Time:** 8 hours

---

### Task 4.2: Implement HTML Cleaning

**Files to Update:**
- `backend/workers/ace_web_worker.py` (clean_html method)

**Acceptance Criteria:**
- [ ] Removes navigation, scripts, styles, footer, header, aside elements
- [ ] Converts to clean markdown with headings preserved
- [ ] Handles malformed HTML gracefully
- [ ] Output is readable and focused on content

**Estimated Time:** 2 hours

---

### Task 4.3: Implement Chunking Strategy

**Files to Update:**
- `backend/workers/ace_web_worker.py` (chunk_text method)

**Acceptance Criteria:**
- [ ] Chunks are 800-1200 tokens each
- [ ] Uses tiktoken with cl100k_base encoding
- [ ] Includes 200 token overlap between chunks
- [ ] Preserves heading context in metadata
- [ ] Metadata includes: url, tags, chunk_index, token_count

**Estimated Time:** 3 hours

---

### Task 4.4: Implement Entity and Relation Extraction

**Files to Update:**
- `backend/workers/ace_web_worker.py` (extract_knowledge method)

**Acceptance Criteria:**
- [ ] Extracts entities with types: TECH, PERSON, ORG, CONCEPT
- [ ] Extracts relations as triples: (src_entity, rel, dst_entity)
- [ ] Computes weight based on co-occurrence frequency
- [ ] Stores entities in ace_entities table
- [ ] Stores edges in ace_edges table
- [ ] Includes entities and relations in summary JSON

**Estimated Time:** 4 hours

---

## Phase 5: ACE Adapter Integration

### Task 5.1: Update ACE Adapter

**Files to Update:**
- `sveltekit-frontend/src/lib/services/error-analysis/ace-adapter.ts`

**Acceptance Criteria:**
- [ ] Imports AceContextService
- [ ] processRequest() method calls buildContextBundle()
- [ ] Checks context quality with buildToolPlan()
- [ ] Executes web_search tool if context is stale/insufficient
- [ ] Waits for ingestion to complete (or polls)
- [ ] Retrieves context again after ingestion
- [ ] Calls buildPrompt() with all context
- [ ] Sends prompt to LLM (Gemma3/Claude/Gemini)
- [ ] Returns response, context, and tool calls

**Estimated Time:** 4 hours

---

### Task 5.2: Implement Web Search Integration

**Files to Create:**
- `sveltekit-frontend/src/lib/services/ace-web/web-search-service.ts`

**Acceptance Criteria:**
- [ ] Integrates with web search API (DuckDuckGo, Brave, or similar)
- [ ] Returns top N URLs for query
- [ ] Handles rate limits and errors
- [ ] Stores search results snapshot in MinIO

**Estimated Time:** 3 hours

---

## Phase 6: Testing and Validation

### Task 6.1: Write Unit Tests

**Files to Create:**
- `sveltekit-frontend/src/lib/services/ace-web/minio-service.test.ts`
- `sveltekit-frontend/src/lib/services/ace-web/qdrant-service.test.ts`
- `sveltekit-frontend/src/lib/services/ace-web/ace-context-service.test.ts`

**Acceptance Criteria:**
- [ ] All services have unit tests with >80% coverage
- [ ] Tests use setupTest/cleanupTest from test-utils
- [ ] Tests use mock service URLs
- [ ] All tests pass: `npm test`

**Estimated Time:** 6 hours

---

### Task 6.2: Write Integration Tests

**Files to Create:**
- `tests/integration/ace-web-ingestion.test.ts`
- `tests/integration/ace-context-retrieval.test.ts`
- `tests/integration/ace-hybrid-scoring.test.ts`

**Acceptance Criteria:**
- [ ] End-to-end test: ingest URL → verify chunks created
- [ ] Context retrieval test: query → verify bundle returned
- [ ] Hybrid scoring test: verify scores in valid range and sorted
- [ ] All integration tests pass

**Estimated Time:** 4 hours

---

### Task 6.3: Manual Testing

**Test Scenarios:**
1. Ingest a URL and verify chunks in database
2. Query context and verify hybrid scoring
3. Test stale context detection
4. Test insufficient context detection
5. Test prompt assembly with all sections
6. Test worker error handling (invalid URL, rate limit, etc.)

**Acceptance Criteria:**
- [ ] All manual test scenarios pass
- [ ] No errors in logs
- [ ] Performance meets targets (<2s p95 latency for context retrieval)

**Estimated Time:** 3 hours

---

## Phase 7: Documentation and Deployment

### Task 7.1: Update Environment Configuration

**Files to Update:**
- `.env.example`
- `docker-compose.yml`

**Acceptance Criteria:**
- [ ] All ACE web ingestion environment variables documented
- [ ] Docker Compose includes RabbitMQ and ace-web-worker services
- [ ] README updated with setup instructions

**Estimated Time:** 2 hours

---

### Task 7.2: Create Deployment Scripts

**Files to Create:**
- `scripts/deploy-ace-web.sh`
- `scripts/verify-ace-web.sh`

**Acceptance Criteria:**
- [ ] Deploy script runs migrations, creates buckets, starts services
- [ ] Verify script checks all services are healthy
- [ ] Scripts are idempotent

**Estimated Time:** 2 hours

---

### Task 7.3: Write User Documentation

**Files to Create:**
- `.kiro/specs/ace-contextual-web-ingestion/USER_GUIDE.md`

**Acceptance Criteria:**
- [ ] Documents how to trigger web ingestion from UI
- [ ] Documents how to query context
- [ ] Includes examples and screenshots
- [ ] Explains hybrid scoring and freshness boost

**Estimated Time:** 2 hours

---

## Phase 8: Performance Optimization

### Task 8.1: Implement Caching

**Files to Create:**
- `sveltekit-frontend/src/lib/services/ace-web/cache-service.ts`

**Acceptance Criteria:**
- [ ] Redis cache for embeddings (24-hour TTL)
- [ ] Redis cache for Qdrant results (5-minute TTL)
- [ ] Redis cache for entities (1-hour TTL)
- [ ] Cache hit rate >50% in production

**Estimated Time:** 4 hours

---

### Task 8.2: Implement Batch Processing

**Files to Update:**
- `backend/workers/ace_web_worker.py`

**Acceptance Criteria:**
- [ ] Batch embedding generation (10 texts per request)
- [ ] Batch Qdrant upserts (100 points per request)
- [ ] Parallel crawling (10 concurrent requests)
- [ ] Performance improvement: >2x faster than sequential

**Estimated Time:** 3 hours

---

### Task 8.3: Database Optimization

**Files to Create:**
- `drizzle/migrations/0002_ace_web_optimization.sql`

**Acceptance Criteria:**
- [ ] Partial index for recent chunks (<30 days)
- [ ] Analyze tables for query planner
- [ ] Verify query performance: <100ms for vector search

**Estimated Time:** 2 hours

---

## Summary

**Total Estimated Time:** 75 hours (approximately 2 weeks for 1 developer)

**Critical Path:**
1. Phase 1: Infrastructure Setup (6 hours)
2. Phase 2: Core Services (13 hours)
3. Phase 3: API Endpoints (7 hours)
4. Phase 4: Worker Implementation (17 hours)
5. Phase 5: ACE Integration (7 hours)
6. Phase 6: Testing (13 hours)
7. Phase 7: Documentation (6 hours)
8. Phase 8: Optimization (9 hours)

**Dependencies:**
- Phase 2 depends on Phase 1 (infrastructure must be ready)
- Phase 3 depends on Phase 2 (services must be implemented)
- Phase 4 depends on Phase 2 (services must be available)
- Phase 5 depends on Phases 2, 3, 4 (all components must be ready)
- Phase 6 depends on Phases 2-5 (implementation must be complete)
- Phase 8 can be done in parallel with Phase 6-7

**Risk Mitigation:**
- Start with Phase 1 to validate infrastructure setup
- Implement Phase 2 services with comprehensive unit tests
- Test each phase before moving to the next
- Use feature flags to enable/disable ACE web ingestion in production

---

**Last Updated:** December 20, 2025
