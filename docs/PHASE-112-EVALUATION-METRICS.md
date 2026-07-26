# Phase 112: Evaluation & Metrics

**Date**: July 25, 2026 (planning phase)  
**Status**: 🚀 PHASE 111 COMPLETE | ⏳ PHASE 112 READY FOR EXECUTION  
**Timeline**: Days 1-7 (concurrent with Phase 111 24-hour monitoring)

---

## Objective

Measure ranking quality of the Phase 108+ retrieval system and identify optimization opportunities for domain-class weights, retrieval lane rankings, and SOM grid configuration.

---

## Evaluation Metrics (4-Pillar)

### Pillar 1: Ranking Quality Metrics

**NDCG (Normalized Discounted Cumulative Gain)**
- Measures ranking quality at different cutoff levels
- Metric: NDCG@5, NDCG@10, NDCG@20
- Target: NDCG@10 > 0.65 (good), > 0.75 (excellent)
- Calculation:
  ```
  DCG@k = rel_1 + Σ(rel_i / log2(i)) for i=2..k
  NDCG@k = DCG@k / IDCG@k (where IDCG = ideal DCG)
  ```

**MAP (Mean Average Precision)**
- Measures precision at each relevant position
- Metric: MAP@10, MAP@20
- Target: MAP@10 > 0.50
- Calculation:
  ```
  AP = Σ(P(k) * Δrel(k)) / min(m, k)
  MAP = average of AP across all queries
  ```

**MRR (Mean Reciprocal Rank)**
- Measures rank of first relevant result
- Metric: MRR
- Target: MRR > 0.60
- Calculation:
  ```
  RR = 1 / rank_of_first_relevant
  MRR = average of RR across all queries
  ```

### Pillar 2: Lane Performance Analysis

**Per-Lane Metrics**:
- **Qdrant lane** (primary):
  - Coverage: % of queries where dense search found relevant results
  - Latency: p50, p95, p99
  - Precision: % top-5 results marked relevant
  
- **AST lane** (code structure):
  - Coverage: % of code queries
  - Precision: % relevant for code-related searches
  - Fallback rate: % queries falling back when AST unavailable
  
- **NLP lane** (entity/keyword):
  - Coverage: % of natural language queries
  - Precision: % entity matches correct
  - Recall: % of entities found in corpus
  
- **HMM lane** (error analysis):
  - Coverage: % error-related queries
  - Precision: % error resolutions correct
  
- **PageRank lane** (authority):
  - Coverage: % queries routed to authority scoring
  - Precision: % high-authority results relevant

**Target Distribution**:
- Qdrant: 35-40% of queries
- AST: 20-25% of queries
- NLP: 15-20% of queries
- HMM: 5-10% of queries
- PageRank: 10-15% of queries

### Pillar 3: Domain-Class Analysis

**Per-Domain Coverage**:
- Auth/Sessions: target NDCG > 0.70
- Database: target NDCG > 0.65
- Middleware: target NDCG > 0.60
- Caching: target NDCG > 0.70
- Error Handling: target NDCG > 0.55
- etc. (all 37 domain classes)

**Weight Tuning Opportunity**:
- Current Karpathy blend: 0.30·qdrant + 0.20·turbovec + 0.20·rg_lexical + 0.15·ast + 0.10·postgres + 0.05·freshness
- Proposed: Adjust weights based on per-domain NDCG performance
- Example: If Auth has high NDCG with qdrant but low with AST, increase qdrant weight for Auth domain

### Pillar 4: Cache Effectiveness

**Cache Hit Rate by Source**:
- L1 (Redis centroids): %
- L2 (Bifrost semantic): %
- L3 (Qdrant ANN): %
- Combined: Target >70%

**Cache Impact on Latency**:
- L1 hit latency: <5ms
- L2 hit latency: 2-50ms
- L3 miss latency: 50-200ms
- Average with 78% cache hit: ~50ms

**Cache Coherence**:
- Divergence between Postgres truth and cached values: 0% (target)
- Staleness acceptance: <24 hours (TTL)

---

## Evaluation Dataset & Methodology

### Query Collection (Phase 111 baseline → Phase 112 start)

**Sample Size**: 1,000-5,000 queries
- Collect during Phase 111 production traffic
- Stratified by domain class (proportional allocation)
- Include both cached and cache-miss queries

**Query Types**:
- Feature/module lookups (Auth, Database, etc.)
- Error analysis ("how to fix X?")
- Integration questions ("how do A and B interact?")
- Implementation guidance ("best practices for Y?")
- Bug investigation ("why is Z failing?")

