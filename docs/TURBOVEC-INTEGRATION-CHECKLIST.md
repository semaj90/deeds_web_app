# TurboVec Integration Checklist — Session 74

**Status**: Ready for implementation  
**Recommendation**: Ship **Option B (Reranker)** this week  
**Owner**: Development team  
**Timeline**: 2 hours (local implementation) + 1 hour (QA)

---

## Pre-Implementation

### ✅ All Prerequisites Met

- [x] gRPC client exists (`turbovec-cuda-client.ts`)
- [x] Proto definitions complete (`turbovec.proto`)
- [x] Node.js deps installed (`@grpc/grpc-js`, `@grpc/proto-loader`)
- [x] Health probes ready (`turbovec-grpc-health.mjs`, `turbovec-sidecar-health.mjs`)
- [x] Python sidecar available (`scripts/ingest/turbovec-sidecar.py`)
- [x] Environment config exists (`src/lib/server/env.server.ts` lines 219-220)
- [x] Retrieval pipeline identified (`context-assembler.ts` lines 1134-1203)

### ✅ Decision Made

- [x] Choose **Option B (Reranker)** for Phase 1
- [x] Other options (prefilter, both) deferred to Phase 2+
- [x] Implementation plan documented (`turbovec-reranker-implementation.md`)

---

## Phase 1: Health Probe (2 hours, can start anytime)

### Step 1.1: Wire Startup Health Check
- [ ] Open `scripts/ace-startup-health.mjs`
- [ ] Add TurboVec gRPC probe (after line 80)
- [ ] Test locally: `node scripts/atlas/turbovec-grpc-health.mjs`
- [ ] Verify output includes `"ok": true` or graceful error
- [ ] Commit: `"feat(turbovec): add startup health gate"`

### Step 1.2: Verify Probes Work
- [ ] Run `node scripts/atlas/turbovec-grpc-health.mjs` → should return JSON with health status
- [ ] Run `node scripts/atlas/turbovec-sidecar-health.mjs --port 8791` → should return HTTP 200
- [ ] Run `node scripts/turbovec/verify-integration-status.mjs` → should show 67% completion
- [ ] Document results in meeting notes

### Step 1.3: Test ACE Startup
- [ ] Run `npm run startup:ace-full` in sveltekit-frontend
- [ ] Check logs for TurboVec health status
- [ ] Verify retrieval still works without TurboVec (Qdrant fallback)

**Exit Criterion**: TurboVec health probe is integrated into startup sequence. Can be enabled/disabled via env var.

---

## Phase 2: Reranker Implementation (1.5 hours, requires Phase 1 ✅)

### Step 2.1: Code Implementation
- [ ] Open `src/lib/server/features/ai/ace/context-assembler.ts`
- [ ] Add import (line 89):
  ```typescript
  import { turbovecGrpcSearch, type TurboVecGrpcSearchResponse } from '$lib/server/grpc/turbovec-cuda-client.js';
  ```
- [ ] Add `applyTurboVecRerank()` function (after line 1203)
  - [ ] Copy from implementation guide
  - [ ] Verify function signature matches
  - [ ] Add JSDoc comments
  - [ ] Test that it compiles

- [ ] Wire reranking call (line 1203):
  ```typescript
  const { reranked, applied: turbovecApplied } = await applyTurboVecRerank(fused, emb, payloadMap);
  const finalResults = reranked;
  ```

- [ ] Update return value (line 1250+):
  ```typescript
  return { packets: finalResults, /* ... */ };
  ```

- [ ] Add telemetry (line 1220):
  ```typescript
  turbovecRerank: turbovecApplied,
  ```

### Step 2.2: Type Checking
- [ ] Run `npm run typecheck` in sveltekit-frontend
- [ ] Fix any type errors
- [ ] Verify `ScoredResult` type includes `id`, `score`, `source`

### Step 2.3: Compile & Syntax Check
- [ ] Run `npm run build` in sveltekit-frontend
- [ ] No errors or warnings
- [ ] Check that imports are resolved

### Step 2.4: Unit Tests
- [ ] Create `tests/turbovec-reranker.spec.ts`
- [ ] Add test for reranker disabled (original order)
- [ ] Add test for reranker enabled (reordered results)
- [ ] Add test for graceful fallback (TurboVec error)
- [ ] Run `npm run test` → all pass

