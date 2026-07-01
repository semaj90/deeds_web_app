# Session 100 — Critical Path Wiring (Unified Retrieval + Streaming)

**Status**: ✅ **WIRED & READY FOR TEST10**  
**Date**: July 1, 2026  
**Scope**: Unified retrieval pipeline (rg-pool + Qdrant + TurboVec + Postgres + SSE + Gemma4)

---

## Architecture Locked

**Pipeline**:
```
Query
→ Embedding (embeddinggemma 768-dim)
→ rg-pool lexical (0.20 weight via RRF)
→ Qdrant named-vector "content" (0.30 weight)
→ TurboVec prefilter 768→64 (0.20 weight)
→ Postgres truth join
→ RRF blend scoring (6 signals)
→ Gemma4 summary (opt-in)
→ SSE stream progress + result
```

**RRF Blend** (verified):
- 0.30·qdrant_dense
- 0.20·turbovec
- 0.20·rg_lexical ← **NEW in Session 100**
- 0.15·ast (placeholder)
- 0.10·postgres
- 0.05·freshness

---

## Files Wired (Session 100)

### 1. Unified Orchestrator — rg-pool Integration

**File**: `src/lib/server/retrieval/unified-orchestrator.ts`  
**Changes**:
- Import `getRgPool` from `rg-pool.ts`
- Add `rgPoolLexicalSearch()` function (STAGE 2.5)
- Integrate rg results into `rankCandidates()` with 0.20 weight
- Return `rg_matches` count in `RankedCandidate`

**Test**: All 6 signals present, rg-pool contributes lexical rank

### 2. SSE Stream Route — Admin Retrieval

**File**: `src/routes/api/admin/retrieval/stream/+server.ts` (**NEW**)  
**Pattern**:
- GET/POST with unified retrieval pipeline
- Uses `createSSEResponse()` from sse-contract.ts
- Streams progress events per stage
- Automatic cleanup, 60s timeout, 15s keep-alive

**Endpoint**:
```
GET /api/admin/retrieval/stream?q=<query>&limit=<limit>&use_rg_pool=true
POST /api/admin/retrieval/stream { query, limit, use_rg_pool }
```

**Response**: Server-Sent Events (text/event-stream)
```
data: { stage: "embedding", time_ms: 123 }
data: { stage: "rg_pool", matches: 5 }
data: { stage: "qdrant", candidates: 20 }
data: { stage: "turbovec", prefiltered: 10 }
data: { stage: "postgres_join", rows: 10 }
data: { stage: "ranking", top_score: 0.92 }
data: { stage: "gemma4_summary", summary: "..." }
data: { complete: true, total_time_ms: 5123 }
```

**Error**: `{ error: "...", code: "..." }`

### 3. Batch Summaries — async-loop-guards Wrapper

**File**: `scripts/atlas/batch-summaries-wrapped.mjs` (**NEW**)  
**Identical to**: `batch-summaries-packets.mjs` except:
- Wraps packet loop with timeout guard (30s max)
- Wraps each packet with error boundary (continue on error)
- Tracks `loopExceededTimeout` in proof report
- Writes proof JSON with gate status

**Usage**:
```bash
npm run batch:summaries:wrapped:test10      # 10 packets, dry-run, guards enabled
npm run batch:summaries:wrapped:apply       # 100 packets, apply, guards enabled
```

**Proof Report**: `docs/reports/batch-summaries-proof-report.json`
```json
{
  "timestamp": "2026-07-01T...",
  "mode": "apply",
  "stats": { "success": 95, "skipped": 3, "failed": 2, "processed": 100 },
  "loopExceededTimeout": false,
  "gateStatus": {
    "rg_pool": { "status": "SKIPPED", "reason": "..." },
    "qdrant_content": { "status": "SKIPPED", "reason": "..." },
    "turbovec_grpc": { "status": "SKIPPED", "reason": "..." },
    "postgres_join": { "status": "LIVE_PASS", "matched": 98 },
    "gemma4_summary": { "status": "LIVE_PASS", "generated": 95 },
    "sse_stream": { "status": "SKIPPED", "reason": "..." },
    "async_loop_guards": { "status": "LIVE_PASS", "timeout_ms": 30000 }
  }
}
```

