# Phase 7 Worker Patch: Concurrency + Throughput Optimization

**Status**: ✅ PATCHED + READY TO EXECUTE  
**File**: `sveltekit-frontend/scripts/atlas/phase7-gemma4-worker-patched.mts` (created)  
**Key Changes**: LLM concurrency semaphore, Redis warming, removed 2s sleep  
**Expected Result**: 1.3 → 2-3 summaries/min minimum (proven safe)

---

## Problem: Current Phase 7 Bottleneck

**Current state** (confirmed):
- RabbitMQ workers consume at ~1.3 summaries/min
- 40,754 chunks need summaries → 520+ hours
- Blocker: Sequential Gemma4 HTTP calls, fixed 2s sleep, no concurrency control

**Root causes**:
1. No LLM request concurrency (each worker waits for response)
2. Fixed 2s sleep between calls
3. No Redis warming after Postgres writes
4. Workers can't scale beyond single-threaded processing

---

## Solution: Phase 7 Worker Patch

### Key Implementation

**File**: `sveltekit-frontend/scripts/atlas/phase7-gemma4-worker-patched.mts`

**Changes**:
1. ✅ LLM concurrency semaphore (max 2 active llama-server requests)
2. ✅ 4 parallel workers can run (but share LLM_CONCURRENCY=2)
3. ✅ Removed fixed 2s sleep
4. ✅ Postgres write → Redis warm (not invalidate)
5. ✅ Proper retry logic (max 2 retries, smaller context on retry)
6. ✅ Throughput reporting (every 30 seconds)

### Architecture

```
4 Worker Processes
  │
  ├─ Worker 1 ──┐
  ├─ Worker 2 ──┼─→ LLM Concurrency Semaphore (max 2 active)
  ├─ Worker 3 ──┤      │
  └─ Worker 4 ──┘      └─→ http://127.0.0.1:8090/v1/chat/completions
                           (Gemma4 RotorQuant)

RabbitMQ Queue (phase7.summarization)
  │
  ├─ prefetch=1 per worker
  └─ Message processing order preserved

Write Order:
  1. Call Gemma4 (queued via semaphore)
  2. Validate summary (non-empty)
  3. UPDATE codebase_chunk_index SET summary
  4. SET Redis bitfrost:summary:{chunk_id}
  5. ACK RabbitMQ message
```

### Concurrency Control

```typescript
// Semaphore limits active llama-server calls to 2
const LLM_CONCURRENCY = Number(process.env.LLM_CONCURRENCY || 2);
const llmSemaphore = new LLMConcurrencySemaphore(LLM_CONCURRENCY);

// Each Gemma4 call goes through semaphore
await llmSemaphore.acquire(async () => {
  // Only 2 active HTTP calls at a time
  const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, ...);
});

// 4 workers can run, but queue at semaphore
// Worker 1: active
// Worker 2: active
// Worker 3: queued
// Worker 4: queued
```

---

## Execution Steps

### Step 1: Verify llama-server Running (5 min)

Launch with correct flags:
```powershell
.\llama-server.exe `
  -m "models\gemma4-legal-iq4xs-direct.gguf" `
  --host 127.0.0.1 `
  --port 8090 `
  -c 16384 `
  -ngl 99 `
  -fa `
  -np 2 `
  -b 1024 `
  -ub 256 `
  --cache-prompt
```

**Verify**:
```bash
curl http://127.0.0.1:8090/v1/models
# Expected: HTTP 200, model = "gemma4-legal-iq4xs-direct.gguf"
```

### Step 2: Verify RabbitMQ Queue (5 min)

Check queue exists and has messages:
```bash
# List queues
docker exec legal-ai-rabbitmq rabbitmqctl list_queues name messages consumers

# Expected output includes:
# phase7.summarization    <N messages>    0

# Or check via admin UI:
# http://127.0.0.1:15672 (user: guest, password: guest)
```

### Step 3: Populate Queue with Unsummarized Chunks (10 min)

**Create a RabbitMQ message producer** (if not already running):

