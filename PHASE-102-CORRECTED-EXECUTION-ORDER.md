# Phase 102 Corrected Execution Order

**Correction**: Identity tables (feature identity) stay stable. Statistics tables (PageRank, HITS, SOM) change often. Summaries are final explanation, not ranking sources.

**Architecture (Immutable)**:
```
Postgres
├─ identity (feature_id, source_ref, symbol, kind) — NEVER CHANGE
├─ statistics (pagerank, hits_authority, community, som_cell) — EPHEMERAL
└─ codebase_chunk_index.content_embedding (384-dim) — PRIMARY

Neo4j
├─ IMPORTS / BELONGS_TO_CLUSTER edges
└─ PageRank / HITS / Louvain computation

Qdrant
├─ codebase_chunks_768 (768-dim content vector)
└─ Named vectors (error, signature, summary) — MIRROR ONLY

TurboVec (:8791)
├─ 768→64 latent compression (hot memory reranking)
└─ NOT a search engine (prefilter only)

Go Retrieval
├─ Fan-out orchestrator
├─ RRF merge (6 signals)
└─ Returns ranked candidates

Gemma4 (:8090)
└─ Explanation only (bounded summary, not ranking)
```

---

## Corrected Execution Order

### Phase 1: Code Feature Edges (Build Identity Foundation)

```bash
# 1. Backfill code_features edges from AST
npm run atlas:code-features:edges:backfill --dry-run

# 2. Verify edges created
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT COUNT(*) as edge_count FROM code_features_edges;
"
# Expected: 10K+ edges (IMPORTS, CALLS, DEFINES, etc.)

# 3. Apply if verified
npm run atlas:code-features:edges:backfill --apply
```

**Status**: Identity foundation (who calls what, who imports what)

---

### Phase 2: Neo4j GDS Computation (Statistics Population)

```bash
# 1. Run Neo4j PageRank (1-2 min)
npm run atlas:code-features:pagerank --dry-run

# 2. Verify PageRank written to feature_statistics
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT feature_id, pagerank 
  FROM feature_statistics 
  WHERE pagerank > 0 
  ORDER BY pagerank DESC 
  LIMIT 5;
"
# Expected: feature_id | 7.06
#           feature_id | 5.42
#           ...

# 3. Apply if verified
npm run atlas:code-features:pagerank --apply

# 4. Run HITS (authority + hub)
npm run atlas:code-features:hits --apply

# 5. Run Louvain (community detection)
npm run atlas:code-features:louvain --apply

# 6. Verify all statistics populated
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT COUNT(*) as stats_count FROM feature_statistics 
  WHERE pagerank > 0 AND community > 0;
"
# Expected: 58K+ (match feature count)
```

**Status**: Statistics populated (PageRank, HITS, Louvain, community assignments)

---

### Phase 3: Feature Statistics Sync (Mirror to Qdrant Payloads)

```bash
# 1. Sync feature_statistics to Qdrant payload tags
npm run atlas:feature-statistics:sync --dry-run --batch=100

# 2. Verify Qdrant payloads enriched
curl -X POST http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}' | jq '.result[0].payload | {pagerank, community, som_cell_x, som_cell_y}'
# Expected: { "pagerank": 7.06, "community": 3, "som_cell_x": 12, "som_cell_y": 8 }

# 3. Apply if verified
npm run atlas:feature-statistics:sync --apply --batch=100
```

**Status**: Qdrant payloads enriched with graph statistics (enables payload-based filtering)

---

### Phase 4: Qdrant Payload Tags (Semantic + Keyword Tags)

```bash
# 1. Backfill semantic_tags (kind, language, cluster, community)
npm run atlas:qdrant:payload-tags:sync --dry-run --batch=100

# 2. Verify tags added
curl -X POST http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}' | jq '.result[0].payload.semantic_tags'
# Expected: ["kind:function", "lang:typescript", "cluster:42", "community:3"]

# 3. Apply if verified
npm run atlas:qdrant:payload-tags:sync --apply --batch=100
```

**Status**: Qdrant payloads tagged for multi-modal filtering

---

### Phase 5: Go Retrieval Smoke Test (Full Pipeline)

