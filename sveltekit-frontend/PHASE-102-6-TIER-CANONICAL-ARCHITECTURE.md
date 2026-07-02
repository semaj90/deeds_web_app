# Phase 102: 6-Tier Canonical Packet Architecture

**Date**: July 2, 2026 | **Status**: ✅ ARCHITECTURE CLARIFIED

---

## 6-Tier Stack (Canonical Order)

```
Tier 1: POSTGRES 18
├─ packet_id, source_ref, title, summary
├─ content_embedding (384-dim pgvector)
├─ metadata JSONB
├─ edge arrays (calls, imports, defines)
└─ Canonical truth (async I/O for sequential scans, bitmap heap scans, VACUUM)

Tier 2: NEO4J GDS (CPU-Only Graph Algorithms)
├─ Packet nodes (from postgres identity)
├─ CONNECTS_TO / IMPORTS edges
├─ PageRank (CPU algorithm library)
├─ Louvain (community detection, CPU)
├─ HITS (authority/hub scores, CPU)
└─ Writes scores back to Postgres feature_statistics

Tier 3: QDRANT + CUVSM (Vector ANN)
├─ Packet embeddings (384-dim, pgvector mirror)
├─ Dense ANN search (canonical: Qdrant for simplicity)
├─ Payload filters (source_ref, metadata tags)
└─ Optional cuVS sidecar for GPU ANN (faster, not required)

Tier 4: CUDA SIDECAR (Optional GPU Accelerators)
├─ cuGraph PageRank (if Neo4j CPU is bottleneck)
├─ cuVS vector ANN (if Qdrant CPU is bottleneck)
├─ TensorRT model inference (synthesis speed)
├─ Node N-API CUDA bridge (local GPU work)
└─ HTTP endpoints for CPU orchestrator

Tier 5: COUCHDB (MapReduce Materialized Views Only)
├─ NO writes from synthesis or ranking
├─ View emissions: packet_id / source_ref / agent / function / title
├─ Merged packet API sync (read-only JSON export)
└─ Doc storage only if needed for audit/archive

Tier 6: SERVICE WORKER (Browser Cache, Read-Only)
├─ /api/packets/manifest (packet list, metadata)
├─ /api/search-intelligence/cards (search results)
├─ Cache hit/miss for UI latency optimization
└─ No backend writes from this tier
```

---

## Critical Boundaries

### Tier 1 (Postgres) → Tier 2 (Neo4j)
- **Input**: packet_id, source_ref, edges from code_features_edges
- **Output**: PageRank, HITS, Louvain scores written to feature_statistics
- **Neo4j Role**: CPU graph computation ONLY (not data storage, not cache)
- **Data Flow**: Neo4j reads Postgres, computes GDS algorithms, writes Postgres

### Tier 2 (Neo4j) → Tier 3 (Qdrant)
- **Input**: feature_statistics (PageRank, community)
- **Output**: Qdrant payloads enriched with community_id, pagerank, som_cluster
- **Qdrant Role**: Fast vector search with metadata filters
- **No Bidirectional**: Qdrant is mirror-only; writes come from Postgres

### Tier 1 (Postgres) → Tier 4 (CUDA Sidecar)
- **Optional**: GPU PageRank if CPU Neo4j is slow
- **Optional**: GPU ANN if Qdrant CPU is bottleneck
- **Boundary**: HTTP POST /gpu/pagerank, /gpu/ann, /gpu/rerank
- **Rule**: Sidecar reads from Postgres, writes back to Postgres (no Qdrant/Redis writes)

### Tier 1 (Postgres) → Tier 5 (CouchDB)
- **One-Way**: Postgres → CouchDB MapReduce (emit only)
- **No Writes Back**: CouchDB views are read-only in ranking
- **Use Case**: Unified packet manifest API for frontend
- **Sync**: Nightly batch or post-statistics computation

