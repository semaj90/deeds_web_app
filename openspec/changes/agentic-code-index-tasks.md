# OpenSpec: Agentic Code Index Tasks

## Service Registry and Infrastructure

### Task 1: Service Port Registry Update

**Owner**: DevOps

**Scope**: Update `openspec/config.yaml` with Phase 110 service endpoints

**Changes**:
```yaml
services:
  postgres:
    host: 127.0.0.1
    port: 5434          # Windows host mapping from container 5432
    database: legal_ai_db
    required: true      # Hard blocker if unavailable
    
  qdrant:
    host: 127.0.0.1
    port: 6333
    collection: codebase_chunks_768
    required: true      # Hard blocker
    
  ollama:
    host: 127.0.0.1
    port: 11434
    model: embeddinggemma:latest
    required: true      # Hard blocker
    
  neo4j:
    host: 127.0.0.1
    port: 7687
    required: true      # Hard blocker
    
  redis:
    host: 127.0.0.1
    port: 6379
    required: false     # Graceful degrade without cache
    
  seaweedfs_s3:
    host: 127.0.0.1
    port: 8333          # S3 gateway (was MinIO at 9000)
    master_port: 9333
    filer_port: 8382
    required: false     # Optional object store
```

**Validation**: Create health check script that probes all required services at startup.

---

### Task 2: Environment Configuration Harmonization

**Owner**: Configuration Management

**Scope**: Normalize env var names across all services

**Changes**:
```bash
# Canonical naming (current)
CRAWL4AI_HOST=http://127.0.0.1:8000
CRAWL4AI_ENABLED=true
OLLAMA_HOST=http://127.0.0.1:11434
QDRANT_URL=http://127.0.0.1:6333
NEO4J_URI=bolt://127.0.0.1:7687
POSTGRES_URL=postgresql://...

# Additions for Phase 110
LLAMA_SERVER_HOST=127.0.0.1
LLAMA_SERVER_PORT=8090
LLAMA_SERVER_THREADS=8
LLAMA_SERVER_NGL=99

# SeaweedFS (replaces MinIO)
SEAWEED_S3_PORT=8333
SEAWEED_ENDPOINT=127.0.0.1
SEAWEED_MASTER_PORT=9333
SEAWEED_FILER_PORT=8382
SEAWEED_ACCESS_KEY=minio      # Compatible with old MinIO SDK
SEAWEED_SECRET_KEY=minio123
```

**Validation**: Audit all scripts that read env vars to ensure they use correct names. No hardcoded ports.

---

## Acquisition Layer

### Task 3: Crawl4AI Adapter Implementation

**Owner**: Ingest Team

**Scope**: Wire Crawl4AI client into end-to-end pipeline

**Deliverables**:
- `src/lib/server/ingest/crawl4ai-client.ts` (HTTP client + retry logic) ✅ DONE
- `src/lib/server/ingest/crawled-document.schema.ts` (Zod validation) ✅ DONE
- Integration test: crawl real URL, validate CrawledDocument
- Performance benchmark: latency per URL (target <45s)

**Acceptance Criteria**:
- crawl(url) returns valid CrawledDocument or throws ZodError
- crawlBatch(urls, concurrency=3) works correctly
- Exponential backoff on retry (1s, 2s, 4s)
- content_hash computed and included in output

---

### Task 4: SearXNG Discovery Adapter

**Owner**: Search Team

**Scope**: Implement ephemeral URL discovery (no persistence)

**Deliverables**:
- `src/lib/server/discovery/searxng-client.ts` (HTTP client)
- SearchObservationV1 schema (Zod)
- Integration with Crawl4AI (discovery → fetch loop)
- Rate limiting (max 10 queries/min)

**Acceptance Criteria**:
- searchSearXNG(query) returns SearchObservationV1[]
- Results are NOT persisted to Postgres
- Fallback to manual URL list if SearXNG unavailable
- Graceful error handling (skip, do not break pipeline)

---

### Task 5: Canonical Ingestion Bridge

**Owner**: Data Platform

**Scope**: Atomicity-guaranteed INSERT to Postgres

**Deliverables**:
- `src/lib/server/ingest/postgres-ingest-boundary.ts` (Postgres INSERT) ✅ DONE
- Deduplication by content_hash
- Chunking (sliding_window default, semantic deferred)
- Lineage tracking (source_ref, source_revision, embedding_model)
- RabbitMQ event emission (non-blocking)

**Acceptance Criteria**:
- ingestCrawledDocument(crawled, userId, workspaceId) is atomic
- Duplicates detected (content_hash lookup)
- Chunks persisted with full lineage
- Event emitted after Postgres COMMIT

---

## Canonical Storage

### Task 6: Graphify Schema Migration (Prerequisite)

**Owner**: Data Platform

**Scope**: Apply Graphify schema to Postgres (discovery phase first)