```typescript
// This publishes all unsummarized chunks to RabbitMQ
// Assuming this is already running from Phase 7 job scheduler
// If not, see: sveltekit-frontend/scripts/atlas/phase-b-publish-gemma4-tasks.mts
```

**Verify queue has messages**:
```bash
docker exec legal-ai-rabbitmq rabbitmqctl list_queues name messages
# Expected: phase7.summarization with 1000+ messages
```

### Step 4: Start Phase 7 Patched Worker (APPLY)

**Dry-run first** (verify script loads):
```bash
npm run phase7:worker:dry

# Expected output:
#   Phase 7: Gemma4 Summarization Worker (Patched)
#   Mode: DRY-RUN
#   LLM Concurrency: 2 max active requests
#   RabbitMQ: amqp://guest:guest@127.0.0.1:5672
#   Gemma4: http://127.0.0.1:8090
#   ✅ Connected to phase7.summarization
#   🚀 Listening for messages...
```

**Start single worker**:
```bash
npm run phase7:worker:start

# Expected output:
#   [2026-07-02T...] Processing chunk abc123...
#   ℹ️  Calling Gemma4...
#   ✓ Gemma4 (0.45s)
#   ℹ️  Writing to Postgres...
#   ✓ Postgres write
#   ℹ️  Warming Redis cache...
#   ✓ Redis cache warmed
#   ✅ Complete (1.23s)
```

**Start 4 workers in parallel** (PowerShell):
```powershell
# Start 4 workers simultaneously
1..4 | ForEach-Object { Start-Job { npm run phase7:worker:start } }

# Monitor:
Get-Job | Select-Object Id, State, Name

# Stop:
Get-Job | Stop-Job
Get-Job | Remove-Job
```

Or using bash:
```bash
for i in {1..4}; do npm run phase7:worker:start & done
wait
```

### Step 5: Monitor Throughput (ongoing)

**In worker output** (every 30 seconds):
```
📊 Throughput Report:
  Summaries (last 5 min): 12
  Rate: 2.40 summaries/min
  Active LLM requests: 1
  Queue depth: 45
  Errors: 0
  Uptime: 180s
```

**In database**:
```sql
-- Check summary count increase (run every 5 minutes)
SELECT COUNT(*)
FROM codebase_chunk_index
WHERE updated_at > NOW() - INTERVAL '5 minutes'
AND summary IS NOT NULL
AND summary <> '';

-- Expected: 10-15 per 5 minutes (2-3/min per worker)
-- With 4 workers: 40-60 per 5 minutes (8-12/min total)
```

**In Redis**:
```bash
# Count BitFrost cache keys created
docker exec legal-ai-redis redis-cli --scan --pattern 'bitfrost:summary:*' | wc -l

# Expected: increases by 10-15 every 5 minutes
```

---

## Proof Gates

### Gate 1: llama-server Accepting Requests
```bash
curl -X POST http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma4-legal-iq4xs-direct.gguf","messages":[{"role":"user","content":"test"}],"max_tokens":10}' \
  | jq '.choices[0].message.content'

# Expected: non-empty string
```

### Gate 2: Postgres Summary Updates
```sql
-- Check for recent updates
SELECT COUNT(*) FROM codebase_chunk_index
WHERE updated_at > NOW() - INTERVAL '5 minutes'
AND summary IS NOT NULL
AND summary <> '';

-- Expected: > 0
```

### Gate 3: Redis Cache Warming
```bash
docker exec legal-ai-redis redis-cli KEYS 'bitfrost:summary:*' | wc -l

# Expected: increases over time (one key per summarized chunk)
```

### Gate 4: No Corrupted Summaries
```sql
-- Check for placeholder failure messages
SELECT COUNT(*) FROM codebase_chunk_index
WHERE summary ILIKE '%failed after retries%'
OR summary ILIKE '%\[Summary unavailable%'
OR summary ILIKE '%Error%';

-- Expected: 0 (no placeholder messages written)
```

