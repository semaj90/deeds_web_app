# Phase 102 Unified Retrieval Stack

**Date**: July 2, 2026  
**Status**: ✅ **ARCHITECTURE DEFINED** — Wiring Phase 102 + Phase 103 in parallel

---

## Complete Stack (9 Layers)

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 9: LLM Orchestration (Gemma4 + Claude Subagents)      │
│  Gemma4 → MCP Tool Calls → Go Retrieval gRPC → LangGraph    │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 8: Multi-Agent Routing (LangGraph Symphony)            │
│  Task decomposition → parallel subagents → result synthesis  │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 7: MCP Tool Surface (TRACE :8788)                      │
│  29 tools: kb.trace_search, topology.*, graph.*, clusters.* │
│  Stateless HTTP → gRPC bridge to Go Retrieval                │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 6: Retrieval Orchestrator (Go Retrieval :8100)         │
│  Keyword extraction → parallel ANN + BM25 + tag clustering   │
│  Blends: Qdrant semantic + TurboVec prefilter + PG BM25      │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 5: Multi-Vector Search (Qdrant GPU + PGVector)         │
│  Qdrant: 34 collections (384-dim HNSW named vectors)         │
│  PGVector: Mirror subset (codebase_chunk_index content_384)  │
│  GPU Acceleration: CUDA for ANN + cosine similarity          │
│  Tag-based clustering: Payload metadata for semantic filter   │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 4: Prefiltering & Quantization (TurboVec :8791)        │
│  768-dim → 64-dim (4-bit quantized AE)                       │
│  ANN: 10K candidate reduction (768d → 64d → top-20 indices)  │
│  GPU: CUDA tensor operations for batch scoring               │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 3: Full-Text Search & Ranking (PostgreSQL)             │
│ Phase 1B (DONE): GIN tsvector + BM25 ranking on chunks       │
│ Phase 103 (wiring): BM25 + semantic + authority RRF fusion   │
│ Keyword semantic similarity: ts_rank_cd + noun overlap       │
│ Tag-based clustering: code_feature_edges SHARES_TAGS         │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 2: Daily Indexing (graphify startup pipeline)          │
│ AST extraction: ast-grep (Rust) → JSON parse (simdjson)      │
│ Code features: 11K symbols indexed daily                     │
│ Embedding: embeddinggemma (Ollama) → 384-dim vectors         │
│ GPU acceleration: LibTorch N-API (tensorrt_bridge.node)      │
│ BM25 computation: ts_rank_cd on tsvector columns             │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 1: Canonical Truth (PostgreSQL + SeaweedFS)            │
│ atlas_packets (58.3K): identity + metadata                   │
│ codebase_chunk_index (40.7K): chunks + embeddings            │
│ code_features (11K): symbols + topology + authority          │
│ code_feature_edges (30K+): relationships + weights           │
│ code_relations_v1: Lanes A/B/C (SHARES_TAGS, etc.)          │
└──────────────────────────────────────────────────────────────┘
```

---

## Keyword Semantic Similarity Search (Proposed)

### Current Gap
Right now: keyword search → exact term match (rg, BM25)
Missing: keyword search → semantic neighbors (env keys, domain concepts)

**Example**:
- User types: `"DATABASE connection pooling"`
- Current: matches literal DATABASEURL, connection, pooling
- Desired: ALSO matches Redis caching (semantic neighbor), Postgres thread pool, Drizzle ORM (related concepts)

### Solution: Tag-Based Semantic Clustering

**Data Flow**:
```
1. Keyword extraction (Layer 6 Go Retrieval)
   INPUT: "DATABASE connection pooling"
   OUTPUT: nouns=["DATABASE", "connection", "pooling"], envKeys=["DATABASE_URL"]

2. Tag lookup (Layer 5 Qdrant or PGVector)
   For each noun/env key:
     - Query Qdrant codebase_chunks_768 by payload tag
     - OR query PGVector code_features_tags GIN index
     - Return top-K semantic neighbors (cosine similarity > 0.75)
   
   EXAMPLE:
     "DATABASE" → [REDIS_URL (0.82), POSTGRES (0.79), QDRANT (0.71)]
     "connection" → [pool, session, socket, client] (0.78+)

3. Blend results (Layer 6 orchestrator)
   RRF fusion:
     - Exact keyword matches (rank_keyword)
     - Semantic neighbors (rank_semantic)
     - Authority boost (rank_pagerank)
   
   score = 1/(k + rank_keyword) + 0.6/(k + rank_semantic) + 0.3/(k + rank_authority)

4. Top features (Layer 3 PGVector or Qdrant)
   Return top-20 candidates with:
     - keyword_score (exact match)
     - semantic_similarity (neighbor match)
     - topology_boost (SOM cell proximity)
     - authority_boost (PageRank)
