# Phase 8 Correct Execution Path — After Phase 7 Completion

**Date**: July 4, 2026 00:05 UTC  
**Phase 7 Status**: ✅ **PASSED GATE (98.5% completion, 38,545/39,151 summaries)**

---

## Schema Clarification

**Two separate tables, two separate phases:**

| Table | Purpose | Phase | Columns | Status |
|-------|---------|-------|---------|--------|
| `codebase_chunk_index` | Summaries (Phase 7) | 7 | `content`, `summary`, `content_embedding` | ✅ 38,545 rows with summaries |
| `atlas_packets` | Topology & latent (Phase 8) | 8 | `latent_64`, `som_row`, `som_col`, `page_rank_score`, `kmeans_cluster_id`, `community_id` | ⏳ All columns exist, all empty |

**Critical**: Do NOT write Phase 8 fields to `codebase_chunk_index`. The CUDA accelerator script was targeting the wrong table. Skip it.

---

## Phase 8 Correct Execution Path

### Pre-Execution: Verify Phase 7 Complete

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as total, 
          COUNT(*) FILTER (WHERE summary IS NOT NULL AND LENGTH(summary) > 10) as with_summaries
   FROM codebase_chunk_index;"
```

**Expected**: 
- total: 39,151
- with_summaries: ≥38,545 (96%+)

If remaining 606 are still missing:
```bash
# Check if workers are still active
docker exec legal-ai-redis redis-cli HGETALL summaries:worker:status
# If 0 active workers, Phase 7 is done (remaining 606 are retry-exhausted)
```

If Phase 7 still running, let it finish (typically <1 hour for 606 remaining at ~40 summaries/min).

---

### Step 1: Apply Phase 8 Schema (5 minutes)

```bash
npm run phase8:create-schema:apply
```

**What it does**: Creates/verifies these columns on `atlas_packets`:
- ✅ `page_rank_score` (real)
- ✅ `kmeans_cluster_id` (integer)
- ✅ `community_id` (integer) — **NEW from Patch 1**
- Plus indexes on all three

**Verification**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT column_name FROM information_schema.columns 
   WHERE table_name='atlas_packets' 
   AND column_name IN ('latent_64', 'som_row', 'som_col', 'page_rank_score', 'kmeans_cluster_id', 'community_id')
   ORDER BY column_name;"
```

**Expected**: 6 columns (all should exist from previous patches + new community_id)

---

### Step 2: Audit Phase 8 Prerequisites (2 minutes)

```bash
npm run phase8:orchestrator:audit
```

**What it does**: Verifies:
- Phase 7 ≥96% complete ✅
- 58,304 canonical packet_keys in atlas_packets ✅
- Schema columns all exist ✅
- Gemma4 server accessible ✅

**Expected output**:
```
✅ Phase 7 (Summarization): 38,545 / 39,151 summaries (98.5%)
✅ Canonical packet_key: 58,304 packets, 58,304 unique, 0 NULL
📋 Phase 8 Column Status:
   ✅ latent_64
   ✅ som_row
   ✅ som_col
   ✅ page_rank_score
   ✅ kmeans_cluster_id
   ✅ community_id

✅ Ready to execute Phase 8: YES
```

---

### Step 3: Phase 8 Step-by-Step Execution

**Option A: Full Pipeline (Unattended)**
```bash
npm run phase8:orchestrator:execute
```

**Option B: Step-by-Step (Recommended — Monitor Progress)**

#### Step 1: Autoencoder Latent Encoding (20–30 min)
```bash
npm run phase8:orchestrator:step1
```

**What it does**: 
- Reads 768-dim embeddings from `codebase_chunk_index.content_embedding`
- Encodes to 64-dim via autoencoder
- Writes `atlas_packets.latent_64` (58,304 rows)

**Verify during execution**:
```bash
# In another terminal, watch progress
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_packets WHERE latent_64 IS NOT NULL;" | head -1
```

**Expected final**: 58,304 rows with latent_64

#### Step 2: SOM Training (10–15 min)
```bash
npm run phase8:orchestrator:step2
```