### Tier 1 (Postgres) → Tier 6 (Service Worker)
- **Read-Only**: Service Worker caches /api/packets/manifest
- **TTL**: 1 hour (packets don't change during session)
- **No Sync**: Worker gets stale data by design (acceptable tradeoff)

---

## Implementation Status

| Tier | Component | Status | Notes |
|------|-----------|--------|-------|
| 1 | Postgres 18 | ✅ UP | 58,304 packets, async I/O ready |
| 2 | Neo4j GDS | ✅ UP | CPU PageRank/HITS/Louvain available |
| 3 | Qdrant | ✅ UP | 40,572 points, 384-dim mirror |
| 4 | CUDA Sidecar | ⏳ Optional | cuVS, cuGraph available if needed |
| 5 | CouchDB | ⏳ Optional | MapReduce views only (no ranking path) |
| 6 | Service Worker | ✅ UP | Browser cache ready |

---

## Execution Plan (Phase 102 Steps)

### Step 1: Build Identity (Postgres Tier 1)
- Backfill code_features_edges (10K+ edges)
- Verify in Postgres code_features_edges table

### Step 2: Compute Statistics (Neo4j Tier 2)
- Run PageRank (CPU, ~1-2 min)
- Run HITS (CPU, ~30s)
- Run Louvain (CPU, ~30s)
- Write all scores to Postgres feature_statistics

### Step 3: Enrich Qdrant (Tier 3)
- Sync feature_statistics to Qdrant payloads
- Add community_id, pagerank, som_cluster tags
- Qdrant now searchable with metadata filters

### Step 4: Validate RRF Ranking (Tiers 1-3)
- Query: Go Retrieval orchestrator
- Blend: 0.25·semantic + 0.20·summary + 0.20·lexical + 0.15·noun + 0.12·pagerank + 0.08·topology
- Verify latency <2s (CPU-only, no CUDA overhead)

### Step 5: Generate Explanations (Tier 1 → Synthesis)
- Gemma4 (:8090) reads top-K candidates from Postgres
- Generate 2-3 sentence summaries
- Store in feature_summaries (explanation only, not ranking)

### Step 6: Optional GPU Acceleration (Tier 4)
- If Step 4 latency >2s: Deploy cuVS sidecar
- If Neo4j PageRank >1min: Deploy cuGraph sidecar
- Rerun Steps 2-4 with GPU enabled

### Step 7: MapReduce Sync (Tier 5, if needed)
- Emit packet_id / source_ref / function / title to CouchDB
- Use for /api/packets/manifest unified export

### Step 8: Browser Cache Warmup (Tier 6)
- Service Worker caches /api/search-intelligence/cards
- Caches /api/packets/manifest (read-only)
- TTL: 1 hour per session

---

## Hard Rules (Immutable)

1. **Tier 1 is Truth**: All writes go to Postgres first
2. **Tier 2 is Compute-Only**: Neo4j reads Postgres, writes Postgres (no other writes)
3. **Tier 3 is Mirror**: Qdrant mirrors Postgres, never writes back
4. **Tier 4 is Optional**: GPU sidecar is performance optimization, not required
5. **Tier 5 is Audit-Only**: CouchDB is MapReduce view sink, not ranking path
6. **Tier 6 is Cache**: Service Worker is client-side optimization, can be offline

---

## Postgres 18 Async I/O Optimization

Enable async I/O for Tier 1 performance:

```sql
-- Verify async I/O settings
SHOW effective_io_concurrency;  -- Should be > 0
SHOW io_combine_limit;           -- Should be > 0 for bitmap heap scans

-- Set for 8GB VRAM + SSD:
ALTER SYSTEM SET effective_io_concurrency = 4;
ALTER SYSTEM SET io_combine_limit = 262144;  -- 256KB

-- Apply
SELECT pg_reload_conf();
```

---

## Next: Execute Phase 102 Steps 1-8

Prerequisites:
- ✅ Postgres 18 UP
- ✅ Neo4j GDS UP
- ✅ Qdrant UP
- ✅ llama-server :8090 UP (synthesis)
- ✅ Valkey :6379 UP (cache)

Ready to begin Step 1: `npm run atlas:code-features:edges:backfill --dry-run`
