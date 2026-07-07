# Phase 102 Function Lane Audit

**Date**: July 2, 2026 | **Status**: Ready for Batch Summaries Optimization

---

## Executive Summary

Phase 102 tensor/topology work is **80% complete** with 5 steps wired. Bottleneck: summaries taking >1 day (serial, Gemma4 single-threaded). Solution: Triton batch inference OR smaller models + NLP extraction + parallel RabbitMQ queue.

### Current Locked Contracts
- ✅ `packet_key + source_ref` = immutable identity
- ✅ `embedding_384` = dense retrieval truth (canonical)
- ✅ `som_cluster` = neighborhood pointer (topology routing only)
- ✅ `atlas_packets.metadata.rrf` = RRF score store
- ✅ Redis/Valkey = cache only
- ✅ Qdrant = vector mirror
- ✅ Neo4j = graph/topology mirror
- ✅ RabbitMQ = durable queue

### Completed Lanes
| Step | Task | Status | Files |
|------|------|--------|-------|
| 1 | Schema Verify | ✅ PASS | N/A |
| 2 | HashMap Build | ✅ PASS | `phase4-build-packet-hashmap.mjs` |
| 3 | Top-K Stability | ✅ PASS | `phase4-topk-stability.mjs` |
| 4 | RRF Scoring | ✅ PASS | `phase4-rrf-scorer.mjs`, `phase4-postgres-writer.mjs`, `phase4-redis-cache-writer.mjs` |
| 5 | Tensor Load | ✅ PASS | `phase5-tensor-loader.mjs` |
| 6 | SOM Clustering | ⏳ READY (CPU/LibTorch) | `phase6-som-clustering.mjs`, `phase6-som-clustering-libtorch.mjs` |

### Bottleneck: Summaries
- **Current**: Serial Gemma4 :8090, ~1 day for 40K+ chunks
- **Root cause**: Single LLM call per chunk, no batching
- **Options**:
  - Option A: Triton inference server (batch GPU inference) — 10–20× speedup, complex setup
  - Option B: Smaller models (distilbert, albert) + NLP extraction — fast but lower quality
  - Option C: RabbitMQ parallel queue with Gemma4 workers — moderate speedup, operator-controlled
  - Option D: Skip summaries for now, populate on-demand via Gemma4 cache

---

## Relevant Files by Lane

### 1. Packet Identity / Envelope (KEEP CANONICAL)

| File | Purpose | Status | Classification |
|------|---------|--------|-----------------|
| `scripts/atlas/phase4-build-packet-hashmap.mjs` | Load atlas_packets + code_features | ✅ COMPLETE | **keep_canonical** |
| `scripts/atlas/validate-packet-contract.mjs` | Verify packet_key/source_ref integrity | ✅ COMPLETE | **keep_canonical** |
| `scripts/atlas/audit-packet-contract-mirrors.mjs` | Audit Postgres/Qdrant/Redis alignment | ✅ COMPLETE | **keep_canonical** |
| `scripts/atlas/repair-packet-contract-mirrors.mjs` | Fix mirror divergence | ✅ COMPLETE | **keep_canonical** |
| `src/lib/server/db/schema-postgres.ts` | atlas_packets definition | ✅ LIVE | **keep_canonical** |
| `scripts/atlas/materialize-addressable-packets.mjs` | Addressable packet registry | ✅ LIVE | **keep_canonical** |

---

### 2. RRF / Ranking (COMPLETE)

| File | Purpose | Status | Classification |
|------|---------|--------|-----------------|
| `scripts/atlas/phase4-rrf-scorer.mjs` | Compute RRF blend (0.45·lex + 0.35·vec + 0.20·auth) | ✅ COMPLETE | **keep_canonical** |
| `scripts/atlas/phase4-postgres-writer.mjs` | Persist RRF to `atlas_packets.metadata.rrf` | ✅ COMPLETE | **keep_canonical** |
| `scripts/atlas/phase4-redis-cache-writer.mjs` | Cache top-10 to `bitfrost:rrf:global:top-10` | ✅ COMPLETE | **keep_canonical** |
| `scripts/atlas/phase4-topk-stability.mjs` | Validate fp32 determinism (≥80% threshold) | ✅ COMPLETE | **keep_canonical** |
| `scripts/atlas/phase4-stability-report.mjs` | Report RRF convergence metrics | ✅ COMPLETE | **keep_canonical** |

