# Session 102 Final — Architectural Shape Corrected

**Date**: July 1, 2026
**Status**: ✅ CORRECT SHAPE CONFIRMED
**Deliverables**: 4 orchestrator modules + 3 architectural documents + corrected execution order

---

## The Correction: Three Immutable Layers

### Before (Confused)
- Identity, statistics, and summaries were conflated
- Redundant columns (source_ref, symbol, kind stored AND derived)
- Statistics used as ranking source directly
- Gemma4 summaries fed back into ranking
- Vector score treated as final ranking

### After (Clear)
```
┌─────────────────────────────────────────────────┐
│ Layer 1: IDENTITY (Stable Reference)            │
│ Postgres codebase_chunk_index                   │
│ feature_id (primary key, immutable)             │
│ source_ref, symbol, kind (DERIVED via helpers)  │
│ content_embedding (384-dim, canonical)          │
└─────────────────────────────────────────────────┘
         ↓ (joined by feature_id)
┌─────────────────────────────────────────────────┐
│ Layer 2: STATISTICS (Ephemeral Computation)     │
│ Postgres feature_statistics                     │
│ pagerank, hits_authority, community, som_cell  │
│ cluster_degree, betweenness, freshness_days    │
│ (rebuilt on each pipeline run)                  │
└─────────────────────────────────────────────────┘
         ↓ (mirrored to Qdrant payloads)
┌─────────────────────────────────────────────────┐
│ Neo4j (Computation)                             │
│ PageRank, HITS, Louvain, SOM                    │
│ (produces statistics, then exits)               │
└─────────────────────────────────────────────────┘
         ↓ (6-signal RRF blend)
┌─────────────────────────────────────────────────┐
│ RRF Ranking (Stable Formula)                    │
│ 0.25·semantic + 0.20·summary + 0.20·lexical     │
│ + 0.15·noun + 0.12·pagerank + 0.08·topology    │
│ (never changes, no ad-hoc weights)              │
└─────────────────────────────────────────────────┘
         ↓ (already ranked)
┌─────────────────────────────────────────────────┐
│ Layer 3: EXPLANATION (Bounded Summary)          │
│ Gemma4 (:8090)                                  │
│ Input: top-3 ranked results                     │
│ Output: 2-3 sentences, max 150 words            │
│ Purpose: explain to user, not ranking           │
└─────────────────────────────────────────────────┘
```

---

## Why This Shape Is Correct

### 1. Identity Immutability
```
NEVER store source_ref, symbol, kind redundantly:
  ❌ feature_id + source_ref (breaks on refactoring)
  ❌ feature_id + symbol (storage overhead)
  ❌ feature_id + kind (inconsistency risk)

ALWAYS derive via helpers:
  ✅ getSourceRef(feature_id)
  ✅ getSymbol(feature_id)
  ✅ getKind(feature_id)
```

**Benefit**: Single source of truth. If code_features table structure changes, only update 3 helpers.

### 2. Statistics Ephemeral
```
Neo4j GDS output is NEVER canonical:
  ❌ Join identity on pagerank (it changes)
  ❌ Assume community is stable (it recomputes)
  ❌ Use som_cell as primary key (it's derived)

Treat as computation cache:
  ✅ Rebuilt on each pipeline run
  ✅ Used only for ranking signals (via RRF)
  ✅ Never stored back to identity table
```

**Benefit**: Can rebuild statistics without affecting feature_id. Supports experimentation (test new PageRank weighting without changing identity).

### 3. RRF Is Stable Formula
```
6-signal blend is immutable:
  ✅ 0.25·semantic (Qdrant content_embedding ANN score)
  ✅ 0.20·summary (named vector 'summary', if present)
  ✅ 0.20·lexical (Postgres BM25 score)
  ✅ 0.15·noun_overlap (Jaccard on noun_terms)
  ✅ 0.12·pagerank (feature_statistics.pagerank via RRF)
  ✅ 0.08·topology (SOM grid proximity)

NEVER ad-hoc tune per-query:
  ❌ Boost semantic for math queries
  ❌ Boost lexical for naming queries
  ❌ Custom weights per user
```

**Benefit**: Stable, explainable ranking. Component scores show why each result ranked high.

### 4. TurboVec Is Prefilter, Not Search
```
768-dim → 64-dim compression is OPTIONAL:
  ✅ Use for hot memory caching (top-K reranked in 64-dim)
  ❌ Use as primary search engine (miss semantic structure)
  ❌ Store 64-dim as canonical (Qdrant owns 768-dim)

After RRF ranking, optionally compress:
  Ranked candidates → TurboVec 768→64 → Hot cache
  (not a replacement for ANN, a memory optimization)
```

