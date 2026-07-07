---
name: Session 122 Day 2 Phase 4 Integration Plan
description: Wire RRF multi-vector lanes into Go Retrieval Bridge — prepare for A/B testing
type: project
---

# Session 122: Day 2 Phase 4 — RRF Integration into Go Retrieval Bridge

**Date**: July 8, 2026  
**Status**: ✅ PHASE 3 COMPLETE, PHASE 4 READY TO EXECUTE  
**Estimated Duration**: 2-3 hours

---

## Phase 3 Recap (COMPLETE)

**✅ RRF Fusion Module**: 
- Core implementation: `src/lib/server/retrieval/rrf-multi-vector.ts` (220 lines)
- Comprehensive tests: `tests/retrieval/rrf-multi-vector.spec.ts` (280 lines)
- Multi-vector orchestrator: `src/lib/server/retrieval/multi-vector-orchestrator.ts` (300 lines)
- Integration tests: `tests/retrieval/multi-vector-orchestrator.spec.ts` (220 lines)

**Key Features**:
- 4-lane RRF fusion (content + summary + title + keywords)
- Configurable weights (default: 0.40/0.30/0.20/0.10)
- Score normalization to [0, 1]
- Parallel lane execution
- Health checks for Qdrant vector availability

---

## Phase 4: Integration into Go Retrieval Bridge

**Goal**: Wire the multi-vector orchestrator into the Go Retrieval HTTP facade as an alternative to the standard unified retrieval.

### Step 4.1: Add Multi-Vector Endpoint to Go Retrieval Facade

**File**: `src/lib/server/retrieval/go-retrieval-facade.ts`

**Changes**:
1. Import multi-vector orchestrator
2. Add `useMultiVector` parameter to request interface
3. Route to multi-vector orchestrator if flag enabled
4. Preserve identity validation and dispatcher gates
5. Return RRF scores in response

**Code sketch**:
```typescript
// Add to GoRetrievalFacadeRequest
export interface GoRetrievalFacadeRequest {
  query: string;
  useMultiVector?: boolean;
  use_multi_vector?: boolean;
  rrfWeights?: {
    content?: number;
    summary?: number;
    title?: number;
    keywords?: number;
  };
  // ... existing fields
}

// Add new export function
export async function executeGoRetrievalSearchMultiVector(
  request: GoRetrievalFacadeRequest,
  includeSummary?: boolean
): Promise<GoRetrievalFacadeResponse> {
  // 1. Embed query (reuse existing embedding logic)
  // 2. Call executeMultiVectorRetrieval with RRF config
  // 3. Validate identities + apply dispatcher gates
  // 4. Return merged response
}

// Modify main function to route
export async function executeGoRetrievalSearch(
  request: GoRetrievalFacadeRequest,
  includeSummary?: boolean
): Promise<GoRetrievalFacadeResponse> {
  if (request.useMultiVector ?? request.use_multi_vector) {
    return executeGoRetrievalSearchMultiVector(request, includeSummary);
  }
  
  // ... existing unified retrieval path
}
```

**Implementation Checklist**:
- [ ] Import `executeMultiVectorRetrieval`, `checkMultiVectorHealth`
- [ ] Add `useMultiVector` and `rrfWeights` to request interface
- [ ] Create `executeGoRetrievalSearchMultiVector` function
- [ ] Embed query using existing embedding pipeline
- [ ] Call multi-vector orchestrator with query embedding
- [ ] Re-apply identity validation gate on candidates
- [ ] Re-apply dispatcher gate on validated results
- [ ] Merge RRF scores into response metadata
- [ ] Add health check for multi-vector mode

### Step 4.2: Create Integration Tests

**File**: `tests/retrieval/go-retrieval-multi-vector-integration.spec.ts`

**Tests**:
1. Route via multi-vector flag
2. Compare RRF vs unified retrieval on 5 test queries
3. Verify identity validation still works with RRF
4. Verify dispatcher integration with RRF scores
5. Verify response shape compatibility

**Code sketch**:
```typescript
describe('Go Retrieval Multi-Vector Integration', () => {
  it('should route to multi-vector when flag enabled', async () => {
    const request: GoRetrievalFacadeRequest = {
      query: 'authentication',
      useMultiVector: true
    };
    
    const response = await executeGoRetrievalSearch(request);
    expect(response.results).toBeDefined();
    // Each result should have RRF score
    expect(response.results[0].ranks?.rrf_score).toBeDefined();
  });
  
  it('should preserve identity validation with RRF', async () => {
    const request: GoRetrievalFacadeRequest = {
      query: 'database',
      useMultiVector: true
    };
    
    const response = await executeGoRetrievalSearch(request);
    expect(response.identity_validation).toBeDefined();
    // All returned results should be canonical or recoverable
    for (const result of response.results) {
      expect(['canonical', 'recoverable']).toContain(result.identity_lane);
    }
  });
});
```

**Checklist**:
- [ ] Test routing via `useMultiVector` flag
- [ ] Test RRF score assignment
- [ ] Test identity validation gate
- [ ] Test dispatcher integration
- [ ] Test response shape compatibility
- [ ] Compare latency: unified vs multi-vector

### Step 4.3: Wire into SvelteKit API Route

**File**: `src/routes/api/retrieval/multi-vector/+server.ts` (new)

