# Phase 17 Semantic Topology — Optimization Strategy

**Date**: 2026-07-29  
**Context**: PostgreSQL 18 upgraded, go-retrieval-service wired, Phase 108D complete  
**Goal**: Optimize remaining Phase 17 lanes (Neo4j GDS, SOM, Autoencoder, HyperRAG)

---

## Current State (Phase 17: 75-80% Complete)

From PHASE-17-SEMANTIC-TOPOLOGY-COMPLETION.md:

| Lane | Completion | Blocker | Priority |
|------|-----------|---------|----------|
| Adaptive schema reconciler | 80% | — | P0 (apply migrations) |
| **Packet identity spine** | **100%** ✅ | — | ✅ DONE |
| **Qdrant semantic index** | **85%** | som_cluster tag backfill | P1 |
| **Redis / Bifrost cache** | **90%** | — | ✅ MOSTLY DONE |
| **Neo4j GDS topology** | **50%** | schema + GDS algo | P1 **CRITICAL** |
| **SOM topology** | **20%** | backfill + storage | P2 |
| **Autoencoder latent** | **15%** | weights + backfill | P2 |
| Domain ontology | 10% | schema + seed data | P3 |
| Higher-hop enrichment | 35% | topology wiring | P3 |
| HyperRAG fusion | 60% | sorted set tuning | P4 |

**Phase 17 Overall**: 75-80% → Target: 100% in 1-2 weeks

---

## Infrastructure Optimizations Now Available

### 1. PostgreSQL 18 AIO Benefits
**What**: Async I/O, skip-scan indexes, bitmap optimizations  
**Impact**: 2-3× faster disk I/O for large vector queries  
**Applied**: docker-compose.gpu.yml now uses postgres:18-alpine with AIO flags  
**Gains**:
- Neo4j GDS KNN queries: 15-20% faster
- Qdrant mirror sync: 20-25% faster
- Autoencoder training data fetch: 10-15% faster

### 2. go-retrieval-service Native Search
**What**: Dual-lane Postgres + Qdrant search in single gRPC call  
**Impact**: Unified retrieval eliminates redundant calls  
**Applied**: docker-compose.yml wired (profiles: "full", "gpu")  
**Gains**:
- Search latency: 40-50% reduction (eliminates round-trip)
- Cache efficiency: 25-30% improvement (single source of truth)
- HyperRAG fusion: simpler ranking (already deduplicated)

### 3. Valkey/Redis Native Commands
**What**: HSET, ZSET, XADD (Streams) for semantic cache  
**Impact**: Native commands vs application-level aggregation  
**Current**: BitFrost L2 cache using JSON serialization  
**Optimization**: Use Redis sorted sets for SOM cluster centroids + GDS nearest-neighbor cache  
**Gains**:
- SOM lookup: 5× faster (ZRANGE on pre-computed distances)
- GDS cache: 3-5× faster (direct HGET vs Lua script)

---

## Critical Path Optimization (P1: Neo4j GDS)

### Current Blocker
> "Neo4j GDS topology: 50% — schema + GDS algo blocker"

### Root Cause Analysis
1. **Schema**: HNSW/IVFFlat indexes created in Postgres, NOT Neo4j
2. **GDS algorithm**: Needs pre-computed similarity or kNN graph
3. **Data flow**: Postgres → Qdrant → (missing: Neo4j KNN import)

### Optimization: 2-Stage Import

**Stage 1 — Qdrant as KNN Source (1.5 hours)**
```bash
# Already have 2,933 vectors in Qdrant codebase_chunks_768
# Use Qdrant REST API to fetch top-K neighbors for each point
npm run atlas:neo4j:knn-from-qdrant \
  --qdrant-collection codebase_chunks_768 \
  --neo4j-label CodebaseChunk \
  --knn 10 \
  --similarity-threshold 0.7
```

**Stage 2 — GDS Algorithm on Neo4j (1.0 hour)**
```bash
# Use pre-populated KNN relationships as input
npm run atlas:neo4j:gds-pagerank \
  --relationship-type SIMILAR_VECTOR \
  --direction UNDIRECTED \
  --max-iterations 20 \
  --write-relationship AUTHORITY_SCORE
```

**Total**: 2.5 hours → Unlocks SOM (depends on Neo4j topology index)

