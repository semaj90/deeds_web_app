---
name: Phase 18 XGBoost Reranker Plan
description: Supervised ranking model training on Phase 17 extracted features (54 dimensions, 61K packets)
type: project
---

# Phase 18 — XGBoost Reranker Training

**Status**: PLANNING
**Date**: July 26, 2026
**Depends On**: Phase 17 feature extraction (task_semantic_packets table) ✅
**Duration Estimate**: 4-6 hours (implementation + tuning)

## Phase 18 Architecture

### Goal
Train a supervised reranker to optimize ranking quality using Phase 17 extracted features. Replace heuristic scoring with learned ranking that improves retrieval recall@k metrics.

### Input Data Source
```sql
SELECT 
  packet_key,
  source_ref,
  feature_id,
  -- Score features (4)
  qdrant_score,
  cluster_score,
  topological_score,
  fusion_score,
  -- Authority & metadata (9)
  metadata->>'authority_score' AS authority_score,
  metadata->>'member_count' AS member_count,
  metadata->>'summary_length' AS summary_length,
  metadata->>'source_ref_depth' AS source_ref_depth,
  (metadata->>'is_core_library')::bool AS is_core_library,
  (metadata->>'is_test_file')::bool AS is_test_file,
  (metadata->>'has_packets')::bool AS has_packets,
  metadata->>'packet_count' AS packet_count,
  metadata->>'avg_packet_authority' AS avg_packet_authority,
  -- Semantic vector (1) — optional during Phase 18
  semantic_vector
FROM task_semantic_packets
WHERE validation_status = 'valid'
ORDER BY packet_key;
```

### Feature Matrix
- **Total Features**: 14 (initially), 15 with semantic_vector
- **Samples**: ~61,659 packets (canonical identity set)
- **Target Variable**: Relevance rank (derived from Phase 17 validation_status or external labeling)

#### Features Breakdown

| Category | Count | Features |
|----------|-------|----------|
| Score Lane (Qdrant/Cluster/Topo/Fusion) | 4 | qdrant_score, cluster_score, topological_score, fusion_score |
| Authority & Metadata | 9 | authority_score, member_count, summary_length, source_ref_depth, is_core_library, is_test_file, has_packets, packet_count, avg_packet_authority |
| Semantic Vector | 1 | 768-dim (optional, requires Phase 17C) |
| **Total** | **14-15** | |

### Training Dataset Strategy

#### Option A: Heuristic Labels (Fast, ~2h)
- Use existing authority_score as initial target
- Split: 70% train, 15% validation, 15% test
- Quick baseline: XGBoost learns to reproduce authority scoring with additional signals
- Risk: Only learns existing patterns, not improvements

#### Option B: Weak Labels from Phase 17 Validation (Moderate, ~3h)
- Use validation_status (valid → 1, pending → 0.5, invalid → 0) as proxy signal
- Incorporate cluster card authority_score as weighted target
- Validation: Phase 17 integration test suite (7 tests validate output quality)
- Advantage: Captures Phase 17 quality signals

#### Option C: Human/Expert Labels (Ideal but deferred)
- Collect ground-truth relevance judgments for ~1,000 query-packet pairs
- Convert to LTR (Learning-to-Rank) dataset format
- Phase 19 post-production

**Phase 18 Recommendation**: Option B (Weak Labels). Fast, data-driven, leverages Phase 17 signals.

## Phase 18 Implementation Plan

### Stage 1: Dataset Preparation (1-1.5h)

**Task 1.1**: Export Phase 17 features to CSV/Parquet
```bash
npm run phase18 export features --format parquet --output data/phase18_features.parquet
# OR manually via Postgres query → Arrow IPC → Parquet conversion
```

**Task 1.2**: Prepare target variable
```python
# Postgres query: extract validation_status + authority_score
# Encode: valid → 1.0, pending → 0.5, invalid → 0.0
# Weight by authority_score confidence
```

