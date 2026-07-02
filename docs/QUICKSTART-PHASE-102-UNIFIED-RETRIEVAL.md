# Quick Start: Phase 102 Unified Retrieval (Today)

**Goal**: Get keyword semantic similarity search working today (150ms end-to-end)

**Time**: 60 min setup + 30 min per test cycle

---

## 1. Apply Schema Migration (5 min)

```bash
cd sveltekit-frontend

# Create migration (if not already done)
npx drizzle-kit generate --name phase_102_noun_reranker

# Run migration
npx drizzle-kit migrate

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT column_name FROM information_schema.columns 
   WHERE table_name='code_features' 
   AND column_name IN ('topology_summary','noun_terms','page_rank_score');"
# Expected: 3 rows
```

---

## 2. Populate noun_terms (Cache BM25 Tags) (15 min)

```bash
# Script: populate noun_terms from code_features.feature_id + feature_label + summary
node scripts/atlas/populate-feature-nouns.mjs --dry-run

# If output looks good:
node scripts/atlas/populate-feature-nouns.mjs --apply

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as features_with_nouns 
   FROM code_features WHERE noun_terms IS NOT NULL AND jsonb_array_length(noun_terms) > 0;"
```

**What this does**: Extracts env keys, symbols, nouns from feature_id/label → stores in JSONB for reranking.

---

## 3. Test Noun Reranker Endpoint (10 min)

```bash
# Start dev server (if not running)
npm run dev

# Test keyword search
curl "http://localhost:5173/api/phase102/retrieval-pipeline?q=DATABASE_URL&explain=true" | jq '.'

# Expected response:
{
  "query": "DATABASE_URL",
  "noun_extraction": {
    "nouns": ["DATABASE"],
    "envKeys": ["DATABASE_URL"],
    "symbols": [],
    "keywords": []
  },
  "top_candidates": [
    {
      "feature_id": "repo_env_map__top_entries",
      "final_score": 0.87,
      "component_scores": {
        "semantic": 0.75,
        "lexical": 0.82,
        "noun_overlap": 0.91,
        ...
      }
    }
  ],
  "infrastructure_health": {
    "overall_status": "degraded",
    "critical_services_down": ["Postgres", "TurboVec"]
  }
}
```

---

## 4. Add Semantic Tags to Qdrant Payloads (20 min)

If Qdrant is up, add `semantic_tags` to payloads:

```bash
# Script to sync tags to Qdrant
node scripts/qdrant/sync-semantic-tags.mjs --dry-run

# If good:
node scripts/qdrant/sync-semantic-tags.mjs --apply --collection codebase_chunks_768

# Verify
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.payload_schema'
# Should show: "semantic_tags": {"type": "text"}
```

---

## 5. Test Multi-Vector Search (15 min)

### Via PGVector (SQL)
```sql
-- In psql or your DB client:
SELECT 
  chunk_id,
  feature_id,
  bm25_score,
  semantic_tags
FROM codebase_chunk_index
WHERE semantic_tags && ARRAY['DATABASE', 'connection']::text[]
ORDER BY bm25_score DESC
LIMIT 5;
```

### Via Qdrant (gRPC/HTTP)
```bash
# Qdrant tag filtering + ANN
curl -X POST http://127.0.0.1:6333/collections/codebase_chunks_768/points/search \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.1, 0.2, ...384 dims...],
    "limit": 20,
    "filter": {
      "should": [
        {"key": "semantic_tags", "match": {"value": "DATABASE"}},
        {"key": "semantic_tags", "match": {"value": "connection"}}
      ]
    }
  }' | jq '.result[]'
```

---

## 6. Wire Go Retrieval Search Endpoint (15 min)

Go Retrieval must be running (:8100):

```bash
# Check if Go Retrieval is up
curl http://127.0.0.1:8100/health | jq '.'

# If up, test hybrid search:
curl -X POST http://127.0.0.1:8100/search \
  -H "Content-Type: application/json" \
  -d '{
    "q": "DATABASE connection pooling",
    "mode": "hybrid",
    "limit": 20,
    "explain": true
  }' | jq '.candidates | .[0:3]'

# Expected:
[
  {
    "id": "retrieval.postgres.pool",
    "keyword_score": 0.88,
    "semantic_score": 0.75,
    "authority_score": 0.62,
    "final_score": 0.78,
    "tags": ["DATABASE", "connection", "pool", "Postgres"]
  }
]
```

---

