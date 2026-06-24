# TurboVec Reranker Implementation — Session 74

**Option B (Reranker at Stage A2)** — Wire TurboVec reranking into context-assembler.ts after Qdrant search completes.

**File**: `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts`  
**Location**: Lines 1203-1230 (after RRF fusion, before Postgres hybrid scoring)  
**Effort**: 1.5 hours (code + tests + commit)  
**Risk**: Low (graceful fallback, non-blocking)

---

## Current Flow (Status Quo)

```typescript
// Line 1134-1193: Parallel Qdrant + Postgres search
const qdrantScored: ScoredResult[] = [];  // ANN results
const postgresScored: ScoredResult[] = []; // FTS results

// Line 1197: Fuse results via RRF
const fused = rrfFuse(allScored, fusionWeights).slice(0, limit);
// ↓ Returns fused[0..N] with original ANN/FTS scores
```

**Next step**: Rerank the fused results using TurboVec.

---

## Implementation Plan

### Step 1: Add TurboVec Import (1 line)

**Location**: Line 89 (after other gRPC imports)

```typescript
// Add to imports at top of file
import {
  turbovecGrpcHealth,
  turbovecGrpcSearch,
  type TurboVecGrpcSearchResponse,
} from '$lib/server/grpc/turbovec-cuda-client.js';
```

### Step 2: Add Reranking Function (30 lines)

**Location**: After line 1203 (after RRF fusion, create new function)

```typescript
/**
 * Optional TurboVec reranking of fused results.
 * Non-blocking: returns original scores if TurboVec unavailable.
 */
async function applyTurboVecRerank(
  fusedResults: ScoredResult[],
  queryEmbedding: Float32Array,
  payloadMap: Map<string, Record<string, unknown>>
): Promise<{ reranked: ScoredResult[]; applied: boolean }> {
  // Early exit: TurboVec disabled or empty results
  if (!ENV.TURBOVEC_SIDECAR_GRPC_ENABLED || fusedResults.length === 0) {
    return { reranked: fusedResults, applied: false };
  }

  try {
    // Call TurboVec for top-K reranking
    const tvResult = await turbovecGrpcSearch(queryEmbedding, Math.min(fusedResults.length, 200));
    
    if (!tvResult?.candidates?.length) {
      // TurboVec returned no candidates, use original
      return { reranked: fusedResults, applied: false };
    }

    // Build score map from TurboVec results
    const tvScoreMap = new Map<string, number>(
      tvResult.candidates.map((c) => [c.id, c.score])
    );

    // Rerank: use TurboVec score as primary tie-breaker
    const reranked = [...fusedResults].sort((a, b) => {
      const scoreA = tvScoreMap.get(a.id) ?? a.score;
      const scoreB = tvScoreMap.get(b.id) ?? b.score;
      return scoreB - scoreA; // Higher score first
    });

    return { reranked, applied: true };
  } catch (error) {
    // Log but don't throw — fall back to original order
    console.warn('[ACE] TurboVec reranking failed:', (error as Error).message);
    return { reranked: fusedResults, applied: false };
  }
}
```

### Step 3: Call Reranking Function (3 lines)

**Location**: Line 1203 (immediately after RRF fusion)

```typescript
// Line 1203: Original line
const fused = allScored.length > 0 ? rrfFuse(allScored, fusionWeights).slice(0, limit) : [];

// NEW: Add reranking (non-blocking)
const { reranked, applied: turbovecApplied } = await applyTurboVecRerank(
  fused,
  emb,
  payloadMap
);
const finalResults = reranked;  // Use reranked results for downstream
```

### Step 4: Add Telemetry (2 lines)

**Location**: Line 1220 (in topoPrefilter stats section)

```typescript
// Existing topoPrefilter stats building...
topoPrefilter = buildTopoPrefilterStats({
  used: true,
  topoClass: queryClass,
  cacheHit: false,
  candidateCountAfter: qdrantScored.length,
  turbovecRerank: turbovecApplied, // NEW: Track if TurboVec was applied
});
```

### Step 5: Update Final Return (1 line change)

**Location**: Line 1250+ (the return statement for this function)

**Original**:
```typescript
return {
  packets: fused,  // ← Uses original fused
  // ... other fields
};
```

**Updated**:
```typescript
return {
  packets: finalResults,  // ← Uses reranked results
  // ... other fields
};
```

---

## Configuration (ENV Variables)

**Already exists** in `src/lib/server/env.server.ts` (line 220):

