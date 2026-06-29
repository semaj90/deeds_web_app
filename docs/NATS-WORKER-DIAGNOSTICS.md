# NATS Worker Diagnostics & Proof-of-Life Testing

**Date**: June 28, 2026  
**Status**: WIRED but UNPROVEN — 5 subjects listening, versions need alignment  
**Scope**: NATS control bus + LangGraph compatibility audit + subject-level proof-of-life

---

## Current State

### ✅ NATS Transport: WIRED
Worker successfully connected and subscribed to 5 subjects:
- `agent.task.execute` ✅ listening
- `retrieval.turbovec.rerank` ✅ listening
- `gpu.cuvs.search` ✅ listening
- `gpu.cuda.rank` ✅ listening
- `engram.feedback.async` ✅ listening

### ⚠️ LangGraph Version Mismatch: WARN
```
TypeScript:  @langchain/langgraph@1.3.2
SDK:         @langchain/langgraph-sdk@1.9.4
Status:      Incompatible (1.15.1 vs 1.18.2 client/server)
```

### ⏳ Subject-Level Proof: NOT YET PROVEN
Each subject is listening but not proven to:
- Receive published messages
- Process them correctly
- Return expected responses
- Persist state (where applicable)

---

## Diagnosis: LangGraph Version Mismatch

### Root Cause
TypeScript `@langchain/langgraph` (1.3.2) is older than SDK `@langchain/langgraph-sdk` (1.9.4).
The SDK may have breaking changes or new APIs that the TS client doesn't yet support.

### Symptoms
- Worker connects successfully (NATS transport OK)
- Client version warning: `1.15.1 vs 1.18.2`
- No runtime errors (yet — they may emerge on task execution)

### Risk Assessment
| Scenario | Likelihood | Impact |
|----------|-----------|--------|
| Subjects work as-is | 30% | No action needed |
| Subjects fail on task publish | 50% | Need version alignment |
| Silent data corruption | 10% | Undetected errors |
| Full incompatibility | 10% | Complete rewire needed |

---

## Resolution: Two Paths

### Path A: Align Versions (Production-Ready)
```bash
# Upgrade TypeScript client to latest
npm install @langchain/langgraph@^1.9.4

# Then run proof-of-life
npm run nats:proof-of-life:all

# Expected: All 5 subjects pass
```

**Pros**: Full compatibility, official API support, no hacks  
**Cons**: May require code changes if SDK API changed

### Path B: Dev-Only Compatibility Skip (Development Only)
```bash
# Mark in .env or startup script
export DEV_ONLY_COMPAT_SKIP=true

# Then run proof-of-life
npm run nats:proof-of-life:all

# Expected: Tests may pass, but marked as UNVERIFIED
```

**Pros**: Quick workaround, transparent marker  
**Cons**: Production risk, hides underlying issues

---

## Proof-of-Life Test Plan

Run after choosing a resolution path.

### Test Script
```bash
npm run nats:proof-of-life:all
```

### What It Does
1. **Connects** to NATS (default: `nats://localhost:4222`)
2. **Publishes** a test message to each of 5 subjects
3. **Waits** for response (5s timeout)
4. **Verifies** response structure and content
5. **Reports** pass/fail for each subject

### Expected Output (All Pass)
```
✅ agent.task.execute
   Duration: 245ms
   Message: Task echo: executed

✅ retrieval.turbovec.rerank
   Duration: 312ms
   Message: TurboVec rerank: 3 candidates reordered

✅ gpu.cuvs.search
   Duration: 487ms
   Message: cuVS search: 5 results (GPU)

✅ gpu.cuda.rank
   Duration: 198ms
   Message: CUDA rank: 2 items ranked (GPU)

✅ engram.feedback.async
   Duration: 156ms
   Message: Engram feedback: persisted=true, outcome=fixed

🎯 Result: 5/5 subjects passed
Status: PROVEN ✓
```

