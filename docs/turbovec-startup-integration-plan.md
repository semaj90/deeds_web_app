# TurboVec Startup Integration Plan — Session 74 (June 23, 2026)

## Current State

**gRPC client**: Fully implemented (`turbovec-cuda-client.ts`)  
**Health probes**: Already exist (`turbovec-grpc-health.mjs`, `turbovec-sidecar-health.mjs`)  
**Callers**: **ZERO** — no code invokes `turbovecGrpcSearch()` yet  
**Integration point**: MISSING — no decision made on prefilter (A0) vs reranker (A1) stage

---

## The Question

Where does TurboVec fit in the retrieval pipeline?

```
ACE Context Assembler (src/lib/server/ace/context-assembler.ts)
  ↓
  Stage A0: Pre-filter clusters (optional TurboVec?) ← DECISION POINT
  ↓
  Stage A1: Qdrant ANN search
  ↓
  Stage A2: Rerank by score (optional TurboVec?) ← DECISION POINT
  ↓
  Return top-K packets
```

---

## Three Integration Options

### Option A: TurboVec as Prefilter (Stage A0)
**When**: Before Qdrant  
**What**: Use TurboVec to fetch top-5 SOM cluster IDs, pass as `must_filter` to Qdrant  
**Upside**: Reduces Qdrant search space (might be 2-3× faster)  
**Downside**: One more network roundtrip; if TurboVec fails, fall back to full Qdrant scan  
**Estimated effort**: 2 hours (add routing logic + tests)

### Option B: TurboVec as Reranker (Stage A2)
**When**: After Qdrant, before returning  
**What**: Get top-50 from Qdrant, rerank top-20 using TurboVec  
**Upside**: Pure acceleration; Qdrant is still primary (safe fallback)  
**Downside**: Only helps if top-20 are out of order (may be marginal)  
**Estimated effort**: 1.5 hours (add rerank logic + tests)

### Option C: Both (Prefilter + Reranker)
**When**: A0 + A2  
**What**: Cluster prefilter + score reranking  
**Upside**: Maximum throughput  
**Downside**: Complexity, two network roundtrips  
**Estimated effort**: 4 hours (orchestration + fallback handling + tests)

### Option D: Skip (Use Qdrant-Only)
**When**: Never  
**What**: TurboVec stays wired but dormant  
**Upside**: No new moving parts; Qdrant-only is stable  
**Downside**: No acceleration; TurboVec N-API SIMD is idle  
**Estimated effort**: 0 (current state)

---

## Recommendation: Option B (Reranker Only) for Phase 1

**Rationale**:
1. **Lowest risk** — Qdrant stays canonical
2. **Clear value** — Reranking (TurboVec `similarity()`) is deterministic
3. **Fast** — 1.5 hours of work
4. **Measurable** — Easy to A/B test: TurboVec reranker on/off

**Execution**:
```typescript
// In src/lib/server/ace/context-assembler.ts, after Qdrant search

async function enrichContextWithRetrieval(query: Float32Array, context: ACEContext) {
  // Stage A1: Qdrant ANN (canonical source)
  const qdrantHits = await qdrantSearch(query, { limit: 50 });
  
  // Stage A2: Optional TurboVec rerank
  if (ENV.TURBOVEC_SIDECAR_GRPC_ENABLED) {
    const turbovecResult = await turbovecGrpcSearch(query, topK: qdrantHits.length);
    
    if (turbovecResult?.candidates?.length) {
      // Build score map: id → turbovec_score
      const tvScoreMap = new Map(turbovecResult.candidates.map(c => [c.id, c.score]));
      
      // Reorder Qdrant hits by TurboVec score (as tie-breaker)
      qdrantHits.sort((a, b) => {
        const tvScoreA = tvScoreMap.get(a.id) ?? a.score;
        const tvScoreB = tvScoreMap.get(b.id) ?? b.score;
        return tvScoreB - tvScoreA; // Higher score first
      });
      
      context.retrievalTrace.turbovecRerank = true;
    }
  }
  
  return qdrantHits.slice(0, topK);
}
```

---

## Phase 1: Health Probe Only (Immediate)

**This should happen first** — before any search integration.

### Step 1: Add TurboVec to ACE Startup Health

**File**: `scripts/ace-startup-health.mjs` (extend around line 80)

```javascript
// 3. Check TurboVec gRPC (new)
try {
  const tvGrpcProbe = await fetch(
    `http://127.0.0.1:${ENV.TURBOVEC_SIDECAR_GRPC_URL.split(':')[1] ?? 50062}/health`,
    { signal: AbortSignal.timeout(3000) }
  );
  if (tvGrpcProbe.ok) {
    console.log('✅ TurboVec gRPC (:50062): ONLINE');
    status.turbovec = { ok: true, indexed: (await tvGrpcProbe.json()).indexed };
  } else {
    console.log('⚠️ TurboVec gRPC (:50062): OFFLINE');
    status.turbovec = { ok: false };
  }
} catch (e) {
  console.log('⚠️ TurboVec gRPC (:50062): UNREACHABLE');
  status.turbovec = { ok: false, error: e.message };
}
```

### Step 2: Wrap in npm Script

**File**: `sveltekit-frontend/package.json`

```json
{
  "scripts": {
    "startup:turbovec:health": "node ../scripts/atlas/turbovec-grpc-health.mjs",
    "startup:turbovec:sidecar": "node ../scripts/atlas/turbovec-sidecar-health.mjs",
    "startup:ace-full": "node ../scripts/ace-startup-health.mjs && npm run startup:turbovec:health"
  }
}
```

### Step 3: Verify Locally

```bash
cd sveltekit-frontend