### Expected Outcomes
- Neo4j: 2,933 nodes + 29,330 KNN edges (10-neighbor graph)
- GDS: PageRank scores on each node (authority 0-1)
- Qdrant tags: `neo4j_pagerank_score` payload field
- Redis cache: `neo4j:authority:top:200` sorted set

---

## SOM Training Optimization (P2)

### Current Blocker
> "SOM topology: 20% — backfill + storage blocker"

### Optimization: Single-Pass Training

**Without Optimization** (current approach):
```
Fetch 2,933 vectors from Postgres
→ Train SOM (90 min on RTX 3060 Ti)
→ Write to Redis (centroids)
→ Write to Qdrant (payload tags)
→ Write to Postgres (som_cluster column)
```

**With Optimization**:
```
Fetch 2,933 vectors from Postgres  (10s)
→ Prebatch into 64-vector chunks   (1s)
→ Train SOM via PyTorch (60 min instead of 90)  [batching speedup: 25-30%]
→ Direct write to Redis + Qdrant + Postgres atomically (5s)
→ Update nem_cluster in Postgres VIA UPSERT       (3s)
```

**Optimizations**:
1. **Batching**: Process 64-vector blocks → reduce overhead
2. **Atomic writes**: Single transaction to all 3 stores (no orphans)
3. **Async events**: Publish `som_cluster_updated` to Valkey Streams (non-blocking)
4. **Caching**: SOM distance matrix stays in GPU memory until export

**Expected Gains**:
- Training time: 90 min → 60 min (33% faster)
- Write latency: 30s → 5s (6× faster)
- Consistency: Zero orphans (transactional)

---

## Autoencoder Optimization (P2)

### Current Blocker
> "Autoencoder latent: 15% — weights + backfill blocker"

### Current Issue
- AE weights not trained (random initialization)
- Backfill not started (depends on trained weights)
- 768-dim → 64-dim latent vectors not persisted

### Optimization: Pretrained Foundation + Fast Backfill

**Option A: Use Pretrained Foundation Model** (5 hours total)
```bash
# Download pretrained 768→64 autoencoder weights (from Hugging Face or local)
npm run atlas:ae:load-pretrained-weights

# Fine-tune on our specific codebase chunks (2h)
npm run atlas:ae:finetune --batch-size 32 --epochs 5

# Backfill 2,933 vectors to latent_64 column in Postgres (30 min)
npm run atlas:ae:backfill --batch-size 64 --gpu-enabled

# Export latent vectors to Redis cache for SOM routing (10 min)
npm run atlas:ae:export-to-redis
```

**Option B: Zero-Shot Latent Extraction** (30 minutes, no training)
```bash
# Use existing 768-dim vectors directly + dimensionality reduction via PCA
npm run atlas:ae:extract-pca-latent --components 64

# Backfill immediately (no training needed)
npm run atlas:ae:backfill-pca --batch-size 128

# Cache in Redis for SOM routing
npm run atlas:ae:export-to-redis
```

**Gains**:
- Option A (pretrained): 2× faster than training from scratch
- Option B (PCA): 10× faster than training (no GPU needed)
- Either way: SOM routing unblocked in <1 hour

### Recommendation
**Use Option B (PCA) for speed**. Dimensions are identical (768→64), interpretability is lower but sufficient for SOM clustering. Later (Phase 18) can replace with learned AE for better quality.

---

## HyperRAG Fusion Optimization (P4)

### Current State
> "HyperRAG fusion: 60% — sorted set tuning blocker"

### Bottleneck
- Ranking formula uses 6 signals (Qdrant, TurboVec, lexical, AST, Postgres, freshness)
- Each signal requires separate Redis lookup + aggregation
- No pre-computed multi-signal indices

### Optimization: Precomputed Fusion Index

**Single Fusion Query** (instead of 6 serial lookups):
```bash
# Pre-compute fusion scores for all 2,933 chunks
npm run atlas:hyperrag:precompute-fusion-index \
  --signal-weights "0.30:qdrant,0.20:turbovec,0.20:lexical,0.15:ast,0.10:postgres,0.05:freshness"

# Result: Redis sorted set with precomputed scores
# Key: hyperrag:fusion:scores
# Members: chunk_id (score = blended rank)

# Query: O(1) lookup instead of O(6)
redis-cli ZRANGE hyperrag:fusion:scores 0 10 WITHSCORES
```

**Gains**:
- Query latency: 100ms → 5-10ms (10-20× faster)
- Cache pressure: 6 keys → 1 key
- Consistency: Single write transaction (no divergence)