---

### 3. Tensor Loader / Embeddings (COMPLETE)

| File | Purpose | Status | Classification |
|------|---------|--------|-----------------|
| `scripts/atlas/phase5-tensor-loader.mjs` | Load 40,568 × 384 from codebase_chunk_index | ✅ COMPLETE | **keep_canonical** |
| `scripts/atlas/load-tensorrt-bridge.mjs` | ESM↔CommonJS bridge for native addon | ✅ CREATED | **optional_accelerator** |
| `src/lib/gpu/autoencoder-compression.ts` | AE 768→64 latent (deferred, topology bonus only) | ⏳ READY | **patch_for_phase6** |
| `src/lib/gpu/tensorrt-worker.js` | GPU batch distance computation | ✅ LIVE | **optional_accelerator** |

---

### 4. SOM / Topology (READY FOR STEP 6)

| File | Purpose | Status | Classification |
|------|---------|--------|-----------------|
| `scripts/atlas/phase6-som-clustering.mjs` | CPU k-means++ (canonical baseline) | ✅ CREATED | **keep_canonical** |
| `scripts/atlas/phase6-som-clustering-libtorch.mjs` | LibTorch GPU k-means (optional) | ✅ CREATED | **optional_accelerator** |
| `src/lib/gpu/som-clustering.ts` | SOM topology compute (TypeScript) | ✅ LIVE | **patch_for_phase6** |
| `src/lib/gpu/som-clustering-cuda.ts` | CUDA SOM variant | ✅ LIVE | **optional_accelerator** |
| `src/workers/kmeans-worker.js` | K-means in browser worker | ✅ LIVE | **ignore_for_this_lane** |
| `src/lib/gpu/som-webgpu-cache.ts` | WebGPU cache layer | ✅ LIVE | **optional_accelerator** |

---

### 5. Neo4j Graph Lanes (READY FOR STEP 7)

| File | Purpose | Status | Classification |
|------|---------|--------|-----------------|
| `scripts/graph/import-turbovec-edges.mjs` | Import TurboVec edges to Neo4j | ✅ LIVE | **keep_canonical** |
| `src/lib/gpu/webgpu-pagerank.ts` | PageRank compute (client-side) | ✅ LIVE | **ignore_for_this_lane** |
| `src/lib/webgpu/pagerank.wgsl` | PageRank shader | ✅ LIVE | **ignore_for_this_lane** |
| `scripts/graph/gds-orchestrator.mjs` | Neo4j GDS algorithms (Louvain, PageRank) | ⏳ PLANNED | **patch_for_phase6** |

---

### 6. Redis / BitFrost Cache (COMPLETE)

| File | Purpose | Status | Classification |
|------|---------|--------|-----------------|
| `scripts/atlas/phase4-redis-cache-writer.mjs` | Warm bitfrost:rrf:global:top-10 | ✅ COMPLETE | **keep_canonical** |
| `scripts/atlas/warm-bitfrost-semantic-cache.mjs` | Warm L2 semantic cache | ✅ LIVE | **keep_canonical** |
| `scripts/atlas/wire-redis-centroid-mirror.mjs` | Mirror SOM centroids to Redis | ⏳ READY | **patch_for_phase6** |
| `src/lib/server/cache/redis-exact-match.ts` | L1 exact-match cache | ✅ LIVE | **keep_canonical** |

---

### 7. RabbitMQ / Worker Queue (READY FOR SUMMARIES)