```typescript
TURBOVEC_SIDECAR_GRPC_ENABLED: (privateEnv.TURBOVEC_SIDECAR_GRPC_ENABLED ?? 'false') === 'true',
TURBOVEC_SIDECAR_GRPC_URL: privateEnv.TURBOVEC_SIDECAR_GRPC_URL ?? '127.0.0.1:50062',
```

**Default**: Disabled (`false`). Enable by setting:
```bash
export TURBOVEC_SIDECAR_GRPC_ENABLED=true
export TURBOVEC_SIDECAR_GRPC_URL=127.0.0.1:50062
```

---

## Fallback Chain (Guaranteed Safety)

```
ACE requests search for query
  ↓
1. Qdrant + Postgres parallel search (always works)
  ↓
2. RRF fusion (deterministic combination)
  ↓
3. TurboVec reranking (optional, non-blocking)
  ├─ If enabled + online: reorder by TurboVec score
  ├─ If disabled: skip (use fused order)
  └─ If offline/timeout: log warning, use fused order
  ↓
4. Return packets (same shape, possibly re-ordered)
```

**Key invariant**: If TurboVec fails at any point, retrieval returns the Qdrant+Postgres fused result unchanged. **No 500 error, no degradation.**

---

## Type Safety

**Check that `ScoredResult` type includes `id` and `score`**:

```bash
cd sveltekit-frontend
grep -n "type ScoredResult\|interface ScoredResult" src/lib/server/routing/query-router-4x4.ts
# Should show: type ScoredResult = { id: string; score: number; source: string; };
```

**All turbo Vec methods already exist**:
```bash
grep -n "turbovecGrpcSearch\|TurboVecGrpcSearchResponse" src/lib/server/grpc/turbovec-cuda-client.ts
# Should show line 150+ for turbovecGrpcSearch
```

---

## Testing Strategy

### Unit Test (20 min)

```typescript
// tests/turbovec-reranker.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { applyTurboVecRerank } from './path-to-context-assembler';

describe('TurboVec Reranker', () => {
  it('should return original order if TurboVec disabled', async () => {
    process.env.TURBOVEC_SIDECAR_GRPC_ENABLED = 'false';
    const results = [
      { id: '1', score: 0.9, source: 'qdrant' },
      { id: '2', score: 0.8, source: 'qdrant' },
    ];
    const { reranked, applied } = await applyTurboVecRerank(results, new Float32Array(768), new Map());
    expect(applied).toBe(false);
    expect(reranked).toEqual(results);
  });

  it('should reorder by TurboVec score if available', async () => {
    // Mock turbovecGrpcSearch
    vi.mock('$lib/server/grpc/turbovec-cuda-client', () => ({
      turbovecGrpcSearch: () => Promise.resolve({
        candidates: [
          { id: '2', score: 0.95, clusterId: 0 }, // Note: different order
          { id: '1', score: 0.80, clusterId: 0 },
        ],
      }),
    }));

    const results = [
      { id: '1', score: 0.9, source: 'qdrant' },
      { id: '2', score: 0.8, source: 'qdrant' },
    ];
    const { reranked, applied } = await applyTurboVecRerank(results, new Float32Array(768), new Map());
    expect(applied).toBe(true);
    expect(reranked[0].id).toBe('2'); // '2' moved to top
  });

  it('should gracefully fall back if TurboVec unavailable', async () => {
    vi.mock('$lib/server/grpc/turbovec-cuda-client', () => ({
      turbovecGrpcSearch: () => Promise.reject(new Error('gRPC timeout')),
    }));

    const results = [{ id: '1', score: 0.9, source: 'qdrant' }];
    const { reranked, applied } = await applyTurboVecRerank(results, new Float32Array(768), new Map());
    expect(applied).toBe(false);
    expect(reranked).toEqual(results);
  });
});
```

### Integration Test (15 min)

```bash
# Manual E2E test
cd sveltekit-frontend

# 1. Ensure TurboVec sidecar is running
node ../scripts/atlas/turbovec-grpc-health.mjs
# Expected: {"ok": true, ...}

# 2. Run ACE with reranker enabled
TURBOVEC_SIDECAR_GRPC_ENABLED=true npm run dev

# 3. Query via API (curl or Postman)
curl -X POST http://localhost:5173/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What is a contract?"}],
    "model": "gemma4-legal-iq4xs:latest"
  }'

# 4. Check logs for TurboVec rerank message
# Expected in console: "[ACE] TurboVec reranking applied: 50 candidates"
# Or: "[ACE] TurboVec reranking failed: gRPC timeout" (graceful fallback)

# 5. Verify response is correct
# Should return LLM response with top retrieval packets
```

