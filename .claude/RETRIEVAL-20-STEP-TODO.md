# 20-Step Retrieval Pipeline — TODO Tracker

## Phase 0: Foundation (4h) — START HERE

### Step 1: Aggressive Bitfrost Redis Cache Config (30min)
- [ ] Review `packages/atlas-duckdb/src/redis-centroid-config.json`
- [ ] Add L1/L2/L3/L4 cache tiers
- [ ] Add aggressive prewarming config
- [ ] Create `src/lib/server/cache/redis-cache-aggressive.ts`

### Step 2: Freeze 5K Vector Snapshot (30min)
- [ ] Create `scripts/atlas/freeze-vector-snapshot-5k.mts`
- [ ] Filter to 5,000 × 384-dim vectors
- [ ] Export to Parquet

### Step 3: Define embeddinggemma-prefix384-v1 Contract (45min)
- [ ] Create `src/lib/server/embedding/embedding-contract.ts`
- [ ] Define model, dimension, normalization, pooling

### Step 4: Verify 384 Norms + Identity Parity (1h)
- [ ] Create `src/lib/server/embedding/embedding-validator.ts`
- [ ] Verify L2 norm = 1.0 ± 0.01 for all 5K vectors
- [ ] Create validation script

### Step 5: Create vector_index_registry (1.5h)
- [ ] Create SQL migration for vector_index_registry table
- [ ] Create Drizzle types + CRUD helpers
- [ ] Initialize 4 index entries (Qdrant, TurboVec, K-means, SOM)

---

## Phase 1: Index Construction (3h, parallel 6+7)

### Step 6: Build Qdrant HNSW Index (1.5h)
- [ ] Create `scripts/atlas/build-qdrant-384-hnsw.mts`
- [ ] Create collection, configure HNSW (m=16, ef_construct=200)
- [ ] Upsert 5K points with payload

### Step 7: Build TurboVec 4-bit Index (1.5h) PARALLEL
- [ ] Create `scripts/atlas/build-turbovec-384-4bit.mts`
- [ ] Quantize 384→4-bit, upload to TurboVec

### Step 8: Compare vs Brute-Force Reference (1h)
- [ ] Create `scripts/atlas/validate-index-quality.mts`
- [ ] Verify Spearman correlation ≥0.85 for both indices

---

## Phase 2: Clustering (2h)

### Step 9: K-means on 384 Vectors (45min)
- [ ] Create `scripts/atlas/train-kmeans-384.mts`
- [ ] Train K=32, store centroids to Redis

### Step 10: SOM 20×20 Assignment (45min)
- [ ] Create `scripts/atlas/train-som-384.mts`
- [ ] Train SOM, store BMU mapping to Redis

### Step 11: Store Cluster Run Manifests (45min)
- [ ] Create SQL migration for vector_cluster_manifest
- [ ] Create `scripts/atlas/persist-cluster-manifests.mts`

### Step 12: Redis Centroid/SOM Warming (30min)
- [ ] Create `scripts/atlas/prewarm-redis-centroids.mts`
- [ ] Preload 32 centroids + 400 SOM cells

---

## Phase 3: Retrieval Routing (2h)

### Step 13: Soft Routing Without Hard Filters (45min)
- [ ] Create `src/lib/server/retrieval/soft-routing-orchestrator.ts`
- [ ] Implement parallel lane execution (no WHERE clauses)

### Step 14: KAG/Graph Expansion (45min)
- [ ] Create `src/lib/server/retrieval/kag-expansion.ts`
- [ ] Expand top-20 with Neo4j neighbors

### Step 15: RRF + Reranker (1h)
- [ ] Enhance `src/lib/server/retrieval/cross-ranker.ts`
- [ ] Create `src/lib/server/gpu/gpu-reranker.ts`
- [ ] Implement RRF + GPU blend

---

## Phase 4: ACE Integration (3h)

### Step 16: ACE Context Packet Assembly (1h)
- [ ] Enhance `src/lib/server/ace/context-assembler.ts`
- [ ] Build ACEPacket, store + cache

### Step 17: Gemma4 Invocation (45min)
- [ ] Create `src/lib/server/ace/gemma4-invocation.ts`
- [ ] Call Gemma4, handle timeout

### Step 18: Runtime Artifact Leases (1h)
- [ ] Create `src/lib/server/ace/runtime-lease-manager.ts`
- [ ] Implement acquire/release/cleanup

---

## Validation Gates

- [ ] Gate 1: All vectors L2-normalized (Step 4)
- [ ] Gate 2: Qdrant Spearman ≥0.85 (Step 8)
- [ ] Gate 3: TurboVec Spearman ≥0.85 (Step 8)
- [ ] Gate 4: 32 K-means centroids in Redis (Step 12)
- [ ] Gate 5: 400 SOM grid entries in Redis (Step 12)
- [ ] Gate 6: 4 lanes return results (Step 13)
- [ ] Gate 7: Graph neighbors verified (Step 14)
- [ ] Gate 8: RRF + GPU blend correct (Step 15)
- [ ] Gate 9: ACEPacket + L1 cache (Step 16)
- [ ] Gate 10: Gemma4 response (Step 17)

---

## Timeline

- Phase 0: 4 hours
- Phase 1: 3 hours (1.5h parallel)
- Phase 2: 2 hours
- Phase 3: 2 hours
- Phase 4: 3 hours

**Total: 14 hours (12.5h with parallelization)**

Recommended pace: 4-6 hours/day → 2-3 days completion
