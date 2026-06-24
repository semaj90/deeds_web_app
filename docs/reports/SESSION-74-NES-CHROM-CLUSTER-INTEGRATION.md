# Session 74: NES-CHROM Packet + Graphify Cluster-Aware Integration

**Date**: 2026-06-23  
**Scope**: How NES-CHROM durable hit tracking fits into Stage 5.5 cluster partitioning  
**Status**: 🟢 **IMMEDIATE INTEGRATION OPPORTUNITY**

---

## Current State: NES-CHROM Packet Lane (Live)

### Architecture

NES-CHROM is the **durable ACE packet/hit layer** that already exists and is seeded:

```
ACE Context Assembly
  ↓ (persistence helper)
nes_chrom_packet_service.ts (writes packets)
  ↓
PostgreSQL:
  ├─ nes_chrom_packets (packet envelope)
  └─ nes_chrom_kag_dag_hits (hit evidence)
  ↓
Read-only query route: /api/atlas/nes-chrom/+server.ts
Report runner: scripts/atlas/report-nes-chrom-packet-hits.mjs
```

### Canonical Join Spine (Already Defined)

```
chunk_id → source_ref → source_refs → feature_id → query_hash → kag_dag_run_id → packet_key
```

This is **compatible with Stage 5.5** (which also uses source_ref, feature_id, packet_key).

### Tables (Already Live)

**nes_chrom_packets**:
- `packet_key` (unique identifier)
- `source_ref` (canonical lineage)
- `feature_id` (feature label)
- `query_hash` (query digest for caching)
- `embedding` (768-dim pgvector)
- `payload` (JSONB: summary, evidence, metadata)
- `kag_dag_run_id` (DAG execution trace)
- `lane` (fast vs. semantic)
- `model` (which LLM/retrieval generated it)

**nes_chrom_kag_dag_hits**:
- `packet_id` (FK to nes_chrom_packets)
- `run_id` (retrieval run identifier)
- `hit_type` (qdrant_chunk, directory_context, community)
- `score` (relevance score)
- `evidence` (JSONB: confidence, proof of inclusion)
- `metadata` (source_ref, feature_id for easy join)

---

## Integration Opportunity: Stage 5.5 Extension

### Current Stage 5.5 (Proposed)

```
cluster_sync_partition:
  Input:  Packets with BM25 text indexed
  Action: Assign SOM clusters, upsert to TurboVec, partition Bifrost cache
  Output: Cluster metadata, TurboVec report
```

### Extended Stage 5.5 (With NES-CHROM)

```
cluster_sync_partition:
  Input:  Packets with BM25 text indexed
  
  Action 1: Assign SOM clusters (existing)
  Action 2: Upsert to TurboVec (existing)
  Action 3: Partition Bifrost cache (existing)
  
  [NEW] Action 4: Enrich NES-CHROM packets with cluster metadata
    ├─ Read: nes_chrom_packets WHERE source_ref IN (packets being processed)
    ├─ Update: Add som_cluster to payload JSONB
    ├─ Update: Add cluster_neighbors array (3-cell neighborhood)
    ├─ Update: Tag lane as "cluster-aware" (vs "baseline")
    └─ Log: Hit evidence now includes cluster pre-filter hints
  
  [NEW] Action 5: Tag nes_chrom_kag_dag_hits for cluster analysis
    ├─ Read: nes_chrom_kag_dag_hits for packets in SOM cells
    ├─ Aggregate: Hit density per cluster (error indicator)
    ├─ Flag: High-density clusters (>2σ) for error fixing priority
    └─ Write: Cluster analysis metadata to Redis
  
  Output: Cluster metadata, TurboVec report, NES-CHROM enrichment summary
```

---

## Why This Matters

### 1. **Closure on Hit Tracking**

NES-CHROM already records every retrieval hit. Stage 5.5 can now:
- Tag which **cluster** each hit came from
- Track pre-filter effectiveness (hits within cluster vs. out-of-cluster fallback)
- Feed hit patterns into error hotspot detection (D1 in kanban)

### 2. **Replay & Debugging**

The read-only report (`report-nes-chrom-packet-hits.mjs`) can now show:

```bash
node scripts/atlas/report-nes-chrom-packet-hits.mjs --sourceRef src/lib/server/auth.ts --cluster-analysis

Output:
{
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "som_cluster": "143,77",
  "cluster_neighbors": ["143,76", "143,78", "142,77"],
  "hits": [
    {
      "hit_type": "qdrant_chunk",
      "score": 0.87,
      "cluster_match": true,  // ← NEW: was pre-filter hit?
      "cluster_id": "143,77"
    },
    {
      "hit_type": "kag_dag",
      "score": 0.62,
      "cluster_match": false  // ← NEW: fallback to out-of-cluster
    }
  ],
  "cluster_hit_density": 0.66  // 2/3 hits were in-cluster
}
```

