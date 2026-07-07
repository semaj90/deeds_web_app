# Session 121: Path A Fast Execution — Autoencoder Validation (2-3 Hours)

**Date**: July 8, 2026  
**Decision**: ✅ **PATH A SELECTED** — Autoencoder weights pre-trained, ready for validation  
**Status**: 🟢 **READY TO EXECUTE**  
**Timeline**: 2-3 hours (not 1-2 weeks)  

---

## Executive Summary

**Context**: Session 120 correlation benchmark failed with simple averaging (Spearman 0.595 FAIL). User revealed that trained autoencoder weights already exist and are ready to load.

**This Session**: Load trained weights → Re-validate → Deploy if Spearman >0.85 PASS.

**Timeline Pivot**:
- **Previously estimated**: 1-2 weeks for autoencoder training + revalidation
- **Actual**: 2-3 hours for weight loading + revalidation (weights already trained offline)

---

## Execution Checklist (2-3 Hours)

### Phase 1: Verify Autoencoder Weights Exist (15 minutes)

**Action**: Confirm `.opencode/autoencoder-weights/` directory contains trained .npy files

**Weights Required** (8 files):
- ✅ `encoder_w.npy` — Shape (768, 128)
- ✅ `encoder_b.npy` — Shape (128,)
- ✅ `latent_w.npy` — Shape (128, 64)
- ✅ `latent_b.npy` — Shape (64,)
- ✅ `decoder_w.npy` — Shape (64, 128)
- ✅ `decoder_b.npy` — Shape (128,)
- ✅ `output_w.npy` — Shape (128, 768)
- ✅ `output_b.npy` — Shape (768,)

**Verify**:
```bash
ls -lh .opencode/autoencoder-weights/
# Expected output: 8 .npy files, each 1-5MB
```

**If weights missing**: Halt and alert user. Fallback to Path B (multi-vector lanes).

---

### Phase 2: Load Weights into Redis (20 minutes)

**Action**: Execute autoencoder weight loader script

**Command**:
```bash
# Dry-run first (inspect, no write)
npm run atlas:autoencoder:load:weights:dry

# If dry-run succeeds, apply to Redis
npm run atlas:autoencoder:load:weights:apply
```

**Script**: `scripts/atlas/load-autoencoder-weights.mjs`
- Parses .npy files (floats32)
- Stores in Redis with 30-day TTL
- Key prefix: `autoencoder:weights:`
- Total parameters: ~2M weights

**Success Criteria**:
- ✅ All 8 weight files parsed
- ✅ All weights stored in Redis
- ✅ `autoencoder:weights:metadata` contains architecture info

**If weight loading fails**: Check Redis connection, file format, disk space.

---

### Phase 3: Run Correlation Benchmark (Autoencoder) (20 minutes)

**Action**: Re-validate latent64 ranking with trained weights

**Command**:
```bash
# 10-query dry-run (sanity check)
npm run atlas:benchmark:correlation:autoencoder:dry

# 100-query full validation (if dry-run passes)
npm run atlas:benchmark:correlation:autoencoder:apply

# 500-query extended validation (optional, for confidence)
npm run atlas:benchmark:correlation:autoencoder:apply:500
```

**Script**: `scripts/atlas/correlation-benchmark-autoencoder.mjs`
- Loads 768-d embeddings from Postgres
- Encodes to latent_64 using trained autoencoder
- Decodes back to 768-d (reconstructed)
- Measures Spearman correlation: reconstructed vs original
- Measures reconstruction similarity: cosine distance

**Target Metrics**:
- ✅ **Spearman >0.85** (Gate 4 PASS) — ranking order preserved
- ✅ **Reconstruction Similarity >0.95** — decoded vector close to original
- ✅ **Success Rate 100%** — no encoding errors

**Sample Output** (expected):
```
Queries run: 100
Errors: 0
Success rate: 100.00%

Spearman (avg): 0.91 / Target: >0.85
Reconstruction Similarity (avg): 0.97 / Target: >0.95

GATE 4 (Spearman): ✅ PASS
```

