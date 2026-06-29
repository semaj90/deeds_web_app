# Semantic Search Reindexing Plan
**Date**: 2026-06-29 | **Goal**: Full codebase semantic reindex for RFF agentic error fixing  
**Status**: Infrastructure healthy (8/9 services), ready for indexing

---

## Current State Audit

### Postgres (Source of Truth)
- **codebase_chunk_index**: 40,754 rows (canonical chunks with code)
  - `content_embedding` (vector/384): 40,568 rows populated (99.5%)
  - Missing embeddings: 186 rows (0.5%)
- **atlas_packets**: 58,304 rows (identity/metadata)
  - Not the embedding source (see note below)
- **ace_chunks**: Additional indexed chunks for error fixing

### Qdrant (768-dim Mirror)
- **codebase_chunks_768**: 40,568 points
  - 3 vector fields:
    - `content` (768-dim): primary semantic search
    - `error` (768-dim): error pattern matching (RFF lane)
    - `signature` (768-dim): code signature matching (RFF lane)
  - Payload fields: `community_id`, `relative_path`, `som_cluster`, `symbol`, `tags`, `updated_at`
  - **Gap**: Missing RFF-critical fields for agentic error fixing

### Go Semantic Search
- Operational at `:8096` / `:8100` (unified HTTP)
- Supports dual-vector (content + error) for cross-modal retrieval

---

## RFF (Reciprocal Rank Fusion) Requirements for Error Fixing

**RFF combines multiple search lanes** via harmonic mean ranking:
```
RFF_score = Σ(1 / (k + rank_i))  where k=60 (default)
```

### Lane 1: Content-Based Semantic Search (Qdrant `content` vector)
- Query embedding → Qdrant ANN → top-K results
- Best for: "find code similar to this error context"

### Lane 2: Error Pattern Matching (Qdrant `error` vector)
- Pre-computed error embeddings → ANN search
- **Missing in Postgres**: No `error_embedding` in `codebase_chunk_index`
- **Task**: Backfill error embeddings for all chunks

### Lane 3: Signature-Based Search (Qdrant `signature` vector)
- Code structure/AST hash → similarity
- **Missing in Postgres**: No `signature_embedding` in `codebase_chunk_index`
- **Task**: Backfill signature embeddings for all chunks

### Lane 4: BM25 Full-Text Search (Go service)
- Inverted index on code tokens
- **Missing in Qdrant payload**: No `bm25_score` field
- **Task**: Compute BM25 scores during indexing

### Lane 5: Neo4j Topology (Graph structure)
- Dependency/import relationships
- **Wired but needs sync**: Neo4j topology edges need refresh

---

## Reindexing Workflow (4 Phases)

### Phase 1: Backfill Missing Embeddings (Postgres)
**Goal**: Compute error + signature embeddings for all 40,754 chunks

```bash
npm run atlas:backfill:embeddings:error --apply
npm run atlas:backfill:embeddings:signature --apply
```

**Details**:
- Error embeddings: Use Ollama to embed error pattern templates ("Error", "Exception", "panic", etc.)
- Signature embeddings: Use code AST hash + symbol extraction to compute signature vectors
- Batch size: 256 chunks/batch
- Time: ~45 minutes (streaming via Ollama)

### Phase 2: Sync Qdrant Payloads (Mirror)
**Goal**: Ensure Qdrant payload has all RFF fields

```bash
npm run atlas:qdrant:sync:rff-fields --apply
```

**Missing fields to add**:
- `error_embedding_id`: Reference to error vector
- `signature_embedding_id`: Reference to signature vector
- `bm25_score`: Pre-computed BM25 relevance
- `ast_hash`: Code structure fingerprint
- `error_categories`: ["SyntaxError", "TypeError", "ImportError", ...] array
- `confidence_score`: Embedding quality metric (0-1)

**Payload upsert**:
- Read from `codebase_chunk_index` (Postgres)
- Upsert to Qdrant `codebase_chunks_768` (all 40,568 points)
- Time: ~15 minutes

### Phase 3: Rebuild Neo4j Topology Edges
**Goal**: Wire graph relationships for RFF lane 5

```bash
npm run atlas:neo4j:sync:topology --apply
```

**Edges to create**:
- `IMPORTS`: Direct imports (file A imports B)
- `DEPENDS_ON`: Transitive dependencies
- `SIMILAR_TOPOLOGY`: Code structure similarity (from SOM grid)
- `SHARES_ERROR_PATTERN`: Chunks that have same error class
- `CO_OCCUR`: Chunks that appear in same file/test

### Phase 4: Warm RFF Cache (Redis)
**Goal**: Pre-populate RFF rank fusion cache

```bash
npm run atlas:rff:warm-cache --apply
```

**Cache keys**:
- `rff:query:{hash}:{limit}` → fused top-K results (24h TTL)
- `rff:lane:bm25:{offset}` → BM25 lane state
- `rff:lane:content:{offset}` → Content vector lane state
- `rff:lane:error:{offset}` → Error pattern lane state
- `rff:lane:signature:{offset}` → Signature lane state
- `rff:lane:topology:{offset}` → Neo4j topology lane state

---

## Go Semantic Search Integration

### Current Capabilities
- HTTP API at `:8096` (primary) / `:8100` (fallback)
- Dual-vector search: `?vectors=content,error,signature`
- RRF fusion built-in: `?fusion=rrf`

### Payload Indexing
- Search returns Qdrant payloads with RFF-critical fields
- For agentic error fixing: return `error_categories`, `confidence_score`, `ast_hash`

