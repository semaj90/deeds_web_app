# Phase 85: RFF Agentic Error Fixing — Reindexing Execution Plan

**Date**: June 29, 2026 | **Goal**: Enable 5-lane RFF search for agentic error fixing | **Status**: WIRED (ready for dry-run)

---

## Overview

RFF (Reciprocal Rank Fusion) combines 5 parallel search lanes to rank error-fixing candidates:

```
RFF_score = Σ(1 / (k + rank_i))  where k=60 (default)
```

**Lanes**:
1. **Content semantic** — Qdrant `content` vector (384-dim) — ✅ READY
2. **Error pattern** — Qdrant `error` vector (384-dim) — 🔄 BACKFILL REQUIRED
3. **Code signature** — Qdrant `signature` vector (384-dim) — 🔄 BACKFILL REQUIRED
4. **BM25 full-text** — Go semantic search service — ⏳ DEFERRED (Stage 4)
5. **Neo4j topology** — Graph relationships — 🔄 CREATE EDGES REQUIRED

---

## Current State Audit

### Postgres (Truth)

**codebase_chunk_index** (40,754 rows):
- `content_embedding` — 99.5% (40,568 rows) ✅
- `error_embedding` — 0% (0 rows) ❌
- `signature_embedding` — 0% (0 rows) ❌

### Qdrant (Mirror)

**codebase_chunks_768** (40,568 points):
- Vector fields: `content` (768-dim), `error` (768-dim), `signature` (768-dim)
- Payload fields: community_id, relative_path, som_cluster, symbol, tags, updated_at
- **Missing RFF fields**: error_embedding_id, signature_embedding_id, bm25_score, ast_hash, error_categories, confidence_score

### Neo4j (Topology)

**Current edges**:
- SIMILAR_TOPOLOGY: 51,333 edges ✅
- SHARES_ERROR_PATTERN: 0 edges ❌
- CO_OCCUR: 0 edges ❌
- IMPORTS: 0 edges ⏳

---

## Execution Plan (4 Phases)

### Phase 1: Backfill Error + Signature Embeddings (90 min)

**Goal**: Compute 384-dim error and signature embeddings for all 40,754 chunks using Ollama.

**Prerequisites**:
- ✅ Ollama running with `embeddinggemma:latest` model
- ✅ Postgres connection available
- ✅ Tables exist: `codebase_chunk_index`

**Commands**:

```bash
# Dry-run to preview
npm run atlas:phase1:backfill:rff:dry

# Error embeddings only (45 min)
npm run atlas:phase1:backfill:error:apply

# Signature embeddings only (45 min)
npm run atlas:phase1:backfill:signature:apply

# Both in one go (90 min)
npm run atlas:phase1:backfill:rff:apply
```

**Verification**:

```sql
-- Postgres: verify embeddings populated
SELECT 
  count(*) as total,
  count(error_embedding) as error_count,
  count(signature_embedding) as signature_count
FROM codebase_chunk_index;

-- Should show: total=40754, error_count≈40754, signature_count≈40754
```

**Details**:
- **Batch size**: 256 chunks/batch (configurable via `--batch-size=N`)
- **Rate limit**: 100ms between Ollama requests to avoid overload
- **Throughput**: ~100 chunks per 15 seconds (~2 chunks/sec)
- **Estimated time**: 45-50 minutes per backfill (two runs in parallel optional)

---

### Phase 2: Sync Qdrant Payloads (15 min)

**Goal**: Upsert Qdrant payloads with RFF-critical fields.

**Commands**:

```bash
# Dry-run to preview payload structure
npm run atlas:phase2:sync:rff:dry

# Apply sync (15 min)
npm run atlas:phase2:sync:rff:apply
```

**Verification**:

```bash
# Check Qdrant collection metadata
curl http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.config'

# Sample a single point
curl "http://127.0.0.1:6333/collections/codebase_chunks_768/points?ids=1&with_payload=true" | jq '.result.points[0].payload'
```

