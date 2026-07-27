# Phase 17B — Real Feature Extraction — PLAN

**Status**: 🔄 **READY FOR EXECUTION** (Phase 17A ✅ complete, Phase 17B scaffolding wired)
**Estimated Duration**: 2-3 hours
**Next Step**: Execute Phase 17B.1 → Phase 17B.2 → Testing
**Blocker Status**: NONE

---

## Summary

Phase 17A wired the reconciliation input layer. Phase 17B enhances feature extraction beyond basic scores:

1. **Phase 17B.1**: Implement weighted authority scoring (30 min)
2. **Phase 17B.2**: Semantic vector computation (1.5-2 hours, optional PyTorch)
3. **Phase 17B.3**: Integration testing + validation (30-45 min)

**New module**: `phase17-advanced-features.ts` (147 lines) — scaffolding complete, ready for implementation.

---

## Phase 17B.1: Weighted Authority Scoring ✅ Scaffolded

**Current state**:
- Base authority from cluster card: `matchingCard?.authorityScore ?? 0.5`
- Advanced scoring: ✅ `computeWeightedAuthority()` exists (not yet wired)

**Implementation**:
```typescript
// Already scaffolded in phase17-advanced-features.ts
export function computeWeightedAuthority(
  baseAuthority: number,
  hasTests: boolean,
  docPresence: number,
  packetCount: number
): number {
  // Apply confidence multipliers:
  // +0.15 for test coverage
  // +0.1 × docPresence for documentation
  // +0.02 × packetCount for usage frequency
  // Clamp to [0.1, 1.0]
}
```

**Integration**: ✅ Already wired in `enhanceMetadata()`, called from `extractFeatures()`

**Tests**:
- [ ] `computeWeightedAuthority()` with no tests, no docs → score unchanged
- [ ] `computeWeightedAuthority()` with tests + docs → score boosted to 0.9+
- [ ] Score clamping → always in [0.1, 1.0]

**Time**: 30 min (mostly testing)

---

## Phase 17B.2: Semantic Vector Computation

**Current state**:
- Stub: `extractSemanticVector()` returns `undefined` (optional field)
- TODO: Wire PyTorch tensor computation (or CPU fallback)

**Implementation Options**:

### Option A: CPU-Only (Safest, no GPU dependency)
```typescript
// Compute mean of cluster card embeddings + normalize
export function extractSemanticVector(input: Phase17Input): number[] | undefined {
  const embeddings = input.reconciliationResult.clusterCards
    .map(card => {
      // TODO: fetch card embedding from Qdrant payload
      // or from embeddings cache in Postgres
    });

  if (embeddings.length === 0) return undefined;

  // Mean pooling
  const dims = embeddings[0].length;
  const mean = new Array(dims).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dims; i++) mean[i] += emb[i];
  }
  for (let i = 0; i < dims; i++) mean[i] /= embeddings.length;

  // L2 normalize
  const norm = Math.sqrt(mean.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return undefined;
  return mean.map(x => x / norm);
}
```

### Option B: PyTorch GPU (Faster for large batches)
```typescript
// Requires: phase17-pytorch-bridge.ts (N-API addon)
import { computeEmbeddingMean } from './phase17-pytorch-bridge';

export function extractSemanticVector(input: Phase17Input): number[] | undefined {
  try {
    return computeEmbeddingMean(embeddings); // GPU-accelerated
  } catch (err) {
    console.warn('[Phase17] PyTorch unavailable, falling back to CPU');
    return extractSemanticVectorCPU(input);
  }
}
```

**Recommendation**: Option A (CPU) for Phase 17B
- No new dependencies
- Deterministic behavior (no GPU randomness)
- Good enough for feature extraction (not inference)
- Fallback built-in

**Time**: 1-1.5 hours (includes error handling + testing)

---

## Phase 17B.3: Additional Signals (Already Scaffolded)

**Test coverage detection**:
```typescript
// ✅ Already implemented in phase17-advanced-features.ts
export function hasTestCoverage(sourceRef: string): boolean {
  return /\.(spec|test)\.(ts|js)$/.test(sourceRef) || /__tests__\//.test(sourceRef);
}
```

**Documentation presence estimation**:
```typescript
// ✅ Already implemented
export function estimateDocumentationPresence(sourceRef: string): number {
  // Heuristic scoring: docs/ directory, README, JSDoc likelihood
  // Returns [0.1, 1.0]
}
```

**Dependency metrics**:
```typescript
// ✅ Already implemented
export function computeDependencyMetrics(input, sourceRef) {
  // Count incoming/outgoing imports from reconciliation packets
  return { incoming: n, outgoing: m };
}
```

**Status**: All already wired! Just need to verify output in tests.

---

## Integration Status

### ✅ Already Wired into Phase 17 Core
```typescript
// phase17-feature-extractor.ts
const semanticVector = extractSemanticVector(data);
metadata = enhanceMetadata(metadata, data, data.sourceRef);

// Both now part of the extraction pipeline
```