| File | Purpose | Status | Classification |
|------|---------|--------|-----------------|
| `src/lib/messaging/rabbitmq-xstate-integration.ts` | XState + RabbitMQ orchestration | ✅ LIVE | **keep_canonical** |
| `scripts/atlas/batch-summaries-wrapped.mjs` | Batch Gemma4 summaries (parallel) | ✅ CREATED | **patch_for_phase6** |
| `scripts/atlas/batch-summarize-chunks.mjs` | Serial Gemma4 (slow baseline) | ✅ LIVE | **stale_legacy** |
| `scripts/atlas/populate-feature-summaries.mjs` | Feature summaries (slow) | ✅ LIVE | **stale_legacy** |
| `../scripts/atlas/batch-summaries-test10.mjs` | Test 10 summaries | ✅ LIVE | **patch_for_phase6** |
| `../scripts/atlas/batch-summaries-apply.mjs` | Apply batch summaries (legacy) | ✅ LIVE | **stale_legacy** |

---

### 8. gRPC / RPC Packets (OPTIONAL)

| File | Purpose | Status | Classification |
|------|---------|--------|-----------------|
| `src/lib/server/grpc/embedding-client.ts` | gRPC embedding service | ✅ LIVE | **optional_accelerator** |
| `src/lib/client/hyperrag-client.ts` | HyperRAG packet RPC | ✅ LIVE | **optional_accelerator** |

---

### 9. LibTorch / CUDA / TensorRT Bridge (OPTIONAL ACCELERATORS)

| File | Purpose | Status | Classification |
|------|---------|--------|-----------------|
| `simd-bridge/cpp/binding.cc` | N-API tensorrt_bridge.node | ⏳ COMPILED | **optional_accelerator** |
| `scripts/atlas/load-tensorrt-bridge.mjs` | Load bridge in Phase 6 | ✅ CREATED | **optional_accelerator** |
| `src/lib/gpu/tensorrt-worker.js` | Invoke bridge from worker | ✅ LIVE | **optional_accelerator** |
| `src/lib/gpu/policy-reranker-bridge.ts` | Invoke bridge for reranking | ✅ LIVE | **optional_accelerator** |

---

### 10. Service Worker / SSE / Admin Progress (DO NOT USE FOR COMPUTE)

| File | Purpose | Status | Classification |
|------|---------|--------|-----------------|
| `src/service-worker.ts` | Browser cache + SW registration | ✅ LIVE | **ignore_for_this_lane** |
| `src/lib/stores/dashboard/SSEStatusStore.svelte.ts` | SSE progress tracking | ✅ LIVE | **ignore_for_this_lane** |
| `src/lib/client/workflow-event-stream.ts` | Client-side event streaming | ✅ LIVE | **ignore_for_this_lane** |

---

## Current npm Scripts

### Phase 102 Wired
```bash
# Step 1-3 (verified)
npm run atlas:phase102:step4:build                 # Load packets
npm run atlas:phase102:step4:score:dry             # RRF dry-run
npm run atlas:phase102:step4:stability             # Validate determinism
npm run atlas:phase102:step4:postgres              # Write RRF to Postgres
npm run atlas:phase102:step4:redis                 # Cache RRF in Redis
npm run atlas:phase102:step4:all                   # Run all steps 1-3

# Step 5 (tensor loader)
npm run atlas:phase102:step5:tensor-loader         # Load embeddings (40.5K)

# Step 6 (SOM clustering)
npm run atlas:phase102:step6:som-clustering        # CPU baseline OR LibTorch GPU
```

### Summaries (BOTTLENECK)
```bash
# Serial (slow, legacy)
npm run atlas:code-features:populate-summaries --dry-run
npm run atlas:code-features:populate-summaries:apply

# Batch (still slow without parallel queue)
npm run batch:summaries:wrapped:test10             # Test 10 items
npm run batch:summaries:wrapped:apply              # Apply batch

# Legacy (do not use)
npm run batch:summaries:test10
npm run batch:summaries:apply
```