**Pre-requisites** (10-step discovery checklist):
1. ✅ Inspect drizzle/meta/_journal.json for current migration state
2. ✅ Locate canonical schema owner (src/lib/server/db/schema-postgres.ts)
3. ✅ Verify UUID v4 helpers exist (crypto.randomUUID())
4. ✅ Check workspace_id column type in existing tables (VARCHAR or UUID?)
5. ✅ Verify chunk_id/packet_id naming consistency across schema
6. ✅ Inspect atlas_documents + atlas_chunks tables (pre-existing?)
7. ✅ Check for FK constraints pointing to Graphify tables
8. ✅ Verify feature_id + feature_label nullable/required
9. ✅ Inspect drizzle/manual/ for sidecar migrations (may conflict)
10. ✅ Read CLAUDE.md Drizzle Safety Rule for migration approval workflow

**Migration DDL**:
```sql
CREATE TABLE graphify_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id VARCHAR(255) NOT NULL,
  run_date DATE NOT NULL,
  indexed_files INTEGER,
  symbols_found INTEGER,
  edges_created INTEGER,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE graphify_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  file_hash CHAR(64),
  UNIQUE(file_path)
);

CREATE TABLE graphify_run_files (
  run_id UUID REFERENCES graphify_runs(id),
  file_id UUID REFERENCES graphify_files(id),
  PRIMARY KEY(run_id, file_id)
);

CREATE TABLE graphify_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol_name VARCHAR(255) NOT NULL,
  symbol_kind VARCHAR(50),
  file_id UUID REFERENCES graphify_files(id),
  line_number INTEGER,
  UNIQUE(symbol_name, file_id)
);

CREATE TABLE graphify_edges (
  source_id UUID REFERENCES graphify_symbols(id),
  target_id UUID REFERENCES graphify_symbols(id),
  edge_type VARCHAR(50),
  PRIMARY KEY(source_id, target_id, edge_type)
);

CREATE TABLE graphify_projection_outbox (
  id SERIAL PRIMARY KEY,
  packet_key VARCHAR(255) NOT NULL,
  projection_type VARCHAR(50),
  payload JSONB,
  projected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Validation**:
- drizzle-kit generate (verify no DROP statements)
- drizzle-kit migrate (apply migrations in order)
- Verify row counts: graphify_runs, graphify_files, graphify_symbols, graphify_edges
- Verify outbox is empty after first run (events emitted)

---

### Task 7: atlas_facts + atlas_fact_arguments Schema

**Owner**: Data Platform

**Scope**: Add N-ary fact storage (for gate 10 fact extraction)

**Deliverables**:
- Drizzle schema extension (atlas_facts + atlas_fact_arguments tables)
- Migration SQL
- Fact validation Zod schema

**Schema**:
```sql
CREATE TABLE atlas_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key VARCHAR(255) NOT NULL,
  source_ref TEXT NOT NULL,
  fact_text TEXT NOT NULL,
  confidence REAL,
  reasoning_trace TEXT,
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE atlas_fact_arguments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id UUID NOT NULL REFERENCES atlas_facts(id) ON DELETE CASCADE,
  argument_index INTEGER,
  argument_name VARCHAR(100),
  argument_value TEXT,
  argument_type VARCHAR(50)
);