**Handler**:
```typescript
export async function POST({ request }) {
  const body = await request.json();
  
  const facadeRequest: GoRetrievalFacadeRequest = {
    query: body.q || body.query,
    useMultiVector: true,
    rrfWeights: body.rrf_weights,
    includeSummary: body.include_summary,
    topK: body.top_k || 10
  };
  
  const response = await executeGoRetrievalSearch(facadeRequest, body.include_summary);
  return json(response);
}
```

**Checklist**:
- [ ] Create POST handler
- [ ] Parse query and RRF config from body
- [ ] Call Go Retrieval facade
- [ ] Return response as JSON
- [ ] Add error handling with degradation

### Step 4.4: TypeScript Build Validation

**Commands**:
```bash
cd sveltekit-frontend

# Check for type errors
npm run check

# Run retrieval tests only
npm run test -- tests/retrieval/

# Build output
npm run build
```

**Expected**:
- Zero TypeScript errors
- All retrieval tests pass
- Build succeeds

**Checklist**:
- [ ] `npm run check` passes
- [ ] Integration tests pass
- [ ] `npm run build` succeeds

---

## Phase 5: A/B Validation (Next Session)

**Goal**: Compare multi-vector RRF against baseline unified retrieval on 20 test queries.

**Metrics to track**:
- Recall@100: Both should be ≥98%
- Latency p95: Target ≤150ms (baseline is ~80-100ms)
- NDCG@20: Target ≥0.72 (baseline is ~0.70)
- Mean RRF score: Sanity check (should be in [0, 1] range)

**Test Queries** (20 diverse queries):
```
1. authentication session validation
2. database connection pooling
3. error handling middleware
4. api route handler
5. async task queue management
6. cache invalidation strategy
7. vector similarity search
8. json serialization format
9. rate limiting algorithm
10. websocket connection upgrade
11. request header parsing
12. response compression
13. tls certificate validation
14. oauth token refresh
15. sql query optimization
16. type definition export
17. circular dependency resolution
18. memory leak detection
19. stack trace parsing
20. concurrent request handling
```

**Script**: `npm run atlas:retrieval:validate:multi-vector:dry`

---

## Known Issues & Workarounds

### Issue 1: Qdrant Named Vector Names
- **Problem**: Qdrant collection has `content`, `error`, `signature` instead of `content`, `summary`, `title`
- **Status**: Known, acceptable
- **Workaround**: Code remaps `error` → summary lane, `signature` → title lane
- **Impact**: Cosmetic only, no functional loss

### Issue 2: Keyword Coverage
- **Problem**: Only 7.22% (3,610) of 50K keyword packets have qdrant_point_id
- **Status**: Non-blocking, backfill planned as Phase 2A
- **Workaround**: Keywords lane operates at 7% coverage until backfill complete
- **Impact**: 4-lane fusion still works; keywords just have lower participation rate

### Issue 3: Qdrant BM25 Index
- **Problem**: Keywords may not be BM25-indexed in Qdrant yet
- **Status**: Partial (indexed to payload, not yet BM25 searchable)
- **Workaround**: Keywords lane gracefully falls back to empty if BM25 unavailable
- **Impact**: Non-blocking; keywords lane just returns zero results until full BM25 wiring complete

---

## Rollback Plan

If Phase 4 integration causes issues:

1. Keep `useMultiVector` flag default to `false`
2. All existing traffic routes to unified retrieval
3. Multi-vector is opt-in only: `?use_multi_vector=true`
4. No production impact if integration fails

**Revert**:
```bash
# Remove multi-vector flag routing
git diff src/lib/server/retrieval/go-retrieval-facade.ts
git checkout src/lib/server/retrieval/go-retrieval-facade.ts

# Keep orchestrator module (for later completion)
# No other changes needed
```

---

## Success Criteria

✅ **Phase 4 Complete when**:
1. Multi-vector orchestrator wired into Go Retrieval facade
2. API route exposed at `/api/retrieval/multi-vector`
3. `useMultiVector` flag routes correctly
4. Integration tests all pass
5. TypeScript build clean
6. Identity validation and dispatcher gates work with RRF scores
7. No regressions in unified retrieval (flag default false)

---

## Time Estimate

| Task | Est. Time | Status |
|------|-----------|--------|
| Wire facade integration | 45 min | Ready |
| Create integration tests | 45 min | Ready |
| SvelteKit route handler | 20 min | Ready |
| TypeScript validation | 15 min | Ready |
| Documentation | 15 min | Ready |
| **Total** | **2h 20m** | ✅ |

---

## Reference Files

**Created Today**:
- `src/lib/server/retrieval/rrf-multi-vector.ts` (RRF algorithm)
- `src/lib/server/retrieval/multi-vector-orchestrator.ts` (orchestrator)
- `tests/retrieval/rrf-multi-vector.spec.ts` (unit tests)
- `tests/retrieval/multi-vector-orchestrator.spec.ts` (integration tests)

**To Modify**:
- `src/lib/server/retrieval/go-retrieval-facade.ts` (add multi-vector path)

**To Create**:
- `src/routes/api/retrieval/multi-vector/+server.ts` (API handler)
- `tests/retrieval/go-retrieval-multi-vector-integration.spec.ts` (integration tests)

---

## Next: Phase 5

After Phase 4 integration is complete and tested:
- Dry-run 20 test queries
- Compare unified vs multi-vector on metrics
- Validate recall, latency, NDCG
- Decide whether to proceed to production ramp

**Expected**: Day 2 afternoon, Session 122 continuation