### Expected Output (Some Fail)
```
✅ agent.task.execute
   Duration: 245ms
   Message: Task echo: executed

⏱️ retrieval.turbovec.rerank
   Timeout after 5000ms

❌ gpu.cuvs.search
   Error: No handler registered

...

🎯 Result: 2/5 subjects passed
Status: PARTIALLY PROVEN — Need to debug failing subjects
```

---

## Test Breakdown: What Each Subject Tests

### 1. agent.task.execute
**Purpose**: Echo task execution (baseline sanity check)

**Publish**:
```json
{
  "task_id": "uuid-here",
  "task_type": "echo",
  "payload": { "message": "hello" },
  "timestamp": "2026-06-28T..."
}
```

**Expected Response**:
```json
{
  "task_id": "uuid-here",
  "status": "executed",
  "result": { "message": "hello" }
}
```

**Verifies**: Basic NATS pub/sub, message serialization, response routing

---

### 2. retrieval.turbovec.rerank
**Purpose**: TurboVec reranking pipeline (retrieval lane)

**Publish**:
```json
{
  "query_id": "uuid-here",
  "candidates": [
    { "id": "c1", "score": 0.9 },
    { "id": "c2", "score": 0.7 },
    { "id": "c3", "score": 0.5 }
  ],
  "timestamp": "2026-06-28T..."
}
```

**Expected Response**:
```json
{
  "query_id": "uuid-here",
  "reranked": [
    { "id": "c1", "score": 0.95 },
    { "id": "c2", "score": 0.72 },
    { "id": "c3", "score": 0.48 }
  ],
  "backend": "turbovec-gpu"
}
```

**Verifies**: Retrieval pipeline, vector math, reranking logic

---

### 3. gpu.cuvs.search
**Purpose**: GPU-accelerated CUVS search (with CPU fallback)

**Publish**:
```json
{
  "query_id": "uuid-here",
  "query_embedding": [0.1, 0.1, ..., 0.1],  // 768-dim
  "k": 10,
  "timestamp": "2026-06-28T..."
}
```

**Expected Response** (GPU):
```json
{
  "query_id": "uuid-here",
  "results": [
    { "id": "packet:001", "score": 0.95, "distance": 0.05 },
    ...
  ],
  "backend": "cuvs-gpu",
  "count": 10
}
```

**Expected Response** (CPU Fallback):
```json
{
  "query_id": "uuid-here",
  "results": [...],
  "backend": "cpu-fallback",
  "count": 10,
  "warning": "GPU unavailable, using CPU"
}
```

**Verifies**: GPU search health, fallback chain, vector math

---

### 4. gpu.cuda.rank
**Purpose**: GPU-accelerated ranking (with CPU fallback)

**Publish**:
```json
{
  "query_id": "uuid-here",
  "candidates": [
    { "id": "a", "vector": [0.1, 0.1, ..., 0.1] },
    { "id": "b", "vector": [0.2, 0.2, ..., 0.2] }
  ],
  "query_vector": [0.15, 0.15, ..., 0.15],
  "timestamp": "2026-06-28T..."
}
```

**Expected Response** (GPU):
```json
{
  "query_id": "uuid-here",
  "ranking": [
    { "id": "b", "score": 0.98 },
    { "id": "a", "score": 0.92 }
  ],
  "backend": "cuda-gpu"
}
```

**Expected Response** (CPU):
```json
{
  "query_id": "uuid-here",
  "ranking": [...],
  "backend": "cpu-fallback",
  "warning": "GPU unavailable"
}
```

**Verifies**: GPU ranking, cosine similarity, CUDA availability

---

### 5. engram.feedback.async
**Purpose**: Agentic feedback persistence (async non-blocking)

**Publish**:
```json
{
  "feedback_id": "uuid-here",
  "recommendation_id": "uuid-here",
  "user_acceptance": true,
  "outcome": "fixed",
  "metadata": { "duration_ms": 1234 },
  "timestamp": "2026-06-28T..."
}
```

**Expected Response**:
```json
{
  "feedback_id": "uuid-here",
  "persisted": true,
  "row_id": "postgres-row-id",
  "outcome": "fixed"
}
```

**Verifies**: Async event loop, Postgres persistence, feedback schema

---