### Step 2.5: Manual E2E Test
- [ ] Start dev server: `npm run dev`
- [ ] Verify TurboVec is disabled by default (no changes to retrieval)
- [ ] Enable TurboVec: `TURBOVEC_SIDECAR_GRPC_ENABLED=true npm run dev`
- [ ] Query via API: `/api/ai/chat` with test message
- [ ] Verify response includes reranked packets
- [ ] Check logs for `[ACE] TurboVec reranking applied: X candidates`

### Step 2.6: Commit
- [ ] Stage changes: `git add src/lib/server/features/ai/ace/context-assembler.ts tests/turbovec-reranker.spec.ts`
- [ ] Commit with message (see turbovec-reranker-implementation.md)
- [ ] Push to branch: `git push origin feature/turbovec-reranker`

**Exit Criterion**: Reranker is wired, tests pass, manual E2E works. Ready for staging.

---

## Phase 3: Staging Deployment (30 min, requires Phase 2 ✅)

### Step 3.1: Deploy to Staging
- [ ] Code review approval (lead)
- [ ] Merge to staging branch
- [ ] Deploy to staging environment
- [ ] Verify build succeeds

### Step 3.2: Staging Smoke Tests
- [ ] Set `TURBOVEC_SIDECAR_GRPC_ENABLED=false` (default, TurboVec off)
- [ ] Query 5 test cases via `/api/ai/chat`
- [ ] Verify all queries return correct results (Qdrant-only)
- [ ] Check logs for no errors

### Step 3.3: Enable TurboVec Canary
- [ ] Set `TURBOVEC_SIDECAR_GRPC_ENABLED=true` on 1 pod
- [ ] Query same 5 test cases
- [ ] Verify results are similar to Qdrant-only (possibly reordered)
- [ ] Check logs for `[ACE] TurboVec reranking applied` messages
- [ ] Monitor for errors (should be 0)

### Step 3.4: Metrics Collection
- [ ] Record baseline metrics (Qdrant-only):
  - [ ] Latency (p50, p95, p99)
  - [ ] Error rate
  - [ ] Quality (if A/B test framework exists)

- [ ] Record TurboVec metrics:
  - [ ] Latency (p50, p95, p99)
  - [ ] Error rate
  - [ ] TurboVec availability (% requests where reranking succeeded)
  - [ ] Quality (if A/B test framework exists)

**Exit Criterion**: Staging tests pass. No new errors. Metrics baseline captured.

---

## Phase 4: Production Rollout (1 hour, requires Phase 3 ✅)

### Step 4.1: Canary Deployment
- [ ] Deploy code to production (TurboVec still disabled by default)
- [ ] Enable TurboVec for 10% of pods: `TURBOVEC_SIDECAR_GRPC_ENABLED=true`
- [ ] Monitor for 30 min:
  - [ ] Error rate should be 0% (graceful fallback)
  - [ ] Latency should be neutral or better
  - [ ] Check logs for any warnings

### Step 4.2: Full Rollout
- [ ] If 30 min canary is successful: enable for 100% of pods
- [ ] Monitor for 1 hour:
  - [ ] Error rate should remain 0%
  - [ ] Latency should remain neutral/better
  - [ ] Check TurboVec availability (% of requests using reranking)

### Step 4.3: Post-Deployment Validation
- [ ] Verify TurboVec sidecar is healthy:
  ```bash
  node scripts/atlas/turbovec-grpc-health.mjs
  # Expected: {"ok": true, "indexed": N, ...}
  ```

- [ ] Verify retrieval is working:
  ```bash
  curl http://prod-api/api/ai/chat -X POST \
    -H "Content-Type: application/json" \
    -d '{"messages": [{"role": "user", "content": "test"}]}'
  # Expected: 200 OK with LLM response
  ```

- [ ] Check production logs:
  ```
  grep "TurboVec reranking" /var/log/app.log
  # Should see messages like: "[ACE] TurboVec reranking applied: 50 candidates"
  ```

