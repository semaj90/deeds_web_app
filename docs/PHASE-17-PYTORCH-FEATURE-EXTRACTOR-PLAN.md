# Phase 17 — PyTorch Feature Extractor Upgrade

**Status**: ⏳ **READY TO START** (Unblocked by Phase 10-19 ClusterCard implementation)  
**Predecessor**: Phase 10-19 ClusterCard ✅ COMPLETE  
**Estimated Duration**: 4-6 hours  
**Next Dependency**: Phase 18 (XGBoost Reranker)

---

## Goal

Upgrade the existing Phase 17 PyTorch Feature Extractor with:
- Robust error handling + fallbacks
- Correct feature schema (sourceRef/featureId/alias_id alignment)
- Integration with reconciled retrieval results
- Score computation for 3-lane ranking (Qdrant/Cluster/Topological)

---

## Current State

**Existing Files**:
- `scripts/atlas/phase-17-pytorch-feature-extract.mjs` (if exists)
- `scripts/atlas/phase17-*.mjs` (pattern search needed)
- Python worker: `/path/to/feature_extractor.py` (location TBD)

**Missing**:
- Error handling for unavailable PyTorch
- Schema validation against `task_semantic_packets.feature_id`
- Integration with reconciliation module
- Score profile computation

---

## Implementation Plan (4-6 hours)

### Phase 17A: Discovery & Audit (30 minutes)
**Task**: Locate existing Phase 17 implementation

```bash
# Find existing Phase 17 scripts
find . -name "*phase*17*" -o -name "*feature*extract*" | grep -v node_modules

# Check package.json for phase17/feature scripts
npm run | grep -i phase | grep -i 17
```

**Deliverable**: Locate 2-3 existing files, assess current state

---

### Phase 17B: Schema Alignment (1 hour)
**Task**: Ensure feature extraction output matches `task_semantic_packets` schema

**Required Fields**:
```typescript
{
  packet_key: string;        // SHA256(sourceRef + featureId)
  source_ref: string;        // e.g., "src/lib/server/auth.ts"
  feature_id: string;        // e.g., "auth.sessions"
  feature_label: string;     // Human-readable label
  alias_id?: string;         // From reconciliation
  extracted_features: {
    qdrant_score?: number;      // [0, 1]
    cluster_score?: number;     // [0, 1]
    topological_score?: number; // [0, 1]
    fusion_score?: number;      // [0, 1]
    semantic_vector?: number[]; // Optional 768-dim
    metadata?: {
      ast_nodes?: number;
      complexity?: number;
      [key: string]: any;
    };
  };
  validation_status: "pending" | "valid" | "invalid";
  error_message?: string;
}
```

**Deliverable**: Updated schema documentation + Zod schema in TypeScript

---

### Phase 17C: Feature Extraction Logic (2-2.5 hours)
**Task**: Implement feature extraction with 4-step pipeline

**Step 1: Input Validation** (15 min)
```typescript
// Accept reconciled retrieval result from Phase 10-19
interface FeatureExtractionInput {
  reconciliationResult: ReconciliationResult;  // From retrieval-loop-reconciliation.ts
  sourceRef: string;
  featureId: string;
  aliasId: string;
}

// Validate all required fields
```

**Step 2: Feature Scoring** (45 min)
```typescript
// Extract 3 score lanes from reconciliation result
const scores = {
  qdrant: reconciled.scoreProfile.qdrant,       // Vector similarity
  cluster: reconciled.scoreProfile.cluster,     // Cluster authority
  topological: reconciled.scoreProfile.topological, // Neo4j validation
};

// Compute fusion score
const fusionScore = (scores.qdrant * 0.4 + scores.cluster * 0.35 + scores.topological * 0.25);
```

**Step 3: Metadata Extraction** (45 min)
```typescript
// Extract from clusterCards + taskSemanticPackets
const metadata = {
  ast_nodes: getAstNodeCount(sourceRef),
  complexity: computeComplexity(clusterCards),
  member_count: clusterCard.memberCount,
  authority: clusterCard.authorityScore,
  semantic_tags: clusterCard.topTags,
};
```

**Step 4: Schema Serialization** (15 min)
```typescript
// Serialize to task_semantic_packets format
const feature = {
  packet_key: generatePacketKey(sourceRef, featureId),
  source_ref: sourceRef,
  feature_id: featureId,
  feature_label: humanReadableLabel(featureId),
  alias_id: aliasId,
  extracted_features: {
    qdrant_score: scores.qdrant,
    cluster_score: scores.cluster,
    topological_score: scores.topological,
    fusion_score: fusionScore,
    metadata,
  },
  validation_status: "valid",
  error_message: null,
};
```

**Deliverable**: Core feature extraction TypeScript module

---

### Phase 17D: Error Handling & Fallbacks (1-1.5 hours)
**Task**: Graceful degradation on service unavailability

