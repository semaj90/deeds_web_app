# Phase 7 Decode Optimization Analysis

**Date**: 2026-07-03 18:56 UTC  
**Status**: 71.8% complete (28,124/39,151 chunks)  
**Current bottleneck**: CPU, not GPU

---

## Bottleneck Identified

### Resource Usage
- **llama-server CPU**: 2628% (maxed out, way over 8-core system)
- **Workers CPU**: 4 node processes at 160-163% each (actively consuming)
- **GPU VRAM**: ~5.8 GB (5.3GB model + 0.5GB cache)
- **Throughput**: 4K chunks/hour (70 tok/s effective)

### What This Means

**GPU is NOT the bottleneck.** CPU is starved trying to:
1. Parse JSON responses from llama-server (large payloads)
2. Marshal summary text for Postgres UPDATE
3. Queue message acks to RabbitMQ
4. Hash strings for BitFrost cache keys

The decode phase (GPU generating tokens) is **waiting on CPU to handle I/O**, not the other way around.

---

## Decode Optimization Levers

### 1. **Reduce JSON Response Parsing Overhead**

**Current flow**:
```
llama-server generates tokens → JSON response (full payload) → curl reads → Node parses JSON
```

**Problem**: Each summary response is ~300-500 bytes of JSON, 28K+ times.

**Option A: Streaming JSON (No-op for our case)**
- llama.cpp supports `stream: true` mode
- Not applicable here — we wait for full completion anyway

**Option B: Binary protocol between llama-server and worker**
- Replace HTTP JSON with binary wire protocol
- Overhead: Custom serialization code, not worth it

**Option C: Increase batch size at fetch level** ✅
- Current: 1 request at a time per worker
- **Change to**: Pipeline requests (worker 1 sends summary 1, fetches summary 2 simultaneously)
- Realistic gain: 10-15% (network overlap)

### 2. **Reduce Payload Marshalling (Postgres UPDATE)**

**Current bottleneck**: `UPDATE codebase_chunk_index SET summary = $1, updated_at = NOW() WHERE id = $2`

**Problem**: 28K UPDATE statements = 28K round-trips to Postgres.

**Option A: Batch UPDATEs** ✅
```sql
UPDATE codebase_chunk_index
SET (summary, updated_at) = (t.summary, NOW())
FROM (VALUES ($1, $2), ($3, $4), ...) AS t(summary, id)
WHERE codebase_chunk_index.id = t.id
```
- Batch 100 UPDATEs into single Postgres transaction
- Realistic gain: 20-30% (reduced context switches)

**Option B: Use COPY for bulk insert (not UPDATE)**
- Not applicable — we're updating existing rows
- Would need DELETE + INSERT pattern (risky for existing summaries)

### 3. **Reduce BitFrost Cache Key Hashing**

**Current**: SHA256(summary) for L1 cache key on every write
```typescript
const cacheKey = crypto.createHash('sha256').update(summary).digest('hex');
```

**Problem**: Hashing 28K× 300-byte strings = overhead

**Option A: Skip L1 exact-match caching during Phase 7** ✅
- Phase 7 is batch summarization, not repeated queries
- No cache hits possible (each chunk summarized once)
- Remove: `await redis.setex(L1_KEY, 3600, summary)`
- Realistic gain: 5-10% (skipped hashing + Redis roundtrip)

**Option B: Cache at Postgres write time (not Gemma4 call time)**
- Current: Hash immediately after LLM response
- Alternative: Batch hash after Postgres UPDATE confirms success
- Gain: Parallel hashing (async) → ~3-5%

### 4. **Optimize llama-server Prefill (CPU → GPU handoff)**

**Current**:
```
Worker sends 2KB prompt (system + context)
llama-server prefills on CPU first
Then GPU decode phase
```

**Bottleneck**: CPU prefill for every request (not parallelizable, sequential).

**Option A: Increase context window reuse** ✅
- Current: `--cache-prompt --cache-reuse 256` already enabled
- System prompt is only ~100 tokens → marginal win
- Theoretical gain: 2-3% (not the real bottleneck)

**Option B: Move to streaming mode for decode** ⚠️
- Use `stream: true` to get tokens incrementally
- Worker processes tokens as they arrive (no JSON wait)
- **Trade-off**: More network overhead, may be slower
- Gain: Maybe 0-5%

**Option C: Increase request parallelism per worker** ✅
- Current: 1 pending request per worker
- **Change to**: Fire 2-3 requests in flight (but prefetch logic)
- Risk: Overwhelm llama-server queue
- Realistic gain: 10-15% (if server can handle it)

---

## Recommended Changes (Ranked by Effort vs. Gain)

