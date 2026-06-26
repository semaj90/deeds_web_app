# P4 Gap Analysis: Summary Indexing → SOM → AE → 4D Topology

**Status**: Verification in Progress (Session 81 Continuation)  
**Date**: June 26, 2026  
**Scope**: Summary/title indexing prerequisites → clustering → AE training → topology cells

---

## Executive Summary

**The dependency chain is:**

```
Packets (3,251)
  ↓
Summary/Title Indexing (BLOCKING → SOM training)
  ↓
SOM Training (272 clusters, 20×20 grid)
  ↓
Autoencoder (AE) Training (768→64 latent)
  ↓
4D Topology Cells (SOM grid + latent coordinates)
  ↓
Go-Retrieval Multi-Hop Traversals (dense + sparse search)
  ↓
Agentic KAG/DAG (domain ontology, Redis centroids, Bitfrost cache)
```

**Current State:**
- ✅ Packets: 3,251 with 100% sourceRef coverage
- ✅ SOM Training: Scripts exist (`atlas:som:train`, `atlas:som:train:apply`)
- ✅ SOM Clustering: 272 clusters, 20×20 grid (DONE)
- ⏳ **Summary Indexing: Partial** (title/summary fields exist but not indexed for retrieval)
- ⏳ **AE Training: Infrastructure exists** (no active training)
- ⏳ **4D Topology Cells: Wired** (SOM coords + latent space ready)
- ⏳ **Go-Retrieval: Multi-hop stalled** (missing traversal routes)

---

## Gap 1: Summary/Title Indexing (CRITICAL BLOCKER)

### Current State

**Tables with summary fields:**
```sql
-- atlas_packets.summary (NULL for ~15% of packets)
-- codebase_chunks.summary (NULL for ~40% of chunks)
-- cluster_summaries.summary (FILLED via Phase 3 — batch-summarize-clusters.mjs)
-- atlas_summary_layers (stubs only, no content)
```

**Missing indexing routes:**
```bash
# Tried in Phase 3:
✅ npm run atlas:summaries:clusters:apply          # Clusters only (Phase 3)
✅ npm run atlas:cache:warm:centroids:apply        # Cache only

# Still missing:
❌ npm run atlas:summaries:packets:apply           # Packets (individual chunks)
❌ npm run atlas:summaries:titles:extract          # Title extraction
❌ npm run atlas:summaries:index:elasticsearch     # Full-text index
❌ npm run atlas:summaries:verify:coverage         # Coverage audit
```

### What We Need

**1. Packet-level summaries** (not just clusters)

```bash
# Script: scripts/atlas/batch-summarize-packets.mjs
# Input: atlas_packets where summary IS NULL
# Process: Gemma4 one-liner per packet
# Output: atomized summaries + BM25 index

npm run atlas:summaries:packets:dry      # Preview: 500 packets
npm run atlas:summaries:packets:apply    # Production: all missing

# Time estimate: 10-15 min for 500 packets @ 2s/packet
```

**2. Title extraction** (separate from summary)

```bash
# Script: scripts/atlas/extract-packet-titles.mjs
# Uses: function_symbol + file_path + first 50 chars of content
# Output: atlas_packets.title field
# Purpose: Quick reference + display in KAG results

npm run atlas:titles:extract:dry
npm run atlas:titles:extract:apply

# Time estimate: <5 min (no LLM, pure regex/extraction)
```

**3. Full-text index** (BM25 via pg_trgm)

```bash
# Schema addition: CREATE INDEX idx_packet_summary_trgm ON atlas_packets USING GIN (summary gin_trgm_ops)
# Enables: Sparse search lane ("find foo" → exact keyword match)

npm run atlas:search:index:bm25:create
npm run atlas:search:index:bm25:rebuild

# Time estimate: <10 min for 50K rows
```

### Blocker Explanation

**Why summaries block SOM training:**

SOM clusters are formed by **packet semantics** (what they do), not just by directory/file layout. Without summaries indexed:

1. **SOM can't learn semantic centroids** — clusters are geometry-only (coord-based), not semantically meaningful
2. **KAG traversals fail** — "find code similar to X" queries have no semantic target
3. **AE latent space is junk** — 768→64 compression squashes noise, not signal

**Current workaround:** SOM uses embedding vectors directly, bypasses summary. **Fine for topology, not fine for retrieval.**

---

## Gap 2: AE Training Pipeline

### Current State

**Infrastructure exists:**
```bash
✅ scripts/atlas/train-autoencoder.mjs (exists, may need review)
✅ src/lib/server/gpu/topology-projection.ts (autoencoderEncode2Layer exists)
✅ Redis cache: gpu:autoencoder:centroids_64 (populated, 272 clusters)
✅ Phase 3 warmer: warm-centroid-cache.mjs (wired)
```

