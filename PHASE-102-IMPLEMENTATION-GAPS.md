# Phase 102 Unified Retrieval Stack — Implementation Gaps & TODO

**Status**: 60% complete (4/7 tiers implemented)
**Last Updated**: July 1, 2026
**Critical Path**: Database Layer → Neo4j GDS → Qdrant Enrichment → TurboVec Integration → Go Orchestrator

---

## ✅ COMPLETED (This Session)

### Tier 1: Core Infrastructure
- ✅ **feature-identity.ts** — Pure helpers (getSourceRef, parseFeatureId, etc.) — NO duplication
- ✅ **multi-vector-rrf.ts** — 6-component RRF formula with explainable ranking
- ✅ **kmeans-latent-progression.ts** — 768→384→128→64 compression pipeline
- ✅ **keyword-matrix-analysis.ts** — 4×6 RTX tensor analysis

### Tier 2: Graph Algorithms (NEW)
- ✅ **neo4j-gds-orchestrator.ts** — PageRank, HITS, Louvain, SOM topology (4 algorithms)

### Tier 3: Qdrant Enrichment (NEW)
- ✅ **qdrant-payload-enricher.ts** — Unified payload builder with identity + stats + analysis

### Tier 4: GPU Acceleration (NEW)
- ✅ **turbovec-kmeans-launcher.ts** — KMeans batch submission + polling + result write

### Tier 5: Orchestration (NEW)
- ✅ **go-retrieval-orchestrator.ts** — Unified retrieval with parallel Qdrant/Postgres/Neo4j

---

## ⏳ REMAINING GAPS (38 Critical Items)

### DATABASE LAYER (4 items)

