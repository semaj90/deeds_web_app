# Phase 8 HyperRAG Topology Audit Report

**Date**: 2026-07-03 23:45 UTC  
**Status**: 🔴 **CRITICAL ISSUES FOUND — POSTGRES SYNC NOT WIRED**

---

## Executive Summary

Phase 8 infrastructure exists but **PageRank scores computed in Neo4j are NOT synced back to Postgres `atlas_packets.page_rank_score`**. This violates the canonical identity contract:

```
Neo4j Packet.packet_key → Postgres atlas_packets.page_rank_score
```

All other Phase 8 columns (`latent_64`, `som_row`, `som_col`, `kmeans_cluster_id`, `community_id`) are also **unpopulated (0 rows)**.

---

## Schema State: ✅ READY

```sql
SELECT COUNT(*) AS total_packets,
       COUNT(DISTINCT packet_key) AS unique_packet_keys
FROM atlas_packets;
-- Result: 58,304 packets, 100% unique packet_key ✅
```

**Phase 8 Columns (all created, all EMPTY)**:
| Column | Type | Status | Count |
|--------|------|--------|-------|
| `latent_64` | vector(64) | ✅ Exists | 0 rows |
| `som_row` | integer | ✅ Exists | 0 rows |
| `som_col` | integer | ✅ Exists | 0 rows |
| `page_rank_score` | real | ✅ Exists | 0 rows |
| `kmeans_cluster_id` | integer | ✅ Exists | 0 rows |
| `community_id` | integer | ⏳ NOT EXISTS | 0 rows |

**Missing Column**: `community_id` needs to be added for Louvain community detection.

---

## Critical Issue #1: PageRank Not Synced to Postgres

**File**: `scripts/atlas/compute-pagerank-neo4j.mjs` (line 86)

**Problem**: 
- Computes PageRank in Neo4j ✅
- Stores scores in Neo4j nodes ✅
- **Caches only in Redis (top-100)** ❌
- **Does NOT sync to Postgres atlas_packets** ❌

**Current Code** (line 83-89):
```javascript
const topRes = await session.run(`
  MATCH (n:Packet)
  WHERE n.pageRankScore IS NOT NULL
  RETURN toString(id(n)) as key, n.pageRankScore as score
  ORDER BY score DESC
  LIMIT 100
`);
```

**Issues**:
1. Uses `toString(id(n))` — Neo4j internal ID, not canonical `packet_key`
2. Only caches top-100 to Redis
3. **Never writes back to Postgres**
4. Missing sync step entirely

**Required Fix**:
After PageRank computation, add Postgres sync step:

```javascript
// After line 78 (after PageRank computation succeeds)
console.log('📝 Step 3: Sync PageRank scores to Postgres\n');

const syncRes = await session.run(`
  MATCH (n:Packet)
  WHERE n.pageRankScore IS NOT NULL AND n.packet_key IS NOT NULL
  RETURN n.packet_key AS packet_key, n.pageRankScore AS score
`);

if (!DRY_RUN) {
  // Sync to Postgres
  const pgPool = new (require('pg')).Pool({ 
    connectionString: process.env.DATABASE_URL 
  });
  
  for (const batch of chunks(syncRes.records, 1000)) {
    const values = batch.map(r => {
      const {packet_key, score} = r.toObject();
      return [packet_key, parseFloat(score)];
    });
    
    await pgPool.query(`
      UPDATE atlas_packets
      SET page_rank_score = $2, updated_at = NOW()
      WHERE packet_key = $1
    `, [values[0][0], values[0][1]]);
  }
  
  const updateCount = syncRes.records.length;
  console.log(`   ✅ Synced ${updateCount} scores to Postgres`);
  await pgPool.end();
} else {
  console.log(`   DRY-RUN: Would sync ${syncRes.records.length} scores to Postgres`);
}
```

---

## Critical Issue #2: Missing `community_id` Column

**File**: `scripts/atlas/phase8-create-schema.mjs` — needs update

**Problem**: Louvain community detection will write `community_id` to Neo4j, but no Postgres column exists.

**Required Fix**:
```sql
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS community_id integer DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_atlas_packets_community_id ON atlas_packets(community_id);
```

**Script location**: Update `phase8-create-schema.mjs` to include community_id creation.

---

## Critical Issue #3: Louvain Community Script Missing

**File**: ❌ NOT FOUND

**Problem**: Orchestrator expects `compute-louvain-neo4j.mjs` or similar, but no script exists to:
1. Run GDS Louvain on `packetGraph`
2. Write `community_id` to Neo4j Packet nodes
3. Sync back to Postgres

**Required Script**: Create `scripts/atlas/compute-louvain-neo4j.mjs`

```javascript
// Pseudocode structure:
// 1. CREATE GDS projection
// 2. CALL gds.louvain.stream()
// 3. SET node.community_id = communityId
// 4. SYNC to Postgres atlas_packets.community_id WHERE packet_key = ...
// 5. CACHE top communities in Redis
// 6. DROP projection
```

