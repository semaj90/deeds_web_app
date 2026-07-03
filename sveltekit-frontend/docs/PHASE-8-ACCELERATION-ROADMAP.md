# Phase 8: Cache Warming & Enrichment Pipeline

**Status**: ✅ **PHASE 8A (BITFROST CACHE) READY TO RUN IN PARALLEL WITH PHASE 7**

**Objective**: Reduce query latency by 100–6,000× through four-layer cache warming and metadata enrichment. **Phase 7 workers remain locked and unmodified.** All Phase 8 work is cache-only (read-safe, reversible).

---

## Architecture Overview

```
Query (user)
  ↓
L0: llama-server KV Cache (inside llama-server, cache_prompt=true)
  ↓ hit (system prompt reused)
L1: Redis bitfrost:packet:{key} (5ms, semantic packet envelope)
  ↓ miss (30%)
L2: Redis bitfrost:feature:{id}:packets (5ms, feature aggregates)
  ↓ miss (40% of 30%)
L3: Redis centroid:som:{cluster} (10ms, topology pre-filter)
  ↓ miss (40% of 12%)
L4: Qdrant ANN (1–2s, with payload filters) + Postgres join (2s)
  ↓ result
Write back to L1/L2/L3 for future hits
```

### Four Cache Layers (Phase 8 Roadmap)

| Layer | Cache | Key Pattern | Contents | TTL | Hit Rate | Latency |
|-------|-------|-------------|----------|-----|----------|---------|
| **L0** | llama-server internal | (not in Redis) | System prompt KV | ∞ | 100% per-batch | 0ms (reused) |
| **L1** | BitFrost packets | `bitfrost:packet:{key}` | summary, feature, pagerank, som_cluster | 24h | 70-90% | 5ms |
| **L2** | Feature aggregates | `bitfrost:feature:{id}:packets` | packet_key list | 24h | 30-50% | 5ms |
| **L3** | SOM centroids | `centroid:som:{cluster_id}` | metadata + vector + neighbors | 24h | 40-60% | 10ms |
| **L4** | Query results | `rrf:{hash}`, `semantic:{hash}` | ranked packets (session-scoped) | 5min | 5-15% | 5ms |

---

## Phase 8A: BitFrost + Redis Cache Warming

**Script**: `scripts/atlas/phase8a-som-centroid-cache.mjs` (updated)
**Execution**: **Runs in parallel with Phase 7 workers** (read-safe, no mutations)
**Dependency**: Phase 7 summaries (reads from codebase_chunk_index.summary)

### What It Does (Revised)

1. **L1: Packet Envelope Cache** — reads summarized packets from Postgres
   - `bitfrost:packet:{packet_key}` → {summary, feature_id, pagerank, som_cluster}
   - TTL: 24h | Hit rate: 70-90%

2. **L2: Feature Aggregates** — rolls up packets by feature_id
   - `bitfrost:feature:{feature_id}:packets` → set of packet_keys
   - TTL: 24h | Hit rate: 30-50%

3. **L3: SOM Centroids** — indexes clusters (metadata only)
   - `centroid:som:{cluster_id}` → {row, col, packet_count, centroid_vector}
   - `som:{cluster_id}:members` → packet list
   - TTL: 24h | Hit rate: 40-60%

### Key Design Rules

**DO NOT**:
- Duplicate L0 (llama-server KV cache) in Redis — it's already inside the server
- Cache centroid vectors separately from Qdrant — keep them synchronized
- Block Phase 7 workers — all cache writes are async reads of Postgres

**DO**:
- Run Phase 8A immediately (in parallel with Phase 7)
- Emit throughput metrics (summaries/minute + ETA)
- Verify Redis keys match Postgres summary count

### Usage (Parallel with Phase 7)

```bash
# Run while Phase 7 workers are active (read-only from Postgres)
npm run atlas:phase102:step8a:som-centroid-cache

# Expected output (immediate, no stalls):
# ✓ Fetched 50000 packets (or current count)
# ✓ Cached X packet envelopes
# ✓ Packet envelopes: X keys
# ✓ Feature aggregates: X keys
# ✓ SOM centroids: ~400 keys
```