## Status Matrix

| Subject | NATS Connection | Listening | Proof-of-Life | Status |
|---------|-----------------|-----------|--------------|--------|
| agent.task.execute | ✅ | ✅ | ⏳ TBD | WIRED |
| retrieval.turbovec.rerank | ✅ | ✅ | ⏳ TBD | WIRED |
| gpu.cuvs.search | ✅ | ✅ | ⏳ TBD | WIRED |
| gpu.cuda.rank | ✅ | ✅ | ⏳ TBD | WIRED |
| engram.feedback.async | ✅ | ✅ | ⏳ TBD | WIRED |

---

## Version Audit Details

### Current Versions
```
TypeScript @langchain/langgraph:     1.3.2
SDK @langchain/langgraph-sdk:        1.9.4
Version delta:                       6 minor versions behind
Client/Server protocol:              1.15.1 vs 1.18.2 (incompatible)
```

### Audit Script
```bash
npm run langgraph:version:audit
```

**Output**:
```
📦 TypeScript LangGraph Versions:
   @langchain/langgraph: 1.3.2
   @langchain/langgraph-sdk: 1.9.4

🐍 Python LangGraph Versions:
   (Python environment not available)

🔧 Compatibility Status:
   ⚠️  Version mismatch detected

💡 Options:
   Option 1: Align Versions (Production)
   Option 2: DEV_ONLY_COMPAT_SKIP (Development)
   Option 3: Downgrade SDK (Not Recommended)
```

---

## Next Steps (In Order)

### 1. Choose Resolution Path
```bash
# Production: Align versions
npm install @langchain/langgraph@^1.9.4

# OR Development: Add skip marker
export DEV_ONLY_COMPAT_SKIP=true
```

### 2. Run Version Audit (Verify)
```bash
npm run langgraph:version:audit
```

### 3. Run Proof-of-Life (Prove Each Subject)
```bash
npm run nats:proof-of-life:all
```

### 4. Verify All 5 Subjects Pass
```
Expected: 5/5 subjects passed
Status: PROVEN ✓
```

### 5. Mark Status (Update Docs)
Once all subjects pass:
```
NATS worker: WIRED ✓
Distributed task bus: WIRED ✓
LangGraph compatibility: VERIFIED ✓
Subject proof: ALL PROVEN ✓
```

---

## Troubleshooting

### Symptom: Timeouts on all subjects
**Cause**: NATS server not running or wrong URL  
**Fix**:
```bash
docker ps | grep nats
# If not running:
docker-compose up -d nats
```

### Symptom: All subjects fail quickly
**Cause**: LangGraph version incompatibility preventing task handlers from starting  
**Fix**: Choose Path A (align versions) and rebuild

### Symptom: Some subjects timeout, others pass
**Cause**: Uneven handler registration or async startup delays  
**Fix**: Add 1-2s delays between tests, re-run proof-of-life

### Symptom: Proof-of-life passes but real tasks fail
**Cause**: Test messages are simpler than production messages  
**Fix**: Add detailed logging to task handlers, check handler implementation

---

## Files Reference

| File | Purpose |
|------|---------|
| `scripts/nats/proof-of-life-all-subjects.mjs` | Main proof-of-life test (publish → verify) |
| `scripts/langgraph-version-audit.mjs` | Version diagnosis + resolution options |
| `docs/NATS-WORKER-DIAGNOSTICS.md` | This document |

---

## Key Principles

✅ **NATS transport**: Proven working  
✅ **Subject subscriptions**: All 5 registered  
⚠️ **LangGraph compatibility**: Needs version alignment or skip marker  
⏳ **Subject-level proof**: Pending test execution  

**Do not call this DONE until**:
1. Versions are aligned (or skip marker explicitly added)
2. All 5 subjects pass proof-of-life test
3. Status updated to "PROVEN"

---

**Created by**: Claude (Anthropic)  
**Date**: June 28, 2026  
**Status**: DIAGNOSTIC COMPLETE, RESOLUTION PENDING  
**Next Action**: Choose resolution path → run version audit → run proof-of-life
