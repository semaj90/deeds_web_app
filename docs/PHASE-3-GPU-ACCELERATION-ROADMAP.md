# Phase 3: GPU Acceleration & Topology Inference

**Status**: READY TO EXECUTE  
**Date**: 2026-07-19  
**Predecessor**: Phase 2 Embedding Truncation (✅ COMPLETE)  

---

## Executive Summary

Phase 3 adds GPU-accelerated vector operations to unlock large-scale retrieval. The canonical 384-dim embeddings from Phase 2 feed into GPU k-NN search via cuVS, DiskANN, or RAPIDS, enabling fast approximate nearest neighbor queries on 40K+ points with <10ms latency.

**Key Dependencies Met**:
- ✅ Dual-path embedding system (ONNX primary, Ollama fallback)
- ✅ Canonical 384-dim truncation (50% storage savings)
- ✅ Topology authority backfill (58,365 packets with community_confidence)
- ✅ Feature-set alignment (83/100 with embedding lane at 99.6%)
- ✅ Smoke test suite (5/5 gates passing)

---

## Phase 3 Execution Plan

### Stage 3A: GPU k-NN Search Infrastructure (2-3 days)

**Objective**: Add GPU-accelerated approximate nearest neighbor search for 384-dim vectors.

#### 3A.1 cuVS Integration (RAPIDS)

```bash
# Option 1: Python worker (RAPIDS + cuVS)
cd sveltekit-frontend
wsl -d Ubuntu -- /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python \
  scripts/atlas/gpu-knn-search.py \
  --query-dim 384 \
  --k 100 \
  --index-type ivfflat  # or cagra for better quality

# Option 2: Docker service (cuVS HTTP API, port 8791)
docker compose --profile gpu up -d gpu-knn-service
curl http://127.0.0.1:8791/health
```

**Implementation**:
- `scripts/atlas/gpu-knn-search.py` — Python cuVS wrapper (loads embeddings from Postgres, builds GPU index, serves k-NN queries)
- `src/lib/server/gpu/cuVS-client.ts` — TypeScript bridge (HTTP or gRPC to cuVS service)
- `src/routes/api/retrieval/gpu-knn/+server.ts` — SvelteKit endpoint (query → embed → GPU k-NN → rerank → response)

**Gate**: 40K embeddings indexed in <5 minutes, query latency <20ms for k=100

#### 3A.2 DiskANN (Optional, if cuVS insufficient)

DiskANN is a hybrid CPU/GPU index for vectors larger than GPU memory. Useful if 384-dim × 100K embeddings exceed VRAM.

```bash
# Build DiskANN index from Postgres
node scripts/atlas/build-diskann-index.mjs \
  --dimension 384 \
  --vector-file /tmp/embeddings.float32 \
  --index-path /data/diskann/index

# Query via HTTP service (port 8792)
curl -X POST http://127.0.0.1:8792/search \
  -d '{"query": [0.1, 0.2, ...], "k": 100}'
```

**Status**: Deferred if cuVS sufficient. Recommended if 100K+ embeddings needed.

### Stage 3B: Topology Propagation & Symbol Extraction (2-3 days)

**Objective**: Wire community_id and topology context through the packet identity chain.

#### 3B.1 Community_id Backfill

```bash
# Analyze coverage
npm run atlas:backfill:community-id:analyze

# Apply backfill (glyph_records ← packets ← codebase_files)
npm run atlas:backfill:community-id

# Verify coverage (target: >95%)
npm run atlas:backfill:community-id:verify
```

**Expected**: community_id populated for 95%+ of glyph_records.

**Fallback if <95%**: Directory-based clustering for unreachable nodes.

#### 3B.2 Symbol Extraction (ATLAS-3A)

```bash
# Create schema
psql $DATABASE_URL -f drizzle/manual/atlas-3a-symbol-map.sql

# Extract symbols from AST
npm run atlas:extract-symbols:dry
npm run atlas:extract-symbols

# Audit quality
npm run atlas:extract-symbols:audit
```

**Produces**: `atlas_symbol_map` table with 40K+ symbols, linked to packets and topology.

### Stage 3C: SOM & KMeans Topology (2-3 days)

