# Session 121: Autoencoder Validation Closure

**Date**: July 8, 2026  
**Status**: ✅ **DISCOVERY COMPLETE** | ❌ **G4 GATE FAILED** | 🚀 **PIVOT TO OPTION B (MULTI-VECTOR LANES)**

---

## Executive Summary

**Initial Assumption**: Autoencoder training was pending (Session 120 stated 1-2 weeks).

**Discovery**: Autoencoder fully trained June 19, weights loaded to Valkey, correlation benchmark revalidated.

**Result**: G4 gate (Spearman correlation) **FAILED** at 0.712 << 0.85 threshold.

**Root Cause**: Autoencoder trained on reconstruction MSE, not ranking correlation preservation. These are orthogonal objectives.

**Decision**: Archive latent64 as research artifact (Valkey cache only). Deploy multi-vector lanes (Option B) as production path.

---

## What Was Built (Session 121)

### Phase 1-2: Weight Loading ✅
- ✅ All 8 NPY weight files verified on disk (trained 2026-06-19, val_loss=0.000735)
- ✅ Weights loaded to Valkey hashes (`ace:autoencoder:weights`, `ace:autoencoder:meta`)
- ✅ NPY parser fixed (DataView ArrayBuffer binding)

### Phase 3: Correlation Benchmark ❌
- ✅ 10-query dry-run executed
- ❌ **G4 Spearman: 0.712 (needs >0.85) — FAIL**
- ✅ G5 Recall@100: 100% — PASS
- ✅ G6 NDCG@20: 0.0 (no regression) — PASS
- ⚠️ G7 Latency improvement: 6.7% (needs >50%) — FAIL

### Phase 4: Schema & Storage ✅
- ✅ Migration 0105_latent64_vectors.sql created
- ✅ Postgres columns added: `latent_64 vector(64)`, `latent64_model`, `latent64_meta`, `latent64_validated_at`, `latent64_msgpack`
- ✅ HNSW index created: `idx_codebase_chunk_latent64_hnsw`
- ✅ Sample encoding test passed (20 vectors encoded successfully)

### Phase 5: Validation Contract ✅
- ✅ `.okf.json` created (`docs/contracts/latent64.okf.json`)
  - Documents model, Redis keys, Postgres schema, Qdrant mapping
  - Lists all 4 gates with thresholds and failure modes
  - **Status field: GATED — Do not use for HNSW prefilter until Spearman >0.85**

---

## Why G4 Failed

### The Mismatch
```
Autoencoder Training Objective:
  minimize_L(reconstruction_loss)  = MSE(input, decode(encode(input)))
  
Latent64 Ranking Requirement:
  preserve_order = Spearman(rank(cosine(latent64[i], latent64[j])), 
                             rank(cosine(original[i], original[j])))
```

**These are orthogonal.** A model can achieve excellent MSE (val_loss=0.000735) while destroying ranking order.

### Evidence
- **G5 passes (Recall@100 = 100%)**: Right candidates ARE retrieved
- **G4 fails (Spearman = 0.712)**: But they're in WRONG order
- **G6 passes (NDCG regression = 0)**: Full semantic search unaffected
- **G7 fails (Latency improvement = 6.7%)**: Encoding overhead dominates speedup

**Conclusion**: Latent64 is reconstructively accurate but semantically invertible for ranking.

---

## Next Steps: Option B (Multi-Vector Lanes)

### Immediate (Next 2-3 Days)
```bash
# 1. Wire multi-vector lanes to Qdrant
npm run atlas:qdrant:named-vectors:wire:dry
npm run atlas:qdrant:named-vectors:wire:apply

# 2. Implement RRF blend (5 signals)
npm run atlas:rrf:blend:dry
npm run atlas:rrf:blend:apply

# 3. A/B test & deploy
npm run atlas:retrieval:validate:multi-vector
```