### Quick Wins (5-10 min, 10-25% throughput gain)

**1. Batch Postgres UPDATEs** ✅ **HIGH IMPACT**
```javascript
// Current: 1 UPDATE per summary
await pool.query('UPDATE ... WHERE id = $2', [summary, chunkId]);

// New: Batch 100 UPDATEs
if (batch.length === 100) {
  const values = batch.flatMap((s, i) => [s.summary, s.id]);
  await pool.query(batchUpdateSql, values);
  batch = [];
}
```
- **Expected gain**: 20-30%
- **Effort**: 15 minutes
- **Risk**: Low (transactional)

**2. Skip L1 cache during Phase 7** ✅ **MEDIUM IMPACT**
```javascript
// Current: Always hash
const cacheKey = crypto.createHash('sha256').update(summary).digest('hex');
await redis.setex(cacheKey, 3600, summary);

// New: Skip (Phase 7 is write-once, read-never)
if (process.env.PHASE7_SKIP_L1_CACHE !== 'true') {
  // ... cache logic
}
```
- **Expected gain**: 5-10%
- **Effort**: 5 minutes
- **Risk**: Very low (L1 hits unlikely in batch)

**3. Pipeline requests (prefetch next while current processes)** ✅ **MEDIUM IMPACT**
```javascript
// Current: await fetch() → process → repeat
// New: 
// Worker 1 sends summary request
// While waiting for response, fetch next chunk from queue
// Process previous response while new one arrives
```
- **Expected gain**: 10-15%
- **Effort**: 20 minutes (requires async refactor)
- **Risk**: Medium (off-by-one errors possible)

---

### Medium Effort (30-45 min, 5-15% gain)

**4. Increase worker request parallelism** ⚠️
- Fire 2-3 Gemma4 requests in flight per worker
- Monitor llama-server queue depth
- Risk: Overwhelm server if not tuned
- Gain: 10-15% if server can handle

---

### Not Recommended for Phase 7

- **Streaming JSON decode**: More overhead than gain
- **Binary protocol**: Engineering cost not justified
- **MTP draft models**: Adds complexity, doesn't solve CPU bottleneck

---

## Immediate Action Plan

### Step 1: Verify Current Performance (5 min)

```bash
# Measure latency breakdown on live server
time curl -s -X POST http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma4-legal-iq4xs-direct.gguf","messages":[{"role":"user","content":"Test"}],"max_tokens":50}'
# Note: Time includes network + JSON parse
```

### Step 2: Apply Quick Win #1 — Batch Postgres UPDATEs (15 min)

Edit `phase7-rabbitmq-summary-queue.mjs`:
- Accumulate summaries in buffer (100 items)
- Execute single batch UPDATE
- Expected result: 20-30% throughput increase

### Step 3: Apply Quick Win #2 — Skip L1 Cache (5 min)

Add flag:
```bash
PHASE7_SKIP_L1_CACHE=true npm run phase7:worker:cluster:4
```

### Step 4: Monitor Results (10 min)

```bash
# Check queue consumption rate
curl -s -u guest:guest http://127.0.0.1:15672/api/queues/%2F/phase7.summarization \
  | jq '.messages_ready, .messages, .backing_queue_status | select(.avg_ingress_rate)'

# Expected: consumption rate increases 20-50%
```

---

## Expected Results After Optimizations

| Optimization | Current | After | Cumulative |
|--------------|---------|-------|------------|
| Baseline | 4.4s/summary (4K/h) | — | — |
| + Batch UPDATEs | — | 3.2s/summary | +25% |
| + Skip L1 cache | — | 3.0s/summary | +32% |
| + Pipelined requests | — | 2.6s/summary | +41% |
| **Total** | 71.8% at 3h/11K | 71.8% at ~1.5h/11K | **-50% ETA** |

---

## Why NOT to Use MTP for This

- MTP optimizes **GPU token generation** (not CPU bottleneck)
- Current problem is **CPU marshalling/prefill**, not GPU decode
- MTP adds complexity (draft model + validation) = more CPU overhead
- BitFrost semantic cache breaks with different token paths (draft vs main)

**Conclusion**: Solve CPU bottleneck first (batch UPDATEs + L1 skip), then revisit GPU optimizations if needed.

---

## Implementation Priority

1. **Batch Postgres UPDATEs** — Highest ROI, lowest risk
2. **Skip L1 cache** — Trivial change, measurable gain
3. **Pipelined requests** — Medium effort, medium gain
4. **Monitor & iterate** — See if 40%+ gains materialize

**Start now**: Phase 7 has 11K chunks remaining. If we get 40% speedup, ETA drops from 3h to ~1.5h.