**Judgment Collection** (manual annotation):

1. **Binary relevance** (1-5 scale):
   - 1 = Not relevant
   - 2 = Marginally relevant
   - 3 = Relevant
   - 4 = Highly relevant
   - 5 = Perfect match

2. **Annotation process**:
   - Sample top-5 results per query
   - Have 2 independent annotators rate each
   - Resolve disagreements via consensus
   - Expected time: 30-50 queries/hour

3. **Validation**:
   - Fleiss' kappa inter-rater agreement >0.70 (good)
   - Sample re-annotation for consistency check

### NDCG/MAP/MRR Calculation

```
For each query:
  1. Get ranking from retrieval system (top-20)
  2. Identify relevant results (rating ≥3)
  3. Calculate DCG = rel_1 + Σ(rel_i / log2(i))
  4. Get ideal ranking (all relevant first)
  5. Calculate IDCG
  6. NDCG = DCG / IDCG
  
Aggregate:
  Overall NDCG@5/10/20 = average across all queries
  Per-domain NDCG = average for queries in that domain
  Per-lane NDCG = average for queries routed to that lane
```

---

## Optimization Opportunities

### Opportunity 1: Domain-Class Weight Tuning

**Current State**:
- Karpathy blend uses fixed weights (0.30 qdrant, 0.20 turbovec, etc.)
- No per-domain customization

**Optimization**:
1. Run Phase 112 evaluation
2. Identify domains where certain lanes outperform
3. Create domain-specific weight profiles:
   ```
   domain_weights = {
     "Auth": { qdrant: 0.40, ast: 0.10, nlp: 0.20, hmm: 0.10, pagerank: 0.20 },
     "Database": { qdrant: 0.35, ast: 0.25, nlp: 0.15, hmm: 0.10, pagerank: 0.15 },
     ...
   }
   ```
4. A/B test new weights against baseline
5. Deploy if >5% NDCG improvement

**Expected Impact**: +5-15% NDCG for specialized domains

### Opportunity 2: Retrieval Lane Reordering

**Current State**:
- Primary lane fallback chain defined statically

**Optimization**:
1. Measure per-lane precision by domain
2. Identify best-performing lane for each domain
3. Reorder fallback chain per domain:
   ```
   domain_lane_priority = {
     "Auth": [qdrant, pagerank, ast, nlp, hmm],
     "Database": [qdrant, ast, pagerank, nlp, hmm],
     "Error": [hmm, qdrant, nlp, ast, pagerank],
     ...
   }
   ```
4. Route queries to domain-optimized lane order
5. Measure improvement on evaluation set

**Expected Impact**: +3-10% NDCG

### Opportunity 3: SOM Grid Optimization

**Current State**:
- 20×20 grid (400 cells, 100 populated)
- K-Means uses 40 clusters

**Optimization**:
1. Measure retrieval performance by SOM cell
2. Identify underutilized cells (low relevance rate)
3. Consider higher resolution (20×30, 25×25, 30×30):
   ```
   Pros: Finer-grained routing, better domain separation
   Cons: Larger grid, more clusters to train
   ```
4. Re-run K-Means with new resolution
5. Compare NDCG@10 on evaluation set

**Expected Impact**: +2-5% NDCG (moderate improvement)

### Opportunity 4: Cache Key Refinement

**Current State**:
- Bifrost cache keys: simple hash of query + model

**Optimization**:
1. Add semantic domain hint to cache key
2. Include query type (feature lookup, error analysis, etc.)
3. Separate cache regions for high/low complexity:
   ```
   cache_key = hash(domain_class + query_type + query_text)
   ```
4. Measure cache hit rate improvement

**Expected Impact**: +5-20% cache hit rate, <1% latency improvement

---

## Execution Plan (Days 1-7)

### Day 1: Query Collection & Annotation Setup
- **Task**: Collect 1,000 representative queries from Phase 111 traffic
- **Deliverable**: Query set, annotation template, rater instructions
- **Duration**: 4-6 hours

### Days 2-3: Manual Annotation
- **Task**: Two independent raters score top-5 results per query
- **Deliverable**: 1,000 queries × 5 results × 2 raters = 10,000 judgments
- **Duration**: 20-30 hours (5-8 hours/day)
- **Success Criteria**: Fleiss' kappa >0.70, <5% disagreement

