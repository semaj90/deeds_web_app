# Phase 17-18 Current State Audit — IMPLEMENTATION FOUND ✅

**Date**: July 26, 2026  
**Status**: ✅ **EXISTING IMPLEMENTATION DISCOVERED** (not greenfield)  
**Quality**: ⏳ **Requires Upgrade** (fallback-heavy, limited feature extraction)

---

## Executive Summary

Phase 17 (PyTorch Feature Extractor) and Phase 18 (XGBoost Reranker) **already exist** in the codebase with:

- ✅ Working JavaScript/Python dual-layer architecture
- ✅ Graceful fallback chains (Python → JavaScript)
- ✅ CLI tooling with proper argument parsing
- ⚠️ **Limited feature extraction** (current: 5 signals only)
- ⚠️ **No integration with Phase 10-19 reconciliation** (alias_id, feature_id, score profiles)
- ⚠️ **No upstream GPU acceleration** (PyTorch used only for RNG seed, not ML features)

---

## Current Implementation Details

### Phase 17: PyTorch Feature Extractor

**File**: `scripts/atlas/phase17-pytorch-feature-extractor.mjs` (146 lines)  
**Python Script**: `scripts/atlas/phase17_feature_extractor.py` (110 lines)

**Current Pipeline**:
1. **Input**: JSONL file (schema-indexer-contract-cards) with card metadata
2. **Processing**:
   - Parse each card (cardId, sourceRefs, entities)
   - Classify lane (schema_contract vs untracked_local)
   - **IF PyTorch available**: Generate deterministic random vector (768-dim, seeded by card ID hash)
   - **IF PyTorch unavailable**: Skip to JS fallback
3. **Output**: JSONL with card + feature vector reference
4. **Fallback**: JavaScript heuristics if Python fails

**Current Feature Signals** (5 total):
```typescript
signals: {
  has_sourceRef: boolean,           // Is sourceRef present?
  has_schema_contract: boolean,     // Does cardId start with "schema"?
  has_mcp_route: boolean,           // (Always false, placeholder)
  is_untracked_local: boolean,      // Inverse of schema_contract
  embedding_available: boolean,     // Did we write a .npy file?
}
```

**Limitations**:
- ❌ No semantic feature extraction
- ❌ No use of Phase 10-19 reconciliation (ClusterCard scores, etc.)
- ❌ Random vectors (768-dim) are deterministic but meaningless for ranking
- ❌ No connection to Qdrant/Cluster/Topological score profiles
- ❌ No feature_id validation or alias_id threading

### Phase 18: XGBoost Reranker

**File**: `scripts/atlas/phase18-xgboost-reranker.mjs` (varies, >100 lines)  
**Python Script**: `scripts/atlas/phase18_xgboost_reranker.py` (to read)

**Current Pipeline**:
1. **Input**: JSONL from Phase 17 (card_id, sourceRef, lane, feature_vector_ref)
2. **Processing**:
   - **IF XGBoost available**: Train/load model, predict scores
   - **IF XGBoost unavailable**: JS heuristics (card_id.length % 100 / 100)
3. **Output**: JSONL with rank_reason, recommended_action, risk_notes
4. **Fallback**: JavaScript ranking if Python fails

**Current Ranking Logic** (JS fallback):
```typescript
score = (card_id.length % 100) / 100;  // Heuristic based on ID length
action = score > 0.6 ? 'index' : 'review';
```

**Limitations**:
- ❌ XGBoost model not found/trained (falls back to JS)
- ❌ No real ML ranking
- ❌ No use of Phase 17 features (ignores feature_vector_ref)
- ❌ No integration with Phase 10-19 score fusion

---

## Gap Analysis: Phase 10-19 vs Current Phase 17-18

