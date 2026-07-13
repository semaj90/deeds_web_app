# Phase 8: Multi-Lane Feature Development Plan

**Status**: Ready to execute (measurement boundary validated in Phase 2F1)
**Date**: July 13, 2026
**Baseline**: XGBoost v2 with domain_class (NDCG@5: 0.612, Recall@20: 0.791, MRR: 0.508)

---

## Executive Summary

Phase 8 runs three independent feature lanes in parallel, each adding new ranking signals:

1. **Lane A: Semantic Packets** (2-3 days)
   - Extract semantic concepts from chunk summaries
   - Build concept graphs in Neo4j
   - Add concept_similarity feature to FeatureEnvelope

2. **Lane B: Tree Hierarchy** (2-3 days)
   - Build directory/file/function hierarchy tree
   - Add tree_depth, tree_siblings, tree_path_similarity features
   - Leverage AST structure for better ranking

3. **Lane C: TurboVec Load** (1-2 days)
   - Load TurboVec 4-bit quantized embeddings
   - Add turbo_similarity feature (4-bit × query 768d)
   - Parallel fast path for large-scale retrieval

**Combined**: 5-8 days, ~30-50 hours estimated effort

---

## Lane A: Semantic Packets (2-3 days, ~12-15 hours)

### Tasks

#### A1: Concept Extraction (4 hours)
- File: `phase-8a-concept-extraction.mts`
- Input: `codebase_chunk_index.summary` + chunk text
- Method: Keyword extraction (TF-IDF) + Gemma4 semantic grounding
- Output: `atlas_concepts` table (concept_id, name, definition, embedding_384)
- Target: 5K-10K unique concepts across 40.7K chunks

#### A2: Concept Graph Construction (3 hours)
- File: `phase-8a-concept-graph.mts`
- Input: `atlas_concepts` + chunk-to-concept mappings
- Method: Co-occurrence edges (chunks sharing concepts)
- Output: Neo4j `CONCEPT` nodes + `APPEARS_IN` edges
- Target: 30K-50K edges capturing semantic structure

#### A3: Concept Similarity Features (4 hours)
- File: `phase-8a-concept-similarity-features.mts`
- Input: Query + candidates + concept graph
- Method: Concept overlap scoring + graph distance
- Output: concept_similarity feature (0.0-1.0)
- Target: Add to FeatureEnvelope for all 58K packets

#### A4: Semantic Lane Testing (2 hours)
- File: `tests/phase-8a-semantic-lane.spec.ts`
- Validation: Concept extraction accuracy, graph connectivity, feature range [0,1]
- Dry-run: Verify no regressions on baseline_v1 test set

### Expected Impact
- NDCG@5: +3-5% (semantic signals help ranking)
- Recall@20: +2-3%
- New features: concept_similarity (1 feature)
- Cumulative: xgboost_v3_semantic (7 total features)

---

## Lane B: Tree Hierarchy (2-3 days, ~12-15 hours)

### Tasks

#### B1: Directory Tree Builder (3 hours)
- File: `phase-8b-directory-tree.mts`
- Input: `atlas_packets.source_ref` (directory paths)
- Method: Build hierarchical directory tree
- Output: `atlas_directory_tree` table (node_id, parent_id, depth, path)
- Target: ~2K directory nodes with relationships

#### B2: File Position Scoring (3 hours)
- File: `phase-8b-file-position-scoring.mts`
- Input: Query context + directory tree
- Method: Tree depth scoring + sibling proximity + path similarity
- Output: tree_depth, tree_siblings, tree_path_similarity features
- Target: 0.0-1.0 range for each feature

#### B3: Function Symbol Hierarchy (2 hours)
- File: `phase-8b-function-symbol-hierarchy.mts`
- Input: AST symbols + tree_node_id (from Phase 2A)
- Method: Function call graph from imports
- Output: symbol_depth, symbol_callers, symbol_locality features

#### B4: Tree Lane Testing (2 hours)
- File: `tests/phase-8b-tree-lane.spec.ts`
- Validation: Tree depth ranges [0,10], sibling counts [0,100], path similarity [0,1]
- Dry-run: Verify no regressions on baseline test set

### Expected Impact
- NDCG@5: +2-4% (proximity signals help)
- Recall@20: +1-2%
- New features: tree_depth, tree_siblings, tree_path_similarity (3 features)
- Cumulative: xgboost_v4_tree (10 total features)

---

## Lane C: TurboVec Load (1-2 days, ~6-10 hours)

### Tasks

#### C1: TurboVec Embedding Import (2 hours)
- File: `phase-8c-turbovec-import.mts`
- Input: TurboVec 4-bit quantized embeddings (if available)
- Method: Load vectors into Postgres `latent_64` column (reserved in schema)
- Output: `codebase_chunk_index.latent_64` populated for 40.5K chunks
- Fallback: Skip if TurboVec not available; use mock 64-dim embeddings

#### C2: TurboVec Similarity Scoring (2 hours)
- File: `phase-8c-turbovec-similarity.mts`
- Input: Query embedding (768d) + candidate latent embeddings (64d)
- Method: Autoencoder expand (64d → 768d) + cosine similarity
- Output: turbo_similarity feature (0.0-1.0)
- Target: All 40.5K chunks scored