### Example Query (Error Fixing)
```bash
curl -X POST http://localhost:8096/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "TypeError: undefined is not a function",
    "vectors": ["error", "content"],
    "fusion": "rrf",
    "k": 50,
    "filters": {
      "error_categories": ["TypeError", "ReferenceError"]
    }
  }'
```

---

## PostgreSQL 18 Reindex Operations

After backfill, rebuild B-tree + GIN indexes:

```sql
-- B-tree on identity columns (exact lookups)
REINDEX INDEX idx_codebase_chunk_index_source_ref;
REINDEX INDEX idx_codebase_chunk_index_feature_id;
REINDEX INDEX idx_codebase_chunk_index_community_id;

-- GIN on JSONB + array fields (flexible search)
REINDEX INDEX idx_codebase_chunk_index_tags_gin;
REINDEX INDEX idx_codebase_chunk_index_error_categories_gin;

-- pgvector HNSW (semantic search)
REINDEX INDEX idx_codebase_chunk_index_content_embedding_hnsw;
REINDEX INDEX idx_codebase_chunk_index_error_embedding_hnsw;
REINDEX INDEX idx_codebase_chunk_index_signature_embedding_hnsw;

-- Trigram for substring search
REINDEX INDEX idx_codebase_chunk_index_relative_path_gist;
```

---

## Agentic Error Fixing (RFF-Powered)

### New Query Plan
1. **User reports error** → "TypeError: x is not a function"
2. **Embed error** (Ollama) → 768-dim error vector
3. **RFF search** (5 lanes in parallel):
   - Lane 1: Qdrant `content` vector → semantic matches
   - Lane 2: Qdrant `error` vector → error pattern matches
   - Lane 3: Qdrant `signature` vector → code structure matches
   - Lane 4: BM25 full-text → "TypeError" keyword matches
   - Lane 5: Neo4j topology → related files/functions
4. **Fuse results** (RRF formula) → top-20 candidates
5. **Agentic loop**:
   - Fetch chunk context + error_categories
   - Generate fix hypothesis (Gemma4)
   - Validate against similar chunks (confidence_score)
   - Propose fix with traceability

### Example: TypeError in Upload Handler
```
Error: TypeError: undefined is not a function at line 42 of src/routes/api/evidence/upload/+server.ts

RFF Results:
1. (content) Similar async/await pattern in src/lib/server/db/client.ts (rank 1, RRF 0.85)
2. (error) Other TypeError fixes in evidence-diagnostics.ts (rank 2, RRF 0.78)
3. (signature) Function call pattern in upload-handler.ts (rank 5, RRF 0.62)
4. (bm25) TypeError + "undefined is not a function" (rank 3, RRF 0.71)
5. (topology) evidence/+server.ts imports db/client (rank 1, RRF 0.89)

→ Ranked by RRF: [5, 1, 4, 2, 3] → fix by adding await on db.connect()
```

---

## Execution Checklist

- [ ] **Phase 1**: Backfill error embeddings (45 min)
  - Command: `npm run atlas:backfill:embeddings:error --apply`
  - Verify: `SELECT count(*) FROM codebase_chunk_index WHERE error_embedding IS NOT NULL`
  
- [ ] **Phase 1b**: Backfill signature embeddings (45 min)
  - Command: `npm run atlas:backfill:embeddings:signature --apply`
  - Verify: `SELECT count(*) FROM codebase_chunk_index WHERE signature_embedding IS NOT NULL`

- [ ] **Phase 2**: Sync Qdrant payloads (15 min)
  - Command: `npm run atlas:qdrant:sync:rff-fields --apply`
  - Verify: `curl http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.config'`

- [ ] **Phase 3**: Neo4j topology edges (30 min)
  - Command: `npm run atlas:neo4j:sync:topology --apply`
  - Verify: `MATCH ()-[r:SHARES_ERROR_PATTERN]->() RETURN count(r)`

- [ ] **Phase 4**: Warm RFF cache (5 min)
  - Command: `npm run atlas:rff:warm-cache --apply`
  - Verify: `redis-cli KEYS 'rff:*' | wc -l`

- [ ] **PostgreSQL reindex** (10 min)
  - Commands: See SQL section above
  - Verify: `SELECT * FROM pg_stat_user_indexes WHERE schemaname='public'`

- [ ] **Test RFF query** (5 min)
  - Query: See Go example above
  - Verify: Results ranked by RRF formula

---

## Total Time: ~2.5 hours end-to-end

**Start**: Backfill phase (~90 min in parallel)  
**Middle**: Sync + topology refresh (~45 min)  
**End**: Cache warm + reindex + validation (~20 min)

---

## Notes

- **atlas_packets vs codebase_chunk_index**: `atlas_packets` is identity metadata (58K). Code chunks with embeddings live in `codebase_chunk_index` (40.7K). The size difference is expected and correct.
- **Dimension mismatch**: Postgres stores 384-dim embeddings, Qdrant mirrors at 768-dim. This is intentional (768-dim for storage, 384-dim for retrieval efficiency).
- **RFF is not replacement**: RFF *fuses* multiple lanes. If one lane fails, others still work (graceful degradation).
- **Error embeddings**: Computed once during backfill, updated only on codebase changes (not per-query).
- **Signature embeddings**: AST-based; cheap to compute and update on file edit.

---

**Next**: Run Phase 1 backfill with `npm run atlas:backfill:embeddings:error --apply` to start the pipeline.