```bash
# 1. Test retrieval pipeline (query → embed → ANN → RRF → return)
npm run go-retrieval:feature-search:smoke --query="authentication session"

# Expected output:
# Query: "authentication session"
# Embedded: [0.12, 0.45, ..., 0.78]  (768-dim)
#
# Parallel Results:
#   Qdrant ANN: 20 candidates (semantic: 0.85)
#   Postgres BM25: 15 candidates (lexical: 0.60)
#   Neo4j PageRank: 10 candidates (authority: 0.55)
#
# RRF Merge:
#   Rank 1: auth.ts:validateSession (score: 0.68, components: {semantic: 0.85, lexical: 0.60, noun: 0.70, pagerank: 0.55, topology: 0.40})
#   Rank 2: auth.ts:createSession (score: 0.62, components: {...})
#   Rank 3: auth.ts:destroySession (score: 0.58, components: {...})
#
# Latency: 1247ms
#   - Qdrant: 45ms
#   - Postgres: 120ms
#   - Neo4j: 85ms
#   - RRF merge: 25ms
```

**Status**: Full retrieval pipeline working (Qdrant + Postgres + Neo4j + RRF)

---

### Phase 6: Batch Summarization Test (Explanation Layer)

```bash
# 1. Test Gemma4 summaries on top-10 results
npm run batch:summaries:test10 --query="authentication session"

# Expected:
# Processing top 10 results for query: "authentication session"
#
# Result 1: auth.ts:validateSession
#   Summary: "Validates user session via JWT token, checks expiration and signature, returns user ID if valid."
#   Confidence: 0.95
#   Model: gemma4-legal-iq4xs-direct.gguf
#
# Result 2: auth.ts:createSession
#   Summary: "Creates new session for authenticated user, stores in Redis, returns session token."
#   Confidence: 0.92
#
# ... (8 more)
#
# Total time: 12.3s (1.2s per summary @ 8090)
```

**Status**: Gemma4 summaries generated (explanation layer, not ranking)

---

## Critical Invariants (Do NOT Violate)

### 1. Identity Is Immutable
```
feature_id = path:symbol:kind
source_ref = canonical file path (derived from feature_id)
symbol = code identifier (derived from feature_id)
kind = function|class|interface|enum (derived from feature_id)

NEVER:
- Store source_ref redundantly (use getSourceRef(feature_id) helper)
- Store symbol redundantly (use getSymbol(feature_id) helper)
- Store kind redundantly (use getKind(feature_id) helper)
```

### 2. Statistics Are Ephemeral
```
feature_statistics table:
- pagerank (output of Neo4j GDS)
- hits_authority / hits_hub (output of Neo4j GDS)
- community (output of Louvain)
- som_cell_x / som_cell_y (output of SOM)
- cluster_degree, in_degree, out_degree, betweenness, freshness_days

NEVER:
- Use statistics for identity (they change on each recompute)
- Join on statistics columns as primary keys
- Assume statistics are consistent across time
```

### 3. Vector Search ≠ Ranking
```
Qdrant: Store 768-dim content vector
TurboVec: Compress to 64-dim for hot memory (prefilter, not search)
RRF: Rank using 6 independent signals

NEVER:
- Use Qdrant score as final ranking (it's one of 6 signals)
- Skip RRF merge (component scores enable explainability)
- Store 768-dim again if Qdrant already owns it
```

### 4. Summaries Are Explanation
```
Gemma4: Bounded summary (2-3 sentences, max 150 words)
Purpose: Explain top-3 results to user, not to feed back to ranking

NEVER:
- Use summary for ranking (use stats + vectors)
- Feed summary back into Qdrant (vector search owns that)
- Assume summary is stable (it changes with Gemma4 version)
```

### 5. Go Retrieval Is Orchestrator Only
```
Go Retrieval:
- Fans out to Qdrant, Postgres, Neo4j in parallel
- Merges results via RRF formula
- Returns ranked candidates + component scores

NEVER:
- Make Go Retrieval the source of truth (Postgres owns identity)
- Cache Go Retrieval results without TTL (statistics change)
- Use Go Retrieval for pure vector search (use Qdrant directly)
```

---

## Success Criteria (Per Phase)

### Phase 1: Code Features Edges
- [ ] `code_features_edges` table has 10K+ rows
- [ ] IMPORTS, CALLS, DEFINES relationships present
- [ ] No orphaned edges (both source and target exist in code_features)

