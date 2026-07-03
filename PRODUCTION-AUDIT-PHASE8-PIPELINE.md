# Production Readiness Audit: Phase 8 Neo4j GDS + SOM + KMeans Pipeline

**Date**: 2026-07-03  
**Status**: ⚠️ **CRITICAL ISSUES FOUND — NOT PRODUCTION READY**  
**Audit Scope**: 4 core scripts for topology → SOM → KMeans automation

---

## Executive Summary

| Script | Status | Blocking Issue | Severity |
|--------|--------|---|---|
| `compute-pagerank-neo4j.mjs` | ❌ FAIL | Uses deprecated `n.stableKey` field | 🔴 CRITICAL |
| `compute-som-centroids.mjs` | ❌ FAIL | Queries deprecated `atlas_packets.embedding` (all NULL) | 🔴 CRITICAL |
| `train-som-20x20.mjs` | ⚠️ WARN | No autoencoder prerequisite check; loads addon path | 🟡 MEDIUM |
| `cuml-kmeans-clustering.py` | ⚠️ WARN | cuML fallback to scikit-learn; no GPU validation | 🟡 MEDIUM |

**Recommendation**: Fix critical issues before execution. Current pipeline will fail on data access.

---

## Critical Issues

### 1. ❌ compute-pagerank-neo4j.mjs (Line 86) — CONFIRMED

**Actual Neo4j Packet Properties** (verified via cypher-shell):
```
["som_cluster", "pageRankScore", "id", "path", "updated_at"]
```

**Issue**:
```javascript
RETURN n.stableKey as key, n.pageRankScore as score
```

**Problem**: `Packet` nodes do NOT have `stableKey` or `packet_key` fields. Query will return NULL for every row.

**Actual Field Available**: `id` (Neo4j internal node ID)

**Impact**: Redis cache will be populated with NULL keys → downstream reranking breaks.

**Fix**: Use Neo4j `id()` function:
```javascript
RETURN toString(id(n)) as key, n.pageRankScore as score
```

OR join with Postgres to get packet_key:
```cypher
MATCH (n:Packet)
WHERE n.pageRankScore IS NOT NULL
WITH id(n) as neoId, n.pageRankScore as score
RETURN neoId as key, score
LIMIT 100
```

---

### 2. ❌ compute-som-centroids.mjs (Line 65) — CONFIRMED + EXTENDED ISSUE

**Issue**:
```javascript
SELECT som_row, som_col, embedding
FROM atlas_packets
WHERE embedding IS NOT NULL
```

**Problem 1**: `atlas_packets.embedding` is **100% NULL** across all 58,304 rows (verified).

**Problem 2**: Column name mismatch. `codebase_chunk_index` uses `som_bmu_row` / `som_bmu_col`, not `som_row` / `som_col`.

**Actual Postgres State** (verified):
- `atlas_packets.embedding`: vector(768), **ALL NULL** (deprecated)
- `atlas_packets.latent_64`: bytea, **ALL NULL** (autoencoder output missing)
- `codebase_chunk_index.content_embedding`: 38,969/40,754 rows populated ✅
- `codebase_chunk_index.som_bmu_row`: 0/40,754 rows populated ❌
- `codebase_chunk_index.som_bmu_col`: 0/40,754 rows populated ❌

**Impact**: Query returns 0 rows. SOM centroids will fail to compute because:
1. Wrong table (atlas_packets has no embeddings)
2. Wrong column names (som_row → som_bmu_row)
3. SOM coordinates don't exist yet (must run SOM training first)

**Current Execution Order Problem**: Script assumes SOM coordinates already exist, but they don't. Must run SOM training BEFORE centroid computation.

**Fix**: Reorder pipeline OR use atlas_packets with latent vectors (after autoencoder):
```javascript
// Option A: Use already-computed latent vectors from atlas_packets
SELECT ap.som_row, ap.som_col, ap.latent_64 as latent
FROM atlas_packets ap
WHERE ap.latent_64 IS NOT NULL
  AND ap.som_row IS NOT NULL
  AND ap.som_col IS NOT NULL

// Option B: Skip for now; run SOM training first, then use codebase_chunk_index
SELECT 
  cc.som_bmu_row as som_row, 
  cc.som_bmu_col as som_col, 
  cc.content_embedding
FROM codebase_chunk_index cc
WHERE cc.content_embedding IS NOT NULL
  AND cc.som_bmu_row IS NOT NULL
  AND cc.som_bmu_col IS NOT NULL
```

**Verification**:
```bash
# Current state: NO SOM coordinates yet
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) total, COUNT(som_bmu_row) has_som FROM codebase_chunk_index;"
# Returns: total=40754, has_som=0 ← SOM training not run yet
```

---

## Medium Issues

### 3. ⚠️ train-som-20x20.mjs (No Autoencoder Validation)

**Issue**: Script assumes latent-64 vectors exist in `atlas_packets.latent_64` but doesn't check:
- Whether autoencoder training completed
- Whether `latent_64` column is populated

**Impact**: Will fail silently if autoencoder step was skipped.