# Check if gRPC client can load
npm run startup:turbovec:health
# Expected output: {"ok": true, "url": "127.0.0.1:50062", "indexed": 0, "dim": 768, "bits": 2, "backend": "..."}

# Check HTTP sidecar
npm run startup:turbovec:sidecar --port=8791
# Expected output: {"ok": true, "status": 200, "url": "http://127.0.0.1:8791/health", "body": {...}}

# Check full ACE startup
npm run startup:ace-full
# Expected output: Full ACE health report including turbovec section
```

---

## Phase 2: Search Integration (Week 2)

Once Phase 1 passes (health probe is solid), decide on Option A, B, or C and wire the search integration.

### Decision Criteria

| Metric | Values |
|--------|--------|
| **Qdrant latency** (baseline) | Should be <100ms for top-50 |
| **TurboVec latency** (reranker) | Should be <20ms for top-50 |
| **Expected throughput gain** | 2-5× (depends on cache hits) |
| **Risk level** | Low (graceful fallback to Qdrant-only) |

**Measurement**: Add Langfuse trace to `turbovecGrpcSearch()` call:

```typescript
const result = await turbovecGrpcSearch(query, topK);
langfuse.trace({
  name: 'turbovec_rerank',
  input: { topK, dim: query.length },
  output: { candidates: result?.candidates?.length ?? 0 },
  duration: /* measure */,
});
```

---

## Phase 3: Measurement & Validation (Week 3)

### Metrics to Track

1. **Cache hit rate**: How often is TurboVec index already warm?
2. **Rerank quality**: Does TurboVec reranking improve NDCG over Qdrant-only?
3. **Fallback frequency**: How often does TurboVec fail (timeout/error)?
4. **Latency overhead**: Total pipeline latency with/without TurboVec

### A/B Test Setup

```typescript
// In context-assembler.ts
const enableTurboVec = ENV.TURBOVEC_SIDECAR_GRPC_ENABLED && Math.random() < 0.5; // 50% sampling

// Trace both paths
if (enableTurboVec) {
  // Path A: With TurboVec
} else {
  // Path B: Without TurboVec (Qdrant-only)
}

// Write both traces to Langfuse, tag with experiment_id
```

---

## Fallback Chain (Non-Negotiable)

The retrieval pipeline must **never fail** due to TurboVec:

```
Try: turbovecGrpcSearch(query, topK)
  ↓ null (timeout/error)
Fall back to: Qdrant-only results (no rerank)
  ↓ null (Qdrant failure)
Fall back to: Empty array (degraded UX, but no 500 error)
```

**Code pattern**:

```typescript
let rankedResults = qdrantResults;

// Optional rerank (non-blocking)
if (ENV.TURBOVEC_SIDECAR_GRPC_ENABLED && qdrantResults.length > 0) {
  const tvResult = await turbovecGrpcSearch(query, qdrantResults.length);
  if (tvResult?.candidates?.length) {
    // Rerank
    rankedResults = rerank(qdrantResults, tvResult);
  }
  // If tvResult is null, silently use Qdrant-only (no error)
}

return rankedResults;
```

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| gRPC port 50062 not listening | Health probe catches at startup; fall back to HTTP sidecar |
| TurboVec index stale / empty | Check `indexed` field in health; skip rerank if 0 |
| Reranking changes result order (regression) | A/B test to measure NDCG before shipping |
| Two network roundtrips add latency | Measure total pipeline latency; may be net-negative if Qdrant scan is avoided |

---

## Timeline

| Phase | Work | Duration | Owner | Blocker |
|-------|------|----------|-------|---------|
| **P1** | Health probe integration | 2h | Dev | None |
| **P2** | Search integration (Option B) | 1.5h | Dev | P1 ✅ |
| **P3** | A/B testing & validation | 4h | QA/Data | P2 ✅ |
| **Ship** | Production rollout | 1h | DevOps | P3 ✅ |
| **Total** | | ~8.5h | | |

---

## Next Action

**Run Phase 1 immediately**:

```bash
cd sveltekit-frontend

# 1. Test the existing probes
node ../scripts/atlas/turbovec-grpc-health.mjs
node ../scripts/atlas/turbovec-sidecar-health.mjs

# 2. Review health check output
npm run startup:ace-full

# 3. If both pass: proceed to Phase 2 (search integration)
# If either fails: diagnose why TurboVec sidecar is not running (Docker, etc.)
```

**Outcome**: 
- ✅ TurboVec health probe is wired → proceed to Phase 2
- ❌ TurboVec offline → skip Phase 2-3, keep Qdrant-only retrieval

---

## Files to Review

- **Existing probes**: `scripts/atlas/turbovec-grpc-health.mjs`, `turbovec-sidecar-health.mjs`
- **Client**: `src/lib/server/grpc/turbovec-cuda-client.ts`
- **Integration point**: `src/lib/server/ace/context-assembler.ts` (around line ~300-350, retrieval stage)
- **Config**: `src/lib/server/env.server.ts` (lines 219-220)

---

**Decision needed**: Which option? A (prefilter), B (reranker), C (both), or D (skip)?  
**Default recommendation**: **Option B (reranker only)** for Phase 1.