**Missing:**
```bash
❌ Scheduled AE retraining (one-time or cron?)
❌ Quality validation (latent space purity check)
❌ Fallback handling (if AE unavailable, use raw 768-d)
```

### What We Need

**1. AE training validation** (dry-run first)

```bash
npm run atlas:ae:train:dry              # Preview: 100 packets
npm run atlas:ae:train:apply            # Production: all 3,251 packets

# Outputs:
# - autoencoder_weights.pt (saved to disk or S3)
# - gpu:autoencoder:centroids_64 (populated in Redis)
# - atlas_ae_training_log (Postgres audit trail)
```

**2. Quality gate** (entropy + reconstruction loss)

```bash
npm run atlas:ae:validate:dry
npm run atlas:ae:validate:apply

# Checks:
# - Latent space dimensionality (should be 64, not degenerate)
# - Reconstruction loss (<0.1 for good compression)
# - Centroid variance (should cluster, not scatter)
# - Hit rate via cached centroids (>80% for Qdrant ANN pre-filter)
```

**3. Fallback chain**

```typescript
// If AE unavailable (e.g., weights not loaded), use raw 768-d
if (!autoencoderWeights) {
  return useRaw768DimensionalSimilarity();  // Slower but correct
}
```

---

## Gap 3: 4D Topology Cells (SOM + Latent)

### Current State

**Coordinates exist:**
```sql
-- atlas_packets.som_row, som_col (grid position, 0-19 each)
-- atlas_packets.latent_vector (64-dim, from AE, may be NULL)
```

**Wired routes:**
```bash
✅ /api/topology/som-grid            # Render 20×20 grid
✅ /api/topology/search-near         # Find packets near (row, col)
✅ /api/graph/som-topology           # Neo4j edges (SIMILAR_TOPOLOGY)
```

**Missing traversal:**
```bash
❌ Multi-hop neighborhood expansion  # Start at (r, c) → expand K hops
❌ Cross-domain traversal            # Jump SOM grid to related domains
❌ 4D query (som coords + latent)   # Find semantically similar in same SOM cell
```

### What We Need

**1. Neighborhood traversal** (K-hop SOM grid)

```bash
npm run atlas:topology:neighbors:dry      # Show K-hop from cell (10, 10)
npm run atlas:topology:neighbors:apply    # Populate edges in Neo4j

# Time estimate: 5 min for all 400 cells (20×20)
```

**2. Cross-domain bridge** (inter-cluster edges)

```bash
npm run atlas:topology:bridges:dry
npm run atlas:topology:bridges:apply

# Connects: SOM cells that share domain/ontology tags
# Uses: Neo4j SHARES_DOMAIN relationship
```

**3. 4D query route** (SOM + latent combined)

```bash
# Route: POST /api/topology/query-4d
# Input: { query_embedding: [768], som_row: 10, som_col: 10, k_hops: 2 }
# Output: Packets in SOM neighborhood + latent similarity sorted
```

---

## Gap 4: Go-Retrieval Multi-Hop (Stalled)

### Current State

```bash
✅ Port 50053: Go retrieval service (started)
✅ gRPC contract: RetrievalService.proto
❌ Multi-hop routes: MISSING (0 implementation)
❌ Sparse/dense blend: MISSING (only dense available)
```

### What We Need

**1. Multi-hop graph traversal** (Go sidecar)

```go
// Pseudo-code: rpc MultiHopTraversal
// Input: start_packet_id, k_hops, filter_ontology
// Output: []reachable_packets, []paths
// Uses: Neo4j SIMILAR_TOPOLOGY / SHARES_DOMAIN / IMPORTS edges
```

**2. Sparse search lane** (BM25 + TurboVec)

```bash
# Wired in Phase 3 search-router.ts:
# - Dense: Qdrant ANN (768-d)
# - Sparse: BM25 (keyword exact match)
# - Rerank: TurboVec GPU (50× speedup)
```

---

## Dependency Order for P4 Completion

### **Critical Path (blocking everything)**

1. **Summary indexing** ← Do this FIRST
   ```bash
   npm run atlas:summaries:packets:apply        # 10-15 min
   npm run atlas:titles:extract:apply           # <5 min
   npm run atlas:search:index:bm25:create       # <10 min
   ```

2. **AE training** ← Depends on summaries
   ```bash
   npm run atlas:ae:train:apply                 # 20-30 min (all packets)
   npm run atlas:ae:validate:apply              # <5 min
   ```

3. **4D topology cells** ← Depends on AE
   ```bash
   npm run atlas:topology:neighbors:apply       # 5 min
   npm run atlas:topology:bridges:apply         # 5 min
   ```

4. **Go-retrieval multi-hop** ← Depends on topology
   ```bash
   # gRPC routes: implement + test
   ```

### **Parallel Track (independent)**