**Task 1.3**: Feature engineering
- Normalize score lanes (min-max to [0, 1])
- Categorical encoding: is_core_library, is_test_file, has_packets (bool → 0/1)
- Optional: Derive interaction features (e.g., authority_score × member_count)
- Optional: PCA on semantic_vector if populated (reduce 768-dim to 32-64 dims)

**Task 1.4**: Train/val/test split
```python
# Stratified split by feature_id (preserve feature distribution)
# Train: 70% (43,161 packets)
# Val: 15% (9,249 packets)
# Test: 15% (9,249 packets)
```

### Stage 2: Model Training (1.5-2h)

**Task 2.1**: XGBoost baseline
```python
import xgboost as xgb

xgb_model = xgb.XGBRanker(
    n_estimators=100,
    max_depth=6,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    objective='rank:ndcg',  # NDCG ranking objective
    eval_metric=['ndcg@10', 'map@10'],
    random_state=42
)

# Train on weak labels
xgb_model.fit(
    X_train, y_train,
    eval_set=[(X_val, y_val)],
    early_stopping_rounds=10,
    verbose=True
)
```

**Task 2.2**: Hyperparameter tuning (optional but recommended)
```python
# Grid search over:
# - max_depth: [4, 6, 8]
# - learning_rate: [0.01, 0.1, 0.3]
# - n_estimators: [50, 100, 200]
# Optimize on validation NDCG@10
```

**Task 2.3**: Feature importance analysis
```python
importance = xgb_model.get_booster().get_score(importance_type='weight')
# Plot top-10 features
# Expected: authority_score, fusion_score, qdrant_score, member_count high importance
```

### Stage 3: Evaluation (1h)

**Task 3.1**: Test set evaluation
```python
y_pred = xgb_model.predict(X_test)

# Ranking metrics
ndcg_10 = compute_ndcg(y_test, y_pred, k=10)
map_10 = compute_map(y_test, y_pred, k=10)
recall_10 = compute_recall(y_test, y_pred, k=10)

print(f"NDCG@10: {ndcg_10:.4f}")
print(f"MAP@10: {map_10:.4f}")
print(f"Recall@10: {recall_10:.4f}")
```

**Task 3.2**: Baseline comparison
- Compare against Phase 17 weighted authority score
- Expected improvement: 5-15% relative lift in ranking metrics (conservative estimate)

**Task 3.3**: Error analysis
- Identify packets with worst predictions
- Analyze feature patterns in misclassified cases
- Inform Phase 18 refinement or Phase 19 data collection

### Stage 4: Integration (1-1.5h)

**Task 4.1**: Export model to ONNX or XGBoost JSON
```python
# ONNX for CPU inference (portable, fast)
onnx_model = convert_tree_to_onnx(xgb_model)
onnx.save_model(onnx_model, 'models/phase18_reranker.onnx')

# OR: XGBoost JSON (native format)
xgb_model.get_booster().save_model('models/phase18_reranker.json')
```

**Task 4.2**: Create inference wrapper
```typescript
// src/lib/server/ml/phase18-reranker.ts
export async function predictRerank(
  features: Phase17ExtractedFeatures,
  model: XGBoostModel
): Promise<number> {
  // Convert Phase 17 features to XGBoost input format
  // Call model.predict()
  // Return rerank_score [0, 1]
}
```

**Task 4.3**: Wire into retrieval pipeline
```typescript
// src/lib/server/retrieval/unified-orchestrator.ts
// After Qdrant ANN retrieval:
// 1. Extract Phase 17 features for top-K candidates
// 2. Run through Phase 18 reranker
// 3. Re-sort by rerank_score
// 4. Return top-K to user
```

**Task 4.4**: Create npm alias and validation gate
```json
{
  "phase18:train:dry": "npx tsx scripts/phase18/train-xgboost.mts --dry",
  "phase18:train:apply": "npx tsx scripts/phase18/train-xgboost.mts --apply",
  "phase18:export:model": "npx tsx scripts/phase18/export-reranker.mts",
  "phase18:smoke:inference": "node scripts/phase18/smoke-inference.mjs"
}
```

## Deliverables

