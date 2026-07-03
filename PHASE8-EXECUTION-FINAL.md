# Phase 8 Execution — FINAL CORRECTED PLAN

**Date**: 2026-07-03 21:00 UTC  
**Status**: Ready to execute after Phase 7 completion  
**Prerequisite**: Phase 7 must be 100% (currently 80.3%)

---

## Current Actual State (Verified)

| Component | Status | Details |
|-----------|--------|---------|
| Phase 7 progress | 80.3% | 31K/39K summaries |
| Autoencoder weights | ✅ Complete | Trained June 19 |
| Autoencoder backfill | ⚠️ Incomplete | 25/40K latent-64 vectors written (June 24) |
| SOM training | ❌ Not started | Waiting for autoencoder |
| Neo4j Packet props | ✅ Present | id, som_cluster, pageRankScore, path, updated_at |
| Neo4j packet_key | ❌ Missing | Use `toString(id(n))` instead |
| Qdrant vectors | ✅ Ready | 40.5K points, 3 vector types (content, error, signature) |
| KMeans clustering | ❌ Not started | Waiting for SOM |

---

## Execution Sequence (Wait for Phase 7 → 100%)

### Step 0: Wait for Phase 7 Completion

```bash
# Monitor Phase 7 progress
npm run phase7:monitor:node:watch

# When it reaches 100% (39,151/39,151), proceed to Step 1
```

**Expected**: ~90 minutes from now (current 21:00 + ~1.5h)

---

### Step 1: Complete Autoencoder Backfill

**Purpose**: Fill `atlas_packets.latent_64` with 64-dim compressed vectors

**Prerequisite**: Phase 7 complete (summaries exist, though not strictly required for this step)

**Command**:
```bash
node scripts/atlas/backfill-latent-vectors.mjs --apply
```

**What it does**:
- Loads pre-trained AE weights from `models/autoencoder/`
- Fetches embeddings from Qdrant codebase_chunks_768 (40.5K vectors)
- Encodes: 768-dim → 128-dim → 64-dim via GPU (tensorrt_bridge.node)
- Writes latent-64 bytea to `atlas_packets.latent_64`
- Caches in Redis: `gpu:autoencoder:latent_64:{qdrant_id}`
- Outputs latent index JSON for SOM training

**Expected Duration**: 10-20 minutes

**Verification**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) total, COUNT(latent_64) with_latent FROM atlas_packets WHERE latent_64 IS NOT NULL;"
# Should return: total=58304, with_latent=40578 (embedding count)
```

---

### Step 2: Train SOM (20×20 Grid)

**Purpose**: Map 64-dim latent space → 2D topological grid

**Prerequisite**: Autoencoder backfill complete

**Command**:
```bash
npm run atlas:phase16:som:dry       # Preview first
npm run atlas:phase16:som:apply     # Execute
```

**What it does**:
- Loads latent-64 vectors from `atlas_packets`
- Trains SOM on 20×20 grid (400 cells)
- Assigns each packet: `som_row`, `som_col`, `som_cluster`
- Outputs codebook to `models/som/som_20x20_codebook.json`
- Writes topology edges to Neo4j SIMILAR_TOPOLOGY

**Expected Duration**: 15-30 minutes

**Verification**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT som_row, som_col) FROM atlas_packets WHERE som_row IS NOT NULL;"
# Should return: 400 (20×20 grid filled)
```

---

### Step 3: Neo4j GDS + PageRank

**Purpose**: Compute node importance scores via Neo4j graph algorithms

**Prerequisite**: SOM training complete (topology edges in Neo4j)

**Before running**: Fix `compute-pagerank-neo4j.mjs` line 86

**Fix required**:
```bash
# Edit file
nano scripts/atlas/compute-pagerank-neo4j.mjs

# Line 86: Change
# FROM: RETURN n.stableKey as key, n.pageRankScore as score
# TO:   RETURN toString(id(n)) as key, n.pageRankScore as score
```

**Command**:
```bash
npm run atlas:phase16:gds:dry       # Preview
npm run atlas:phase16:gds:apply     # Execute
```

**What it does**:
- Creates GDS graph projection on Packet nodes + SIMILAR_TOPOLOGY edges
- Computes PageRank (20 iterations, damping factor 0.85)
- Writes `pageRankScore` to Neo4j Packet nodes
- Caches top-100 in Redis: `couchdb:pagerank_scores`

**Expected Duration**: 10-15 minutes

**Verification**:
```bash
docker exec legal-ai-neo4j bash -c \
  "echo 'MATCH (n:Packet) WHERE n.pageRankScore IS NOT NULL RETURN count(n);' | \
   cypher-shell -u neo4j -p neo4j123 --non-interactive"
# Should return: ~58304 (all packets scored)
```

---

### Step 4: Compute SOM Centroids

**Purpose**: Mean embedding per SOM cell → BitFrost L2 cache

**Prerequisite**: SOM training + autoencoder backfill complete

**Before running**: Fix `compute-som-centroids.mjs` query (line 65)

**Fix required**:
```bash
# Edit file
nano scripts/atlas/compute-som-centroids.mjs

# Line 65: Change query FROM:
# SELECT som_row, som_col, embedding FROM atlas_packets WHERE embedding IS NOT NULL

# TO:
# SELECT som_row, som_col, latent_64 as embedding FROM atlas_packets 
# WHERE latent_64 IS NOT NULL AND som_row IS NOT NULL AND som_col IS NOT NULL
```