---

## Rollout Plan

### 1. **Local Testing** (1 hour)
   - Wire code (30 min)
   - Unit tests (20 min)
   - Manual E2E test (10 min)

### 2. **Staging Deployment** (optional)
   - Deploy to staging with `TURBOVEC_SIDECAR_GRPC_ENABLED=false` (default OFF)
   - Run smoke tests
   - Check logs for any errors

### 3. **Production Rollout**
   - Deploy code (TurboVec still OFF by default)
   - Enable TurboVec for 10% of requests (canary)
   - Monitor latency + quality metrics (NDCG) for 1 hour
   - If stable: enable for 100% of requests

### 4. **Measurement (Next Phase)**
   - Track TurboVec hit rate via Langfuse
   - Compare NDCG with/without reranking
   - Publish results

---

## Commit Message

```
feat(retrieval): add TurboVec reranker (Stage A2)

Optional non-blocking reranking of Qdrant+Postgres fused results
using TurboVec ANN index. Reorders top-K candidates by cosine similarity.

- Import turbovecGrpcSearch from grpc client
- Add applyTurboVecRerank() function with graceful fallback
- Gate behind TURBOVEC_SIDECAR_GRPC_ENABLED env var (default: false)
- Add telemetry tracking via topoPrefilter stats

Fallback chain:
  Qdrant+Postgres (always) → RRF fusion → TurboVec rerank (optional)

If TurboVec unavailable: silently fall back to fused order, no error.
If TurboVec timeout: log warning, return original results.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| TurboVec gRPC timeout slows down retrieval | Deadline: 2000ms (short); fallback to original order; non-blocking |
| Reranking changes relevance (bad) | A/B test to measure NDCG before shipping to 100% |
| TurboVec sidecar not running | Health gate in startup checks; graceful null return; fallback to Qdrant-only |
| Sidecar OOM or crash | Automatic restart (Docker/systemd); retrieval continues without reranking |

---

## Success Criteria

✅ **Code**:
- Compiles without errors
- Types match (ScoredResult interface)
- Tests pass (unit + integration)

✅ **Functionality**:
- Qdrant+Postgres results unchanged if TurboVec disabled
- Results reordered if TurboVec enabled
- Graceful fallback on TurboVec error

✅ **Performance**:
- Latency overhead <5% (TurboVec 2ms + fallback logic <0.5ms)
- No increase in errors/exceptions
- Sidecar not OOM'd

✅ **Observability**:
- Logs show when reranking is applied/skipped
- Langfuse traces track duration + fallback events
- Health probes confirm TurboVec status

---

## Next Phase (After Phase 1 Successful)

Once reranker is live and stable (24+ hours):

### Phase 2: Prefilter (Option A)
- Use TurboVec to get top-5 SOM clusters *before* Qdrant search
- Pass cluster IDs as `must_filter` to Qdrant
- Trade-off: 2 network roundtrips vs 2-3× faster search

### Phase 3: Measurement
- A/B test to measure NDCG improvement
- Track TurboVec hit rate and fallback frequency
- Decide on permanent rollout or rollback

---

## Files Modified

- `src/lib/server/features/ai/ace/context-assembler.ts` — Add import + function + call (~40 lines net)
- `tests/turbovec-reranker.spec.ts` — New test file (~80 lines)
- `docs/turbovec-reranker-implementation.md` — This document

**No changes to**:
- `env.server.ts` (already has config)
- `turbovec-cuda-client.ts` (use as-is)
- `proto` definitions (use as-is)

---

## Estimated Timeline

| Task | Duration | Owner |
|------|----------|-------|
| Read + understand flow | 30 min | Dev |
| Write reranker function | 20 min | Dev |
| Wire into context-assembler | 10 min | Dev |
| Unit tests | 20 min | Dev |
| E2E manual test | 15 min | QA |
| Code review | 15 min | Lead |
| Commit + push | 5 min | Dev |
| **Total** | **1h 55m** | |

**Actually achievable in one afternoon** (2 hours real time, accounting for setup/testing).

---

**Recommendation**: Start now. Implement Phase 1 (reranker) this week. Phase 2 (prefilter) + Phase 3 (measurement) next week.