### Multi-Vector Lane Breakdown
| Vector | Dimension | Purpose | Indexed |
|--------|-----------|---------|---------|
| **content** | 768 | Full semantic search (truth) | HNSW ✅ |
| **summary** | 768 | Summary-based retrieval | HNSW ✅ |
| **title** | 768 | Name/title search | HNSW ✅ |
| **keywords** | sparse | Lexical BM25 lane | BM25 ✅ |
| **latent64** | 64 | Research (Valkey cache only) | Archived |

### RRF Weight Distribution
```
0.40 · content_vector +
0.30 · summary_vector +
0.20 · title_vector +
0.10 · keywords_lexical
= unified ranking (normalized)
```

### Expected Outcomes
- **Recall**: ≥98% (multiple lanes catch diverse queries)
- **Latency**: ~100-150ms (parallel lane execution)
- **Quality**: NDCG@20 ≥0.72 (baseline)
- **Risk**: Low (proven multi-signal RRF pattern)

---

## Latent64 Artifact Status

### Storage (Preserved for Research)
- **Postgres**: `latent_64 vector(64)` column (20 samples backfilled, full backfill optional)
- **Valkey**: Cache key pattern `latent64:packet:{id}` (msgpack encoded)
- **Qdrant**: Named vector `latent64` (in collection metadata, NOT indexed)

### Archive Rationale
- Reconstruction quality is proven (MSE = 0.000735)
- Ranking quality is failed (Spearman = 0.712)
- Retraining would require: contrastive loss or cosine-distance-preserving objectives (1-2 weeks)
- Multi-vector lanes provide same/better coverage without training risk

### If Retraining Later
- Use `contrastive_loss` or `triplet_loss` instead of MSE
- Target: Spearman correlation >0.90 on validation set
- Full backfill from archived latent64 schema
- Re-benchmark before production use

---

## Files Created This Session

| File | Purpose | Status |
|------|---------|--------|
| `scripts/atlas/load-autoencoder-weights-to-redis.mjs` | NPY → Valkey loader | ✅ WORKING |
| `scripts/atlas/latent64-sample-backfill.mjs` | Sample encoding test | ✅ WORKING |
| `drizzle/0105_latent64_vectors.sql` | Schema migration | ✅ APPLIED |
| `docs/contracts/latent64.okf.json` | Validation contract | ✅ CREATED |
| `.opencode/ndjson/correlation_benchmark_report.md` | G4 failure report | ✅ DOCUMENTED |

---

## Decision Rationale

**Why NOT retrain the autoencoder?**
1. 1-2 week timeline extension (blocking Session 122+)
2. Retraining requires new loss function + validation harness
3. No guarantee of Spearman >0.85 even after retraining
4. Multi-vector lanes available NOW with proven architecture

**Why multi-vector lanes?**
1. Five independent signals (content, summary, title, keywords, graph)
2. RRF provably combines diverse rankings (literature + production use)
3. No training, no GPU overhead, no single point of failure
4. Can add latent64 later as signal #6 if retrained successfully

---

## Session 121 Verdict

✅ **Discovery complete**: Autoencoder weights verified, correlation validated, failure mode understood.

❌ **Option A blocked**: Autoencoder unsuitable for semantic ranking (MSE ≠ Spearman correlation).

🚀 **Option B ready**: Multi-vector lanes fully designed, components ready, 2-3 day deployment.

**Next session (122+)**: Execute Option B deployment. Start with keyword extraction + RRF wiring.

---

## Checklist for Session 122

- [ ] Extract keywords from all 40K packets (Phase 3b2)
- [ ] Wire content/summary/title named vectors to Qdrant
- [ ] Implement RRF blend (5 signals)
- [ ] A/B test multi-vector vs baseline
- [ ] Deploy to production (traffic ramp 5% → 100%)
- [ ] Monitor Recall, Latency, NDCG@20

**ETA**: 2-3 days to production deployment.

---

**Session 121 Complete**: Evidence-driven discovery → clear architectural pivot → ready for Session 122 execution.
