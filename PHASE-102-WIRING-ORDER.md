# Phase 102 Implementation Wiring Order

**Status**: 60% complete — Orchestrators wired, backend integration pending
**Critical Path**: Database → Neo4j GDS → Qdrant Enrichment → TurboVec → Go Retrieval
**Estimated Time**: 2-3 weeks to full completion

---

## Week 1: Database Layer + Graph Algorithms (P0)

### Monday (Today) — Database Schema
```bash
# 1. Apply feature_statistics table
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db < \
  sveltekit-frontend/drizzle/manual/feature-statistics.sql

# 2. Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM feature_statistics;"
# Expected: 0 (empty, will be populated by GDS)

# 3. Create hyperrag_packets table
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  CREATE TABLE IF NOT EXISTS hyperrag_packets (
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
  CREATE INDEX IF NOT EXISTS idx_hyperrag_packets_feature_id 
    ON hyperrag_packets(feature_id);
"

# 4. Create ACP events table
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  CREATE TABLE IF NOT EXISTS acp_events (
    event_id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_acp_events_type ON acp_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_acp_events_created ON acp_events(created_at DESC);
"
```

### Tuesday — Neo4j GDS Pipeline
```bash
# 1. Test Neo4j connection
curl -u neo4j:password http://localhost:7687/db/neo4j/tx -d '{}' \
  -H "Content-Type: application/json"
# Expected: { transactionResults: ... }

# 2. Run GDS pipeline (all 4 algorithms)
npm run atlas:gds:run --dry-run

# 3. If dry-run passes, apply
npm run atlas:gds:run --apply

# 4. Verify results
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT feature_id, pagerank, hits_authority, community, som_cluster 
  FROM feature_statistics 
  ORDER BY pagerank DESC 
  LIMIT 10;
"
```

### Wednesday — Dimension Audit
```bash
# 1. Check embedding dimensions
npm run atlas:audit:dimensions

# Expected output:
# ✅ Ollama embeddinggemma: 384-dim ✓
# ✅ Postgres codebase_chunk_index.content_embedding: vector(384) ✓
# ✅ Qdrant codebase_chunks_768 points: 768-dim (named vector 'content') ✓
# ⚠️  NOTE: Qdrant 768-dim is for architectural flexibility; named vector 'content' is used for ANN search
```

### Thursday-Friday — Qdrant Payload Enrichment
```bash
# 1. Enrich Qdrant payloads (dry-run first)
npm run atlas:qdrant:payloads:populate --dry-run --batch=100

# Expected output:
# Enriching 40568 chunks...
# Uploaded 100 payloads to Qdrant
# ... (batches)
# Qdrant Payload Enrichment Complete
# Success: 40568, Failed: 0, Duration: ####ms

# 2. If dry-run passes, apply
npm run atlas:qdrant:payloads:populate --apply --batch=100

# 3. Verify payloads contain enriched metadata
# Query Qdrant directly:
curl -X POST http://localhost:6333/collections/codebase_chunks_768/points/search \
  -H "Content-Type: application/json" \
  -d '{"vector": [0.1, 0.2, ...], "limit": 1, "with_payload": true}' \
  | jq '.result[0].payload'
# Expected: { feature_id, source_ref, pagerank, hits_authority, noun_terms, semantic_tags, ... }
```

---

## Week 2: TurboVec + Go Retrieval Integration (P0)

### Monday — TurboVec KMeans Progression
```bash
# 1. Health check
curl http://127.0.0.1:8791/health | jq '.'
# Expected: { "ok": true, "indexed": ≥1000 }

# 2. Launch KMeans jobs (dry-run)
npm run atlas:turbovec:kmeans:launch --dry-run --limit=100

# 3. If passes, apply
npm run atlas:turbovec:kmeans:launch --apply --limit=500

# Expected output:
# Submitted: 500
# Processed: 480
# Failed: 20
# (20 failures acceptable due to OOM or job timeouts on RTX 3060 Ti)

# 4. Verify embeddings were written to Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT id, feature_id, 
         CASE WHEN embedding_384 IS NOT NULL THEN 'has 384' ELSE 'missing' END,
         CASE WHEN embedding_128 IS NOT NULL THEN 'has 128' ELSE 'missing' END,
         CASE WHEN embedding_64 IS NOT NULL THEN 'has 64' ELSE 'missing' END
  FROM codebase_chunk_index 
  WHERE embedding_384 IS NOT NULL OR embedding_128 IS NOT NULL OR embedding_64 IS NOT NULL
  LIMIT 10;
"
```

