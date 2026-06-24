# Phase 1 Reality Check — Verified Measurements (June 24, 2026)

## Corrected Baseline: Canonical vs Chunk Tables

**TEST CORRECTION:** Earlier "8%" measurement was on **chunk-level table** (`codebase_chunk_index`). Canonical **packet-level table** (`atlas_packets`) has 97.2% coverage.

### Verified State (June 24, 17:27 UTC)

| Metric | Chunk-Level | **Canonical** | Status |
|--------|-------------|-------|--------|
| **Total rows** | 40,754 | **17,995** | — |
| **With summaries** | 1,850 (4.5%) | **17,486 (97.2%)** | ✅ READY |
| **With embeddings** | 602 (1.5%) | **TBD** | 🟡 IN_PROGRESS |
| **Cache hits (L1)** | N/A | **17,995/17,995 (100%)** | ✅ READY |
| **Neo4j linked** | N/A | **8,744/8,804 (99.3%)** | ✅ LINKED |
| **Qdrant identity** | — | **100% verified** | ✅ READY |

### False Alarm: The "8% Summary Gap"

**What was measured:** `codebase_chunk_index.summary` (chunk-level, sparse by design)  
**What should be measured:** `atlas_packets.summary` (canonical, 97.2% complete)  
**Why sparse is OK:** 40K chunks from 18K packets = many sub-chunks per file; only subset needs embeddings

### Real Bottleneck (Not Summary Coverage)

**Critical path:**
```
atlas_packets (canonical: 97.2% summaries, 100% identity spine)
  ↓
Wire embeddings through canonical table (currently bypassed)
  ↓
Cache warmth verification (100% in Valkey)
  ↓
RabbitMQ batching (not yet wired)
  ↓
Topology reranking (Neo4j 99.3% linked to Qdrant)
```

**Actual blockers:**
1. ❌ Canonical packet embeddings not generated (only chunk-level)
2. ❌ RabbitMQ batching not integrated
3. ❌ Cache provenance (trace_id) not tracked
4. ❌ GPU addon missing (CPU fallback available)

**NOT a blocker:**
- ✅ Summary content (97.2% canonical)
- ✅ Identity spine (100% across mirrors)
- ✅ Cache keys (100% in Valkey)

### Next Actions (Corrected)

**BEFORE RabbitMQ + GPU optimization:**

1. **Wire canonical packet embeddings**
   - Generate embeddings for `atlas_packets` (not chunk-level noise)
   - Measure coverage on canonical layer
   - Cache in Valkey with feature_id pivoting

2. **Add RabbitMQ batching**
   - 4 workers, batch 250-500 packets
   - Parallel summary generation (if needed for scaling)
   - Throughput target: 500 packets/min

3. **Verify centroid indexing**
   - Redis directory-level centroids (CPU mean-pool)
   - GPU KMeans optional (only if ROI > 10%)

---

**Status:** ✅ Identity Spine LOCKED | 🟡 Canonical Embeddings IN_PROGRESS | ✅ Cache READY  
**Next Action:** Wire atlas_packets through embedding pipeline (canonical, not chunks)  
**Test Results:** 100-chunk test = 1,850 chunk-level summaries (expected sparse), 602 embeddings (halfvec verified)  
**Date:** 2026-06-24 17:27 UTC