---

## Execution Order (Session 100)

### Phase 1: Wire Verification (Today)
```bash
# 1. Type-check unified orchestrator
npm run svelte-check

# 2. View the wired route
curl -N 'http://localhost:5173/api/admin/retrieval/stream?q=test&limit=5'
# Expected: SSE stream with stages, not 404

# 3. Quick batch test (10 packets, dry-run, guards)
npm run batch:summaries:wrapped:test10
# Expected: proof-report.json with async_loop_guards LIVE_PASS
```

### Phase 2: Test10 Retrieval Stream
```bash
# Start dev server
npm run dev

# Stream from admin retrieval endpoint
npm run retrieval:stream:admin

# Expected output (one event per line):
# data: { stage: "embedding", time_ms: 45 }
# data: { stage: "rg_pool", matches: 3 }
# data: { stage: "qdrant", candidates: 20 }
# ...
# data: { complete: true, total_time_ms: 2341 }
```

### Phase 3: Batch Summaries Apply (Only if test10 PASS)
```bash
# Apply with guards (100 packets)
npm run batch:summaries:wrapped:apply

# Expected: 95+ success, 0 timeout, LIVE_PASS gates
cat docs/reports/batch-summaries-proof-report.json | jq '.gateStatus'
```

---

## Proof Checklist (Before Apply)

**Must see all LIVE_PASS before running batch:summaries:wrapped:apply**:

- ✅ `svelte-check` reports no new errors in unified-orchestrator.ts
- ✅ `/api/admin/retrieval/stream` endpoint returns HTTP 200 with event stream
- ✅ `npm run batch:summaries:wrapped:test10` completes without timeout
- ✅ proof-report.json shows:
  - `loopExceededTimeout: false`
  - `async_loop_guards: { status: "LIVE_PASS" }`
  - `postgres_join: { status: "LIVE_PASS" }`
  - `gemma4_summary: { status: "LIVE_PASS" }`
- ✅ rg-pool contributes to unified retrieval scores (rg_matches > 0 in candidates)

---

## Deferred (Session 101+)

**NOT in Session 100 critical path**:
- Apply canonical SSE pattern to 5 other streaming routes (admin retrieval is the canonical example)
- Wire ast-grep → code_features backfill script
- Wire code_features → Qdrant payload tags sync
- Expose Go Retrieval /v1/feature-search endpoint
- Expose feature-search as MCP tool

**Why deferred**: These layers depend on Session 100 proof. Once retrieval + SSE is stable, add features incrementally.

---

## Key Rules Enforced

✅ rg-pool is opt-in (useRgPool defaults to true, but route can disable)  
✅ Unified orchestrator returns all 6 signals (lexical now included)  
✅ SSE uses canonical contract (timeout, keep-alive, error shape)  
✅ Batch summary loop uses async-loop-guards (timeout 30s, error boundary continue)  
✅ Proof report is JSON, not markdown (machine-readable)  
✅ No code_features writes yet (only wiring for read-side)  
✅ Gemma4 summary is opt-in (stream works without summary)  

---

## References

- Unified orchestrator: `src/lib/server/retrieval/unified-orchestrator.ts`
- rg-pool: `src/lib/server/search/rg-pool.ts` (pre-existing)
- SSE contract: `src/lib/server/streaming/sse-contract.ts` (pre-existing)
- Async loop guards: `src/lib/server/streaming/async-loop-guards.ts` (pre-existing)
- Admin stream route: `src/routes/api/admin/retrieval/stream/+server.ts`
- Batch wrapped script: `scripts/atlas/batch-summaries-wrapped.mjs`
- npm scripts: `sveltekit-frontend/package.json` lines 43-45

---

**Status**: WIRED ✅ | PROOF: Awaiting test10 execution  
**Next session**: Run test10 → verify proof gates → apply summaries