### Tuesday — TurboVec Keyword Matrix
```bash
# 1. Launch keyword matrix jobs
npm run atlas:turbovec:keywords:launch --dry-run --limit=100

# 2. Apply (if passes)
npm run atlas:turbovec:keywords:launch --apply

# Expected: 4×6 RTX tensor for each chunk (4 keyword categories, 6 analysis dimensions)
```

### Wednesday-Friday — Go Retrieval Orchestrator
```bash
# 1. Update orchestrator with real backend queries
# File: src/lib/server/retrieval/go-retrieval-orchestrator.ts
# 
# TODO items:
# - queryQdrantANN() → remove stub, use real Qdrant client
# - queryPostgresBM25() → implement PostgreSQL tsvector + tsrank
# - queryNeo4jPageRank() → implement real Cypher (SELECT from feature_statistics)
# - scoreSOMTopology() → compute SOM grid distances
# - embedQuery() → use real embedding service (:50051 or :11434)

# 2. Test orchestrator
npm run atlas:test:retrieval:orchestrator --query="authentication session"

# Expected output:
# Candidates: 5-10
# Scores: {semantic: 0.85, lexical: 0.60, noun_overlap: 0.70, pagerank: 0.55, topology: 0.40}
# Final Score: 0.68
# Total Time: 1247ms
# Stages: {qdrant: 45ms, postgres: 120ms, neo4j: 85ms, rrf: 25ms}
```

---

## Week 3: Admin Dashboard + HyperRAG + Full Integration (P1-P2)

### Monday — Admin Dashboard Endpoints
```bash
# 1. Create pipeline status endpoint
# File: src/routes/api/admin/retrieval/pipeline-status/+server.ts

# 2. Test
curl http://localhost:5173/api/admin/retrieval/pipeline-status?query=auth

# Expected:
# {
#   "pipeline_stages": [
#     { "name": "qdrant_agg", "status": "complete", "candidates": 20, "time_ms": 45 },
#     { "name": "postgres_bm25", "status": "complete", "candidates": 15, "time_ms": 120 },
#     ...
#   ],
#   "total_time_ms": 1247
# }

# 3. Create score explainer endpoint
# File: src/routes/api/admin/retrieval/explain-score/+server.ts

# 4. Test
curl "http://localhost:5173/api/admin/retrieval/explain-score?feature_id=auth.ts:validateSession:function&query=session"

# Expected:
# {
#   "scores": {
#     "semantic": 0.85,
#     "lexical": 0.60,
#     ...
#   },
#   "explanation": "Ranked highly because: semantic similarity + noun overlap"
# }
```

### Tuesday-Wednesday — HyperRAG RPC Indexer
```bash
# 1. Index HyperRAG packets
npm run atlas:hyperrag:index --dry-run --batch=500

# 2. Apply
npm run atlas:hyperrag:index --apply

# Expected: 58K+ packets indexed, each with RRF fused score

# 3. Verify RPC endpoint
curl -X POST http://localhost:5173/api/hyperrag/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "search", "params": {"query": "database connection", "topK": 10}}'

# Expected: 10 packets sorted by combined score
```

### Thursday-Friday — Full Integration Test
```bash
# 1. Run end-to-end test
npm run atlas:test:phase102:integration

# Expected output:
# ✅ Database schema applied
# ✅ Neo4j GDS algorithms executed
# ✅ Qdrant payloads enriched
# ✅ TurboVec KMeans completed
# ✅ Go Retrieval orchestrator working
# ✅ RRF merge produces valid scores
# ✅ Admin dashboard endpoints responding
# ✅ HyperRAG RPC indexer completed
# ✅ All 8/8 tiers LIVE_PASS

# 2. Performance validation
# Target: P95 latency < 2s for query → ranked results

# 3. Cleanup test data
npm run atlas:test:phase102:cleanup
```

---

## Validation Gates (Per-Tier)

### Tier 1: Database (Day 1)
- [ ] `feature_statistics` table has 58K+ rows
- [ ] `hyperrag_packets` table exists and is empty
- [ ] `acp_events` table exists and is empty