CREATE INDEX idx_atlas_facts_packet_key ON atlas_facts(packet_key);
CREATE INDEX idx_atlas_facts_source_ref ON atlas_facts(source_ref);
CREATE INDEX idx_atlas_fact_arguments_fact_id ON atlas_fact_arguments(fact_id);
```

**Acceptance Criteria**:
- Both tables created and indexed
- Foreign key constraints in place
- Zod schema validates fact structure
- Migration safely applies without dropping existing data

---

## Retrieval Integration

### Task 8: Multi-Lane Retrieval Orchestrator

**Owner**: Retrieval Team

**Scope**: Implement 6-parallel-lane retrieval with RRF fusion

**Deliverables**:
- `src/lib/server/retrieval/unified-orchestrator.ts` (orchestrator)
- Lane implementations:
  - Lane 1: Qdrant dense vector (qdrant-dense.ts)
  - Lane 2: Postgres BM25 trigram (postgres-bm25.ts)
  - Lane 3: Neo4j graph expansion (neo4j-graph.ts)
  - Lane 4: SOM topology (som-topology.ts)
  - Lane 5: Domain classifier (domain-classifier.ts)
  - Lane 6: Freshness scoring (freshness-boost.ts)
- RRF fusion (reciprocal-rank-fusion.ts)

**Acceptance Criteria**:
- All 6 lanes execute in parallel (async/await Promise.all)
- RRF formula: 1 / (K + rank) where K=60
- Weights sum to 1.0 (0.35 + 0.25 + 0.15 + 0.10 + 0.05 + 0.10)
- Deduplication by packet_key before returning
- Top-10 final results
- Graceful lane degradation (if one lane fails, continue with others)

---

### Task 9: ACE Context Assembler

**Owner**: Context Team

**Scope**: Build bounded context envelope (≤4,800 tokens)

**Deliverables**:
- `src/lib/server/ace/context-assembler.ts`
- ACEPacket interface (queryId, candidates[], totalTokens, laneStats)
- Token counting (via approximate heuristic: chars/4)
- Candidate truncation (each ≤800 tokens)

**Acceptance Criteria**:
- Takes top-10 candidates from retrieval
- Respects ACL (filters by access_scope + user_id)
- Bounded to 4,800 tokens max
- Includes lane statistics (contribution %)
- Ready for Gemma4 synthesis

---

## End-to-End Proof and Validation

### Task 10: 16-Gate Proof Suite

**Owner**: QA/Validation

**Scope**: Implement all 16 gates (scaffolded in phase-110-retrieval-flow.ts)

**Deliverables**:
- `src/lib/server/ingest/end-to-end-retrieval-flow.ts` ✅ (gates 1-5 implemented, 6-16 scaffolded)
- Gate implementations:
  - Gates 1-5: CRAWLED, VALIDATED, PERSISTED, CHUNKED, EMBEDDING_RECORDED ✅
  - Gates 6-9: QDRANT, TOPK, DOMAIN, ENTITY_RESOLUTION
  - Gates 10-16: FACT_EXTRACTION, HYPERGRAPH, EXPANSION, RRF, ACE, ACL, ANSWER

**Acceptance Criteria**:
- runEndToEndProof(sourceUrl, userId, workspaceId) completes
- Returns 16 gate results (passed: boolean, proof: string)
- Expected output: 5/16 PROVEN, 11/16 DEFERRED
- npm script: `npm run phase110:proof:run` with example URL

---

### Task 11: Integration Test Suite

**Owner**: QA

**Scope**: Comprehensive end-to-end testing

**Test Cases**:
1. **Happy Path**: URL → 16 gates PROVEN (or DEFERRED as expected)
2. **Deduplication**: Insert same content twice, verify second skipped
3. **Chunking**: Verify chunk count matches expected split
4. **ACL Filtering**: private document not visible to other users
5. **Lane Degradation**: One lane fails, others continue
6. **Content Hash Collision**: Two URLs with identical content
7. **Missing Embedding**: Chunk without embedding_model recorded
8. **Timeout Handling**: Crawl4AI timeout after 45s

**Framework**: Vitest + fixtures

---

## Documentation and Reference

### Task 12: Phase 110 Reference Documentation

**Owner**: Documentation

**Scope**: Create searchable reference for operators

**Deliverables**:
- `docs/phase-110-external-discovery-guide.md` (how to run end-to-end)
- `docs/phase-110-retrieval-lane-tuning.md` (adjust RRF weights)
- `docs/phase-110-troubleshooting.md` (common issues)
- `docs/phase-110-operator-runbook.md` (daily operations)

**Content**:
- Component ownership diagram
- Service port mapping
- Env var checklist
- Proof gate explanations
- RRF weight tuning guide
- Cache invalidation rules

---

## Deployment Checklist

### Pre-Flight Validation (Before Phase 110 Go-Live)

- [ ] All 4 required services UP (Postgres, Qdrant, Ollama, Neo4j)
- [ ] Graphify schema migration applied (10-step discovery checklist complete)
- [ ] Crawl4AI adapter tested with real URL
- [ ] 16-gate proof suite passes (5/16 PROVEN expected)
- [ ] ACL filtering verified (private docs not visible cross-user)
- [ ] RRF fusion produces deterministic ranking
- [ ] Health check endpoint passes all probes
- [ ] Documentation complete and reviewed
- [ ] Operator runbook reviewed by SRE team

### Rollout Plan

1. **Internal Testing** (1 week):
   - Run 16-gate proof suite nightly
   - Monitor lane performance metrics
   - Tune RRF weights based on relevance feedback

2. **Staging Deployment** (1 week):
   - Deploy to staging environment
   - Load test: 100 concurrent queries
   - Verify data parity (Postgres ↔ Qdrant ↔ Neo4j)

3. **Production Gradual Rollout** (1 week):
   - Deploy to 10% of users
   - Monitor error rates and latency
   - Verify cache hit rates (target >80%)
   - Gradually increase to 100%

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Gate Success Rate | 5/16 PROVEN | Nightly proof run |
| Query Latency P99 | <20s | RRF orchestrator timing |
| Cache Hit Rate | >80% | Redis key hits / total queries |
| ACL Violations | 0 | Query logs, cross-user access attempts |
| Lane Degradation | Graceful | Error rate, fallback success |
| Data Parity | 100% | Postgres ↔ Qdrant consistency checks |

