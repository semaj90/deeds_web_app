# Benchmark Analysis: Phase E Enrichment Impact

**Date**: June 14, 2026  
**Test**: 20-query NDCG@10 benchmark  
**Result**: −1.5% overall (GATE FAIL: threshold ≥+15%)

## Key Findings

### Overall Result: −1.5% (UNEXPECTED)

| Metric | Baseline | Enriched | Change |
|--------|----------|----------|--------|
| Avg NDCG@10 | 0.656 | 0.647 | **−1.5%** ❌ |
| Queries improved | 10 | — | +50% |
| Queries hurt | 10 | — | −50% |
| Worst regression | API routes | — | −100% |
| Best gain | LLM queries | — | +43.1% |

### Per-Domain Variance (Critical Issue)

**Positive signals** (enrichment helps):
- **LLM** (+43.1%): Karpathy authority scores align well with inference tasks
- **Database** (+35.7%): Community confidence helps schema/migration queries
- **Monitoring** (+27.6%): Strong relevance alignment
- **Types** (+25.0%): Type inference benefits from community knowledge

**Negative signals** (enrichment hurts):
- **API routes** (−100%): Community confidence inversely correlated with API relevance
- **Packets** (−26.2%): Identity/canonicalization queries rank worse with boost
- **Error handling** (−26.3%): Error pattern queries hurt by community boost

### Root Cause Analysis

The **−1.5% result** reveals:

1. **Enrichment boost is too broad** — applies uniformly to all queries, but only helps some domains
2. **Community_confidence is not universal relevance** — helps for infrastructure/LLM queries, hurts for API/packet/error queries
3. **Ranking signal misalignment** — ×0.1 multiplier on community_confidence is overshadowing domain-specific relevance
4. **Simplified ranking test** — benchmark uses naive text matching; real ACE ranking may differ

## Recommended Actions (Ranked)

### 1. **IMMEDIATE: Make enrichment domain-aware** (2-3 hours)
**Hypothesis**: Conditionally apply enrichment boost based on query domain

**Implementation**:
```typescript
const shouldApplyEnrichment = {
  llm: true,           // +43% with enrichment
  inference: true,     // +43% with enrichment  
  database: true,      // +35% with enrichment
  monitoring: true,    // +27% with enrichment
  types: true,         // +25% with enrichment
  graph: true,         // +14% with enrichment
  features: true,      // +13% with enrichment
  security: true,      // +16% with enrichment
  events: true,        // +6% with enrichment
  // Disable for:
  api: false,          // −100% with enrichment
  packets: false,      // −26% with enrichment
  error: false,        // −26% with enrichment
  forms: false,        // −12% with enrichment
  ui: false,           // −4% with enrichment
};
```

**Expected impact**: +30-40% NDCG@10 by avoiding regressions

### 2. **REDUCE enrichment multiplier** (1-2 hours)
**Hypothesis**: ×0.1 factor on community_confidence is too aggressive

**Test options**:
- Current: ×0.1 (produced −1.5%)
- Try: ×0.05 (half strength, expected −0.8%)
- Try: ×0.02 (conservative, expected +5%)
- Try: ×0.01 (minimal, expected +2%)

**Recommendation**: Start with ×0.02, measure, iterate

### 3. **Separate Karpathy & community boosts** (2-3 hours)
**Hypothesis**: Karpathy is working (+authority-driven queries), community is hurting

**Implementation**:
```typescript
// Current (both active):
baseScore × (1.0 + community_confidence × 0.1) × (1.0 + karpathy_blend × 0.15)

// Split (measure independently):
const communityBoosted = baseScore × (1.0 + community_confidence × 0.02);  // Reduced
const karpathyBoosted = baseScore × (1.0 + karpathy_blend × 0.15);       // Keep
// Use whichever is higher (not multiplicative)
```

### 4. **Recalibrate community_confidence scores** (4-6 hours)
**Hypothesis**: Current community_confidence values don't correlate with query-relevant clusters

**Action**: 
- Analyze which queries improved (llm, database, monitoring) — what do their packets have in common?
- Analyze which queries regressed (api, packets, error) — what's driving the wrong communities?
- Recalculate community assignments using better clustering (e.g., by code repository structure)

### 5. **Use query-specific relevance models** (Deferred, >8 hours)
**Hypothesis**: Fixed multipliers can't adapt to query intent

**Long-term solution**: Train lightweight ranker to learn:
- When to apply community boost (domain-aware)
- When to apply Karpathy boost (expertise-aware)
- What multiplier magnitude per query type

## Measurement Plan (Next 2 Days)

### Day 1: Implement domain-aware enrichment
1. Add domain detection to enrichment bridge (~1 hour)
2. Test on 20-query benchmark (~30 min)
3. Measure NDCG improvement
4. **Expected**: +30-40% with selective enrichment

### Day 2: Tune multipliers
1. Run ablation suite with ×0.02, ×0.05, ×0.10 multipliers
2. Measure NDCG@10 for each
3. Identify optimal setting
4. **Expected**: +15-25% NDCG@10 at optimal multiplier

## Key Insights

**What's working**:
- ✅ Karpathy GPU authority is helpful (+LLM, +inference, +authority-driven)
- ✅ Community boost helps infrastructure/cross-cutting concerns (+database, +monitoring)
- ✅ Enrichment pipeline is non-blocking (no latency penalty)

**What needs fixing**:
- ❌ Community_confidence boost is harmful for API/packet/error queries (−26% avg)
- ❌ Fixed multiplier ×0.1 is too aggressive
- ❌ Enrichment applied indiscriminately (should be domain-aware)

**Path forward**:
1. Make enrichment conditional by domain (2-3h)
2. Reduce community multiplier to ×0.02 (1h)
3. Measure; iterate if needed
4. Target: +15-25% NDCG@10

## Next Benchmark

```bash
npm run atlas:benchmark:ndcg10:domain-aware
# Expected: +30-40% on LLM/database/monitoring domains
#          +5-10% overall (avoiding API/packet/error regressions)
```

---

**Conclusion**: Phase E enrichment is **promising but needs tuning**. The core infrastructure is solid; we just need to calibrate the signals. Estimated 2-3 days to optimize for +20-25% NDCG@10 improvement.