### Phase 2: Neo4j GDS
- [ ] `feature_statistics` populated for 58K+ features
- [ ] PageRank scores > 0, sum ≈ feature count
- [ ] HITS authority + hub in valid range
- [ ] Louvain communities assigned to 100% of features

### Phase 3: Feature Statistics Sync
- [ ] Qdrant payloads include pagerank, community, som_cell_x, som_cell_y
- [ ] No NaN values in payloads
- [ ] Payload size < 10KB per point

### Phase 4: Qdrant Payload Tags
- [ ] semantic_tags populated for 100% of points
- [ ] Tags include kind, language, cluster, community
- [ ] Tags enable Qdrant payload filtering (no false negatives)

### Phase 5: Go Retrieval Smoke
- [ ] Query → embed → parallel queries → RRF merge → return
- [ ] P95 latency < 2s
- [ ] Component scores all present (no NaN)
- [ ] Final ranking matches RRF formula (0.25 + 0.20 + 0.20 + 0.15 + 0.12 + 0.08)

### Phase 6: Batch Summaries
- [ ] Gemma4 generates summary for top-10 results
- [ ] Summaries are 2-3 sentences, max 150 words
- [ ] Confidence scores present
- [ ] No errors / timeouts (timeout = 30s per summary)

---

## NPM Script Definitions (Add to package.json)

```json
{
  "scripts": {
    "atlas:code-features:edges:backfill": "node scripts/atlas/backfill-code-features-edges.mjs",
    "atlas:code-features:pagerank": "node scripts/atlas/run-pagerank-gds.mjs",
    "atlas:code-features:hits": "node scripts/atlas/run-hits-gds.mjs",
    "atlas:code-features:louvain": "node scripts/atlas/run-louvain-gds.mjs",
    "atlas:feature-statistics:sync": "node scripts/atlas/sync-feature-statistics-to-qdrant.mjs",
    "atlas:qdrant:payload-tags:sync": "node scripts/atlas/sync-qdrant-payload-tags.mjs",
    "go-retrieval:feature-search:smoke": "node scripts/atlas/smoke-test-go-retrieval.mjs",
    "batch:summaries:test10": "node scripts/atlas/batch-summarize-top10.mjs"
  }
}
```

---

## Rollback Plan (If Any Phase Fails)

### Phase 1 Rollback
```sql
DELETE FROM code_features_edges WHERE 1=1;
```

### Phase 2 Rollback
```sql
UPDATE feature_statistics 
SET pagerank = NULL, hits_authority = NULL, hits_hub = NULL, community = NULL
WHERE 1=1;
```

### Phase 3 Rollback
```bash
npm run atlas:qdrant:payload-tags:reset  # Remove pagerank/community/som_cell from payloads
```

### Phase 4 Rollback
```bash
npm run atlas:qdrant:payload-tags:reset  # Remove semantic_tags from payloads
```

### Phase 5 Rollback
No state to rollback (orchestrator test only)

### Phase 6 Rollback
No state to rollback (summaries are explanation, not data)

---

## Time Estimate

| Phase | Task | Duration | Dependencies |
|-------|------|----------|--------------|
| 1 | Code features edges | 5-10 min | AST already extracted |
| 2 | Neo4j GDS (PageRank + HITS + Louvain) | 5-10 min | Neo4j up, edges present |
| 3 | Feature statistics sync | 5-10 min | Statistics populated |
| 4 | Qdrant payload tags | 5-10 min | Statistics synced |
| 5 | Go Retrieval smoke | 2-3 min | All above complete |
| 6 | Batch summaries (top 10) | 15-20 min | Gemma4 :8090 up |
| **Total** | | **45-70 min** | |

---

## Key Insight: Why This Order

1. **Identity first** (code_features edges) — establishes who calls whom
2. **Statistics second** (Neo4j GDS) — computes centrality (PageRank, HITS, Louvain)
3. **Mirror sync** (Qdrant payloads) — enriches vector search with graph stats
4. **Semantic tags** (Qdrant tags) — enables multi-modal filtering
5. **Orchestrator test** (Go Retrieval smoke) — validates 6-signal RRF blend
6. **Explanation** (Gemma4 summaries) — bounds final output

**This order ensures: identity → computation → retrieval → explanation**

All stages are read-only after completion (statistics can be rebuilt, but identity is forever).
