# CORRECTED Phase 8 Pipeline Execution Order

**Date**: 2026-07-03  
**Status**: ⚠️ **EXECUTION ORDER IS REVERSED**  
**Root Cause**: Scripts assume upstream outputs exist (they don't)

---

## Current State (Verified)

| Component | Status | Evidence |
|-----------|--------|----------|
| Phase 7 summaries | ✅ 80.3% (31K chunks) | Postgres: 31K rows with content |
| Autoencoder (latent-64) | ❌ MISSING | Postgres: 0/58K atlas_packets.latent_64 |
| SOM training | ❌ MISSING | Postgres: 0/40K codebase_chunk_index.som_bmu_row |
| Neo4j PageRank | ❌ NOT RUN | No pageRankScore in Neo4j Packet nodes |
| Neo4j properties | ⚠️ INCOMPLETE | Only has: id, som_cluster, pageRankScore, path, updated_at (NO packet_key) |
| KMeans clusters | ❌ MISSING | Postgres: 0/58K atlas_packets.kmeans_cluster_id |

---

## Correct Execution Sequence

### Phase 1: Generate Latent Vectors (Autoencoder)

**Purpose**: Convert 384-dim embeddings → 64-dim latent space  
**Fills**: `atlas_packets.latent_64` (all 58K rows)  
**Prerequisite**: Phase 7 complete (summaries exist)  
**Status**: MISSING — must run FIRST

**Script needed**: 
```bash
# Find autoencoder training script
find scripts/atlas -name "*autoencode*" -o -name "*ae-*" -o -name "*latent*"
```

**Expected output after completion**:
```sql
SELECT COUNT(*) FROM atlas_packets WHERE latent_64 IS NOT NULL;
-- Should return: 58304 (100% populated)
```

---

### Phase 2: Train SOM (20×20 Grid)

**Purpose**: Map 64-dim latent space → 2D grid  
**Fills**: `codebase_chunk_index.som_bmu_row`, `codebase_chunk_index.som_bmu_col`  
**Prerequisite**: Phase 1 (latent-64 complete)  
**Status**: MISSING — must run SECOND

**Script ready**: `train-som-20x20.mjs`

```bash
npm run atlas:phase16:som:dry      # Preview
npm run atlas:phase16:som:apply    # Execute
```

**Expected output**:
```sql
SELECT COUNT(*) FROM codebase_chunk_index WHERE som_bmu_row IS NOT NULL;
-- Should return: ~38000-40000 (embeddings only)
```

**Also fills**: `atlas_packets.som_row`, `atlas_packets.som_col`, `atlas_packets.som_cluster`

---

### Phase 3: Neo4j GDS Pipeline

**Purpose**: Compute PageRank, create topology edges  
**Updates**: Neo4j Packet nodes with `pageRankScore`  
**Prerequisite**: SOM training complete (topology exists)  
**Status**: READY BUT HAS BUGS (see below)

```bash
# Step 3a: Create GDS projection and compute PageRank
npm run atlas:phase16:gds:dry      # Preview
npm run atlas:phase16:gds:apply    # Execute

# Step 3b: Fix Neo4j script to use correct field
# BEFORE running: edit compute-pagerank-neo4j.mjs line 86
```

**FIX REQUIRED** in `compute-pagerank-neo4j.mjs`:
```javascript
// Line 86: WRONG
RETURN n.stableKey as key, n.pageRankScore as score

// CORRECT
RETURN toString(id(n)) as key, n.pageRankScore as score
```

**Expected output**:
```cypher
MATCH (n:Packet) WHERE n.pageRankScore IS NOT NULL RETURN count(n);
-- Should return: ~58000 (all packets scored)
```

---

### Phase 4: Compute SOM Centroids

**Purpose**: Mean embedding per SOM cell → BitFrost cache  
**Fills**: Redis `centroid:som_cell:{row}:{col}`  
**Prerequisite**: SOM training complete  
**Status**: READY BUT HAS BUGS (see below)

**FIX REQUIRED** in `compute-som-centroids.mjs`:
```javascript
// Line 65: WRONG (atlas_packets.embedding is NULL)
SELECT som_row, som_col, embedding
FROM atlas_packets

// CORRECT (use latent-64 from atlas_packets after SOM)
SELECT som_row, som_col, latent_64 as embedding
FROM atlas_packets
WHERE latent_64 IS NOT NULL AND som_row IS NOT NULL
```

```bash
node scripts/atlas/compute-som-centroids.mjs --apply
```

**Expected output**:
```bash
docker exec legal-ai-redis redis-cli KEYS "centroid:som_cell:*" | wc -l
-- Should return: ~400 (20×20 grid cells)
```

---

### Phase 5: KMeans Clustering

**Purpose**: Group SOM cells into feature communities  
**Fills**: `atlas_packets.kmeans_cluster_id`  
**Prerequisite**: SOM + centroids complete  
**Status**: READY BUT NEEDS VALIDATION

```bash
python scripts/atlas/cuml-kmeans-clustering.py --apply
```

**Expected output**:
```sql
SELECT COUNT(DISTINCT kmeans_cluster_id) FROM atlas_packets WHERE kmeans_cluster_id IS NOT NULL;
-- Should return: 20-50 clusters
```

---

## Corrected Execution Plan

```bash
# BEFORE: Verify Phase 7 is at least 90% done
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) done, ROUND(100.0*COUNT(*)/39151, 1) pct FROM codebase_chunk_index WHERE summary IS NOT NULL;"

# ════════════════════════════════════════════════════════════════

# STEP 1: Autoencoder (latent-64 generation)
# ⚠️ FIND SCRIPT FIRST — doesn't have an npm alias yet
find scripts/atlas -name "*autoencode*" -o -name "*latent*"
node scripts/atlas/<autoencoder-script> --apply

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_packets WHERE latent_64 IS NOT NULL;"

# ════════════════════════════════════════════════════════════════

# STEP 2: SOM Training (20×20 grid on 64-dim latent space)
npm run atlas:phase16:som:dry
npm run atlas:phase16:som:apply

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT som_bmu_row, som_bmu_col) FROM codebase_chunk_index;"

# ════════════════════════════════════════════════════════════════

# STEP 3: Neo4j GDS + PageRank
# 3a: Edit compute-pagerank-neo4j.mjs to fix stableKey → id(n)
# (See FIX REQUIRED section above)

npm run atlas:phase16:gds:dry
npm run atlas:phase16:gds:apply

# Verify
docker exec legal-ai-neo4j bash -c \
  "echo 'MATCH (n:Packet) WHERE n.pageRankScore IS NOT NULL RETURN count(n);' | \
   cypher-shell -u neo4j -p neo4j123 --non-interactive"

# ════════════════════════════════════════════════════════════════

# STEP 4: Compute SOM Centroids
# 4a: Edit compute-som-centroids.mjs to fix embedding query
# (See FIX REQUIRED section above)

node scripts/atlas/compute-som-centroids.mjs --apply

# Verify
docker exec legal-ai-redis redis-cli KEYS "centroid:som_cell:*" | wc -l

# ════════════════════════════════════════════════════════════════

# STEP 5: KMeans Clustering
python scripts/atlas/cuml-kmeans-clustering.py --apply

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT kmeans_cluster_id) FROM atlas_packets WHERE kmeans_cluster_id IS NOT NULL;"

# ════════════════════════════════════════════════════════════════

# STEP 6: Validation Suite
npm run atlas:phase16:join:audit
npm run atlas:gate:repair:neo4j:coords
```

---

## Changes Required (Before Execution)

### 1. compute-pagerank-neo4j.mjs (Line 86)

```diff
- RETURN n.stableKey as key, n.pageRankScore as score
+ RETURN toString(id(n)) as key, n.pageRankScore as score
```

### 2. compute-som-centroids.mjs (Line 65)

```diff
- SELECT som_row, som_col, embedding
- FROM atlas_packets
- WHERE embedding IS NOT NULL
+ SELECT som_row, som_col, latent_64 as embedding
+ FROM atlas_packets
+ WHERE latent_64 IS NOT NULL AND som_row IS NOT NULL AND som_col IS NOT NULL
```

### 3. Find autoencoder script

```bash
ls -la scripts/atlas | grep -E "auto|ae-|latent"
# OR check if it's in sveltekit-frontend/scripts
```

---

## Timeline Estimate

| Phase | Duration | Status |
|-------|----------|--------|
| 1. Autoencoder | 30-60 min | UNKNOWN (find script first) |
| 2. SOM Training | 15-30 min | READY |
| 3. Neo4j GDS | 10-15 min | READY (needs 1-line fix) |
| 4. Centroids | 5-10 min | READY (needs 1 query fix) |
| 5. KMeans | 15-20 min | READY |
| 6. Validation | 10-15 min | READY |
| **TOTAL** | **90-150 min** | **DEPENDS ON AUTOENCODER** |

**Critical Path**: Autoencoder → everything else (sequential)

---

## Missing: Autoencoder Script

**ACTION REQUIRED**: Find and validate autoencoder training script before starting Phase 8 pipeline.

```bash
# Search for it
find c:\Users\james\Videos\deeds-web-app -name "*auto*" -o -name "*ae*" -o -name "*latent*" | grep -E "\.(mjs|py|ts)$" | head -20
```

If it doesn't exist, it must be built from scratch (30-60 min additional work).