**Objective**: Build 20×20 Self-Organizing Map and k-means clustering on 384-dim embeddings.

#### 3C.1 SOM 20×20 Training

```bash
# Train SOM on canonical 384-dim embeddings
wsl -d Ubuntu -- python3 scripts/atlas/train-som-topology.py \
  --dim 384 \
  --grid 20 20 \
  --epochs 50 \
  --learning-rate 0.1

# Assign packets to SOM grid cells
npm run atlas:som:assign-packets

# Verify coverage (target: 100%)
npm run atlas:som:audit
```

**Output**: `atlas_packets.som_cell_x`, `som_cell_y` populated; Qdrant payload includes `som_cluster`.

#### 3C.2 KMeans Clustering

```bash
# Train k-means on 384-dim embeddings (k=64, 128, or 256)
npm run atlas:kmeans:apply --k 128

# Write centroids to Postgres
npm run atlas:kmeans:centroids:write

# Mirror centroids to Redis
npm run atlas:kmeans:centroids:cache
```

**Output**: `atlas_packets.kmeans_cluster_id` populated; Redis `centroid:kmeans:*` keys for fast lookup.

### Stage 3D: Reranker Feature Preparation (1-2 days)

**Objective**: Prepare features for XGBoost/learned reranker.

#### 3D.1 Feature Engineering

```bash
# Extract reranker features from packets
npm run atlas:reranker:features:extract

# Validate feature schema
npm run atlas:reranker:features:audit

# Normalize features (0-1 range)
npm run atlas:reranker:features:normalize
```

**Features**: sem_similarity, ast_score, community_boost, pagerank_score, som_distance, lexical_idf.

#### 3D.2 Training Data Preparation

```bash
# Generate training pairs (positive + negative examples)
npm run atlas:reranker:training-data:generate --sample-size 5000

# Export to training format (CSV or LIBSVM)
npm run atlas:reranker:training-data:export
```

**Output**: 5K training examples with features + relevance labels (for future reranker training).

---

## Implementation Files & Checklist

### New Files to Create

- [ ] `scripts/atlas/gpu-knn-search.py` — cuVS wrapper (Python)
- [ ] `src/lib/server/gpu/cuVS-client.ts` — cuVS TypeScript bridge
- [ ] `src/routes/api/retrieval/gpu-knn/+server.ts` — GPU k-NN SvelteKit endpoint
- [ ] `scripts/atlas/train-som-topology.py` — SOM trainer (Python)
- [ ] `scripts/atlas/som-assign-packets.mjs` — SOM cell assignment
- [ ] `scripts/atlas/extract-reranker-features.mjs` — Feature engineering

### Existing Files to Modify

- [ ] `src/lib/server/retrieval/retrieve-candidates.ts` — Wire GPU k-NN as primary ANN path
- [ ] `src/lib/server/retrieval/unified-orchestrator.ts` — Update routing logic (CPU HNSW → GPU cuVS)
- [ ] `drizzle/manual/atlas-3a-symbol-map.sql` — Symbol extraction schema
- [ ] `docs/EMBEDDING-TRUNCATION-STRATEGY.md` — Update GPU bridge section (reference cuVS config)

### npm Scripts to Register

```json
{
  "atlas:gpu:knn:health": "curl http://127.0.0.1:8791/health | jq .",
  "atlas:som:train": "wsl -d Ubuntu -- python3 scripts/atlas/train-som-topology.py --dim 384 --grid 20 20",
  "atlas:som:assign": "node scripts/atlas/som-assign-packets.mjs --apply",
  "atlas:reranker:features:extract": "node scripts/atlas/extract-reranker-features.mjs --dry-run",
  "atlas:reranker:features:apply": "node scripts/atlas/extract-reranker-features.mjs --apply",
  "atlas:phase3:smoke": "node scripts/atlas/smoke-test-gpu-pipeline.mjs"
}
```

---

## Validation Gates

**Gate 1: GPU k-NN Search** (3A)
- [ ] 40K embeddings indexed in GPU VRAM
- [ ] Query latency <20ms for k=100
- [ ] Recall@10 > 95% vs HNSW baseline