### Tier 2: Neo4j GDS (Day 2)
- [ ] PageRank scores: all > 0, sum ≈ count(features)
- [ ] HITS authority + hub: valid range
- [ ] Louvain communities: assigned to 100% of features
- [ ] SOM cells: 20×20 grid mostly filled (80%+)

### Tier 3: Qdrant Enrichment (Day 3-4)
- [ ] All Qdrant points have enriched payloads
- [ ] Semantic tags present for kind, language, cluster, community
- [ ] Noun terms extracted for 80%+ of chunks

### Tier 4: TurboVec (Day 5)
- [ ] 384-dim embeddings exist for 50%+ of chunks
- [ ] 128-dim compressed vectors exist for 40%+ of chunks
- [ ] 64-dim compressed vectors exist for 30%+ of chunks
- [ ] Keyword matrix 4×6 tensors present for 50%+ of chunks

### Tier 5: Go Retrieval (Day 8-9)
- [ ] Orchestrator executes all 6 parallel/sequential stages
- [ ] RRF merge produces valid final scores
- [ ] Component scores all present (no NaN)
- [ ] P95 latency < 2s

### Tier 6: Admin Dashboard (Day 10)
- [ ] Pipeline status endpoint returns stage breakdown
- [ ] Score explainer endpoint generates human-readable explanations
- [ ] ACP events logged for all operations

### Tier 7: HyperRAG (Day 11)
- [ ] 58K+ packets indexed with RRF scores
- [ ] RPC endpoint returns sorted packets
- [ ] Title ID mapping correct (100% match rate)

---

## Dependency Tree (Load-Bearing Order)

```
feature_statistics (Postgres)
├─ neo4j-gds-orchestrator.ts
│  ├─ populate-feature-statistics.mjs
│  └─ validate-gds-pipeline.mjs
├─ qdrant-payload-enricher.ts
│  ├─ populate-qdrant-payloads.mjs
│  └─ qdrant-summary-vector-seeder.ts
├─ turbovec-kmeans-launcher.ts
│  ├─ launch-turbovec-kmeans.mjs
│  └─ validate-kmeans-progression.mjs
├─ go-retrieval-orchestrator.ts
│  ├─ orchestrate-retrieval() function
│  └─ admin dashboard endpoints
└─ hyperrag-packets (Postgres)
   ├─ index-hyperrag-packets.mjs
   └─ /api/hyperrag/rpc endpoint

(All tiers must complete before Phase 102 is APPLY_PROVEN)
```

---

## Resource Requirements

### CPU/Memory
- **Neo4j GDS**: 2-5 min per algorithm (PageRank most expensive)
- **Qdrant enrichment**: 5-10 min for 40K+ points
- **TurboVec KMeans**: 30-60 min for 40K+ embeddings (GPU-accelerated, but batch-limited)
- **Go Retrieval**: Minimal (API orchestration layer)

### GPU (RTX 3060 Ti, 8GB)
- **TurboVec**: Concurrent KMeans batches (max 5-10 simultaneous jobs)
- **Gemma4 synthesis**: Optional (skip for non-critical queries)

### Disk
- **Postgres**: +50 MB (feature_statistics + hyperrag_packets)
- **Qdrant**: +100 MB (enriched payloads)
- **TurboVec**: No additional disk (sidecar GPU service)

---

## Rollback Plan

If any tier fails:

1. **Database schemas**: `DROP TABLE IF EXISTS` for new tables
2. **Neo4j GDS results**: `DELETE FROM feature_statistics WHERE pagerank IS NOT NULL`
3. **Qdrant payloads**: Re-run enricher with `--overwrite=false` (skip already-enriched)
4. **TurboVec results**: `UPDATE codebase_chunk_index SET embedding_384 = NULL WHERE id IN (...)`
5. **Go Retrieval**: Fallback to Qdrant-only search (remove orchestrator, use direct ANN)

---

## Success Criteria (Phase 102 Complete)

- [ ] All 37 gaps closed
- [ ] 8/8 tiers LIVE_PASS
- [ ] P95 latency < 2s (query → ranked results)
- [ ] Component score explanations generated for top-10 results
- [ ] Admin dashboard fully operational
- [ ] Integration test suite passes (30+ test gates)
- [ ] Zero NaN/missing values in RRF scores
- [ ] All backend services (Postgres, Neo4j, Qdrant, TurboVec) healthy