- Phase 3 (just completed): Cluster summaries, centroid cache, search router
- Worker lane recovery: TurboVec, Engram, LangExtract sidecars
- Archive decisions: sourceRef validation gates

---

## Verification Checklist

### **Before Starting P4**

- [ ] Phase 3 complete: `npm run atlas:smoke:semantic-loop` passes
- [ ] Cluster summaries indexed: `SELECT COUNT(summary) FROM cluster_summaries WHERE summary IS NOT NULL` → 272/272
- [ ] Redis cache warmed: `redis-cli KEYS "gpu:autoencoder:cluster:*:centroid" | wc -l` → 272
- [ ] Postgres ready: `SELECT COUNT(*) FROM atlas_packets WHERE summary IS NOT NULL` → baseline

### **Summary Indexing (P4.1)**

- [ ] Packet summaries: `SELECT COUNT(summary) FROM atlas_packets WHERE summary IS NOT NULL` → 3,251/3,251 (target)
- [ ] Titles extracted: `SELECT COUNT(title) FROM atlas_packets WHERE title IS NOT NULL` → 3,251/3,251 (target)
- [ ] BM25 index ready: `\d atlas_packets` → shows `idx_packet_summary_trgm` GIN index
- [ ] Full-text queries work: `SELECT * FROM atlas_packets WHERE similarity(summary, 'auth') > 0.25 LIMIT 1` → fast (<10ms)

### **AE Training (P4.2)**

- [ ] Weights loaded: `SELECT COUNT(*) FROM atlas_ae_training_log WHERE status = 'success'` → ≥1
- [ ] Centroids in Redis: `redis-cli HGET gpu:autoencoder:centroids_64 centroids` → non-NULL
- [ ] Latent space quality: Reconstruction loss < 0.1 (logged in audit trail)
- [ ] Centroid cache hits: `npm run atlas:search:router:validate` → shows cache hit rate >80%

### **4D Topology (P4.3)**

- [ ] SOM neighborhoods wired: `MATCH ()-[r:SIMILAR_TOPOLOGY]->() RETURN COUNT(r)` → ~12,000+ edges
- [ ] Cross-domain bridges: `MATCH ()-[r:SHARES_DOMAIN]->() RETURN COUNT(r)` → ~5,000+ edges
- [ ] 4D query route available: `curl POST /api/topology/query-4d` → HTTP 200

### **Go-Retrieval (P4.4)**

- [ ] Multi-hop service running: `grpcurl list localhost:50053` → lists services
- [ ] Sparse search available: `/api/search/bm25?q=auth&k=10` → top-10 keyword results
- [ ] Dense + sparse blend: `/api/search/hybrid?q=...&mode=multi-lane` → merged results

---

## Quick Summary by Phase

| Phase | Component | Status | Time | Next Action |
|-------|-----------|--------|------|-------------|
| **P4.1** | Summary Indexing | ⏳ Gap | 30 min | Create packet summarizer + title extractor + BM25 index |
| **P4.2** | AE Training | ⏳ Gap | 30 min | Validate AE weights, train centroids, gate on quality |
| **P4.3** | 4D Topology | ⏳ Gap | 15 min | Wire SOM neighborhoods + cross-domain bridges |
| **P4.4** | Go-Retrieval | ⏳ Stalled | 20 min | Implement multi-hop traversal + sparse search blend |
| **Parallel** | Worker Lanes | ⏳ Recovery | 10 min | Verify TurboVec/Engram/LangExtract sidecars online |

**Total P4 Critical Path:** ~1.5 hours (if summary scripts already exist, else ~2-3 hours)

---

## Key Commands (Ready to Wire)

```bash
# Phase 3 (just completed)
npm run atlas:summaries:clusters:apply
npm run atlas:cache:warm:centroids:apply
npm run atlas:search:router:validate

# Phase 4 (entry points — scripts may not exist yet)
npm run atlas:summaries:packets:apply           # ⏳ Need to create
npm run atlas:titles:extract:apply              # ⏳ Need to create
npm run atlas:search:index:bm25:create          # ⏳ Need to create
npm run atlas:ae:train:apply                    # ✅ May exist
npm run atlas:ae:validate:apply                 # ⏳ Need to create
npm run atlas:topology:neighbors:apply          # ⏳ Need to create
npm run atlas:topology:bridges:apply            # ⏳ Need to create
```

---

## Recommendation

**Start with Gap 1 (Summary Indexing)** — it's the critical blocker.

1. Check if `scripts/atlas/batch-summarize-packets.mjs` exists (packet-level, not cluster-level)
2. If not, create it (similar to Phase 3 batch-summarize-clusters.mjs)
3. Wire title extraction + BM25 index
4. Once summaries are indexed, proceed with AE training → topology cells → multi-hop

**Estimated total time for P4:** 2-3 hours if summary scripts need creation, 1.5 hours if they exist.