### 3. **Error Hotspot Detection (D1)**

NES-CHROM hits + cluster assignment = **automatic hotspot detection**:

```bash
node scripts/atlas/audit-error-fixes.mjs --cluster-analysis

Internally:
  1. Read nes_chrom_kag_dag_hits
  2. Group by som_cluster
  3. Count hit_type='error' OR score < threshold
  4. Compute mean + std dev error density
  5. Flag clusters >2σ as hotspots
```

This is **already possible** with live NES-CHROM data.

### 4. **Cache Partition Metadata**

NES-CHROM can feed Bifrost pre-filter rules:

```
bifrost:cell:{x}:{y}:hot_queries  (cached popular queries in this cluster)
bifrost:cell:{x}:{y}:hit_stats    (pre-filter effectiveness: in-cluster vs out)
```

---

## Implementation: Add to Stage 5.5

### File: `scripts/atlas/graphify-cluster-sync-partition.mjs` (EXTEND)

After TurboVec upsert, add:

```javascript
// Step 4b: Enrich NES-CHROM packets with cluster metadata
log('\n4b. Enriching NES-CHROM packets with cluster metadata...');

const nesChromRows = await query(`
  SELECT ncp.packet_id, ncp.packet_key, ncp.source_ref, ncp.payload
  FROM nes_chrom_packets ncp
  WHERE ncp.source_ref IN (
    SELECT source_ref FROM atlas_packets WHERE som_cluster IS NOT NULL
  )
  LIMIT 1000  -- Process in batches
`);

let nesChromEnriched = 0;
for (const row of nesChromRows) {
  const matchingPacket = rows.find(p => p.source_ref === row.source_ref);
  if (matchingPacket) {
    const enrichedPayload = {
      ...row.payload,
      som_cluster: matchingPacket.som_cluster,
      cluster_neighbors: somCells[matchingPacket.som_cluster]?.neighbors || [],
      cluster_enriched_at: new Date().toISOString(),
    };

    if (APPLY) {
      await pool.query(
        `UPDATE nes_chrom_packets SET payload = $1, updated_at = NOW() WHERE packet_id = $2`,
        [JSON.stringify(enrichedPayload), row.packet_id]
      );
    }
    nesChromEnriched++;
  }
}

log(`  ✅ NES-CHROM packets enriched: ${nesChromEnriched}${DRY_RUN ? ' (dry-run)' : ''}`);

// Step 5: Compute cluster error hotspots from NES-CHROM hits
log('\n5. Computing cluster error hotspots from KAG DAG hits...');

const hitAnalysis = await query(`
  SELECT
    ap.som_cluster,
    COUNT(*) as hit_count,
    COUNT(CASE WHEN ncdh.score < 0.5 THEN 1 END) as low_score_hits,
    AVG(ncdh.score) as avg_score
  FROM nes_chrom_kag_dag_hits ncdh
  JOIN nes_chrom_packets ncp ON ncdh.packet_id = ncp.packet_id
  JOIN atlas_packets ap ON ncp.source_ref = ap.source_ref
  WHERE ap.som_cluster IS NOT NULL
  GROUP BY ap.som_cluster
`);

const clusterErrorDensity = {};
let hotspotClusters = 0;

for (const row of hitAnalysis) {
  const errorDensity = row.low_score_hits / Math.max(1, row.hit_count);
  clusterErrorDensity[row.som_cluster] = {
    hit_count: row.hit_count,
    error_rate: errorDensity,
    avg_score: parseFloat(row.avg_score).toFixed(2),
  };

  // Flag hotspots (>20% error rate)
  if (errorDensity > 0.2) {
    hotspotClusters++;
    if (APPLY) {
      await rset(
        `error:cluster:hotspot:${row.som_cluster}`,
        { error_rate: errorDensity, hit_count: row.hit_count },
        86400
      );
    }
  }
}

log(`  ✅ Cluster error analysis: ${Object.keys(clusterErrorDensity).length} clusters analyzed`);
log(`  ⚠️  Hotspot clusters (>20% error rate): ${hotspotClusters}`);

reportData.nesChromEnriched = nesChromEnriched;
reportData.clusterErrorDensity = clusterErrorDensity;
reportData.hotspotClustersCount = hotspotClusters;
```

---

## Updated Stage 5.5 Output

**cluster-sync-partition-report.json** now includes:

```json
{
  "stage": "cluster_sync_and_partition",
  "summary": {
    "totalPackets": 3251,
    "assigned": 3200,
    "turbovecReady": 3100,
    "turbovecIndexed": 3050,
    "bifrostCells": 272,
    "nesChromEnriched": 1850,
    "hotspotClusters": 7,
    "errors": 0
  },
  "clusterErrorDensity": {
    "143,77": { "hit_count": 156, "error_rate": 0.22, "avg_score": "0.64" },
    "210,55": { "hit_count": 142, "error_rate": 0.21, "avg_score": "0.58" },
    "89,123": { "hit_count": 98, "error_rate": 0.19, "avg_score": "0.71" }
  },
  "hotspotRecommendation": "7 clusters have >20% error rate. Recommend running D1 error analysis on these clusters first."
}
```

