# Phase 1 Reality Check (June 24, 2026)

## Baseline Measurements

**Test Scale:** 2,000 chunks (representative sample)
**Duration:** 0.1s (database reads only)

### Current State

| Metric | Value | Status |
|--------|-------|--------|
| Total chunks | 2,000 | ✓ |
| With summaries | 160 (8.0%) | 🔴 CRITICAL GAP |
| With summary embeddings | 160 (8.0%) | 🔴 CRITICAL GAP |
| Qdrant IDs | 2,000/2,000 (100%) | ✓ |
| L1 cache hits | 0/160 (0%) | ⚠️ Cold start |
| L1 cache misses | 160/160 | Expected |

### Analysis

**The real bottleneck is NOT GPU reranking — it's summary generation coverage.**

The existing Phase 1 roadmap claimed:
- "Summary generation via Gemma4 + LangExtract intent classification"
- "4,000-chunk test run" with "3-5 min (cold) / 1-2 min (warm)"
- "GPU quality scoring" on summaries

**Reality:**
- Only 8% of chunks have summaries
- Cache is completely cold (0% L1 hits)
- GPU reranking can't improve what doesn't exist

### Priority Reversal

**Current Plan:**
1. GPU reranking (LibTorch batchCosineSimilarity)
2. RabbitMQ workers (4-8 parallel)
3. Cache warming (Bifrost L1/L2)

**Should Be:**
1. **Summary gap closure** — fill 92% missing summaries
2. **Cache metrics collection** — instrument every L1/L2 access
3. **Provenance tracking** — store feature_id + source_ref on cache hits
4. **Workers (then GPU)** — RabbitMQ + batch processing before scoring

### What This Means

Before running the full 40,754-chunk backfill:

**STOP** and execute:
```bash
npm run atlas:summary:phase1:dry          # How many missing?
npm run atlas:summary:phase1:verbose      # Where do summaries exist?
```

Once summaries reach 80%+ coverage THEN:
1. Measure Gemma4 throughput with cache
2. Add RabbitMQ workers
3. Wire cache provenance (trace_id, feature_id, cache_level)
4. Consider GPU scoring (if it moves the needle)

### GPU Reranking Reality

**Theoretical:** 100× speedup on cosine similarity  
**Measured:** 27.6× on embeddings (warm), no CPU baseline  
**Actual impact:** ~25ms saved per 1000 vectors = negligible vs. 1280ms per summary

**RabbitMQ + batching ROI:** 4× throughput = **4 workers × 4 hours ÷ 16 hours = 8 hour savings**  
**GPU reranking ROI:** ~5% latency improvement = **0.8 hour savings**

### Recommendation

1. **This week:** Close summary gap (Phase 1 actual missing: 92%)
2. **Next:** Wire cache provenance + trace_id
3. **Week after:** RabbitMQ workers (parallel summary generation)
4. **Then:** GPU reranking IF cache metrics show cosine similarity is >10% of latency

The Phase 1 orchestrator is well-designed. The validation just shows the plan needs execution sequencing: fill the gap before optimizing the path.

---

**Status:** Phase 1 Foundation ✓ | Summary Generation ✗ (8%) | Cache Warm ✗ | GPU Ready (deferred)  
**Next Action:** `npm run atlas:summary:phase1:verbose --limit=100` to understand summary distribution  
**Date:** 2026-06-24