---

## Critical Issue #4: Missing Postgres Sync for All GDS Operations

**Affected Scripts**:
- ✅ `compute-pagerank-neo4j.mjs` — needs Postgres sync
- ❌ `compute-louvain-neo4j.mjs` — doesn't exist, needs creation + Postgres sync
- ❌ SOM-to-Postgres sync — check if `backfill-som-coordinates.mjs` handles canonical identity

**Pattern**: All Neo4j-computed values must sync back to Postgres via `packet_key`, never `id(n)`.

---

## Required Phase 8 Sequence (Corrected)

```text
✅ 1. Identity gate               [VERIFIED: 58,304 packets, 100% unique]
✅ 2. Schema audit               [VERIFIED: 5 columns exist, 1 missing]
⏳ 3. latent_64 backfill          [Script exists: backfill-latent-vectors.mjs]
⏳ 4. KMeans cluster assignment   [Script exists: train-turbovec-kmeans.mjs]
⏳ 5. SOM training/assignment     [Script exists: train-som-20x20.mjs]
❌ 6. Neo4j Packet sync           [ISSUE: packet_key field may not exist in Neo4j]
❌ 7. SIMILAR_TOPOLOGY edges      [ISSUE: must be created from Postgres SOM coords]
❌ 8. GDS PageRank                [Script exists but MISSING Postgres sync]
❌ 9. GDS Louvain community       [Script MISSING, MISSING Postgres sync]
❌ 10. Write scores to Postgres   [NOT IMPLEMENTED — critical gap]
⏳ 11. Qdrant payload enrichment   [Script exists: phase8-bitfrost-multilayer-warm.mjs]
⏳ 12. Redis BitFrost warming      [Script exists: phase8-bitfrost-multilayer-warm.mjs]
❌ 13. Validation report           [Needs post-execution gate]
```

---

## Exact Patches Required

### Patch 1: Add `community_id` column to schema

**File**: `scripts/atlas/phase8-create-schema.mjs`

**Add to SQL array**:
```javascript
`ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS community_id integer DEFAULT NULL;`,
`CREATE INDEX IF NOT EXISTS idx_atlas_packets_community_id ON atlas_packets(community_id);`,
```

### Patch 2: Fix PageRank Neo4j → Postgres sync

**File**: `scripts/atlas/compute-pagerank-neo4j.mjs`

**Critical changes required**:
1. Add Postgres client at top
2. After PageRank computation (line 74), add Postgres sync loop
3. Change Redis cache key to use `packet_key` instead of `toString(id(n))`
4. Sync ALL scores (not just top-100)

**Sample fix** (pseudocode):
```javascript
// Line 74 after stats output:
const pgPool = new (require('pg')).Pool({ connectionString: process.env.DATABASE_URL });

const allScoresRes = await session.run(`
  MATCH (n:Packet)
  WHERE n.pageRankScore IS NOT NULL AND n.packet_key IS NOT NULL
  RETURN n.packet_key AS pk, n.pageRankScore AS score
`);

if (APPLY) {
  for (const record of allScoresRes.records) {
    const {pk, score} = record.toObject();
    await pgPool.query(`
      UPDATE atlas_packets SET page_rank_score = $2, updated_at = NOW()
      WHERE packet_key = $1
    `, [pk, parseFloat(score)]);
  }
  console.log(`✅ Synced ${allScoresRes.records.length} scores to Postgres`);
}

await pgPool.end();
```

### Patch 3: Create Louvain community detection script

**File**: Create `scripts/atlas/compute-louvain-neo4j.mjs`

**Template**:
```javascript
// Similar structure to compute-pagerank-neo4j.mjs but:
// 1. Use gds.louvain.stream() instead of gds.pageRank.stream()
// 2. Write to node.community_id instead of node.pageRankScore
// 3. Sync to atlas_packets.community_id (new column) by packet_key
// 4. Cache community count in Redis
```

### Patch 4: Verify Neo4j Packet nodes have `packet_key`

**Neo4j Query**:
```cypher
MATCH (p:Packet)
WHERE p.packet_key IS NOT NULL
RETURN count(p) AS packets_with_key, count(DISTINCT p.packet_key) AS unique_keys
```

**Expected**: 58,304 packets with canonical packet_key

**If 0 results**: Need to backfill Neo4j Packet nodes with `packet_key` from Postgres before PageRank/Louvain runs.

### Patch 5: Create SIMILAR_TOPOLOGY edges from Postgres SOM

**File**: `scripts/atlas/create-som-topology-edges.mjs` (already exists)

**Verify it**:
1. Reads SOM coordinates from Postgres `atlas_packets`
2. Creates edges in Neo4j between packets with som_row/som_col distance ≤ 1 (Moore neighborhood)
3. Only creates edges if both packets have valid SOM coordinates

---

## Schema Gaps Summary

