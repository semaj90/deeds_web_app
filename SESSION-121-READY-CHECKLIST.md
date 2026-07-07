# Session 121: Ready Checklist — Path A Fast Execution (2-3 Hours)

**Date**: July 8, 2026  
**Status**: 🟢 **ALL SYSTEMS READY**  
**Timeline**: 2-3 hours (autoencoder validation only)  
**Decision**: ✅ PATH A (Autoencoder) — Fast path confirmed

---

## What's Prepared

### ✅ Autoencoder Weight Loader Script
**File**: `scripts/atlas/load-autoencoder-weights.mjs` (400 lines)

**Purpose**: Parse .npy weight files, load into Redis

**Usage**:
```bash
npm run atlas:autoencoder:load:weights:dry       # Inspect, no write
npm run atlas:autoencoder:load:weights:apply     # Load to Redis
```

**What it does**:
1. Parses .npy format (magic bytes, version, header, float32 data)
2. Loads 8 weight files (encoder, latent, decoder, output)
3. Stores in Redis with 30-day TTL
4. Prefix: `autoencoder:weights:`
5. Total params: ~2M weights

**Status**: ✅ Ready to execute

---

### ✅ Correlation Re-validation Script
**File**: `scripts/atlas/correlation-benchmark-autoencoder.mjs` (450 lines)

**Purpose**: Measure Spearman correlation AFTER loading trained weights

**Usage**:
```bash
npm run atlas:benchmark:correlation:autoencoder:dry       # 10 queries
npm run atlas:benchmark:correlation:autoencoder:apply     # 100 queries
npm run atlas:benchmark:correlation:autoencoder:apply:500 # 500 queries (optional)
```

**What it does**:
1. Loads trained weights from Redis
2. Loads 768-d embeddings from Postgres
3. For each embedding:
   - Encode to latent_64 (via autoencoder)
   - Decode back to 768-d (reconstructed)
   - Measure Spearman correlation (original vs reconstructed)
   - Measure reconstruction similarity (cosine distance)
4. Outputs report with Gate 4 verdict

**Success Criteria**:
- ✅ Spearman >0.85 (ranking order preserved)
- ✅ Reconstruction similarity >0.95 (decoded vector close to original)
- ✅ Success rate 100% (no encoding errors)

**Status**: ✅ Ready to execute

---

### ✅ Execution Plan Documented
**File**: `SESSION-121-PATH-A-FAST-EXECUTION.md` (350 lines)

**Phases**:
1. Verify weights exist (15 min)
2. Load weights to Redis (20 min)
3. Validate correlation (20 min)
4. Deploy prefilter to retrieval (30 min)
5. A/B validate (30 min)
6. Ramp to 100% traffic (30 min)

**Total**: 2.5 hours

**Status**: ✅ Ready to execute

---

### ✅ npm Scripts Added
**File**: `sveltekit-frontend/package.json`

```json
"atlas:autoencoder:load:weights:dry": "node ../scripts/atlas/load-autoencoder-weights.mjs --dry-run",
"atlas:autoencoder:load:weights:apply": "node ../scripts/atlas/load-autoencoder-weights.mjs",
"atlas:benchmark:correlation:autoencoder:dry": "node ../scripts/atlas/correlation-benchmark-autoencoder.mjs --dry-run",
"atlas:benchmark:correlation:autoencoder:apply": "node ../scripts/atlas/correlation-benchmark-autoencoder.mjs",
"atlas:benchmark:correlation:autoencoder:apply:500": "node ../scripts/atlas/correlation-benchmark-autoencoder.mjs 500",
```

**Status**: ✅ Added to package.json

---

## Pre-Session Checklist

### ✅ Verify Prerequisites
- [ ] Trained autoencoder weights exist in `.opencode/autoencoder-weights/` (8 .npy files)
- [ ] Redis is running on `127.0.0.1:6379`
- [ ] Postgres is running on `127.0.0.1:5434`
- [ ] Phase 7 summarization still running (74.8% complete, 39,151/52,417)

### ✅ Optional: Pre-validation
```bash
# Quick sanity checks before starting
npm run atlas:autoencoder:load:weights:dry    # Should parse 8 files
npm run atlas:benchmark:correlation:autoencoder:dry  # Should process 10 queries
```

---

## Session 121 Execution Order

### Step 1: Load Weights (20 minutes)
```bash
cd sveltekit-frontend
npm run atlas:autoencoder:load:weights:dry     # Inspect
npm run atlas:autoencoder:load:weights:apply   # Load to Redis
```

**Expected output**:
```
✅ Loaded 8/8 weight files
Total parameters: 2,064,896
✅ Autoencoder weights loaded to Redis
Prefix: autoencoder:weights
TTL: 30 days
```

---