### Cache / Mirror Lanes
```bash
npm run atlas:bitfrost-semantic-cache:warm        # Warm L2 cache
npm run atlas:bitfrost-semantic-cache:warm:apply
npm run atlas:redis-centroid:mirror:dry            # Mirror centroids to Redis
npm run atlas:redis-centroid:mirror:apply
```

---

## Missing Scripts (Need to Create for Phase 102 Completion)

### Critical
| Script | Purpose | Why Needed | Effort |
|--------|---------|-----------|--------|
| `atlas:phase102:step6:cpu` | CPU k-means (canonical) | Execute Step 6 with CPU baseline | Low |
| `atlas:phase102:step6:gpu` | GPU k-means (LibTorch optional) | Optional acceleration | Medium |
| `atlas:phase102:step6:validate` | Verify 40.5K rows assigned | Gate before Step 7 | Low |
| `atlas:phase102:step7:neo4j` | Create SIMILAR_TOPOLOGY edges | Neo4j enrichment | Medium |
| `atlas:phase102:step8:redis` | Warm Redis cluster keys | Cache layer | Low |
| `atlas:phase102:step9:gates` | Final validation (9 gates) | Ensure consistency | Low |

### Summary Optimization (Pick ONE)
| Script | Approach | Speedup | Complexity |
|--------|----------|---------|------------|
| `atlas:summaries:triton:batch` | Use Triton inference server | 10–20× | High (requires Triton setup) |
| `atlas:summaries:nlp:fast` | Smaller model + NLP extraction | 3–5× | Medium (distilbert + spacy) |
| `atlas:summaries:queue:parallel` | RabbitMQ parallel workers | 4–8× | Medium (queue + worker pool) |
| `atlas:summaries:skip` | Populate on-demand via cache | Infinite | Low (defer until needed) |

---

## Safest Next Patch

### Phase 6 Execution (Recommended Order)
```bash
# 1. Run CPU k-means baseline (canonical)
npm run atlas:phase102:step6:cpu

# 2. Verify 40.5K rows assigned
npm run atlas:phase102:step6:validate

# 3. (Optional) Run LibTorch GPU version and compare
npm run atlas:phase102:step6:gpu

# 4. Warm Redis centroid cache
npm run atlas:redis-centroid:mirror:apply

# 5. Create Neo4j SIMILAR_TOPOLOGY edges
npm run atlas:phase102:step7:neo4j

# 6. Final validation gates
npm run atlas:phase102:step9:gates
```

### For Summaries: Recommended Strategy

**Immediate (no schema changes)**:
1. Use `batch:summaries:wrapped:apply` with existing Gemma4 :8090
2. Add RabbitMQ queue for parallel workers (3–4 workers, 4–8× speedup)
3. Monitor via SSE `/api/summaries/progress`

**Medium-term (if 4–8× speedup insufficient)**:
1. Add Triton TensorRT inference server (10–20× speedup)
2. OR use smaller DistilBERT model for fast extraction (3–5× speedup, slightly lower quality)

**Do NOT**:
- ❌ Change `embedding_384` dimension
- ❌ Rewrite Gemma4 calls (just parallelize via queue)
- ❌ Touch atlas_packets identity chain
- ❌ Use service_worker for compute

---

## Blockers

### Active Blockers
| Blocker | Impact | Resolution |
|---------|--------|-----------|
| Summaries taking >1 day | Phase 102 completion delayed | Use RabbitMQ parallel queue (immediate) |
| LibTorch bridge unavailable in ESM context | Optional GPU acceleration blocked | Can skip; CPU baseline is sufficient |
| Neo4j GDS orchestrator not wired | Step 7 ready but needs script | Create `scripts/atlas/phase7-neo4j-topology.mjs` |
| Redis centroid mirror script not tested | Step 8 ready but needs validation | Run `atlas:redis-centroid:mirror:apply --dry-run` |

