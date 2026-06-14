# Next Priorities (Post Phase D+E)

**Date**: June 14, 2026  
**Status**: Phase D+E complete and live. 7/8 validation checks pass. Production ready.

## Immediate (This Week)

### 1. Benchmark ACE Retrieval Improvement
**Goal**: Quantify the impact of Phase E enrichment boosts  
**Expected improvement**: +20-25% NDCG@10 (from community confidence + Karpathy authority)  
**Effort**: 2-3 hours (create 20-query benchmark with/without enrichment)  
**Owner**: TBD

**Tasks**:
- Create benchmark suite comparing:
  - Baseline ACE (without Phase E boosts)
  - ACE with Phase E enabled
- Run on representative 20 queries
- Report NDCG@10, MRR, Recall@10
- Save to `docs/reports/ace-enrichment-benchmark-2026-06-14.json`

**Success criteria**: 
- NDCG@10 improvement ≥15%
- No regressions (0 queries scoring lower than baseline)

---

### 2. Implement Deferred Autoencoder Lane (768→64)
**Goal**: Add optional latent dimensionality reduction for memory paths  
**Effort**: 4-6 hours (research + scaffold + integration tests)  
**Owner**: TBD
**Blocking**: No (optional enhancement)

**Tasks**:
- Create `scripts/atlas/train-autoencoder-768-64.mjs`
  - Sketch architecture (3-layer encoder: 768→384→64)
  - Use existing training data (embeddings from Qdrant)
  - Save weights to `.pt` file
- Create inference wrapper in `sveltekit-frontend/src/lib/server/gpu/autoencoder-bridge.ts`
- Integrate into Phase E master orchestrator
- Add npm script: `npm run atlas:phase-e:autoencoder`

**Success criteria**:
- Autoencoder trains without NaN
- 64-dim latent reconstruction loss <0.05
- Can be called from enrichment bridge

---

### 3. Implement Deferred SOM Lane (20×20 routing grid)
**Goal**: Add optional hierarchical clustering for query routing  
**Effort**: 6-8 hours (SOM training + grid seeding + Neo4j SIMILAR_TOPOLOGY edges)  
**Owner**: TBD
**Blocking**: No (optional enhancement)

**Tasks**:
- Create `scripts/atlas/train-som-20x20.mjs`
  - Load embeddings from Qdrant
  - Train SOM with 20×20 nodes
  - Assign packets to BMU (best matching unit)
- Seed Neo4j SIMILAR_TOPOLOGY edges between adjacent BMUs
- Update Qdrant codebase_chunks_768 payloads with som_cluster, som_row, som_col
- Integrate into Phase E master orchestrator

**Success criteria**:
- SOM trained without divergence
- All 17,485 packets assigned to BMU (0 unassigned)
- Qdrant payloads updated with SOM coords
- Neo4j has N× SIMILAR_TOPOLOGY edges (N = ~2,000-3,000)

---

## Short-term (Next 1-2 Weeks)

### 4. Wire ACE Health into Startup Sequence
**Goal**: Confirm enrichment available before agent reasoning begins  
**Effort**: 2 hours
**Owner**: TBD
**Blocking**: Nice-to-have (enrichment is optional/graceful)

**Tasks**:
- Add startup check in `src/lib/server/startup/ace-startup.ts`
- Call `/api/atlas/phase-e/health` during initialization
- Log warning (not fatal) if enrichment unavailable
- Document in `PHASE-DE-OPERATIONAL-CHECKLIST.md`

---

### 5. Measurement: Redis Cache Efficiency
**Goal**: Quantify cost savings from Karpathy score caching  
**Effort**: 2-3 hours
**Owner**: TBD

**Tasks**:
- Measure cache hit rate: `gpu:karpathy:scores` hits vs misses
- Compare latency: cached lookup vs full Karpathy computation
- Expected: 5ms cached, 30s+ if computed fresh
- Report to `docs/reports/karpathy-redis-cache-efficiency.json`

---

### 6. Documentation: Enrichment Boost Tuning Guide
**Goal**: Help operators adjust community_confidence and Karpathy multipliers  
**Effort**: 3-4 hours
**Owner**: TBD

**Tasks**:
- Create `docs/ENRICHMENT-BOOST-TUNING.md`
  - Current multipliers: community_confidence ×0.1, karpathy ×0.15, SOM ×0.08
  - Explain why each value was chosen
  - Document how to measure impact
  - Provide sweep instructions (e.g., vary ×0.05 to ×0.20)
  - Alert: non-linear impact, don't blindly increase

**Success criteria**:
- Document is clear enough for non-ML operator to tune
- Includes monitoring commands
- Includes rollback instructions

---

## Medium-term (2-4 Weeks)

### 7. Archive Phase D Scripts (git tag + cold storage)
**Goal**: Clean up scripts folder, preserve Phase D work for future reference  
**Effort**: 2-3 hours
**Owner**: TBD

**Tasks**:
- Create git tag: `phase-d-identity-reconciliation/complete-2026-06-14`
- Document in tag message: what each script does, exit codes, usage
- Move Phase D scripts to `deeds_labs/phase-d-archive/` (git ignored)
- Update `scripts/atlas/` README with "Phase D moved to archive"
- Verify: all Phase E references point to operational scripts only

**Success criteria**:
- Tag created with full message
- No broken references in Phase E master orchestrator
- Cold storage location documented

---