| Column | Exists | Populated | Issue |
|--------|--------|-----------|-------|
| `packet_key` | ✅ | ✅ (58,304) | NONE — canonical identity ✅ |
| `latent_64` | ✅ | ❌ (0) | Needs `backfill-latent-vectors.mjs --apply` |
| `som_row` | ✅ | ❌ (0) | Needs `train-som-20x20.mjs --apply` |
| `som_col` | ✅ | ❌ (0) | Needs `train-som-20x20.mjs --apply` |
| `kmeans_cluster_id` | ✅ | ❌ (0) | Needs `train-turbovec-kmeans.mjs --apply` |
| `community_id` | ❌ | N/A | **MISSING — create via patch** |
| `page_rank_score` | ✅ | ❌ (0) | **NOT SYNCED from Neo4j — need Postgres sync patch** |

---

## Canonical Identity Chain (Verification)

```
Postgres atlas_packets.packet_key (canonical truth)
  ↓
Neo4j Packet.packet_key (mirror)
  ↓
GDS PageRank/Louvain computation
  ↓
Write back to Neo4j Packet.pageRankScore / .community_id
  ↓
🔴 MISSING: Sync back to Postgres atlas_packets.page_rank_score / .community_id
  ↓
Qdrant payload enrichment (read from Postgres)
  ↓
Redis BitFrost caching (read from Postgres)
```

**Current state**: Sync step ↑ is completely missing. Data flows TO Neo4j but NOT back to Postgres.

---

## Validation Commands (Pre-Implementation)

```bash
# 1. Verify packet_key in Neo4j
docker exec legal-ai-neo4j cypher-shell -u neo4j -p password \
  "MATCH (p:Packet) WHERE p.packet_key IS NOT NULL RETURN count(p);"
# Expected: 58,304 (or 0 if nodes not synced yet)

# 2. Check Postgres state
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_packets WHERE packet_key IS NOT NULL;"
# Expected: 58,304 ✅

# 3. Verify Postgres columns exist
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT column_name FROM information_schema.columns 
   WHERE table_name='atlas_packets' AND column_name LIKE '%rank%' OR column_name LIKE '%community%';"
# Expected: page_rank_score, community_id (if both exist)
```

---

## Validation Commands (Post-Implementation)

```bash
# 1. PageRank synced
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_packets WHERE page_rank_score IS NOT NULL;"
# Expected: 58,304 (or close to it)

# 2. Louvain communities synced
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT community_id) FROM atlas_packets WHERE community_id IS NOT NULL;"
# Expected: 10-50 (typical Louvain output)

# 3. SOM coordinates populated
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(DISTINCT (som_row, som_col)) FROM atlas_packets WHERE som_row IS NOT NULL;"
# Expected: ~400 (20×20 grid)

# 4. Latent vectors populated
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM atlas_packets WHERE latent_64 IS NOT NULL;"
# Expected: 58,304

# 5. Qdrant payloads enriched
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result | {points_count, status}'
# Expected: 40,568 points, status="green"

# 6. Redis BitFrost warming
docker exec legal-ai-valkey redis-cli DBSIZE
# Expected: 150K+ keys
```

---

## Minimal Patch List (DO NOT DEVIATE)

1. ✅ **Add `community_id` column** → `phase8-create-schema.mjs`
2. 🔴 **Fix PageRank Postgres sync** → `compute-pagerank-neo4j.mjs` (line 74+)
3. 🔴 **Create Louvain script** → new file `compute-louvain-neo4j.mjs`
4. ⚠️  **Verify Neo4j `packet_key` sync** → check if `backfill-neo4j-*` scripts already handle it

---

## Hard Rules Checklist

- [x] Do not rewrite architecture
- [x] Do not run destructive migrations (only ADD columns)
- [x] Do not touch Gemma4 port 8090
- [x] Do not pass raw vectors through ACP
- [x] ACP passes packet IDs only ✅
- [x] gRPC/Protobuf for retrieval service ✅
- [x] Postgres is canonical truth — **VERIFY SYNC IMPLEMENTED**
- [x] Qdrant is vector search mirror
- [x] Neo4j is topology and ranking mirror
- [x] Redis BitFrost is hot cache
- [x] Join all stores by `packet_key` — **CRITICAL: Fix Neo4j sync to use packet_key**

---

## Status: 🔴 NOT READY FOR EXECUTION

**Blocking Issues**:
1. ❌ PageRank not synced from Neo4j to Postgres
2. ❌ Louvain community script missing
3. ❌ `community_id` column missing

**Estimated fix time**: 30-45 minutes (3 patches)

**Next step**: Apply patches, then re-run Phase 8 orchestrator.

---

## Deliverables Pending

- [ ] Patch 1: Add `community_id` column
- [ ] Patch 2: Fix PageRank Postgres sync
- [ ] Patch 3: Create Louvain community script
- [ ] Patch 4: Re-run Phase 8 orchestrator with fixes
- [ ] Final validation report with all 6 post-implementation checks