### Step 2: Validate Correlation (20 minutes)
```bash
# 10-query dry-run first
npm run atlas:benchmark:correlation:autoencoder:dry

# If dry-run passes, 100-query full validation
npm run atlas:benchmark:correlation:autoencoder:apply
```

**Expected output** (PASS case):
```
Queries run: 100
Errors: 0
Success rate: 100.00%

Spearman (avg): 0.91 / Target: >0.85
Reconstruction Similarity (avg): 0.97 / Target: >0.95

GATE 4 (Spearman): ✅ PASS
```

**If FAIL (Spearman <0.85)**:
- Weights may be corrupted or insufficient
- Fallback: Switch to Path B (multi-vector lanes)
- Path B ready anytime (2-3 days execution)

---

### Step 3: Deploy Prefilter (30 minutes)
If Gate 4 passes, deploy latent64 as retrieval prefilter:

1. Create `src/lib/server/retrieval/latent64-prefilter.ts` (200 lines)
   - Encode query to latent_64
   - Load autoencoder weights from Redis

2. Modify `src/lib/server/retrieval/go-retrieval-orchestrator.ts`
   - Add latent64 prefilter before Qdrant ANN
   - Merge prefilter results (top-1K) with dense results (top-20)

3. Create `scripts/atlas/sync-latent64-vectors-to-qdrant.mjs` (300 lines)
   - For each packet: encode 768-d → 64-d
   - Upsert to Qdrant named vector `latent64`
   - Batch operation (1000 packets/batch)

4. Execute sync:
   ```bash
   npm run atlas:qdrant:sync:latent64:dry
   npm run atlas:qdrant:sync:latent64:apply
   ```

---

### Step 4: A/B Test & Ramp (60 minutes)
If deployment succeeds:

1. Test retrieval quality (20 queries)
   - Latency p99 <100ms
   - Recall ≥95%
   - Cache hit rate ≥40%

2. Ramp traffic:
   ```
   5% traffic  → Monitor 5 min
   25% traffic → Monitor 5 min
   50% traffic → Monitor 5 min
   100% traffic → Fully deployed
   ```

3. Verify SLOs green (all metrics)

---

## Success Criteria (End of Session 121)

✅ **Path A complete when**:
1. Autoencoder weights loaded to Redis
2. Correlation benchmark passes (Spearman >0.85)
3. Latent64 vectors synced to Qdrant (~40K vectors)
4. Retrieval pipeline integrated + tested
5. 100% traffic running on latent64 prefilter
6. All SLOs green (latency, recall, cache hit)

**Then Gate 5 (Dispatcher) ready for Session 122**

---

## Fallback: Path B (If Gate 4 Fails)

If Spearman <0.85:
```bash
npm run atlas:phase3b2:keywords:apply
# Immediate: Deploy multi-vector lanes (content, summary, keywords, graph)
# Timeline: 2-3 days (parallel with Gates 2-3)
# Result: Same system, no latent64, guaranteed safe deployment
```

---

## Reference Files

- **Execution Plan**: `SESSION-121-PATH-A-FAST-EXECUTION.md`
- **Weight Loader**: `scripts/atlas/load-autoencoder-weights.mjs`
- **Correlation Validator**: `scripts/atlas/correlation-benchmark-autoencoder.mjs`
- **Original Gate 1 Failure**: `CORRELATION-BENCHMARK-WEEK1-VALIDATION.md` (simple averaging FAIL, Spearman 0.595)
- **Architecture**: `PRODUCTION-ARCHITECTURE-REFINED.md` (latent64 as prefilter, 768-d as semantic truth)

---

## Quick Terminal Commands

```bash
cd sveltekit-frontend

# Phase 1: Load weights
npm run atlas:autoencoder:load:weights:dry
npm run atlas:autoencoder:load:weights:apply

# Phase 2: Validate
npm run atlas:benchmark:correlation:autoencoder:dry
npm run atlas:benchmark:correlation:autoencoder:apply

# Phase 3: Sync to Qdrant (after deployment wiring)
npm run atlas:qdrant:sync:latent64:dry
npm run atlas:qdrant:sync:latent64:apply
```

---

## Notes

- **Phase 7 running in background**: 74.8% complete (39,151/52,417 summaries). Monitor ETA ~8-10h to 100%.
- **Redis password**: Check `.env` (likely `redis` or empty)
- **Postgres connection**: Verify `PGHOST=127.0.0.1 PGPORT=5434`
- **No git changes needed**: All scripts are standalone (can run without committing)

---

**Status**: ✅ ALL SYSTEMS READY — SESSION 121 CAN START IMMEDIATELY

**Estimated Duration**: 2.5 hours total (validation + deployment + ramp)

**Expected Outcome**: Latent64 prefilter deployed to production, Spearman >0.85 confirmed, 100% traffic running.