| Requirement (Phase 10-19) | Current (Phase 17) | Current (Phase 18) | Status |
|---|---|---|---|
| Accept reconciled retrieval result | ❌ NO | ❌ NO | MISSING |
| Thread alias_id through | ❌ NO | ❌ NO | MISSING |
| Use Qdrant score (0.4 weight) | ❌ NO | ❌ NO | MISSING |
| Use Cluster score (0.35 weight) | ❌ NO | ❌ NO | MISSING |
| Use Topological score (0.25 weight) | ❌ NO | ❌ NO | MISSING |
| Compute fusion score | ❌ NO | ❌ NO | MISSING |
| Validate feature_id/sourceRef consistency | ❌ NO | ❌ NO | MISSING |
| Extract real ML features | ⚠️ PARTIAL | ❌ NO | PARTIAL |
| Write to task_semantic_packets | ❌ NO | ❌ NO | MISSING |

---

## Upgrade Plan (4-6 hours)

### Phase 17 Upgrade Steps

#### Step 1: Wire Reconciliation Input (30 min)
**Goal**: Accept `ReconciliationResult` instead of raw cards

```typescript
// OLD: Read from schema-indexer-contract-cards.jsonl
// NEW: Call reconcileRetrievalLoop() on prompt result

import { reconcileRetrievalLoop } from '$lib/server/retrieval/retrieval-loop-reconciliation';

interface PhaseInput {
  promptQuery: string;
  aliasId: string;
}

const reconciled = await reconcileRetrievalLoop({
  query: promptQuery,
  selectedCards: [],
  sourceRefs: [],
  featureIds: [],
  latencyMs: 0,
  fallbackReason: null,
  aliasId,
});
```

**Deliverable**: Updated Phase 17 input interface

#### Step 2: Extract Real Features from Reconciliation (2 hours)
**Goal**: Replace random vectors with actual feature extraction

```python
# NEW feature extraction pipeline:
# For each reconciled clusterCard:

features = {
    # From Phase 10-19 reconciliation
    'qdrant_score': reconciled.scoreProfile.qdrant,
    'cluster_score': reconciled.scoreProfile.cluster,
    'topological_score': reconciled.scoreProfile.topological,
    'fusion_score': reconciled.scoreProfile.fusion,
    
    # From clusterCard metadata
    'authority_score': clusterCard.authorityScore,
    'member_count': clusterCard.memberCount,
    'summary_length': len(clusterCard.clusterSummary or ''),
    
    # From sourceRef analysis
    'sourceRef_depth': sourceRef.count('/'),
    'is_core_library': sourceRef.startswith('src/lib/'),
    'is_test_file': '/test' in sourceRef or '.spec.' in sourceRef,
    
    # From packet reconciliation
    'has_packets': len(reconciled.packets) > 0,
    'packet_count': len(reconciled.packets),
    'avg_packet_authority': mean([p.authority for p in reconciled.packets]),
}

# Create semantic vector by concatenating normalized features
# [qdrant, cluster, topo, fusion, authority, members, summary_len, depth, core, test, has_packets, count, avg_auth]
feature_vector = normalize([
    scores.qdrant,
    scores.cluster, 
    scores.topological,
    scores.fusion,
    clusterCard.authorityScore,
    log(clusterCard.memberCount + 1),
    min(len(clusterCard.clusterSummary or '') / 1000, 1.0),
    min(sourceRef.count('/') / 10, 1.0),
    float(is_core_library),
    float(is_test_file),
    float(has_packets),
    min(packet_count / 10, 1.0),
    avg_packet_authority,
])
```

**Deliverable**: Real feature extraction (13 dimensions)

#### Step 3: Thread alias_id and feature_id (1 hour)
**Goal**: Ensure identity consistency

```typescript
// Update output schema:
{
  packet_key: sha256(sourceRef + featureId),
  alias_id: reconciled.aliasId,  // FROM PHASE 10-19
  feature_id: extractFeatureId(clusterCard),  // NEW
  feature_label: extractFeatureLabel(clusterCard),
  extracted_features: {
    qdrant_score: reconciled.scoreProfile.qdrant,
    cluster_score: reconciled.scoreProfile.cluster,
    topological_score: reconciled.scoreProfile.topological,
    fusion_score: reconciled.scoreProfile.fusion,
    metadata: { /* 13 features computed above */ },
  },
  validation_status: 'valid',
  error_message: null,
}
```

**Deliverable**: Updated Phase 17 output schema

#### Step 4: Error Handling & Fallback (1 hour)
**Goal**: Add 3-tier fallback chain

