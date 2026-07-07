# Session 121: Gate 4 Correlation Validation — FAILED

**Date**: July 7, 2026  
**Gate**: Gate 4 (Spearman correlation >0.85)  
**Result**: ❌ **FAILED**  
**Spearman Correlation**: 0.5336 (100-query run) | 0.5050 (10-query dry-run)  
**Target**: >0.85 PASS / 0.80-0.85 MARGINAL / <0.80 FAIL  

---

## Summary

Pre-trained autoencoder weights from `/models/autoencoder/` were loaded to Redis and validated against 100 random embeddings from `codebase_chunk_index`. **The correlation benchmark FAILED**.

### Key Metrics

| Metric | 10-Query Dry-Run | 100-Query Full | Target | Status |
|--------|-----------------|----------------|--------|--------|
| **Spearman Correlation** | 0.5050 | 0.5336 | >0.85 | ❌ FAIL |
| **Reconstruction Similarity** | 0.5505 | 0.5706 | >0.95 | ❌ FAIL |
| **Success Rate** | 100% | 100% | 100% | ✅ PASS |
| **Queries Processed** | 10 | 100 | - | ✅ COMPLETE |

---

## Root Cause Analysis

### Hypothesis 1: Weights Are Untrained or Corrupt
- Weights parse correctly (214,080 parameters loaded)
- Weights shape is correct (768→128→64→128→768)
- Reconstruction works (no NaN/Inf)
- **But**: Correlation is **worse than simple averaging** (0.5336 vs simple avg 0.595)

### Hypothesis 2: Weights Were Trained on Different Data/Model
- Autoencoder may have been trained on different embeddings (not embeddinggemma:latest)
- May have been trained on different embedding dimension (768 vs 384)
- May have been trained on different downstream task
- **Evidence**: Correlation (0.53) suggests random or adversarial weights

### Hypothesis 3: Architecture Mismatch
- Latent dimension: 64 (correct)
- Hidden layer: 128 (standard)
- Input/output: 768 (matches our embeddings)
- **Likely**: Weights match architecture, but weren't trained on this codebase

---

## What Happened

### Phase 1: Verify Weights ✅
- ✅ Weights directory found: `/models/autoencoder/`
- ✅ All 8 .npy files present:
  - `W_enc_768_128.npy` (393KB)
  - `b_enc_128.npy` (1KB)
  - `W_enc_128_64.npy` (33KB)
  - `b_enc_64.npy` (1KB)
  - `W_dec_64_128.npy` (33KB)
  - `b_dec_128.npy` (1KB)
  - `W_dec_128_768.npy` (393KB)
  - `b_dec_768.npy` (3KB)

### Phase 2: Load to Redis ✅
- ✅ Connected to Valkey (password: `redis`)
- ✅ All 8 weight arrays loaded to Redis
- ✅ Key prefix: `autoencoder:weights:*`
- ✅ TTL: 30 days

### Phase 3: Validate Correlation ❌
- ✅ Loaded 100 embeddings from Postgres (halfvec → real[])
- ✅ Encoder forward pass (768 → 128 ReLU → 64)
- ✅ Decoder forward pass (64 → 128 ReLU → 768)
- ✅ Spearman correlation calculated on original vs reconstructed
- ❌ **Result: 0.5336 < 0.85 threshold**

---

## Comparison: Session 120 vs Session 121

| Method | Spearman | Status | Notes |
|--------|----------|--------|-------|
| **Simple Averaging** (Session 120) | 0.595 | ❌ FAIL | 768→64 via mean over indices |
| **Pre-Trained AE** (Session 121) | 0.5336 | ❌ FAIL | Weights from `/models/autoencoder/` |
| **Target (Trained AE)** | >0.85 | ❌ NOT ACHIEVED | Would require new training |

**Both approaches fail**. The pre-trained autoencoder **performs worse than simple averaging**.

---

## Decision Point

**Gate 4 has definitively FAILED.** Next steps:

### Option 1: Fallback to Path B (Recommended)
- Deploy multi-vector lanes (content + summary + keywords + graph)
- Timeline: 2-3 days
- Risk: Low (proven technique, no training required)
- Quality: 2-3× latency improvement (vs 12× from autoencoder)
- **This is the safe, evidence-based choice**

### Option 2: Investigate Different Weights
- Search `/models/` and `.opencode/` for other autoencoder weight files
- Possible: Different architecture or training target
- Risk: Time spent on discovery with uncertain outcome
- **Not recommended without evidence**

### Option 3: Train New Autoencoder
- Specific to `embeddinggemma:latest` embeddings on this codebase
- Timeline: 1-2 weeks (uncertain)
- Risk: High (no guarantee of success, blocks other work)
- **Deferred to later phase if multi-vector lanes insufficient**

---

## Recommendation

**SWITCH TO PATH B (Multi-Vector Lanes)** immediately:
1. ✅ Path B is proven to work (RRF fusion of 5-6 signals)
2. ✅ Expected 2-3× latency improvement
3. ✅ 2-3 day execution timeline
4. ✅ Low risk (no training, no architectural unknowns)
5. ✅ Gates 2-4 can run in parallel (confidence norm, symbol resolver, Go API)

**Path A (Autoencoder) moves to deferred research** pending:
- Availability of weights trained specifically on this embedding model
- Strong evidence that training would yield Spearman >0.85
- Justification for 1-2 week delay vs 2-3 day safe path

---

## Files Generated

- `scratch/benchmarks/correlation-autoencoder-2026-07-07T19-14-44-471Z.jsonl` — Full benchmark results (100 queries)
- `scripts/atlas/load-autoencoder-weights.mjs` — Weight loader (READY FOR REUSE if better weights found)
- `scripts/atlas/correlation-benchmark-autoencoder.mjs` — Validation harness (READY FOR REUSE)

---

## Next Session Plan

**Session 121 Continuation: Switch to Path B**

1. Create `GATE-2-CONFIDENCE-NORMALIZATION-SPEC.md` execution plan (existing template ready)
2. Create `GATE-3-SYMBOL-RESOLVER-SPEC.md` execution plan (existing template ready)
3. Wire multi-vector RRF lanes (content + summary + keywords + topology)
4. Expected completion: 2-3 days
5. Alternative: Run Gates 2-4 in parallel with production Path B deployment

**Immediate Action**: Confirm with user that Path B is acceptable, then pivot to multi-vector implementation.

---

## Appendix: Weight File Verification

All weight files verified to load correctly:

```
✅ W_enc_768_128.npy — Shape: (128, 768), Dtype: float32
✅ b_enc_128.npy — Shape: (128,), Dtype: float32
✅ W_enc_128_64.npy — Shape: (64, 128), Dtype: float32
✅ b_enc_64.npy — Shape: (64,), Dtype: float32
✅ W_dec_64_128.npy — Shape: (128, 64), Dtype: float32
✅ b_dec_128.npy — Shape: (128,), Dtype: float32
✅ W_dec_128_768.npy — Shape: (768, 128), Dtype: float32
✅ b_dec_768.npy — Shape: (768,), Dtype: float32

Total: 214,080 parameters loaded successfully
```

Weights are structurally sound. The low correlation is a **data/training mismatch**, not a format or loading error.