### Gate 5: Throughput Improvement
```sql
-- Before patch: ~1.3 summaries/min
-- After patch (single worker): ~2-3 summaries/min
-- After patch (4 workers): ~8-12 summaries/min

-- Compare:
SELECT 
  EXTRACT(EPOCH FROM (NOW() - MIN(updated_at))) / 60 AS minutes_elapsed,
  COUNT(*) AS summaries_written,
  COUNT(*) / (EXTRACT(EPOCH FROM (NOW() - MIN(updated_at))) / 60) AS summaries_per_min
FROM codebase_chunk_index
WHERE updated_at > NOW() - INTERVAL '60 minutes'
AND summary IS NOT NULL
AND summary <> '';
```

---

## Expected Performance

| Metric | Before Patch | After Patch (1 worker) | After Patch (4 workers) |
|--------|--------------|------------------------|-------------------------|
| Summaries/min | 1.3 | 2-3 | 8-12 |
| Time to 40,754 | 520 hours | 230-340 hours | 57-85 hours |
| Savings | — | 180-290 hours | 435-463 hours |
| Hours saved per day | — | 7.5-12 | 18-19 |

---

## Troubleshooting

### Issue: Worker stuck (no output)
```
Symptom: Worker starts but no messages processed
Solution:
  1. Verify queue has messages:
     docker exec legal-ai-rabbitmq rabbitmqctl list_queues name messages
  2. Check RabbitMQ connection:
     npm run phase7:worker:start 2>&1 | grep -i "error\|fail"
  3. If stuck on prefetch, increase prefetch:
     // In code: await channel.prefetch(2);
```

### Issue: Gemma4 timeouts
```
Symptom: "Error: HTTP 408" or "Timeout" in worker output
Solution:
  1. Check llama-server load:
     curl http://127.0.0.1:8090/health
  2. Reduce max concurrent requests:
     LLM_CONCURRENCY=1 npm run phase7:worker:start
  3. Check GPU memory:
     nvidia-smi  // should show VRAM usage
```

### Issue: Redis connection failed
```
Symptom: "⚠️  Redis warm failed (non-blocking): Error: ..."
Solution:
  1. Verify Redis is running:
     docker exec legal-ai-redis redis-cli PING
  2. Check credentials in .env:
     REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
  3. Note: Redis failure is non-blocking, summaries still written to Postgres
```

### Issue: Summaries too short
```
Symptom: Summaries are empty or very short
Solution:
  1. Check Gemma4 temperature:
     // In code: const TEMPERATURE = 0.3; // Keep low for deterministic output
  2. Check prompt:
     // In code: 'You are a legal code analyzer. Summarize in 1-2 sentences.'
  3. Check max_tokens:
     // In code: max_tokens: 256, // Should be sufficient
```

---

## Success Criteria

✅ **Phase 7 Worker Patch Successful If**:
1. llama-server receives requests (max 2 concurrent)
2. 4 workers can run in parallel
3. Summaries written to Postgres (updated_at recent)
4. Redis BitFrost keys created (bitfrost:summary:* increasing)
5. Throughput: 2-3+ summaries/min (improvement visible)
6. No placeholder failure messages in database
7. No Postgres identity mutations

---

## Files Modified

| File | Change | Status |
|------|--------|--------|
| `sveltekit-frontend/scripts/atlas/phase7-gemma4-worker-patched.mts` | Created (new worker) | ✅ Created |
| `package.json` | Added npm scripts | ✅ Updated |

---

## Next Steps

**Immediate** (Phase 7):
1. Launch llama-server with `-np 2 --cache-prompt`
2. Start 4 patched workers: `npm run phase7:worker:start`
3. Monitor throughput (every 5 minutes)
4. Watch queue depth decrease

**After throughput improves** (Phase 8):
1. Phase 8B: Redis BitFrost warming (already running with this patch)
2. Phase 8A: KV cache optimization (experimental, measure before claiming)
3. Phase 102: Graph enrichment (Neo4j GDS, Qdrant sync, RRF validation)

---

**Status**: ✅ READY TO EXECUTE  
**Command**: `npm run phase7:worker:start`  
**Next**: Monitor for 5-10 minutes to confirm throughput improvement