**What it does**:
- Trains 20×20 Self-Organizing Map on latent_64 vectors
- Assigns each packet to SOM grid cell (som_row, som_col)
- Writes to `atlas_packets`

**Verify**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT (som_row, som_col)) as grid_cells FROM atlas_packets WHERE som_row IS NOT NULL;"
```

**Expected**: ~400 (20×20 grid cells are filled)

#### Step 3: Neo4j SIMILAR_TOPOLOGY Edges (5–10 min)
```bash
npm run phase8:orchestrator:step3
```

**What it does**:
- Reads SOM coordinates from Postgres
- Creates Moore neighborhood edges in Neo4j
- Connects adjacent SOM cells (8-neighbor grid)

**Verify**:
```bash
docker exec legal-ai-neo4j cypher-shell -u neo4j -p password \
  "MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN count(r);"
```

**Expected**: 2,000–3,000 edges

#### Step 4: PageRank Computation (15–20 min)
```bash
npm run phase8:orchestrator:step4
```

**What it does**:
- Runs Neo4j GDS PageRank on SIMILAR_TOPOLOGY edges
- **✅ FIXED (Patch 2)**: Syncs ALL scores back to `atlas_packets.page_rank_score` (not just top-100 to Redis)
- Uses canonical `packet_key` (not Neo4j internal IDs)

**Verify**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as synced, COUNT(*) FILTER (WHERE page_rank_score > 0) as with_scores FROM atlas_packets;"
```

**Expected**: 58,304 synced, ~58,304 with_scores

#### Step 5: SOM Centroids (10 min)
```bash
npm run phase8:orchestrator:step5
```

**What it does**:
- Computes mean embedding per SOM cell
- Used for cache indexing and retrieval routing

#### Step 6: K-Means Clustering (15–20 min)
```bash
npm run phase8:orchestrator:step6
```

**What it does**:
- Runs K-Means on latent_64 vectors
- Assigns each packet to cluster (kmeans_cluster_id)

**Verify**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT kmeans_cluster_id) as clusters FROM atlas_packets WHERE kmeans_cluster_id IS NOT NULL;"
```

**Expected**: 10–20 clusters

#### Step 7: Qdrant Payload Enrichment (10 min)
```bash
npm run phase8:orchestrator:step7
```

**What it does**:
- Writes SOM/cluster/community tags to Qdrant payloads
- Syncs metadata from Postgres to vector search

#### Step 8: BitFrost Cache Warming (10 min)
```bash
npm run phase8:orchestrator:step8
```

**What it does**:
- Pre-caches high-authority packets in Redis
- Warms L1/L2 BitFrost memory hierarchy
- Prepares for fast ACE retrieval

---

### Step 4: Louvain Community Detection (Optional, After Step 8)

If you want community-scoped retrieval (recommended for agent queries):

```bash
node scripts/atlas/compute-louvain-neo4j.mjs --dry-run
# Verify output shows expected communities

node scripts/atlas/compute-louvain-neo4j.mjs --apply
```

**What it does**:
- Runs Louvain on Neo4j graph
- **✅ HARDENED (7 critical bugs fixed)**
- Syncs community IDs to `atlas_packets.community_id` in batches
- Caches community statistics in Redis

**Verify**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT community_id) as communities FROM atlas_packets WHERE community_id IS NOT NULL;"
```

**Expected**: 10–50 communities

---

## Post-Execution Validation (After Phase 8 Complete)

### Quick Check (1 minute)

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as packets,
          COUNT(*) FILTER (WHERE latent_64 IS NOT NULL) as with_latent,
          COUNT(*) FILTER (WHERE som_row IS NOT NULL) as with_som,
          COUNT(*) FILTER (WHERE page_rank_score IS NOT NULL) as with_pagerank,
          COUNT(*) FILTER (WHERE kmeans_cluster_id IS NOT NULL) as with_kmeans,
          COUNT(*) FILTER (WHERE community_id IS NOT NULL) as with_community
   FROM atlas_packets;"
```

**Expected**:
```
packets | with_latent | with_som | with_pagerank | with_kmeans | with_community
--------|-------------|----------|---------------|-------------|----------------
  58304 |       58304 |    58304 |         58304 |       58304 |         10-50