### 8. Performance Tuning: Enrichment Fetch Batching
**Goal**: Reduce Postgres/Redis round-trips for bulk enrichment  
**Effort**: 4-6 hours
**Owner**: TBD
**Blocking**: No (optional optimization)

**Tasks**:
- Current: enrichRetrievalChunksPhase5 fetches enrichment for all chunks serially
- Optimization: Batch Postgres `source_ref = ANY(refs)` + batch Redis `HGET` with pipelining
- Measure: latency impact on top-100 retrieval
- Expected: <50ms → <20ms enrichment fetch time

---

### 9. Neo4j Topological Neighbor Fetching (Complete Placeholder)
**Goal**: Wire Neo4j query in phase-e-enrichment-bridge.ts  
**Effort**: 3-4 hours
**Owner**: TBD
**Blocking**: No (feature enhancement, currently returns empty array)

**Tasks**:
- Implement `fetchTopologicalNeighbors(packetId, depth=2)` in enrichment bridge
- Query Neo4j for USED_CONCEPT + SIMILAR_TOPOLOGY edges
- Return up to 10 neighbors per edge type
- Integrate into enrichRetrievalChunksPhase5 response
- Add test coverage

---

### 10. Cross-Source Enrichment Consolidation (Redis Cache)
**Goal**: Implement optional `cache-enrichment-results.mjs` lane  
**Effort**: 4-5 hours
**Owner**: TBD
**Blocking**: No (optional enhancement)

**Tasks**:
- Create `scripts/atlas/cache-enrichment-results.mjs`
- Cache merged enrichment (community + Karpathy + topology + SOM) under `ace:enrichment:{packet_key}`
- TTL: 24h (refresh daily via Phase E pipeline)
- Measure: hit rate, latency improvement
- Integrate into Phase E master orchestrator

---

## Long-term (1-2 Months)

### 11. Integration: XGBoost Reranker (Stage 4)
**Goal**: Replace simple multiplicative boosts with learned reranking  
**Effort**: 12-16 hours
**Owner**: TBD
**Blocking**: No (Phase E is sufficient for MVP)

**Prerequisites**:
- Success/failure labels from user feedback (tracking phase)
- Feature matrix: semantic score, community_confidence, karpathy_blend, bm25_score, etc.
- Training set: 500+ labeled queries with rankings

**Tasks**:
- Collect labeled training data (user feedback integration)
- Train XGBoost model on feature matrix
- Deploy model as inference service
- Wire into ACE ranking pipeline (after semantic + Phase E boosts)
- A/B test: XGBoost ranking vs current multiplicative boosts

---

### 12. Latency Optimization: GPU-Accelerated Qdrant Filtering
**Goal**: Move Qdrant payload filtering to GPU for faster pre-filtering  
**Effort**: 8-10 hours
**Owner**: TBD
**Blocking**: No

**Tasks**:
- Profile current Qdrant filtering latency
- Implement GPU-side filtering (if supported by Qdrant version)
- Alternative: Pre-compute filtered collections per community_id
- Measure latency impact on retrieval

---

## Success Metrics (Track These)

**By end of this week**:
- ✅ Phase E enrichment benchmark complete (NDCG@10 improvement measured)
- ✅ Autoencoder lane implemented (placeholder removed)
- ✅ SOM lane implemented (placeholder removed)

**By end of next week**:
- ✅ ACE health integrated into startup
- ✅ Cache efficiency measured (Redis hit rate)
- ✅ Tuning guide documented

**By end of month**:
- ✅ Phase D scripts archived
- ✅ Enrichment fetch batching complete (latency <20ms)
- ✅ Neo4j topological neighbors wired
- ✅ Redis consolidation cache implemented

---

## Decision Points

### Decision 1: Which autoencoder architecture?
- **Option A** (current): 3-layer (768→384→64)
- **Option B**: 4-layer (768→512→128→64) for better latent quality
- **Recommendation**: Start with Option A (faster), measure latency/quality, iterate

### Decision 2: XGBoost or MARCO cross-encoder?
- **Option A**: XGBoost (lightweight, fast, requires labeled data)
- **Option B**: MARCO cross-encoder (heavier, but pre-trained on MS corpus)
- **Recommendation**: Both. XGBoost for MVP (no fine-tuning), MARCO as future upgrade

### Decision 3: SOM grid size?
- **Current**: 20×20 (400 nodes)
- **Alternatives**: 10×10 (100, faster), 32×32 (1024, more granular)
- **Recommendation**: Keep 20×20. Can expand to 32×32 if routing bottleneck observed

---

## Notes for Operators

1. **Phase E is production-ready NOW**. Don't wait for deferred lanes (autoencoder, SOM) to enable enrichment.

2. **Enrichment is non-blocking**. If any source (Postgres, Redis, Neo4j) is unavailable, ACE degrades gracefully and returns base scores.

3. **Monitor daily**:
   ```bash
   npm run atlas:validate:unified
   curl http://localhost:5173/api/atlas/phase-e/health
   ```

4. **Karpathy scores should refresh daily**:
   ```bash
   # Add to crontab (02:00 UTC daily)
   0 2 * * * npm run atlas:phase-e:karpathy
   ```

5. **Benchmark results will inform**:
   - Whether to prioritize XGBoost (if NDCG improvement <15%, learning-based ranking needed)
   - Whether deferred lanes worth the investment (if improvement <10%, skip them)

---

**Questions?** See `docs/PHASE-DE-OPERATIONAL-CHECKLIST.md` or memory file `PHASE-DE-COMPLETION-JUNE-14-2026.md`.