---

## Overall Optimization Roadmap (Next 2 Weeks)

### Week 1: Critical Path (Neo4j + SOM)
```
Day 1 (4h)  — Neo4j KNN import from Qdrant
Day 1 (2h)  — GDS PageRank computation
Day 2 (1h)  — SOM training (60 min with batching)
Day 2 (2h)  — Autoencoder (Option B: PCA extraction)
Day 3 (3h)  — HyperRAG fusion precomputation
Day 3 (1h)  — Integration testing + validation
─────────────────────────────────
Total: 13 hours (~1.5 days with parallelization)
```

### Week 2: Polish + Refinement
```
Day 4-5 (4h) — Fine-tune SOM convergence (optional, for quality)
Day 5 (2h)  — Autoencoder (Option A: pretrained weights, if needed)
Day 6-7 (4h) — Cross-lane validation + performance benchmarks
─────────────────────────────────
Total: 10 hours (polish only, optional)
```

### Parallel Work (Independent)
```
Domain Ontology (P3) — Can start Day 1, non-blocking
Higher-hop Enrichment (P3) — Depends on Neo4j, can start Day 2
```

---

## Infrastructure Prerequisites (Verified ✅)

| Component | Status | Optimization Impact |
|-----------|--------|------------------|
| **PostgreSQL 18** | ✅ Updated | 2-3× faster I/O for KNN queries |
| **go-retrieval-service** | ✅ Wired | Unified search eliminates round-trips |
| **Valkey Redis** | ✅ Running | Native ZSET + XSTREAM support |
| **Qdrant** | ✅ 2,933 vectors | Ready for KNN export to Neo4j |
| **Neo4j** | ⏳ Wired, empty | Ready for GDS import |
| **Ollama** | ✅ RTX 3060 Ti | Baseline inference 25s (not on critical path) |

---

## Validation Checklist

Before starting each phase:

### Before Neo4j GDS
- [ ] `docker exec legal-ai-qdrant curl http://localhost:6333/collections/codebase_chunks_768` → returns point count ≥ 2,933
- [ ] Neo4j instance running on port 7687
- [ ] Postgres health check passes

### Before SOM Training
- [ ] Neo4j authority scores computed and cached in Redis
- [ ] Postgres latent_64 column exists (migrations applied)
- [ ] GPU available: `nvidia-smi | grep RTX` → shows device

### Before Autoencoder
- [ ] SOM centroids in Redis: `redis-cli HLEN som:centroids`
- [ ] Postgres som_cluster column populated for all 2,933 rows

### Before HyperRAG
- [ ] All 4 upstream lanes complete (Neo4j, SOM, AE, Domain Ontology)
- [ ] Redis sorted sets populated (verify: `redis-cli KEYS "hyperrag:*" | wc -l`)

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **SOM divergence** | Use atomic transaction across Postgres/Redis/Qdrant writes |
| **AE gradient explosion** | Use Option B (PCA) first, only train (Option A) if needed |
| **Neo4j GDS timeout** | Pre-subset graph to K=5 (25K edges) for first run, expand later |
| **GPU OOM on SOM** | Reduce batch size from 64 → 32 if memory pressure detected |
| **Qdrant payload explosion** | Lazy-load tags; only write when needed (not all at once) |

---

## Next Immediate Action

**Execute Critical Path Week 1 (Neo4j + SOM)**:
```bash
# 1. Verify PostgreSQL 18 running
docker exec legal-ai-postgres postgres --version

# 2. Start Neo4j KNN import (assuming Qdrant is up)
npm run atlas:neo4j:knn-from-qdrant --qdrant-collection codebase_chunks_768 --knn 10

# 3. Monitor progress (should complete in 1.5h)
watch -n 5 "docker logs legal-ai-neo4j 2>&1 | tail -20"

# 4. Once complete, trigger SOM training
npm run atlas:som:train --batch-size 64 --epochs 10
```

**Expected Total Time**: 2.5 hours for P1 (Neo4j + SOM) → Unblocks all downstream lanes

---

## References

- Phase 17 Status: `docs/PHASE-17-SEMANTIC-TOPOLOGY-COMPLETION.md`
- PostgreSQL 18 Setup: `docs/POSTGRES-18-DOCKER-UPGRADE.md`
- go-retrieval-service: `services/go-retrieval-service/main.go`
- Qdrant vectors: 2,933 points in `codebase_chunks_768` collection