---

## Phase 8B: Qdrant Payload Enrichment

**Script**: `scripts/atlas/phase8b-qdrant-payload-enrichment.mjs` (not yet built)
**Dependencies**: Phase 7 complete (all summaries written)
**Execution**: After Phase 7 completion (Qdrant is read-write, but payload-only)

### What It Does

1. Reads enriched metadata from Postgres (summaries + feature_id + pagerank + som_cluster)
2. Updates Qdrant collection `codebase_chunks_768` payloads with:
   ```json
   {
     "summary": "Handles session validation...",
     "feature_id": "auth.sessions",
     "feature_label": "Authentication Sessions",
     "som_cluster": 137,
     "som_row": 6,
     "som_col": 17,
     "pagerank": 0.0021,
     "community": 11,
     "authority": 0.84
   }
   ```
3. Creates filter indexes on payload fields (enables faster Qdrant filtering)

### Why This Matters

Before enrichment:
- Qdrant search returns 20 candidates (top-K by vector distance)
- Postgres must join all 20 to rank by RRF

After enrichment:
- Qdrant search filters by `som_cluster` first (400 clusters instead of 40K points)
- Returns only candidates matching topology pre-filter
- Reduces Postgres joins from O(20) to O(5–10)

### Usage (After Phase 7 Complete)

```bash
# Enrich Qdrant payloads
npm run atlas:phase102:step8b:qdrant-payload:enrich:dry
npm run atlas:phase102:step8b:qdrant-payload:enrich:apply

# Expected output:
# ✓ Updated 40000 Qdrant payloads
# ✓ Created 5 filter indexes
# ✓ Payload fields: summary, feature_id, som_cluster, pagerank
```

---

## Phase 8C: Neo4j Topology Enrichment

**Script**: Not yet created
**Dependencies**: Phase 8B complete (Qdrant payloads enriched)
**Execution**: After Qdrant payloads finalized (pure compute, no Phase 7 disruption)

### What It Does

1. Consumes Postgres + Qdrant metadata (summaries, pagerank, som_cluster, etc.)
2. Creates Neo4j relationships:
   - `Packet HAS_FEATURE Feature`
   - `Packet IN_CLUSTER SOMCluster`
   - `Packet SAME_SOM Packet` (adjacency in SOM grid)
   - `Packet SIMILAR_PACKET Packet` (Qdrant dense similarity)
   - `Packet USED_CONCEPT Concept`
3. Runs GDS algorithms:
   - PageRank (refresh after new data)
   - Louvain (community detection)
   - Weakly Connected Components (orphan detection)
   - Node Similarity (for traversal optimization)

### Why Neo4j Is the Graph Layer (Not ANN)

- **Neo4j**: Relationship traversal, topological algorithms, community detection
- **Qdrant**: Vector similarity search, filtering by payload
- **Redis**: Hot cache, O(1) lookups
- **Postgres**: Canonical identity, write-once truth