**Fallback Chain**:
```typescript
// 1. Try full feature extraction with all scores
try {
  return await extractFeaturesWithAllScores(input);
} catch (err) {
  console.warn('[Phase17] Full extraction failed:', err.message);
}

// 2. Fallback: Qdrant score only
try {
  return await extractFeaturesQdrantOnly(input);
} catch (err) {
  console.warn('[Phase17] Qdrant fallback failed:', err.message);
}

// 3. Fallback: Cluster score only
try {
  return await extractFeaturesClusterOnly(input);
} catch (err) {
  console.warn('[Phase17] Cluster fallback failed:', err.message);
}

// 4. Final fallback: Return default (validation_status: "pending")
return {
  ...input,
  extracted_features: { fusion_score: 0.5 },
  validation_status: "pending",
  error_message: "All extraction methods failed, using default score",
};
```

**Deliverable**: Error handling module with 4-tier fallback

---

### Phase 17E: Integration Testing (30-45 min)
**Task**: Wire into reconciliation + verify end-to-end flow

**Test Cases**:
1. **Happy path** — Full extraction with all scores
2. **Partial failure** — One score unavailable, fallback works
3. **Total failure** — All methods fail, returns default
4. **Empty input** — Handles null/undefined gracefully
5. **Large batch** — 100+ features extracted in <5 min

**Deliverable**: Test suite + validation report

---

## Integration with Phase 10-19

**Data Flow**:
```
Prompt Query
  ↓
promptRetrieve() — Returns PromptResult with aliasId
  ↓
reconcileRetrievalLoop() — Returns ReconciliationResult ✅
  ↓
Phase 17 Feature Extraction ← INPUT (NEW)
  ├─ Uses ReconciliationResult.scoreProfile
  ├─ Uses ReconciliationResult.clusterCards
  ├─ Uses ReconciliationResult.packets
  └─ Outputs: task_semantic_packets row
  ↓
Phase 18 XGBoost Reranker ← INPUT
  ├─ Uses extracted_features from Phase 17
  └─ Outputs: ranking scores
  ↓
Phase 19 Lane Completion ← INPUT
  └─ Orchestrates all lanes
```

---

## Files to Create/Modify

| File | Type | Purpose |
|------|------|---------|
| `src/lib/server/ml/phase17-feature-extractor.ts` | **NEW** | Core extraction logic |
| `src/lib/server/ml/phase17-schema.ts` | **NEW** | Feature extraction schema + validation |
| `scripts/atlas/phase17-batch-extract.mjs` | **NEW** (or UPDATE) | CLI batch extraction |
| `scripts/atlas/phase17-smoke-test.mjs` | **NEW** (or UPDATE) | Smoke test |
| `tests/phase17-feature-extractor.spec.ts` | **NEW** | Unit tests |

**Total new code**: ~2-3 KB TypeScript + tests

---

## Success Criteria

- [ ] Feature extraction produces valid `task_semantic_packets` rows
- [ ] All 3 score lanes (Qdrant/Cluster/Topological) computed correctly
- [ ] Error handling falls back gracefully (4-tier chain)
- [ ] Smoke test passes with 10+ features extracted
- [ ] Integration with reconciliation module verified
- [ ] All extracted features have valid `packet_key` (non-null, unique)
- [ ] Batch extraction completes in <5 min for 100 features
- [ ] Schema validation passes (Zod parse succeeds)

---

## Blockers & Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| PyTorch not available | HIGH | Implement 4-tier fallback; skip GPU ops if unavailable |
| ReconciliationResult missing field | MEDIUM | Add type guards; verify schema at runtime |
| Qdrant/Redis down | MEDIUM | Fallback chain handles unavailability |
| Performance regression | LOW | Measure extraction time; target <50ms per feature |

---

## Timeline Estimate

- **Discovery (Phase 17A)**: 30 min
- **Schema (Phase 17B)**: 1 hour
- **Extraction Logic (Phase 17C)**: 2-2.5 hours
- **Error Handling (Phase 17D)**: 1-1.5 hours
- **Testing (Phase 17E)**: 45 min

**Total**: 5-6 hours (or 4 hours if existing implementation is sound)

---

## Related Docs

- **Phase 10-19 ClusterCard**: `docs/reports/PHASE-10-19-CLUSTER-CARD-IMPLEMENTATION-COMPLETE.md` ✅
- **Reconciliation Module**: `src/lib/server/retrieval/retrieval-loop-reconciliation.ts`
- **Task Semantic Packets Schema**: `src/lib/server/db/schema-postgres.ts` lines ~4100-4150 (find exact line)
- **Phase 18 Roadmap**: `docs/PHASE-18-XGBOOST-RERANKER-PLAN.md` (to be created)

---

**Status**: Ready to start  
**Start Trigger**: User approval or automatic after Phase 10-19 validation  
**Handoff Target**: Phase 18 XGBoost Reranker (can run Phases 18-19 in parallel)