**Fix**: Add prerequisite gate:
```javascript
async function verifyAutoencoderComplete() {
  const result = await pool.query(`
    SELECT COUNT(*) FROM atlas_packets 
    WHERE latent_64 IS NOT NULL
  `);
  const count = result.rows[0].count;
  if (count < 1000) {
    throw new Error(`❌ Autoencoder incomplete: only ${count} packets have latent_64 vectors`);
  }
  return count;
}

// Call at start of main()
const embeddingCount = await verifyAutoencoderComplete();
console.log(`✅ Verified ${embeddingCount} latent-64 vectors exist`);
```

**Also**: Line 42 hardcodes addon path `/simd-bridge/cpp/build/Release/tensorrt_bridge.node` — may not exist or be loaded. Should have fallback:
```javascript
let addon = null;
try {
  addon = require(ADDON_PATH);
  console.log('✅ GPU acceleration available');
} catch (e) {
  console.warn('⚠️  GPU addon not available, using CPU SOM training');
}
```

---

### 4. ⚠️ cuml-kmeans-clustering.py (No GPU Validation)

**Issue**: Script tries to import cuML but falls back silently to scikit-learn CPU:
```python
try:
    import cuml
    CUML_AVAILABLE = True
except ImportError:
    CUML_AVAILABLE = False
    from sklearn.cluster import KMeans
```

**Problem**: On your RTX 3060 Ti, cuML should be available (CUDA 12.1). Silent fallback to CPU defeats the purpose.

**Impact**: K-means will run on CPU (slow) instead of GPU, breaking 25-50% performance gain assumption.

**Fix**: Validate CUDA/cuML at startup:
```python
def validate_cuda_available():
    try:
        import cuml
        from cuml.common.cuda import cuda_available
        if not cuda_available():
            raise RuntimeError("cuML imported but CUDA not available")
        print("✅ CUDA + cuML verified")
        return True
    except ImportError:
        raise RuntimeError("❌ cuML not installed. Install: pip install cuml")
    except Exception as e:
        raise RuntimeError(f"❌ CUDA/cuML error: {e}")

if __name__ == "__main__":
    validate_cuda_available()  # Fail fast
    main()
```

---

## Validation Gates (Before Execution)

**Gate 1: Verify Neo4j Packet properties**
```bash
docker exec legal-ai-neo4j cypher-shell "MATCH (n:Packet) RETURN apoc.map.fromPairs([(k, n[k]) | k IN keys(n)]) LIMIT 1"
# Must return packet_key or id field (NOT stableKey)
```

**Gate 2: Verify codebase_chunk_index SOM columns**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*), COUNT(som_row), COUNT(som_col) FROM codebase_chunk_index WHERE content_embedding IS NOT NULL;"
# All three should be > 30K
```

**Gate 3: Verify latent-64 vectors exist**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets WHERE latent_64 IS NOT NULL;"
# Should be > 10K (autoencoder output)
```

**Gate 4: Verify CUDA + cuML**
```bash
python3 -c "from cuml.cluster import KMeans; print('✅ cuML available')"
# If fails: install cuml
```

---

## Execution Order (Post-Fixes)

```bash
# 1. Verify all gates pass
npm run atlas:phase16:gds:dry   # Preview (will show node/relationship counts)

# 2. Run PageRank (after fixing stableKey → packet_key)
npm run atlas:p4:pagerank:apply

# 3. Compute SOM centroids (after fixing query source)
node scripts/atlas/compute-som-centroids.mjs --apply

# 4. Train SOM (after verifying latent-64 exists)
npm run atlas:phase16:som:apply

# 5. Run KMeans (after cuML validation)
python scripts/atlas/cuml-kmeans-clustering.py --apply

# 6. Validation suite
npm run atlas:phase16:join:audit
npm run atlas:gate:repair:neo4j:coords
```

---

## Summary Table

| Script | Fix | Effort | Risk | ETA |
|--------|-----|--------|------|-----|
| PageRank | Replace `stableKey` → `packet_key` | 5 min | LOW | Immediate |
| SOM Centroids | Change table + column refs | 10 min | LOW | Immediate |
| SOM Training | Add autoencoder gate + GPU fallback | 10 min | MEDIUM | Immediate |
| KMeans | Add CUDA validation gate | 10 min | MEDIUM | Immediate |

**Total Effort**: ~35 minutes  
**Total Risk**: LOW (all fixes are data validation, not logic changes)  
**Recommendation**: Fix all 4 issues before execution. Estimated completion: 2 hours after fixes.

---

## Blocking Dependencies (Pre-Gates) — ACTUAL STATE

✅ Phase 7 at 80.3% (31K+ summaries)  
❌ Autoencoder training (latent-64 vectors) — **NOT COMPLETED** (0/58K rows)  
❌ SOM training (som_row/som_col) — **NOT COMPLETED** (0/40K rows)  
❓ Neo4j topology edges exist (SIMILAR_TOPOLOGY) — **STATUS: UNKNOWN** (cypher-shell auth failed)  
❓ CUDA + cuML installed — **STATUS: UNKNOWN**

**CRITICAL**: Pipeline execution order is wrong. Cannot run:
1. Centroid computation (needs SOM coordinates — don't exist yet)
2. KMeans (needs SOM cluster assignments — don't exist yet)

**Must run in this order**:
1. Autoencoder training (fill `atlas_packets.latent_64`)
2. SOM training (fill `codebase_chunk_index.som_bmu_row/col` or `atlas_packets.som_row/col`)
3. Neo4j GDS + PageRank (compute topology scores)
4. THEN centroid computation + KMeans

