# Phase 8 Execution Plan — BitFrost Cache Warming + Feature Materialization

**Status**: Ready (pending Phase 3 completion: 5,000 summaries)  
**Date**: 2026-07-04  
**ETA**: 2-3 hours (all 7 steps)

---

## Quick Summary

Phase 8 transforms 5,000 summarized packets into a production-ready retrieval cache:

1. **Summary ranking** — Score summaries by quality/length
2. **Envelope building** — Enrich summaries with identity chain
3. **Lexical materialization** — Create queryable index
4. **LangExtract output** — Extract entities from summaries
5. **BitFrost warming** — Cache top 5K in Redis (L1/L2)
6. **K-Means clustering** — 15 clusters for topology
7. **SOM topology** — 20×20 grid for 4D ordering

---

## Step 1: Summary Ranking (5-10 min)

**Goal**: Score 5K summaries for cache fitness  
**Input**: `atlas_summary_layers` (5K new rows from Phase 3)  
**Output**: Rankings persisted to `atlas_summary_layers.quality_score`

```bash
npm run atlas:phase8:step1:rank:dry
npm run atlas:phase8:step1:rank:apply
```

**Metrics**:
- Length (100+ chars = high fitness)
- Coherence (no LLM artifacts, <3 sentences = good)
- Diversity (avoid dupes by content_hash)

---

## Step 2: Envelope Building (10-15 min)

**Goal**: Build feature envelopes for each summary  
**Input**: Ranked summaries + `atlas_packets` identity  
**Output**: `atlas_summary_layers.metadata` enriched with envelope JSONB

```bash
npm run atlas:phase8:step2:envelope:dry
npm run atlas:phase8:step2:envelope:apply
```

**Envelope shape**:
```json
{
  "packet_id": "packet:abc123",
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  "summary": "...",
  "embedding_dim": 384,
  "quality_score": 0.87,
  "domain_class": "server",
  "topology_label": "lib/server"
}
```

---

## Step 3: Lexical Materialization (5 min)

**Goal**: Index summaries for BM25 / full-text search  
**Input**: 5K summaries  
**Output**: Postgres `tsvector` column populated for FTS

```bash
npm run atlas:phase8:step3:fts:dry
npm run atlas:phase8:step3:fts:apply
```

---

## Step 4: LangExtract Entity Extraction (15-20 min)

**Goal**: Extract entities from summaries for KAG (legal citations, persons, orgs)  
**Input**: 5K summaries  
**Output**: `atlas_summary_entities` table

```bash
npm run atlas:phase8:step4:langextract:dry
npm run atlas:phase8:step4:langextract:apply
```

**Entity types**: citation, statute, case_name, monetary, date, person, organization

---

## Step 5: BitFrost Cache Warming (30-45 min)

**Goal**: Warm Redis L1 (exact) + L2 (semantic similarity) with 5K packets  
**Input**: 5K envelopes + embeddings  
**Output**: Redis keys: `bifrost:packet:{key}`, `bifrost:feature:{id}:packets`, `bifrost:som:{cluster}:packets`

```bash
npm run atlas:phase8:step5:bitfrost:warm:dry
npm run atlas:phase8:step5:bitfrost:warm:apply
```

**Cache contract**:
- **L1 exact**: `bifrost:packet:{packet_key}` → full envelope (5 min TTL)
- **L2 semantic**: `bifrost:feature:{feature_id}:packets` → top-5 by cosine similarity (1 hour TTL)
- **L3 SOM**: `bifrost:som:{cluster}:packets` → cluster members (24h TTL)

**Expected speedup**:
- L1 hit: 5ms vs 500ms (100× speedup)
- L2 hit: 2-5s vs 25s (5-12× speedup)

---

## Step 6: K-Means Clustering (10-15 min)

**Goal**: Cluster 5K embeddings into 15 groups for topology  
**Input**: 5K embeddings (384-dim)  
**Output**: `atlas_packets.kmeans_cluster` + centroids

```bash
npm run atlas:phase8:step6:kmeans:dry
npm run atlas:phase8:step6:kmeans:apply
```

**Algorithm**: CPU-based k-means via worker pool (compute-worker.mjs)  
**Metrics**: Silhouette score, inertia, topographic error

---

## Step 7: SOM Topology (20-30 min)

**Goal**: Map 5K packets to 20×20 SOM grid for 4D manifold ordering  
**Input**: 5K embeddings + K-Means clusters  
**Output**: `atlas_packets.som_x`, `atlas_packets.som_y`, `atlas_packets.som_cluster`

```bash
npm run atlas:phase8:step7:som:dry
npm run atlas:phase8:step7:som:apply
```

**SOM benefits**:
- Preserve semantic proximity in 2D grid
- Enable grid-based retrieval ("neighbors of X")
- Foundation for ACE Stage A0 cache (4D manifold ordering)

---

## Execution Order

**Sequential** (must run in order, each step depends on prior):

```
Step 1 (5 min)
  ↓
Step 2 (10 min)
  ↓
Step 3 (5 min)
  ↓
Step 4 (15 min, parallel with 5)
Step 5 (30 min, can start when 2 finishes)
  ↓
Step 6 (10 min, parallel with 7)
Step 7 (20 min, can start when 6 finishes)
  ↓
Verification (5 min)
```

**Total**: ~2.5-3 hours (with parallelization)

---

## Verification Gates (Post-Execution)

```bash
# 1. Summary coverage
npm run atlas:audit:summaries

# 2. Cache warmth
npm run atlas:audit:bitfrost:warmth

# 3. Cluster quality
npm run atlas:audit:kmeans:quality

# 4. SOM topology
npm run atlas:audit:som:topology

# 5. End-to-end retrieval
npm run atlas:phase8:test:retrieval
```

---

## Rollback Strategy

If any step fails:

```bash
# Restore to Phase 3 state (keep 5K summaries)
npm run atlas:phase8:rollback:step:{N}

# Or full rollback
npm run atlas:phase8:rollback:all
```

---

## Expected Outcomes

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Summarized packets | 347 (0.6%) | 5,347 (9.2%) | **15× growth** |
| BitFrost keys | 155K | 175K+ | Cache warming |
| Avg retrieval latency | 500ms | 5-20ms (cache hit) | **25-100× speedup** |
| Topology clusters | 0 | 15 K-means + 1 SOM | Foundation for ACE |

---

## Next After Phase 8

- **Phase 9**: ACE packet assembly (deterministic shapes for Stage A0)
- **Phase 10**: Re-run on full 58K dataset (repeat Steps 1-7)
- **Phase 11**: GPU acceleration (TurboVec prefilter, graph reranking)

---

## Reference Scripts

| Step | Script | Dry-run | Apply |
|------|--------|---------|-------|
| 1 | `atlas:phase8:step1:rank` | `:dry` | `:apply` |
| 2 | `atlas:phase8:step2:envelope` | `:dry` | `:apply` |
| 3 | `atlas:phase8:step3:fts` | `:dry` | `:apply` |
| 4 | `atlas:phase8:step4:langextract` | `:dry` | `:apply` |
| 5 | `atlas:phase8:step5:bitfrost:warm` | `:dry` | `:apply` |
| 6 | `atlas:phase8:step6:kmeans` | `:dry` | `:apply` |
| 7 | `atlas:phase8:step7:som` | `:dry` | `:apply` |
| All | `npm run atlas:phase8:full:dry` | (all 7) | N/A |
| All | `npm run atlas:phase8:full:apply` | N/A | (all 7) |