### Next: Write to Postgres

**After Phase 17B is complete**, need to wire output to `task_semantic_packets` table:

```typescript
// Not yet implemented (Phase 17C)
await db.insert(taskSemanticPackets).values({
  packet_key: output.packet_key,
  source_ref: output.source_ref,
  feature_id: output.feature_id,
  feature_label: output.feature_label,
  alias_id: output.alias_id,
  extracted_features: output.extracted_features,
  validation_status: output.validation_status,
  error_message: output.error_message,
});
```

---

## Test Plan

### Unit Tests (30 min)
```typescript
// tests/phase17-feature-extractor.spec.ts
describe('Phase 17 Feature Extractor', () => {
  test('extractFeatures: valid input → valid output', async () => {
    // Test with mock ReconciliationResult
  });

  test('extractFeatures: missing reconciliation → fallback to defaults', async () => {
    // Test error path
  });

  test('computeWeightedAuthority: test coverage boost applied', async () => {
    // Test scoring
  });

  test('hasTestCoverage: recognizes .spec.ts', async () => {
    // Test detection
  });

  test('estimateDocumentationPresence: docs/ directory → high score', async () => {
    // Test heuristic
  });
});
```

### Smoke Test (15 min)
```bash
npm run atlas:phase17:smoke
# Should output:
# ✓ Phase 17 extraction: 10/10 packets
# ✓ Weighted authority boost applied
# ✓ Fallback chain tested
```

### Integration Test (15 min)
```bash
# Run full Phase 10-19 → Phase 17 flow
npm run atlas:phase17:e2e
# Should match output schema to task_semantic_packets columns
```

---

## Success Criteria

✅ **Phase 17B Complete When**:
- [ ] `computeWeightedAuthority()` applies all 4 boosting factors
- [ ] Semantic vector computation returns 768-dim or gracefully falls back to undefined
- [ ] `enhanceMetadata()` integrates into main extraction pipeline
- [ ] Test coverage: 10+ unit tests, all PASS
- [ ] Smoke test: Phase 17 → Postgres output schema match verified
- [ ] Error handling: all error paths tested (reconciliation missing, packet empty, etc.)
- [ ] Type safety: zero `any` types, full Zod validation

---

## Execution Checklist

### Before Starting Phase 17B
- [ ] Phase 17A modules load without errors (`npx tsc --noEmit`)
- [ ] Reconciliation module live (Phase 10-19 ✅)
- [ ] Postgres `task_semantic_packets` table exists

### Phase 17B.1 (30 min)
- [ ] Run unit tests for `computeWeightedAuthority()`
- [ ] Verify scoring boosts are applied correctly
- [ ] Check edge cases (0 packets, no tests, no docs)

### Phase 17B.2 (1-1.5 hours)
- [ ] Implement `extractSemanticVector()` with CPU-based mean pooling
- [ ] Test with mock embeddings (known vectors)
- [ ] Test fallback path (PyTorch unavailable)

### Phase 17B.3 (30-45 min)
- [ ] Run full test suite
- [ ] Smoke test with real reconciliation data
- [ ] Verify output schema

### After Phase 17B
- [ ] Update documentation (this file)
- [ ] Mark Phase 17B ✅ COMPLETE
- [ ] Proceed to Phase 18 (XGBoost Reranker)

---

## Files Changed

| File | Type | Status |
|------|------|--------|
| `src/lib/server/ml/phase17-advanced-features.ts` | NEW | ✅ Scaffolding complete |
| `src/lib/server/ml/phase17-feature-extractor.ts` | MODIFIED | ✅ Wired advanced features |
| `tests/phase17-*.spec.ts` | NEW | 🔄 To be created |

---

## Risk Assessment

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Semantic vector computation OOM on large batches | LOW | CPU-based mean pooling (not GPU) avoids batch constraints |
| Authority scoring divergence from domain | LOW | Heuristic boosting (conservative factors: +0.1-0.2) |
| Reconciliation result missing embeddings | MEDIUM | Graceful `undefined` return (optional field) |

---

## Related Documents

- **Phase 17A**: `PHASE-17A-RECONCILIATION-INPUT-WIRING-COMPLETE.md` ✅
- **Phase 10-19**: ClusterCard API, alias_id threading, reconciliation ✅
- **Phase 18**: XGBoost Reranker (depends on Phase 17B output)
- **Upgrade Plan**: `PHASE-17-PYTORCH-FEATURE-EXTRACTOR-PLAN.md` (from prior audit)

---

**Next Action**: Execute Phase 17B.1-3 sequentially, then proceed to Phase 18 (XGBoost Reranker).
**Estimated completion**: 2-3 hours from start.
**Timeline**: Can execute today if Postgres + Reconciliation verified ✅