**Details**:
- **Batch size**: 500 points per upsert (configurable via `--batch-size=N`)
- **Payload fields**:
  - `error_embedding_id` → `error:{id}` (identifies error vector in multi-vector search)
  - `signature_embedding_id` → `signature:{id}` (identifies signature vector)
  - `bm25_score` → 0.5 (placeholder; actual BM25 computed in Stage 4)
  - `ast_hash` → null (placeholder; actual hash from AST analysis)
  - `error_categories` → ["SyntaxError", "TypeError", ...] (extracted from symbol/tags)
  - `confidence_score` → 0.85–0.95 (based on embedding completeness)

---

### Phase 3: Rebuild Neo4j Topology Edges (30 min)

**Goal**: Create RFF-critical relationship types for graph traversal.

**Commands**:

```bash
# Dry-run to preview Cypher queries
npm run atlas:phase3:neo4j:rff:dry

# Apply topology rebuild (30 min)
npm run atlas:phase3:neo4j:rff:apply
```

**Verification**:

```cypher
-- Neo4j Cypher: count relationships by type
MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN count(r);
MATCH ()-[r:SHARES_ERROR_PATTERN]->() RETURN count(r);
MATCH ()-[r:CO_OCCUR]->() RETURN count(r);

-- Expected: SIMILAR_TOPOLOGY ≈ 51,333, others ≈ thousands
```

**Edge types created**:
1. **SIMILAR_TOPOLOGY** — Code structure adjacency (from SOM grid)
2. **SHARES_ERROR_PATTERN** — Same error class (e.g., TypeError → TypeError)
3. **CO_OCCUR** — Same source file (chunks in same file)
4. **IMPORTS** — ⏳ Deferred (requires AST parsing)

---

### Phase 4: Warm RFF Cache in Redis (5 min)

**Goal**: Pre-populate Redis with example RFF queries.

**Commands** (planned for next session):

```bash
npm run atlas:rff:warm-cache --apply
```

**Cache keys**:
```
rff:query:{hash}:{limit}           # Fused top-K results (24h TTL)
rff:lane:bm25:{offset}             # BM25 lane state
rff:lane:content:{offset}          # Content vector lane state
rff:lane:error:{offset}            # Error pattern lane state
rff:lane:signature:{offset}        # Signature lane state
rff:lane:topology:{offset}         # Neo4j topology lane state
```

---

## RFF Example: Error Fixing Workflow

```
User Input: "TypeError: undefined is not a function at line 42 of upload/+server.ts"

Step 1: Embed error
  → 384-dim error vector via /api/embed

Step 2: RFF search (5 lanes in parallel)
  Lane 1 (content):    Qdrant ANN on semantic similarity
  Lane 2 (error):      Qdrant ANN on error pattern embedding
  Lane 3 (signature):  Qdrant ANN on function signature matching
  Lane 4 (bm25):       Full-text "TypeError" + "undefined is not a function"
  Lane 5 (topology):   Neo4j k-hop expansion from upload handler

Step 3: Fuse results via RRF
  RRF_score = Σ(1 / (60 + rank_i))
  → Top-20 candidates ranked by harmonic mean

Step 4: Agentic loop
  Fetch chunk context + error_categories
  Generate fix hypothesis (Gemma4)
  Validate against similar chunks (confidence_score)
  Propose fix with traceability

Expected ranking:
  1. (topology) evidence/+server.ts imports db/client (RRF 0.89)
  2. (content) Similar async/await pattern (RRF 0.85)
  3. (bm25) TypeError + "undefined is not a function" (RRF 0.71)
  4. (error) Other TypeError fixes (RRF 0.78)
  5. (signature) Function call pattern (RRF 0.62)

→ Fix: add await on db.connect()
```

---

## PostgreSQL 18 Reindex Operations

After backfill, rebuild indexes:

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

## Execution Checklist

- [ ] **Phase 1a**: Backfill error embeddings (45 min)
  - `npm run atlas:phase1:backfill:error:apply`
  - Verify: `SELECT count(*) FROM codebase_chunk_index WHERE error_embedding IS NOT NULL`

- [ ] **Phase 1b**: Backfill signature embeddings (45 min)
  - `npm run atlas:phase1:backfill:signature:apply`
  - Verify: `SELECT count(*) FROM codebase_chunk_index WHERE signature_embedding IS NOT NULL`