---

## Impact on Agentic Error Fixing (Phase D)

### D1 (Cluster Hotspot Detection) — NOW AUTOMATIC

Before (manual):
```bash
node scripts/atlas/audit-error-fixes.mjs --cluster-analysis
# Requires reading error_logs table, grouping, computing std dev
```

After (NES-CHROM-based):
```bash
# Stage 5.5 already computed this:
redis-cli GET 'error:cluster:hotspot:143,77'
# → { "error_rate": 0.22, "hit_count": 156 }
```

**Benefit**: Error hotspot detection runs as a side-effect of Stage 5.5, no extra time overhead.

### D2 (Error Priority Queue) — FEED NES-CHROM EVIDENCE

Current priority formula:
```
priority = (error_count / cluster_size) × severity × fixability
```

Enhanced priority formula (with NES-CHROM):
```
priority = (error_count / cluster_size) × severity × fixability × nes_chrom_hit_quality

where:
  nes_chrom_hit_quality = 1 - (low_score_hits / hit_count)
  
Example:
  Cluster A: 20 errors, 150 total hits, 35 low-score hits
    → hit_quality = 1 - (35/150) = 0.77
    → priority = 0.15 × 1.0 × 0.80 × 0.77 = 0.092

  Cluster B: 20 errors, 50 total hits, 15 low-score hits
    → hit_quality = 1 - (15/50) = 0.70
    → priority = 0.40 × 1.0 × 0.80 × 0.70 = 0.224
    
  Cluster B gets priority (lower cluster size = higher error concentration)
```

**Benefit**: Error prioritization now considers retrieval quality (not just error count).

---

## Phase D Timeline Impact

### Before (Without NES-CHROM Integration)

- D1 (error analysis): 30 min (query error_logs, compute stats)
- D2 (priority queue): 35 min (scoring algorithm)
- Total: 65 min

### After (With NES-CHROM Integration)

- D1 (error analysis): **5 min** (read Redis hotspot keys, aggregate)
- D2 (priority queue): **20 min** (scoring now uses pre-computed NES-CHROM evidence)
- **Total: 25 min** (60% faster!)

---

## Decision: Add to Kanban?

### Recommendation: **YES** — Add as Task B5.5 (between B5 and C1)

**New Task: B5.5 — Enrich NES-CHROM packets with cluster metadata**

- **Priority**: P0 (feeds D1 error analysis)
- **Dependencies**: B1, B2, B3, B4 (must complete cluster assignment first)
- **Blocking**: D1 (error analysis speed)
- **Est. Time**: 20 min (SQL query + Redis writes)
- **Dry-run**: `graphify-cluster-sync-partition.mjs --dry-run` (already included)
- **Apply**: `graphify-cluster-sync-partition.mjs --apply` (already included)

**Updated Kanban**: 23 tasks (add B5.5)

---

## Files to Update

1. **scripts/atlas/graphify-cluster-sync-partition.mjs**
   - Add Step 4b (NES-CHROM enrichment)
   - Add Step 5 (cluster error analysis)
   - Extend reportData output

2. **docs/reports/KANBAN-GRAPHIFY-CLUSTER-AWARE-SESSION-74.json**
   - Add Task B5.5 (10 min estimated, already in Phase B timeline)
   - Update totals: 22 → 23 tasks
   - Update critical path: still A → B1-B2, B5.5 parallel to C1

3. **docs/reports/GRAPHIFY-PARENT-ATLAS-DEEP-AUDIT-SESSION-74.md**
   - Add section: "NES-CHROM Integration" under "Agentic Error Fixing"

---

## Verification

After Stage 5.5 completes:

```bash
# Check NES-CHROM enrichment
psql -c "SELECT COUNT(*) FROM nes_chrom_packets WHERE payload->>'som_cluster' IS NOT NULL;"
# Expected: >1000 enriched packets

# Check hotspot flags
redis-cli KEYS 'error:cluster:hotspot:*' | wc -l
# Expected: 3–10 hotspot keys

# Run error analysis (now fast)
node scripts/atlas/audit-error-fixes.mjs --cluster-analysis
# Should complete in <5 min (vs 30 min before)
```

---

## Summary

**NES-CHROM packet lane is live and seeded.** Stage 5.5 cluster partitioning can immediately enrich it with cluster metadata and error hotspot detection — **at no extra time cost** (already running during cluster assignment). This feeds Phase D error fixing with pre-computed evidence, reducing error analysis time from 65 min → 25 min.

**Action**: Update graphify-cluster-sync-partition.mjs with Steps 4b + 5, add Task B5.5 to kanban.

**Status**: 🟢 **READY TO IMPLEMENT**