```typescript
try {
  // Tier 1: Full feature extraction with reconciliation
  return await extractWithReconciliation(promptResult);
} catch (err) {
  console.warn('[Phase17] Reconciliation failed:', err);
}

try {
  // Tier 2: Feature extraction without reconciliation (use schema-indexer only)
  return await extractWithoutReconciliation(promptResult);
} catch (err) {
  console.warn('[Phase17] Feature extraction failed:', err);
}

try {
  // Tier 3: Basic heuristics (existing JS fallback)
  return await jsHeuristics(promptResult);
} catch (err) {
  console.warn('[Phase17] All methods failed, returning empty features');
  return {
    packet_key: generateKey(sourceRef, featureId),
    alias_id,
    feature_id: featureId,
    extracted_features: { fusion_score: 0.5 },
    validation_status: 'pending',
  };
}
```

**Deliverable**: 3-tier fallback chain

### Phase 18 Upgrade Steps

#### Step 1: Accept Phase 17 + Reconciliation Output (30 min)
**Goal**: Use Phase 17 features instead of ignoring them

```typescript
interface Phase18Input {
  phase17Features: Phase17Output[];
  reconciliation: ReconciliationResult;
  trainMode?: boolean;  // If true, attempt to train XGBoost
}
```

**Deliverable**: Updated Phase 18 input interface

#### Step 2: Implement Real XGBoost Ranking (2-3 hours)
**Goal**: Use Phase 17 features for ranking

```python
import xgboost as xgb

# Feature matrix from Phase 17:
# X = [qdrant, cluster, topo, fusion, authority, members, summary_len, depth, core, test, has_packets, count, avg_auth]
# y = expert_labels (0=reject, 1=review, 2=index, 3=priority)

if TRAIN_MODE and has_training_data():
    # Split 80/20 train/test
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)
    
    # Train XGBoost
    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=6,
        learning_rate=0.1,
        objective='multi:softproba',  # Multi-class classification
    )
    model.fit(X_train, y_train)
    
    # Save model
    model.save_model('models/phase18_xgboost_rank.json')
else:
    # Load pre-trained model or use fallback
    try:
        model = xgb.XGBClassifier()
        model.load_model('models/phase18_xgboost_rank.json')
    except FileNotFoundError:
        return jsFallback(features)  # Use JS heuristics

# Predict: output probability for each class
predictions = model.predict_proba(X)  # Shape: (n_samples, 4) for 4 classes
confidence = np.max(predictions, axis=1)  # Confidence per sample
predicted_class = np.argmax(predictions, axis=1)  # 0=reject, 1=review, 2=index, 3=priority
```

**Deliverable**: Real XGBoost ranking

#### Step 3: Score Fusion & Action Recommendation (1 hour)
**Goal**: Map XGBoost output to recommendation actions

```typescript
{
  card_id: row.card_id,
  alias_id: row.alias_id,
  sourceRef: row.sourceRef,
  feature_id: row.feature_id,
  fusion_score: predictions[class][i],  // Probability of predicted class
  predicted_class: ['reject', 'review', 'index', 'priority'][class],
  confidence: confidence[i],
  recommended_action: mapClassToAction(predicted_class, confidence),
  risk_notes: assessRisk(row.extracted_features),
}
```

**Deliverable**: Ranked output with actions

#### Step 4: Error Handling & Fallback (1 hour)
**Goal**: Graceful degradation if XGBoost unavailable

```python
try:
    # Tier 1: XGBoost ranking
    model.load_model(MODEL_PATH)
    predictions = model.predict_proba(X)
    return xgboost_output(predictions)
except FileNotFoundError:
    print('[Phase18] Model not found, falling back to feature-based heuristics')

try:
    # Tier 2: Feature-based heuristics (use Phase 17 features directly)
    scores = computeScoresFromFeatures(X)
    return heuristic_output(scores)
except Exception:
    print('[Phase18] Feature heuristics failed, falling back to JS')

# Tier 3: JS fallback (existing)
return js_fallback(phase17_rows)
```

**Deliverable**: 3-tier fallback chain

---

## Integration Points