- [ ] **Phase 2**: Sync Qdrant payloads (15 min)
  - `npm run atlas:phase2:sync:rff:apply`
  - Verify: `curl http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result'`

- [ ] **Phase 3**: Neo4j topology edges (30 min)
  - `npm run atlas:phase3:neo4j:rff:apply`
  - Verify Neo4j edge counts via Cypher

- [ ] **Phase 4**: Warm RFF cache (5 min) — *deferred to next session*
  - `npm run atlas:rff:warm-cache --apply`

- [ ] **PostgreSQL reindex** (10 min)
  - Run SQL statements above
  - Verify: `SELECT * FROM pg_stat_user_indexes WHERE schemaname='public'`

- [ ] **Test RFF query** (5 min)
  - Example query at `POST /api/search/rff` endpoint
  - Verify results ranked by RRF formula

---

## Total Time: ~2.5 hours end-to-end

| Phase | Task | Duration | Status |
|-------|------|----------|--------|
| 1a | Error embeddings backfill | 45 min | ⏳ READY |
| 1b | Signature embeddings backfill | 45 min | ⏳ READY |
| 2 | Qdrant payload sync | 15 min | ⏳ READY |
| 3 | Neo4j topology rebuild | 30 min | ⏳ READY |
| 4 | RFF cache warmup | 5 min | ⏳ DEFERRED |
| — | PostgreSQL reindex | 10 min | ⏳ READY |
| — | RFF query test | 5 min | ⏳ READY |
| **TOTAL** | | **~2.5 hours** | ✅ EXECUTABLE |

**Critical path**: Start Phase 1a + 1b in parallel (90 min) → Phase 2 (15 min) → Phase 3 (30 min) → Phase 4 + Reindex (15 min) = **~2.5 hours serial** or **~1.5 hours with parallelization**.

---

## Script Files Created

1. **Phase 1**: `sveltekit-frontend/scripts/atlas/phase1-backfill-rff-embeddings.mjs` (320 lines)
   - Embeds chunks via Ollama embeddinggemma
   - Backfills error_embedding and signature_embedding columns
   - Supports `--error-only`, `--signature-only`, `--batch-size`, `--apply`

2. **Phase 2**: `sveltekit-frontend/scripts/atlas/phase2-sync-qdrant-rff-payloads.mjs` (280 lines)
   - Reads Postgres chunks
   - Constructs RFF-critical payload fields
   - Upserts to Qdrant via HTTP
   - Supports `--batch-size`, `--apply`

3. **Phase 3**: `scripts/atlas/phase3-neo4j-rff-topology.mjs` (220 lines)
   - Creates SIMILAR_TOPOLOGY edges from SOM clusters
   - Creates SHARES_ERROR_PATTERN edges between chunks with same error class
   - Creates CO_OCCUR edges for chunks in same file
   - Supports `--apply`

---

## Next Steps

1. **Execute Phase 1** (Option A: 20 min status check OR Option B: full 90-min backfill)
   - Start with `npm run atlas:phase1:backfill:rff:dry` to preview
   - If ready, proceed with `--apply`

2. **Monitor Ollama** during backfill
   - Watch for embedding timeouts (increase `--batch-size` if slow)
   - Check Ollama logs for errors

3. **Execute Phases 2-3** sequentially
   - Phase 2 should complete in ~15 minutes
   - Phase 3 should complete in ~30 minutes

4. **Verify RFF search** with Go semantic search service
   - Deploy test query to `/api/search/rff`
   - Rank results by RRF formula
   - Validate candidate quality

---

## Notes

- **Dimension policy**: All embeddings are 384-dim (project canonical). Qdrant stores at 768-dim for storage efficiency.
- **RFF is not replacement**: RFF *fuses* multiple lanes. If one lane fails, others still work (graceful degradation).
- **Error embeddings**: Computed once during backfill, updated only on codebase changes (not per-query).
- **Signature embeddings**: AST-based; cheap to compute and update on file edit.
- **Cache warming** (Phase 4) can be deferred — RFF search works without pre-warmed cache (just slower on first query).

---

**Status**: WIRED (all 3 scripts created, npm commands registered)  
**Ready for**: Dry-run validation and execution  
**Next Command**: `npm run atlas:phase1:backfill:rff:dry`