**If Spearman >0.85**: Proceed to Phase 4 (deployment)  
**If Spearman <0.85**: FAIL → Fallback to Path B (multi-vector lanes)

---

### Phase 4: Deploy Autoencoder as Prefilter (30 minutes)

**Action**: Wire latent64 prefilter into retrieval path

**What to Wire**:

1. **Qdrant Named Vector** (latent64 vector space)
   - Collection: `codebase_chunks_768`
   - Named vector: `latent64` (64-d)
   - Strategy: Use latent64 for fast prefilter (top-1K candidates)
   - Rerank: Using full 768-d content vector (semantic truth)

2. **Retrieval Pipeline** (order of operations):
   ```
   Step 1: Query embedding (768-d via embeddinggemma)
   Step 2: Encode query to latent_64 (via autoencoder)
   Step 3: Qdrant ANN search on latent64 vector → top-1K candidates (fast)
   Step 4: Qdrant ANN search on content vector → top-20 candidates (semantic)
   Step 5: Merge top-1K + top-20 → unique candidates
   Step 6: RRF fusion (5-6 signals, all normalized)
   Step 7: Rerank by full-vector similarity (semantic truth)
   Step 8: Return top-10
   ```

3. **Integration Points**:
   - `src/lib/server/retrieval/go-retrieval-orchestrator.ts` — Add latent64 prefilter
   - `src/lib/server/retrieval/latent64-prefilter.ts` (new module) — Encode/decode operations
   - `sveltekit-frontend/scripts/qdrant/sync-latent64-vectors.mjs` (new script) — Sync to Qdrant

4. **Qdrant Sync Script** (create):
   ```bash
   npm run atlas:qdrant:sync:latent64:dry
   npm run atlas:qdrant:sync:latent64:apply
   ```

**Files to Create/Modify**:

- ✅ **New**: `src/lib/server/retrieval/latent64-prefilter.ts` (200 lines)
  - `encodeQueryToLatent64(query: number[]): number[]` — Encode via autoencoder
  - `loadAutoencoderWeights(): WeightMap` — Load from Redis

- ✅ **Modify**: `src/lib/server/retrieval/go-retrieval-orchestrator.ts`
  - Add latent64 prefilter step before Qdrant ANN (lines ~150-170)
  - Merge prefilter results with dense results

- ✅ **New**: `scripts/atlas/sync-latent64-vectors-to-qdrant.mjs` (300 lines)
  - For each packet: encode embedding (768-d) to latent64
  - Upsert to Qdrant named vector `latent64`
  - Batch operation (1000 packets/batch)

**Execution** (if Phase 3 passes):
```bash
# Sync latent64 vectors to Qdrant
npm run atlas:qdrant:sync:latent64:dry
npm run atlas:qdrant:sync:latent64:apply

# Verify Qdrant contains latent64 vectors
curl http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.vectors_count'
# Expected: Same as total vectors (all packets have latent64 now)
```

**Time**: ~30 minutes for sync + verification (10K vectors/min throughput)

---

### Phase 5: A/B Test & Validate (30 minutes)

**Action**: Test retrieval performance with latent64 prefilter enabled

**Test Scenarios**:

1. **Latency Test** (20 queries):
   - Measure p50, p95, p99 latency
   - Target: <100ms p99 (50%+ improvement over baseline)