## 7. Test Gemma4 Tool-Calling Loop (10 min, requires Gemma4 :8090)

```bash
# Check Gemma4
curl http://127.0.0.1:8090/v1/models | jq '.data[0].id'

# Test via MCP (if TRACE :8788 is running)
curl -X POST http://127.0.0.1:8788/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "kb.trace_search",
      "arguments": {
        "q": "DATABASE connection pooling",
        "mode": "hybrid",
        "limit": 10,
        "explain": true
      }
    }
  }' | jq '.result'
```

---

## 8. Verify Infrastructure Health (5 min)

```bash
# Check all critical services via health endpoint
curl "http://localhost:5173/api/phase102/retrieval-pipeline?q=ping&explain=false" \
  | jq '.infrastructure_health'

# Expected output shows:
{
  "overall_status": "degraded" or "healthy",
  "critical_services_down": ["Postgres", "TurboVec"],
  "services": {
    "Gemma4": {"status": "up", "latency_ms": 45, "fallback_used": false},
    "Go Retrieval": {"status": "up", "latency_ms": 22, "fallback_used": false},
    "Qdrant": {"status": "up", "latency_ms": 18, "fallback_used": false}
  }
}
```

---

## Troubleshooting

### "Cannot find noun_terms column"
```bash
# Migration didn't apply
npx drizzle-kit migrate --force
# OR manually:
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < drizzle/0103_add_topology_and_noun_summaries.sql
```

### Go Retrieval returns 503
```bash
# Go Retrieval service down or misconfigured
docker ps | grep go-retrieval
# If missing, start it:
cd ../go-services/retrieval && go run main.go
```

### Qdrant semantic_tags not synced
```bash
# Manually sync payloads:
node scripts/qdrant/sync-semantic-tags.mjs --apply --force
# Verify:
curl http://127.0.0.1:6333/collections/codebase_chunks_768/points/1 | jq '.result.payload'
```

### Infrastructure health shows all down
```bash
# Check Docker containers
docker ps --all | grep -E "postgres|qdrant|redis|gemma4|go-retrieval"

# Start missing containers
docker-compose up -d legal-ai-postgres legal-ai-redis legal-ai-qdrant

# Wait 10s, then re-test health
curl "http://localhost:5173/api/phase102/retrieval-pipeline?q=test" | jq '.infrastructure_health'
```

---

## Performance Targets (by stage)

| Stage | Service | Latency | Target |
|-------|---------|---------|--------|
| Keyword extraction | Local | 1-2ms | <5ms |
| Lexical search | PGVector BM25 | 5-10ms | <20ms |
| Semantic search | Qdrant ANN | 15-25ms | <50ms |
| Tag clustering | Qdrant payload filter | 2-5ms | <10ms |
| RRF fusion | Local blend | 2-3ms | <10ms |
| Go Retrieval total | Orchestrator | 40-60ms | <100ms |
| MCP tool call | TRACE bridge | 10-15ms | <50ms |
| Gemma4 synthesis | LLM | 80-120ms | <150ms |
| **End-to-end** | Full pipeline | **150-200ms** | **<250ms** |

---

## Example Queries to Test

```bash
# 1. Environment keys
curl "http://localhost:5173/api/phase102/retrieval-pipeline?q=DATABASE_URL+REDIS_PASSWORD&explain=true"

# 2. Symbols
curl "http://localhost:5173/api/phase102/retrieval-pipeline?q=validateSession+embedPacket&explain=true"

# 3. Domain concepts
curl "http://localhost:5173/api/phase102/retrieval-pipeline?q=SOM+clustering+PageRank&explain=true"

# 4. Complex query
curl "http://localhost:5173/api/phase102/retrieval-pipeline?q=DATABASE+connection+pooling+Postgres+threads&explain=true"
```

---

## Next Steps (After Today)

1. ✅ Populate noun_terms (DONE)
2. ⏳ A5: Graph refresh → populate topology_summary + som_cell (20 min)
3. ⏳ E2: Feature labels → tag-based clustering (30 min)
4. ⏳ E3: Batch-fix → use noun overlap scores for prioritization (1h)
5. ⏳ Phase 103: RRF fusion wiring (parallel)
6. ⏳ Phase 104: LangGraph Symphony + subagents (after Phase 103)

---

**Status**: ✅ **READY TO EXECUTE** — All 8 steps runnable today.

Start with step 1 (migration), then test 3 (endpoint), then iterate through 4-8.