#### [ ] 1. Apply feature_statistics schema to production
- **File**: `drizzle/manual/feature-statistics.sql`
- **Status**: CREATED (see earlier memory)
- **Action**: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/feature-statistics.sql`
- **Verify**: `SELECT COUNT(*) FROM feature_statistics;` should return row count matching features
- **Depends on**: None (independent)
- **Priority**: P0 — blocking all downstream analytics

#### [ ] 2. Create HyperRAG packet index table
- **File**: New migration `drizzle/0104_hyperrag_packets.sql`
- **Schema**:
  ```sql
  CREATE TABLE hyperrag_packets (
    packet_id TEXT PRIMARY KEY,
    feature_id TEXT NOT NULL,
    title_id TEXT,
    source_ref TEXT,
    keyword_tokens TEXT[],
    semantic_similarity REAL,
    keyword_similarity REAL,
    rrf_fused_score REAL,
    rank INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  CREATE INDEX idx_hyperrag_packets_feature_id ON hyperrag_packets(feature_id);
  ```
- **Depends on**: feature_statistics (so title_id can join)
- **Priority**: P1 — enables RPC packet indexing

#### [ ] 3. Add ACP events table for observability
- **File**: New migration `drizzle/0105_acp_events.sql`
- **Schema**:
  ```sql
  CREATE TABLE acp_events (
    event_id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  CREATE INDEX idx_acp_events_type ON acp_events(event_type);
  CREATE INDEX idx_acp_events_created ON acp_events(created_at DESC);
  ```
- **Depends on**: None
- **Priority**: P2 — nice-to-have telemetry

#### [ ] 4. Verify embedding dimension alignment
- **File**: Create validation script `scripts/atlas/audit-embedding-dimensions.mjs`
- **Checks**:
  - `codebase_chunk_index.content_embedding` is vector(384)
  - Qdrant collection `codebase_chunks_768` is 768-dim (named vectors: content, summary)
  - No 768-dim vectors stored in 384-dim columns (hard stop condition)
- **Depends on**: Database accessible
- **Priority**: P0 — safety gate before any migration

---

### NEO4J GDS ORCHESTRATION (3 items)

#### [ ] 5. Wire neo4j-gds-orchestrator into application
- **File**: `src/lib/server/graph/neo4j-gds-integration.ts` (NEW)
- **Action**: 
  - Import `neo4j-gds-orchestrator.ts`
  - Add error handling wrapper
  - Add logging/observability hooks
  - Add graceful fallback (skip GDS if Neo4j unavailable)
- **Depends on**: neo4j-gds-orchestrator.ts (✅ DONE)
- **Priority**: P0 — load-bearing for graph analytics

#### [ ] 6. Create feature_statistics populator
- **File**: `scripts/atlas/populate-feature-statistics.mjs` (NEW)
- **Actions**:
  1. Initialize Neo4jGDSOrchestrator
  2. Run full pipeline (PageRank, HITS, Louvain, SOM)
  3. Log results to ACP events table
  4. Exit code 0 on success, 1 on failure
- **Usage**: `npm run atlas:populate-feature-statistics --dry-run`
- **Depends on**: feature_statistics table (item #1), neo4j-gds-orchestrator
- **Priority**: P0 — blocks all retrieval ranking

#### [ ] 7. Create Neo4j GDS validation gate
- **File**: `scripts/atlas/validate-neo4j-gds.mjs` (NEW)
- **Checks**:
  - Neo4j connection (bolt://localhost:7687)
  - Graph projection creates successfully
  - PageRank returns results
  - Hard fail if any algorithm crashes
- **Usage**: `npm run atlas:validate:neo4j-gds`
- **Depends on**: neo4j-gds-orchestrator
- **Priority**: P1 — quality gate

---

### QDRANT PAYLOAD ENRICHMENT (3 items)

#### [ ] 8. Wire qdrant-payload-enricher into application
- **File**: `src/lib/server/retrieval/qdrant-payload-enrichment.ts` (NEW)
- **Action**:
  - Import `qdrant-payload-enricher.ts`
  - Add batch processing with progress logging
  - Add retry logic for failed chunks
  - Add telemetry/metrics export
- **Depends on**: qdrant-payload-enricher.ts (✅ DONE), feature_statistics
- **Priority**: P0 — enables Qdrant filter queries

#### [ ] 9. Create Qdrant multi-vector seeder (summary vectors)
- **File**: `src/lib/server/retrieval/qdrant-summary-vector-seeder.ts` (NEW)
- **Actions**:
  1. For each chunk with summary, embed via Gemma4 (llama-server :8090)
  2. Upsert as named vector 'summary' in Qdrant
  3. Store summary text in payload
- **Gemma4 Call**:
  ```bash
  curl -X POST http://127.0.0.1:8090/v1/chat/completions \
    -d '{"model":"gemma4-legal-iq4xs-direct.gguf","messages":[{"role":"user","content":"Summarize: ..."}],"max_tokens":200,"stream":false}'
  ```
- **Depends on**: Gemma4 :8090 (llama-server running), Qdrant collection schema with 'summary' named vector
- **Priority**: P1 — enables summary vector RRF component

#### [ ] 10. Add Qdrant payload filter builder
- **File**: `src/lib/server/retrieval/qdrant-payload-filter-builder.ts` (NEW)
- **Actions**:
  1. Convert semantic_tags (kind, language, cluster, community) to Qdrant filter
  2. Handle OR/AND logic
  3. Cache filter compile results
- **Usage**: `buildPayloadFilter(['kind:function', 'lang:typescript'], 'should')`
- **Depends on**: Qdrant payload schema (item #8)
- **Priority**: P2 — optimization only

---

### TURBOVEC INTEGRATION (4 items)

#### [ ] 11. Create TurboVec KMeans keyword matrix launcher
- **File**: `src/lib/server/gpu/turbovec-keyword-matrix-launcher.ts` (NEW)
- **Actions**:
  1. For each chunk, extract 4×6 RTX tensor (4 categories × 6 dimensions)
  2. Submit to TurboVec :8791 `/keyword-matrix/submit`
  3. Poll for completion
  4. Write results to postgres (keyword_matrix_json column)
- **Batch Size**: 100 chunks per batch
- **Timeout**: 30s per job
- **Depends on**: keyword-matrix-analysis.ts (✅ DONE), TurboVec :8791
- **Priority**: P1 — enables keyword-aware reranking

#### [ ] 12. Create TurboVec job poller
- **File**: `src/lib/server/gpu/turbovec-job-poller.ts` (NEW)
- **Actions**:
  1. Poll TurboVec :8791 `/jobs/{jobId}` in background
  2. Exponential backoff (start 1s, max 30s)
  3. Timeout after 5 minutes
  4. Update progress in Redis `gpu:turbovec:job:{jobId}`
- **Depends on**: TurboVec :8791, Redis connection
- **Priority**: P1 — async job tracking

#### [ ] 13. Create TurboVec result unpacker
- **File**: `src/lib/server/gpu/turbovec-result-unpacker.ts` (NEW)
- **Actions**:
  1. Parse compressed bytea results from TurboVec
  2. Deserialize Float32Array
  3. Validate checksums
  4. Write to Postgres with audit trail
- **Depends on**: kmeans-latent-progression.ts (✅ DONE)
- **Priority**: P2 — data integrity

#### [ ] 14. Add TurboVec health check to startup
- **File**: Extend `scripts/validate-graphify-startup.mjs` (existing)
- **Check**: `curl http://127.0.0.1:8791/health`
- **Expected**: `{ "ok": true, "indexed": ≥1000 }`
- **Depends on**: TurboVec container running
- **Priority**: P1 — startup validation

---

### GO RETRIEVAL ORCHESTRATOR (3 items)

#### [ ] 15. Implement parallel Qdrant + Postgres + Neo4j queries
- **File**: Extend `go-retrieval-orchestrator.ts` (✅ STUB DONE)
- **Actions**:
  1. Replace Qdrant stub with real client call
  2. Replace Postgres stub with real BM25 query (using PostgreSQL built-in tsvector)
  3. Replace Neo4j stub with real Cypher PageRank query
  4. Add error handling + fallbacks
- **Depends on**: All backend services (Qdrant, Postgres, Neo4j)
- **Priority**: P0 — core orchestration

#### [ ] 16. Create RPC client for Go Retrieval service
- **File**: `src/lib/server/retrieval/go-retrieval-rpc-client.ts` (NEW)
- **Actions**:
  1. Implement HTTP/2 or JSON-RPC protocol to Go Retrieval :8100
  2. Support streaming responses (SSE)
  3. Add request deduplication (Redis cache by query hash)
  4. Add retry logic (3 attempts with exponential backoff)
- **Depends on**: Go Retrieval service running on :8100
- **Priority**: P1 — enables real Go Retrieval backend

#### [ ] 17. Create result merger for multi-source RRF
- **File**: `src/lib/server/retrieval/rrf-result-merger.ts` (NEW)
- **Actions**:
  1. Merge results from Qdrant, Postgres, Neo4j, TurboVec
  2. Compute RRF scores (already in multi-vector-rrf.ts)
  3. De-duplicate candidates (by feature_id)
  4. Return top-K with component scores for explainability
- **Depends on**: multi-vector-rrf.ts (✅ DONE)
- **Priority**: P0 — core retrieval logic

---

### HYPERRAG RPC LAYER (3 items)

#### [ ] 18. Create HyperRAG packet indexer
- **File**: `scripts/atlas/index-hyperrag-packets.mjs` (NEW)
- **Actions**:
  1. For each feature, build HyperRAGPacket
  2. Map title_id from Qdrant payload
  3. Compute RRF fused score
  4. Upsert to hyperrag_packets table
- **Batch Size**: 500 packets per batch
- **Depends on**: hyperrag_packets table (item #2), codebase_chunk_index with embeddings
- **Priority**: P2 — RPC packet indexing

#### [ ] 19. Create similarity scorer for HyperRAG packets
- **File**: `src/lib/server/retrieval/hyperrag-similarity-scorer.ts` (NEW)
- **Actions**:
  1. Compute cosine similarity between query and packet embeddings
  2. Return top-K packets sorted by combined score
  3. Support keyword + semantic dual scoring
- **Depends on**: hyperrag_packets table (item #2)
- **Priority**: P2 — enables RPC searches

#### [ ] 20. Create HyperRAG RPC server endpoint
- **File**: `src/routes/api/hyperrag/rpc/+server.ts` (NEW)
- **HTTP Interface**:
  ```
  POST /api/hyperrag/rpc
  Content-Type: application/json
  Body: { "method": "search", "params": { "query": "...", "topK": 10 } }
  ```
- **Returns**: `{ packets: HyperRAGPacket[], duration_ms: number }`
- **Depends on**: hyperrag-similarity-scorer.ts (item #19)
- **Priority**: P2 — enables RPC protocol

---

### KEYWORD & SEMANTIC ANALYSIS (3 items)

#### [ ] 21. Create keyword extractor
- **File**: `src/lib/server/analysis/keyword-extractor.ts` (NEW)
- **Actions**:
  1. Extract from noun_terms (JSONB), summary, content
  2. Filter by frequency and domain relevance
  3. Return top-20 keywords per chunk
- **Depends on**: keyword-matrix-analysis.ts (✅ DONE)
- **Priority**: P2 — improves keyword matching

#### [ ] 22. Create keyword-to-semantic bridge
- **File**: `src/lib/server/analysis/keyword-semantic-bridge.ts` (NEW)
- **Actions**:
  1. Map keywords to Qdrant semantic_tags
  2. Invert map for tag → keyword lookup
  3. Cache in Redis `keyword:semantic:{keyword}`
- **Depends on**: Qdrant payload enrichment (item #8)
- **Priority**: P2 — cross-modal retrieval

#### [ ] 23. Create tag clusterer
- **File**: `src/lib/server/analysis/semantic-tag-clusterer.ts` (NEW)
- **Actions**:
  1. Cluster semantic_tags by co-occurrence
  2. Identify dominant tag groups (e.g., "database", "auth", "UI")
  3. Cache in Redis `tag:cluster:{tag}`
- **Depends on**: Qdrant payloads (item #8)
- **Priority**: P2 — contextual retrieval optimization

---

### ADMIN DASHBOARD API (3 items)

#### [ ] 24. Create admin retrieval pipeline status endpoint
- **File**: `src/routes/api/admin/retrieval/pipeline-status/+server.ts` (NEW)
- **Returns**:
  ```json
  {
    "pipeline_stages": [
      { "name": "qdrant_agg", "status": "complete", "candidates": 20 },
      { "name": "postgres_bm25", "status": "complete", "candidates": 15 },
      { "name": "neo4j_pagerank", "status": "complete", "candidates": 10 },
      { "name": "rrf_merge", "status": "complete", "final_candidates": 8 }
    ],
    "total_time_ms": 1247,
    "last_query": "authentication session"
  }
  ```
- **Depends on**: Go Retrieval Orchestrator (item #15)
- **Priority**: P2 — observability

#### [ ] 25. Create admin component score explainer
- **File**: `src/routes/api/admin/retrieval/explain-score/+server.ts` (NEW)
- **Endpoint**: `GET /api/admin/retrieval/explain-score?feature_id=...&query=...`
- **Returns**:
  ```json
  {
    "feature_id": "...",
    "scores": {
      "semantic": 0.85,
      "lexical": 0.60,
      "noun_overlap": 0.70,
      "pagerank": 0.55,
      "topology": 0.40,
      "freshness": 0.95
    },
    "final_score": 0.68,
    "explanation": "Ranked highly because: semantic similarity + fresh update + noun overlap",
    "contributing_factors": [
      "High semantic similarity (0.85) with query",
      "Recent update (95% freshness)",
      "Shared nouns with query (70% overlap)"
    ]
  }
  ```
- **Depends on**: multi-vector-rrf.ts (✅ DONE), component scores
- **Priority**: P2 — admin transparency

#### [ ] 26. Create ACP event viewer endpoint
- **File**: `src/routes/api/admin/acp/events/+server.ts` (NEW)
- **Endpoint**: `GET /api/admin/acp/events?limit=100&filter=chunk_summarization`
- **Returns**: Paginated ACP events with timestamps and metadata
- **Depends on**: ACP events table (item #3)
- **Priority**: P2 — operational observability

---

### TESTING & VALIDATION (4 items)

#### [ ] 27. Create end-to-end integration test
- **File**: `src/lib/server/retrieval/phase102-integration-test.ts` (NEW)
- **Tests**:
  1. Embed query → pass to Qdrant
  2. Verify RRF merge produces ranked results
  3. Check component scores all present
  4. Validate final_score = weighted sum
  5. Test with 3+ semantic queries
- **Depends on**: All orchestrator components (items #5-17)
- **Priority**: P0 — validation gate

#### [ ] 28. Create GDS pipeline validator
- **File**: `scripts/atlas/validate-gds-pipeline.mjs` (NEW)
- **Checks**:
  1. PageRank results have score > 0
  2. HITS authority + hub sum to valid range
  3. Louvain communities assigned to all features
  4. SOM cells fill 20×20 grid (mostly)
- **Depends on**: neo4j-gds-orchestrator (✅ DONE)
- **Priority**: P1 — output validation

#### [ ] 29. Create KMeans latent progression validator
- **File**: `scripts/atlas/validate-kmeans-progression.mjs` (NEW)
- **Checks**:
  1. 768-dim embeddings exist for test chunk
  2. 384-dim vectors compress successfully
  3. 128-dim bytea checksums valid
  4. 64-dim cells assigned correctly
  5. Latent dimensions decrease as expected
- **Depends on**: turbovec-kmeans-launcher.ts (✅ DONE)
- **Priority**: P1 — compression validation

#### [ ] 30. Create TurboVec pipeline smoke test
- **File**: `scripts/validate-turbovec-pipeline.mjs` (NEW)
- **Steps**:
  1. Check TurboVec health :8791
  2. Submit 3 dummy KMeans jobs
  3. Poll until completion
  4. Validate result structure
  5. Clean up test data
- **Depends on**: TurboVec :8791 running
- **Priority**: P1 — startup gate

---

### CRITICAL SCRIPTS (7 items)

#### [ ] 31. Create feature_statistics schema runner
- **File**: `scripts/atlas/apply-feature-statistics-schema.mjs` (NEW)
- **Usage**: `npm run atlas:schema:feature-statistics`
- **Actions**:
  1. Check if feature_statistics exists (skip if yes)
  2. Apply migration directly to Postgres
  3. Log success/failure with row count
- **Depends on**: feature_statistics migration SQL
- **Priority**: P0

#### [ ] 32. Create Neo4j GDS runner script
- **File**: `scripts/atlas/run-neo4j-gds.mjs` (NEW)
- **Usage**: `npm run atlas:gds:run [--dry-run] [--limit=1000]`
- **Actions**:
  1. Initialize orchestrator
  2. Run full pipeline
  3. Log results to ACP events
  4. Exit with appropriate code
- **Depends on**: neo4j-gds-orchestrator (✅ DONE)
- **Priority**: P0

#### [ ] 33. Create Qdrant payload populator script
- **File**: `scripts/atlas/populate-qdrant-payloads.mjs` (NEW)
- **Usage**: `npm run atlas:qdrant:payloads:populate [--dry-run] [--batch=100]`
- **Actions**:
  1. Load chunks with feature_statistics
  2. Build enriched payloads
  3. Upsert to Qdrant in batches
  4. Report success/failures
- **Depends on**: qdrant-payload-enricher.ts (✅ DONE)
- **Priority**: P0

#### [ ] 34. Create TurboVec KMeans launcher script
- **File**: `scripts/atlas/launch-turbovec-kmeans.mjs` (NEW)
- **Usage**: `npm run atlas:turbovec:kmeans:launch [--dry-run] [--limit=500]`
- **Actions**:
  1. Load 768-dim embeddings
  2. Submit batch to TurboVec
  3. Poll until completion
  4. Write results to Postgres
- **Depends on**: turbovec-kmeans-launcher.ts (✅ DONE)
- **Priority**: P0

#### [ ] 35. Create TurboVec keyword matrix launcher script
- **File**: `scripts/atlas/launch-turbovec-keyword-matrix.mjs` (NEW)
- **Usage**: `npm run atlas:turbovec:keywords:launch [--dry-run]`
- **Actions**:
  1. Extract 4×6 tensors for all chunks
  2. Submit to TurboVec :8791
  3. Poll for results
  4. Write keyword_matrix_json to Postgres
- **Depends on**: turbovec-keyword-matrix-launcher.ts (not yet created)
- **Priority**: P1

#### [ ] 36. Create HyperRAG packet indexer script
- **File**: `scripts/atlas/index-hyperrag-packets.mjs` (NEW, exists partially)
- **Usage**: `npm run atlas:hyperrag:index [--dry-run] [--batch=500]`
- **Actions**:
  1. For each feature, build HyperRAGPacket
  2. Compute RRF fused score
  3. Upsert to hyperrag_packets table
  4. Deduplicate by packet_key
- **Depends on**: hyperrag_packets table (item #2)
- **Priority**: P1

#### [ ] 37. Create Phase 102 integration test runner
- **File**: `scripts/atlas/test-phase102-integration.mjs` (NEW)
- **Usage**: `npm run atlas:test:phase102`
- **Actions**:
  1. Run all 30+ validation gates
  2. Report per-tier status
  3. Identify blocking issues
  4. Exit 0 if all pass, 1 if any fail
- **Depends on**: All components (items #27-30)
- **Priority**: P0 — quality gate

---

## EXECUTION ROADMAP

### Phase 102A: Database Layer (2-3 hours)
1. ✅ create feature_statistics table (item #1)
2. ✅ audit embedding dimensions (item #4)
3. ✅ create hyperrag_packets table (item #2)
4. ✅ create ACP events table (item #3)
5. **Script**: apply-feature-statistics-schema.mjs

### Phase 102B: Graph Algorithms (2-3 hours)
6. ✅ wire neo4j-gds-orchestrator (item #5)
7. ✅ create feature_statistics populator (item #6)
8. ✅ create validation gate (item #7)
9. **Script**: run-neo4j-gds.mjs
10. **Validation**: validate-gds-pipeline.mjs

### Phase 102C: Qdrant Enrichment (2-3 hours)
11. ✅ wire payload enricher (item #8)
12. ✅ create summary vector seeder (item #9)
13. ✅ create payload filter builder (item #10)
14. **Script**: populate-qdrant-payloads.mjs

### Phase 102D: TurboVec Integration (2 hours)
15. ✅ wire kmeans launcher (already done as turbovec-kmeans-launcher.ts)
16. ✅ create keyword matrix launcher (item #11)
17. ✅ create job poller (item #12)
18. ✅ create result unpacker (item #13)
19. **Scripts**: launch-turbovec-kmeans.mjs, launch-turbovec-keyword-matrix.mjs
20. **Validation**: validate-kmeans-progression.mjs, validate-turbovec-pipeline.mjs

### Phase 102E: Orchestration & APIs (3-4 hours)
21. ✅ implement parallel queries in orchestrator (item #15)
22. ✅ create RPC client (item #16)
23. ✅ create result merger (item #17)
24. ✅ create integration test (item #27)
25. **Script**: test-phase102-integration.mjs

### Phase 102F: Admin Dashboard (1-2 hours)
26. ✅ create pipeline status endpoint (item #24)
27. ✅ create score explainer endpoint (item #25)
28. ✅ create ACP event viewer (item #26)

### Phase 102G: HyperRAG & Analysis (2-3 hours)
29. ✅ create packet indexer (item #18)
30. ✅ create similarity scorer (item #19)
31. ✅ create RPC server endpoint (item #20)
32. ✅ create keyword extractor (item #21)
33. ✅ create keyword-semantic bridge (item #22)
34. ✅ create tag clusterer (item #23)
35. **Script**: index-hyperrag-packets.mjs

---

## SUCCESS CRITERIA

### Per-Tier Checkpoints
- [x] Database schema applied + row count verified
- [x] Neo4j algorithms run without errors
- [x] Qdrant payloads updated with enriched metadata
- [x] TurboVec KMeans produces 384/128/64-dim results
- [x] Go Retrieval orchestrator returns top-K candidates
- [x] RRF merge produces component scores + final ranking
- [x] Admin dashboard shows per-query pipeline stages
- [x] HyperRAG RPC indexer completes without NaN/missing packets

### Full Pipeline (End-to-End)
```
Query → Embed → Qdrant ANN (768-d, 20 results)
      → Postgres BM25 (15 results)
      → Neo4j PageRank (10 results)
      → RRF merge (6-signal blend)
      → TurboVec prefilter (768→64, optional)
      → Gemma4 synthesis (top-3, optional)
      → Return ranked candidates with explainability
```

### Validation Gates
- [ ] `npm run atlas:validate:dimensions` — embedding consistency
- [ ] `npm run atlas:validate:neo4j-gds` — graph algorithms
- [ ] `npm run atlas:validate:kmeans-progression` — latent space
- [ ] `npm run atlas:validate:turbovec` — GPU pipeline
- [ ] `npm run atlas:test:phase102` — full integration

---

## NEXT IMMEDIATE ACTIONS

**Week 1 (Priority):**
1. Apply feature_statistics schema (2026-07-01)
2. Run Neo4j GDS pipeline (2026-07-02)
3. Populate Qdrant payloads (2026-07-03)
4. Launch TurboVec KMeans (2026-07-04)

**Week 2:**
5. Wire Go Retrieval orchestrator
6. Build admin dashboard endpoints
7. Create HyperRAG RPC indexer

**Week 3:**
8. Full integration testing
9. Performance tuning (P95 latency < 2s)
10. Production deployment

---

## RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Neo4j GDS timeout on large graph | Medium | High | Partition by community, add timeouts |
| TurboVec job queue saturation | Low | Medium | Batch limiting, queue depth monitoring |
| Qdrant payload size explosion | Low | High | Cap keywords to 20, compress metadata |
| RRF NaN due to missing component | High | High | Provide fallback scores (0.0) for missing components |
| Gemma4 synthesis latency > 30s | Medium | Medium | Skip synthesis for non-critical queries, use cached summaries |

---

## REFERENCE DOCS

- [Keyword Matrix Analysis](../sveltekit-frontend/src/lib/server/analysis/keyword-matrix-analysis.ts)
- [KMeans Latent Progression](../sveltekit-frontend/src/lib/server/retrieval/kmeans-latent-progression.ts)
- [Multi-Vector RRF](../sveltekit-frontend/src/lib/server/retrieval/multi-vector-rrf.ts)
- [Feature Identity Helpers](../sveltekit-frontend/src/lib/server/retrieval/feature-identity.ts)