#### C3: TurboVec Batch Processing (2 hours)
- File: `phase-8c-turbovec-batch.mts`
- Input: Query + top 100 candidates from Qdrant
- Method: Parallel batch scoring (GPU if available)
- Output: turbo_similarity scores for reranking
- Target: <50ms per query for 100 candidates

#### C4: TurboVec Lane Testing (2 hours)
- File: `tests/phase-8c-turbovec-lane.spec.ts`
- Validation: Feature range [0,1], batch latency <100ms, no NaNs
- Dry-run: Verify graceful fallback if TurboVec unavailable

### Expected Impact
- NDCG@5: +1-3% (if TurboVec available)
- Recall@20: +1-2%
- New features: turbo_similarity (1 feature)
- Cumulative: xgboost_v5_turbovec (11 total features)

---

## Training Plan (Parallel Execution)

### Week 1 (Lanes A & B in parallel)
```
Day 1-2: Lane A (concept extraction + graph) + Lane B (directory tree)
Day 3:   Lane A (similarity features) + Lane B (function symbols)
Day 4:   Test both lanes, dry-run on baseline test set
```

### Week 2 (Lane C + Integration)
```
Day 5:   Lane C (TurboVec import + scoring)
Day 6:   Test Lane C, integrate all lanes
Day 7:   Train xgboost_v3/v4/v5 models with cumulative features
Day 8:   Comparison: baseline → v3 → v4 → v5 metric progression
```

### Expected Deliverables
- 3 new FeatureEnvelope versions with 7/10/11 features
- 3 trained XGBoost models (v3_semantic, v4_tree, v5_turbovec)
- Metric progression showing cumulative gains
- Dry-run test suites (0 regressions)

---

## Success Criteria

### Measurement Boundary (Proven ✅)
- ✅ Gate 1: Per-query label diversity sufficient
- ✅ Gate 2: Feature-grade correlation 0.909
- ✅ Gate 3: 137 queries with realistic variance
- ✅ Gate 4: Baseline → v2 shows 6.2% improvement (validates framework)

### Phase 8 Criteria
- Lane A: Concept extraction >90% accuracy, graph has >10K edges
- Lane B: Tree depth ranges [0,12], no orphaned nodes
- Lane C: TurboVec scores [0,1], <50ms latency per query
- All lanes: No regressions on baseline test set (Recall@20 ≥ 0.791)
- Integration: xgboost_v5 NDCG@5 ≥ 0.68 (cumulative +11% from baseline)

---

## Risk Mitigation

### Risk: Concept extraction produces noise
- Mitigation: Use Gemma4 semantic grounding + manual validation on 100 samples
- Fallback: Use only TF-IDF without LLM grounding

### Risk: Tree hierarchy too deep (causes overfitting)
- Mitigation: Cap tree_depth at 12, normalize features to [0,1]
- Fallback: Use only directory-level hierarchy, skip function symbols

### Risk: TurboVec vectors unavailable or corrupted
- Mitigation: Graceful fallback to mock 64-dim embeddings
- Fallback: Skip Lane C, proceed with Lanes A & B only

### Risk: Feature engineering causes curse of dimensionality
- Mitigation: Use Lasso/Ridge regularization in XGBoost (alpha=1.0)
- Mitigation: Track validation NDCG to detect overfitting

---

## Execution Checklist

### Pre-Flight (Today)
- [ ] Review Phase 8 plan with team
- [ ] Verify baseline XGBoost v2 metrics (baseline for comparison)
- [ ] Set up evaluation logging (log v3/v4/v5 metrics)
- [ ] Create feature branch `phase-8-multi-lane`

### Lane A: Semantic Packets
- [ ] A1: Extract concepts (TF-IDF + Gemma4)
- [ ] A2: Build concept graph (Neo4j CONCEPT nodes)
- [ ] A3: Add concept_similarity feature
- [ ] A4: Dry-run test (no regressions)

### Lane B: Tree Hierarchy
- [ ] B1: Build directory tree
- [ ] B2: Score tree position features
- [ ] B3: Add function symbol hierarchy
- [ ] B4: Dry-run test (no regressions)

### Lane C: TurboVec Load
- [ ] C1: Import TurboVec embeddings
- [ ] C2: Score turbo_similarity feature
- [ ] C3: Batch processing optimization
- [ ] C4: Dry-run test (graceful fallback)

### Integration & Training
- [ ] Combine all lanes → xgboost_v3/v4/v5
- [ ] Train models on evaluation_splits
- [ ] Compare metrics: baseline → v3 → v4 → v5
- [ ] Commit Phase 8 (feature flags for each lane)
- [ ] Document feature importance (which features help most)

---

## Next Steps

1. **Today**: Review plan, create feature branch
2. **Week 1**: Execute Lanes A & B (8-12 hours each)
3. **Week 2**: Execute Lane C + integrate + train (6-10 hours)
4. **Week 3**: Phase 9 (ACE context assembly) + Phase 10 (production optimization)

---

## References

- Baseline XGBoost v2: NDCG@5 0.612, Recall@20 0.791, MRR 0.508
- Measurement boundary: ✅ Validated (domain_class feature proves framework works)
- Feature envelope schema: 6 features (v2) → 7 (v3) → 10 (v4) → 11 (v5)
- Evaluation framework: evaluation_runs, evaluation_results tables + stratified splits