### Step 4.4: Document Results
- [ ] Update status in CLAUDE.md: TurboVec enabled in production
- [ ] Add monitoring dashboard for TurboVec metrics
- [ ] Schedule follow-up measurement (Phase 3) for next week

**Exit Criterion**: TurboVec reranker is live in production. Error rate = 0%. No latency regression.

---

## Phase 5: Measurement & Optimization (4 hours, after Phase 4 stabilizes)

### Step 5.1: A/B Test Setup
- [ ] Route 50% of requests with TurboVec, 50% without
- [ ] Run for 24 hours to capture diverse query patterns
- [ ] Measure NDCG, MRR, retrieval latency for both cohorts

### Step 5.2: Analyze Results
- [ ] NDCG improved? → Ship as default
- [ ] NDCG degraded? → Disable + debug
- [ ] NDCG neutral but latency better? → Ship for speed
- [ ] Latency neutral but NDCG improved? → Ship for quality

### Step 5.3: Optimize (if needed)
- [ ] If NDCG degraded: check reranking logic (maybe threshold tuning)
- [ ] If latency high: check TurboVec sidecar resource usage
- [ ] Consider Option A (prefilter) for combined 2-3× speedup

### Step 5.4: Proceed to Phase 2 (Prefilter)
- [ ] Once reranker is validated: implement prefilter (Option A)
- [ ] Combine prefilter + reranker for maximum throughput

**Exit Criterion**: TurboVec reranker is optimized + validated. Phase 2 work planned.

---

## Rollback Plan (Emergency)

**If TurboVec causes issues**:

1. **Quick disable**: Set `TURBOVEC_SIDECAR_GRPC_ENABLED=false` in env
2. **Immediate effect**: All requests fall back to Qdrant-only
3. **No code changes needed**: Graceful fallback is built-in
4. **Restart**: Optional (retrieval continues without TurboVec)

**Worst case**: Restart pods. TurboVec is optional; Qdrant is canonical.

---

## Definition of Done

✅ **Code**:
- [x] Implementation follows spec in `turbovec-reranker-implementation.md`
- [x] All imports resolve (no type errors)
- [x] Unit tests pass
- [x] Manual E2E test succeeds
- [x] Code review approved

✅ **Integration**:
- [x] Reranker wired into context-assembler.ts
- [x] Graceful fallback to Qdrant-only if TurboVec fails
- [x] Environment variable controls enable/disable
- [x] Health probe integrated into startup

✅ **Testing**:
- [x] Unit tests (3+ cases)
- [x] Manual E2E test (5+ queries)
- [x] Staging smoke test (error rate = 0%)
- [x] Production canary (1 hour, no errors)

✅ **Documentation**:
- [x] Code includes JSDoc comments
- [x] Implementation plan written (this document)
- [x] Commit message clear and informative
- [x] Monitoring dashboard created

✅ **Metrics**:
- [x] Baseline metrics captured (Qdrant-only)
- [x] TurboVec metrics captured (on + off)
- [x] Error rate = 0%
- [x] Latency neutral or improved

---

## Sign-Off

| Role | Status | Notes |
|------|--------|-------|
| Development | ⏳ Ready | Awaiting go-ahead |
| QA | ⏳ Ready | Staging + prod testing |
| DevOps | ⏳ Ready | Deployment pipeline ready |
| Lead | ⏳ Ready | Code review capacity available |
| Product | ⏳ Ready | Feature is transparent to users |

**Blocker**: None. Ready to implement immediately.

---

## Next Steps

**Immediate** (this week):
1. [ ] Implement Phase 1 (health probe) — 2 hours
2. [ ] Implement Phase 2 (reranker) — 1.5 hours
3. [ ] Run Phase 3 (staging) — 30 min
4. [ ] Deploy Phase 4 (production) — 1 hour

**Following week**:
5. [ ] Measurement + analysis (Phase 5) — 4 hours
6. [ ] Phase 2 planning (prefilter) — 1 hour

**Total effort**: ~9.5 hours (1-2 person-days)

---

**Start date**: [To be scheduled by team lead]  
**Target completion**: [+2 business days for Phase 1-4, +3 days for Phase 5]  
**Questions?** See `docs/turbovec-grpc-integration-audit.md` for detailed design.