### Phase 17 Entry Point
```typescript
// FROM: ClusterCard API + Reconciliation
const promptResult = { query, aliasId, selectedCards, sourceRefs, featureIds, ... };
const reconciled = await reconcileRetrievalLoop(promptResult);

// TO: Phase 17 Feature Extractor
const phase17Output = await extractFeatures({
  reconciliation: reconciled,
  aliasId: reconciled.aliasId,
});
```

### Phase 17 → Phase 18 Handoff
```typescript
// FROM: Phase 17 output
{
  packet_key, alias_id, feature_id, extracted_features,
}

// TO: Phase 18 Reranker
const phase18Output = await rankFeatures({
  phase17Features: phase17Output,
  reconciliation: reconciled,
  trainMode: false,
});
```

### Phase 18 Output → ACE Assembly
```typescript
// Result written to task_semantic_packets table
// Ready for downstream ranking and retrieval

// Fields:
// - packet_key: SHA256(sourceRef + featureId) — PRIMARY KEY
// - alias_id: reconciliation.aliasId — REQUEST TRACKING
// - feature_id: extracted from clusterCard — IDENTITY
// - feature_label: human-readable — DISCOVERY
// - extracted_features: { qdrant, cluster, topo, fusion, metadata } — SCORING
// - validation_status: 'valid' — TRUSTWORTHINESS
// - predicted_class: 0-3 — ACTION ROUTING
```

---

## Timeline & Execution

| Phase | Duration | Blocker | Status |
|-------|----------|---------|--------|
| **Phase 17A**: Reconciliation input wiring | 30 min | Phase 10-19 ✅ | READY |
| **Phase 17B**: Real feature extraction | 2 hours | Phase 17A | UNBLOCKED |
| **Phase 17C**: alias_id/feature_id threading | 1 hour | Phase 17B | UNBLOCKED |
| **Phase 17D**: Error handling | 1 hour | Phase 17C | UNBLOCKED |
| **Phase 17 COMPLETE** | **4.5 hours** | ✅ | **READY** |
| **Phase 18A**: Phase 17 output consumption | 30 min | Phase 17 | DEPENDS |
| **Phase 18B**: XGBoost ranking | 2-3 hours | Phase 18A | DEPENDS |
| **Phase 18C**: Score fusion | 1 hour | Phase 18B | DEPENDS |
| **Phase 18D**: Error handling | 1 hour | Phase 18C | DEPENDS |
| **Phase 18 COMPLETE** | **4.5-5.5 hours** | Phase 17 | DEPENDS |

**Critical Path**: 9-10 hours total (sequential: Phase 17 then Phase 18)  
**Parallelization**: Phase 19 (Lane Completion) can start after Phase 17 ships

---

## Success Criteria

**Phase 17 Complete When**:
- [ ] Accepts `ReconciliationResult` from Phase 10-19
- [ ] Extracts 13+ real features (score profiles + metadata)
- [ ] Threads alias_id and feature_id through output
- [ ] Fallback chain (reconciliation → schema-indexer → JS) works
- [ ] Output matches task_semantic_packets schema
- [ ] CLI test: `npm run atlas:phase17` produces valid JSONL

**Phase 18 Complete When**:
- [ ] Accepts Phase 17 feature matrix
- [ ] XGBoost model trains (or loads pre-trained)
- [ ] Predictions map to recommended actions
- [ ] Fallback chain (XGBoost → heuristics → JS) works
- [ ] Output includes confidence scores
- [ ] CLI test: `npm run atlas:phase18` produces ranked JSONL

---

## References

- **Phase 10-19 ClusterCard**: ✅ COMPLETE (`docs/reports/PHASE-10-19-CLUSTER-CARD-IMPLEMENTATION-COMPLETE.md`)
- **Reconciliation Module**: ✅ READY (`src/lib/server/retrieval/retrieval-loop-reconciliation.ts`)
- **Task Semantic Packets Schema**: See `src/lib/server/db/schema-postgres.ts` (line ~4100)
- **npm Scripts**: `atlas:phase17`, `atlas:phase18` (see package.json)

---

**Next Action**: Proceed with Phase 17A (Reconciliation Input Wiring)