```

### Full 6-Check Validation

```bash
echo "=== 1. Latent Vectors ===" && \
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as count FROM atlas_packets WHERE latent_64 IS NOT NULL;" && \

echo "=== 2. SOM Grid ===" && \
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT (som_row, som_col)) as grid_cells FROM atlas_packets WHERE som_row IS NOT NULL;" && \

echo "=== 3. PageRank ===" && \
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) as synced, AVG(page_rank_score) as avg_score FROM atlas_packets WHERE page_rank_score IS NOT NULL;" && \

echo "=== 4. K-Means ===" && \
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT kmeans_cluster_id) as clusters FROM atlas_packets WHERE kmeans_cluster_id IS NOT NULL;" && \

echo "=== 5. Louvain Communities ===" && \
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT community_id) as communities FROM atlas_packets WHERE community_id IS NOT NULL;" && \

echo "=== 6. Neo4j Topology ===" && \
docker exec legal-ai-neo4j cypher-shell -u neo4j -p password \
  "MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN count(r) AS edge_count;"
```

**Expected**: All checks return non-zero counts

---

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Schema (Step 1) | 5 min | Fast |
| Audit (Step 2) | 2 min | Fast |
| Step 1: Autoencoder | 20–30 min | Normal |
| Step 2: SOM | 10–15 min | Normal |
| Step 3: Neo4j edges | 5–10 min | Fast |
| Step 4: PageRank | 15–20 min | Normal |
| Step 5: Centroids | 10 min | Normal |
| Step 6: K-Means | 15–20 min | Normal |
| Step 7: Qdrant | 10 min | Normal |
| Step 8: BitFrost | 10 min | Normal |
| **Total (Steps 1–8)** | **97–127 min** | **~2 hours** |
| Louvain (Optional) | 3–5 min | Fast |

---

## Hard Rules (Non-Negotiable)

✅ **Do NOT write to `codebase_chunk_index` in Phase 8**
- That table is Phase 7 output (summaries only)
- Ignore the CUDA accelerator script; it targets the wrong table

✅ **All Phase 8 fields go to `atlas_packets`**
- latent_64, som_row, som_col, page_rank_score, kmeans_cluster_id, community_id
- This is the single source of truth for Phase 8 topology

✅ **Postgres is canonical**
- Neo4j computes, then syncs back to Postgres
- Qdrant/Redis read from Postgres
- Join by packet_key, never by Neo4j internal ID

✅ **Community-scoped retrieval is optional**
- Louvain adds community_id for fast sub-graph queries
- Can be run after Phase 8 Steps 1–8, or skipped entirely

---

## What's Different from Original Plan

| Item | Original | Now |
|------|----------|-----|
| CUDA Accelerator | Target codebase_chunk_index.latent_64 | **Skip — wrong table** |
| Latent encoding | CUDA script | Phase 8 Step 1: `backfill-latent-vectors.mjs` ✅ |
| Schema target | Mixed (chunks + packets) | Clear: `atlas_packets` only |
| Phase 7 gate | 96% summaries | ✅ **Passed: 98.5%** |

---

## Next Action

```bash
# 1. Verify Phase 7 complete
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FILTER (WHERE summary IS NOT NULL AND LENGTH(summary) > 10) / CAST(COUNT(*) AS FLOAT) as pct FROM codebase_chunk_index;"

# 2. Apply schema
npm run phase8:create-schema:apply

# 3. Audit
npm run phase8:orchestrator:audit

# 4. Execute (full pipeline)
npm run phase8:orchestrator:execute

# Or step-by-step
npm run phase8:orchestrator:step1
npm run phase8:orchestrator:step2
# ... continue through step8

# 5. Validate
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FILTER (WHERE latent_64 IS NOT NULL) as latent,
          COUNT(*) FILTER (WHERE page_rank_score IS NOT NULL) as pagerank
   FROM atlas_packets;"
```

---

## Status: ✅ READY FOR EXECUTION

Phase 7 passed. Schema is correct. Patches are hardened. Path is clear.

**Do not use the CUDA accelerator script. Proceed directly with Phase 8 orchestrator.**