**Gate 2: Community_id Propagation** (3B.1)
- [ ] Coverage >95% on `glyph_records.community_id`
- [ ] Qdrant payloads include `community_id`

**Gate 3: Symbol Extraction** (3B.2)
- [ ] 40K+ symbols extracted from AST
- [ ] Symbol_kind coverage (function, class, route, test, etc.)

**Gate 4: SOM Topology** (3C.1)
- [ ] 20×20 grid fully populated (400 cells)
- [ ] All 58,365 packets assigned to SOM cells
- [ ] Adjacency structure matches Euclidean grid

**Gate 5: KMeans Clustering** (3C.2)
- [ ] k=128 centroids computed and cached
- [ ] All packets assigned to clusters
- [ ] Cluster sizes within reasonable bounds (no singleton clusters)

**Gate 6: Reranker Features** (3D)
- [ ] 7+ features extracted for each packet
- [ ] Feature ranges validated (0-1 normalized)
- [ ] Training data exported (5K pairs)

---

## Performance Targets

| Component | Metric | Target |
|-----------|--------|--------|
| GPU k-NN indexing | Time to build | <5 minutes |
| GPU k-NN query (k=100) | Latency | <20ms |
| GPU k-NN query (k=10) | Latency | <5ms |
| GPU k-NN recall@10 | Quality | >95% vs HNSW |
| SOM training | Time | <30 minutes |
| SOM assignment | Time | <5 minutes |
| KMeans training | Time (k=128) | <15 minutes |
| Reranker feature extraction | Throughput | >10K packets/minute |

---

## Timeline Estimate

| Stage | Effort | Duration | Critical Path |
|-------|--------|----------|---|
| 3A: GPU k-NN | 2-3 days | Medium | ✅ On critical path |
| 3B: Topology Propagation | 2-3 days | Medium | ✅ Blocks 3C |
| 3C: SOM & KMeans | 2-3 days | Medium | ✅ Blocks reranker |
| 3D: Reranker Features | 1-2 days | Small | Parallel possible |
| **Total** | **7-11 days** | **1.5-2 weeks** | — |

---

## Rollback & Risk Mitigation

### Reversibility

All Phase 3 operations are **safe to roll back**:
- GPU indices are built from canonical Postgres vectors (immutable)
- Topology backfills add columns; can be NULLed
- Symbol extraction creates new table; can be dropped
- Reranker features are computed; can be deleted

### Risk Mitigation

1. **GPU Memory Pressure**: If cuVS OOMs, fall back to DiskANN (hybrid CPU/GPU)
2. **Community_id Coverage <95%**: Apply directory-based clustering fallback
3. **SOM Grid Divergence**: Use PCA-based fallback instead of neural SOM
4. **KMeans Instability**: Use multiple random seeds, select best inertia

---

## Success Criteria

Phase 3 is **COMPLETE** when:

- ✅ GPU k-NN search operational (query latency <20ms)
- ✅ Community_id propagated to >95% coverage
- ✅ Symbols extracted for all accessible code
- ✅ SOM 20×20 fully populated and validated
- ✅ KMeans clusters assigned for all packets
- ✅ Reranker features computed and normalized
- ✅ All 6 validation gates passing
- ✅ Smoke test suite (gpu-pipeline.mjs) returning 100% pass rate

---

## Deferred to Phase 4+

- [ ] **Matryoshka embedding training** (requires MRL loss function)
- [ ] **TensorRT inference optimization** (when model finalized)
- [ ] **RAPIDS cuML XGBoost training** (requires training data + labels)
- [ ] **QLoRA fine-tuning** (optional, depends on reranker quality)

---

## References

- [Phase 2: Embedding Truncation Strategy](./EMBEDDING-TRUNCATION-STRATEGY.md)
- [GPU Topology Acceleration Plan](../next_steps/active/GPU_TOPOLOGY_ACCELERATION_PLAN.md)
- [RAPIDS cuVS Documentation](https://docs.rapids.ai/api/cuml/stable/api.html#approximate-nearest-neighbors)
- [DiskANN GitHub](https://github.com/microsoft/DiskANN)
- [Self-Organizing Maps Primer](https://en.wikipedia.org/wiki/Self-organizing_map)