### Day 4: Metrics Calculation & Analysis
- **Task**: Calculate NDCG/MAP/MRR overall and per-domain
- **Deliverable**: Baseline metrics, per-lane performance breakdown
- **Duration**: 2-4 hours

### Days 5-6: Optimization Design & A/B Testing
- **Task**: Identify top 3 optimization opportunities, design A/B tests
- **Deliverable**: Test plan, new weight profiles, lane reordering specs
- **Duration**: 4-6 hours

### Day 7: Results & Next Actions
- **Task**: Compile Phase 112 evaluation report
- **Deliverable**: Recommendations for Phase 113+, rollout priority
- **Duration**: 2-4 hours

---

## Success Criteria

✅ **Evaluation Completeness**:
- [ ] 1,000+ queries evaluated
- [ ] Fleiss' kappa >0.70 inter-rater agreement
- [ ] NDCG/MAP/MRR calculated overall and per-domain
- [ ] Per-lane performance analyzed

✅ **Optimization Identification**:
- [ ] Top 3 improvement opportunities identified
- [ ] Expected impact quantified (% NDCG improvement)
- [ ] A/B test designs documented
- [ ] Rollout priority determined

✅ **Readiness for Phase 113**:
- [ ] Baseline metrics established
- [ ] Domain-class tuning parameters defined
- [ ] Lane reordering specs drafted
- [ ] Cache optimization roadmap created

---

## Rollout Decision Framework

**After Phase 112 evaluation, decide on rollout priority**:

| Optimization | Expected Impact | Effort | Rollout Priority |
|---------------|-----------------|--------|------------------|
| Domain-class weights | +5-15% NDCG | 4 hours | **HIGH** |
| Lane reordering | +3-10% NDCG | 2 hours | **HIGH** |
| Cache refinement | +5-20% hit rate | 3 hours | **MEDIUM** |
| SOM re-optimization | +2-5% NDCG | 8 hours | **LOW** |

**Decision**: Deploy HIGH-priority optimizations first (combined +8-25% NDCG improvement expected in 6 hours).

---

## Metrics Dashboard

**Create real-time dashboard** at `/dashboard/phase-112-metrics`:

```
┌─────────────────────────────────────────────────────────┐
│ Phase 112: Evaluation Metrics Dashboard                  │
├─────────────────────────────────────────────────────────┤
│ Overall Performance:                                     │
│  ├─ NDCG@10: 0.65 (target: >0.65)                       │
│  ├─ MAP@10: 0.52 (target: >0.50)                        │
│  ├─ MRR: 0.68 (target: >0.60)                           │
│  └─ Cache hit rate: 78% (trend: ↑)                      │
├─────────────────────────────────────────────────────────┤
│ Per-Lane Performance:                                    │
│  ├─ Qdrant: NDCG 0.70, coverage 35%                     │
│  ├─ AST: NDCG 0.55, coverage 20%                        │
│  ├─ NLP: NDCG 0.58, coverage 18%                        │
│  ├─ HMM: NDCG 0.62, coverage 8%                         │
│  └─ PageRank: NDCG 0.64, coverage 12%                   │
├─────────────────────────────────────────────────────────┤
│ Top Opportunities:                                       │
│  1. Domain-class weight tuning (+12% NDCG expected)      │
│  2. Lane reordering (+6% NDCG expected)                  │
│  3. Cache refinement (+12% hit rate expected)            │
└─────────────────────────────────────────────────────────┘
```

---

## Files to Create

| File | Purpose | Owner |
|------|---------|-------|
| `scripts/atlas/phase-112-metrics-collector.mts` | Collect queries + calculate metrics | Claude |
| `scripts/atlas/phase-112-annotation-tool.mts` | Web UI for rater judgment | Claude |
| `docs/phase-112-evaluation-report.md` | Final results + recommendations | Claude |
| `.opencode/commands/p112-metrics.md` | OpenCode quick reference | Claude |

---

## Next Phase (Phase 113)

After Phase 112 evaluation complete:
- Deploy high-priority optimizations (domain weights, lane reordering)
- Begin Phase 113 unknown resolution pipeline
- Parallel tracking: A/B test results vs baseline
- Plan Phase 114 graphify automation

---

**Prepared by**: Claude Code (Session 142 Continuation)  
**Status**: 🚀 PHASE 112 READY FOR EXECUTION (after 24-hour Phase 111 monitoring)  
**Timeline**: Days 1-7 (concurrent Phase 111 production ops)