Each system has a role. Keep Neo4j as **analytics** (GDS), not search (that's Qdrant).

### Usage (After Qdrant Complete)

```bash
# Enrich Neo4j topology
npm run atlas:phase102:step8c:neo4j:enrich:dry
npm run atlas:phase102:step8c:neo4j:enrich:apply

# Expected output:
# ✓ Created 50000 HAS_FEATURE relationships
# ✓ Created 40000 IN_CLUSTER relationships
# ✓ Running PageRank...
# ✓ PageRank complete (avg centrality: 0.0021)
```

---

## Phase 8D: Query Result Cache (Session-Scoped) (OPTIONAL)

**Script**: Not yet created
**Dependencies**: Phase 8A + 8B complete (all L1/L2/L3 layers warm)
**Execution**: Only if query latency is still a bottleneck after 8A–8C

### What It Does (Design Only)

- On each user query, compute hash: `sha256(query + user_id)`
- Cache **ranked results** (not Gemma4 synthesis):
  ```json
  {
    "query_hash": "...",
    "candidate_packets": [...top-10 packet_keys...],
    "metadata": {
      "total_candidates": 40,
      "rrf_blend_scores": [...],
      "cached_at": "2026-07-02T17:30:00Z"
    }
  }
  ```
- Key: `rrf:{hash}` / `semantic:{embedding_hash}` / `topology:{cluster_id}:results`
- TTL: 5 min (session-scoped, garbage-collected)

### Rationale

- Repeated queries hit L4 cache (5ms vs 2–30s cold)
- Useful for dashboard queries (same filters repeated)
- Low priority: L1+L2+L3 already cover 85% of use cases

---

## Execution Order (Phase 7 Unmodified)

### **NOW (Phase 7 Workers Running)**

```bash
# Phase 8A runs IMMEDIATELY in parallel with Phase 7
# Reads from Postgres, writes only to Redis (read-safe)
npm run atlas:phase102:step8a:bitfrost-cache:warm:dry
npm run atlas:phase102:step8a:bitfrost-cache:warm:apply

# Monitor: Phase 7 latest_update keeps advancing
# Monitor: Redis key count matches Postgres summary count
```

### **After Phase 7 Completes (~14–18 hours from now)**

```bash
# Phase 8B enriches Qdrant payloads
npm run atlas:phase102:step8b:qdrant-payload:enrich:apply

# Verify: Qdrant payloads include summary + som_cluster + pagerank
```

### **After Phase 8B Complete**

```bash
# Phase 8C builds Neo4j topology
npm run atlas:phase102:step8c:neo4j:enrich:apply

# Verify: Neo4j relationships created, GDS algorithms run
```

### **Optional: Phase 8D (If Query Latency Still High)**

```bash
# Phase 8D adds session-scoped query cache
npm run atlas:phase102:step8d:query-result-cache:enable

# Verify: Repeated queries hit cache, new queries still traverse full path
```

---

## Verification Gates

### After Phase 8A

```bash
# Gate 1: Cluster count
redis-cli KEYS "centroid:som:*" | wc -l
# Expected: ~400 (one per SOM grid cell)

# Gate 2: Top-K packets exist
redis-cli GET "bitfrost:som:cluster_42:top-k" | jq '.[] | .packet_key' | head -3
# Expected: 3 packet keys

# Gate 3: Metadata is lean
redis-cli STRLEN "centroid:som:cluster_0"
# Expected: 200-500 bytes (metadata only)
```

### After Phase 8B

```bash
# Gate 1: Packet envelope count
redis-cli KEYS "bitfrost:packet:*" | wc -l
# Expected: ~40-50K

# Gate 2: Envelope structure
redis-cli GET "bitfrost:packet:ace:packet:auth:001" | jq 'keys'
# Expected: ["packet_key", "source_ref", "feature_id", "summary", "rrf_score", "som_cluster", "som_coords", "cached_at", "version"]

# Gate 3: Summary is populated
redis-cli GET "bitfrost:packet:ace:packet:auth:001" | jq '.summary | length'
# Expected: 100-700 (non-empty summary)

# Gate 4: Hit rate (sample)
redis-cli KEYS "bitfrost:packet:*" | wc -l
# Should be >40K (coverage)
```

---

## Performance Impact

### Before Phase 8 (Current State)

| Operation | Latency | Components |
|-----------|---------|------------|
| Query → Qdrant ANN | 5s | Embed (1s) + ANN search (1s) + Postgres join (3s) |
| Answer synthesis | 25s | Gemma4 generation |
| **Total** | **30s** | Cold path (no cache) |

### After Phase 8A Only (SOM Pre-Filter)

| Operation | Latency | Improvement |
|-----------|---------|------------|
| Query → nearest centroid | 10ms | 500× faster (Redis + small geometry) |
| Qdrant search in cluster | 2s | -50% (searching 400 candidates instead of 40K) |
| **Total** | **2s** | 15× faster (cold queries) |

### After Phase 8B (Packet Envelope Cache)

| Operation | Latency | Improvement |
|-----------|---------|------------|
| Repeat query | 5ms | 6,000× faster (Redis L1 hit) |
| New query → centroid cache | 10ms | 3,000× faster (L2 hit) |
| Cold query (miss both) | 2-5s | 10-15× faster (SOM pre-filter) |
| **Average** | **100-500ms** | 60-300× faster (mixed workload) |

---

## Current Status

### ✅ Ready

- Phase 8A script: `phase8a-som-centroid-cache.mjs` (corrected som_row/som_col names)
- Phase 8B script: `phase8b-bitfrost-packet-cache.mjs` (built, imports fixed)
- npm scripts: `atlas:phase102:step8a:*` and `atlas:phase102:step8b:*` added to package.json
- Verification commands documented above

### ⏳ Waiting

- Phase 6 (SOM) to populate `atlas_packets.som_cluster`, `som_row`, `som_col`
- Phase 7 (summaries) to populate `atlas_packets.summary` and write to Postgres
- Workers to run to completion **without restarts** (24-36 hour window)

### 🚫 Do NOT

- Restart Phase 7 workers while running (durable queue will replay messages)
- Modify Phase 7 scripts (pipeline is stable, metrics are correct)
- Cache vectors in Redis (defeats L1/L2 separation)
- Use turbo3/turbo4 KV quantization on 8GB GPU without testing first

---

## Phase 7 Freeze — Production Rules

**Phase 7 worker code is locked**. Only allow:
- ✅ Bug fixes (data corruption, crashes)
- ✅ Timeout adjustments (GPU stalls)
- ✅ Monitoring (new metrics, throughput calculation)
- ✅ Retry logic (transient failures)

**Do NOT add**:
- ❌ Feature work inside the worker
- ❌ Backend replacement (TensorRT-LLM, vLLM, PyTorch)
- ❌ Multiple workers (scaling belongs in Phase 8C+)

Everything else belongs in Phase 8+ (cache layers, enrichment, optimization).

---

## Immediate Action (Right Now)

**Start Phase 8A immediately while Phase 7 runs.** Phase 8A is read-safe (parallel execution):

```bash
# Terminal 1: Monitor Phase 7 (don't touch)
tail -f phase7-worker-1.log | grep -E "Batch|Written|Error"

# Terminal 2: Run Phase 8A cache warming (parallel, read-only)
npm run atlas:phase102:step8a:bitfrost-cache:warm:apply

# Terminal 3: Monitor throughput (new metric)
watch -n 30 'docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '\''5 minutes'\'') AS last_5m, \
   COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '\''1 hour'\'') AS last_hour \
   FROM codebase_chunk_index WHERE summary IS NOT NULL AND summary != '\''\'\''"'
```

---

## Execution Timeline

| Phase | Timing | Blocking? | Impact |
|-------|--------|-----------|--------|
| **7** | Running now | N/A | 40K+ summaries written nightly |
| **8A** | NOW (parallel) | No | L1/L2/L3 cache warm (100× speedup) |
| **8B** | After 7 done | No | Qdrant payloads + filters (10× speedup) |
| **8C** | After 8B done | No | Neo4j relationships + GDS (graph analytics) |
| **8D** | Optional | No | Session query cache (6,000× for repeats) |

**Phase 8 is entirely additive**: No changes to Phase 7, no disruption, no rollback risk.

---

## Files Reference

- `sveltekit-frontend/scripts/atlas/phase8a-som-centroid-cache.mjs` (200 lines, updated for L1/L2/L3)
- `sveltekit-frontend/scripts/atlas/phase8b-bitfrost-packet-cache.mjs` (260 lines, tested)
- `sveltekit-frontend/package.json` (npm scripts: `atlas:phase102:step8a:*` and `step8b:*`)
- `SESSION-102-PHASE-8AB-COMPLETE.md` (production evidence + refined strategy)
- This file: `sveltekit-frontend/docs/PHASE-8-ACCELERATION-ROADMAP.md`