```

### Schema for Tag-Based Clustering

**Already exists**:
- `code_features`: has `static_tags` (GIN indexed)
- `code_feature_edges`: tracks `SHARES_TAGS` relationships (30K+ edges)
- `codebase_chunk_index`: has payload metadata with tags in Qdrant

**New** (Phase 103):
```sql
-- Qdrant payload sync (move tag clusters to Qdrant for GPU search)
ALTER TABLE codebase_chunk_index
ADD COLUMN IF NOT EXISTS semantic_tags TEXT[] DEFAULT '{}';
-- e.g., ["DATABASE", "connection_pool", "Postgres", "DATABASEURL"]

-- Code feature tag similarity cache (for KAG cross-feature rerank)
CREATE TABLE IF NOT EXISTS code_feature_tag_similarity (
  source_feature_id VARCHAR PRIMARY KEY,
  target_feature_id VARCHAR,
  similarity_score REAL,  -- cosine or Jaccard
  tag_overlap TEXT[],     -- shared tags
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_feature_tag_similarity_score 
ON code_feature_tag_similarity (similarity_score DESC);
```

---

## Multi-Vector Search (Qdrant GPU + PGVector Mirror)

### Qdrant (Primary: GPU-Accelerated)
```
Collection: codebase_chunks_768
Vectors:
  - "content" (384-dim, named vector) — semantic embedding
  - "summary" (256-dim, optional) — summary vector for cross-encode reranking
  - "tags" (sparse or dense) — tag similarity for semantic clustering

Payload (indexed for filtering):
  - source_ref: "src/lib/server/..."
  - feature_id: "retrieval.qdrant.search"
  - semantic_tags: ["vector", "search", "ANN", "Qdrant"]
  - page_rank_score: 0.23
  - som_cell: "12,7"

GPU Acceleration:
  - HNSW index: GPU-optimized nearest-neighbor search (CUDA)
  - Payload filtering: GPU-accelerated tag matching
  - Cosine similarity: tensorrt_bridge.node (LibTorch CUDA)
```

### PGVector (Secondary: SQL-Compatible)
```
Table: codebase_chunk_index
Columns:
  - content_embedding: vector(384) — mirror of Qdrant "content"
  - semantic_tags: TEXT[] — GIN indexed for tag filtering
  
Indexes:
  - idx_content_embedding_hnsw: HNSW on vector(384)
  - idx_semantic_tags_gin: GIN on TEXT[] for tag search
  - idx_bm25_brin: BRIN on bm25_score (Phase 1B)

Search example:
  SELECT * FROM codebase_chunk_index
  WHERE semantic_tags && ARRAY['DATABASE', 'connection_pool']  -- tag overlap
    AND content_embedding <-> query_vec < 0.3  -- semantic similarity
  ORDER BY bm25_score DESC  -- lexical ranking
  LIMIT 20;
```

### Why Both?
- **Qdrant**: GPU acceleration, real-time ANN, fast scaling
- **PGVector**: SQL transactions, joins with code_features, analytical queries, compliance (data stays in DB)
- **Mirror approach**: Query Qdrant first (10ms), verify against PGVector (audit), fallback to PGVector if Qdrant down

---

## Go Retrieval → MCP Tool Bridge

### Architecture

**Go Retrieval** (:8100 HTTP / gRPC :50053)
```
POST /search
{
  "q": "DATABASE connection pooling",
  "mode": "hybrid",  // keyword + semantic
  "limit": 20,
  "explain": true
}

Response:
{
  "candidates": [
    {
      "id": "retrieval.postgres.pool",
      "keyword_score": 0.88,
      "semantic_score": 0.75,
      "authority_score": 0.62,
      "final_score": 0.78,
      "tags": ["DATABASE", "connection", "pool", "Postgres"],
      "topology": "cluster_database_layer"
    }
  ],
  "explain": {
    "keyword_matches": 3,
    "semantic_neighbors": 7,
    "rrf_fusion": "1/(k+rank_kw) + 0.6/(k+rank_sem) + 0.3/(k+rank_auth)"
  },
  "latency_ms": 47
}
```

**MCP Tool Registration** (TRACE :8788)
```
Tool: kb.trace_search
  Input: query, mode, limit, explain
  Calls: Go Retrieval /search
  Output: structured candidates + traces
  
Tool: kb.semantic_neighbors
  Input: feature_id
  Calls: Go Retrieval + Qdrant tag clustering
  Output: neighbors ranked by tag similarity
  
Tool: topology.expand_neighborhood
  Input: feature_id, hops=1-3
  Calls: Neo4j + Go Retrieval
  Output: k-hop subgraph with RRF scores
```

**Gemma4 Orchestration** (LangGraph)
```python
# Gemma4 → MCP tool calls → synthesis loop

def search_task(query: str):
    # Stage 1: Extract keywords
    keywords = extract_nouns(query)
    
    # Stage 2: Call kb.trace_search via MCP
    results = mcp_client.call("kb.trace_search", {
        "q": query,
        "mode": "hybrid",
        "limit": 20,
        "explain": True
    })
    
    # Stage 3: Optional second-pass (semantic neighbors)
    if len(results) < 10:
        neighbors = mcp_client.call("kb.semantic_neighbors", {
            "feature_id": results[0]["id"]
        })
        results.extend(neighbors)
    
    # Stage 4: Synthesize
    synthesis = generate_answer(results, query)
    return synthesis
```

---

## Claude Subagents + LangGraph Symphony

### Parallel Subagent Pattern

```python
# LangGraph Symphony: coordinate multiple Claude instances

workflow = Graph()

# Node 1: Keyword analyzer (Claude mini)
def analyze_keywords(state):
    keywords = claude_mini.extract_nouns(state["query"])
    return {"keywords": keywords}

# Node 2: Semantic searcher (Gemma4 → Go Retrieval)
def semantic_search(state):
    results = go_retrieval.search(
        q=state["query"],
        mode="hybrid",
        limit=20
    )
    return {"semantic_results": results}

# Node 3: Topology expander (Claude retrieval)
def expand_topology(state):
    if state["semantic_results"]:
        top_id = state["semantic_results"][0]["id"]
        neighbors = mcp_client.call("topology.expand_neighborhood", {
            "feature_id": top_id,
            "hops": 2
        })
        return {"topology_expansion": neighbors}
    return {"topology_expansion": []}

# Node 4: Synthesizer (Gemma4 or Claude)
def synthesize(state):
    synthesis = gemma4.answer(
        query=state["query"],
        candidates=state["semantic_results"],
        topology=state["topology_expansion"],
        keywords=state["keywords"]
    )
    return {"synthesis": synthesis}

# Parallel execution
workflow.add_node("analyze", analyze_keywords)
workflow.add_node("search", semantic_search)
workflow.add_node("expand", expand_topology)
workflow.add_node("synthesize", synthesize)

workflow.add_edge("analyze", "search")
workflow.add_edge("search", "expand")  # Can run in parallel
workflow.add_edge("expand", "synthesize")

result = workflow.invoke({"query": "DATABASE connection pooling"})
```

### Why LangGraph?
- **State machine**: Tracks query → keywords → results → synthesis
- **Tool calling**: Gemma4/Claude call Go Retrieval via MCP
- **Parallel subagents**: Keyword analysis + semantic search run in parallel
- **Fallback**: If Qdrant down, use PGVector; if Go Retrieval down, use direct Qdrant
- **Observability**: Every node logs to Langfuse trace

---

## Phase 102 + Phase 103 Integration Timeline

### Phase 102 (This Week — Noun Reranker)
✅ E1: Error DAG audit  
⏳ E2: Feature labels (populate noun_terms, tags)  
⏳ E3: Batch-fix prioritization (use scores)  
⏳ A5: Graph refresh (populate topology_summary, som_cell)  

### Phase 103 (Parallel — RRF Fusion)
⏳ Populate Qdrant payloads with semantic_tags  
⏳ Sync PGVector codebase_chunk_index with tag clusters  
⏳ Wire RRF fusion (0.4·BM25 + 0.3·semantic + 0.3·authority)  
⏳ Test: `GET /api/retrieval/unified?q=...`  

### Phase 104 (After Phase 103 — LangGraph Wiring)
⏳ Wire Go Retrieval → MCP tools  
⏳ Implement Gemma4 tool-calling loop  
⏳ Deploy LangGraph Symphony (keyword + semantic + topology in parallel)  
⏳ Test: `gemma4 query("DATABASE connection pooling")`  

---

## Data Flow Example: "DATABASE connection pooling"

```
INPUT: "DATABASE connection pooling"
  ↓
[Layer 2] Daily Indexing (graphify)
  - ast-grep: extracted "DATABASE_URL", "connectionPool", "PoolManager" symbols
  - Embedding: 384-dim vectors stored in Qdrant + PGVector
  - BM25: ts_rank_cd scores stored in PGVector bm25_score
  ↓
[Layer 1] Canonical Truth (PostgreSQL)
  - code_features table: 11K symbols indexed
  - codebase_chunk_index: 40.7K chunks with embeddings
  - code_feature_edges: SHARES_TAGS edges (DATABASE_URL ← conn → pool)
  ↓
[Layer 6] Go Retrieval (:8100) orchestrates:
  1. Keyword extraction: ["DATABASE", "connection", "pooling"]
  2. Tag clustering: Qdrant payload filter on semantic_tags
     - "DATABASE" → [REDIS_URL (0.82), POSTGRES (0.79), QDRANT (0.71)]
     - "connection" → [pool, session, socket, client] (0.78+)
  3. Parallel queries:
     a. Lexical: PGVector BM25 → bm25_score
     b. Semantic: Qdrant HNSW → cosine similarity
     c. Tag similarity: code_feature_tag_similarity table
  ↓
[Layer 4] TurboVec prefilter (optional)
  - 768d → 64d (4-bit quantized)
  - Reduce 40.7K chunks → top 200 candidates
  ↓
[Layer 5] Multi-Vector Blend
  - Qdrant: semantic + tag filtering (GPU)
  - PGVector: BM25 + tag GIN index (SQL)
  - Blend: RRF fusion (0.4·keyword + 0.3·semantic + 0.3·tag_sim)
  ↓
[Layer 3] PostgreSQL Final Ranking
  score = 0.22·semantic + 0.18·lexical + 0.15·noun_overlap
        + 0.15·page_rank + 0.12·topology + 0.10·path_match + 0.08·freshness
  ↓
[Layer 7] MCP Tool (kb.trace_search)
  Response: top-20 candidates with explain traces
  ↓
[Layer 8] LangGraph (parallel subagents)
  - Node 1: analyze_keywords (extract + tag clusters)
  - Node 2: semantic_search (call Go Retrieval)
  - Node 3: expand_topology (k-hop neighbors)
  - Node 4: synthesize (Gemma4 or Claude)
  ↓
[Layer 9] Gemma4 Synthesis
  INPUT: [database_pool_feature, redis_cache_feature, connection_factory_feature]
  OUTPUT: "DATABASE connection pooling is managed via three layers:
           1. Redis connection cache (semantic neighbor)
           2. Postgres thread pool (topology neighbor)
           3. Drizzle ORM connection factory (authority boost)"

LATENCY: ~150ms total (40ms Go Retrieval + 60ms LLM + 50ms overhead)
```

---

## Schema for Tag-Based Clustering (Phase 103)

```sql
-- Add semantic tags to chunks for clustering
ALTER TABLE codebase_chunk_index
ADD COLUMN IF NOT EXISTS semantic_tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_chunks_semantic_tags_gin
ON codebase_chunk_index USING GIN (semantic_tags);

-- Tag similarity cache for fast cross-feature reranking
CREATE TABLE IF NOT EXISTS code_feature_tag_similarity (
  source_feature_id VARCHAR NOT NULL,
  target_feature_id VARCHAR NOT NULL,
  similarity_score REAL NOT NULL,  -- 0.0-1.0 (Jaccard or cosine)
  shared_tags TEXT[] NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (source_feature_id, target_feature_id)
);

CREATE INDEX IF NOT EXISTS idx_tag_similarity_score
ON code_feature_tag_similarity (source_feature_id, similarity_score DESC);

-- Qdrant payload sync (ensure tag metadata in Qdrant matches PGVector)
ALTER TABLE codebase_chunk_index
ADD COLUMN IF NOT EXISTS qdrant_point_id BIGINT UNIQUE;

-- Audit: track which features have semantic tags populated
CREATE TABLE IF NOT EXISTS code_feature_tag_audit (
  feature_id VARCHAR PRIMARY KEY,
  has_semantic_tags BOOLEAN DEFAULT FALSE,
  tag_count INT DEFAULT 0,
  last_populated_at TIMESTAMP,
  populated_by VARCHAR  -- E2, A5, etc.
);
```

---

## Execution Checklist (Phase 102 → 103 → 104)

### Phase 102 (Done + E2/A5 pending)
- [x] E1: Error DAG audit
- [x] Noun reranker wired
- [ ] E2: Feature labels (30 min)
- [ ] A5: Graph refresh (20 min)
- [ ] E3: Batch-fix (1 h)

### Phase 103 (Parallel to Phase 102)
- [ ] Apply migration: `0103_add_topology_and_noun_summaries.sql`
- [ ] Populate Qdrant payloads: semantic_tags (Go service)
- [ ] Sync PGVector: `UPDATE codebase_chunk_index SET semantic_tags = ...`
- [ ] Wire RRF fusion: `/api/retrieval/unified` endpoint
- [ ] Test: `curl "...?q=DATABASE&mode=hybrid"`

### Phase 104 (After 102 + 103)
- [ ] Deploy Go Retrieval MCP tools
- [ ] Implement Gemma4 tool-calling loop
- [ ] Wire LangGraph Symphony
- [ ] Deploy subagent coordination
- [ ] Test: parallel keyword + semantic + topology retrieval

---

**Status**: ✅ **ARCHITECTURE COMPLETE** — Ready for Phase 102 E2/A5 + Phase 103 migrations.

Next: Execute E2 (feature labels) + A5 (graph refresh) in parallel, then migrate Phase 103.