**Command**:
```bash
node scripts/atlas/compute-som-centroids.mjs --apply
```

**What it does**:
- Groups latent-64 vectors by SOM cell (som_row, som_col)
- Computes mean vector per cell (centroid)
- Stores in Redis: `centroid:som_cell:{row}:{col}` (7-day TTL)
- Used for L2 BitFrost pre-filtering

**Expected Duration**: 5-10 minutes

**Verification**:
```bash
docker exec legal-ai-redis redis-cli KEYS "centroid:som_cell:*" | wc -l
# Should return: 400 (20×20 grid cells)
```

---

### Step 5: KMeans Clustering

**Purpose**: Group SOM cells into feature communities

**Prerequisite**: SOM centroids complete

**Command**:
```bash
python scripts/atlas/cuml-kmeans-clustering.py --apply
```

**What it does**:
- Reads SOM clusters + PageRank + keywords from Postgres
- Runs cuML K-means (GPU-accelerated if available, CPU fallback)
- Clusters into 20-50 groups
- Writes `kmeans_cluster_id` back to `atlas_packets`

**Expected Duration**: 15-20 minutes

**Verification**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT kmeans_cluster_id) FROM atlas_packets WHERE kmeans_cluster_id IS NOT NULL;"
# Should return: 20-50 clusters
```

---

### Step 6: Validation Suite

**Purpose**: Verify all outputs are consistent across stores

**Commands**:
```bash
# Verify SOM-latent join integrity
npm run atlas:phase16:join:audit

# Verify Neo4j SOM coordinates consistency
npm run atlas:gate:repair:neo4j:coords

# Full semantic codebase report
node scripts/atlas/codebase-semantics-neo4j-report.mjs
```

**Expected Duration**: 10-15 minutes

**All gates should PASS** before proceeding to Phase 9 (hot keyword extraction + packet_title derivation)

---

## Timeline Summary

| Step | Duration | Cumulative |
|------|----------|------------|
| 0. Wait Phase 7 | ~90 min | 90 min |
| 1. Autoencoder | 10-20 min | 100-110 min |
| 2. SOM training | 15-30 min | 115-140 min |
| 3. Neo4j GDS | 10-15 min | 125-155 min |
| 4. Centroids | 5-10 min | 130-165 min |
| 5. KMeans | 15-20 min | 145-185 min |
| 6. Validation | 10-15 min | 155-200 min |
| **TOTAL** | **~3.5 hours** | |

**ETA to Phase 8 completion**: ~2.5 hours after Phase 7 finishes

---

## Required Fixes (2 files, 2 lines)

### Fix 1: compute-pagerank-neo4j.mjs

**File**: `scripts/atlas/compute-pagerank-neo4j.mjs`  
**Line**: 86  
**Change**:
```diff
- RETURN n.stableKey as key, n.pageRankScore as score
+ RETURN toString(id(n)) as key, n.pageRankScore as score
```

### Fix 2: compute-som-centroids.mjs

**File**: `scripts/atlas/compute-som-centroids.mjs`  
**Lines**: 64-70  
**Change**:
```diff
  const result = await db.query(`
-   SELECT som_row, som_col, embedding
-   FROM atlas_packets
-   WHERE embedding IS NOT NULL
+   SELECT som_row, som_col, latent_64 as embedding
+   FROM atlas_packets
+   WHERE latent_64 IS NOT NULL
+     AND som_row IS NOT NULL
+     AND som_col IS NOT NULL
```

---

## Quick Reference: Full Pipeline (Copy-Paste)

```bash
# After Phase 7 reaches 100%:

echo "=== Step 1: Autoencoder Backfill ==="
node scripts/atlas/backfill-latent-vectors.mjs --apply
sleep 5
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(latent_64) FROM atlas_packets WHERE latent_64 IS NOT NULL;"

echo "=== Step 2: SOM Training ==="
npm run atlas:phase16:som:apply
sleep 5
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(DISTINCT som_row) FROM atlas_packets WHERE som_row IS NOT NULL;"

echo "=== Step 3: Neo4j GDS (after fixing line 86) ==="
npm run atlas:phase16:gds:apply
sleep 5
docker exec legal-ai-neo4j bash -c "echo 'MATCH (n:Packet) WHERE n.pageRankScore IS NOT NULL RETURN count(n);' | cypher-shell -u neo4j -p neo4j123 --non-interactive"

echo "=== Step 4: SOM Centroids (after fixing query) ==="
node scripts/atlas/compute-som-centroids.mjs --apply
sleep 5
docker exec legal-ai-redis redis-cli KEYS "centroid:som_cell:*" | wc -l

echo "=== Step 5: KMeans Clustering ==="
python scripts/atlas/cuml-kmeans-clustering.py --apply
sleep 5
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(DISTINCT kmeans_cluster_id) FROM atlas_packets WHERE kmeans_cluster_id IS NOT NULL;"

echo "=== Step 6: Validation ==="
npm run atlas:phase16:join:audit
npm run atlas:gate:repair:neo4j:coords

echo "✅ Phase 8 Complete"
```

---

## What Happens Next (Phase 9)

After Phase 8 completes:

1. **Hot Keyword Extraction** — Mine summaries for domain-specific keywords
2. **Feature Community Labeling** — Label KMeans clusters with extracted keywords  
3. **Packet Title Derivation** — Generate `packet_title` from keywords + Neo4j context
4. **Canonical Identity Hardening** — Map packet_key ← feature_label ← keywords

Phase 8 provides the topology + clustering foundation for Phase 9.