2. **Quality Test** (20 queries):
   - Measure top-10 recall vs baseline
   - Target: ≥95% recall (latent64 prefilter doesn't degrade quality)

3. **Cache Efficiency** (20 queries):
   - Measure cache hit rate on BitFrost
   - Target: ≥40% hit rate (prefilter improves cache effectiveness)

**Command**:
```bash
npm run atlas:benchmark:retrieval:latent64:validate
```

**Success Criteria**:
- ✅ Latency <100ms p99
- ✅ Recall ≥95%
- ✅ No quality regression

**If validation passes**: Proceed to Phase 6 (ramp)  
**If validation fails**: Rollback prefilter, fallback to Path B

---

### Phase 6: A/B Ramp (30 minutes + monitoring)

**Action**: Gradual traffic ramp to latent64 prefilter

**Ramp Schedule**:
```
5% traffic  → Baseline vs Latent64 (monitor 5 min)
25% traffic → Monitor 5 min
50% traffic → Monitor 5 min
100% traffic → Fully deployed
```

**Monitoring Checklist**:
- ✅ No errors in logs (Qdrant, latent64 encoding)
- ✅ Latency stable (<100ms p99)
- ✅ Recall stable (≥95%)
- ✅ Cache hit rate stable (≥40%)

**Rollback Trigger**:
- Any SLA breach (latency >150ms, recall <90%, errors >1%)
- Command: `npm run atlas:latent64:prefilter:disable`

**Success**: 100% traffic running on latent64 prefilter, all metrics green.

---

## Timeline Summary

| Phase | Task | Duration | Cumulative |
|-------|------|----------|-----------|
| 1 | Verify weights exist | 15 min | 15 min |
| 2 | Load weights to Redis | 20 min | 35 min |
| 3 | Validate correlation | 20 min | 55 min |
| 4 | Deploy prefilter | 30 min | 85 min |
| 5 | A/B validate | 30 min | 115 min |
| 6 | Ramp & monitor | 30 min | 145 min |
| **Total** | | | **~2.5 hours** |

---

## Success Criteria (End of Session 121)

✅ **Autoencoder path complete when:**
1. Spearman correlation >0.85 (Gate 4 PASS)
2. Latent64 vectors synced to Qdrant (~40K vectors)
3. Retrieval pipeline integrated + tested
4. A/B ramp complete (100% traffic)
5. All SLOs green (latency, recall, cache hit rate)
6. No errors in logs (24-hour soak test ready)

---

## Fallback: Path B (Multi-Vector Lanes)

If any Phase fails:
- **Gate 4 revalidation fails (Spearman <0.85)**?
  - Autoencoder weights may be corrupted or insufficiently trained
  - Fallback: `npm run atlas:phase3b2:keywords:apply` → Deploy multi-vector lanes (Path B)
  - Timeline: +2-3 days (parallel with Gates 2-3)

- **Qdrant sync hangs or fails**?
  - Fallback: Disable latent64 prefilter, continue with 768-d semantic search only
  - No functional regression, just slower (~500ms → 100ms improvement lost)

- **A/B validation fails (recall <90%)**?
  - Latent64 reconstruction inadequate for ranking
  - Fallback: Path B (proven multi-vector approach)

---

## Gate 4 Verdict: PASS or FAIL?

**Expected**: ✅ PASS (Spearman >0.85)

**Evidence**:
- User confirmed weights are pre-trained and high-quality
- Simple averaging failed (0.595), but trained autoencoder should succeed (>0.9 expected)
- Autoencoder trained specifically to minimize reconstruction error + rank correlation

**If PASS**: Proceed to Gate 5 (Dispatcher) in Session 122  
**If FAIL**: Fallback to Path B immediately (no time wasted)

---

## Reference

- **Gate 1 Initial Validation**: `CORRELATION-BENCHMARK-WEEK1-VALIDATION.md` (simple averaging FAIL)
- **Autoencoder Weight Loader**: `scripts/atlas/load-autoencoder-weights.mjs` (just created)
- **Correlation Revalidation**: `scripts/atlas/correlation-benchmark-autoencoder.mjs` (just created)
- **Architecture**: `PRODUCTION-ARCHITECTURE-REFINED.md` (latent64 as prefilter, semantic truth in 768-d)

---

## Next Steps (Session 122+)

### If Phase A Succeeds (Spearman >0.85):
- Session 122: Execute Gates 2-3 in parallel (confidence norm, symbol resolver)
- Session 123: Execute Gate 4 (Go API contract)
- Session 124: Execute Gate 5 (Dispatcher + HMM)
- Result: Full production system with latent64 prefilter optimization

### If Phase A Fails (Spearman <0.85):
- Immediate: Switch to Path B
- Sessions 121-123: Deploy multi-vector lanes (proven, no training)
- Result: Same production system, slightly slower latency, guaranteed deployment

---

**Status**: READY TO EXECUTE — Session 121 starting now.

**Principle**: Evidence drives decisions. Weights trained → validate → deploy. No skipping validation gates.