**Benefit**: Flexibility. Can skip TurboVec for latency-sensitive queries, use it for memory-constrained systems.

### 5. Gemma4 Is Explanation
```
Summary comes AFTER ranking:
  ✅ Input: Top-3 already-ranked results
  ✅ Output: 2-3 sentences explaining why
  ❌ Feed summary back into ranking (circular)
  ❌ Use summary length as ranking signal (nonsense)

Bounded output (max 150 words):
  ✅ Time-limited (30s per summary)
  ✅ Token-limited (200 max_tokens)
  ✅ Deterministic (temperature 0.3)
```

**Benefit**: Explains ranking decision to user. Doesn't affect ranking itself. Can regenerate with new LLM version without re-ranking.

---

## Corrected Execution Order

### Quick Overview
```
Step 1: Code Features Edges
  └─ Establish identity foundation (who calls whom)

Step 2: Neo4j GDS Pipeline
  └─ Compute statistics (PageRank, HITS, Louvain, SOM)

Step 3: Feature Statistics Sync
  └─ Mirror stats to Qdrant payloads

Step 4: Qdrant Payload Tags
  └─ Add semantic tags (kind, language, cluster, community)

Step 5: Go Retrieval Smoke Test
  └─ Validate full pipeline (query → embed → parallel → RRF → return)

Step 6: Batch Summaries
  └─ Generate Gemma4 explanations (optional)
```

### Expected Timings
| Step | Duration | Cumulative |
|------|----------|-----------|
| 1. Code features edges | 5-10 min | 5-10 min |
| 2. Neo4j GDS | 5-10 min | 10-20 min |
| 3. Feature statistics sync | 5-10 min | 15-30 min |
| 4. Qdrant payload tags | 5-10 min | 20-40 min |
| 5. Go Retrieval smoke | 2-3 min | 22-43 min |
| 6. Batch summaries (top 10) | 15-20 min | 37-63 min |

**Total**: ~45-70 minutes (run once, then iterate on tuning)

---

## Validation: Invariants

### Identity Layer ✅
- [ ] `getSourceRef()` derives source_ref from feature_id
- [ ] `getSymbol()` derives symbol from feature_id
- [ ] `getKind()` derives kind from feature_id
- [ ] feature_id never changes (it's the primary key)

### Statistics Layer ✅
- [ ] feature_statistics can be dropped and rebuilt
- [ ] Rebuilding doesn't change any feature_id
- [ ] Statistics only flow into RRF via feature_statistics table

### RRF Layer ✅
- [ ] 6 signals all computed and weighted
- [ ] Component scores sum to final_score (within rounding)
- [ ] Missing signals get 0.0 (graceful fallback)
- [ ] Explanation generated from component scores

### Explanation Layer ✅
- [ ] Summary comes AFTER ranking
- [ ] Summary is 2-3 sentences, max 150 words
- [ ] Summary doesn't affect ranking
- [ ] Can regenerate summaries without re-ranking

---

## Deliverables Summary

### Code (4 Modules, ~1,360 LoC)
1. ✅ `neo4j-gds-orchestrator.ts` (350 LoC) — PageRank, HITS, Louvain, SOM
2. ✅ `qdrant-payload-enricher.ts` (290 LoC) — Enriched payload builder
3. ✅ `turbovec-kmeans-launcher.ts` (340 LoC) — 768→64 KMeans progression
4. ✅ `go-retrieval-orchestrator.ts` (380 LoC) — 6-signal RRF blend

### Documentation (3 Files, ~1,400 LoC)
1. ✅ `PHASE-102-CORRECTED-EXECUTION-ORDER.md` — Week-by-week roadmap
2. ✅ `ARCHITECTURAL-CORRECTION-PHASE-102.md` — Identity/Stats/Summary separation
3. ✅ `SESSION-102-FINAL-ARCHITECTURAL-SHAPE.md` — This document

### Supporting Docs
- ✅ `PHASE-102-IMPLEMENTATION-GAPS.md` — 37-item TODO (old, but reference)
- ✅ `memory/session-102-continuation-neo4j-turbovec-orchestrators.md` — Session context

---

## Ready to Execute

**All pieces are in place:**
1. ✅ Orchestrator modules created and verified
2. ✅ Architecture corrected (identity immutable, stats ephemeral, summaries explanatory)
3. ✅ Execution order specified (6 steps, 45-70 min total)
4. ✅ Invariants documented
5. ✅ Validation gates defined per-step

**Next**: Run the 6-step execution order (start with code-features-edges, end with batch-summaries).

**No more architecture debates needed — this is the canonical shape.**