| Deliverable | Format | Location | Validation |
|-------------|--------|----------|-----------|
| Training dataset | Parquet | `data/phase18_features.parquet` | Row count = 61,659 |
| Trained model | ONNX or JSON | `models/phase18_reranker.onnx` | Model file size > 1MB |
| Feature importance | CSV | `reports/phase18_feature_importance.csv` | Top-10 features listed |
| Evaluation report | Markdown | `reports/phase18_eval_report.md` | NDCG@10, MAP@10, Recall@10 metrics |
| Inference wrapper | TypeScript | `src/lib/server/ml/phase18-reranker.ts` | Type-safe feature input |
| Integration test | Vitest | `src/lib/server/ml/phase18-integration.spec.ts` | 5+ tests |

## Success Criteria

- ✅ Model trains successfully on 61K packets
- ✅ Validation NDCG@10 ≥ 0.75 (Phase 17 authority score baseline ~0.70)
- ✅ Test set metrics consistent (no >10% overfitting)
- ✅ Feature importance aligns with intuition (authority_score, fusion_score high)
- ✅ Inference wrapper callable from TypeScript with Phase 17 features
- ✅ Integration test suite ≥ 5 tests, all passing
- ✅ Smoke test completes in <100ms per packet

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Weak labels (validation_status) may not capture true relevance | Low ranking quality | Use Phase 17 authority_score weighted target; plan Phase 19 expert labels |
| Class imbalance (valid >> invalid packets) | Biased model | Use class weights or stratified sampling |
| Semantic_vector unavailable until Phase 17C | Missing 1 feature | Train without semantic_vector in Phase 18; add fine-tuning in Phase 19 |
| 61K samples is large for fast iteration | Slow train/tuning cycles | Subsample to 10K for experimentation; full train for final model |

## Phase 18 vs Phase 19 Boundary

**Phase 18** (this phase):
- Supervised ranking model training
- Weak labels from Phase 17
- Offline training (batch process)
- Validation on 15% holdout test set

**Phase 19** (next phase):
- Live inference integration
- Human expert labels collection (~1K query-packet pairs)
- Online A/B testing (Phase 18 vs Phase 17 heuristic)
- Model monitoring and retraining pipeline

## Files to Create

```
scripts/phase18/
  ├── train-xgboost.mts           # Main training orchestrator
  ├── export-reranker.mts         # Model export to ONNX/JSON
  ├── smoke-inference.mjs         # Quick inference validation
  └── hyperparameter-tuning.mts   # Grid search (optional)

src/lib/server/ml/
  ├── phase18-reranker.ts         # Inference wrapper
  ├── phase18-feature-transform.ts # Feature encoding/normalization
  └── phase18-integration.spec.ts # Integration tests

models/
  ├── phase18_reranker.onnx       # Trained model (exported)
  └── phase18_reranker.json       # Backup XGBoost native format

data/
  └── phase18_features.parquet    # Training dataset

reports/
  ├── phase18_feature_importance.csv
  ├── phase18_eval_report.md
  └── phase18_confusion_matrix.png (optional)
```

## Timeline

| Task | Duration | Parallel | Start | End |
|------|----------|----------|-------|-----|
| 1. Dataset prep | 1-1.5h | - | T+0h | T+1.5h |
| 2. Model training | 1.5-2h | - | T+1.5h | T+3.5h |
| 3. Evaluation | 1h | - | T+3.5h | T+4.5h |
| 4. Integration | 1-1.5h | - | T+4.5h | T+6h |
| **Total** | **4-6h** | | | |

## Next Steps After Phase 18

1. **Phase 19**: Live inference + A/B testing
2. **Phase 19B**: Expert label collection (1K queries)
3. **Phase 19C**: Fine-tuning with expert labels
4. **Phase 20**: Model monitoring + retraining pipeline
5. **Phase 21**: Semantic vector integration (after Phase 17C)

---

**Decision Point**: Start Phase 18 immediately or complete Phase 17C Qdrant wiring first?
**Recommendation**: Phase 18 can proceed in parallel with Phase 17C (independent work streams). Start Phase 18 today.