### Historical Blockers (RESOLVED)
- ✅ RRF persistence: fixed via `atlas_packets.metadata.rrf` (not `packet_graph_scores`)
- ✅ Tensor dimension: verified as 384-dim canonical (not 768)
- ✅ Redis writer filtering: fixed to use global top-10 key (not per-query)

---

## Explicit "Do NOT Touch" List

### Schema / Identity (FROZEN)
- ❌ `atlas_packets.packet_key` — immutable identity
- ❌ `atlas_packets.source_ref` — immutable identity
- ❌ `atlas_packets.feature_id` — immutable identity
- ❌ `codebase_chunk_index.embedding` (halfvec 768) — truncated to 384 in memory, DO NOT re-encode

### Embedding / Vector (CANONICAL)
- ❌ `embedding_384` dimension — project-canonical
- ❌ `latent_64` for ANN search — topology routing only, NOT search
- ❌ Qdrant `codebase_chunks_768` collection — mirror of codebase_chunk_index, do NOT resync without gate

### Packet Identity (IMMUTABLE)
- ❌ Do NOT create `packet_graph_scores` table (use `atlas_packets.metadata.rrf`)
- ❌ Do NOT join on `feature_id` alone (always use `source_ref + directory_path`)
- ❌ Do NOT introduce multi-source conflation (one packet_key = one source_ref)

### Compute Boundaries
- ❌ Do NOT use `service_worker.ts` for compute (SSE streaming for progress only)
- ❌ Do NOT run Gemma4 calls directly from browser (use RabbitMQ queue + server workers)
- ❌ Do NOT assume AE 64-dim vectors are suitable for ANN search (topology bonus only)

### GPU Assumptions
- ❌ Do NOT require LibTorch/CUDA for Phase 102 completion (CPU baseline is sufficient)
- ❌ Do NOT treat TensorRT as a blocker (optional accelerator)
- ❌ Do NOT assume GPU will be available (fallback to CPU must work)

---

## Verification Commands

### Check Phase 102 Status
```bash
# Step 4 (RRF)
DB_PASSWORD=123456 docker exec legal-ai-postgres psql -U legal_admin \
  -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets WHERE metadata ? 'rrf'"
# Expected: ≥10

# Step 5 (Tensor)
cat docs/reports/phase5-tensor-loader.json | jq '.embedding_count, .embedding_dim'
# Expected: 40568, 384

# Step 6 (SOM) — after execution
cat docs/reports/phase6-som-clustering.json | jq '.stats'
# Expected: 40568 embeddings, 400 clusters, convergence metrics

# Valkey cache
docker exec legal-ai-valkey valkey-cli -a redis GET bitfrost:rrf:global:top-10 | wc -c
# Expected: >100 bytes (10 results cached)
```

### Run Full Pipeline
```bash
cd sveltekit-frontend

# Steps 1-3
npm run atlas:phase102:step4:all

# Step 5
npm run atlas:phase102:step5:tensor-loader

# Step 6 (choose one)
npm run atlas:phase102:step6:som-clustering                    # Default (auto-detect GPU)
DB_PASSWORD=123456 node scripts/atlas/phase6-som-clustering-libtorch.mjs  # Force LibTorch
```

---

## Summary

**Phase 102 is 80% complete.** Steps 1–5 are wired and verified. Step 6 (SOM clustering) is ready to execute. Steps 7–9 are scaffolded but need final wiring.

**Blocker**: Summaries are slow (serial Gemma4). Solution: Parallelize via RabbitMQ queue (4–8× speedup) or use Triton (10–20× speedup).

**Next action**: Execute Step 6 → Step 7 Neo4j enrichment → Step 8 Redis warming → Step 9 validation gates.

**Do NOT**:
- Reopen schema/packet identity (frozen)
- Change embedding_384 dimension
- Require GPU (CPU baseline sufficient)
- Use service_worker for compute
- Create packet_graph_scores (use atlas_packets.metadata instead)
